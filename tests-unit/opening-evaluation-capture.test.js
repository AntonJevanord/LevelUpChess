'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeOpeningEvaluation, unavailableOpeningEvaluation, validateOpeningEvaluation } = require('../scripts/balance/opening-evaluation');
const { recoverHistory, runMatches } = require('../scripts/balance/run');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { UciEngine } = require('../scripts/balance/uci');
const baseFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const context = (changes = {}) => ({ fen: baseFen, openingPlies: 1, attempt: 1, color: 'b',
  engineSha256: 'a'.repeat(64), engineName: 'Test engine', strength: { skill: 20 }, limits: { nodes: 40000 }, ...changes });

test('first-search scores, mate distances and bounds are explicitly White POV without losing the score-line metadata', () => {
  const search = { info: { nodes: 40000 }, scoreInfo: { score: { type: 'cp', value: 45, bound: 'lowerbound' }, depth: 12,
    nodes: 38000, time: 20, pv: ['e7e5', 'g1f3'], raw: 'info depth 12 score cp 45 lowerbound nodes 38000 pv e7e5 g1f3' } };
  const value = makeOpeningEvaluation(context(), search);
  assert.equal(value.available, true); assert.equal(value.perspective, 'white');
  assert.deepEqual(value.score, { type: 'cp', value: -45, bound: 'upperbound' });
  assert.deepEqual(value.limits, { nodes: 40000 }); assert.equal(value.info.nodes, 38000);
  assert.equal(value.info.depth, 12); assert.equal(value.info.score, undefined);
  assert.deepEqual(makeOpeningEvaluation(context(), { info: { score: { type: 'mate', value: -3 } } }).score, { type: 'mate', value: 3 });
  assert.deepEqual(makeOpeningEvaluation(context({ color: 'w', fen: baseFen.replace(' b ', ' w ') }), { info: { score: { type: 'cp', value: 7 } } }).score, { type: 'cp', value: 7 });
});

test('no search, no reported score and malformed optional score data remain distinct unavailable diagnostics', () => {
  const missing = unavailableOpeningEvaluation(context(), 'no-post-opening-search');
  assert.equal(missing.capturedOnAttempt, null); assert.equal(missing.available, false);
  const noScore = makeOpeningEvaluation(context(), { info: { nodes: 40000 } });
  assert.equal(noScore.reason, 'engine-reported-no-score'); assert.equal(noScore.capturedOnAttempt, 1);
  for (const score of [{ type: 'cp', value: Infinity }, { type: 'cp', value: 0.1 }, { type: 'win', value: 1 }, { type: 'mate', value: 2, bound: 'maybe' }]) {
    const value = makeOpeningEvaluation(context(), { info: { score } });
    assert.equal(value.available, false); assert.equal(value.reason, 'invalid-engine-score'); assert.equal(value.score, undefined);
  }
});

test('retained values preserve their capture attempt and reject changed position, search or engine context', () => {
  const value = makeOpeningEvaluation(context(), { info: { score: { type: 'cp', value: 20 }, depth: 4 } });
  const retained = validateOpeningEvaluation(value, context({ attempt: 2 }));
  assert.deepEqual(retained, value); assert.notEqual(retained, value); assert.equal(retained.capturedOnAttempt, 1);
  for (const changes of [{ fen: baseFen.replace('4P3', '8') }, { openingPlies: 2 }, { color: 'w' },
    { strength: { skill: 5 } }, { limits: { movetimeMs: 20 } }, { engineSha256: 'b'.repeat(64) }]) {
    assert.throws(() => validateOpeningEvaluation(value, context(changes)), /Saved opening evaluation/);
  }
  const malformed = structuredClone(value); malformed.info.nodes = -1;
  assert.throws(() => validateOpeningEvaluation(malformed, context()), /score nodes/);
  const future = structuredClone(value); future.capturedOnAttempt = 4;
  assert.throws(() => validateOpeningEvaluation(future, context({ attempt: 3 })), /capture attempt/);
});

test('recovery keeps a durable first evaluation and rejects competing values in one attempt', () => {
  const value = makeOpeningEvaluation(context(), { info: { score: { type: 'cp', value: 20 } } });
  const journal = { id: 'a', attempt: 1, startFen: 'start', status: 'error', moves: ['e2e4'], openingEvaluation: value };
  const checkpoint = { id: 'a', attempt: 1, startFen: 'start', moves: ['e2e4', 'e7e5'] };
  assert.deepEqual(recoverHistory({ id: 'a' }, 'start', checkpoint, [journal]).openingEvaluation, value);
  const conflicting = structuredClone(checkpoint); conflicting.openingEvaluation = structuredClone(value); conflicting.openingEvaluation.score.value++;
  assert.throws(() => recoverHistory({ id: 'a' }, 'start', conflicting, [journal]), /conflicting opening evaluations/);
});

const native = process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
function temporary(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-opening-eval-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; }
function config(maxPlies) { return normalizeConfig({ schemaVersion: 1, name: 'Opening diagnostic workflow fixture', engine: { nodes: 256, maxPlies },
  openings: [{ id: 'one-ply', moves: ['e2e4'] }], comparisons: [{ id: 'control', armyA: {}, armyB: {} }] }); }
