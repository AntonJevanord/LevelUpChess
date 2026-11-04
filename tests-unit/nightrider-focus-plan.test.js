'use strict';

// Synthetic outcome fixtures and legality checks only; no engine searches or
// scientific match games. New IDs resolve only in the owned source snapshot.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const rootCatalog = require('../src/design-catalog');
const ROOT = path.resolve(__dirname, '..');
const overlay = ensureResearchOverlay({ root: ROOT });
const plan = require(path.join(overlay.directory, 'scripts/balance/nightrider-focus-plan'));
const { makeSchedule } = require(path.join(overlay.directory, 'scripts/balance/plan'));
const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
const { getOfficialReferences } = require(path.join(overlay.directory, 'scripts/balance/official-references'));
const { assertV17CloseoutIdentity } = require('./helpers/v17-closeout-identity');
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');

function context(nodes = 20000) {
  const declaration = plan.loadExperiment(nodes), registry = createDesignRegistry(declaration.config);
  const profile = compileDesignProfile(registry, declaration.config.evaluation), schedule = makeSchedule(declaration.config);
  return { declaration, registry, profile, schedule, manifest: { runId: `synthetic-focus-${nodes}`, config: declaration.config,
    schedule, designRegistry: registry, designProfile: profile } };
}
function recordsFor(input, scores) {
  return input.schedule.map(game => {
    const body = game.comparisonId.split('-v-')[0], values = scores[body], score = values[game.aColor === 'w' ? 0 : 1];
    const result = score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1';
    return { ...game, attempt: 1, status: 'completed', result,
      reason: score === 0.5 ? 'threefold-repetition' : 'checkmate',
      profileHash: input.profile.hash, registryHash: input.profile.registryHash, variant: input.profile.variant,
      registryReference: 'run.json#designRegistry', engine: input.declaration.config.engine,
      evaluation: input.declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
}

test('focus adds both accepted prototypes inside the snapshot without changing the active catalog', () => {
  assert.deepEqual(plan.BODIES.map(row => row.movement), ['N0', 'N0cF', 'N0cW']);
  assert.equal(plan.BODIES.length, 3);
  for (const body of plan.BODIES.slice(1)) assert.equal(rootCatalog.getDesign(body.id), undefined);
  assert.equal(rootCatalog.getDesign('knight.purple@4').movement, 'N0');
  assert.throws(() => require('../scripts/balance/nightrider-focus-plan').loadExperiment(20000), /isolated research runtime/);
});

test('three separate node budgets declare576 paired games and preserve identical controls/openings', () => {
  const campaign = plan.buildPlan(4);
  assert.equal(campaign.games, 576); assert.equal(campaign.jobs, 4);
  assert.deepEqual(campaign.stages.map(row => row.nodes), [20000, 40000, 80000]);
  assert.deepEqual(campaign.stages.map(row => row.games), [192, 192, 192]);
  const contexts = plan.NODES.map(context);
  assert.equal(new Set(contexts.map(row => row.registry.hash)).size, 1);
  assert.equal(new Set(contexts.map(row => row.profile.hash)).size, 1);
  const pairedOrder = input => input.schedule.map(row => [row.id, row.pairId, row.aColor, row.openingId]);
  for (const input of contexts) {
    assert.equal(input.declaration.config.comparisons.length, 12);
    assert.equal(input.declaration.metadata.scheduledGames, 192);
    assert.deepEqual(pairedOrder(input), pairedOrder(contexts[0]));
    assert.equal(input.schedule.length, 192);
    assert.equal(new Set(input.schedule.map(row => row.pairId)).size, 96);
    assert.deepEqual(input.declaration.config.engine, { nodes: input.declaration.config.engine.nodes, threads: 1, hashMb: 32, maxPlies: 400 });
  }
  for (const jobs of [0, 17, 1.5]) assert.throws(() => plan.buildPlan(jobs));
  for (const nodes of [0, 10000, 60000]) assert.throws(() => plan.loadExperiment(nodes));
});

test('eight holdout cases are outside the requested32-opening panel and retain their exact fixed prefixes', () => {
  const master = require('../experiments/balance/v17-level3-panel-openings.json');
  assert.deepEqual(plan.OPENINGS, master.slice(56, 64));
  assert.equal(new Set(plan.OPENINGS.map(row => row.id)).size, 8);
  const prior = new Set(master.slice(0, 32).map(row => row.id));
  assert.ok(plan.OPENINGS.every(row => !prior.has(row.id) && row.moves.length === 4));
});

test('all three bodies share N0 priors while frozen references retain their exact pairs', () => {
  const input = context(), values = input.declaration.config.evaluation.pieceValues;
  for (const body of plan.BODIES) assert.deepEqual(values[body.id], { mg: 2326, eg: 2211 });
  for (const reference of getOfficialReferences().roster) assert.deepEqual(values[reference.id], reference.engineValue);
  assert.equal(Object.keys(values).length, 7);
  assert.equal(input.registry.definitions.length, 7);
  assert.ok(!input.registry.definitions.some(row => row.movement.includes('gN')));
});

test('all192army/color/holdout combinations pass browser legality without starting matches', { timeout: 90000 }, async () => {
  const { validateDesignConfig } = require(path.join(overlay.directory, 'scripts/balance/validate-designs'));
  const proof = await validateDesignConfig(context().declaration.config, { standardOpeningSources: true });
  assert.equal(proof.native, false); assert.equal(proof.games, 192); assert.equal(proof.validatedOpenings, 192);
});

test('matched gains use equal opponents/colors and require shared complete cases for control plus revision', () => {
  const input = context(), records = recordsFor(input, { original: [0, 0.5], 'diagonal-captures': [0.5, 1], 'orthogonal-captures': [1, 1] });
  const report = plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records }]);
  assert.deepEqual(report.gains.map(row => row.sharedOpenings), [8, 8]);
  assert.deepEqual(report.gains.map(row => row.difference), [0.5, 0.75]);
  assert.ok(plan.renderReport(report).includes('50.00'));
  const changed = structuredClone(records), truncated = changed.find(row => row.comparisonId === 'original-v-amazon');
  truncated.status = 'truncated'; truncated.result = '*'; truncated.reason = 'max-plies';
  const sparse = plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records: changed }]);
  assert.deepEqual(sparse.gains.map(row => row.sharedOpenings), [7, 7]);
  assert.deepEqual(sparse.gains.map(row => row.difference), [0.5, 0.75]);
});

test('copied records add no paired evidence and conflicting contexts fail before a focused report', () => {
  const input = context(), records = recordsFor(input, { original: [0, 0.5], 'diagonal-captures': [0.5, 1], 'orthogonal-captures': [1, 1] });
  const report = plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records: [...records, records[0]] }]);
  assert.equal(report.reports[0].report.progress.pairedGames, 192);
  const bad = structuredClone(records); bad[0].engine.nodes = 80000;
  assert.throws(() => plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records: bad }]), /context changed/);
});

test('the archived version-17 runner retains the pre-panel identity while version 18 changes only its live catalog', { skip: !fs.existsSync(native) }, () => {
  const original = path.join(ROOT, 'node_modules/.cache/v17-panel-base-identity.json');
  if (!fs.existsSync(original)) return;
  assertV17CloseoutIdentity(native, JSON.parse(fs.readFileSync(original)));
});
