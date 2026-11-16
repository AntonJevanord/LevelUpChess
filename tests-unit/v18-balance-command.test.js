'use strict';

// Tiny orchestration fixtures only. No engine process or research game starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const command = require('../scripts/v18-balance');

const fakeIdentity = () => ({ engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64), runnerSha256: 'c'.repeat(64), runnerSources: [] });
const overlaySha256 = 'd'.repeat(64);
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v18-command-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
}
function planFixture() {
  const budgets = study => study === 'mobility' ? [40000, 80000] : [40000];
  const plan = {
    OPENING_TARGETS: command.TARGETS,
    getBatchDeclaration(study, batchIndex, nodes) {
      return { experiment: `${study}-b${batchIndex}-n${nodes}`, config: { study, batchIndex, nodes },
        metadata: { comparisons: [{ id: 'a-v-b', aLabel: 'Candidate', bLabel: 'Reference' }] } };
    },
    expectedGames(study, openings) { return openings / 8 * budgets(study).length * 4; },
    buildCampaignPlan({ study, jobs }) {
      assert.ok(command.STUDIES.includes(study));
      return { schemaVersion: 1, format: 'fixture-v18-screen', study, jobs,
        games: plan.expectedGames(study, 64),
        stages: Array.from({ length: 8 }, (_, batchIndex) => budgets(study).map(nodes => {
          const id = `batch-${String(batchIndex + 1).padStart(2, '0')}-n${nodes}`;
          return { id, directory: id, batchIndex, nodes, games: 4 };
        })).flat() };
    },
    selectedStages(openings, manifest) { return manifest.stages.filter(stage => stage.batchIndex < openings / 8); },
    reportStudy(manifest, sources) { return { format: 'fixture-v18-report', runId: manifest.runId,
      targetOpenings: manifest.targetOpenings, sourceIds: sources.map(source => source.id) }; },
    renderReport(report) { return `# Fixture report\n\n${report.sourceIds.join('\n')}\n`; },
  };
  return plan;
}
function setup(t, study = 'mobility') {
  const root = temporary(t), out = path.join(root, 'screen'); fs.mkdirSync(out);
  const states = new Map(), calls = [], checks = [], signals = new EventEmitter(), planTools = planFixture();
  const dependencies = {
    enginePath: path.join(root, 'not-executed.exe'), overlaySha256, signals, planTools, identity: fakeIdentity, log() {}, verifyOverlay() {},
    check: async declaration => { checks.push(declaration); return {}; }, persist() {},
    inspect: (_, manifest) => manifest.stages.map(stage => ({ ...stage,
      state: states.has(stage.id) ? { mode: states.get(stage.id), manifest: fakeIdentity(), records: [], source: {} } : { mode: 'new' } })),
    run: async (args, options) => {
      const mode = args.includes('--resume') ? '--resume' : '--out';
      const id = path.basename(args[args.indexOf(mode) + 1]);
      calls.push({ id, args, options }); states.set(id, 'complete'); return {};
    },
  };
  return { root, out, states, calls, checks, signals, planTools, dependencies, args: (...args) => ['--study', study, ...args] };
}

test('screen selectors and cumulative totals reject incompatible or ignored flags', () => {
  assert.deepEqual(command.parseArgs(['--study', 'level1', '--out', 'x']), { study: 'level1', out: 'x', jobs: 4, openings: 8 });
  assert.deepEqual(command.parseArgs(['--study', 'level2', '--resume', 'x', '--openings', '32']), { study: 'level2', resume: 'x', openings: 32 });
  assert.deepEqual(command.parseArgs(['--study', 'mobility', '--check', '--rules-only']), { study: 'mobility', check: true, 'rules-only': true, openings: 8 });
  assert.deepEqual(command.parseArgs(['--study', 'level1-followup', '--out', 'x']), { study: 'level1-followup', out: 'x', jobs: 4, openings: 8 });
  assert.deepEqual(command.parseArgs(['--study', 'level2-followup', '--resume', 'x']), { study: 'level2-followup', resume: 'x' });
  assert.deepEqual(command.parseArgs(['--study', 'level2-knights', '--out', 'x', '--openings', '16']), { study: 'level2-knights', out: 'x', jobs: 4, openings: 16 });
  for (const study of ['level1-queens', 'level2-completion']) {
    assert.deepEqual(command.parseArgs(['--study', study, '--out', 'x', '--openings', '16']), { study, out: 'x', jobs: 4, openings: 16 });
  }
  assert.deepEqual(command.parseArgs(['--study', 'level1', '--help']), { help: true });
  assert.deepEqual(command.parseArgs(['--help']), { help: true });
  for (const args of [[], ['--out', 'x'], ['--study', '__proto__', '--out', 'x'], ['--study', 'level1', '--out'],
    ['--study', 'level1', '--out', 'x', '--resume', 'y'], ['--study', 'level1', '--resume', 'x', '--jobs', '3'],
    ['--study', 'level1', '--out', 'x', '--jobs', '17'], ['--study', 'level1', '--out', 'x', '--openings', '24'],
    ['--study', 'level1', '--report', 'x', '--openings', '8'], ['--study', 'level1', '--report', 'x', '--engine', 'native'],
    ['--study', 'level1', '--check', '--log', 'plies'], ['--study', 'level1', '--check', '--rules-only', '--engine', 'native'],
    ['--study', 'level1', '--out', 'x', '--log', 'silent'], ['--study', 'level1', '--check', '--check']]) assert.throws(() => command.parseArgs(args));
});

