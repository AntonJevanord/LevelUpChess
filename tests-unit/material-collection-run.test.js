'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCollection, checkCollection, readCollectionManifest, validateValues, validatePlan } = require('../scripts/balance/material-collection-run');
const { openStore } = require('../scripts/balance/storage');

const MOVES = ['a2a3', 'a7a6', 'a3a4'];
const copy = value => structuredClone(value);
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-collection-run-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
}
function plan() {
  const registry = { hash: 'registry', allocations: [{ id: 'queen.purple@1', letter: 'u' }], definitions: [] };
  const schedule = [
    { id: 'ordinary', unitId: 'u0', kind: 'ordinary', aColor: 'w', openingId: 'opening', startFen: 'ordinary-fen', comparisonId: 'ordinary', openingMoves: [] },
    { id: 'aw', unitId: 'u1', kind: 'amazon', aColor: 'w', openingId: 'opening', startFen: 'white-amazon', comparisonId: 'amazon', openingMoves: [] },
    { id: 'ab', unitId: 'u1', kind: 'amazon', aColor: 'b', openingId: 'opening', startFen: 'black-amazon', comparisonId: 'amazon', openingMoves: [] },
  ];
  return { schemaVersion: 1, id: 'workflow-fixture', settings: { skill: 20, nodes: 20, threads: 1, hashMb: 2, maxPlies: 8 },
    profile: { hash: 'profile', registryHash: registry.hash, registry, config: '[fixture:chess]\n', variant: 'fixture' }, registry,
    schedule, units: [{ id: 'u0', kind: 'ordinary', gameIds: ['ordinary'] }, { id: 'u1', kind: 'amazon', gameIds: ['aw', 'ab'] }], book: {} };
}
function fixture(t, options = {}) {
  const directory = path.join(temporary(t), 'run'), source = plan(), calls = { searches: [], starts: 0, closes: 0, disposed: 0, preflights: 0 };
  const identity = { engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64), collectorSha256: 'c'.repeat(64) };
  const rulesFactory = async () => ({
    createBoard(fen) {
      const history = [];
      return { fen: () => fen + (history.length ? '|' + history.join(',') : ''),
        turn: () => history.length % 2 ? 'b' : 'w', moves: () => history.length < MOVES.length ? [MOVES[history.length]] : [],
        san(move) { if (move !== MOVES[history.length]) throw new Error('Illegal fixture SAN'); return `m${history.length + 1}`; },
        push(move) { if (move !== MOVES[history.length]) return false; history.push(move); return true; },
        outcome: () => history.length >= (options.terminalAt ?? 3) ? { result: '1-0', reason: 'checkmate' } : null,
        dispose() { calls.disposed++; } };
    },
  });
  const engineFactory = params => ({
    metadata: { idname: 'fixture-engine' },
    async start() { calls.starts++; return this.metadata; }, async newGame() {},
    async search(request) {
      calls.searches.push({ ...request, signal: undefined });
      await options.onSearch?.(request, calls);
      if (request.signal?.aborted) { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
      return { move: options.badMove ? 'h1h8' : MOVES[request.moves.length], info: null };
    }, async close() { calls.closes++; },
  });
  const services = { plan: source, outDir: directory, enginePath: process.execPath, jobs: 1, rulesFactory, engineFactory,
    getIdentity: () => copy(identity), preflight: async () => { calls.preflights++; return { engineName: 'fixture-engine', searchesStarted: 0 }; } };
  return { directory, source, calls, identity, rulesFactory, engineFactory, services };
}
const records = directory => fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

test('collection units require one ordinary game and intact Amazon color partners', () => {
  assert.equal(validatePlan(plan()).size, 3);
  for (const change of [p => p.units[1].gameIds.pop(), p => p.schedule[2].aColor = 'w',
    p => p.schedule[2].id = p.schedule[0].id, p => p.settings.threads = 2]) {
    const p = plan(); change(p); assert.throws(() => validatePlan(p));
  }
});

