'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCollection, checkCollection, validatePlan } = require('../scripts/balance/material-collection-run');

const STUDY_ID = 'material-collection-v16-confirmation-001';
const MOVES = ['a2a3', 'a7a6', 'a3a4'];
const ANALYSIS = { anchors: { pawn: 1, queen: 9 }, ridge: 0.001, bootstrap: 200, validationFolds: 5 };

function plan(positions = 3) {
  const registry = { hash: 'registry', allocations: [{ id: 'queen.purple@1', letter: 'u' }], definitions: [] };
  const openings = [], schedule = [], units = [];
  for (let index = 1; index <= positions; index++) {
    const openingId = `o${index}`, ordinaryUnit = `${openingId}-ordinary`, amazonUnit = `${openingId}-amazon`;
    openings.push({ id: openingId });
    const add = (suffix, kind, aColor, unitId) => {
      const id = `${openingId}-${suffix}`;
      schedule.push({ id, unitId, kind, aColor, openingId, startFen: id, comparisonId: kind, openingMoves: [] });
      return id;
    };
    units.push({ id: ordinaryUnit, kind: 'ordinary', gameIds: [add('ordinary', 'ordinary', 'w', ordinaryUnit)] });
    units.push({ id: amazonUnit, kind: 'amazon', gameIds: [
      add('aw', 'amazon', 'w', amazonUnit), add('ab', 'amazon', 'b', amazonUnit),
    ] });
  }
  return { schemaVersion: 1, id: 'staged-workflow-fixture', openings, schedule, units, totalGames: schedule.length,
    settings: { skill: 20, nodes: 20, threads: 1, hashMb: 2, maxPlies: 8, totalGames: schedule.length, bookPositions: positions },
    registry, profile: { hash: 'profile', registryHash: registry.hash, registry, config: '[fixture:chess]\n', variant: 'fixture' } };
}

function declaredStudy() {
  const source = plan(384);
  source.id = STUDY_ID;
  Object.assign(source.settings, { nodes: 20000, hashMb: 32, maxPlies: 400 });
  source.protocol = { id: STUDY_ID, totalGames: 1152, bookPositions: 384, jobs: 4,
    checkpoints: [384, 768, 1152], analysis: structuredClone(ANALYSIS) };
  source.study = { jobs: 4, checkpoints: [384, 768, 1152], analysis: structuredClone(ANALYSIS) };
  return source;
}

function fixture(t, options = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-study-core-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const source = plan(), outDir = path.join(temporary, 'run');
  const calls = { searches: [], starts: 0, closes: 0, preflights: 0 };
  const identity = { engineSha256: 'engine', rulesBundleSha256: 'rules', collectorSha256: 'source' };
  const rulesFactory = async () => ({ createBoard(fen) {
    const history = [];
    return { fen: () => fen + (history.length ? `|${history.join(',')}` : ''),
      turn: () => history.length % 2 ? 'b' : 'w',
      moves: () => history.length < MOVES.length ? [MOVES[history.length]] : [],
      san(move) { assert.equal(move, MOVES[history.length]); return `m${history.length + 1}`; },
      push(move) { if (move !== MOVES[history.length]) return false; history.push(move); return true; },
      outcome: () => history.length === 3 ? { result: '1-0', reason: 'checkmate' } : null,
      dispose() {} };
  } });
  const engineFactory = () => ({ metadata: { idname: 'fixture' },
    async start() { calls.starts++; return this.metadata; }, async newGame() {},
    async search(request) {
      calls.searches.push({ fen: request.fen, moves: [...request.moves] });
      await options.onSearch?.(request);
      if (request.signal.aborted) { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }
      return { move: MOVES[request.moves.length], info: null };
    }, async close() { calls.closes++; } });
  return { source, outDir, calls, identity, rulesFactory,
    services: { plan: source, outDir, enginePath: process.execPath, jobs: 4, rulesFactory, engineFactory,
      getIdentity: () => structuredClone(identity),
      preflight: async () => { calls.preflights++; return { engineName: 'fixture', searchesStarted: 0 }; } } };
}

test('only the frozen confirmation study expands the original 96-game bound', () => {
  assert.equal(validatePlan(declaredStudy()).size, 1152);
  assert.throws(() => validatePlan(plan(33)), /bounded collection/);
  const mutations = [source => { source.protocol.id = 'other'; }, source => { source.id = 'other'; },
    source => { source.protocol.jobs = 3; }, source => { source.study.jobs = 3; },
    source => { source.study.checkpoints[0] = 96; }, source => { source.protocol.analysis.anchors.queen = 8; },
    source => { source.settings.nodes = 100000; }, source => { source.protocol.totalGames = 1153; },
    source => { source.schedule[3].openingId = source.schedule[0].openingId; }];
  for (const mutate of mutations) {
    const source = declaredStudy(); mutate(source); assert.throws(() => validatePlan(source));
  }
});

test('cutoffs reject partial pairs, partial triplets and undeclared study checkpoints before writes', async t => {
  for (const untilGames of [0, -1, 1, 2, 4, 5, 10, 3.5]) {
    const f = fixture(t);
    await assert.rejects(runCollection({ ...f.services, untilGames }), /untilGames/);
    assert.equal(fs.existsSync(f.outDir), false);
    assert.equal(f.calls.searches.length, 0);
  }
  const f = fixture(t);
  await assert.rejects(runCollection({ ...f.services, plan: declaredStudy(), untilGames: 3 }), /declared game checkpoints/);
  await assert.rejects(runCollection({ ...f.services, plan: declaredStudy(), jobs: 3 }), /four workers/);
  assert.equal(fs.existsSync(f.outDir), false);
});