test('follow-up selectors own separate resumable studies and cannot reuse an original screen folder', async t => {
  for (const study of ['level1-followup', 'level2-followup', 'level2-knights', 'level1-queens', 'level2-completion']) {
    const f = setup(t, study);
    await command.runStudy(f.args('--out', f.out), f.dependencies);
    assert.equal(f.calls.length, 1);
    await command.runStudy(f.args('--resume', f.out, '--openings', '16'), f.dependencies);
    assert.equal(f.calls.length, 2);
    const played = f.calls.length;
    await command.runStudy(f.args('--report', f.out), f.dependencies);
    assert.equal(f.calls.length, played);
    await assert.rejects(command.runStudy(['--study', study.split('-')[0], '--resume', f.out], f.dependencies), /different study/);
  }
});

test('8→16→32→64 adds only new stages while retaining the original manifest and per-target reports', async t => {
  const f = setup(t);
  await command.runStudy(f.args('--out', f.out, '--jobs', '3'), f.dependencies);
  const bytes = fs.readFileSync(path.join(f.out, command.MANIFEST));
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.stages.length, 16); assert.equal(manifest.jobs, 3); assert.equal(f.calls.length, 2);
  for (const [target, expected] of [[16, 4], [32, 8], [64, 16]]) {
    await command.runStudy(f.args('--resume', f.out, '--openings', String(target)), f.dependencies);
    assert.equal(f.calls.length, expected); assert.deepEqual(fs.readFileSync(path.join(f.out, command.MANIFEST)), bytes);
    const checkpoint = JSON.parse(fs.readFileSync(path.join(f.out, 'reports', `openings-${target}`, 'screen-report.json')));
    assert.equal(checkpoint.targetOpenings, target); assert.equal(checkpoint.sourceIds.length, expected);
  }
  assert.equal(new Set(f.calls.map(call => call.id)).size, 16);
  assert.ok(f.calls.every(call => call.args[call.args.indexOf('--jobs') + 1] === '3'));
  assert.deepEqual(f.calls[0].options.comparisonNames, { 'a-v-b': { a: 'Candidate', b: 'Reference' } });
  assert.equal(f.signals.listenerCount('SIGINT'), 0);
});

test('a larger initial target still saves exact first8 and first16 checkpoint reports', async t => {
  const f = setup(t, 'level1');
  await command.runStudy(f.args('--out', f.out, '--openings', '32'), f.dependencies);
  for (const target of [8, 16, 32]) {
    const checkpoint = JSON.parse(fs.readFileSync(path.join(f.out, 'reports', `openings-${target}`, 'screen-report.json')));
    assert.equal(checkpoint.targetOpenings, target);
    assert.equal(checkpoint.sourceIds.length, target / 8);
  }
  assert.equal(fs.existsSync(path.join(f.out, 'reports/openings-64')), false);
});

test('q/g/p stops pause the entire queue even after a stage finalizes', async t => {
  for (const action of ['now', 'game', 'pair']) {
    const f = setup(t);
    f.dependencies.run = async args => { f.calls.push(args); f.states.set('batch-01-n40000', 'complete'); return { stopRequested: action }; };
    assert.equal((await command.runStudy(f.args('--out', f.out), f.dependencies)).stopped, true);
    assert.equal(f.calls.length, 1); assert.equal(f.signals.listenerCount('SIGINT'), 0);
  }
});

test('an unfinished stage resumes in place before another budget or new batch', async t => {
  const f = setup(t);
  f.dependencies.run = async args => { f.calls.push({ args }); f.states.set('batch-01-n40000', 'resume'); return { stopped: true }; };
  await command.runStudy(f.args('--out', f.out), f.dependencies);
  f.dependencies.run = async args => {
    const mode = args.includes('--resume') ? '--resume' : '--out';
    const id = path.basename(args[args.indexOf(mode) + 1]); f.calls.push({ id, args }); f.states.set(id, 'complete'); return {};
  };
  await command.runStudy(f.args('--resume', f.out), f.dependencies);
  assert.equal(f.calls.length, 3); assert.ok(f.calls[1].args.includes('--resume'));
  assert.equal(f.calls[1].id, 'batch-01-n40000'); assert.equal(f.calls[2].id, 'batch-01-n80000');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, command.STATE))).targetOpenings, 8);
});

