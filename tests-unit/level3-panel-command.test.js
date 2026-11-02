'use strict';

// Controller fixtures never start engines or generate scientific outcomes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const command = require('../scripts/level3-panel');
const planTools = require('../scripts/balance/level3-panel-plan');
const { createPanelReport } = require('../scripts/balance/level3-panel-report');
const { getRunIdentity } = require('../scripts/balance/run');
const sha = value => createHash('sha256').update(value).digest('hex');
const base = planTools.buildCampaignPlan();
const build = ({ jobs }) => ({ ...base, jobs });
const fixtureIdentity = () => ({ engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64), runnerSha256: 'c'.repeat(64) });
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-l3-panel-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function setup(overrides = {}) {
  const states = new Map(), calls = [], fits = [], signals = new EventEmitter();
  const dependencies = { build, identity: fixtureIdentity, enginePath: 'synthetic-not-executable', signals, log() {},
    inspect: (_, stage) => ({ mode: states.get(stage.id) || 'new' }),
    launch: async (_, stage) => { calls.push(stage); states.set(stage.id, 'complete'); return { stopped: false }; },
    update: (_, manifest, target) => ({ stages: [], report: createPanelReport({ manifest: { ...manifest, targetOpenings: target }, roster: manifest.roster }), files: { markdown: 'fixture-report.md' } }),
    fit: async (_, manifest, sources, options) => { fits.push({ sources, options }); return { report: { format: 'levelup-level3-panel-material-report', runId: manifest.runId, roster: [], nodes: [] }, files: { markdown: 'fixture-material.md' } }; },
    ...overrides };
  return { states, calls, fits, signals, dependencies };
}

test('panel CLI accepts cumulative targets and rejects incompatible flags', () => {
  assert.deepEqual(command.parseArgs(['--out', 'x']), { out: 'x', jobs: 4, openings: 8 });
  assert.deepEqual(command.parseArgs(['--resume', 'x', '--openings', '16']), { resume: 'x', openings: 16 });
  assert.deepEqual(command.parseArgs(['--material', 'x', '--bootstrap', '0']), { material: 'x', bootstrap: 0 });
  assert.deepEqual(command.parseArgs(['--check', '--rules-only']), { check: true, 'rules-only': true, openings: 8 });
  for (const args of [[], ['--out'], ['--out', 'x', '--resume', 'y'], ['--resume', 'x', '--jobs', '4'], ['--out', 'x', '--openings', '24'], ['--out', 'x', '--jobs', '17'], ['--report', 'x', '--rules-only'], ['--report', 'x', '--engine', 'y'], ['--out', 'x', '--bootstrap', '0'], ['--material', 'x', '--bootstrap', '-1'], ['--material', 'x', '--bootstrap', '2001'], ['--out', 'x', '--log', 'silent'], ['--check', '--check']]) assert.throws(() => command.parseArgs(args));
});

test('panel manifest freezes all64 cases while the requested target remains outside its identity', () => {
  const plan = build({ jobs: 4 }), manifest = { ...plan, planSha256: sha(JSON.stringify(plan)), runId: 'fixture', createdAt: '2026-11-02', initialOpenings: 8, runtimeIdentity: fixtureIdentity() };
  assert.strictEqual(command.validateManifest(manifest, build), manifest);
  for (const change of [row => { row.games++; }, row => { row.stages = row.stages.slice(1); }, row => { row.book = {}; }, row => { row.extra = true; }]) {
    const changed = structuredClone(manifest); change(changed); assert.throws(() => command.validateManifest(changed, build), /changed/);
  }
});

test('8→16→32→64 continuation adds only new stages and retains the original manifest', async t => {
  const root = temporary(t), fixture = setup();
  const original = await command.main(['--out', root, '--openings', '8', '--jobs', '3'], fixture.dependencies);
  const bytes = fs.readFileSync(path.join(root, command.MANIFEST));
  assert.equal(original.stopped, false); assert.equal(fixture.calls.length, 3);
  for (const [target, expected] of [[16, 6], [32, 12], [64, 24]]) {
    await command.main(['--resume', root, '--openings', String(target)], fixture.dependencies);
    assert.equal(fixture.calls.length, expected); assert.deepEqual(fs.readFileSync(path.join(root, command.MANIFEST)), bytes);
  }
  assert.equal(new Set(fixture.calls.map(row => row.id)).size, 24);
  assert.equal(fixture.fits.length, 4); assert.equal(fs.existsSync(path.join(root, command.LOCK)), false);
  assert.equal(fixture.signals.listenerCount('SIGINT'), 0);
});

test('q/g/p and explicit last-game stops prevent the next stage even when the current stage finalized', async t => {
  for (const action of ['now', 'game', 'pair']) {
    const root = temporary(t), fixture = setup();
    fixture.dependencies.launch = async (_, stage) => { fixture.calls.push(stage); fixture.states.set(stage.id, 'complete'); return { stopped: true, stopKind: action }; };
    const result = await command.main(['--out', root], fixture.dependencies);
    assert.equal(result.stopped, true); assert.equal(fixture.calls.length, 1); assert.equal(fixture.fits.length, 0);
    assert.equal(fs.existsSync(path.join(root, command.LOCK)), false);
  }
});

