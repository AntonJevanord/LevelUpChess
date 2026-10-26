'use strict';

// Offline replay of the uploaded original revision journal. The reconstructed
// canonical plan validates histories; it is not the missing original manifest.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { getRevisionProtocol, createRevisionPlan } = require('../../../scripts/balance/revision-plan');
const { recoverRevisionRecords } = require('../../../scripts/balance/reference-matrix');
const { createMatchRules } = require('../../../dist/balance-rules.cjs');
const DIRECTORY = __dirname;
const NAME = 'reference-revisions-retained-001.games.jsonl.gz';
const RAW_SHA256 = 'cef80f7193887ef699dbaae39ca98ec9980aa6b71c490498c0ddd1658acf59ab';
const GZIP_SHA256 = '1a83f79c4d86f3c81efb62c9cc92bd4762f1b47bd6f98c586408c9293c00b3cc';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(DIRECTORY, name));

function journal(bytes) {
  assert.equal(bytes.at(-1), 10, 'A complete journal must end with a newline.');
  return bytes.toString('utf8').trim().split('\n').map(JSON.parse);
}
function summarize(rows, library) {
  const byComparison = new Map();
  for (const row of rows) {
    let summary = byComparison.get(row.comparisonId);
    if (!summary) {
      summary = { comparisonId: row.comparisonId, designA: row.designA,
        designB: row.designB, kind: row.kind, games: 0, pairs: 0,
        wins: 0, draws: 0, losses: 0, score: null };
      byComparison.set(row.comparisonId, summary);
    }
    const whiteScore = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 }[row.result];
    const aScore = row.aColor === 'w' ? whiteScore : 1 - whiteScore;
    summary.games++;
    if (aScore === 1) summary.wins++; else if (aScore === 0) summary.losses++; else summary.draws++;
  }
  const report = read('reference-revisions-001.uploaded-report.md').toString('utf8');
  const summaries = [...byComparison.values()].sort((a, b) => a.comparisonId.localeCompare(b.comparisonId));
  for (const item of summaries) {
    assert.equal(item.games, 256); item.pairs = item.games / 2;
    item.score = (item.wins + item.draws / 2) / item.games;
    if (item.kind !== 'head') continue;
    const nameA = library.roster.find(entry => entry.id === item.designA).label;
    const nameB = library.roster.find(entry => entry.id === item.designB).label;
    const line = report.split(/\r?\n/).find(value => value.startsWith(`| ${nameA} / ${nameB} |`));
    assert.ok(line, `Missing archived reported matchup: ${item.comparisonId}.`);
    const cells = line.split('|').slice(1, -1).map(value => value.trim());
    assert.equal(Number(cells[1]), item.games);
    assert.deepEqual(cells[2].split('/').map(value => Number(value.trim())), [item.wins, item.draws, item.losses]);
    assert.equal((item.score * 100).toFixed(2) + '%', cells[3]);
  }
  return summaries;
}

