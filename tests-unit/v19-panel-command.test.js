'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const command = require('../scripts/v19-panels');
const identity = () => ({ engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64), runnerSha256: 'c'.repeat(64), runnerSources: [] });
const overlaySha256 = 'd'.repeat(64);
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const states = new Map(), calls = [], signals = new EventEmitter();
  const planTools = {
    getBatchDeclaration(study, batchIndex, nodes) { return { config: { study, batchIndex, nodes }, metadata: { comparisons: [{ id: 'a-v-b', aLabel: 'A', bLabel: 'B' }] } }; },
    expectedGames(study, openings) { return openings / 8 * 4; },
    buildCampaignPlan({ study, jobs }) { return { study, jobs, format: 'test-panel', stages: Array.from({ length: 8 }, (_, batchIndex) => ({ id: `batch-${batchIndex}`, directory: `batch-${batchIndex}`, batchIndex, nodes: 40000, games: 4 })) }; },
    selectedStages(openings, manifest) { return manifest.stages.filter(stage => stage.batchIndex < openings / 8); },
    reportStudy(manifest, sources) { return { runId: manifest.runId, format: 'test-report', targetOpenings: manifest.targetOpenings, sources: sources.map(source => source.id) }; },
    renderReport(report) { return JSON.stringify(report); },
  };
  const dependencies = { identity, overlaySha256, planTools, signals, log() {}, verifyOverlay() {}, enginePath: 'not-executed',
    check: async () => ({}), persist() {},
    inspect: (_, manifest) => manifest.stages.map(stage => ({ ...stage, state: states.has(stage.id) ? { mode: states.get(stage.id), manifest: identity(), records: [] } : { mode: 'new' } })),
    run: async args => { const mode = args.includes('--resume') ? '--resume' : '--out', id = path.basename(args[args.indexOf(mode) + 1]); calls.push({ id, args }); states.set(id, 'complete'); return {}; },
  };
  return { root, states, calls, dependencies, signals, args: (...args) => ['--tier', '1', ...args] };
}

test('CLI defaults to sixteen openings and rejects ignored, mixed or unsafe options', () => {
  assert.deepEqual(command.parseArgs(['--tier', '1', '--out', 'x']), { tier: 1, study: 'level1', out: 'x', jobs: 4, openings: 16 });
  assert.deepEqual(command.parseArgs(['--tier', '2', '--resume', 'x']), { tier: 2, study: 'level2', resume: 'x' });
  for (const args of [[], ['--tier', '4', '--check'], ['--tier', '1', '--report', 'x', '--engine', 'x'],
    ['--tier', '1', '--resume', 'x', '--jobs', '4'], ['--tier', '1', '--out', 'x', '--openings', '24'],
    ['--tier', '1', '--out', 'x', '--jobs', '17'], ['--tier', '1', '--check', '--rules-only', '--engine', 'x'],
    ['--tier', '1', '--out', 'x', '--resume', 'x']]) assert.throws(() => command.parseArgs(args));
});

test('16→32→64 appends only new batches, retains first-eight snapshots and preserves identity', async t => {
  const f = setup(t);
  await command.runStudy(f.args('--out', f.root), f.dependencies);
  const bytes = fs.readFileSync(path.join(f.root, command.MANIFEST));
  assert.equal(f.calls.length, 2);
  for (const target of [8, 16]) assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'reports', `openings-${target}`, 'panel-report.json'))).targetOpenings, target);
  for (const target of [32, 64]) {
    await command.runStudy(f.args('--resume', f.root, '--openings', String(target)), f.dependencies);
    assert.equal(f.calls.length, target / 8);
    assert.deepEqual(fs.readFileSync(path.join(f.root, command.MANIFEST)), bytes);
  }
  assert.equal(new Set(f.calls.map(call => call.id)).size, 8);
  const before = f.calls.length;
  await command.runStudy(f.args('--report', f.root), { ...f.dependencies, identity() { assert.fail('offline'); }, check() { assert.fail('offline'); }, run() { assert.fail('offline'); } });
  assert.equal(f.calls.length, before);
  await assert.rejects(command.runStudy(f.args('--resume', f.root, '--openings', '16'), f.dependencies), /cannot shrink/);
  assert.equal(f.signals.listenerCount('SIGINT'), 0);
});

test('a stop pauses the queue and resumes unfinished batches before advancing', async t => {
  const f = setup(t);
  f.dependencies.run = async args => { f.calls.push(args); f.states.set('batch-0', 'resume'); return { stopped: true }; };
  assert.equal((await command.runStudy(f.args('--out', f.root), f.dependencies)).stopped, true);
  assert.equal(f.calls.length, 1);
  f.dependencies.run = async args => { const mode = args.includes('--resume') ? '--resume' : '--out', id = path.basename(args[args.indexOf(mode) + 1]); f.calls.push(args); f.states.set(id, 'complete'); return {}; };
  await command.runStudy(f.args('--resume', f.root), f.dependencies);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls[1].includes('--resume'));
  for (const stopRequested of ['now', 'game', 'pair']) {
    const g = setup(t); g.dependencies.run = async () => { g.states.set('batch-0', 'complete'); return { stopRequested }; };
    assert.equal((await command.runStudy(g.args('--out', g.root), g.dependencies)).stopped, true);
    assert.equal(g.states.size, 1);
  }
});

test('engine changes, foreign output and altered declarations fail before new matches', async t => {
  const f = setup(t); await command.runStudy(f.args('--out', f.root), f.dependencies);
  const before = f.calls.length;
  await assert.rejects(command.runStudy(f.args('--resume', f.root, '--openings', '32'), { ...f.dependencies, identity: () => ({ ...identity(), engineSha256: 'e'.repeat(64) }) }), /identity changed/);
  const bytes = fs.readFileSync(path.join(f.root, 'panel-report.json'));
  const planTools = { ...f.dependencies.planTools, buildCampaignPlan(options) { return { ...f.dependencies.planTools.buildCampaignPlan(options), altered: true }; } };
  await assert.rejects(command.runStudy(f.args('--report', f.root), { ...f.dependencies, planTools }), /plan or runtime identity/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'panel-report.json')), bytes);
  fs.writeFileSync(path.join(f.root, 'foreign.txt'), 'keep');
  await assert.rejects(command.runStudy(f.args('--resume', f.root, '--openings', '32'), f.dependencies), /Foreign/);
  assert.equal(f.calls.length, before);
});

test('preflight failure and cancellation clean up handlers without advancing the queue', async t => {
  const f = setup(t); f.dependencies.check = async () => { throw Error('fixture preflight'); };
  await assert.rejects(command.runStudy(f.args('--out', f.root), f.dependencies), /fixture preflight/);
  assert.equal(f.calls.length, 0); assert.equal(f.signals.listenerCount('SIGINT'), 0);
  const g = setup(t); g.dependencies.run = async () => { g.signals.emit('SIGINT'); return {}; };
  assert.equal((await command.runStudy(g.args('--out', g.root), g.dependencies)).stopped, true);
  assert.equal(g.states.size, 0); assert.equal(g.signals.listenerCount('SIGTERM'), 0);
});
