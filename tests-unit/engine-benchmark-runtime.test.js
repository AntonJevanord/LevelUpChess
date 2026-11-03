'use strict';

// Snapshot and synthetic lifecycle checks only. No native executable or
// benchmark games are run on this machine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { Chess } = require('chess.js');
const api = require('../scripts/balance/engine-benchmark-runtime');
const { ANCHOR } = require('../scripts/balance/research-overlay');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');

const ROOT = path.resolve(__dirname, '..');
const RUN = path.join(ROOT, api.RUNNER);
const original = fs.readFileSync(RUN, 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-engine-runtime-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
}
function write(root, file, content) {
  const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
}
function fixture(t) {
  const directory = temporary(t), root = path.join(directory, 'source'); fs.mkdirSync(root);
  for (const name of ['scripts', 'src', 'variants', 'experiments']) fs.mkdirSync(path.join(root, name));
  write(root, 'package.json', '{"name":"synthetic-engine-benchmark-runtime","private":true}\n');
  write(root, api.RUNNER, original);
  write(root, api.BASE.entryFile, 'module.exports = { synthetic: true };\n');
  write(root, api.BASE.definitionFile, "module.exports = { NEW_DEFINITIONS: [] };\n");
  write(root, 'src/design-catalog.js', `module.exports = [\n${ANCHOR}\n];\n`);
  write(root, 'src/balance-designs-v17-mixed.js', 'module.exports = { NEW_DEFINITIONS: [] };\n');
  write(root, 'dist/balance-rules.cjs', Buffer.from([0, 1, 13, 10, 255]));
  return { root, cacheDirectory: path.join(directory, 'cache') };
}

test('exact patches preserve the production source and cannot silently apply to another runner', () => {
  const before = sha(fs.readFileSync(RUN)), patched = api.patchRunner(original);
  assert.ok(patched.includes('LEVELUP_BENCH_ENGINE_MODE'));
  assert.ok(patched.includes('benchmarkOnly: true, engineMode'));
  assert.ok(patched.includes('benchmarkTiming.searchCalls++'));
  assert.doesNotThrow(() => new vm.Script(patched, { filename: 'synthetic-patched-runner.js' }));
  assert.equal(api.patchRunner(original.replace(/\r?\n/g, '\r\n')), patched);
  assert.throws(() => api.patchRunner(patched), /unmodified/);
  for (const patch of api.PATCHES) {
    assert.throws(() => api.patchRunner(original.replace(patch.anchor, '')), /exact benchmark patch anchors/);
    assert.throws(() => api.patchRunner(original + '\n' + patch.anchor), /exact benchmark patch anchors/);
  }
  assert.equal(sha(fs.readFileSync(RUN)), before);
});

test('derived snapshots attest the modified runner while keeping base files and live runtime unchanged', t => {
  const selected = fixture(t), runnerBefore = fs.readFileSync(path.join(selected.root, api.RUNNER));
  const liveBefore = sha(fs.readFileSync(RUN));
  const snapshot = api.ensureBenchmarkRuntime(selected);
  assert.equal(snapshot.reused, false);
  assert.equal(snapshot.manifest.benchmarkOnly, true);
  assert.equal(snapshot.manifest.benchmarkProtocol, 'fresh-per-game-equal-strength-shared-or-separate-v1');
  assert.match(snapshot.manifest.baseOverlayReceiptSha256, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.manifest.patches.filter(patch => patch.file === api.RUNNER).length, api.PATCHES.length);
  const patched = fs.readFileSync(path.join(snapshot.directory, api.RUNNER));
  assert.equal(patched.toString('utf8'), api.patchRunner(original));
  const inventory = snapshot.manifest.files.find(file => file.file === api.RUNNER);
  assert.equal(inventory.sha256, sha(patched)); assert.equal(inventory.bytes, patched.length);
  assert.deepEqual(fs.readFileSync(path.join(selected.root, api.RUNNER)), runnerBefore);
  assert.equal(sha(fs.readFileSync(RUN)), liveBefore);
  assert.equal(api.ensureBenchmarkRuntime(selected).reused, true);
  assert.equal(api.openBenchmarkRuntime({ directory: snapshot.directory, manifestSha256: snapshot.manifestSha256 }).entry, snapshot.entry);
});