test('game stop, paired stop and resume preserve unique terminal outcomes and clear locks', async t => {
  const f = fixture(t); let stop = null;
  const first = await runCollection({ ...f.services, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished ordinary:')) stop = 'game'; } });
  assert.equal(first.finishedGames, 1); assert.equal(first.stopped, true);
  assert.equal(fs.existsSync(path.join(f.directory, 'run.lock')), false);
  const final = await runCollection({ ...f.services, resume: true });
  assert.equal(final.finishedGames, 3); assert.equal(final.stopped, false);
  assert.deepEqual(records(f.directory).map(row => row.id), ['ordinary', 'aw', 'ab']);
  assert.deepEqual(readCollectionManifest(f.directory).plan, f.source);
  assert.equal(f.calls.starts, f.calls.closes);
  const count = f.calls.preflights;
  await runCollection({ ...f.services, resume: true });
  assert.equal(f.calls.preflights, count, 'finished resume needs no native preflight or searches');
});

test('after-pair stop finishes both active Amazon games but starts no new unit', async t => {
  const f = fixture(t); f.source.units.reverse(); let stop = null;
  const result = await runCollection({ ...f.services, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished aw:')) stop = 'pair'; } });
  assert.equal(result.finishedGames, 2);
  assert.deepEqual(result.records.map(row => row.id), ['aw', 'ab']);
});

test('resume inherits the frozen job count when no override is supplied', async t => {
  for (const jobs of [1, 2]) {
    const f = fixture(t); let stop = null;
    await runCollection({ ...f.services, jobs, shouldStop: () => stop,
      onProgress(message) { if (message.startsWith('Starting ')) stop = 'game'; } });
    const final = await runCollection({ ...f.services, jobs: undefined, resume: true });
    assert.equal(final.manifest.jobs, jobs); assert.equal(final.finishedGames, 3);
  }
});

test('immediate cancellation persists an exact prefix and resumes it at a new attempt', async t => {
  const controller = new AbortController();
  const f = fixture(t, { onSearch(request) { if (request.moves.length === 1) controller.abort(); } });
  const first = await runCollection({ ...f.services, signal: controller.signal });
  assert.equal(first.stopped, true);
  assert.equal(first.records[0].status, 'aborted'); assert.deepEqual(first.records[0].moves, ['a2a3']);
  const final = await runCollection({ ...f.services, resume: true });
  assert.equal(final.finishedGames, 3);
  const completed = final.records.find(row => row.id === 'ordinary' && row.status === 'completed');
  assert.equal(completed.attempt, 2); assert.deepEqual(completed.moves, MOVES);
});

test('resume re-reads histories under lock and keeps a longer journal prefix at equal attempt', async t => {
  const controller = new AbortController();
  const f = fixture(t, { onSearch(request) { if (request.moves.length === 1) controller.abort(); } });
  await runCollection({ ...f.services, signal: controller.signal });
  const previousSearches = f.calls.searches.length;
  const preflight = async () => {
    // Simulate the former lock owner persisting a newer journal record while
    // this process performs its diagnostics; its checkpoint is one ply older.
    const row = records(f.directory)[0];
    row.moves.push(MOVES[1]); row.sans.push('m2'); row.totalPlies++; row.playedPlies++;
    row.finalFen = 'ordinary-fen|' + row.moves.join(',');
    fs.writeFileSync(path.join(f.directory, 'games.jsonl'), JSON.stringify(row) + '\n');
    return { engineName: 'fixture-engine', searchesStarted: 0 };
  };
  const final = await runCollection({ ...f.services, resume: true, preflight });
  assert.equal(final.finishedGames, 3);
  assert.deepEqual(f.calls.searches[previousSearches].moves, MOVES.slice(0, 2));
});

test('bad engine moves are errors rather than losses; ply limits remain unscored', async t => {
  const f = fixture(t, { badMove: true });
  await assert.rejects(runCollection(f.services), /Illegal or missing/);
  assert.equal(records(f.directory)[0].status, 'error'); assert.equal(records(f.directory)[0].result, '*');
  assert.equal(fs.existsSync(path.join(f.directory, 'run.lock')), false);
  const g = fixture(t); g.source.settings.maxPlies = 1;
  const result = await runCollection(g.services);
  assert.ok(result.records.every(row => row.status === 'truncated' && row.result === '*'));
});

test('source, executable, settings and journal corruption reject before resume mutations', async t => {
  const f = fixture(t); await runCollection(f.services);
  const before = fs.readFileSync(path.join(f.directory, 'games.jsonl'));
  await assert.rejects(runCollection({ ...f.services, resume: true, getIdentity: () => ({ ...f.identity, engineSha256: 'd'.repeat(64) }) }), /Cannot resume/);
  await assert.rejects(runCollection({ ...f.services, resume: true, jobs: 2 }), /Cannot resume/);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'games.jsonl')), before);
  const bad = records(f.directory); bad[0].sans[0] = 'wrong';
  fs.writeFileSync(path.join(f.directory, 'games.jsonl'), bad.map(row => JSON.stringify(row)).join('\n') + '\n');
  const corrupted = fs.readFileSync(path.join(f.directory, 'games.jsonl'));
  await assert.rejects(runCollection({ ...f.services, resume: true }), /replay/);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'games.jsonl')), corrupted);
});

test('torn journal tails are backed up and only unfinished games resume', async t => {
  const f = fixture(t); let stop = null;
  await runCollection({ ...f.services, shouldStop: () => stop, onProgress(message) { if (message.startsWith('Finished ordinary:')) stop = 'game'; } });
  fs.appendFileSync(path.join(f.directory, 'games.jsonl'), '{"id":');
  const final = await runCollection({ ...f.services, resume: true });
  assert.equal(final.finishedGames, 3); assert.equal(final.records.filter(row => row.id === 'ordinary').length, 1);
  assert.equal(fs.readdirSync(f.directory).filter(name => name.startsWith('games.jsonl.recovery-')).length, 1);
});

