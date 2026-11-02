'use strict';

// Orchestration fixtures only: these tests never execute an engine or play a
// research game. The synthetic engine file is deliberately not executable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const command = require('../scripts/targeted-followups');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');

const ROOT = path.resolve(__dirname, '..');
const overlay = ensureResearchOverlay({ ...command.OVERLAY, root: ROOT });
const isolated = require(overlay.entry);

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-targeted-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function setup(t, study = 'nightrider') {
  const root = temporary(t), enginePath = path.join(root, 'fixture-engine.bin');
  fs.writeFileSync(enginePath, 'not an executable');
  const out = path.join(root, 'study'); fs.mkdirSync(out);
  const states = new Map(), calls = [], checks = [], signals = new EventEmitter();
  const dependencies = {
    enginePath, overlaySha256: overlay.manifestSha256, signals, log() {},
    check: async declaration => { checks.push(declaration); return {}; }, persist() {},
    inspect: (_, manifest) => manifest.stages.map(stage => ({ ...stage, state: { mode: states.get(stage.directory) || 'new' } })),
    report: () => ({ report: {}, files: { markdown: 'synthetic.md' } }),
    run: async args => {
      const mode = args.includes('--resume') ? '--resume' : '--out';
      const directory = args[args.indexOf(mode) + 1];
      calls.push(args); states.set(path.basename(directory), 'complete'); return {};
    },
  };
  return { root, out, enginePath, study, states, calls, checks, signals, dependencies,
    args: (...args) => ['--study', study, ...args] };
}

test('selectors, modes and ignored options are validated before starting any study', () => {
  assert.deepEqual(command.parseArgs(['--study', 'knight-pawn', '--out', 'x']), { study: 'knight-pawn', out: 'x', jobs: 4 });
  assert.deepEqual(command.parseArgs(['--study', 'cataphract', '--check', '--rules-only']), { study: 'cataphract', check: true, 'rules-only': true });
  assert.deepEqual(command.parseArgs(['--study', 'nightrider', '--help']), { help: true });
  assert.deepEqual(command.parseArgs(['--help']), { help: true });
  const invalid = [[], ['--out', 'x'], ['--study', 'other', '--out', 'x'], ['--study', '__proto__', '--out', 'x'],
    ['--study', 'nightrider', '--out'], ['--study', 'nightrider', '--out', 'x', '--resume', 'y'],
    ['--study', 'nightrider', '--resume', 'x', '--jobs', '2'], ['--study', 'nightrider', '--out', 'x', '--jobs', '17'],
    ['--study', 'nightrider', '--check', '--log', 'plies'], ['--study', 'nightrider', '--report', 'x', '--engine', 'y'],
    ['--study', 'nightrider', '--out', 'x', '--rules-only'], ['--study', 'nightrider', '--out', 'x', '--log', 'quiet'],
    ['--study', 'nightrider', '--check', '--check'], ['--study', 'nightrider', '--out', 'x', '--study', 'cataphract']];
  for (const args of invalid) assert.throws(() => command.parseArgs(args));
});

test('all three study selectors retain fixed caps, run budgets sequentially and skip verified completion on resume', async t => {
  for (const [study, games, budgets] of [['knight-pawn', 2304, ['n20000']], ['nightrider', 512, ['n40000', 'n80000']], ['cataphract', 512, ['n40000', 'n80000']]]) {
    const f = setup(t, study);
    const result = await isolated.runStudy(f.args('--out', f.out, '--jobs', '3'), f.dependencies);
    const original = fs.readFileSync(path.join(f.out, command.MANIFEST));
    const manifest = JSON.parse(original);
    assert.equal(result.stopped, false); assert.equal(manifest.study, study); assert.equal(manifest.games, games);
    assert.equal(manifest.stages.reduce((sum, row) => sum + row.games, 0), games);
    assert.deepEqual(f.calls.map(args => path.basename(args[args.indexOf('--out') + 1])), budgets);
    assert.ok(f.calls.every(args => args[args.indexOf('--jobs') + 1] === '3'));
    await isolated.runStudy(f.args('--resume', f.out), f.dependencies);
    assert.equal(f.calls.length, budgets.length); assert.deepEqual(fs.readFileSync(path.join(f.out, command.MANIFEST)), original);
    assert.equal(f.signals.listenerCount('SIGINT'), 0); assert.equal(f.signals.listenerCount('SIGTERM'), 0);
  }
});

test('q/g/p and final-game stop flags pause the entire remaining budget queue', async t => {
  for (const action of ['now', 'game', 'pair']) {
    const f = setup(t);
    f.dependencies.run = async args => { f.calls.push(args); f.states.set('n40000', 'complete'); return { stopRequested: action }; };
    assert.equal((await isolated.runStudy(f.args('--out', f.out), f.dependencies)).stopped, true);
    assert.equal(f.calls.length, 1);
  }
});

test('unfinished stages resume in place before the next budget instead of creating new games', async t => {
  const f = setup(t);
  f.dependencies.run = async args => { f.calls.push(args); f.states.set('n40000', 'resume'); return { stopped: true }; };
  await isolated.runStudy(f.args('--out', f.out), f.dependencies);
  f.dependencies.run = async args => {
    f.calls.push(args); const mode = args.includes('--resume') ? '--resume' : '--out';
    f.states.set(path.basename(args[args.indexOf(mode) + 1]), 'complete'); return {};
  };
  await isolated.runStudy(f.args('--resume', f.out), f.dependencies);
  assert.equal(f.calls.length, 3); assert.ok(f.calls[1].includes('--resume'));
  assert.equal(path.basename(f.calls[1][f.calls[1].indexOf('--resume') + 1]), 'n40000');
});

