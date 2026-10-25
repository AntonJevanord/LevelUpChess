'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getCampaign } = require('../scripts/balance/material-plan');
const { makeCollectionReport } = require('../scripts/balance/material-collection-report');
const { makeStudyReport, writeStudyReport, markdown } = require('../scripts/balance/material-study-report');

const profile = getCampaign().profile;
const placement = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const BONUS = 'bonus:queen.purple@1';

function fixture() {
  const schedule = [];
  for (let index = 0; index < 384; index++) for (const kind of ['ordinary', 'amazon-w', 'amazon-b']) {
    const ordinary = kind === 'ordinary', aColor = kind === 'amazon-b' ? 'b' : 'w';
    const board = ordinary ? placement : aColor === 'w' ? placement.replace('Q', 'U') : placement.replace('q', 'u');
    schedule.push({ id: `${index}-${kind}`, unitId: `${index}-${ordinary ? 'ordinary' : 'amazon'}`,
      kind: ordinary ? 'ordinary' : 'amazon', aColor, openingId: `book-${index}`, comparisonId: ordinary ? 'ordinary' : 'amazon',
      startFen: `${board} w KQkq - 0 ${index + 1}`, openingMoves: [], testIndex: index });
  }
  const statesFor = game => Array.from({ length: 29 }, (_, ply) => {
    let board = game.startFen.split(' ')[0];
    if (game.kind === 'ordinary' && ply >= 10) board = game.testIndex % 2 ? board.replace('R', '1') : board.replace('r', '1');
    return `${board} ${ply % 2 ? 'b' : 'w'} KQkq - ${ply} ${game.testIndex + 1 + Math.floor(ply / 2)}`;
  });
  const settings = { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400, skill: 20, seed: 42, totalGames: 1152 };
  const records = schedule.map(game => ({ ...game, schemaVersion: 1, pairId: game.unitId, attempt: 1, status: 'completed',
    result: '1/2-1/2', reason: 'threefold-repetition', finalFen: statesFor(game).at(-1),
    moves: Array.from({ length: 28 }, (_, index) => `m${index}`), sans: Array.from({ length: 28 }, (_, index) => `S${index}`),
    totalPlies: 28, playedPlies: 28, openingPlies: 0, profileHash: profile.hash, registryHash: profile.registryHash,
    registryReference: 'collection.json#plan.registry', variant: profile.variant, royalMode: 'king', evaluationCaveat: null,
    engine: { nodes: settings.nodes, threads: 1, hashMb: 32, maxPlies: 400 }, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  const byStart = new Map(schedule.map(game => [game.startFen, game]));
  const rulesFactory = async () => ({ createBoard(start) {
    const states = statesFor(byStart.get(start)); let ply = 0;
    return { fen: () => states[ply], outcome: () => ply === 28 ? { result: '1/2-1/2', reason: 'threefold-repetition' } : null,
      san(move) { assert.equal(move, `m${ply}`); return `S${ply}`; }, push(move) { if (move !== `m${ply}`) return false; ply++; return true; }, dispose() {} };
  } });
  const calls = [];
  const analyze = (data, options) => {
    calls.push({ data, options }); options.onProgress?.({ phase: 'validation', completed: 1, total: 5 });
    const rook = data.featureNames.length === 6 ? 3 : 4;
    const values = { pawn: 1, knight: 3.1, bishop: 3.2, rook, queen: options.anchors ? 9 : 8, tempo: 0.1, [BONUS]: 2.5 };
    return { method: {}, validation: { metrics: { brier: 0.1 }, baselineMetrics: { brier: 0.2 } },
      bootstrap: { ratioIntervals: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { lower: value - 0.2, upper: value + 0.2 }])) },
      normalized: { available: true, reason: null, reasons: [], values }, warnings: [], rank: { rank: 6, columns: 6 }, fit: { converged: true } };
  };
  const manifest = { schemaVersion: 1, format: 'levelup-material-collection', runId: 'study-fixture', jobs: 4,
    plan: { settings, profile, registry: profile.registry, schedule,
      protocol: { id: 'material-collection-v16-confirmation-001', sampling: { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 } },
      study: { checkpoints: [384, 768, 1152], jobs: 4, analysis: { anchors: { pawn: 1, queen: 9 }, ridge: 0.001, bootstrap: 200, validationFolds: 5 } } } };
  return { manifest, records, rulesFactory, analyze, calls };
}

function directory(t, data, count = 384) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-study-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'collection.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify(data.manifest));
  fs.writeFileSync(path.join(root, 'games.jsonl'), data.records.slice(0, count).map(record => JSON.stringify(record)).join('\n') + '\n');
  return root;
}

