'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const command = require('../scripts/v19-cross-level');
const { LEGACY_ENGINE_SHA256 } = require('../scripts/puzzles/native-parity');
const identity = () => ({ engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64), runnerSha256: 'c'.repeat(64), runnerSources: [] });
const overlaySha256 = 'd'.repeat(64);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-cross-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const states = new Map(), calls = [], inspections = [], reports = [], signals = new EventEmitter();
  const descriptors = Array.from({ length: 8 }, (_, batchIndex) => [
    { groupId: 'same-family', placement: 0 }, { groupId: 'same-family', placement: 1 }, { groupId: 'different-family', placement: 0 },
  ].map((row, index) => ({ ...row, id: `b${batchIndex}-s${index}`, directory: `b${batchIndex}-s${index}`, batchIndex, nodes: 40000, games: 2 }))).flat();
  const planTools = {
    getStageDeclaration(id) { return { config: { id, nodes: 40000 }, metadata: { comparisons: [{ id: 'team-v-l3', aLabel: 'L1 plus L2', bLabel: 'L3' }] } }; },
    expectedGames(study, openings) { assert.equal(study, command.STUDY); return openings / 8 * 6; },
    buildCampaignPlan({ study, jobs }) { return { study, jobs, format: 'test-cross-panel', stages: descriptors }; },
    selectedStages(openings, manifest) { return manifest.stages.filter(stage => stage.batchIndex < openings / 8); },
    reportStudy(manifest, sources) {
      reports.push({ target: manifest.targetOpenings, sources: sources.map(row => row.id) });
      return { runId: manifest.runId, format: 'test-cross-report', targetOpenings: manifest.targetOpenings, sources: sources.map(row => row.id) };
    },
    renderReport: JSON.stringify,
  };
  const dependencies = { identity, overlaySha256, planTools, signals, log() {}, verifyOverlay() {}, enginePath: 'not-executed',
    check: async () => ({}), persist() {},
    inspect(_, manifest, tools, selectedId) {
      inspections.push(selectedId);
      return manifest.stages.filter(stage => !selectedId || stage.id === selectedId).map(stage => ({ ...stage,
        state: states.has(stage.id) ? { mode: states.get(stage.id), manifest: identity(), records: [], report: { progress: { finalizedGames: states.get(stage.id) === 'complete' ? 2 : 1 } } } : { mode: 'new' } }));
    },
    run: async args => {
      const mode = args.includes('--resume') ? '--resume' : '--out', id = path.basename(args[args.indexOf(mode) + 1]);
      calls.push({ id, args }); states.set(id, 'complete'); return {};
    },
  };
  return { root, states, calls, reports, inspections, dependencies, signals };
}

test('cross CLI defaults to eight openings and rejects mixed modes, unknown tiers and ignored settings', () => {
  assert.deepEqual(command.parseArgs(['--out', 'x']), { out: 'x', study: 'cross-level', jobs: 4, openings: 8 });
  assert.deepEqual(command.parseArgs(['--resume', 'x']), { resume: 'x', study: 'cross-level' });
  assert.equal(command.parseArgs(['--help']).help, true);
  for (const args of [[], ['--tier', '1', '--out', 'x'], ['--out', 'x', '--resume', 'x'], ['--out', 'x', '--openings', '24'],
    ['--out', 'x', '--jobs', '17'], ['--resume', 'x', '--jobs', '2'], ['--report', 'x', '--engine', 'x'],
    ['--report', 'x', '--openings', '16'], ['--check', '--rules-only', '--engine', 'x'], ['--check', '--log', 'games']]) assert.throws(() => command.parseArgs(args));
});

