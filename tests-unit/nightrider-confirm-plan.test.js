'use strict';

// Synthetic recorded outcomes and rules-only validation; no scored engine games.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const liveCatalog = require('../src/design-catalog');
const overlay = ensureResearchOverlay({ root: path.resolve(__dirname, '..') });
const plan = require(path.join(overlay.directory, 'scripts/balance/nightrider-confirm-plan'));
const { makeSchedule } = require(path.join(overlay.directory, 'scripts/balance/plan'));
const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
const { getOfficialReferences } = require(path.join(overlay.directory, 'scripts/balance/official-references'));

function context(nodes) {
  const declaration = plan.loadExperiment(nodes), registry = createDesignRegistry(declaration.config);
  const profile = compileDesignProfile(registry, declaration.config.evaluation), schedule = makeSchedule(declaration.config);
  return { declaration, registry, profile, schedule, manifest: { runId: `synthetic-confirm-${nodes}`,
    config: declaration.config, schedule, designRegistry: registry, designProfile: profile } };
}

function recordsFor(input, choices) {
  return input.schedule.map(game => {
    const key = game.comparisonId.split('-v-')[0];
    const value = choices[key][game.aColor === 'w' ? 0 : 1];
    const result = value === 0.5 ? '1/2-1/2' : (value === 1) === (game.aColor === 'w') ? '1-0' : '0-1';
    return { ...game, attempt: 1, status: 'completed', result, reason: value === 0.5 ? 'threefold-repetition' : 'checkmate',
      profileHash: input.profile.hash, registryHash: input.profile.registryHash, variant: input.profile.variant,
      registryReference: 'run.json#designRegistry', engine: input.declaration.config.engine,
      evaluation: input.declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
}

function source(input, records) { return { nodes: input.declaration.config.engine.nodes, manifest: input.manifest, records }; }

test('confirmation keeps the current control and only the diagonal revision inside its research catalog', () => {
  assert.equal(plan.STUDY_KEY, 'nightrider');
  assert.deepEqual(plan.BODIES.map(row => row.movement), ['N0', 'N0cF']);
  assert.equal(liveCatalog.getDesign('knight.purple@4').movement, 'N0');
  assert.equal(liveCatalog.getDesign('knight.nightrider-diagonal-capture@1'), undefined);
  assert.throws(() => require('../scripts/balance/nightrider-confirm-plan').loadExperiment(40000), /isolated research runtime/);
});

test('the two fixed search budgets schedule exactly 512 matched games with no orthogonal revision', () => {
  const campaign = plan.buildPlan(4), contexts = plan.NODES.map(context);
  assert.equal(campaign.games, 512); assert.equal(campaign.jobs, 4);
  assert.deepEqual(campaign.stages.map(row => row.nodes), [40000, 80000]);
  assert.deepEqual(campaign.stages.map(row => row.games), [256, 256]);
  assert.deepEqual(contexts[0].schedule.map(row => [row.id, row.pairId, row.aColor, row.openingId]), contexts[1].schedule.map(row => [row.id, row.pairId, row.aColor, row.openingId]));
  for (const input of contexts) {
    assert.equal(input.declaration.config.comparisons.length, 8);
    assert.equal(input.declaration.metadata.scheduledGames, 256);
    assert.equal(input.schedule.length, 256);
    assert.equal(new Set(input.schedule.map(row => row.pairId)).size, 128);
    assert.ok(!JSON.stringify(input.declaration).includes('N0cW'));
    assert.deepEqual(input.declaration.config.engine, { nodes: input.declaration.config.engine.nodes, threads: 1, hashMb: 32, maxPlies: 400 });
  }
  assert.equal(new Set(contexts.map(row => row.registry.hash)).size, 1);
  assert.equal(new Set(contexts.map(row => row.profile.hash)).size, 1);
  for (const jobs of [0, 17, 1.5]) assert.throws(() => plan.buildPlan(jobs));
  for (const nodes of [20000, 60000]) assert.throws(() => plan.loadExperiment(nodes));
});

test('sixteen confirmation prefixes exclude the first 32 panel and earlier eight discovery cases', () => {
  const master = require('../experiments/balance/v17-level3-panel-openings.json');
  assert.deepEqual(plan.OPENINGS, master.slice(32, 48));
  const excluded = new Set([...master.slice(0, 32), ...master.slice(56, 64)].map(row => row.id));
  assert.equal(new Set(plan.OPENINGS.map(row => row.id)).size, 16);
  assert.ok(plan.OPENINGS.every(row => row.moves.length === 4 && !excluded.has(row.id)));
  assert.ok(Object.isFrozen(plan.OPENINGS) && plan.OPENINGS.every(row => Object.isFrozen(row.moves)));
});

test('all values preserve the original six-table policy rather than new automatic estimates', () => {
  const input = context(40000), values = input.declaration.config.evaluation.pieceValues;
  for (const body of plan.BODIES) assert.deepEqual(values[body.id], { mg: 2326, eg: 2211 });
  for (const reference of getOfficialReferences().roster) assert.deepEqual(values[reference.id], reference.engineValue);
  assert.equal(Object.keys(values).length, 6); assert.equal(input.registry.definitions.length, 6);
  assert.match(input.declaration.metadata.evaluationAudit.policy, /all six engine tables/);
});

test('all 256 army/color/confirmation combinations pass rules-only validation without matches', { timeout: 90000 }, async () => {
  const { validateDesignConfig } = require(path.join(overlay.directory, 'scripts/balance/validate-designs'));
  const proof = await validateDesignConfig(context(40000).declaration.config, { standardOpeningSources: true });
  assert.equal(proof.native, false); assert.equal(proof.games, 256); assert.equal(proof.validatedOpenings, 256);
});

test('matched reports distinguish gains, raw budget changes and the control-adjusted budget change', () => {
  const low = context(40000), high = context(80000);
  const lowRecords = recordsFor(low, { original: [0, 0.5], 'diagonal-captures': [0.5, 0.5] });
  const highRecords = recordsFor(high, { original: [0.5, 0.5], 'diagonal-captures': [0.5, 1] });
  const report = plan.reportStudy({ runId: 'synthetic' }, [source(low, lowRecords), source(high, highRecords)]);
  assert.deepEqual(report.gains.map(row => row.sharedOpenings), [16, 16]);
  assert.deepEqual(report.gains.map(row => row.difference), [0.25, 0.25]);
  assert.deepEqual(report.crossBudget.rawChanges.map(row => row.difference), [0.25, 0.25]);
  assert.equal(report.crossBudget.advantageChange.difference, 0);
  assert.equal(report.crossBudget.advantageChange.sharedOpenings, 16);
  assert.equal(report.crossBudget.advantageChange.sensitivity.conditionalBootstrap.lower, 0);
  assert.equal(report.crossBudget.advantageChange.sensitivity.smallSampleT.degreesOfFreedom, 15);
  assert.ok(plan.renderReport(report).includes('25.00'));
  assert.ok(plan.renderReport(report).includes('Change in N0cF-minus-N0 advantage'));
});

test('a missing or truncated control partner removes its whole opening from matched contrasts only', () => {
  const low = context(40000), high = context(80000);
  const choices = { original: [0, 0.5], 'diagonal-captures': [0.5, 1] };
  const records = recordsFor(low, choices), target = records.find(row => row.comparisonId === 'original-v-amazon');
  target.status = 'truncated'; target.result = '*'; target.reason = 'max-plies';
  const report = plan.reportStudy({ runId: 'synthetic' }, [source(low, records), source(high, recordsFor(high, choices))]);
  assert.deepEqual(report.gains.map(row => row.sharedOpenings), [15, 16]);
  assert.equal(report.gains[0].difference, 0.5);
  assert.equal(report.crossBudget.advantageChange.sharedOpenings, 15);
  assert.equal(report.reports[0].report.progress.pairedGames, 254);
  assert.equal(report.reports[1].report.progress.pairedGames, 256);
});

test('duplicate lines add no evidence, foreign stage contexts fail and incomplete reports stay pending', () => {
  const input = context(40000), records = recordsFor(input, { original: [0, 0.5], 'diagonal-captures': [0.5, 1] });
  const report = plan.reportStudy({ runId: 'synthetic' }, [source(input, [...records, records[0]])]);
  assert.equal(report.reports[0].report.progress.pairedGames, 256);
  assert.equal(report.gains[0].sharedOpenings, 16);
  assert.equal(report.crossBudget.advantageChange.sharedOpenings, 0);
  assert.equal(report.crossBudget.advantageChange.sensitivity, null);
  assert.equal(report.crossBudget.advantageChange.difference, null);
  const changed = structuredClone(records); changed[0].whiteStrength.skill = 1;
  assert.throws(() => plan.reportStudy({ runId: 'synthetic' }, [source(input, changed)]), /context changed/);
  assert.throws(() => plan.reportStudy({ runId: 'synthetic' }, [source(input, []), source(input, [])]), /distinct node budgets/);
});