test('collection extraction can skip fitting while preserving validated samples and coverage', async () => {
  const data = fixture();
  const result = await makeCollectionReport(data.manifest, data.records.slice(0, 3), { rulesFactory: data.rulesFactory, analyze: false });
  assert.deepEqual(result.report.analysis, {});
  assert.equal(result.report.coverage.completedRecords, 3);
  assert.equal(result.samples.length, 9);
  assert.ok(result.samples.every(sample => sample.y === 0.5));
});

test('study uses anchored primary fits, five grouped folds, conditional tables and raw material support', async () => {
  const data = fixture(), messages = [];
  const result = await makeStudyReport(data.manifest, data.records.slice(0, 384), { checkpoint: 384, rulesFactory: data.rulesFactory, analyze: data.analyze, onProgress: value => messages.push(value) });
  assert.equal(data.calls.length, 4);
  assert.ok(data.calls.every(call => call.options.validationFolds === 5 && call.options.bootstrap === 200));
  assert.ok(data.calls.slice(0, 2).every(call => call.options.anchors.queen === 9));
  assert.ok(data.calls.slice(2).every(call => call.options.anchors === undefined));
  assert.equal(result.report.status, 'checkpoint-complete');
  assert.equal(result.report.coveredGames, 384);
  assert.equal(result.report.coverage.studyScheduledGames, 1152);
  assert.equal(result.report.estimates.combined.pawn.assumed, true);
  assert.equal(result.report.estimates.combined.queen.value, 9);
  assert.equal(result.report.estimates.combined.amazonTotal.value, 11.5);
  assert.deepEqual(result.report.estimates.combined.amazonTotal.interval, { lower: 11.3, upper: 11.7 });
  assert.equal(result.report.ordinaryCombinedRookGap, 1);
  assert.equal(result.report.materialSupport.ordinary.rook.games, 128);
  assert.equal(result.report.materialSupport.ordinary.rook.positiveGames, 64);
  assert.equal(result.report.materialSupport.ordinary.rook.negativeGames, 64);
  assert.equal(result.report.materialPriceTableSupported, false);
  const source = result.report.analysisIdentity.files.find(item => item.file === 'scripts/balance/material-study-report.js');
  const expected = createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../scripts/balance/material-study-report.js'), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  assert.equal(source.sha256, expected);
  assert.equal(result.report.analysisIdentity.files.length, 5);
  assert.ok(result.report.analysisIdentity.files.some(item => item.file === 'dist/balance-rules.cjs'));
  assert.match(result.report.analysisIdentity.normalization, /CRLF normalized to LF/);
  assert.ok(messages.some(value => /primary ordinary: validation 1\/5/.test(value)));
  assert.match(markdown(result.report), /9\.00 \(assumed\)/);
  assert.match(markdown(result.report), /fixed assumption/);
  assert.match(markdown(result.report), /not universal material confidence intervals/);
});

test('partial outcomes remain provisional and cannot become a completed checkpoint', async () => {
  const data = fixture();
  const result = await makeStudyReport(data.manifest, data.records.slice(0, 383), { rulesFactory: data.rulesFactory, analyze: data.analyze });
  assert.equal(result.report.status, 'provisional');
  assert.equal(result.report.coveredGames, 383);
  await assert.rejects(makeStudyReport(data.manifest, data.records.slice(0, 383), { checkpoint: 384, rulesFactory: data.rulesFactory, analyze: data.analyze }), /before every scheduled prefix game/);
  await assert.rejects(makeStudyReport(data.manifest, data.records, { checkpoint: 500, rulesFactory: data.rulesFactory, analyze: data.analyze }), /declared/);
  await assert.rejects(makeStudyReport(data.manifest, data.records, { checkpoint: 384, bootstrap: 0, rulesFactory: data.rulesFactory, analyze: data.analyze }), /declared bootstrap/);
  await assert.rejects(makeStudyReport(data.manifest, [...data.records, { id: 'foreign' }], { rulesFactory: data.rulesFactory, analyze: data.analyze }), /Foreign/);
});

test('unsupported estimates stay unavailable while pawn and queen retain explicit assumption labels', async () => {
  const data = fixture();
  const unavailable = (input, options) => {
    const result = data.analyze(input, options);
    result.normalized.available = false; result.normalized.values = null; result.normalized.reason = 'not-enough-data';
    return result;
  };
  const result = await makeStudyReport(data.manifest, [], { rulesFactory: data.rulesFactory, analyze: unavailable });
  assert.equal(result.report.currentEstimate.rook.value, null);
  assert.equal(result.report.currentEstimate.rook.interval, null);
  assert.equal(result.report.currentEstimate.amazonTotal.value, null);
  assert.equal(result.report.currentEstimate.queen.value, 9);
  assert.equal(result.report.currentEstimate.queen.assumed, true);
  assert.equal(result.report.ordinaryCombinedRookGap, null);
});