test('a new declared study inherits its four-worker default without starting past a stop request', async t => {
  const f = fixture(t);
  const result = await runCollection({ ...f.services, plan: declaredStudy(), jobs: undefined,
    untilGames: 384, shouldStop: () => 'pair' });
  assert.equal(result.manifest.jobs, 4); assert.equal(result.finishedGames, 0);
  assert.equal(result.checkpointReached, false); assert.equal(f.calls.searches.length, 0);
});

test('parallel cutoffs finish complete prefixes and resume under one unchanged manifest', async t => {
  const f = fixture(t);
  const first = await runCollection({ ...f.services, untilGames: 3 });
  assert.equal(first.finishedGames, 3); assert.equal(first.scheduledGames, 9);
  assert.equal(first.checkpointReached, true); assert.equal(first.untilGames, 3); assert.equal(first.stopped, true);
  assert.ok(f.calls.searches.every(search => search.fen.startsWith('o1-')));
  const manifest = fs.readFileSync(path.join(f.outDir, 'collection.json'));
  const second = await runCollection({ ...f.services, resume: true, untilGames: 6 });
  assert.equal(second.finishedGames, 6); assert.equal(second.checkpointReached, true);
  assert.ok(f.calls.searches.every(search => !search.fen.startsWith('o3-')));
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), manifest);
  const final = await runCollection({ ...f.services, resume: true, untilGames: 9 });
  assert.equal(final.finishedGames, 9); assert.equal(final.stopped, false); assert.equal(final.checkpointReached, true);
  assert.equal(final.records.length, 9); assert.equal(new Set(final.records.map(record => record.id)).size, 9);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), manifest);
  assert.equal(f.calls.starts, f.calls.closes);
  const searches = f.calls.searches.length, preflights = f.calls.preflights;
  await runCollection({ ...f.services, resume: true, untilGames: 9 });
  assert.equal(f.calls.searches.length, searches); assert.equal(f.calls.preflights, preflights);
});

test('a prefix selects its units even when later units appear first in unit ordering', async t => {
  const f = fixture(t); f.source.units.reverse();
  const result = await runCollection({ ...f.services, untilGames: 3 });
  assert.equal(result.finishedGames, 3); assert.equal(result.checkpointReached, true);
  assert.ok(result.records.every(record => record.openingId === 'o1'));
});

test('an immediate stop resumes exact active histories without crossing the requested barrier', async t => {
  const controller = new AbortController();
  const f = fixture(t, { onSearch(request) { if (request.moves.length === 1) controller.abort(); } });
  const first = await runCollection({ ...f.services, untilGames: 3, signal: controller.signal });
  assert.equal(first.checkpointReached, false);
  const interrupted = first.records.filter(record => record.status === 'aborted');
  assert.ok(interrupted.some(record => record.moves.length === 1));
  const result = await runCollection({ ...f.services, resume: true, untilGames: 3 });
  assert.equal(result.finishedGames, 3); assert.equal(result.checkpointReached, true);
  for (const record of interrupted) {
    const completed = result.records.find(row => row.id === record.id && row.status === 'completed');
    assert.deepEqual(completed.moves.slice(0, record.moves.length), record.moves);
    assert.ok(completed.attempt > record.attempt);
  }
  assert.ok(f.calls.searches.every(search => search.fen.startsWith('o1-')));
});

test('deferred crash prefixes survive earlier stage checkpoints and later resume', async t => {
  const f = fixture(t);
  await runCollection({ ...f.services, untilGames: 3 });
  const pending = { id: 'o3-aw', attempt: 1, startFen: 'o3-aw', finalFen: 'o3-aw|a2a3',
    moves: ['a2a3'], sans: ['m1'], profileHash: 'profile', registryHash: 'registry' };
  fs.writeFileSync(path.join(f.outDir, 'checkpoint.json'), JSON.stringify({ schemaVersion: 1, current: { 'o3-aw': pending } }));
  await runCollection({ ...f.services, resume: true, untilGames: 6 });
  const checkpoint = JSON.parse(fs.readFileSync(path.join(f.outDir, 'checkpoint.json')));
  assert.deepEqual(checkpoint.current['o3-aw'], pending);
  assert.ok(f.calls.searches.every(search => !search.fen.startsWith('o3-')));
  const count = f.calls.searches.length;
  const result = await runCollection({ ...f.services, resume: true, untilGames: 9 });
  assert.equal(result.finishedGames, 9);
  assert.deepEqual(f.calls.searches.slice(count).find(search => search.fen === 'o3-aw').moves, ['a2a3']);
});

test('the full study native preflight checks every start without searches', async t => {
  const f = fixture(t), values = { version: 1, pieces: {} };
  for (const [letter, mg, eg] of [['p', 126, 208], ['n', 781, 854], ['b', 825, 915], ['r', 1276, 1380], ['q', 2538, 2682], ['k', 0, 0], ['u', 3738, 3875]]) {
    for (const piece of [letter, letter.toUpperCase()]) values.pieces[piece] = Object.fromEntries(
      ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'].map(field => [field, field.endsWith('Mg') ? mg : eg]));
  }
  let checked = 0, searches = 0;
  const result = await checkCollection({ plan: declaredStudy(), enginePath: process.execPath, rulesFactory: f.rulesFactory,
    capabilityCheck: async () => ({ probes: 8 }), engineFactory: () => ({
      async start() { return { idname: 'fixture' }; }, async pieceValues() { return values; },
      async perft() { checked++; return [MOVES[0]]; }, async search() { searches++; }, async close() {} }) });
  assert.equal(checked, 1152); assert.equal(result.startingPositions, 1152);
  assert.equal(result.searchesStarted, 0); assert.equal(searches, 0);
});