async function main() {
  const compressed = read(NAME), bytes = zlib.gunzipSync(compressed);
  assert.equal(sha(compressed), GZIP_SHA256, 'Archived gzip bytes changed.');
  assert.equal(sha(bytes), RAW_SHA256, 'The compressed archive must preserve the uploaded journal bytes.');
  const records = journal(bytes), library = getRevisionProtocol();
  console.log('Verified journal bytes; reconstructing the frozen 4608-game schedule.');
  // Only skip the planner's redundant terminal-start pass. Every real starting
  // board is checked below before its complete recorded history is replayed.
  const plan = await createRevisionPlan({ rulesFactory: async () => ({
    createBoard: () => ({ outcome: () => null, dispose() {} }),
  }) });
  console.log('Frozen schedule reconstructed; replaying recorded histories.');
  assert.equal(records.length, 4608);
  assert.equal(new Set(records.map(row => row.id)).size, 4608);
  assert.equal(library.profile.hash, '08f66036deb767594385af3d5cfdb945d016465b46cbce88e1f0f4882f3c83eb');
  const schedule = new Map(plan.schedule.map(game => [game.id, game]));
  const pairs = new Map();
  const rules = await createMatchRules({ profile: library.profile });
  let plies = 0;
  const reasons = {};
  for (let index = 0; index < records.length; index++) {
    const row = records[index], game = schedule.get(row.id);
    assert.ok(game, `Unknown scheduled game ${row.id}.`);
    for (const field of ['id', 'unitId', 'pairId', 'kind', 'comparisonId', 'openingId', 'aColor', 'designA', 'designB', 'whiteDesign', 'blackDesign', 'startFen', 'openingMoves']) {
      assert.deepEqual(row[field], game[field], `Scheduled ${field} differs for ${row.id}.`);
    }
    assert.equal(row.schemaVersion, 1); assert.equal(row.attempt, 1);
    assert.equal(row.status, 'completed');
    assert.equal(row.profileHash, library.profile.hash);
    assert.equal(row.registryHash, library.registry.hash);
    assert.equal(row.variant, library.profile.variant);
    assert.equal(row.registryReference, 'collection.json#plan.registry');
    assert.equal(row.royalMode, 'king'); assert.equal(row.evaluationCaveat, null);
    assert.equal(row.evaluation, undefined);
    assert.deepEqual(row.engine, library.protocol.engine);
    assert.deepEqual(row.whiteStrength, library.protocol.strength);
    assert.deepEqual(row.blackStrength, library.protocol.strength);
    assert.equal(row.openingPlies, 0);
    assert.equal(row.moves.length, row.sans.length);
    assert.equal(row.moves.length, row.totalPlies);
    assert.equal(row.moves.length, row.playedPlies);
    assert.ok(row.moves.length <= library.protocol.engine.maxPlies);
    const board = rules.createBoard(row.startFen);
    try {
      assert.equal(board.outcome(), null, `Terminal starting position: ${row.id}.`);
      for (let ply = 0; ply < row.moves.length; ply++) {
        assert.equal(board.outcome(), null, `Move after terminal position: ${row.id}, ply ${ply + 1}.`);
        assert.equal(board.san(row.moves[ply]), row.sans[ply], `SAN mismatch: ${row.id}, ply ${ply + 1}.`);
        assert.equal(board.push(row.moves[ply]), true, `Illegal move: ${row.id}, ply ${ply + 1}.`);
      }
      assert.equal(board.fen(), row.finalFen, `Final FEN mismatch: ${row.id}.`);
      assert.deepEqual(board.outcome(), { result: row.result, reason: row.reason }, `Outcome mismatch: ${row.id}.`);
    } finally { board.dispose(); }
    plies += row.moves.length; reasons[row.reason] = (reasons[row.reason] || 0) + 1;
    const colors = pairs.get(row.pairId) || [];
    colors.push(row.aColor); pairs.set(row.pairId, colors);
    if ((index + 1) % 64 === 0) console.log(`Replayed ${index + 1}/4608 games, ${plies} legal plies; no searches.`);
  }
  assert.equal(plies, 499642); assert.equal(pairs.size, 2304);
  for (const [id, colors] of pairs) assert.deepEqual(colors.sort(), ['b', 'w'], `Incomplete color pair: ${id}.`);
  const oldBytes = read('short-side-revision-recovery-001.games.jsonl'), old = journal(oldBytes);
  const byId = new Map(records.map(row => [row.id, row]));
  assert.equal(old.length, 480);
  for (const row of old) assert.deepEqual(row, byId.get(row.id), `Recovered subset differs: ${row.id}.`);
  const recovered = recoverRevisionRecords([{ file: NAME, records }]);
  assert.equal(recovered.records.length, 512);
  const matchups = summarize(records, library);
  assert.equal(matchups.length, 18);
  const output = {
    schemaVersion: 1, format: 'levelup-retained-revision-journal-audit', recordedDate: '2026-10-26',
    input: { file: NAME, compressedBytes: compressed.length, compressedSha256: sha(compressed),
      decompressedBytes: bytes.length, decompressedSha256: sha(bytes), compressionPreservesOriginalBytes: true },
    canonicalProfile: { hash: library.profile.hash, registryHash: library.registry.hash, variant: library.profile.variant,
      declaration: 'experiments/balance/reference-revisions.json',
      declarationSha256: sha(fs.readFileSync(library.configFiles[0], 'utf8').replace(/\r\n/g, '\n')) },
    checks: { all4608GameIdentitiesAndStartingPositionsMatchCanonicalSchedule: true,
      allPlayingPolicyFieldsMatchCanonicalProtocol: true, allMovesSanFinalFenAndOutcomesReplay: true,
      all2304ColorPairsComplete: true, old480RecordSubsetMatchesExactly: true,
      all512ShortSideReferenceHistoriesRecovered: true, all12CandidateHeadToHeadCountsMatchArchivedFinalReport: true,
      originalCollectionManifestSupplied: false, historicalNativeInventoryVerified: false,
      materialFitOrBootstrapRecomputed: false, newDecisionComparisonHistoriesSupplied: false },
    games: records.length, completed: records.length, errors: 0, truncated: 0, aborted: 0,
    attempts: records.length, openingGroups: plan.openings.length, completePairs: pairs.size,
    legalPlies: plies, reasons, recoveredHistoricalBishopReferenceGames: recovered.records.length,
    newlyRecoveredHistoricalHeadGames: recovered.records.length - 320,
    matchups, engineSearches: 0, newMatchGames: 0,
    limitations: [
      'The canonical reconstructed schedule and profile validate saved identities, movement histories and outcomes. They are not the missing original collection manifest or an attestation of the historical native engine process.',
      'No new decision comparison games are present: the retained journal is the older ten-type revision study, not the later thirteen-type bishop decision.',
      'Material fits and conditional bootstrap intervals are unchanged and were not regenerated by this audit.'
    ]
  };
  const json = JSON.stringify(output, null, 2) + '\n';
  const file = path.join(DIRECTORY, 'reference-revisions-retained-001.audit.json');
  if (process.argv.includes('--write')) fs.writeFileSync(file, json);
  else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), json);
  console.log('Retained revision audit passed: 4608 games, 499642 legal plies, 512 historical bishop/reference games; no new matches or material fits.');
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