test('checkpoint snapshots are immutable, ignore later-stage journal records and leave raw evidence untouched', async t => {
  const data = fixture(), root = directory(t, data);
  const options = { checkpoint: 384, rulesFactory: data.rulesFactory, analyze: data.analyze };
  const first = await writeStudyReport(root, options);
  const file = path.join(first.checkpointDirectory, 'material-study-report.json'), frozen = fs.readFileSync(file);
  assert.equal(first.checkpointFile, file);
  assert.deepEqual(first.report.checkpointHistory.map(item => item.checkpoint), [384]);
  assert.equal(first.report.checkpointHistory[0].analysisSourceSha256, JSON.parse(frozen).analysisIdentity.sha256);
  assert.equal(JSON.parse(frozen).checkpointHistory, undefined, 'immutable snapshot does not depend on sibling checkpoint files');
  const raw = fs.readFileSync(path.join(root, 'games.jsonl'));
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), raw);
  fs.appendFileSync(path.join(root, 'games.jsonl'), data.records.slice(384, 387).map(record => JSON.stringify(record)).join('\n') + '\n');
  const after = fs.readFileSync(path.join(root, 'games.jsonl'));
  await writeStudyReport(root, options);
  assert.deepEqual(fs.readFileSync(file), frozen);
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), after);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  fs.appendFileSync(path.join(root, 'games.jsonl'), data.records.slice(387, 768).map(record => JSON.stringify(record)).join('\n') + '\n');
  const second = await writeStudyReport(root, { ...options, checkpoint: 768 });
  assert.deepEqual(second.report.checkpointHistory.map(item => item.checkpoint), [384, 768]);
  assert.match(fs.readFileSync(second.files.markdown, 'utf8'), /Frozen checkpoint/);
  assert.deepEqual(fs.readFileSync(file), frozen);
  const full = fs.readFileSync(path.join(root, 'games.jsonl'));
  fs.writeFileSync(file, 'altered');
  await assert.rejects(writeStudyReport(root, options), /Frozen checkpoint artifact differs/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'altered');
  assert.deepEqual(fs.readFileSync(path.join(root, 'games.jsonl')), full);
});

test('truncated prefix games are unscored but finalized, and torn future tails do not change a snapshot', async t => {
  const data = fixture(); data.records[0].status = 'truncated'; data.records[0].result = '*'; data.records[0].reason = 'max-plies';
  const root = directory(t, data), options = { checkpoint: 384, rulesFactory: data.rulesFactory, analyze: data.analyze };
  const first = await writeStudyReport(root, options);
  assert.equal(first.report.coverage.statusCounts.truncated, 1);
  assert.equal(first.report.coverage.completedRecords, 383);
  assert.equal(first.report.coveredGames, 384);
  const frozen = fs.readFileSync(path.join(first.checkpointDirectory, 'material-study-report.json'));
  fs.appendFileSync(path.join(root, 'games.jsonl'), '{"future');
  await writeStudyReport(root, options);
  assert.deepEqual(fs.readFileSync(path.join(first.checkpointDirectory, 'material-study-report.json')), frozen);
});

test('earlier aborted attempts remain visible after the same game completes', async () => {
  const data = fixture(), completed = data.records[0]; completed.attempt = 2;
  const aborted = { ...completed, attempt: 1, status: 'aborted', result: '*', reason: 'cancelled',
    moves: completed.moves.slice(0, 4), sans: completed.sans.slice(0, 4), totalPlies: 4, playedPlies: 4,
    finalFen: `${completed.startFen.split(' ')[0]} w KQkq - 4 3` };
  const result = await makeStudyReport(data.manifest, [aborted, ...data.records.slice(0, 384)],
    { checkpoint: 384, rulesFactory: data.rulesFactory, analyze: data.analyze });
  assert.equal(result.report.coverage.statusCounts.aborted, 0);
  assert.equal(result.report.coverage.attemptStatusCounts.aborted, 1);
  assert.equal(result.report.coverage.journalAttempts, 385);
  assert.equal(result.report.coverage.completedRecords, 384);
  assert.match(markdown(result.report), /1 aborted records, including earlier unfinished attempts/);
});

test('report locking excludes concurrent writers and releases after replay failure', async t => {
  const data = fixture(), root = directory(t, data), options = { rulesFactory: data.rulesFactory, analyze: data.analyze };
  let unblock; const blocked = new Promise(resolve => { unblock = resolve; });
  const first = writeStudyReport(root, { ...options, rulesFactory: async () => { await blocked; throw new Error('fixture replay failure'); } });
  await assert.rejects(writeStudyReport(root, options), /Another material report writer/);
  unblock(); await assert.rejects(first, /fixture replay failure/);
  assert.equal(fs.existsSync(path.join(root, 'report.lock')), false);
  const result = await writeStudyReport(root, options);
  assert.equal(result.report.coveredGames, 384);
});
