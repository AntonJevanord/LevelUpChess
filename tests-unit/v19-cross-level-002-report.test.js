'use strict';

// Focused integration of selection 002 with the unchanged outcome reporter.
// All outcomes are authored test fixtures; no engine or scored game starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const activeCatalog = require('../src/design-catalog');
const ROOT = path.resolve(__dirname, '..');
const NZ = 'knight.level3-nz@1';
let temporary, plan, api, manifest, selectedStage, activeBefore;

test.before(() => {
  activeBefore = JSON.stringify(activeCatalog.DESIGNS);
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-cross-002-report-'));
  const command = require('../scripts/v19-cross-level');
  assert.equal(command.OVERLAY.definitionFile, 'src/balance-designs-v19-cross-level-002.js');
  const overlay = ensureResearchOverlay({ root: ROOT, ...command.OVERLAY, cacheDirectory: temporary });
  const owned = file => require(path.join(overlay.directory, file));
  plan = owned('scripts/balance/v19-cross-level-plan-002.js');
  api = owned('scripts/balance/v19-cross-level-report.js');
  manifest = { ...plan.buildCampaignPlan({ jobs: 1 }), runId: 'synthetic-selection-002-report',
    initialOpenings: 8, targetOpenings: 8 };
  const group = plan.groups().find(row => !row.sameFamily);
  const descriptor = plan.getStageDescriptors(0).find(row => row.groupId === group.id);
  const declaration = plan.getStageDeclaration(descriptor.id);
  const registry = owned('scripts/balance/design-registry.js').createDesignRegistry(declaration.config);
  const profile = owned('scripts/balance/design-profile.js').compileDesignProfile(registry, declaration.config.evaluation);
  const schedule = owned('scripts/balance/plan.js').makeSchedule(declaration.config);
  const comparison = declaration.metadata.comparisons.find(row => row.designL3 === NZ);
  assert.ok(comparison, 'the real 002 declaration must schedule Hippogriff');
  const openingId = declaration.config.openings[0].id;
  const records = schedule.filter(game => game.comparisonId === comparison.id && game.openingId === openingId)
    .map(game => ({ ...game, attempt: 1, status: 'completed', result: game.aColor === 'w' ? '0-1' : '1-0',
      reason: 'synthetic-report-outcome', profileHash: profile.hash, registryHash: registry.hash,
      variant: profile.variant, registryReference: 'run.json#designRegistry', engine: declaration.config.engine,
      evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  assert.equal(records.length, 2);
  selectedStage = { ...descriptor, declaration, records,
    manifest: { runId: 'synthetic-' + descriptor.id, config: declaration.config, schedule,
      designRegistry: registry, designProfile: profile } };
});
test.after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

test('selection 002 reports its adjusted dimensions, receipt and explicit removed alternatives', () => {
  const report = api.createCrossLevelReport({ manifest, stages: [], planTools: plan });
  assert.deepEqual(report.counts, { level1: 10, level2: 11, level3: 11, scheduledTeams: 106,
    scheduledCells: 1166, unavailableTeams: 4, unavailableCells: 44, grantsIncluded: false });
  assert.equal(report.scheduledGames, 18656);
  assert.equal(report.selectionReceipt.file, 'experiments/designs/v19-cross-level-002.json');
  for (const id of ['bishop.hopper-full-range@1', 'queen.level2-side-knight@1', 'queen.wraith-side-through@1']) {
    assert.ok(report.selectionExclusions.some(row => row.id === id), id);
    assert.ok(!report.cells.some(row => [row.designL1, row.designL2, row.designL3].includes(id)), id);
  }
  const l1Queen = report.componentRows.find(row => row.level === 1).rows.find(row => row.label === 'Huntress');
  const l2Queen = report.componentRows.find(row => row.level === 2).rows.find(row => row.label === 'Enchantress');
  assert.equal(l1Queen.partnerCoverage.total, 9); assert.equal(l2Queen.partnerCoverage.total, 8);
});

test('Hippogriff uses the existing NZ identity and public names in real 002 profile/report data', () => {
  const definition = selectedStage.manifest.designRegistry.definitions.find(row => row.id === NZ);
  assert.equal(definition.movement, 'NZ'); assert.equal(definition.level, 3);
  const report = api.createCrossLevelReport({ manifest, stages: [selectedStage], planTools: plan });
  const row = report.level3Rows.find(row => row.id === NZ);
  assert.equal(row.label, 'Hippogriff'); assert.equal(row.availableScore, 1);
  assert.equal(row.score, null, 'one covered team is not the full L3 opponent basket');
  assert.deepEqual(row.physicalColors.map(value => value.availableScore), [1, 1]);
  const cell = report.cells.find(value => value.designL3 === NZ && value.groupId === selectedStage.groupId);
  assert.equal(cell.bLabel, 'Hippogriff'); assert.equal(cell.completePairs, 1); assert.equal(cell.score, 0);
  assert.equal(report.progress.pairedGames, 2);
  assert.ok(report.teamRows.some(value => /Strider|Squire/.test(value.label)));
  assert.ok(report.level3Rows.some(value => value.label === 'Nemesis'));
  assert.equal(JSON.stringify(activeCatalog.DESIGNS), activeBefore, 'isolated NZ support must not rewrite or mutate the active catalog');
});

test('002 Markdown/matrix/CSV keep all 1166 cells, 44 unavailable cells and partial-coverage labels', () => {
  const report = api.createCrossLevelReport({ manifest, stages: [selectedStage], planTools: plan });
  const markdown = api.renderCrossLevelReport(report), matrix = api.renderCrossLevelMatrix(report), csv = api.renderCrossLevelCsv(report);
  assert.match(markdown, /1166 cells/); assert.match(markdown, /44 cells/);
  assert.match(markdown, /Hippogriff/); assert.match(markdown, /partial coverage is provisional/i);
  assert.match(matrix, /Hippogriff/); assert.match(matrix, /unavailable/);
  assert.equal(csv.trim().split('\r\n').length, 1 + 1166 + 44);
  assert.match(csv, /Hippogriff/);
  assert.ok(!JSON.stringify(report).includes('"records":'), 'authoritative histories stay in their source journals');
});
