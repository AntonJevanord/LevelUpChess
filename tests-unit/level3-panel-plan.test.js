'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { makeSchedule } = require('../scripts/balance/plan');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const api = require('../scripts/balance/level3-panel-plan');

test('the exact ten accepted bodies have cosmetic color pairs and retain the four frozen benchmark identities', () => {
  const roster = api.getRoster();
  assert.deepEqual(roster.map(row => row.movement), ['mQ2cfQ2', 'BvW2vnN', 'NC', 'RfB', 'QN', 'mRcfB', 'BsR2nsN', 'N0', 'RC', 'QgB0']);
  assert.deepEqual(roster.map(row => row.color), [...Array(5).fill('red'), ...Array(5).fill('purple')]);
  assert.deepEqual(roster.filter(row => row.officialReference).map(row => row.id).sort(), getOfficialReferences().roster.map(row => row.id).sort());
  assert.equal(roster.find(row => row.key === 'cruisader').color, 'purple');
  assert.ok(roster.find(row => row.key === 'cruisader').officialReference);
  for (const row of roster) {
    assert.equal(row.level, 3); assert.equal(row.placement, 'replace');
    assert.deepEqual(Object.values(row.army.upgrades), [row.id]);
    assert.deepEqual(Object.keys(row.army.upgrades), [api.HOMES[row.family]]);
    assert.ok(Object.isFrozen(row));
  }
});

test('every unordered head-to-head cell occurs once and the ten ordinary anchors remain distinguishable', () => {
  const comparisons = api.comparisons(), head = comparisons.filter(row => row.kind === 'head'), baseline = comparisons.filter(row => row.kind === 'baseline');
  assert.equal(head.length, 45); assert.equal(baseline.length, 10); assert.equal(new Set(comparisons.map(row => row.id)).size, 55);
  assert.equal(new Set(head.map(row => [row.designA, row.designB].sort().join('/'))).size, 45);
  const appearances = new Map(api.getRoster().map(row => [row.id, 0]));
  for (const cell of head) for (const id of [cell.designA, cell.designB]) appearances.set(id, appearances.get(id) + 1);
  assert.ok([...appearances.values()].every(value => value === 9));
  assert.deepEqual(baseline.map(cell => cell.designA), api.getRoster().map(row => row.id));
  for (const cell of baseline) { assert.equal(cell.designB, null); assert.deepEqual(cell.b.army, { upgrades: {} }); }
});

test('all three node cohorts retain the applied priors and identical node-independent game pairings', () => {
  for (const batchIndex of [0, 7]) {
    const configs = api.NODE_BUDGETS.map(nodes => api.buildConfig({ batchIndex, nodes }));
    for (const [index, config] of configs.entries()) {
      assert.deepEqual(config.engine, { nodes: api.NODE_BUDGETS[index], threads: 1, hashMb: 32, maxPlies: 400 });
      assert.deepEqual(config.evaluation.pieceValues, Object.fromEntries(api.getValueAudit().values.map(row => [row.id, row.applied])));
      assert.equal(makeSchedule(config).length, 880);
      assert.deepEqual(makeSchedule(config), makeSchedule(configs[0]));
      const declaration = api.getBatchDeclaration(batchIndex, config.engine.nodes);
      assert.equal(declaration.metadata.scheduledGames, 880);
      assert.deepEqual(declaration.metadata.comparisons.map(row => row.kind), [...Array(45).fill('head'), ...Array(10).fill('baseline')]);
    }
    for (const reference of getOfficialReferences().roster) assert.deepEqual(configs[0].evaluation.pieceValues[reference.id], reference.engineValue);
  }
  assert.throws(() => api.buildConfig({ batchIndex: 0, nodes: 100000 }), /budgets/);
  assert.throws(() => api.buildConfig({ batchIndex: 8, nodes: 20000 }), /batchIndex/);
});

test('eight-case extensions are disjoint immutable stages with a single ten-piece profile', () => {
  const plan = api.buildCampaignPlan({ jobs: 4 });
  assert.equal(plan.stages.length, 24); assert.equal(plan.games, 21120);
  assert.equal(new Set(plan.stages.map(stage => stage.profileHash)).size, 1);
  assert.equal(new Set(plan.stages.map(stage => stage.registryHash)).size, 1);
  assert.deepEqual(api.OPENING_TARGETS.map(count => api.selectedStages(count, plan).reduce((sum, stage) => sum + stage.games, 0)), [2640, 5280, 10560, 21120]);
  assert.deepEqual(api.OPENING_TARGETS.map(api.expectedGames), [2640, 5280, 10560, 21120]);
  const first = api.selectedStages(8, plan), extension = api.selectedStages(16, plan).slice(first.length);
  assert.equal(first.length, 3); assert.equal(extension.length, 3);
  assert.equal(new Set([...first, ...extension].flatMap(stage => stage.openingIds)).size, 16);
  assert.deepEqual(first.map(stage => stage.nodes), [20000, 40000, 80000]);
  assert.throws(() => api.expectedGames(24), /total/);
  assert.throws(() => api.buildCampaignPlan({ jobs: 0 }), /jobs/);
});

test('the frozen 64-case book is fresh, quiet and spread across first-move choices in every batch', () => {
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(api.ROOT, api.OPENINGS_FILE))).digest('hex'), api.OPENINGS_SHA256);
  assert.equal(api.validateOpenings(api.OPENINGS).length, 64);
  for (let start = 0; start < 64; start += 8) {
    assert.equal(new Set(api.OPENINGS.slice(start, start + 8).map(opening => opening.moves[0])).size, 8);
    assert.equal(new Set(api.OPENINGS.slice(start, start + 8).map(opening => opening.moves[1])).size, 8);
  }
  const edited = structuredClone(api.OPENINGS); edited[0].moves[0] = 'd2d4';
  assert.throws(() => api.validateOpenings(edited), /upgraded starting piece/);
  const duplicate = structuredClone(api.OPENINGS); duplicate[1].moves = [...duplicate[0].moves];
  assert.throws(() => api.validateOpenings(duplicate), /fresh and distinct/);
  const short = structuredClone(api.OPENINGS); short[0].moves.pop();
  assert.throws(() => api.validateOpenings(short), /exactly four/);
});

test('every real ten-piece army, physical color and 64-case opening validates without any match search', async () => {
  const config = { ...api.buildConfig({ batchIndex: 0, nodes: 20000 }), openings: api.OPENINGS };
  const checked = await validateDesignConfig(config, { standardOpeningSources: true });
  assert.equal(checked.games, 7040); assert.equal(checked.validatedOpenings, 7040); assert.equal(checked.native, false);
});