test('foreign later configuration and changed runtime identity fail before another game starts', async t => {
  const f = setup(t);
  f.dependencies.run = async args => { f.calls.push(args); return { stopped: true }; };
  await isolated.runStudy(f.args('--out', f.out), f.dependencies);
  fs.writeFileSync(path.join(f.out, 'configs/n80000.json'), '{}');
  await assert.rejects(isolated.runStudy(f.args('--resume', f.out), f.dependencies), /config.*foreign or changed/);
  fs.unlinkSync(path.join(f.out, 'configs/n80000.json'));
  fs.writeFileSync(f.enginePath, 'different synthetic engine bytes');
  await assert.rejects(isolated.runStudy(f.args('--resume', f.out), f.dependencies), /identity changed/);
  assert.equal(f.calls.length, 1);
});

test('offline reports need no engine and validate every stage identity before overwriting reports', async t => {
  const f = setup(t);
  await isolated.runStudy(f.args('--out', f.out), f.dependencies);
  let reports = 0;
  const offline = { ...f.dependencies, enginePath: undefined,
    run() { assert.fail('offline reporting must not run games'); },
    check() { assert.fail('offline reporting must not start preflight'); },
    report() { reports++; return { report: {}, files: { markdown: 'offline.md' } }; } };
  await isolated.runStudy(f.args('--report', f.out), offline);
  assert.equal(reports, 1);
  offline.inspect = (_, manifest) => manifest.stages.map(stage => ({ ...stage,
    state: { mode: 'complete', manifest: { ...manifest.identity, engineSha256: '0'.repeat(64) } } }));
  await assert.rejects(isolated.runStudy(f.args('--report', f.out), offline), /stage changed the targeted runtime/);
  assert.equal(reports, 1);
});

test('preflight failure and SIGINT never start another budget or retain signal handlers', async t => {
  const f = setup(t);
  f.dependencies.check = async () => { throw new Error('synthetic value failure'); };
  await assert.rejects(isolated.runStudy(f.args('--out', f.out), f.dependencies), /synthetic value failure/);
  assert.equal(f.calls.length, 0); assert.equal(f.signals.listenerCount('SIGINT'), 0);
  f.dependencies.check = async () => { f.signals.emit('SIGINT'); return {}; };
  assert.equal((await isolated.runStudy(f.args('--resume', f.out), f.dependencies)).stopped, true);
  assert.equal(f.calls.length, 0); assert.equal(f.signals.listenerCount('SIGINT'), 0);
});

test('rules-only checking validates each selected budget without starting a study directory', async t => {
  const f = setup(t, 'cataphract');
  const checks = [];
  await isolated.runStudy(f.args('--check', '--rules-only'), { ...f.dependencies,
    check: async (declaration, options) => { checks.push(declaration); assert.equal(options.enginePath, undefined); },
    run() { assert.fail('preflight starts no games'); } });
  assert.equal(checks.length, 2); assert.equal(fs.existsSync(path.join(f.out, command.MANIFEST)), false);
});

test('outer ownership resumes the stored snapshot independently of newer project sources', async t => {
  const f = setup(t, 'cataphract'), calls = [];
  const execute = async (args, options) => { calls.push({ args, options }); return { stopped: true }; };
  await command.main(f.args('--out', f.out, '--jobs', '3', '--engine', f.enginePath), { execute, log() {} });
  const owner = JSON.parse(fs.readFileSync(path.join(f.out, command.OWNER)));
  assert.equal(owner.study, 'cataphract'); assert.equal(owner.jobs, 3); assert.match(owner.directory, /^runtime\//);
  await command.main(f.args('--resume', f.out, '--engine', f.enginePath), {
    sourceRoot: '/not-used-on-resume', ensure() { assert.fail('resume must use its stored snapshot'); }, execute, log() {},
  });
  assert.equal(calls.length, 2); assert.equal(calls[1].options.initialJobs, 3);
  assert.equal(calls[1].options.overlaySha256, calls[0].options.overlaySha256);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});

test('a different study selector cannot reuse an owned result folder', async t => {
  const f = setup(t, 'cataphract');
  await command.main(f.args('--out', f.out, '--engine', f.enginePath), { execute: async () => ({}), log() {} });
  const owner = fs.readFileSync(path.join(f.out, command.OWNER));
  await assert.rejects(command.main(['--study', 'nightrider', '--resume', f.out, '--engine', f.enginePath], {
    execute() { assert.fail('wrong selector must not enter the stored study'); }, log() {},
  }), /Invalid targeted runtime ownership/);
  assert.deepEqual(fs.readFileSync(path.join(f.out, command.OWNER)), owner);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});

test('interrupted initial snapshot creation recovers its saved worker count and releases the lock', async t => {
  const f = setup(t, 'knight-pawn');
  await assert.rejects(command.main(f.args('--out', f.out, '--jobs', '2', '--engine', f.enginePath), {
    ensure() { throw new Error('synthetic setup cut'); }, execute() { assert.fail('no study exists yet'); }, log() {},
  }), /synthetic setup cut/);
  assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, command.OWNER))).directory, null);
  let jobs;
  await command.main(f.args('--resume', f.out, '--engine', f.enginePath), {
    log() {}, execute: async (_, options) => { jobs = options.initialJobs; return {}; },
  });
  assert.equal(jobs, 2); assert.equal(fs.existsSync(path.join(f.out, command.LOCK)), false);
});