test('a partial stage resumes before any new batch, preserving the previous total by default', async t => {
  const root = temporary(t), fixture = setup();
  fixture.dependencies.launch = async (_, stage) => { fixture.calls.push(stage); fixture.states.set(stage.id, 'resume'); return { stopped: true }; };
  await command.main(['--out', root], fixture.dependencies);
  const first = fixture.calls[0].id;
  fixture.dependencies.launch = async (_, stage) => { fixture.calls.push(stage); fixture.states.set(stage.id, 'complete'); return {}; };
  await command.main(['--resume', root], fixture.dependencies);
  assert.deepEqual(fixture.calls.map(row => row.id), [first, first, base.stages[1].id, base.stages[2].id]);
});

test('a changed runtime, smaller target or foreign later output refuses before any additional games', async t => {
  const root = temporary(t), fixture = setup();
  await command.main(['--out', root], fixture.dependencies);
  const before = fixture.calls.length;
  await assert.rejects(command.main(['--resume', root], { ...fixture.dependencies, identity: () => ({ ...fixtureIdentity(), engineSha256: 'd'.repeat(64) }) }), /changed/);
  await command.main(['--resume', root, '--openings', '16'], fixture.dependencies);
  await assert.rejects(command.main(['--resume', root, '--openings', '8'], fixture.dependencies), /shrink/);
  assert.equal(fixture.calls.length, before + 3);
  fs.writeFileSync(path.join(root, 'unrelated.json'), '{}');
  await assert.rejects(command.main(['--resume', root, '--openings', '32'], fixture.dependencies), /Foreign/);
  assert.equal(fixture.calls.length, before + 3);
});

test('SIGINT and launch errors release the campaign lock and do not fit or launch later stages', async t => {
  for (const failure of [false, true]) {
    const root = temporary(t), fixture = setup();
    fixture.dependencies.launch = async (_, stage) => {
      fixture.calls.push(stage);
      if (failure) throw new Error('synthetic stage failure');
      fixture.signals.emit('SIGINT'); return {};
    };
    if (failure) await assert.rejects(command.main(['--out', root], fixture.dependencies), /synthetic stage failure/);
    else assert.equal((await command.main(['--out', root], fixture.dependencies)).stopped, true);
    assert.equal(fixture.calls.length, 1); assert.equal(fixture.fits.length, 0);
    assert.equal(fs.existsSync(path.join(root, command.LOCK)), false); assert.equal(fixture.signals.listenerCount('SIGINT'), 0);
  }
});

test('offline report and material modes never resolve an engine or launch games', async t => {
  const root = temporary(t), fixture = setup();
  await command.main(['--out', root], fixture.dependencies);
  const calls = fixture.calls.length;
  const dependencies = { ...fixture.dependencies, identity: () => { throw new Error('must remain offline'); } };
  await command.main(['--report', root], dependencies);
  await command.main(['--material', root, '--bootstrap', '0'], dependencies);
  assert.equal(fixture.calls.length, calls); assert.equal(fixture.fits.at(-1).options.bootstrap, 0);
});

test('resume tolerates owned interrupted atomic files and restores a missing initial target state', async t => {
  const root = temporary(t), fixture = setup();
  await command.main(['--out', root], fixture.dependencies);
  fs.unlinkSync(path.join(root, command.STATE));
  const temp = '.level3-panel-panel-state.json.00000000-0000-0000-0000-000000000000.tmp';
  fs.writeFileSync(path.join(root, temp), '{partial');
  fs.mkdirSync(path.join(root, 'configs'));
  fs.writeFileSync(path.join(root, 'configs', temp), '{partial');
  await command.main(['--resume', root], fixture.dependencies);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, command.STATE))).targetOpenings, 8);
  assert.equal(fixture.calls.length, 3);
  assert.equal(fs.readFileSync(path.join(root, temp), 'utf8'), '{partial');
});

test('rules-only preflight checks all requested stages without creating output or starting engines', async () => {
  const fixture = setup(), checked = [];
  await command.main(['--check', '--rules-only', '--openings', '16'], { ...fixture.dependencies, check: async (declaration, options) => {
    checked.push(declaration); assert.equal(options.enginePath, undefined);
  } });
  assert.equal(checked.length, 6); assert.equal(fixture.calls.length, 0);
});

test('controller source inventory is portable and the active mixed runner/bundle remain untouched', () => {
  assert.ok(command.controllerSources().length >= 10);
  for (const source of command.controllerSources()) assert.match(source.sha256, /^[a-f0-9]{64}$/);
  const saved = path.resolve(__dirname, '../node_modules/.cache/v17-panel-base-identity.json');
  const native = path.resolve(__dirname, '../node_modules/.cache/levelup-native-values/stockfish');
  if (fs.existsSync(saved) && fs.existsSync(native)) assert.deepEqual(getRunIdentity(native), JSON.parse(fs.readFileSync(saved)));
});
