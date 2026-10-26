#!/usr/bin/env node
'use strict';

// Read-only journal analysis. No native searches, new games or collector edits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { getRevisionProtocol, createRevisionPlan } = require(path.join(ROOT, 'scripts/balance/revision-plan'));
const { latestRecords: parentLatest } = require(path.join(ROOT, 'scripts/balance/reference-dataset'));
const { latestRecords: extensionLatest } = require(path.join(ROOT, 'scripts/balance/revision-dataset'));
const { pieceMap } = require(path.join(ROOT, 'src/profile-fen'));
const { createMatchRules } = require(path.join(ROOT, 'dist/balance-rules.cjs'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const score = record => record.result === '1/2-1/2' ? 0.5
  : Number((record.result === '1-0') === (record.aColor === 'w'));

function readJournal(file) {
  const bytes = fs.readFileSync(file), text = bytes.toString('utf8');
  assert.ok(text.endsWith('\n'), 'Audit inputs must contain a complete newline-terminated journal.');
  const records = text.trim().split('\n').filter(Boolean).map(JSON.parse);
  return { bytes, records, identity: { file: path.basename(file), bytes: bytes.length, sha256: sha(bytes),
    attempts: records.length, uniqueGameIds: new Set(records.map(record => record.id)).size,
    statuses: Object.fromEntries(['completed', 'truncated', 'aborted', 'error'].map(status => [status, records.filter(record => record.status === status).length])) } };
}

function trackedBoard(fen, rookLetter, amazonLetter, opponentRole = 'original-amazon') {
  const board = new Map();
  let rooks = 0, amazons = 0;
  for (const [square, piece] of pieceMap(fen)) {
    const role = piece === rookLetter ? 'upgraded-rook' : piece === amazonLetter ? opponentRole : null;
    if (role === 'upgraded-rook') rooks++;
    if (role === opponentRole) amazons++;
    board.set(square, { id: `${piece}@${square}`, piece, role });
  }
  assert.equal(rooks, 1, 'Exactly one original upgraded rook is required.');
  assert.equal(amazons, 1, 'Exactly one original opponent queen is required.');
  return board;
}

// Roles follow tokens, so castling and ordinary queen promotions cannot create
// or move a falsely identified Amazon. The starting turn may be Black.
function applyTracked(board, move, turn) {
  const from = move.slice(0, 2), to = move.slice(2, 4), mover = board.get(from);
  assert.ok(mover, `No tracked mover for ${move}.`);
  assert.equal(mover.piece === mover.piece.toUpperCase() ? 'w' : 'b', turn);
  let captured = board.get(to) || null;
  if (mover.piece.toLowerCase() === 'p' && from[0] !== to[0] && !captured) {
    const square = to[0] + from[1];
    captured = board.get(square) || null;
    assert.equal(captured?.piece.toLowerCase(), 'p', `Invalid tracked en passant ${move}.`);
    board.delete(square);
  }
  board.delete(from); board.delete(to);
  if (move.length === 5) mover.piece = turn === 'w' ? move[4].toUpperCase() : move[4];
  board.set(to, mover);
  if (mover.piece.toLowerCase() === 'k' && from[0] === 'e' && ['c', 'g'].includes(to[0]) && from[1] === to[1]) {
    const rookFrom = (to[0] === 'c' ? 'a' : 'h') + from[1];
    const rookTo = (to[0] === 'c' ? 'd' : 'f') + from[1];
    const rook = board.get(rookFrom);
    assert.ok(rook, `Missing castling rook ${move}.`);
    board.delete(rookFrom); board.set(rookTo, rook);
  }
  return { mover, captured, from, to };
}

function trackerChecks() {
  let count = 0;
  for (const [fen, move, turn, expected] of [
    ['4k3/8/8/8/8/8/8/O3K2R w KQ - 0 1', 'e1c1', 'w', 'd1'],
    ['4k3/8/8/8/8/8/8/R3K2O w KQ - 0 1', 'e1g1', 'w', 'f1'],
    ['o3k2r/8/8/8/8/8/8/4K3 b kq - 0 1', 'e8c8', 'b', 'd8'],
    ['r3k2o/8/8/8/8/8/8/4K3 b kq - 0 1', 'e8g8', 'b', 'f8'],
  ]) {
    const board = new Map([...pieceMap(fen)].map(([square, piece]) => [square, { id: `${piece}@${square}`, piece, role: piece.toLowerCase() === 'o' ? 'upgraded-rook' : null }]));
    applyTracked(board, move, turn); assert.equal(board.get(expected).role, 'upgraded-rook'); count++;
  }
  const board = trackedBoard('3u3k/P7/8/8/8/8/8/O6K w - - 0 1', 'O', 'u');
  applyTracked(board, 'a7a8q', 'w');
  assert.equal(board.get('a8').piece, 'Q'); assert.equal(board.get('a8').role, null);
  assert.equal(board.get('d8').role, 'original-amazon'); count++;
  return count;
}

async function replay(record, profile, rules, source) {
  const rookColor = record.whiteDesign?.startsWith('rook.') ? 'w' : 'b';
  const rookId = rookColor === 'w' ? record.whiteDesign : record.blackDesign;
  const letter = id => profile.registry.allocations.find(entry => entry.id === id).letter;
  const rookLetter = rookColor === 'w' ? letter(rookId).toUpperCase() : letter(rookId);
  const opponent = record.kind === 'head' ? 'amazon' : 'ordinary';
  const opponentRole = opponent === 'amazon' ? 'original-amazon' : 'original-ordinary-queen';
  const opponentLetter = opponent === 'amazon' ? letter('queen.purple@1') : 'q';
  const amazonLetter = rookColor === 'w' ? opponentLetter : opponentLetter.toUpperCase();
  const tracked = trackedBoard(record.startFen, rookLetter, amazonLetter, opponentRole), board = rules.createBoard(record.startFen);
  const events = []; let amazonLossPly = null, rookLossPly = null;
  try {
    for (let index = 0; index < record.moves.length; index++) {
      const move = record.moves[index], ply = index + 1, before = board.fen(), turn = board.turn();
      assert.equal(board.outcome(), null, `Continuation after terminal position: ${record.id}/${ply}.`);
      assert.equal(board.san(move), record.sans[index], `SAN mismatch: ${record.id}/${ply}.`);
      const action = applyTracked(tracked, move, turn);
      if (action.captured?.role === opponentRole) amazonLossPly = ply;
      if (action.captured?.role === 'upgraded-rook') rookLossPly = ply;
      if (action.mover.role === opponentRole && action.captured?.role === 'upgraded-rook'
        || action.mover.role === 'upgraded-rook' && action.captured?.role === opponentRole) {
        events.push({ type: action.mover.role === opponentRole ? 'opponent-queen-captures-upgraded-rook' : 'upgraded-rook-captures-opponent-queen',
          ply, move, san: record.sans[index], fenBefore: before, pieceCountBefore: pieceMap(before).size,
          followedBy: record.moves[index + 1] || null, followedBySan: record.sans[index + 1] || null });
      }
      assert.equal(board.push(move), true, `Illegal recorded move: ${record.id}/${ply}.`);
      assert.deepEqual([...tracked].map(([square, token]) => [square, token.piece]).sort(), [...pieceMap(board.fen())].sort(), `Identity tracker/FEN mismatch: ${record.id}/${ply}.`);
      if (ply % 64 === 0) await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(board.fen(), record.finalFen, `Final FEN mismatch: ${record.id}.`);
    assert.deepEqual(board.outcome(), { result: record.result, reason: record.reason }, `Outcome mismatch: ${record.id}.`);
  } finally { board.dispose(); }
  for (const event of events) {
    if (event.type === 'opponent-queen-captures-upgraded-rook') {
      event.opponentQueenCapturedPly = amazonLossPly;
      event.opponentQueenRecapturedImmediately = amazonLossPly === event.ply + 1;
      event.opponentQueenSurvivesToEnd = amazonLossPly === null;
    }
  }
  return { gameId: record.id, openingId: record.openingId, pairId: record.pairId, source, rookId, rookColor, opponent,
    result: record.result, reason: record.reason, rookScore: score(record), plies: record.moves.length,
    upgradedRookCapturedPly: rookLossPly, originalOpponentQueenCapturedPly: amazonLossPly, events };
}

function paired(rows) {
  const units = new Map();
  for (const row of rows) { const pair = units.get(row.pairId) || []; pair.push(row); units.set(row.pairId, pair); }
  return [...units.values()].filter(pair => pair.length === 2 && new Set(pair.map(game => game.rookColor)).size === 2).flat();
}
function tally(rows) {
  const wins = rows.filter(game => game.rookScore === 1).length, draws = rows.filter(game => game.rookScore === 0.5).length;
  return { games: rows.length, wins, draws, losses: rows.length - wins - draws,
    rookScore: rows.length ? (wins + draws / 2) / rows.length : null };
}
function summarize(rows) {
  const games = paired(rows), captures = games.filter(game => game.events.some(event => event.type === 'opponent-queen-captures-upgraded-rook'));
  const immediate = captures.filter(game => game.events.some(event => event.opponentQueenRecapturedImmediately));
  const later = captures.filter(game => game.events.some(event => event.type === 'opponent-queen-captures-upgraded-rook' && !event.opponentQueenRecapturedImmediately && !event.opponentQueenSurvivesToEnd));
  const rookTakes = games.filter(game => game.events.some(event => event.type === 'upgraded-rook-captures-opponent-queen'));
  return { ...tally(games), completePairs: games.length / 2, completedGamesOutsidePairs: rows.length - games.length,
    opponentQueenCapturesUpgradedRook: captures.length, opponentQueenCapturesRookThenImmediatelyRecaptured: immediate.length,
    opponentQueenCapturesRookThenLaterCaptured: later.length, opponentQueenSurvivesItsRookCapture: captures.length - immediate.length - later.length,
    upgradedRookCapturesOpponentQueen: rookTakes.length, originalOpponentQueenCapturedAnyWay: games.filter(game => game.originalOpponentQueenCapturedPly !== null).length,
    immediateRecaptureGameOutcomesFromRookSide: tally(immediate), rookTakesOpponentQueenGameOutcomes: tally(rookTakes),
    gamesWithoutImmediateQueenForRookExchange: tally(games.filter(game => !immediate.includes(game))),
    exchangeEventReferences: games.flatMap(game => game.events.map(event => `${game.gameId}:${event.ply}`)) };
}

async function audit(parentFile, extensionFile, { onProgress = () => {} } = {}) {
  const selfChecks = trackerChecks(), library = getRevisionProtocol();
  const parent = readJournal(parentFile), extension = readJournal(extensionFile);
  assert.equal(parent.identity.sha256, library.parent.journalSha256, 'The uploaded parent must match the frozen source.');
  const plan = await createRevisionPlan(), oldPlan = library.parentManifest.plan;
  const latest = { parent: parentLatest(oldPlan, parent.records), extension: extensionLatest(plan, extension.records) };
  for (const game of plan.schedule.slice(0, 2304)) assert.ok(['completed', 'truncated'].includes(latest.extension.get(game.id)?.status), `Checkpoint game is unfinished: ${game.id}.`);
  const rules = { parent: await createMatchRules({ profile: oldPlan.profile }), extension: await createMatchRules({ profile: plan.profile }) };
  const results = []; let replayedPlies = 0;
  for (const [source, records] of Object.entries(latest)) for (const record of records.values()) {
    if (record.status !== 'completed' || !record.designA?.startsWith('rook.')
      || !(record.kind === 'head' && record.designB === 'queen.purple@1' || record.kind === 'single' && record.designB === null)) continue;
    const result = await replay(record, source === 'parent' ? oldPlan.profile : plan.profile, rules[source], source);
    results.push(result); replayedPlies += result.plies;
    if (results.length % 64 === 0) onProgress(`Legally replayed ${results.length} relevant games / ${replayedPlies} plies.`);
  }
  const openingSets = Object.fromEntries([32, 64].map(count => [count, new Set(plan.openings.slice(0, count).map(opening => opening.id))]));
  const ids = ['rook.purple@2', 'rook.purple@6', 'rook.purple@7', 'rook.purple@8'];
  const cohorts = Object.fromEntries(ids.map(id => [id, Object.fromEntries(['amazon', 'ordinary'].map(opponent => [opponent, {
    first32: summarize(results.filter(game => game.rookId === id && game.opponent === opponent && openingSets[32].has(game.openingId))),
    checkpoint2304Same64: summarize(results.filter(game => game.rookId === id && game.opponent === opponent && openingSets[64].has(game.openingId))),
    allUploaded: summarize(results.filter(game => game.rookId === id && game.opponent === opponent)),
  }]))]));
  const ordinarySingles = Object.fromEntries(library.roster.map(entry => {
    const source = entry.role === 'historical' || entry.role === 'reference' ? 'parent' : 'extension';
    const rows = [...latest[source].values()].filter(record => record.kind === 'single' && record.designA === entry.id
      && record.status === 'completed' && openingSets[64].has(record.openingId));
    const { rookScore, ...counts } = tally(rows.map(record => ({ rookScore: score(record) })));
    return [entry.id, { label: entry.label, source, ...counts, purchaseScore: rookScore }];
  }));
  for (const [id, expected] of [['rook.purple@6', [76, 11, 41]], ['rook.purple@7', [86, 13, 29]], ['rook.purple@8', [86, 15, 27]]]) {
    const row = cohorts[id].amazon.checkpoint2304Same64;
    assert.deepEqual([row.wins, row.draws, row.losses], expected, `Pasted checkpoint W/D/L differs: ${id}.`);
  }
  for (const [id, expected] of [['rook.purple@2', [108, 8, 12]], ['rook.purple@6', [124, 3, 1]], ['rook.purple@7', [122, 2, 4]], ['rook.purple@8', [115, 6, 7]]]) {
    const row = cohorts[id].ordinary.checkpoint2304Same64;
    assert.deepEqual([row.wins, row.draws, row.losses], expected, `Matched ordinary-army counts differ: ${id}.`);
  }
  const sourceFiles = ['scripts/balance/revision-plan.js', 'scripts/balance/design-profile.js', 'scripts/balance/design-registry.js', 'src/design-catalog.js', 'scripts/balance/reference-dataset.js',
    'scripts/balance/revision-dataset.js', 'src/profile-fen.js', 'dist/balance-rules.cjs'];
  return { schemaVersion: 1, id: 'reference-revisions-checkpoint-2304-exchanges', date: '2026-10-26',
    interpretation: 'Recorded capture patterns and eventual results; these do not establish whether an exchange was forced, mistaken, caused by valuation, or decisive.',
    inputs: { parent: parent.identity, extension: extension.identity },
    identity: { expectedParentProfileHash: oldPlan.profile.hash, expectedExtensionProfileHash: plan.profile.hash,
      expectedParentRegistryHash: oldPlan.registry.hash, expectedExtensionRegistryHash: plan.registry.hash,
      extensionManifestSupplied: false, executionIdentityIndependentlyVerified: false,
      annotationCheck: 'All journal annotations match the declared schedules, compiled profiles and search settings; the parent bytes equal the archived source. Missing extension process manifests cannot be reconstructed as execution evidence.' },
    validation: { trackerChecks: selfChecks, relevantGamesLegallyReplayed: results.length, relevantPliesLegallyReplayed: replayedPlies,
      originalPieceTracking: 'Tracks original subject tokens through both-color castling, captures and promotions; uses the actual side to move, including Black-to-move starts.',
      everyTrackedBoardMatchedReplay: true, everyRelevantSANFinalFenAndOutcomeMatched: true, checkpointWdlMatchesPastedTables: true,
      newGamesPlayed: 0, nativeSearches: 0 },
    sourceIdentity: { normalization: 'UTF-8 LF for source text',
      helperSha256: sha(fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n')),
      files: sourceFiles.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) })) },
    checkpoint: { newScheduledGames: 2304, openingIds: [...openingSets[64]],
      interpretation: 'The uploaded extension contains later games too. Checkpoint2304Same64 includes only the first 64 declared openings; allUploaded is separate and may contain partial pairs.' },
    ordinarySinglesMatched64: ordinarySingles, cohorts,
    events: results.flatMap(game => game.events.map(event => ({ gameId: game.gameId, openingId: game.openingId,
      rookId: game.rookId, rookColor: game.rookColor, opponent: game.opponent, source: game.source,
      result: game.result, rookScore: game.rookScore, ...event }))) };
}

async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index]; assert.ok(['--parent', '--games', '--out'].includes(key), `Unknown option: ${key}.`);
    assert.ok(!options[key], `Repeated option: ${key}.`);
    options[key] = args[++index]; assert.ok(options[key] && !options[key].startsWith('--'), `Missing value: ${key}.`);
  }
  assert.ok(options['--games'], 'Usage: node reference-revisions-checkpoint-2304-exchanges.cjs --games EXTENSION_JSONL [--parent PARENT_JSONL] [--out NEW_JSON]');
  const parent = options['--parent'] || path.join(ROOT, getRevisionProtocol().parent.journalFile);
  const report = await audit(parent, options['--games'], { onProgress: message => console.error(message) });
  if (options['--out']) fs.writeFileSync(path.resolve(options['--out']), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (options['--out']) console.log(`Saved exchange audit: ${path.resolve(options['--out'])}`);
  return report;
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { audit, trackedBoard, applyTracked, trackerChecks, summarize };
