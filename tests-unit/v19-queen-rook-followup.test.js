'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const command = require('../scripts/v19-queen-rook-followup');
const panels = require('../scripts/v19-panels');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const roster004 = require('../src/designs-v19-panel-ready');
const ROOT = path.resolve(__dirname, '..'), hash = 'a'.repeat(64);
let overlay, plan, tools;
test.before(() => {
  overlay = ensureResearchOverlay({ root: ROOT, ...command.OVERLAY });
  plan = require(path.join(overlay.directory, 'scripts/balance/v19-queen-rook-followup-plan'));
  tools = { ...require(path.join(overlay.directory, 'scripts/balance/plan')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-registry')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-profile')) };
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-queen-rook-'));
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

test('selectors default to eight total openings and validate panel-style continuation', () => {
  for (const [selector, tier] of Object.entries(command.SELECTORS)) {
    const parsed = command.parseArgs(['--study', selector, '--out', 'new']);
    assert.equal(parsed.selector, selector); assert.equal(parsed.tier, tier);
    assert.equal(parsed.study, `level${tier}`); assert.equal(parsed.openings, 8); assert.equal(parsed.jobs, 4);
    assert.equal(command.parseArgs(['--study', selector, '--resume', 'old']).openings, undefined);
    assert.equal(command.parseArgs(['--study', selector, '--resume', 'old', '--openings', '64']).openings, 64);
  }
  assert.equal(command.parseArgs(['--help']).help, true);
  for (const args of [[], ['--tier', '2', '--out', 'new'], ['--study', '__proto__', '--out', 'new'],
    ['--study', 'level1', '--out', 'new'], ['--study', 'level2', '--study', 'queens3', '--out', 'new'],
    ['--study', 'level2', '--out', 'x', '--resume', 'x'], ['--study', 'queens3', '--report', 'x', '--engine', 'x'],
    ['--study', 'level2', '--out', 'x', '--openings', '24']]) assert.throws(() => command.parseArgs(args));
});

test('the dedicated overlay retains exact ownership and rejects another study or foreign runtime', async t => {
  const f = fixture(t);
  await command.main(['--study', 'level2', '--out', f.out, '--openings', '32'], f.dependencies);
  const ownerFile = path.join(f.out, panels.OWNER), bytes = fs.readFileSync(ownerFile);
  assert.equal(f.calls[0].options.initialOpenings, 32);
  await command.main(['--study', 'level2', '--resume', f.out], { ...f.dependencies, ensure() { assert.fail('resume original runtime'); } });
  await command.main(['--study', 'level2', '--report', f.out], { ...f.dependencies, enginePath: undefined });
  assert.equal(f.calls.at(-1).options.enginePath, undefined);
  assert.deepEqual(fs.readFileSync(ownerFile), bytes);
  await assert.rejects(command.main(['--study', 'queens3', '--resume', f.out], f.dependencies), /runtime ownership/);
  await assert.rejects(command.main(['--study', 'level2', '--resume', f.out], { ...f.dependencies,
    open: options => ({ ...f.make(options.directory), manifest: panels.OVERLAY, entry: path.join(options.directory, panels.OVERLAY.entryFile) }) }), /different owned runtime/);
  assert.equal(f.calls.length, 3);
  assert.equal(fs.existsSync(path.join(f.out, panels.LOCK)), false);
  assert.deepEqual(fs.readFileSync(ownerFile), bytes);
});

test('rules-only checks need neither an engine nor a study output directory', async t => {
  const f = fixture(t);
  await command.main(['--study', 'queens3', '--check', '--rules-only'], { ...f.dependencies, enginePath: undefined });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.enginePath, undefined);
  assert.ok(f.calls[0].args.includes('--rules-only')); assert.equal(fs.existsSync(f.out), false);
});