test('engine drift, config drift, smaller targets and foreign files fail before more games', async t => {
  const f = setup(t);
  await command.runStudy(f.args('--out', f.out), f.dependencies);
  const before = f.calls.length;
  await assert.rejects(command.runStudy(f.args('--resume', f.out), { ...f.dependencies,
    identity: () => ({ ...fakeIdentity(), engineSha256: 'e'.repeat(64) }) }), /identity changed/);
  fs.writeFileSync(path.join(f.out, 'configs/batch-02-n40000.json'), '{}');
  await assert.rejects(command.runStudy(f.args('--resume', f.out, '--openings', '16'), f.dependencies), /config is foreign or changed/);
  fs.unlinkSync(path.join(f.out, 'configs/batch-02-n40000.json'));
  await command.runStudy(f.args('--resume', f.out, '--openings', '16'), f.dependencies);
  await assert.rejects(command.runStudy(f.args('--resume', f.out, '--openings', '8'), f.dependencies), /cannot shrink/);
  fs.writeFileSync(path.join(f.out, 'unrelated.json'), '{}');
  await assert.rejects(command.runStudy(f.args('--resume', f.out, '--openings', '32'), f.dependencies), /Foreign/);
  assert.equal(f.calls.length, before + 2);
});

test('plan changes and stage identity mismatches cannot overwrite offline reports', async t => {
  const f = setup(t); await command.runStudy(f.args('--out', f.out), f.dependencies);
  const reportFile = path.join(f.out, 'screen-report.json'), bytes = fs.readFileSync(reportFile);
  const changedPlan = { ...f.planTools, buildCampaignPlan(options) { return { ...f.planTools.buildCampaignPlan(options), extra: true }; } };
  await assert.rejects(command.runStudy(f.args('--report', f.out), { ...f.dependencies, planTools: changedPlan }), /plan or runtime identity changed/);
  await assert.rejects(command.runStudy(f.args('--report', f.out), { ...f.dependencies,
    inspect: (_, manifest) => manifest.stages.map(stage => ({ ...stage, state: { mode: 'complete', manifest: { ...fakeIdentity(), engineSha256: '0'.repeat(64) } } })) }), /stage changed the screen runtime/);
  assert.deepEqual(fs.readFileSync(reportFile), bytes);
});

test('offline reporting resolves no engine and never calls preflight or game execution', async t => {
  const f = setup(t); await command.runStudy(f.args('--out', f.out), f.dependencies);
  const calls = f.calls.length;
  await command.runStudy(f.args('--report', f.out), { ...f.dependencies, enginePath: undefined,
    identity() { assert.fail('offline reports must not read an executable'); },
    check() { assert.fail('offline reports must not run preflight'); }, run() { assert.fail('offline reports must not start games'); } });
  assert.equal(f.calls.length, calls);
});

test('SIGINT, preflight errors and launch errors leave no handlers and never start another stage', async t => {
  for (const failure of ['signal', 'preflight', 'launch']) {
    const f = setup(t);
    if (failure === 'signal') f.dependencies.run = async args => { f.calls.push(args); f.signals.emit('SIGINT'); return {}; };
    if (failure === 'preflight') f.dependencies.check = async () => { throw new Error('synthetic preflight failure'); };
    if (failure === 'launch') f.dependencies.run = async args => { f.calls.push(args); throw new Error('synthetic launch failure'); };
    if (failure === 'signal') assert.equal((await command.runStudy(f.args('--out', f.out), f.dependencies)).stopped, true);
    else await assert.rejects(command.runStudy(f.args('--out', f.out), f.dependencies), /synthetic .* failure/);
    assert.equal(f.calls.length, failure === 'preflight' ? 0 : 1);
    assert.equal(f.signals.listenerCount('SIGINT'), 0); assert.equal(f.signals.listenerCount('SIGTERM'), 0);
  }
});

test('rules-only checking covers every selected stage with no study output or engine', async t => {
  const f = setup(t), checked = [];
  await command.runStudy(f.args('--check', '--rules-only', '--openings', '16'), { ...f.dependencies,
    check: async (declaration, options) => { checked.push(declaration); assert.equal(options.enginePath, undefined); } });
  assert.equal(checked.length, 4); assert.equal(f.calls.length, 0);
  assert.equal(fs.existsSync(path.join(f.out, command.MANIFEST)), false);
});

