'use strict';

// Legality and synthetic outcome fixtures only. No engine searches or scored
// scientific games are played by this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const rootCatalog = require('../src/design-catalog');

const ROOT = path.resolve(__dirname, '..');
const overlay = ensureResearchOverlay({ root: ROOT, name: 'knight-pawn-followup-plan-test',
  entryFile: 'scripts/nightrider-balance.js', definitionFile: 'src/balance-designs-knight-pawn-followup.js' });
const plan = require(path.join(overlay.directory, 'scripts/balance/knight-pawn-followup-plan'));
const { makeSchedule } = require(path.join(overlay.directory, 'scripts/balance/plan'));
const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));

function context() {
  const declaration = plan.loadExperiment(20000), schedule = makeSchedule(declaration.config);
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  return { declaration, schedule, registry, profile, manifest: { runId: 'synthetic-knight-pawn-followup',
    config: declaration.config, schedule, designRegistry: registry, designProfile: profile } };
}
function recordsFor(input) {
  const groups = new Map(input.declaration.metadata.comparisons.map(row => [row.id, row]));
  const scores = { original: [0, 0.5], 'tall-captures': [0.5, 1], 'tall-quiet': [0.5, 0.5] };
  return input.schedule.map(game => {
    const body = groups.get(game.comparisonId).bodyKey, score = scores[body][game.aColor === 'w' ? 0 : 1];
    return { ...game, attempt: 1, status: 'completed',
      result: score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
      reason: score === 0.5 ? 'threefold-repetition' : 'checkmate', profileHash: input.profile.hash,
      registryHash: input.profile.registryHash, variant: input.profile.variant, registryReference: 'run.json#designRegistry',
      engine: input.declaration.config.engine, evaluation: input.declaration.config.evaluation,
      whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
}

test('the archived research study still resolves both candidates while version 18 activates only its selected pawn', () => {
  assert.deepEqual(plan.BODIES.map(body => body.movement), ['fmWfceFifmnDfhN', 'ifmnDfmWfceFfsNfceN', 'ifmnDfmWfceFfsNfmN']);
  assert.equal(rootCatalog.getDesign('pawn.orange@3').movement, 'fmWfceFifmnDfhN');
  const definitions = require('../src/balance-designs-knight-pawn-followup').NEW_DEFINITIONS;
  assert.deepEqual(rootCatalog.getDesign('pawn.knight-tall-quiet@1'),
    definitions.find(row => row.id === 'pawn.knight-tall-quiet@1'));
  assert.equal(rootCatalog.getDesign('pawn.knight-tall-capture@1'), undefined);
  assert.throws(() => require('../scripts/balance/knight-pawn-followup-plan').loadExperiment(20000), /isolated research runtime/);
  assert.throws(() => plan.loadExperiment(40000));
});

test('the bounded factorial plan declares2304 games with all partners and both genuine placements', () => {
  const campaign = plan.buildPlan(4), input = context(), teams = plan.logicalTeams();
  assert.equal(campaign.games, 2304); assert.equal(campaign.stages.length, 1); assert.equal(campaign.stages[0].games, 2304);
  assert.equal(input.schedule.length, 2304); assert.equal(new Set(input.schedule.map(game => game.pairId)).size, 1152);
  assert.equal(input.declaration.config.comparisons.length, 72); assert.equal(teams.length, 9);
  assert.ok(teams.every(team => team.budget === 3 && team.layouts.length === 2));
  for (const team of teams) {
    assert.notDeepEqual(team.layouts[0].army, team.layouts[1].army);
    assert.deepEqual(team.layouts.map(layout => layout.slots.level2), ['e2', 'c2']);
    for (const layout of team.layouts) {
      assert.ok(Object.values(layout.army.upgrades).includes(team.members[1]));
      if (team.partnerKey === 'pawn-grant') {
        assert.equal(Object.keys(layout.army.upgrades).length, 1);
        assert.deepEqual(layout.army.reserve, [{ id: 'king.reserve-pawn@6', count: 1 }]);
      } else { assert.equal(Object.keys(layout.army.upgrades).length, 2); assert.deepEqual(layout.army.reserve, []); }
    }
  }
  for (const jobs of [0, 17, 1.5]) assert.throws(() => plan.buildPlan(jobs));
});

test('sixteen fresh cases exclude the ongoing first32 and original focus discovery cases', () => {
  const master = require('../experiments/balance/v17-level3-panel-openings.json');
  assert.deepEqual(plan.OPENINGS, master.slice(32, 48));
  const historical = new Set([...master.slice(0, 32), ...master.slice(56, 64)].map(opening => opening.id));
  assert.ok(plan.OPENINGS.every(opening => !historical.has(opening.id) && opening.moves.length === 4));
  const declaration = plan.loadExperiment(20000);
  assert.deepEqual(declaration.metadata.openingCohorts.map(cohort => cohort.openingIds.length), [8, 8]);
});

test('all pawn bodies share536/592 while selected partner and frozen reference priors remain unchanged', () => {
  const input = context(), values = input.declaration.config.evaluation.pieceValues;
  for (const body of plan.BODIES) assert.deepEqual(values[body.id], { mg: 536, eg: 592 });
  const baseline = require(path.join(overlay.directory, 'scripts/balance/v17-bracket-values')).readSnapshot();
  for (const partner of plan.partners()) assert.deepEqual(values[partner.id], baseline.values.find(row => row.id === partner.id).applied);
  for (const reference of plan.references()) assert.deepEqual(values[reference.id], reference.engineValue);
  assert.equal(Object.keys(values).length, 10); assert.equal(input.registry.definitions.length, 10);
  for (const body of plan.BODIES) {
    const definition = input.registry.definitions.find(row => row.id === body.id);
    assert.equal(definition.roles.pawn, true); assert.equal(definition.roles.enPassant, true);
    const letter = input.registry.allocations.find(row => row.id === body.id).letter;
    assert.match(input.profile.config, new RegExp(`pawnTypes = [a-z]*${letter}`));
    assert.match(input.profile.config, new RegExp(`enPassantTypes = [a-z]*${letter}`));
  }
  assert.match(input.profile.config, /promotionPieceTypes = nbrq/);
  assert.match(input.profile.config, /pieceDrops = true/); assert.match(input.profile.config, /dropChecks = false/);
});

test('all2304army/color/opening cases pass browser legality without searches', { timeout: 90000 }, async () => {
  const { validateDesignConfig } = require(path.join(overlay.directory, 'scripts/balance/validate-designs'));
  const proof = await validateDesignConfig(context().declaration.config, { standardOpeningSources: true });
  assert.equal(proof.native, false); assert.equal(proof.games, 2304); assert.equal(proof.validatedOpenings, 2304);
});

test('body reports equally weight complete partners and placements and retain color and cohort diagnostics', () => {
  const input = context(), records = recordsFor(input);
  const report = plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records }]);
  const stage = report.reports[0];
  assert.deepEqual(stage.bodies.map(body => body.score), [0.25, 0.75, 0.5]);
  assert.deepEqual(stage.bodies.map(body => body.games), [768, 768, 768]);
  assert.deepEqual(stage.bodies.map(body => body.openingCoverage.shared), [16, 16, 16]);
  assert.deepEqual(stage.gains.map(gain => gain.difference), [0.5, 0.25]);
  assert.equal(stage.teams.length, 9); assert.equal(stage.placements.length, 6);
  assert.ok(stage.teams.every(team => team.games === 256));
  assert.ok(stage.placements.every(row => row.games === 384));
  assert.deepEqual(stage.bodies[0].physicalColors.map(color => color.score), [0, 0.5]);
  assert.deepEqual(stage.cohorts.map(cohort => cohort.bodies[0].openingCoverage.shared), [8, 8]);
  const markdown = plan.renderReport(report);
  assert.ok(markdown.includes('75.00%')); assert.ok(markdown.includes('Gain over current pawn'));
});

test('truncation excludes a whole matched opening for body gains while copied attempts add no weight', () => {
  const input = context(), records = recordsFor(input), changed = structuredClone(records);
  const originalMatch = input.declaration.metadata.comparisons.find(row => row.bodyKey === 'original');
  const truncated = changed.find(record => record.comparisonId === originalMatch.id);
  truncated.status = 'truncated'; truncated.result = '*'; truncated.reason = 'max-plies';
  const report = plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records: changed }]);
  assert.deepEqual(report.reports[0].bodies.map(body => body.openingCoverage.shared), [15, 16, 16]);
  assert.deepEqual(report.gains.map(gain => gain.sharedOpenings), [15, 15]);
  assert.deepEqual(report.gains.map(gain => gain.difference), [0.5, 0.25]);
  const duplicate = plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records: [...records, records[0]] }]);
  assert.equal(duplicate.reports[0].report.progress.pairedGames, 2304);
  assert.deepEqual(duplicate.reports[0].bodies.map(body => body.games), [768, 768, 768]);
  const invalid = structuredClone(records); invalid[0].engine.nodes = 80000;
  assert.throws(() => plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 20000, manifest: input.manifest, records: invalid }]), /context changed/);
});