test('8→16→32→64 extends immutable batches and refreshes between teams without rereading every completed stage', async t => {
  const f = fixture(t);
  await command.runStudy(['--out', f.root], f.dependencies);
  const original = fs.readFileSync(path.join(f.root, command.MANIFEST));
  assert.equal(f.calls.length, 3);
  assert.equal(f.reports.some(report => report.sources.length === 1), false, 'same-family partial placement is not a finished team');
  assert.equal(f.reports.some(report => report.sources.length === 2), true, 'report refreshes after a team before the full batch');
  assert.equal(f.inspections.filter(id => id === undefined).length, 1);
  assert.equal(f.inspections.filter(Boolean).length, 3);
  for (const target of [16, 32, 64]) {
    await command.runStudy(['--resume', f.root, '--openings', String(target)], f.dependencies);
    assert.equal(f.calls.length, target / 8 * 3);
    assert.deepEqual(fs.readFileSync(path.join(f.root, command.MANIFEST)), original);
  }
  assert.equal(new Set(f.calls.map(call => call.id)).size, 24);
  for (const target of [8, 16, 32, 64]) assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'reports', `openings-${target}`, 'panel-report.json'))).targetOpenings, target);
  const before = f.calls.length;
  await command.runStudy(['--report', f.root], { ...f.dependencies, identity() { assert.fail('offline report cannot select an engine'); }, check() { assert.fail('offline'); }, run() { assert.fail('offline'); } });
  assert.equal(f.calls.length, before);
  await assert.rejects(command.runStudy(['--resume', f.root, '--openings', '16'], f.dependencies), /cannot shrink/);
  assert.equal(f.signals.listenerCount('SIGINT'), 0);
});

test('partial stage pauses the queue and resumes its original journal before advancing', async t => {
  const f = fixture(t);
  const ordinaryRun = f.dependencies.run;
  f.dependencies.run = async args => { f.calls.push({ id: 'b0-s0', args }); f.states.set('b0-s0', 'resume'); return { stopped: true }; };
  const paused = await command.runStudy(['--out', f.root], f.dependencies);
  assert.equal(paused.stopped, true); assert.equal(f.calls.length, 1);
  f.dependencies.run = ordinaryRun;
  await command.runStudy(['--resume', f.root], f.dependencies);
  assert.equal(f.calls.length, 4); assert.ok(f.calls[1].args.includes('--resume'));
  for (const stopRequested of ['now', 'game', 'pair']) {
    const g = fixture(t); g.dependencies.run = async () => { g.states.set('b0-s0', 'complete'); return { stopRequested }; };
    assert.equal((await command.runStudy(['--out', g.root], g.dependencies)).stopped, true);
    assert.equal(g.states.size, 1);
  }
});

test('finished checkpoints are computed once per process while current group reports continue refreshing', async t => {
  const f = fixture(t);
  await command.runStudy(['--out', f.root, '--openings', '16'], f.dependencies);
  assert.equal(f.reports.filter(report => report.target === 8).length, 1, 'the completed first-eight prefix is not refitted for later groups');
  assert.ok(f.reports.filter(report => report.target === 16).length > 2, 'the current target still refreshes as teams finish');
  const before = f.reports.filter(report => report.target === 8).length;
  await command.runStudy(['--report', f.root], f.dependencies);
  assert.equal(f.reports.filter(report => report.target === 8).length, before + 1, 'a fresh ownership/source validation reconstructs the checkpoint instead of trusting cached disk output');
});

test('engine changes, changed declarations and foreign output are rejected before new games or report replacement', async t => {
  const f = fixture(t); await command.runStudy(['--out', f.root], f.dependencies);
  const before = f.calls.length, bytes = fs.readFileSync(path.join(f.root, 'panel-report.json'));
  await assert.rejects(command.runStudy(['--resume', f.root, '--openings', '16'], { ...f.dependencies, identity: () => ({ ...identity(), engineSha256: 'e'.repeat(64) }) }), /identity changed/);
  const planTools = { ...f.dependencies.planTools, buildCampaignPlan(options) { return { ...f.dependencies.planTools.buildCampaignPlan(options), changed: true }; } };
  await assert.rejects(command.runStudy(['--report', f.root], { ...f.dependencies, planTools }), /plan or runtime identity/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'panel-report.json')), bytes);
  fs.writeFileSync(path.join(f.root, 'foreign.txt'), 'preserve');
  await assert.rejects(command.runStudy(['--resume', f.root], f.dependencies), /Foreign/);
  assert.equal(f.calls.length, before);
  assert.equal(fs.readFileSync(path.join(f.root, 'foreign.txt'), 'utf8'), 'preserve');
});