test('the focused brackets use roster-004 references, fresh current controls and frozen family priors', () => {
  const level2 = plan.candidates('level2'), level3 = plan.candidates('level3');
  assert.deepEqual(level2.map(row => row.movement), ['QsNfD', 'QsNfDfH', 'RcsNcfN', 'QsN', 'RcN']);
  assert.deepEqual(level3.map(row => row.movement), ['QsCfC', 'QsZfZ', 'QZAG', 'QZH', 'QC', 'QZ', 'QgmQ0gcBgcsR0']);
  assert.deepEqual(level2.filter(row => row.control).map(row => row.id), ['queen.level2-side-knight@1', 'rook.orange@3']);
  assert.deepEqual(level3.filter(row => row.control).map(row => row.id), ['queen.wraith-side-through@1']);
  for (const row of level2) assert.deepEqual(row.prior, row.family === 'queen' ? { mg: 3738, eg: 4155 } : { mg: 1904, eg: 1959 });
  for (const row of level3) assert.deepEqual(row.prior, { mg: 3772, eg: 3470 });
  assert.equal(plan.expectedGames('level2', 8), 240); assert.equal(plan.expectedGames('level3', 8), 448);
  assert.equal(plan.expectedGames('level2', 64), 1920); assert.equal(plan.expectedGames('level3', 64), 3584);
  const rootCatalog = require('../src/design-catalog');
  for (const study of ['level2', 'level3']) {
    const tier = Number(study.at(-1)), refs = plan.references(study);
    assert.deepEqual(refs.map(row => row.id), roster004.getTierRoster(tier).filter(row => row.reference).map(row => row.id));
    for (const reference of refs) assert.deepEqual(reference.prior, roster004.getTierRoster(tier).find(row => row.id === reference.id).prior);
    const audit = plan.getValueAudit(study);
    assert.deepEqual(audit.sources, [roster004.getRosterReceipt(), roster004.getValueReceipt()]);
    for (const candidate of plan.candidates(study).filter(row => !row.control)) {
      if (["rook.level2-no-tall-back-capture-knight@1"].includes(candidate.id)) assert.deepEqual(rootCatalog.getDesign(candidate.id),
        require('../src/balance-designs-v19-queen-rook-followup').NEW_DEFINITIONS.find(row => row.id === candidate.id));
      else assert.equal(rootCatalog.getDesign(candidate.id), undefined);
    }
    const declaration = plan.getBatchDeclaration(study, 0), schedule = tools.makeSchedule(declaration.config);
    assert.equal(schedule.length, study === 'level2' ? 240 : 448);
    assert.equal(tools.createDesignRegistry(declaration.config).definitions.length <= 20, true);
    for (const cell of declaration.metadata.comparisons) {
      assert.ok(plan.candidates(study).some(row => row.id === cell.designA));
      assert.ok(refs.some(row => row.id === cell.designB));
    }
    const pairs = new Map();
    for (const game of schedule) { const colors = pairs.get(game.pairId) || []; colors.push(game.aColor); pairs.set(game.pairId, colors); }
    for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(campaign.format, 'levelup-v19-queen-rook-followup');
    assert.equal(campaign.stages.length, 8); assert.equal(plan.selectedStages(32, campaign).length, 4);
    assert.deepEqual(declaration.config.engine, { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 });
  }
});

test('reports retain opening diagnostics, current controls and complete-pair exclusions', () => {
  for (const study of ['level2', 'level3']) {
    const first = stage(study), second = stage(study, 1);
    const report = plan.reportStudy({ study, targetOpenings: 16 }, [first, second]);
    assert.equal(report.format, 'levelup-v19-queen-rook-followup-report');
    assert.equal(report.progress.finalizedGames, study === 'level2' ? 480 : 896);
    assert.equal(report.progress.completePairs, study === 'level2' ? 240 : 448);
    assert.ok(report.rows.every(row => row.score === 0.5 && row.openingCoverage.shared === 16));
    assert.equal(report.openingEvaluations.counts.missing, report.progress.finalizedGames);
    const markdown = plan.renderReport(report);
    assert.match(markdown, /queen\/rook follow-up/); assert.match(markdown, /Opening evaluations/);
    assert.match(markdown, /QsNfD/); assert.match(markdown, /QsCfC/); assert.match(markdown, /QZAG/);
    assert.doesNotMatch(markdown, /QsfN is ignored|six knight jumps|pawn\/queen trials/);
    const truncated = structuredClone(first), lost = truncated.records[0];
    Object.assign(lost, { status: 'truncated', result: '*', reason: 'max-plies' });
    const reduced = plan.reportStudy({ study, targetOpenings: 8 }, [truncated]);
    assert.equal(reduced.progress.completePairs, first.records.length / 2 - 1);
    assert.ok(reduced.rows.some(row => row.openingCoverage.shared === 7));
    assert.throws(() => plan.reportStudy({ study, targetOpenings: 16 }, [first, first]), /Duplicate/);
    const changed = structuredClone(first); changed.manifest.designProfile.hash = '0'.repeat(64);
    assert.throws(() => plan.reportStudy({ study, targetOpenings: 8 }, [changed]), /profile or schedule changed/);
  }
});

test('the factory validates an explicit anchor context instead of silently using older controls', () => {
  const base = require(path.join(overlay.directory, 'scripts/balance/v19-trial-plan'));
  const trials = require(path.join(overlay.directory, 'src/balance-designs-v19-queen-rook-followup')).TRIALS;
  assert.throws(() => base.createTrialPlan({ trials, anchorRoster: null }), /anchors require/);
  assert.throws(() => base.createTrialPlan({ trials, anchorRoster: {} }), /anchors require/);
  assert.throws(() => base.createTrialPlan({ trials }), /Missing tested value anchor/, 'new current Wraith anchor is not in original roster');
});
