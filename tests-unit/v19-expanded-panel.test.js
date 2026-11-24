'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const command = require('../scripts/v19-expanded-panels');
const panels = require('../scripts/v19-panels');
const current = require('../scripts/balance/v19-panel-current-plan');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const ROOT = path.resolve(__dirname, '..'), hash = 'a'.repeat(64);
let overlay, plan, tools, roster;
test.before(() => {
  overlay = ensureResearchOverlay({ root: ROOT, ...command.OVERLAY });
  plan = require(path.join(overlay.directory, 'scripts/balance/v19-panel-expanded-plan'));
  roster = require(path.join(overlay.directory, 'src/designs-v19-expanded'));
  tools = { ...require(path.join(overlay.directory, 'scripts/balance/plan')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-registry')),
    ...require(path.join(overlay.directory, 'scripts/balance/design-profile')) };
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-expanded-'));
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
function stage(study, batchIndex = 0, planTools = plan, selectedTools = tools) {
  const declaration = planTools.getBatchDeclaration(study, batchIndex), schedule = selectedTools.makeSchedule(declaration.config);
  const registry = selectedTools.createDesignRegistry(declaration.config), profile = selectedTools.compileDesignProfile(registry, declaration.config.evaluation);
  const records = schedule.map(game => ({ ...game, attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'threefold-repetition',
    profileHash: profile.hash, registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: declaration.config.engine, evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  return { batchIndex, nodes: 40000, records, declaration, manifest: { runId: `synthetic-${study}-${batchIndex}`, config: declaration.config,
    schedule, designRegistry: registry, designProfile: profile } };
}

test('expanded panel arguments retain tier selectors, default to eight total openings and validate continuation', () => {
  for (const tier of [1, 2, 3]) {
    const parsed = command.parseArgs(['--tier', String(tier), '--fresh', '--out', 'new']);
    assert.equal(parsed.tier, tier); assert.equal(parsed.study, `level${tier}`);
    assert.equal(parsed.openings, 8); assert.equal(parsed.jobs, 4);
    assert.equal(command.parseArgs(['--tier', String(tier), '--check', '--rules-only']).openings, 8);
    assert.equal(command.parseArgs(['--tier', String(tier), '--resume', 'old']).openings, undefined);
    assert.equal(command.parseArgs(['--tier', String(tier), '--resume', 'old', '--openings', '64']).openings, 64);
  }
  assert.equal(command.parseArgs(['--help']).help, true);
  assert.equal(command.parseArgs(['--tier', '1', '--reuse', 'original', '--out', 'new']).reuse, 'original');
  for (const args of [[], ['--tier', '4', '--out', 'new'], ['--study', 'level1', '--out', 'new'],
    ['--tier', '1', '--out', 'new'], ['--tier', '1', '--fresh', '--reuse', 'original', '--out', 'new'],
    ['--tier', '1', '--reuse', 'original', '--report', 'new'],
    ['--tier', '1', '--out', 'x', '--resume', 'x'], ['--tier', '2', '--report', 'x', '--engine', 'x'],
    ['--tier', '1', '--out', 'x', '--openings', '24']]) assert.throws(() => command.parseArgs(args));
});

test('expanded ownership retains its original snapshot and refuses earlier panels or focused studies', async t => {
  const f = fixture(t);
  await command.main(['--tier', '2', '--fresh', '--out', f.out, '--openings', '32'], f.dependencies);
  const ownerFile = path.join(f.out, panels.OWNER), bytes = fs.readFileSync(ownerFile);
  assert.equal(f.calls[0].options.initialOpenings, 32); assert.equal(f.calls[0].options.initialJobs, 4);
  await command.main(['--tier', '2', '--resume', f.out], { ...f.dependencies, ensure() { assert.fail('resume original runtime'); } });
  await command.main(['--tier', '2', '--report', f.out], { ...f.dependencies, enginePath: undefined });
  assert.equal(f.calls.at(-1).options.enginePath, undefined);
  assert.deepEqual(fs.readFileSync(ownerFile), bytes);
  await assert.rejects(command.main(['--tier', '1', '--resume', f.out], f.dependencies), /runtime ownership/);
  for (const foreign of [panels.OVERLAY, require('../scripts/v19-minor-followup').OVERLAY,
    require('../scripts/v19-queen-rook-followup').OVERLAY]) {
    await assert.rejects(command.main(['--tier', '2', '--resume', f.out], { ...f.dependencies,
      open: options => ({ ...f.make(options.directory), manifest: foreign, entry: path.join(options.directory, foreign.entryFile) }) }), /different owned runtime/);
  }
  assert.equal(f.calls.length, 3); assert.equal(fs.existsSync(path.join(f.out, panels.LOCK)), false);
  assert.deepEqual(fs.readFileSync(ownerFile), bytes);
});

test('reuse plans schedule only alternative pairings and pin the copied source identity', () => {
  for (const [study, count] of [['level1', 176], ['level2', 624], ['level3', 192]]) {
    const previous = current.candidates(study), oldIds = previous.map(row => row.id);
    const reuse = { identity: { sourceStudy: study, hash: 'b'.repeat(64) }, oldIds,
      availableOpenings: 64, stages: [], input: { roster: previous,
        manifest: { nodes: [plan.NODES], book: { sha256: plan.OPENINGS_SHA256 } } } };
    const delta = plan.createExpandedPlan(reuse);
    assert.equal(delta.FORMAT, 'levelup-v19-tier-panels-005-reuse');
    for (const target of [8, 16, 32, 64]) assert.equal(delta.expectedGames(study, target), count * target / 8);
    assert.ok(delta.matches(study).every(row => !oldIds.includes(row.designA) || !oldIds.includes(row.designB)));
    const campaign = delta.buildCampaignPlan({ study, jobs: 1 });
    assert.deepEqual(campaign.reuseIdentity, reuse.identity);
    assert.equal(campaign.stages[0].games, count);
    const declaration = delta.getBatchDeclaration(study, 0);
    assert.equal(tools.makeSchedule(declaration.config).length, count);
    const compiled = value => tools.compileDesignProfile(tools.createDesignRegistry(value.config), value.config.evaluation);
    assert.deepEqual(compiled(declaration), compiled(plan.getBatchDeclaration(study, 0)), 'delta uses the same expanded profile, not a sparse replacement');
    assert.throws(() => delta.expectedGames(study === 'level1' ? 'level2' : 'level1', 8), /another tier/);
    const short = plan.createExpandedPlan({ ...reuse, availableOpenings: 8 });
    assert.throws(() => short.expectedGames(study, 16), /only 8 openings/);
  }
});

test('expanded rules-only checks need no executable or study output', async t => {
  const f = fixture(t);
  await command.main(['--tier', '3', '--check', '--rules-only'], { ...f.dependencies, enginePath: undefined });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.enginePath, undefined);
  assert.ok(f.calls[0].args.includes('--rules-only')); assert.equal(fs.existsSync(f.out), false);
});

test('expanded roster adds exactly five alternatives and retains original bodies, references and tested priors', () => {
  const alternatives = new Map([
    ['bishop.level1-dabbaba@1', ['BD', { mg: 1480, eg: 1302 }]],
    ['knight.level2-forward-zebra@1', ['NfhZ', { mg: 1203, eg: 1352 }]],
    ['rook.level2-no-tall-back-capture-knight@1', ['RcsNcfN', { mg: 1904, eg: 1959 }]],
    ['queen.level2-side-knight-side-dabbaba-alfil@1', ['QsDsNA', { mg: 3738, eg: 4155 }]],
    ['queen.level3-side-threeleap-camel-zebra-tripper@1', ['QsHsCsZG', { mg: 3772, eg: 3470 }]],
  ]);
  assert.equal(plan.FORMAT, 'levelup-v19-tier-panels-005');
  assert.equal(plan.NODES, 40000);
  const added = [];
  for (const [study, count, games] of [['level1', 12, 1056], ['level2', 15, 1680], ['level3', 13, 1248]]) {
    const rows = plan.candidates(study), previous = current.candidates(study), oldIds = new Set(previous.map(row => row.id));
    assert.equal(rows.length, count);
    for (const old of previous) assert.deepEqual(rows.find(row => row.id === old.id), old);
    assert.deepEqual(plan.references(study), current.references(study));
    for (const row of rows.filter(row => !oldIds.has(row.id))) {
      const [movement, prior] = alternatives.get(row.id) || [];
      assert.equal(row.movement, movement); assert.deepEqual(row.prior, prior);
      assert.equal(row.reference, false); added.push(row.id);
    }
    for (const target of [8, 16, 32, 64]) assert.equal(plan.expectedGames(study, target), games * target / 8);
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(campaign.stages.length, 8); assert.equal(plan.selectedStages(32, campaign).length, 4);
    assert.deepEqual(campaign.rosterReceipt, roster.getRosterReceipt());
    assert.match(campaign.rosterReceipt.file, /v19-roster-005\.json$/);
    const first = stage(study), registry = first.manifest.designRegistry;
    assert.equal(registry.definitions.length, count); assert.ok(registry.definitions.length <= 20);
    assert.deepEqual(first.declaration.config.engine, { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 });
    assert.equal(first.declaration.metadata.comparisons.length, count * (count - 1) / 2);
    const pairs = new Map();
    for (const game of first.manifest.schedule) {
      const colors = pairs.get(game.pairId) || []; colors.push(game.aColor); pairs.set(game.pairId, colors);
    }
    for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
    for (const row of rows) {
      assert.equal(row.count, 1); assert.equal(row.upgradePoints, Number(study.at(-1)));
      assert.equal(Object.keys(row.army.upgrades).length + (row.army.reserve?.reduce((sum, item) => sum + item.count, 0) || 0), 1);
    }
    assert.throws(() => plan.getBatchDeclaration(study, 0, 20000));
    assert.throws(() => plan.getBatchDeclaration(study, 0, 80000));
  }
  assert.deepEqual(added.sort(), [...alternatives.keys()].sort());
  assert.equal(current.expectedGames('level1', 8), 880);
  assert.equal(current.expectedGames('level2', 8), 1056);
  assert.equal(current.expectedGames('level3', 8), 1056);
});

test('expanded reports preserve full round robins, fixed-reference scores, opening observations and partial-pair exclusions', () => {
  for (const study of ['level1', 'level2', 'level3']) {
    const first = stage(study), second = stage(study, 1);
    const report = plan.reportStudy({ study, targetOpenings: 16 }, [first, second]);
    assert.equal(report.format, 'levelup-v19-tier-panel-report-005');
    assert.equal(report.progress.finalizedGames, first.records.length * 2);
    assert.equal(report.progress.completePairs, first.records.length);
    assert.ok(report.rows.every(row => row.allOpponents.score === 0.5 && row.allOpponents.openingCoverage.shared === 16));
    assert.ok(report.rows.every(row => row.fixedReferences.score === 0.5));
    assert.equal(report.openingEvaluations.counts.missing, report.progress.finalizedGames);
    const markdown = plan.renderReport(report);
    assert.match(markdown, /Roster revision 005/); assert.match(markdown, /Opening evaluations/);
    assert.match(markdown, /no earlier games are imported automatically/);
    const truncated = structuredClone(first);
    Object.assign(truncated.records[0], { status: 'truncated', result: '*', reason: 'max-plies' });
    const reduced = plan.reportStudy({ study, targetOpenings: 8 }, [truncated]);
    assert.equal(reduced.progress.completePairs, first.records.length / 2 - 1);
    assert.ok(reduced.rows.some(row => row.allOpponents.openingCoverage.shared === 7));
    assert.throws(() => plan.reportStudy({ study, targetOpenings: 16 }, [first, first]), /repeated/);
    const changed = structuredClone(first); changed.manifest.designProfile.hash = '0'.repeat(64);
    assert.throws(() => plan.reportStudy({ study, targetOpenings: 8 }, [changed]), /semantic profile/);
  }
});

test('expanded readers never relabel roster-004 stages as new alternatives', () => {
  const rootTools = { ...require('../scripts/balance/plan'), ...require('../scripts/balance/design-registry'),
    ...require('../scripts/balance/design-profile') };
  for (const study of ['level1', 'level2', 'level3']) {
    const previous = stage(study, 0, current, rootTools);
    assert.throws(() => plan.reportStudy({ study, targetOpenings: 8 }, [previous]), /semantic profile/);
    assert.equal(current.reportStudy({ study, targetOpenings: 8 }, [previous]).format, 'levelup-v19-tier-panel-report-004');
  }
});
