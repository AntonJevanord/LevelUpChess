'use strict';

// Controller tests use synthetic stage completions, never engines or scored games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { STAGES, MANIFEST, LOCK, parseArgs, buildPlan, validateManifest, inspectStage, main } = require('../scripts/version17-campaign');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const quiet = () => {};
function temporary(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-campaign-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function returned(experiment, { stopped = false, finalized } = {}) {
  const games = loadExperiment(experiment).metadata.scheduledGames;
  return { stopped, report: { experiment, scheduledGames: games, progress: { finalizedGames: finalized ?? games } } };
}
const experimentOf = args => args[args.indexOf('--experiment') + 1];
const directoryOf = args => args[args.includes('--resume') ? args.indexOf('--resume') + 1 : args.indexOf('--out') + 1];

test('campaign arguments freeze jobs and do not allow implicit or mixed modes', () => {
  assert.deepEqual(parseArgs(['--out', 'x']), { out: 'x', jobs: 4 });
  assert.deepEqual(parseArgs(['--out', 'x', '--jobs', '2']), { out: 'x', jobs: 2 });
  assert.deepEqual(parseArgs(['--resume', 'x']), { resume: 'x' });
  for (const args of [[], ['--jobs', '4'], ['--out', 'x', '--resume', 'y'], ['--resume', 'x', '--jobs', '4'], ['--out', 'x', '--jobs', '0'], ['--out', 'x', '--jobs', '17'], ['--out', 'x', '--out', 'y'], ['--unknown', 'x'], ['--out']]) assert.throws(() => parseArgs(args));
});

test('fixed queue declares only five stages and pins every config, schedule, profile and valuation', () => {
  const plan = buildPlan(4);
  assert.equal(plan.games, 6752);
  assert.deepEqual(plan.stages.map(stage => stage.experiment), STAGES);
  assert.deepEqual(plan.stages.map(stage => stage.games), [1152, 864, 1440, 1248, 2048]);
  for (const stage of plan.stages) for (const field of ['configSha256', 'scheduleSha256', 'profileHash', 'registryHash']) assert.match(stage[field], /^[a-f0-9]{64}$/);
  const manifest = { ...plan, planSha256: createHash('sha256').update(JSON.stringify(plan)).digest('hex'), runId: 'synthetic-queue', createdAt: '2026-11-01T00:00:00Z' };
  assert.strictEqual(validateManifest(manifest), manifest);
  for (const mutate of [value => { value.jobs = 3; }, value => { value.stages.reverse(); }, value => { value.stages[0].profileHash = '0'.repeat(64); }, value => { value.stages[0].valuation.sha256 = '1'.repeat(64); }, value => { value.stages.pop(); }, value => { value.extra = true; }]) {
    const changed = structuredClone(manifest); mutate(changed); assert.throws(() => validateManifest(changed), /changed/);
  }
});

test('new queue launches exactly one stage at a time with its frozen worker count', async t => {
  const directory = temporary(t), calls = [];
  const result = await main(['--out', directory, '--jobs', '3'], { log: quiet, signals: new EventEmitter(),
    runStage: async args => { const experiment = experimentOf(args); calls.push(experiment); assert.deepEqual(args.slice(-2), ['--jobs', '3']); return returned(experiment); } });
  assert.equal(result.stopped, false);
  assert.deepEqual(calls, STAGES);
  assert.deepEqual(result.completed, STAGES);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, MANIFEST))).jobs, 3);
  assert.equal(fs.existsSync(path.join(directory, LOCK)), false);
});

test('all stage stop controls halt the queue even if its final game just finished', async t => {
  for (const stopKind of ['now', 'game', 'pair']) {
    const directory = path.join(temporary(t), stopKind), calls = [];
    const result = await main(['--out', directory], { log: quiet, signals: new EventEmitter(), runStage: async args => {
      calls.push(experimentOf(args)); return { ...returned(experimentOf(args), { stopped: true }), stopKind };
    } });
    assert.equal(result.stopped, true);
    assert.deepEqual(calls, [STAGES[0]]);
    assert.deepEqual(result.completed, []);
    assert.equal(fs.existsSync(path.join(directory, LOCK)), false);
  }
});

test('an explicit last-game stop prevents continuation even when every scheduled game finalized', async t => {
  for (const stopRequested of ['now', 'game', 'pair']) {
    const directory = path.join(temporary(t), stopRequested); let calls = 0;
    const result = await main(['--out', directory], { log: quiet, signals: new EventEmitter(), runStage: async args => {
      calls++; return { ...returned(experimentOf(args)), stopped: false, stopRequested };
    } });
    assert.equal(result.stopped, true); assert.equal(calls, 1);
    assert.deepEqual(result.completed, []);
    assert.equal(fs.existsSync(path.join(directory, LOCK)), false);
  }
});

test('incomplete stage reports stop the queue even without an explicit stopped flag', async t => {
  let calls = 0;
  const result = await main(['--out', temporary(t)], { log: quiet, signals: new EventEmitter(), runStage: async args => { calls++; return returned(experimentOf(args), { finalized: 1 }); } });
  assert.equal(result.stopped, true); assert.equal(calls, 1);
});

test('stage failures release the lease and never start later games', async t => {
  const directory = temporary(t); let calls = 0;
  await assert.rejects(main(['--out', directory], { log: quiet, signals: new EventEmitter(), runStage: async () => { calls++; throw new Error('synthetic native failure'); } }), /synthetic native failure/);
  assert.equal(calls, 1); assert.equal(fs.existsSync(path.join(directory, LOCK)), false);
  assert.ok(fs.existsSync(path.join(directory, MANIFEST)));
});

