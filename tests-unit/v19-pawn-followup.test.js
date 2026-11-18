'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const command = require('../scripts/v19-pawn-followup');
const panels = require('../scripts/v19-panels');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const ROOT = path.resolve(__dirname, '..'), hash = 'a'.repeat(64);
let overlay, plan, tools;
test.before(() => {
  overlay = ensureResearchOverlay({ root: ROOT, ...command.OVERLAY });
  plan = require(path.join(overlay.directory, 'scripts/balance/v19-pawn-followup-plan'));
  tools = { ...require(path.join(overlay.directory, 'scripts/balance/plan')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-registry')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-profile')) };
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-pawn-followup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const out = path.join(root, 'run'), calls = [];
  const make = directory => ({ directory, entry: path.join(directory, command.OVERLAY.entryFile),
    manifestSha256: hash, manifest: command.OVERLAY });
  const ensure = options => {
    assert.equal(options.name, command.OVERLAY.name);
    const directory = path.join(options.cacheDirectory || path.join(root, 'cache'), `${command.OVERLAY.name}-test`);
    fs.mkdirSync(directory, { recursive: true }); return make(directory);
  };
  return { root, out, calls, make, dependencies: { log() {}, enginePath: path.join(root, 'not-executed.exe'), ensure,
    open: options => make(options.directory), execute: async (args, options) => { calls.push({ args, options }); return {}; } } };
}

test('the dedicated CLI fixes level two, defaults to eight openings and validates continuation options', () => {
  const fresh = command.parseArgs(['--out', 'new']);
  assert.equal(fresh.study, 'level2'); assert.equal(fresh.openings, 8); assert.equal(fresh.jobs, 4);
  assert.equal(command.parseArgs(['--resume', 'old']).openings, undefined);
  assert.equal(command.parseArgs(['--resume', 'old', '--openings', '32']).openings, 32);
  assert.equal(command.parseArgs(['--help']).help, true);
  for (const args of [[], ['--tier', '1', '--out', 'x'], ['--study', 'pawns2', '--out', 'x'],
    ['--out', 'x', '--resume', 'x'], ['--report', 'x', '--engine', 'x'],
    ['--resume', 'x', '--jobs', '4'], ['--out', 'x', '--openings', '24']]) assert.throws(() => command.parseArgs(args));
});

test('follow-up owns a distinct snapshot and can resume or report without changing previous ownership', async t => {
  const f = fixture(t);
  await command.main(['--out', f.out, '--openings', '32'], f.dependencies);
  const owner = fs.readFileSync(path.join(f.out, panels.OWNER));
  assert.equal(f.calls[0].options.initialOpenings, 32);
  assert.equal(f.calls[0].options.initialJobs, 4);
  await command.main(['--resume', f.out], { ...f.dependencies, ensure() { assert.fail('use original runtime'); } });
  await command.main(['--report', f.out], { ...f.dependencies, enginePath: undefined });
  assert.equal(f.calls.at(-1).options.enginePath, undefined);
  assert.deepEqual(fs.readFileSync(path.join(f.out, panels.OWNER)), owner);
  assert.equal(f.calls.length, 3);
  const old = require('../scripts/v19-trials').OVERLAY;
  await assert.rejects(command.main(['--resume', f.out], { ...f.dependencies,
    open: options => ({ ...f.make(options.directory), manifest: old, entry: path.join(options.directory, old.entryFile) }) }), /different owned runtime/);
  assert.equal(fs.existsSync(path.join(f.out, panels.LOCK)), false);
  assert.deepEqual(fs.readFileSync(path.join(f.out, panels.OWNER)), owner);
});

test('rules-only checks need no engine or study output', async t => {
  const f = fixture(t);
  await command.main(['--check', '--rules-only'], { ...f.dependencies, enginePath: undefined });
  assert.equal(fs.existsSync(f.out), false);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.enginePath, undefined);
  assert.ok(f.calls[0].args.includes('--rules-only'));
});

test('two requested designs face only the unchanged three references with pinned priors and shared color pairs', () => {
  const rows = plan.candidates('level2'), refs = plan.references('level2');
  assert.deepEqual(rows.map(row => row.movement), ['fQ2', 'mvQ2fceB2']);
  assert.equal(rows[1].requestedMovement, 'mvQ2fcB2');
  assert.equal(rows.every(row => row.family === 'pawn' && row.level === 2 && !row.control), true);
  assert.deepEqual(refs.map(row => row.movement), ['ifmnDfmWfceFfsNfmN', 'ifmnDmfWfceFsR', 'F']);
  for (const row of rows) assert.deepEqual(row.prior, { mg: 536, eg: 592 });
  assert.equal(plan.expectedGames('level2', 8), 96); assert.equal(plan.expectedGames('level2', 32), 384);
  assert.equal(plan.expectedGames('level2', 64), 768);
  const campaign = plan.buildCampaignPlan({ study: 'level2', jobs: 4 });
  assert.equal(campaign.format, 'levelup-v19-pawn-range-followup');
  assert.equal(campaign.stages.length, 8); assert.equal(plan.selectedStages(32, campaign).length, 4);
  const declaration = plan.getBatchDeclaration('level2', 0), schedule = tools.makeSchedule(declaration.config);
  assert.equal(schedule.length, 96); assert.equal(declaration.metadata.comparisons.length, 6);
  assert.equal(tools.createDesignRegistry(declaration.config).definitions.length, 5);
  const pairs = new Map();
  for (const game of schedule) { const group = pairs.get(game.pairId) || []; group.push(game.aColor); pairs.set(game.pairId, group); }
  for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
  assert.deepEqual(require('../src/design-catalog').getDesign(rows[0].id),
    require('../src/balance-designs-v19-pawn-followup').NEW_DEFINITIONS.find(row => row.id === rows[0].id),
    'the explicitly selected pawn retains its exact tested definition');
  assert.equal(require('../src/design-catalog').getDesign(rows[1].id), undefined, 'the unselected alternative stays research-only');
});

test('follow-up reports retain automatic opening diagnostics and their own actual movement notes', () => {
  const declaration = plan.getBatchDeclaration('level2', 0), registry = tools.createDesignRegistry(declaration.config);
  const profile = tools.compileDesignProfile(registry, declaration.config.evaluation), schedule = tools.makeSchedule(declaration.config);
  const records = schedule.map(game => ({ ...game, attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'threefold-repetition',
    profileHash: profile.hash, registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: declaration.config.engine, evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  const report = plan.reportStudy({ study: 'level2', targetOpenings: 8 }, [{ batchIndex: 0, nodes: 40000, records,
    manifest: { runId: 'synthetic-followup', config: declaration.config, schedule, designRegistry: registry, designProfile: profile } }]);
  assert.equal(report.format, 'levelup-v19-pawn-range-followup-report');
  assert.equal(report.progress.completePairs, 48); assert.ok(report.rows.every(row => row.score === 0.5));
  assert.equal(report.openingEvaluations.counts.missing, 96);
  const markdown = plan.renderReport(report);
  assert.match(markdown, /mvQ2fceB2/); assert.match(markdown, /leaves the bypassed d5 pawn/);
  assert.match(markdown, /Opening evaluations/); assert.doesNotMatch(markdown, /QsfN|six knight jumps/);
});