test('resuming a power cut between manifest and state recovers the exact initial target', async t => {
  const f = setup(t, 'level2'); await command.runStudy(f.args('--out', f.out, '--openings', '16'), f.dependencies);
  fs.unlinkSync(path.join(f.out, command.STATE));
  fs.writeFileSync(path.join(f.out, '.v18-screen-00000000-0000-0000-0000-000000000000.tmp'), '{partial');
  await command.runStudy(f.args('--resume', f.out), f.dependencies);
  assert.equal(f.calls.length, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, command.STATE))).targetOpenings, 16);
});

function outerFixture(t) {
  const root = temporary(t), out = path.join(root, 'screen'), engine = path.join(root, 'not-executed.exe');
  fs.writeFileSync(engine, 'not executable');
  const calls = [];
  const ensure = options => {
    const directory = path.join(options.cacheDirectory || path.join(root, 'cache'), 'reference-screens-v18-fixture');
    fs.mkdirSync(directory, { recursive: true }); return { directory, manifestSha256: overlaySha256 };
  };
  const open = options => ({ directory: options.directory, manifestSha256: options.manifestSha256 });
  const dependencies = { ensure, open, execute: async (args, options) => { calls.push({ args, options }); return {}; }, log() {} };
  return { root, out, engine, calls, dependencies };
}

test('outer ownership resumes its stored snapshot without consulting newer checkout sources', async t => {
  const f = outerFixture(t);
  await command.main(['--study', 'level1', '--out', f.out, '--jobs', '3', '--openings', '16', '--engine', f.engine], f.dependencies);
  const bytes = fs.readFileSync(path.join(f.out, command.OWNER));
  await command.main(['--study', 'level1', '--resume', f.out, '--engine', f.engine], { ...f.dependencies,
    sourceRoot: '/not-used', ensure() { assert.fail('resume must use the stored snapshot'); } });
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].options.initialJobs, 3); assert.equal(f.calls[1].options.initialOpenings, 16);
  assert.equal(f.calls[1].options.overlaySha256, f.calls[0].options.overlaySha256);
  assert.deepEqual(fs.readFileSync(path.join(f.out, command.OWNER)), bytes);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});

test('wrong study selectors cannot reuse an owned screen folder', async t => {
  const f = outerFixture(t);
  await command.main(['--study', 'level1', '--out', f.out, '--engine', f.engine], f.dependencies);
  await assert.rejects(command.main(['--study', 'level2', '--resume', f.out, '--engine', f.engine], f.dependencies), /Invalid screen runtime ownership/);
  assert.equal(f.calls.length, 1); assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});

test('an interrupted initial snapshot preserves workers and opening target for recovery', async t => {
  const f = outerFixture(t);
  await assert.rejects(command.main(['--study', 'mobility', '--out', f.out, '--jobs', '2', '--openings', '32', '--engine', f.engine], {
    ...f.dependencies, ensure() { throw new Error('synthetic snapshot cut'); } }), /snapshot cut/);
  const owner = JSON.parse(fs.readFileSync(path.join(f.out, command.OWNER)));
  assert.equal(owner.directory, null); assert.equal(owner.jobs, 2); assert.equal(owner.initialOpenings, 32);
  await command.main(['--study', 'mobility', '--resume', f.out, '--engine', f.engine], f.dependencies);
  assert.equal(f.calls[0].options.initialJobs, 2); assert.equal(f.calls[0].options.initialOpenings, 32);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});

test('the plan-specific preflight wrapper is used so new movement probes cannot be skipped', async t => {
  const f = setup(t), checked = [];
  const dependencies = { ...f.dependencies, check: undefined,
    planTools: { ...f.planTools, checkExperiment: async declaration => { checked.push(declaration); return {}; } } };
  await command.runStudy(f.args('--check', '--rules-only'), dependencies);
  assert.equal(checked.length, 2);
});

test('foreign checkpoint reports and linked config files are rejected before updating evidence', async t => {
  const f = setup(t, 'level1'); await command.runStudy(f.args('--out', f.out), f.dependencies);
  const reportFile = path.join(f.out, 'screen-report.json'), original = fs.readFileSync(reportFile);
  fs.writeFileSync(path.join(f.out, 'reports/openings-8/other.txt'), 'foreign');
  await assert.rejects(command.runStudy(f.args('--report', f.out), f.dependencies), /Foreign/);
  fs.unlinkSync(path.join(f.out, 'reports/openings-8/other.txt'));
  const config = path.join(f.out, 'configs/batch-01-n40000.json'), target = path.join(f.root, 'external.json');
  fs.copyFileSync(config, target); fs.unlinkSync(config); fs.symlinkSync(target, config);
  await assert.rejects(command.runStudy(f.args('--resume', f.out), f.dependencies), /config is foreign or changed/);
  assert.deepEqual(fs.readFileSync(reportFile), original);
});
