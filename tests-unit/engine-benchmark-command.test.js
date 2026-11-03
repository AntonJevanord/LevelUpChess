'use strict';

// Synthetic orchestration and saved-record fixtures only. The fake executable
// is inert; no engine process, search or benchmark game is run in this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const command = require('../scripts/benchmark-engine-sharing');
const { ensureBenchmarkRuntime } = require('../scripts/balance/engine-benchmark-runtime');

const ROOT = path.resolve(__dirname, '..');
const overlay = ensureBenchmarkRuntime({ root: ROOT });
const isolated = require(overlay.entry);
const from = file => require(path.join(overlay.directory, `scripts/balance/${file}`));
const plan = from('engine-benchmark-plan');
const { makeSchedule } = from('plan');
const { createDesignRegistry } = from('design-registry');
const { compileDesignProfile } = from('design-profile');
const hash = value => createHash('sha256').update(value).digest('hex');

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-engine-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function setup(t) {
  const root = temporary(t), enginePath = path.join(root, 'inert-engine.bin');
  fs.writeFileSync(enginePath, 'not executable; synthetic fixture');
  const out = path.join(root, 'benchmark'); fs.mkdirSync(out);
  const states = new Map(), calls = [], reports = [], signals = new EventEmitter();
  const dependencies = { enginePath, overlaySha256: overlay.manifestSha256, signals, log() {},
    inspect: (_, manifest) => manifest.cells.map(cell => ({ ...cell, state: { mode: states.get(cell.key) || 'new' } })),
    report: (_, manifest, cells, times) => {
      reports.push({ manifest, cells, times: structuredClone(times) });
      return { report: {}, files: { markdown: 'synthetic-benchmark.md' } };
    },
    run: async args => {
      const flag = args.includes('--resume') ? '--resume' : '--out';
      const directory = args[args.indexOf(flag) + 1];
      calls.push({ args, mode: process.env.LEVELUP_BENCH_ENGINE_MODE, enginePath: process.env.FAIRY_STOCKFISH_PATH });
      states.set(path.basename(directory), 'complete'); return {};
    },
  };
  return { root, out, enginePath, states, calls, reports, signals, dependencies };
}
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

