'use strict';

// Synthetic orchestration only. No engine is executed or research game played.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const command = require('../scripts/nightrider-balance');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const ROOT = path.resolve(__dirname, '..');
const overlay = ensureResearchOverlay({ root: ROOT });
const isolated = require(overlay.entry);
function temporary(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-nightrider-command-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function setup(t, overrides = {}) {
  const root = temporary(t), enginePath = path.join(root, 'fixture-engine.bin'); fs.writeFileSync(enginePath, 'not an executable');
  const out = path.join(root, 'study'); fs.mkdirSync(out);
  const states = new Map(), calls = [], signals = new EventEmitter();
  const dependencies = { enginePath, overlaySha256: overlay.manifestSha256, signals, log() {},
    check: async () => ({}), persist() {},
    inspect: (_, manifest) => manifest.stages.map(stage => ({ ...stage, state: { mode: states.get(stage.directory) || 'new' } })),
    report: () => ({ report: {}, files: { markdown: 'synthetic.md' } }),
    run: async args => { const directory = args[args.indexOf(args.includes('--resume') ? '--resume' : '--out') + 1];
      calls.push(args); states.set(path.basename(directory), 'complete'); return {}; }, ...overrides };
  return { root, out, enginePath, states, calls, signals, dependencies };
}
test('focus arguments reject ambiguous modes and options that would be ignored', () => {
  assert.deepEqual(command.parseArgs(['--out', 'x']), { out: 'x', jobs: 4 });
  assert.deepEqual(command.parseArgs(['--check', '--rules-only']), { check: true, 'rules-only': true });
  for (const args of [[], ['--out'], ['--out', 'x', '--resume', 'y'], ['--resume', 'x', '--jobs', '2'], ['--out', 'x', '--jobs', '17'], ['--check', '--log', 'plies'], ['--report', 'x', '--engine', 'y'], ['--out', 'x', '--rules-only'], ['--out', 'x', '--log', 'quiet'], ['--check', '--check']]) assert.throws(() => command.parseArgs(args));
});
test('three budgets run sequentially and resume skips every verified completion', async t => {
  const fixture = setup(t);
  const first = await isolated.runStudy(['--out', fixture.out, '--jobs', '3'], fixture.dependencies);
  const original = fs.readFileSync(path.join(fixture.out, command.MANIFEST));
  assert.equal(first.stopped, false); assert.equal(fixture.calls.length, 3);
  assert.deepEqual(fixture.calls.map(args => path.basename(args[args.indexOf('--out') + 1])), ['n20000', 'n40000', 'n80000']);
  assert.ok(fixture.calls.every(args => args[args.indexOf('--jobs') + 1] === '3'));
  await isolated.runStudy(['--resume', fixture.out], fixture.dependencies);
  assert.equal(fixture.calls.length, 3); assert.deepEqual(fs.readFileSync(path.join(fixture.out, command.MANIFEST)), original);
  assert.equal(fixture.signals.listenerCount('SIGINT'), 0);
});
test('q/g/p and final-game stop flags pause all later budgets', async t => {
  for (const action of ['now', 'game', 'pair']) {
    const fixture = setup(t);
    fixture.dependencies.run = async args => { fixture.calls.push(args); fixture.states.set('n20000', 'complete'); return { stopRequested: action }; };
    assert.equal((await isolated.runStudy(['--out', fixture.out], fixture.dependencies)).stopped, true);
    assert.equal(fixture.calls.length, 1);
  }
});
test('an unfinished stage resumes in place before the next budget', async t => {
  const fixture = setup(t);
  fixture.dependencies.run = async args => { fixture.calls.push(args); fixture.states.set('n20000', 'resume'); return { stopped: true }; };
  await isolated.runStudy(['--out', fixture.out], fixture.dependencies);
  fixture.dependencies.run = async args => { fixture.calls.push(args); const directory = args[args.indexOf(args.includes('--resume') ? '--resume' : '--out') + 1]; fixture.states.set(path.basename(directory), 'complete'); return {}; };
  await isolated.runStudy(['--resume', fixture.out], fixture.dependencies);
  assert.equal(fixture.calls.length, 4); assert.ok(fixture.calls[1].includes('--resume'));
  assert.equal(path.basename(fixture.calls[1][1]), 'n20000');
});
test('foreign later configs fail before any additional match starts', async t => {
  const fixture = setup(t);
  fixture.dependencies.run = async args => { fixture.calls.push(args); return { stopped: true }; };
  await isolated.runStudy(['--out', fixture.out], fixture.dependencies);
  fs.writeFileSync(path.join(fixture.out, 'configs/n80000.json'), '{}');
  await assert.rejects(isolated.runStudy(['--resume', fixture.out], fixture.dependencies), /config.*foreign or changed/);
  assert.equal(fixture.calls.length, 1);
});
test('offline reports validate source runtime before replacing any output', async t => {
  const fixture = setup(t);
  await isolated.runStudy(['--out', fixture.out], fixture.dependencies);
  fixture.dependencies.inspect = (_, manifest) => manifest.stages.map(stage => ({ ...stage,
    state: { mode: 'complete', manifest: { ...manifest.identity, engineSha256: '0'.repeat(64) } } }));
  fixture.dependencies.report = () => { throw new Error('must not overwrite a report first'); };
  await assert.rejects(isolated.runStudy(['--report', fixture.out], fixture.dependencies), /stage changed the focused runtime/);
});
test('preflight failures and SIGINT never start later games or retain signal handlers', async t => {
  const fixture = setup(t);
  fixture.dependencies.check = async () => { throw new Error('synthetic value failure'); };
  await assert.rejects(isolated.runStudy(['--out', fixture.out], fixture.dependencies), /synthetic value failure/);
  assert.equal(fixture.calls.length, 0); assert.equal(fixture.signals.listenerCount('SIGINT'), 0);
  fixture.dependencies.check = async () => { fixture.signals.emit('SIGINT'); return {}; };
  assert.equal((await isolated.runStudy(['--resume', fixture.out], fixture.dependencies)).stopped, true);
  assert.equal(fixture.calls.length, 0);
});
test('outer ownership persists the snapshot and resumes without consulting changed project sources', async t => {
  const fixture = setup(t), calls = [];
  const execute = async (args, options) => { calls.push({ args, options }); return { stopped: true }; };
  await command.main(['--out', fixture.out, '--jobs', '3', '--engine', fixture.enginePath], { execute, log() {} });
  const owner = JSON.parse(fs.readFileSync(path.join(fixture.out, command.OWNER)));
  assert.equal(owner.jobs, 3); assert.match(owner.directory, /^runtime\//);
  await command.main(['--resume', fixture.out, '--engine', fixture.enginePath], { sourceRoot: '/not-used-for-resume', ensure() { throw new Error('must use stored snapshot'); }, execute, log() {} });
  assert.equal(calls.length, 2); assert.equal(calls[1].options.initialJobs, 3);
  assert.equal(calls[1].options.overlaySha256, calls[0].options.overlaySha256);
  assert.equal(fs.existsSync(path.join(fixture.out, command.LOCK)), false);
});
test('interrupted initial snapshot creation recovers its recorded jobs and releases the lease', async t => {
  const fixture = setup(t);
  await assert.rejects(command.main(['--out', fixture.out, '--jobs', '2', '--engine', fixture.enginePath], {
    ensure() { throw new Error('synthetic setup cut'); }, execute() { throw new Error('no study yet'); }, log() {},
  }), /synthetic setup cut/);
  assert.equal(fs.existsSync(path.join(fixture.out, command.LOCK)), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.out, command.OWNER))).directory, null);
  let jobs;
  await command.main(['--resume', fixture.out, '--engine', fixture.enginePath], { log() {}, execute: async (_, options) => { jobs = options.initialJobs; return {}; } });
  assert.equal(jobs, 2);
});
