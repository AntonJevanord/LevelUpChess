'use strict';

// Synthetic outcomes and rules diagnostics only; no scientific match games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const rootCatalog = require('../src/design-catalog');
const overlay = ensureResearchOverlay({ name: 'v18-screen-plan-test', entryFile: 'scripts/v18-balance.js', definitionFile: 'src/balance-designs-v18-screen.js' });
const plan = require(path.join(overlay.directory, 'scripts/balance/v18-screen-plan'));
const { makeSchedule } = require(path.join(overlay.directory, 'scripts/balance/plan'));
const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
const sha = value => createHash('sha256').update(value).digest('hex');

function context(study, batchIndex = 0, nodes = 40000) {
  const declaration = plan.getBatchDeclaration(study, batchIndex, nodes), schedule = makeSchedule(declaration.config);
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  return { study, batchIndex, nodes, declaration, profile, registry, schedule,
    manifest: { runId: `synthetic-${study}-${batchIndex}-${nodes}`, config: declaration.config, schedule,
      designRegistry: registry, designProfile: profile } };
}
function recordsFor(input) {
  const cells = new Map(input.declaration.metadata.comparisons.map(cell => [cell.id, cell]));
  return input.schedule.map(game => {
    const key = cells.get(game.comparisonId).aKey;
    const score = key.endsWith('-control') ? game.aColor === 'w' ? 0 : 0.5 : game.aColor === 'w' ? 1 : 0;
    return { ...game, attempt: 1, status: 'completed',
      result: score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
      reason: score === 0.5 ? 'threefold-repetition' : 'checkmate', profileHash: input.profile.hash,
      registryHash: input.registry.hash, variant: input.profile.variant, registryReference: 'run.json#designRegistry',
      engine: input.declaration.config.engine, evaluation: input.declaration.config.evaluation,
      whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
}
function source(input, records = recordsFor(input)) {
  return { batchIndex: input.batchIndex, nodes: input.nodes, manifest: input.manifest, records };
}

test('new definitions remain isolated and every historical playable profile and bundle survives preparation', () => {
  assert.equal(rootCatalog.getDesign('knight.nightrider-quiet-diagonal@1'), undefined);
  assert.equal(rootCatalog.getDesign('queen.wraith-side-through@1'), undefined);
  assert.throws(() => require('../scripts/balance/v18-screen-plan').candidates('mobility'), /isolated research runtime/);
  assert.equal(rootCatalog.getDesign('knight.purple@4').movement, 'N0');
  assert.equal(rootCatalog.getDesign('queen.purple@7').movement, 'QgB0');
  for (const row of overlay.manifest.baseInventory.filter(row => row.file === 'dist/balance-rules.cjs'
    || /^src\/playable.*-profile\.json$/.test(row.file) || /^variants\//.test(row.file))) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', row.file));
    assert.equal(sha(row.kind === 'raw' ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')), row.sha256, row.file);
  }
});

test('all targets freeze distinct paired stages and extending does not repeat the first eight cases', () => {
  const totals = { level1: [384, 3072], level2: [384, 3072], mobility: [896, 7168] };
  for (const study of plan.STUDIES) {
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(plan.expectedGames(study, 8), totals[study][0]);
    assert.equal(campaign.games, totals[study][1]);
    assert.deepEqual(plan.selectedStages(8, campaign), plan.selectedStages(16, campaign).slice(0, campaign.nodes.length));
    assert.deepEqual(campaign.nodes, study === 'mobility' ? [40000, 80000] : [40000]);
    for (const stage of campaign.stages) {
      const input = context(study, stage.batchIndex, stage.nodes);
      assert.ok(input.registry.definitions.length <= 20);
      assert.equal(input.schedule.length, stage.games);
      assert.equal(new Set(input.schedule.map(game => game.pairId)).size, stage.games / 2);
      assert.equal(input.profile.hash, stage.profileHash);
      assert.equal(sha(JSON.stringify(input.schedule)), stage.scheduleSha256);
    }
    const a = context(study), b = context(study, 1);
    assert.equal(a.profile.hash, b.profile.hash);
    const firstIds = new Set(a.schedule.map(game => game.id));
    assert.ok(b.schedule.every(game => !firstIds.has(game.id)));
  }
  for (const openings of [1, 7, 12, 128]) assert.throws(() => plan.expectedGames('level1', openings));
  assert.throws(() => plan.buildCampaignPlan({ study: 'other' }));
  assert.throws(() => plan.buildCampaignPlan({ study: 'level1', jobs: 0 }));
});

test('same-tier opponents and purchase budgets preserve queen singles and native minor pairs', () => {
  for (const study of ['level1', 'level2']) {
    const rows = plan.candidates(study), comparisons = plan.matches(study);
    assert.equal(rows.length, 8); assert.equal(comparisons.length, 24);
    assert.equal(plan.references(study).length, 3);
    for (const row of rows) {
      const count = study === 'level1' && row.family !== 'queen' ? 2 : 1;
      assert.equal(Object.keys(row.army.upgrades).length, count);
      assert.equal(row.upgradePoints, count * (study === 'level1' ? 1 : 2));
      for (const cell of comparisons.filter(cell => cell.aKey === row.key)) {
        const upgrades = Object.keys(cell.armyB.upgrades).length;
        const reserve = (cell.armyB.reserve || []).reduce((sum, entry) => sum + entry.count, 0);
        assert.equal(upgrades + reserve, study === 'level1' ? count : 1);
      }
    }
  }
  assert.equal(plan.references('level2')[0].id, 'pawn.knight-tall-quiet@1');
  assert.ok(!plan.references('level2').some(row => row.id === 'pawn.orange@3'));
  const mobile = plan.matches('mobility');
  assert.equal(mobile.length, 28);
  assert.ok(mobile.every(cell => ['vanguard', 'unicorn', 'cruisader', 'amazon'].includes(cell.bKey)));
});

test('priors preserve frozen references and explicitly control quiet movement inflation', () => {
  const lower = plan.getBatchDeclaration('level2', 0, 40000).config.evaluation.pieceValues;
  assert.deepEqual(lower['pawn.knight-tall-quiet@1'], { mg: 536, eg: 592 });
  assert.deepEqual(lower['rook.orange@2'], { mg: 1904, eg: 1959 });
  assert.deepEqual(lower['rook.orange@2'], lower['rook.orange@3']);
  const inventory = require('../experiments/designs/v18-screen-values.json');
  assert.deepEqual(inventory.values.find(row => row.id === 'rook.orange@2').automatic, { mg: 3146, eg: 3944 });
  for (const nodes of [40000, 80000]) {
    const values = plan.getBatchDeclaration('mobility', 0, nodes).config.evaluation.pieceValues;
    for (const row of plan.candidates('mobility')) assert.deepEqual(values[row.id], row.family === 'knight' ? { mg: 2326, eg: 2211 } : { mg: 3772, eg: 3470 });
    for (const reference of plan.references('mobility')) assert.deepEqual(values[reference.id], reference.engineValue);
  }
});

test('cumulative reports include percentages, physical colors, budgets, shared cases and fixed batches', () => {
  const a = context('level1'), b = context('level1', 1);
  const report = plan.reportStudy({ study: 'level1', targetOpenings: 16, runId: 'synthetic' }, [source(a), source(b)]);
  assert.equal(report.scheduledGames, 768);
  const stage = report.reports[0];
  assert.equal(stage.report.progress.pairedGames, 768);
  assert.ok(stage.rows.every(row => row.score === 0.5 && row.openingCoverage.shared === 16));
  assert.deepEqual(report.sources.map(row => row.runId), [a.manifest.runId, b.manifest.runId]);
  assert.equal(report.sources[0].profileHash, a.profile.hash);
  assert.deepEqual(stage.rows[0].physicalColors.map(color => color.score), [1, 0]);
  assert.equal(stage.cohorts.length, 2); assert.equal(stage.cohorts[0].rows[0].openingCoverage.shared, 8);
  assert.equal(stage.rows.find(row => row.key === 'advancing').upgradePoints, 1);
  assert.equal(stage.rows.find(row => row.key === 'positional').upgradePoints, 2);
  assert.equal(stage.rows[0].conditionalRange.available, true);
  const markdown = plan.renderReport(report);
  for (const term of ['50.00%', 'White', 'Black', 'Cases 1–8', 'Cases 9–16', 'Frozen search priors']) assert.ok(markdown.includes(term), term);
});

test('new quiet/body gains use common complete opening blocks with fresh family controls', () => {
  const input = context('mobility');
  const records = recordsFor(input);
  const report = plan.reportStudy({ study: 'mobility', targetOpenings: 8, runId: 'synthetic' }, [source(input, records)]);
  const stage = report.reports[0];
  assert.equal(stage.gains.length, 5);
  assert.ok(stage.gains.every(gain => gain.sharedOpenings === 8 && gain.difference === 0.25));
  assert.equal(report.reports[1].rows[0].score, null);
  assert.ok(report.reports[1].rows[0].flags.includes('partial screen'));
  const altered = structuredClone(records);
  const record = altered.find(row => row.comparisonId.startsWith('nightrider-control-'));
  record.status = 'truncated'; record.result = '*';
  const revised = plan.reportStudy({ study: 'mobility', targetOpenings: 8 }, [source(input, altered)]);
  assert.ok(revised.reports[0].gains.filter(gain => gain.control === 'nightrider-control').every(gain => gain.sharedOpenings === 7));
  assert.ok(revised.reports[0].gains.filter(gain => gain.control === 'wraith-control').every(gain => gain.sharedOpenings === 8));
  assert.ok(revised.reports[0].rows.find(row => row.key === 'nightrider-control').flags.includes('partial screen'));
});

test('journal duplicates add no weight and foreign stages, nodes, openings and contexts fail visibly', () => {
  const input = context('level2'), records = recordsFor(input), manifest = { study: 'level2', targetOpenings: 8 };
  const duplicate = plan.reportStudy(manifest, [source(input, [...records, records[0]])]);
  assert.equal(duplicate.reports[0].report.progress.pairedGames, 384);
  assert.throws(() => plan.reportStudy(manifest, [source(input), source(input)]), /repeated/);
  assert.throws(() => plan.reportStudy(manifest, [source(context('level2', 1))]), /outside/);
  const invalid = structuredClone(records); invalid[0].engine.nodes = 80000;
  assert.throws(() => plan.reportStudy(manifest, [source(input, invalid)]), /context changed/);
  const otherOpening = structuredClone(records); otherOpening[0].openingId = 'unknown';
  assert.throws(() => plan.reportStudy(manifest, [source(input, otherOpening)]), /unknown opening/);
});