test('Ctrl+C requests remain active between stages and are removed after the controller stops', async t => {
  const signals = new EventEmitter(); let calls = 0;
  const result = await main(['--out', temporary(t)], { log: quiet, signals, runStage: async args => {
    calls++; signals.emit('SIGINT'); return returned(experimentOf(args));
  } });
  assert.equal(result.stopped, true); assert.equal(calls, 1);
  assert.equal(signals.listenerCount('SIGINT'), 0); assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('resume skips validated completed stages and resumes partial stages without changing jobs', async t => {
  const directory = temporary(t), signals = new EventEmitter();
  await main(['--out', directory, '--jobs', '2'], { log: quiet, signals, runStage: async args => {
    const stage = directoryOf(args); fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, 'run.json'), 'synthetic fixture only');
    return returned(experimentOf(args), { stopped: true, finalized: 2 });
  } });
  const before = fs.readFileSync(path.join(directory, MANIFEST)), calls = [], inspections = [];
  fs.mkdirSync(path.join(directory, STAGES[1]));
  const result = await main(['--resume', directory], { log: quiet, signals,
    inspect: (stage, declaration, jobs) => { inspections.push(declaration.experiment); assert.equal(jobs, 2);
      return { mode: declaration.experiment === STAGES[0] ? 'complete' : declaration.experiment === STAGES[1] ? 'resume' : 'new' }; },
    runStage: async args => { calls.push(args); return returned(experimentOf(args), { stopped: true, finalized: 1 }); },
  });
  assert.deepEqual(inspections, STAGES);
  assert.equal(calls.length, 1); assert.equal(experimentOf(calls[0]), STAGES[1]); assert.ok(calls[0].includes('--resume')); assert.ok(!calls[0].includes('--jobs'));
  assert.deepEqual(result.completed, [STAGES[0]]);
  assert.deepEqual(fs.readFileSync(path.join(directory, MANIFEST)), before);
});

test('foreign or changed queue output is rejected before invoking a stage', async t => {
  const root = temporary(t), foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'notes.txt'), 'preserve');
  const dependencies = { log: quiet, signals: new EventEmitter(), runStage: () => assert.fail('no stage may start') };
  await assert.rejects(main(['--out', foreign], dependencies), /empty directory/);
  assert.equal(fs.readFileSync(path.join(foreign, 'notes.txt'), 'utf8'), 'preserve');
  const own = path.join(root, 'own');
  await main(['--out', own], { ...dependencies, runStage: async args => returned(experimentOf(args), { stopped: true, finalized: 0 }) });
  const file = path.join(own, MANIFEST), value = JSON.parse(fs.readFileSync(file)); value.stages[0].profileHash = '9'.repeat(64); fs.writeFileSync(file, JSON.stringify(value));
  await assert.rejects(main(['--resume', own], dependencies), /plan changed/);
  assert.equal(fs.existsSync(path.join(own, LOCK)), false);
});

test('all existing stage directories are checked before any new stage starts', async t => {
  const directory = temporary(t);
  await main(['--out', directory], { log: quiet, signals: new EventEmitter(), runStage: async args => returned(experimentOf(args), { stopped: true, finalized: 0 }) });
  fs.mkdirSync(path.join(directory, STAGES[4])); fs.writeFileSync(path.join(directory, STAGES[4], 'foreign.txt'), 'preserve');
  await assert.rejects(main(['--resume', directory], { log: quiet, signals: new EventEmitter(), runStage: () => assert.fail('foreign later stage must prevent earlier launch') }), /foreign stage/);
});

test('completed-stage skipping requires the strict input reader and matching workers', t => {
  const directory = temporary(t), declaration = loadExperiment(STAGES[0]); fs.writeFileSync(path.join(directory, 'run.json'), '{}');
  assert.throws(() => inspectStage(directory, declaration, 4), /does not match/);
  let reads = 0, summaries = 0;
  const state = inspectStage(directory, declaration, 4, {
    read: () => { reads++; return { manifest: { parallel: { jobs: 4 } }, records: [] }; },
    summarize: () => { summaries++; return returned(STAGES[0]).report; },
  });
  assert.equal(state.mode, 'complete'); assert.equal(reads, 1); assert.equal(summaries, 1);
  assert.throws(() => inspectStage(directory, declaration, 4, { read: () => ({ manifest: { parallel: { jobs: 3 } } }), summarize: () => assert.fail('worker mismatch must precede summary') }), /worker count/);
  fs.writeFileSync(path.join(directory, 'run.lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => inspectStage(directory, declaration, 4), /still active/);
});

test('the parent lease prevents a second controller and is released after stop', async t => {
  const directory = temporary(t); let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), waiting = new Promise(resolve => { release = resolve; });
  const first = main(['--out', directory], { log: quiet, signals: new EventEmitter(), runStage: async args => { entered(); await waiting; return returned(experimentOf(args), { stopped: true, finalized: 0 }); } });
  await started;
  await assert.rejects(main(['--resume', directory], { log: quiet, signals: new EventEmitter(), runStage: () => assert.fail('second controller must not run') }), /locked/);
  release(); await first;
  assert.equal(fs.existsSync(path.join(directory, LOCK)), false);
});

test('invalid stage completion cannot launch the next stage', async t => {
  let calls = 0;
  await assert.rejects(main(['--out', temporary(t)], { log: quiet, signals: new EventEmitter(), runStage: async () => { calls++; return { report: { experiment: STAGES[4] } }; } }), /expected verified report/);
  assert.equal(calls, 1);
});