test('preflight failure/cancellation restores signals and engine environment without starting another stage', async t => {
  const f = fixture(t); f.dependencies.check = async () => { throw Error('synthetic preflight'); };
  await assert.rejects(command.runStudy(['--out', f.root], f.dependencies), /synthetic preflight/);
  assert.equal(f.calls.length, 0); assert.equal(f.signals.listenerCount('SIGINT'), 0);
  const g = fixture(t), previous = process.env.FAIRY_STOCKFISH_PATH;
  process.env.FAIRY_STOCKFISH_PATH = 'original-environment';
  try {
    g.dependencies.run = async () => { assert.equal(process.env.FAIRY_STOCKFISH_PATH, 'not-executed'); g.signals.emit('SIGINT'); return {}; };
    assert.equal((await command.runStudy(['--out', g.root], g.dependencies)).stopped, true);
    assert.equal(process.env.FAIRY_STOCKFISH_PATH, 'original-environment'); assert.equal(g.signals.listenerCount('SIGTERM'), 0);
  } finally { if (previous === undefined) delete process.env.FAIRY_STOCKFISH_PATH; else process.env.FAIRY_STOCKFISH_PATH = previous; }
});

test('check mode starts no game/output and old engine identities cannot acquire campaign ownership', async t => {
  const f = fixture(t); let checks = 0;
  await command.runStudy(['--check', '--openings', '8', '--rules-only'], { ...f.dependencies, check: async (_declaration, settings) => { checks++; assert.equal(settings.enginePath, undefined); }, run() { assert.fail('no scored games'); } });
  assert.equal(checks, 3); assert.deepEqual(fs.readdirSync(f.root), []);
  await assert.rejects(command.runStudy(['--out', f.root], { ...f.dependencies, identity: () => ({ ...identity(), engineSha256: LEGACY_ENGINE_SHA256 }) }), /legacy largeboard/);
  assert.equal(fs.existsSync(path.join(f.root, command.MANIFEST)), false);
});

test('runtime owner guards reject another experiment and retain initial jobs/openings after snapshot setup failure', async t => {
  const f = fixture(t), enginePath = process.execPath;
  await assert.rejects(command.main(['--out', f.root, '--jobs', '2', '--openings', '16'], { enginePath, ensure() { throw Error('synthetic interrupted copy'); }, log() {} }), /before any games started.*--resume/);
  const partial = JSON.parse(fs.readFileSync(path.join(f.root, command.OWNER)));
  assert.equal(partial.directory, null); assert.equal(partial.jobs, 2); assert.equal(partial.initialOpenings, 16);
  assert.equal(fs.existsSync(path.join(f.root, command.LOCK)), false);
  let resumed;
  const directory = path.join(f.root, 'runtime', 'cross-level-panel-v19-test');
  await command.main(['--resume', f.root], { enginePath, log() {}, ensure() { return { directory, entry: path.join(directory, command.OVERLAY.entryFile), manifestSha256: overlaySha256, manifest: { ...command.OVERLAY } }; },
    execute: async (_args, settings) => { resumed = settings; return { resumed: true }; } });
  assert.equal(resumed.initialJobs, 2); assert.equal(resumed.initialOpenings, 16);
  assert.equal(fs.existsSync(path.join(f.root, command.LOCK)), false);
  const invalid = { directory, entry: path.join(directory, command.OVERLAY.entryFile), manifest: { ...command.OVERLAY, name: 'different-experiment' } };
  await assert.rejects(command.main(['--check', '--rules-only'], { ensure: () => invalid, execute() { assert.fail('foreign runtime must not execute'); } }), /different owned runtime/);
});