test('changed saved rules are rejected before torn journal repair', async t => {
  const f = fixture(t); await runCollection(f.services);
  fs.appendFileSync(path.join(f.directory, 'games.jsonl'), '{"id":');
  fs.appendFileSync(path.join(f.directory, 'rules', 'fixture.ini'), '# changed\n');
  const before = fs.readFileSync(path.join(f.directory, 'games.jsonl'));
  await assert.rejects(runCollection({ ...f.services, resume: true }), /Frozen rules snapshot/);
  assert.deepEqual(fs.readFileSync(path.join(f.directory, 'games.jsonl')), before);
  assert.equal(fs.readdirSync(f.directory).some(name => name.startsWith('games.jsonl.recovery-')), false);
});

test('failed journal writes stop all workers without a second append and resume safely', async t => {
  for (const partial of [false, true]) {
    const f = fixture(t); let writes = 0;
    const storeFactory = options => {
      const store = openStore(options);
      return { ...store, get checkpoint() { return store.checkpoint; }, append(record) {
        writes++;
        if (partial) fs.appendFileSync(path.join(f.directory, 'games.jsonl'), JSON.stringify(record).slice(0, 40));
        else store.append(record); // Simulate write succeeded, then fsync failed.
        throw new Error('injected journal failure');
      } };
    };
    await assert.rejects(runCollection({ ...f.services, jobs: 2, storeFactory }), /injected journal failure/);
    assert.equal(writes, 1, 'no completed, error or aborted records may follow an uncertain append');
    const final = await runCollection({ ...f.services, resume: true, jobs: undefined });
    assert.equal(final.finishedGames, 3);
    assert.deepEqual(final.records.map(row => row.status), ['completed', 'completed', 'completed']);
    assert.equal(new Set(final.records.map(row => row.id)).size, 3);
    assert.equal(fs.readdirSync(f.directory).filter(name => name.startsWith('games.jsonl.recovery-')).length, partial ? 1 : 0);
  }
});

test('unclaimed crash-only prefixes survive another resumed worker checkpoint', async t => {
  const f = fixture(t); const options = { ...f.services, jobs: 2 }; await runCollection(options);
  fs.writeFileSync(path.join(f.directory, 'games.jsonl'), '');
  const pending = { id: 'aw', attempt: 1, startFen: 'white-amazon', finalFen: 'white-amazon|a2a3',
    moves: ['a2a3'], sans: ['m1'], profileHash: 'profile', registryHash: 'registry' };
  fs.writeFileSync(path.join(f.directory, 'checkpoint.json'), JSON.stringify({ schemaVersion: 1, current: { aw: pending } }));
  const controller = new AbortController(); let observed = false;
  await runCollection({ ...options, resume: true, signal: controller.signal,
    onProgress(message) {
      if (message.startsWith('Starting ordinary')) {
        const saved = JSON.parse(fs.readFileSync(path.join(f.directory, 'checkpoint.json')));
        assert.deepEqual(saved.current.aw.moves, ['a2a3']); observed = true; controller.abort();
      }
    } });
  assert.equal(observed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.directory, 'checkpoint.json'))).current.aw.moves, ['a2a3']);
});

test('preflight errors and existing directories never create collection evidence', async t => {
  const f = fixture(t);
  await assert.rejects(runCollection({ ...f.services, preflight: async () => { throw new Error('native mismatch'); } }), /native mismatch/);
  assert.equal(fs.existsSync(f.directory), false);
  fs.mkdirSync(f.directory); fs.writeFileSync(path.join(f.directory, 'keep.txt'), 'keep');
  await assert.rejects(runCollection(f.services), /new empty/);
  assert.deepEqual(fs.readdirSync(f.directory), ['keep.txt']);
});

test('native preflight validates tables and starting moves without searching and cleans temporary rules', async t => {
  const f = fixture(t), values = { version: 1, pieces: {} };
  for (const [letter, mg, eg] of [['p', 126, 208], ['n', 781, 854], ['b', 825, 915], ['r', 1276, 1380], ['q', 2538, 2682], ['k', 0, 0], ['u', 3738, 3875]]) {
    for (const piece of [letter, letter.toUpperCase()]) values.pieces[piece] = Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'].map(field => [field, field.endsWith('Mg') ? mg : eg]));
  }
  validateValues(values, f.source.profile);
  const bad = copy(values); bad.pieces.U.captureMg++;
  assert.throws(() => validateValues(bad, f.source.profile), /captureMg changed/);
  let rulesPath, searches = 0, closes = 0;
  const result = await checkCollection({ plan: f.source, enginePath: process.execPath, rulesFactory: f.rulesFactory,
    capabilityCheck: async () => ({ probes: 12 }),
    engineFactory(params) {
      rulesPath = params.variantPath;
      return { async start() { assert.equal(fs.existsSync(rulesPath), true); return { idname: 'fixture' }; },
        async pieceValues() { return values; }, async perft() { return [MOVES[0]]; },
        async search() { searches++; }, async close() { closes++; } };
    } });
  assert.equal(result.searchesStarted, 0); assert.equal(result.startingPositions, 3);
  assert.equal(searches, 0); assert.equal(closes, 1); assert.equal(fs.existsSync(rulesPath), false);
});
