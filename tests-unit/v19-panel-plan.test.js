'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plan = require('../scripts/balance/v19-panel-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');

function context(batchIndex = 0) {
  const declaration = plan.getBatchDeclaration('level1', batchIndex), schedule = makeSchedule(declaration.config);
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  const cells = new Map(declaration.metadata.comparisons.map(cell => [cell.id, cell]));
  const references = new Set(plan.references('level1').map(row => row.key));
  const records = schedule.map(game => {
    const cell = cells.get(game.comparisonId), target = 'positional-knight';
    const isA = cell.aKey === target, isB = cell.bKey === target;
    const opponent = isA ? cell.bKey : cell.aKey;
    const aScore = !isA && !isB ? 0.5 : Number(isA !== references.has(opponent));
    return { ...game, attempt: 1, status: 'completed', result: aScore === 0.5 ? '1/2-1/2' : (aScore === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
      reason: aScore === 0.5 ? 'threefold-repetition' : 'checkmate', profileHash: profile.hash, registryHash: registry.hash,
      variant: profile.variant, registryReference: 'run.json#designRegistry', engine: declaration.config.engine,
      evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
  return { batchIndex, nodes: 40000, records, manifest: { runId: `synthetic-${batchIndex}`, config: declaration.config, schedule,
    designRegistry: registry, designProfile: profile } };
}

test('one-purchase round robins preserve both colors, tier budgets, shared book and bounded extension', () => {
  assert.throws(() => plan.verifyFrozenInputs(file => file === 'experiments/designs/v19-roster.json'
    ? Buffer.from('changed') : fs.readFileSync(path.join(plan.ROOT, file))), /frozen version-19 declaration changed/);
  for (const [study, count] of [['level1', 11], ['level2', 12], ['level3', 11]]) {
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(campaign.stages.length, 8);
    assert.equal(plan.expectedGames(study, 16), count * (count - 1) * 16);
    assert.equal(plan.selectedStages(16, campaign).length, 2);
    assert.equal(plan.selectedStages(32, campaign).length, 4);
    assert.equal(plan.matches(study).length, count * (count - 1) / 2);
    const declaration = plan.getBatchDeclaration(study, 0), schedule = makeSchedule(declaration.config);
    assert.equal(schedule.length, count * (count - 1) * 8);
    assert.deepEqual(declaration.config.openings, plan.OPENINGS.slice(0, 8));
    assert.equal(createDesignRegistry(declaration.config).definitions.length, count);
    for (const candidate of plan.candidates(study)) {
      assert.equal(candidate.count, 1);
      assert.equal(candidate.upgradePoints, Number(study.at(-1)));
      assert.equal(Object.keys(candidate.army.upgrades).length + (candidate.army.reserve?.reduce((sum, row) => sum + row.count, 0) || 0), 1);
    }
    const pairs = new Map();
    for (const game of schedule) { const colors = pairs.get(game.pairId) || []; colors.push(game.aColor); pairs.set(game.pairId, colors); }
    for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
    assert.deepEqual(plan.buildCampaignPlan({ study, jobs: 4 }), campaign);
  }
  assert.throws(() => plan.getBatchDeclaration('level3', 0, 80000));
  assert.throws(() => plan.expectedGames('level1', 24));
  for (let batch = 0; batch < 8; batch++) assert.equal(new Set(plan.BOOK.openings.slice(batch * 8, batch * 8 + 8).map(row => row.family)).size, 8);
  assert.equal(new Set(plan.BOOK.openings.map(row => row.ordinaryFen.split(' ').slice(0, 4).join(' '))).size, 64);
});

test('reports keep reference and whole-roster baskets separate, orient colors and retain direct matchups', () => {
  const stage = context(), report = plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [stage]);
  const row = report.rows.find(row => row.key === 'positional-knight');
  assert.equal(row.allOpponents.score, 0.7);
  assert.equal(row.fixedReferences.score, 0);
  assert.deepEqual(row.allOpponents.physicalColors.map(color => color.score), [0.7, 0.7]);
  assert.equal(row.fixedReferences.opponents.length, 3);
  assert.equal(report.progress.completePairs, 440);
  for (const reference of report.rows.filter(row => row.reference)) assert.equal(reference.fixedReferences.opponents.length, 2);
  const copy = structuredClone(stage);
  const failed = copy.records.find(record => record.comparisonId.includes('positional-knight') && record.comparisonId.includes('two-step-pawn'));
  Object.assign(failed, { status: 'truncated', result: '*', reason: 'max-plies' });
  const partial = plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [copy]);
  const partialRow = partial.rows.find(row => row.key === 'positional-knight');
  assert.equal(partial.progress.completePairs, 439);
  assert.equal(partialRow.allOpponents.openingCoverage.shared, 7);
  assert.equal(partialRow.cells.find(cell => cell.key === 'wazzap-knight').openingCoverage.shared, 8);
  assert.equal(partialRow.cells.find(cell => cell.key === 'two-step-pawn').games, 14);
  assert.match(plan.renderReport(partial), /Fixed references/);
  assert.match(plan.renderReport(partial), /truncations and errors remain unscored/);
});

test('cumulative reports exclude duplicate stages and reject changed archived semantics', () => {
  const first = context(0), second = context(1);
  const report = plan.reportStudy({ study: 'level1', targetOpenings: 16 }, [first, second]);
  assert.equal(report.progress.finalizedGames, 1760);
  assert.equal(report.rows[0].allOpponents.openingCoverage.shared, 16);
  assert.throws(() => plan.reportStudy({ study: 'level1', targetOpenings: 16 }, [first, first]), /repeated/);
  const changed = structuredClone(first); changed.manifest.designProfile.hash = '0'.repeat(64);
  assert.throws(() => plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [changed]), /semantic profile/);
  const bad = structuredClone(first); bad.records[0].registryHash = '0'.repeat(64);
  assert.throws(() => plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [bad]), /registry|rules|profile/i);
});