function savedCell(t, { mode = 'separate' } = {}) {
  const f = setup(t), declaration = plan.buildBenchmarkPlan({ jobs: 1, rounds: 1 });
  const descriptor = declaration.cells.find(cell => cell.mode === mode);
  const config = plan.buildCellConfig({ ...descriptor, jobs: declaration.jobs }), schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const identity = from('run').getRunIdentity(f.enginePath);
  const manifest = { schemaVersion: 1, runId: 'synthetic-cell', ...identity, config, schedule,
    configHash: hash(JSON.stringify({ config, schedule })),
    rulesHash: hash(JSON.stringify({ bundleHash: identity.rulesBundleSha256, runnerSha256: identity.runnerSha256,
      profiles: [{ variant: profile.variant, config: profile.config }] })),
    designRegistry: registry, designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: profile.registryHash },
    rulesProfiles: [{ variant: profile.variant, whiteKing: 0, blackKing: 0, configSha256: hash(profile.config),
      file: `rules/${profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null, profileHash: profile.hash, registryHash: registry.hash }],
    parallel: { jobs: 1 } };
  const records = schedule.map(game => ({ id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
    openingId: game.openingId, repetition: 1, aColor: game.aColor, attempt: 1, status: 'truncated', result: '*', reason: 'max-plies',
    variant: profile.variant, profileHash: profile.hash, registryHash: registry.hash, registryReference: 'run.json#designRegistry',
    engine: config.engine, evaluation: config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, openingMoves: [],
    moves: ['g1f3', 'g8f6'], sans: ['Nf3', 'Nf6'], totalPlies: 2, playedPlies: 2, openingPlies: 0,
    startedAt: '2026-11-03T12:00:00.000Z', finishedAt: '2026-11-03T12:00:00.100Z', benchmarkOnly: true, engineMode: mode,
    benchmarkTiming: { startPly: 0, prepareMs: 1, searchMs: 2, elapsedBeforePersistMs: 3, searchCalls: 2, reportedNodes: 40000,
      missingNodeReports: 0, physicalEngines: mode === 'shared' ? 1 : 2, nativePids: mode === 'shared' ? [123] : [123, 124] } }));
  const directory = path.join(f.out, descriptor.directory); fs.mkdirSync(path.join(directory, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(manifest) + '\n');
  fs.writeFileSync(path.join(directory, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join(''));
  fs.writeFileSync(path.join(directory, `rules/${profile.variant}.ini`), profile.config);
  return { ...f, descriptor, directory, records, cellManifest: manifest,
    manifest: { ...declaration, runId: 'synthetic-benchmark', identity, cells: [descriptor] } };
}

test('benchmark CLI bounds workers/rounds and rejects modes or ignored options', () => {
  assert.deepEqual(command.parseArgs(['--out', 'x']), { out: 'x', jobs: 4, rounds: 2 });
  assert.deepEqual(command.parseArgs(['--out', 'x', '--jobs', '1', '--rounds', '8']), { out: 'x', jobs: 1, rounds: 8 });
  assert.deepEqual(command.parseArgs(['--check', '--rules-only']), { check: true, 'rules-only': true });
  assert.deepEqual(command.parseArgs(['--help']), { help: true });
  for (const args of [[], ['--out'], ['--out', 'x', '--resume', 'x'], ['--out', 'x', '--jobs', '5'], ['--out', 'x', '--rounds', '9'],
    ['--out', 'x', '--rounds', '0'], ['--resume', 'x', '--jobs', '2'], ['--resume', 'x', '--rounds', '2'],
    ['--check', '--log', 'plies'], ['--report', 'x', '--engine', 'y'], ['--out', 'x', '--rules-only'],
    ['--out', 'x', '--log', 'quiet'], ['--check', '--check']]) assert.throws(() => command.parseArgs(args));
});

test('a new benchmark cannot add foreign data inside a running balance campaign', async t => {
  const root = temporary(t), campaign = path.join(root, 'active-panel'), output = path.join(campaign, 'benchmark');
  fs.mkdirSync(campaign); fs.writeFileSync(path.join(campaign, 'panel.json'), '{"preserve":"original"}\n');
  const before = fs.readFileSync(path.join(campaign, 'panel.json'));
  await assert.rejects(command.main(['--out', output, '--engine', path.join(root, 'inert')], {
    ensure() { assert.fail('No runtime should be created inside the campaign.'); }, log() {},
  }), /outside existing campaigns/);
  assert.equal(fs.existsSync(output), false);
  assert.deepEqual(fs.readFileSync(path.join(campaign, 'panel.json')), before);
});

test('default64 games run eight sequential cells with matching mode environments and verified resume skips', async t => {
  const f = setup(t), previousMode = process.env.LEVELUP_BENCH_ENGINE_MODE, previousPath = process.env.FAIRY_STOCKFISH_PATH;
  const result = await isolated.runBenchmark(['--out', f.out], f.dependencies), manifest = read(f.out, command.MANIFEST);
  assert.equal(result.stopped, false); assert.equal(manifest.games, 64); assert.equal(manifest.cells.length, 8);
  assert.deepEqual(f.calls.map(call => path.basename(call.args[call.args.indexOf('--out') + 1])), manifest.cells.map(cell => cell.directory));
  assert.deepEqual(f.calls.map(call => call.mode), manifest.cells.map(cell => cell.mode));
  assert.ok(f.calls.every(call => call.enginePath === f.enginePath && call.args[call.args.indexOf('--jobs') + 1] === '4'));
  assert.equal(process.env.LEVELUP_BENCH_ENGINE_MODE, previousMode); assert.equal(process.env.FAIRY_STOCKFISH_PATH, previousPath);
  const times = read(f.out, command.TIMES);
  assert.ok(Object.values(times.cells).every(cell => cell.sessions === 1 && cell.timingEligible && cell.elapsedMs > 0));
  const original = fs.readFileSync(path.join(f.out, command.MANIFEST));
  await isolated.runBenchmark(['--resume', f.out], f.dependencies);
  assert.equal(f.calls.length, 8); assert.deepEqual(fs.readFileSync(path.join(f.out, command.MANIFEST)), original);
  assert.equal(f.signals.listenerCount('SIGINT'), 0); assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});

test('all stop flags pause the whole queue and exclude that cell timing', async t => {
  for (const action of ['now', 'game', 'pair']) {
    const f = setup(t);
    f.dependencies.run = async args => {
      f.calls.push(args); const key = path.basename(args[args.indexOf('--out') + 1]); f.states.set(key, 'complete');
      return { stopRequested: action };
    };
    assert.equal((await isolated.runBenchmark(['--out', f.out], f.dependencies)).stopped, true);
    assert.equal(f.calls.length, 1);
    assert.equal(Object.values(read(f.out, command.TIMES).cells)[0].timingEligible, false);
  }
});

test('an interrupted cell resumes in place and never reenters fresh timing comparisons', async t => {
  const f = setup(t), regular = f.dependencies.run;
  f.dependencies.run = async args => {
    f.calls.push(args); f.states.set(path.basename(args[args.indexOf('--out') + 1]), 'resume'); return { stopped: true };
  };
  await isolated.runBenchmark(['--out', f.out], f.dependencies);
  const first = read(f.out, command.MANIFEST).cells[0].key;
  f.dependencies.run = regular;
  await isolated.runBenchmark(['--resume', f.out], f.dependencies);
  assert.equal(f.calls.length, 9); assert.ok(f.calls[1].args.includes('--resume'));
  const timing = read(f.out, command.TIMES).cells[first];
  assert.equal(timing.sessions, 2); assert.equal(timing.timingEligible, false);
  assert.ok(timing.elapsedMs > 0);
});

test('foreign configs and changed native bytes fail before another cell starts', async t => {
  const f = setup(t);
  f.dependencies.run = async args => { f.calls.push(args); return { stopped: true }; };
  await isolated.runBenchmark(['--out', f.out], f.dependencies);
  const later = read(f.out, command.MANIFEST).cells[1];
  fs.writeFileSync(path.join(f.out, 'configs', `${later.directory}.json`), '{}');
  await assert.rejects(isolated.runBenchmark(['--resume', f.out], f.dependencies), /config is foreign or changed/);
  fs.unlinkSync(path.join(f.out, 'configs', `${later.directory}.json`)); fs.writeFileSync(f.enginePath, 'changed inert bytes');
  await assert.rejects(isolated.runBenchmark(['--resume', f.out], f.dependencies), /identity changed/);
  assert.equal(f.calls.length, 1);
});

test('rules-only checks use four configurations, launch no games and cancellation clears handlers', async t => {
  const f = setup(t), checked = [];
  await isolated.runBenchmark(['--check', '--rules-only'], { ...f.dependencies, run() { assert.fail('no games'); },
    check: async (config, options) => { checked.push(config); assert.equal(options.enginePath, undefined); } });
  assert.equal(checked.length, 4); assert.equal(fs.existsSync(path.join(f.out, command.MANIFEST)), false);
  let calls = 0;
  const stopped = await isolated.runBenchmark(['--check', '--rules-only'], { ...f.dependencies,
    check: async () => { calls++; f.signals.emit('SIGINT'); } });
  assert.equal(stopped.stopped, true); assert.equal(calls, 1); assert.equal(f.signals.listenerCount('SIGINT'), 0);
  await assert.rejects(isolated.runBenchmark(['--check'], { ...f.dependencies, check: async () => { throw new Error('synthetic native failure'); } }), /synthetic native failure/);
  assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});

test('runtime failures restore the caller environment and persist excluded timing', async t => {
  const f = setup(t), beforeMode = process.env.LEVELUP_BENCH_ENGINE_MODE, beforePath = process.env.FAIRY_STOCKFISH_PATH;
  f.dependencies.run = async () => { throw new Error('synthetic runner failure'); };
  await assert.rejects(isolated.runBenchmark(['--out', f.out], f.dependencies), /synthetic runner failure/);
  assert.equal(process.env.LEVELUP_BENCH_ENGINE_MODE, beforeMode); assert.equal(process.env.FAIRY_STOCKFISH_PATH, beforePath);
  assert.equal(Object.values(read(f.out, command.TIMES).cells)[0].timingEligible, false);
  assert.equal(f.signals.listenerCount('SIGINT'), 0);
});

test('production cell inspection reads valid original artifacts and rejects changed identity or live locks', t => {
  const f = savedCell(t), rows = isolated.inspectAll(f.out, f.manifest);
  assert.equal(rows[0].state.mode, 'complete'); assert.equal(rows[0].state.records.length, 2);
  assert.ok(rows[0].state.records.every(record => record.status === 'truncated'));
  fs.writeFileSync(path.join(f.directory, 'run.lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => isolated.inspectAll(f.out, f.manifest), /active in process/);
  fs.unlinkSync(path.join(f.directory, 'run.lock'));
  assert.throws(() => isolated.inspectAll(f.out, { ...f.manifest, identity: { ...f.manifest.identity, engineSha256: '0'.repeat(64) } }), /changed its recorded runtime/);
  fs.writeFileSync(path.join(f.directory, `rules/${f.cellManifest.designProfile.variant}.ini`), 'changed rules');
  assert.throws(() => isolated.inspectAll(f.out, f.manifest), /Archived benchmark rules changed/);
});

test('offline reporting preserves completed counts with missing wall timing and starts no engine', async t => {
  const f = savedCell(t), fullPlan = plan.buildBenchmarkPlan({ jobs: 1, rounds: 1 });
  const cells = isolated.inspectAll(f.out, f.manifest);
  const result = isolated.writeReport(f.out, { ...fullPlan, runId: f.manifest.runId, host: {} }, cells,
    { runId: f.manifest.runId, cells: {} });
  assert.equal(result.report.finalizedGames, 2); assert.equal(result.report.eligibleCells, 0);
  assert.equal(result.report.cells[0].elapsedMs, null); assert.equal(result.report.cells[0].gamesPerHour, null);
  const other = setup(t);
  await isolated.runBenchmark(['--out', other.out], other.dependencies);
  let reports = 0;
  await isolated.runBenchmark(['--report', other.out], { ...other.dependencies, enginePath: undefined,
    identity() { assert.fail('offline reports need no executable'); }, run() { assert.fail('offline reports start no game'); },
    report() { reports++; return { report: {}, files: { markdown: 'offline.md' } }; } });
  assert.equal(reports, 1);
});

test('a power cut before timing finalization never treats a pending first session as a fresh sample', t => {
  for (const partial of [false, true]) {
    const f = savedCell(t), fullPlan = plan.buildBenchmarkPlan({ jobs: 1, rounds: 1 });
    if (partial) fs.writeFileSync(path.join(f.directory, 'games.jsonl'), JSON.stringify(f.records[0]) + '\n');
    const manifest = { ...fullPlan, runId: f.manifest.runId, host: {} };
    const pending = { runId: manifest.runId, cells: { [f.descriptor.key]: {
      sessions: 1, startedAt: '2026-11-03T12:00:00.000Z', finishedAt: null,
      elapsedMs: null, timingEligible: true,
    } } };
    fs.writeFileSync(path.join(f.out, command.TIMES), JSON.stringify(pending));
    const times = isolated.readTimes(f.out, manifest), cells = isolated.inspectAll(f.out, f.manifest);
    const result = isolated.writeReport(f.out, manifest, cells, times);
    assert.equal(result.report.finalizedGames, partial ? 1 : 2);
    assert.equal(result.report.eligibleCells, 0);
    assert.equal(result.report.cells[0].elapsedMs, null);
    assert.equal(result.report.cells[0].timingEligible, false);
    assert.equal(result.report.cells[0].gamesPerHour, null);
    assert.equal(result.report.comparisons[0].pairedRounds, 0);
  }
});

test('timing ownership forbids foreign cells and relabeling resumed samples as fresh', t => {
  const f = setup(t), manifest = { ...plan.buildBenchmarkPlan(), runId: 'timing-owner' }, key = manifest.cells[0].key;
  const write = value => fs.writeFileSync(path.join(f.out, command.TIMES), JSON.stringify(value));
  write({ runId: manifest.runId, cells: { [key]: { sessions: 2, elapsedMs: 10, timingEligible: true } } });
  assert.throws(() => isolated.readTimes(f.out, manifest), /Resumed benchmark timing/);
  write({ runId: 'foreign', cells: {} }); assert.throws(() => isolated.readTimes(f.out, manifest), /ownership/);
  write({ runId: manifest.runId, cells: 1 }); assert.throws(() => isolated.readTimes(f.out, manifest), /ownership/);
});

test('outer ownership keeps original jobs and rounds and resumes independently of current sources', async t => {
  const f = setup(t), calls = [], execute = async (args, options) => { calls.push({ args, options }); return {}; };
  await command.main(['--out', f.out, '--jobs', '2', '--rounds', '3', '--engine', f.enginePath], { execute, log() {} });
  const owner = read(f.out, command.OWNER);
  assert.equal(owner.jobs, 2); assert.equal(owner.rounds, 3); assert.match(owner.directory, /^runtime\//);
  await command.main(['--resume', f.out, '--engine', f.enginePath], { execute, log() {}, sourceRoot: '/not-used',
    ensure() { assert.fail('resume must use the saved snapshot'); } });
  assert.equal(calls[1].options.initialJobs, 2); assert.equal(calls[1].options.initialRounds, 3);
  assert.equal(calls[1].options.overlaySha256, calls[0].options.overlaySha256);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
  await assert.rejects(command.main(['--out', f.out, '--engine', f.enginePath], { execute, log() {} }), /empty directory/);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});

test('interrupted snapshot creation recovers saved settings and releases the root lock', async t => {
  const f = setup(t);
  await assert.rejects(command.main(['--out', f.out, '--jobs', '1', '--rounds', '4', '--engine', f.enginePath], {
    ensure() { throw new Error('synthetic setup cut'); }, execute() { assert.fail('no owned runtime yet'); }, log() {} }), /synthetic setup cut/);
  assert.equal(read(f.out, command.OWNER).directory, null); assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
  let settings;
  await command.main(['--resume', f.out, '--engine', f.enginePath], { log() {}, execute: async (_, options) => { settings = options; } });
  assert.equal(settings.initialJobs, 1); assert.equal(settings.initialRounds, 4);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});
