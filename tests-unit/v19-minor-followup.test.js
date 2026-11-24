'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const command = require('../scripts/v19-minor-followup');
const panels = require('../scripts/v19-panels');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const roster004 = require('../src/designs-v19-panel-ready');
const ROOT = path.resolve(__dirname, '..'), hash = 'a'.repeat(64);
let overlay, plan, tools;
test.before(() => {
  overlay = ensureResearchOverlay({ root: ROOT, ...command.OVERLAY });
  plan = require(path.join(overlay.directory, 'scripts/balance/v19-minor-followup-plan'));
  tools = { ...require(path.join(overlay.directory, 'scripts/balance/plan')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-registry')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-profile')) };
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-minors-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const out = path.join(root, 'run'), calls = [];
  const make = directory => ({ directory, entry: path.join(directory, command.OVERLAY.entryFile),
    manifestSha256: hash, manifest: command.OVERLAY });
  const ensure = options => {
    const directory = path.join(options.cacheDirectory || path.join(root, 'cache'), `${command.OVERLAY.name}-test`);
    fs.mkdirSync(directory, { recursive: true }); return make(directory);
  };
  return { root, out, calls, make, dependencies: { log() {}, enginePath: path.join(root, 'not-executed.exe'), ensure,
    open: options => make(options.directory), execute: async (args, options) => { calls.push({ args, options }); return {}; } } };
}
function stage(study, batchIndex = 0) {
  const declaration = plan.getBatchDeclaration(study, batchIndex), schedule = tools.makeSchedule(declaration.config);
  const registry = tools.createDesignRegistry(declaration.config), profile = tools.compileDesignProfile(registry, declaration.config.evaluation);
  const records = schedule.map(game => ({ ...game, attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'threefold-repetition',
    profileHash: profile.hash, registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: declaration.config.engine, evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  return { batchIndex, nodes: 40000, records, manifest: { runId: `synthetic-${study}-${batchIndex}`, config: declaration.config,
    schedule, designRegistry: registry, designProfile: profile } };
}

test('minor selectors default to eight total openings and retain explicit continuation identities', () => {
  for (const [selector, tier] of Object.entries(command.SELECTORS)) {
    const parsed = command.parseArgs(['--study', selector, '--out', 'new']);
    assert.equal(parsed.selector, selector); assert.equal(parsed.tier, tier);
    assert.equal(parsed.study, `level${tier}`); assert.equal(parsed.openings, 8); assert.equal(parsed.jobs, 4);
    assert.equal(command.parseArgs(['--study', selector, '--resume', 'old']).openings, undefined);
    assert.equal(command.parseArgs(['--study', selector, '--resume', 'old', '--openings', '64']).openings, 64);
  }
  assert.equal(command.parseArgs(['--help']).help, true);
  for (const args of [[], ['--tier', '1', '--out', 'new'], ['--study', '__proto__', '--out', 'new'],
    ['--study', 'level1', '--out', 'new'], ['--study', 'bishops1', '--study', 'knights2', '--out', 'new'],
    ['--study', 'bishops1', '--out', 'x', '--resume', 'x'], ['--study', 'knights2', '--report', 'x', '--engine', 'x'],
    ['--study', 'bishops1', '--out', 'x', '--openings', '24']]) assert.throws(() => command.parseArgs(args));
});

test('minor ownership resumes its original snapshot and refuses other studies without rewriting evidence', async t => {
  const f = fixture(t);
  await command.main(['--study', 'bishops1', '--out', f.out, '--openings', '32'], f.dependencies);
  const ownerFile = path.join(f.out, panels.OWNER), bytes = fs.readFileSync(ownerFile);
  assert.equal(f.calls[0].options.initialOpenings, 32);
  await command.main(['--study', 'bishops1', '--resume', f.out], { ...f.dependencies, ensure() { assert.fail('resume original runtime'); } });
  await command.main(['--study', 'bishops1', '--report', f.out], { ...f.dependencies, enginePath: undefined });
  assert.equal(f.calls.at(-1).options.enginePath, undefined);
  assert.deepEqual(fs.readFileSync(ownerFile), bytes);
  await assert.rejects(command.main(['--study', 'knights2', '--resume', f.out], f.dependencies), /runtime ownership/);
  for (const foreign of [panels.OVERLAY, require('../scripts/v19-queen-rook-followup').OVERLAY, require('../scripts/v19-sideways-followup').OVERLAY]) {
    await assert.rejects(command.main(['--study', 'bishops1', '--resume', f.out], { ...f.dependencies,
      open: options => ({ ...f.make(options.directory), manifest: foreign, entry: path.join(options.directory, foreign.entryFile) }) }), /different owned runtime/);
  }
  assert.equal(f.calls.length, 3); assert.equal(fs.existsSync(path.join(f.out, panels.LOCK)), false);
  assert.deepEqual(fs.readFileSync(ownerFile), bytes);
});

test('minor rules-only validation needs no engine or game output directory', async t => {
  const f = fixture(t);
  await command.main(['--study', 'knights2', '--check', '--rules-only'], { ...f.dependencies, enginePath: undefined });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.enginePath, undefined);
  assert.ok(f.calls[0].args.includes('--rules-only')); assert.equal(fs.existsSync(f.out), false);
});

test('minor brackets preserve exact movements, current controls, reference budgets and fixed priors', () => {
  const bishops = plan.candidates('level1'), knights = plan.candidates('level2');
  assert.deepEqual(bishops.map(row => row.movement), ['BD', 'BsD', 'BmD', 'BsmDvD', 'BsmDvcD', 'BsDvmD', 'BgB0']);
  assert.deepEqual(knights.map(row => row.movement), ['NZ', 'NZA', 'NfhZfA', 'NfhZfAfG', 'NfZsZfA', 'NfhZ', 'NsZfZ', 'N0', 'NDmW']);
  assert.deepEqual(bishops.filter(row => row.control).map(row => row.id), ['bishop.hopper-full-range@1']);
  assert.deepEqual(knights.filter(row => row.control).map(row => row.id), ['knight.nightrider-level2@1', 'knight.level2-nd-quiet-orthogonal@1']);
  for (const row of bishops) assert.deepEqual(row.prior, { mg: 1480, eg: 1302 });
  for (const row of knights) assert.deepEqual(row.prior, { mg: 1203, eg: 1352 });
  assert.equal(plan.expectedGames('level1', 8), 336); assert.equal(plan.expectedGames('level2', 8), 432);
  assert.equal(plan.expectedGames('level1', 64), 2688); assert.equal(plan.expectedGames('level2', 64), 3456);
  const rootCatalog = require('../src/design-catalog');
  for (const study of ['level1', 'level2']) {
    const tier = Number(study.at(-1)), refs = plan.references(study), rows = plan.candidates(study);
    assert.deepEqual(refs.map(row => row.id), roster004.getTierRoster(tier).filter(row => row.reference).map(row => row.id));
    for (const reference of refs) assert.deepEqual(reference.prior, roster004.getTierRoster(tier).find(row => row.id === reference.id).prior);
    assert.deepEqual(plan.getValueAudit(study).sources, [roster004.getRosterReceipt(), roster004.getValueReceipt()]);
    for (const candidate of rows.filter(row => !row.control)) assert.equal(rootCatalog.getDesign(candidate.id), undefined);
    const declaration = plan.getBatchDeclaration(study, 0), schedule = tools.makeSchedule(declaration.config);
    assert.equal(schedule.length, study === 'level1' ? 336 : 432);
    assert.equal(tools.createDesignRegistry(declaration.config).definitions.length, rows.length + refs.length);
    assert.ok(rows.length + refs.length <= 20);
    for (const cell of declaration.metadata.comparisons) {
      assert.ok(rows.some(row => row.id === cell.designA)); assert.ok(refs.some(row => row.id === cell.designB));
    }
    const pairs = new Map();
    for (const game of schedule) { const colors = pairs.get(game.pairId) || []; colors.push(game.aColor); pairs.set(game.pairId, colors); }
    for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(campaign.format, 'levelup-v19-minor-followup');
    assert.equal(campaign.stages.length, 8); assert.equal(plan.selectedStages(32, campaign).length, 4);
    assert.deepEqual(declaration.config.engine, { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 });
  }
});

test('minor reports retain first-search diagnostics, history cautions and complete-pair scoring', () => {
  for (const study of ['level1', 'level2']) {
    const first = stage(study), second = stage(study, 1);
    const report = plan.reportStudy({ study, targetOpenings: 16 }, [first, second]);
    assert.equal(report.format, 'levelup-v19-minor-followup-report');
    assert.equal(report.progress.finalizedGames, study === 'level1' ? 672 : 864);
    assert.equal(report.progress.completePairs, study === 'level1' ? 336 : 432);
    assert.ok(report.rows.every(row => row.score === 0.5 && row.openingCoverage.shared === 16));
    assert.equal(report.openingEvaluations.counts.missing, report.progress.finalizedGames);
    const markdown = plan.renderReport(report);
    assert.match(markdown, /bishop\/zebra-knight follow-up/); assert.match(markdown, /Opening evaluations/);
    assert.match(markdown, /NfhZfAfG/); assert.match(markdown, /BsmDvcD/); assert.match(markdown, /BsDvmD/);
    assert.match(markdown, /potentially strong upper bounds/);
    assert.doesNotMatch(markdown, /NfHZfAfG|sideways queen\/rook follow-up|QsfN is ignored/);
    const truncated = structuredClone(first); Object.assign(truncated.records[0], { status: 'truncated', result: '*', reason: 'max-plies' });
    const reduced = plan.reportStudy({ study, targetOpenings: 8 }, [truncated]);
    assert.equal(reduced.progress.completePairs, first.records.length / 2 - 1);
    assert.ok(reduced.rows.some(row => row.openingCoverage.shared === 7));
    assert.throws(() => plan.reportStudy({ study, targetOpenings: 16 }, [first, first]), /Duplicate/);
    const changed = structuredClone(first); changed.manifest.designProfile.hash = '0'.repeat(64);
    assert.throws(() => plan.reportStudy({ study, targetOpenings: 8 }, [changed]), /profile or schedule changed/);
  }
});

test('minor anchors reject missing or wrong-family priors instead of borrowing a different body', () => {
  const base = require(path.join(overlay.directory, 'scripts/balance/v19-trial-plan'));
  const trials = require(path.join(overlay.directory, 'src/balance-designs-v19-minor-followup')).TRIALS;
  assert.throws(() => base.createTrialPlan({ trials, anchorRoster: null }), /anchors require/);
  assert.throws(() => base.createTrialPlan({ trials, anchorRoster: {} }), /anchors require/);
  assert.throws(() => base.createTrialPlan({ trials: [{ ...trials[0], anchorId: 'missing-design@1' }], anchorRoster: roster004 }), /Missing tested value anchor/);
  assert.throws(() => base.createTrialPlan({ trials: [{ ...trials[0], anchorId: 'queen.level2-side-knight@1' }], anchorRoster: roster004 }), /tier and family/);
});