test('owned receipts reject source tampering, foreign snapshots and changed receipt hashes', t => {
  const selected = fixture(t), snapshot = api.ensureBenchmarkRuntime(selected);
  assert.throws(() => api.openBenchmarkRuntime({ directory: snapshot.directory, manifestSha256: '0'.repeat(64) }), /receipt differs/);
  fs.appendFileSync(path.join(snapshot.directory, api.RUNNER), '\n// changed\n');
  assert.throws(() => api.openBenchmarkRuntime({ directory: snapshot.directory }), /snapshot file changed/);
  const base = fs.readdirSync(selected.cacheDirectory).find(name => name.startsWith(api.BASE.name + '-'));
  assert.throws(() => api.openBenchmarkRuntime({ directory: path.join(selected.cacheDirectory, base) }), /Not an owned engine-sharing/);
});

function syntheticRunner(mode) {
  const calls = [], startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const history = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
  const reference = new Chess(), positions = [startFen];
  for (const move of history) {
    reference.move({ from: move.slice(0, 2), to: move.slice(2, 4) }); positions.push(reference.fen());
  }
  const board = () => {
    let ply = 0;
    return { fen: () => positions[ply], turn: () => ply % 2 ? 'b' : 'w', moves: () => [history[ply]],
      san: move => `fixture:${move}`, push(move) { if (move !== history[ply]) return false; ply++; return true; },
      outcome: () => ply === history.length ? { result: '0-1', reason: 'checkmate' } : null, dispose() {} };
  };
  const rules = { variant: 'chess', config: '[chess]\n', royalMode: 'king', evaluationCaveat: null,
    startingFen: () => startFen, createBoard: board };
  class FakeEngine {
    constructor(options) { this.options = options; this.child = { pid: 1000 + calls.length }; this.events = []; calls.push(this); }
    async start() { this.events.push('start'); return { idname: 'Synthetic benchmark engine' }; }
    async newGame() { this.events.push('newGame'); }
    async perft({ fen }) { this.events.push('perft'); return [history[positions.indexOf(fen)]]; }
    async search(input) { this.events.push({ search: { ...input, moves: [...input.moves] } }); return { move: history[input.moves.length], info: { nodes: input.nodes } }; }
    async close() { this.events.push('close'); }
  }
  const actualRequire = createRequire(RUN);
  const requireFixture = name => {
    if (name === './uci') return { UciEngine: FakeEngine };
    if (name === './capabilities') return { checkCapabilities: async () => ({ probes: 1 }) };
    if (name === './evaluation') return { requireManualValues: async () => {} };
    if (name === 'node:module') return { createRequire: () => () => ({ createMatchRules: async () => rules }) };
    return actualRequire(name);
  };
  const processFixture = Object.create(process);
  Object.defineProperty(processFixture, 'env', { value: mode === undefined ? {} : { LEVELUP_BENCH_ENGINE_MODE: mode } });
  const moduleFixture = { exports: {} };
  const context = vm.createContext({ require: requireFixture, module: moduleFixture, exports: moduleFixture.exports,
    __dirname: path.dirname(RUN), __filename: RUN, process: processFixture, Buffer, console });
  new vm.Script(api.patchRunner(original), { filename: RUN }).runInContext(context);
  return { runMatches: moduleFixture.exports.runMatches, calls, history, startFen };
}

function config() {
  return normalizeConfig({ schemaVersion: 1, name: 'Synthetic topology fixture; not balance evidence', seed: 1,
    repetitions: 1, engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 8 },
    openings: [{ id: 'start', moves: [] }], comparisons: [{ id: 'fixture', armyA: {}, armyB: {}, strengthA: { skill: 20 }, strengthB: { skill: 20 } }] });
}

test('one shared engine alternates both colors and is reset and closed once for the game', async t => {
  const fixture = syntheticRunner('shared'), root = temporary(t), input = config(), enginePath = path.join(root, 'synthetic-not-executable');
  fs.writeFileSync(enginePath, 'synthetic');
  await fixture.runMatches({ config: input, schedule: makeSchedule(input).slice(0, 1), outDir: path.join(root, 'run'), enginePath });
  const playing = fixture.calls.filter(engine => engine.events.some(event => typeof event === 'object'));
  assert.equal(playing.length, 1);
  const events = playing[0].events;
  assert.equal(events.filter(event => event === 'start').length, 1);
  assert.equal(events.filter(event => event === 'newGame').length, 1);
  assert.equal(events.filter(event => event === 'close').length, 1);
  const searches = events.filter(event => typeof event === 'object').map(event => event.search);
  assert.deepEqual(searches.map(search => search.moves.length), [0, 1, 2, 3]);
  assert.ok(searches.every(search => search.fen === fixture.startFen && search.nodes === 20000));
  const record = JSON.parse(fs.readFileSync(path.join(root, 'run/games.jsonl'), 'utf8').trim());
  assert.equal(record.benchmarkOnly, true); assert.equal(record.engineMode, 'shared');
  assert.equal(record.benchmarkTiming.startPly, 0);
  assert.equal(record.benchmarkTiming.physicalEngines, 1); assert.equal(record.benchmarkTiming.nativePids.length, 1);
  assert.equal(record.benchmarkTiming.searchCalls, 4); assert.equal(record.benchmarkTiming.reportedNodes, 80000);
  assert.equal(record.benchmarkTiming.missingNodeReports, 0);
  assert.equal(record.engineNames.w, record.engineNames.b);
  const otherMode = syntheticRunner('separate');
  await assert.rejects(otherMode.runMatches({ config: input, schedule: makeSchedule(input).slice(0, 1),
    outDir: path.join(root, 'run'), enginePath, resume: true }), /another engine mode/);
  assert.equal(otherMode.calls.length, 0);
});