const records = directory => fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

test('real runner captures the post-prefix position once without adding searches or per-ply checkpoints', { skip: !fs.existsSync(native), timeout: 30000 }, async t => {
  const directory = temporary(t), input = config(2), original = UciEngine.prototype.search;
  let searches = 0;
  t.mock.method(UciEngine.prototype, 'search', async function (options) { searches++; return original.call(this, options); });
  await runMatches({ config: input, schedule: makeSchedule(input), outDir: directory, enginePath: native });
  const journal = records(directory);
  assert.equal(searches, 2, 'one actual game move in each of two color-swapped games');
  assert.equal(journal.length, 2);
  for (const game of journal) {
    assert.equal(game.playedPlies, 1); assert.equal(game.status, 'truncated');
    const value = game.openingEvaluation;
    assert.equal(value.available, true); assert.equal(value.color, 'b'); assert.equal(value.openingPlies, 1);
    assert.equal(value.capturedOnAttempt, 1); assert.equal(value.perspective, 'white');
    assert.equal(value.fen.split(' ')[1], 'b'); assert.equal(value.fen.split(' ')[0], baseFen.split(' ')[0]);
    assert.deepEqual(value.limits, { nodes: 256 }); assert.equal(value.info.nodes > 0, true);
    assert.equal(value.engineSha256, JSON.parse(fs.readFileSync(path.join(directory, 'run.json'))).engineSha256);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'checkpoint.json'))).current, null);
});

test('clean cancellation and resume preserve the original opening score instead of substituting a later ply', { skip: !fs.existsSync(native), timeout: 30000 }, async t => {
  const directory = temporary(t), input = config(4), schedule = makeSchedule(input), controller = new AbortController();
  const first = await runMatches({ config: input, schedule, outDir: directory, enginePath: native, signal: controller.signal,
    onProgress(message) { if (message.startsWith('Game ') && message.includes('ply 2,')) controller.abort(); } });
  assert.equal(first.stopped, true);
  const before = records(directory)[0];
  assert.equal(before.status, 'aborted'); assert.equal(before.openingEvaluation.available, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'checkpoint.json'))).current.openingEvaluation, before.openingEvaluation);
  await runMatches({ config: input, schedule, outDir: directory, enginePath: native, resume: true });
  const resumed = records(directory).find(row => row.id === before.id && row.status === 'truncated');
  assert.ok(resumed); assert.equal(resumed.attempt, 2);
  assert.deepEqual(resumed.openingEvaluation, before.openingEvaluation);
  assert.equal(resumed.openingEvaluation.capturedOnAttempt, 1);
});

test('a resumed historical history without a score stays unavailable and adds no backfill search', { skip: !fs.existsSync(native), timeout: 30000 }, async t => {
  const directory = temporary(t), input = config(4), schedule = makeSchedule(input), controller = new AbortController();
  const original = UciEngine.prototype.search; let searches = 0;
  t.mock.method(UciEngine.prototype, 'search', async function (options) { searches++; return original.call(this, options); });
  await runMatches({ config: input, schedule, outDir: directory, enginePath: native, signal: controller.signal,
    onProgress(message) { if (message.startsWith('Game ') && message.includes('ply 2,')) controller.abort(); } });
  const first = records(directory)[0], current = JSON.parse(fs.readFileSync(path.join(directory, 'checkpoint.json')));
  delete first.openingEvaluation; delete current.current.openingEvaluation;
  fs.writeFileSync(path.join(directory, 'games.jsonl'), JSON.stringify(first) + '\n');
  fs.writeFileSync(path.join(directory, 'checkpoint.json'), JSON.stringify(current));
  await runMatches({ config: input, schedule, outDir: directory, enginePath: native, resume: true });
  const resumed = records(directory).find(row => row.id === first.id && row.status === 'truncated');
  assert.equal(searches, 6, 'only the six game moves were searched');
  assert.equal(resumed.openingEvaluation.available, false);
  assert.equal(resumed.openingEvaluation.reason, 'missing-resumed-opening-evaluation');
  assert.equal(resumed.openingEvaluation.capturedOnAttempt, null);
});

test('a legal first move without score information does not borrow a later move evaluation', { skip: !fs.existsSync(native), timeout: 30000 }, async t => {
  const directory = temporary(t), input = config(4), original = UciEngine.prototype.search;
  t.mock.method(UciEngine.prototype, 'search', async function (options) {
    const value = await original.call(this, options);
    return options.moves.length === 1 ? { ...value, info: null, scoreInfo: null } : value;
  });
  await runMatches({ config: input, schedule: makeSchedule(input), outDir: directory, enginePath: native });
  for (const row of records(directory)) {
    assert.equal(row.playedPlies, 3);
    assert.ok(row.lastInfo.w?.score || row.lastInfo.b?.score);
    assert.equal(row.openingEvaluation.available, false);
    assert.equal(row.openingEvaluation.reason, 'engine-reported-no-score');
    assert.equal(row.openingEvaluation.capturedOnAttempt, 1);
  }
});