test('separate mode keeps two distinct fresh engine histories with the same instrumentation', async t => {
  const fixture = syntheticRunner('separate'), root = temporary(t), input = config(), enginePath = path.join(root, 'synthetic-not-executable');
  fs.writeFileSync(enginePath, 'synthetic');
  await fixture.runMatches({ config: input, schedule: makeSchedule(input).slice(0, 1), outDir: path.join(root, 'run'), enginePath });
  const playing = fixture.calls.filter(engine => engine.events.some(event => typeof event === 'object'));
  assert.equal(playing.length, 2);
  assert.deepEqual(playing.map(engine => engine.events.filter(event => typeof event === 'object').map(event => event.search.moves.length)), [[0, 2], [1, 3]]);
  assert.ok(playing.every(engine => engine.events.filter(event => event === 'newGame').length === 1 && engine.events.filter(event => event === 'close').length === 1));
  const record = JSON.parse(fs.readFileSync(path.join(root, 'run/games.jsonl'), 'utf8').trim());
  assert.equal(record.engineMode, 'separate'); assert.equal(record.benchmarkTiming.physicalEngines, 2);
  assert.equal(record.benchmarkTiming.startPly, 0);
  assert.equal(record.benchmarkTiming.searchCalls, 4); assert.equal(record.benchmarkTiming.reportedNodes, 80000);
});

test('missing mode, unequal strength and non-node settings refuse before native startup', async t => {
  const root = temporary(t), enginePath = path.join(root, 'synthetic-not-executable'); fs.writeFileSync(enginePath, 'synthetic');
  for (const mode of [undefined, 'other']) {
    const fixture = syntheticRunner(mode), input = config();
    await assert.rejects(fixture.runMatches({ config: input, schedule: makeSchedule(input), outDir: path.join(root, String(mode)), enginePath }), /explicit shared or separate/);
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = syntheticRunner('shared'), input = config();
  input.comparisons[0].strengthB = { skill: 10 };
  await assert.rejects(fixture.runMatches({ config: input, schedule: makeSchedule(input), outDir: path.join(root, 'unequal'), enginePath }), /identical White\/Black/);
  assert.equal(fixture.calls.length, 0);
});

test('a resumed attempt records its restored prefix separately from newly searched plies', async t => {
  for (const stoppedAt of [1, 4]) {
    const first = syntheticRunner('shared'), root = temporary(t), input = config(), enginePath = path.join(root, 'synthetic-not-executable');
    fs.writeFileSync(enginePath, 'synthetic');
    const controller = new AbortController(), options = { config: input, schedule: makeSchedule(input).slice(0, 1),
      outDir: path.join(root, 'run'), enginePath };
    const stopped = await first.runMatches({ ...options, signal: controller.signal,
      onProgress(message) { if (message.startsWith('Game ') && message.includes(`: ply ${stoppedAt},`)) controller.abort(); } });
    assert.equal(stopped.stopped, true);
    const second = syntheticRunner('shared');
    await second.runMatches({ ...options, resume: true });
    const records = fs.readFileSync(path.join(root, 'run/games.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(records[0].status, 'aborted'); assert.equal(records[1].status, 'completed');
    const resumed = records[1];
    assert.equal(resumed.attempt, 2); assert.equal(resumed.benchmarkTiming.startPly, stoppedAt);
    assert.equal(resumed.benchmarkTiming.searchCalls, 4 - stoppedAt);
    assert.equal(resumed.benchmarkTiming.startPly + resumed.benchmarkTiming.searchCalls, resumed.moves.length);
    assert.equal(resumed.benchmarkTiming.physicalEngines, stoppedAt === 4 ? 0 : 1);
  }
});
