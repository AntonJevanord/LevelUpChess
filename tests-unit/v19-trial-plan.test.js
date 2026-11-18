'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const { OVERLAY } = require('../scripts/v19-trials');
const rootCatalog = require('../src/design-catalog');
const definitions = require('../src/balance-designs-v19-trials').NEW_DEFINITIONS;
const { TRIALS } = require('../src/balance-designs-v19-trials');
const overlay = ensureResearchOverlay(OVERLAY);
const plan = require(path.join(overlay.directory, 'scripts/balance/v19-trial-plan'));
const { makeSchedule } = require(path.join(overlay.directory, 'scripts/balance/plan'));
const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));

function context(study = 'level1', batchIndex = 0, tools = plan) {
  const declaration = tools.getBatchDeclaration(study, batchIndex), schedule = makeSchedule(declaration.config);
  const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
  const records = schedule.map(game => ({ ...game, attempt: 1, status: 'completed',
    result: game.aColor === 'w' ? '1-0' : '0-1', reason: 'checkmate', profileHash: profile.hash,
    registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: declaration.config.engine, evaluation: declaration.config.evaluation,
    whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  return { batchIndex, nodes: 40000, records, manifest: { runId: `trial-${study}-${batchIndex}`, config: declaration.config,
    schedule, designRegistry: registry, designProfile: profile } };
}

test('unselected trials remain isolated, fixed references stay unchanged and all games use one purchase', () => {
  const selectedIds = new Set(require('../src/designs-v19-current').NEW_DEFINITIONS.map(row => row.id));
  for (const definition of definitions) {
    if (selectedIds.has(definition.id)) assert.deepEqual(rootCatalog.getDesign(definition.id), definition);
    else assert.equal(rootCatalog.getDesign(definition.id), undefined);
  }
  const totals = { level1: 192, level2: 96, level3: 320 };
  assert.equal(Object.values(totals).reduce((a, b) => a + b), 608);
  for (const study of plan.STUDIES) {
    assert.equal(plan.expectedGames(study, 8), totals[study]);
    const campaign = plan.buildCampaignPlan({ study, jobs: 4 });
    assert.equal(campaign.stages.length, 8);
    assert.equal(plan.selectedStages(8, campaign).length, 1);
    assert.equal(plan.selectedStages(16, campaign).length, 2);
    assert.equal(plan.selectedStages(32, campaign).length, 4);
    const declaration = plan.getBatchDeclaration(study, 0), schedule = makeSchedule(declaration.config);
    assert.equal(schedule.length, totals[study]);
    assert.equal(createDesignRegistry(declaration.config).definitions.length <= 20, true);
    const pairs = new Map();
    for (const game of schedule) { const colors = pairs.get(game.pairId) || []; colors.push(game.aColor); pairs.set(game.pairId, colors); }
    for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
    for (const row of [...plan.candidates(study), ...plan.references(study)]) {
      assert.equal(row.upgradePoints, Number(study.at(-1)));
      assert.equal(Object.keys(row.army.upgrades).length + (row.army.reserve?.reduce((sum, item) => sum + item.count, 0) || 0), 1);
    }
  }
  assert.throws(() => plan.getBatchDeclaration('level1', 0, 80000));
  assert.throws(() => plan.expectedGames('level2', 24));
});

test('requested movements expand literally and every bracket keeps controlled family priors', () => {
  assert.deepEqual(plan.candidates('level1').filter(row => !row.control).map(row => row.movement), ['QfsN', 'QAD']);
  assert.deepEqual(plan.candidates('level2').map(row => row.movement), ['B2vR2', 'fQ2mbQ2']);
  const pawns = plan.candidates('level3').filter(row => row.family === 'pawn' && !row.control);
  assert.deepEqual(pawns.map(row => row.movement), ['ifmnDfmWfceFN', 'ifmnDfmWfceFsNfN', 'ifmnDfmWfceFfhN']);
  for (const row of plan.candidates('level1')) assert.deepEqual(row.prior, { mg: 2771, eg: 2833 });
  for (const row of plan.candidates('level2')) assert.deepEqual(row.prior, { mg: 536, eg: 592 });
  for (const row of pawns) assert.deepEqual(row.prior, { mg: 762, eg: 808 });
  assert.deepEqual(plan.candidates('level3').find(row => row.movement === 'QgsQ0').prior, { mg: 3772, eg: 3470 });
  assert.deepEqual(plan.candidates('level3').find(row => row.control).prior, { mg: 418, eg: 436 });
});

test('trial scores use only complete reference pairs, preserving colors and direct-cell coverage', () => {
  const stage = context(), report = plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [stage]);
  assert.equal(report.progress.completePairs, 96);
  for (const row of report.rows) {
    assert.equal(row.score, 1); assert.deepEqual(row.physicalColors.map(color => color.score), [1, 1]);
    assert.equal(row.openingCoverage.shared, 8); assert.equal(row.cells.length, 3);
  }
  const partial = structuredClone(stage), failed = partial.records[0];
  Object.assign(failed, { status: 'truncated', result: '*', reason: 'max-plies' });
  const trimmed = plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [partial]);
  assert.equal(trimmed.progress.completePairs, 95);
  const affected = trimmed.rows.find(row => failed.comparisonId.startsWith(row.key + '-v-'));
  assert.equal(affected.openingCoverage.shared, 7);
  assert.ok(affected.cells.some(cell => cell.openingCoverage.shared === 8));
  assert.equal(affected.score, 1);
  assert.match(plan.renderReport(trimmed), /QsfN/);
  assert.match(plan.renderReport(trimmed), /P.*ifmnDfmWfceF/);
});

test('cumulative trial reporting keeps batch identities and rejects changed profiles or duplicate stages', () => {
  const first = context(), second = context('level1', 1);
  const report = plan.reportStudy({ study: 'level1', targetOpenings: 16 }, [first, second]);
  assert.equal(report.progress.finalizedGames, 384);
  assert.equal(report.rows[0].openingCoverage.shared, 16);
  assert.throws(() => plan.reportStudy({ study: 'level1', targetOpenings: 16 }, [first, first]), /Duplicate/);
  const changed = structuredClone(first); changed.manifest.designProfile.hash = '0'.repeat(64);
  assert.throws(() => plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [changed]), /profile or schedule changed/);
  const corrupt = structuredClone(first); corrupt.records[0].registryHash = '0'.repeat(64);
  assert.throws(() => plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [corrupt]), /registry|rules|profile/i);
});

test('the plan factory preserves all original declarations, schedules and compiled profiles byte for byte', () => {
  // Captured before extracting the factory, including all eight published batches.
  const expected = {
    level1: 'ff5e4f2f8b978c3b873181f8d1c6d89018f922fde57e25cea1dbf852eb27c05b',
    level2: '6f9f810e889987da1ce6c5aa9e95504af934c74a991a6527e70534ceb7e1d53e',
    level3: 'feadf400aadad53be5f22d1e220b34370d03fa578e47d9492ee7a9b01bf2d31e',
  };
  for (const study of plan.STUDIES) {
    const batches = Array.from({ length: 8 }, (_, index) => {
      const declaration = plan.getBatchDeclaration(study, index), schedule = makeSchedule(declaration.config);
      const registry = createDesignRegistry(declaration.config), profile = compileDesignProfile(registry, declaration.config.evaluation);
      return { declaration, schedule, registry, profile };
    });
    assert.equal(createHash('sha256').update(JSON.stringify(batches)).digest('hex'), expected[study], study);
  }
});

test('a separate follow-up reuses reference/reporting logic while owning its trial identities and notes', () => {
  const rows = TRIALS.filter(row => row.level === 2).map(row => ({ ...row }));
  const custom = plan.createTrialPlan({ trials: rows, revisionProbes: () => [], controlsForTier: () => [],
    format: 'levelup-v19-test-pawn-followup', experimentPrefix: 'v19-test-pawn-followup',
    question: 'Compare the declared pawn revisions.', valuePolicy: 'Fixed pawn-family search priors.',
    movementNotes: 'Only the follow-up pawn movement conventions apply.' });
  rows[0].label = 'Caller mutation must not rewrite the plan';
  const campaign = custom.buildCampaignPlan({ study: 'level2', jobs: 2 });
  assert.equal(campaign.format, 'levelup-v19-test-pawn-followup');
  assert.equal(campaign.roster.length, 2);
  assert.equal(custom.expectedGames('level2', 8), 96);
  assert.equal(campaign.roster[0].label, TRIALS.find(row => row.level === 2).label);
  assert.deepEqual(custom.references('level2'), plan.references('level2'));
  for (const row of campaign.roster) assert.deepEqual(row.prior, { mg: 536, eg: 592 });
  const declaration = custom.getBatchDeclaration('level2', 0);
  assert.equal(declaration.experiment, 'v19-test-pawn-followup-level2-b1');
  assert.equal(declaration.metadata.kind, 'v19-test-pawn-followup');
  assert.equal(declaration.metadata.question, 'Compare the declared pawn revisions.');
  assert.deepEqual(declaration.config, plan.getBatchDeclaration('level2', 0).config,
    'a different ownership context can deliberately reuse unchanged configured matchups');
  const report = custom.reportStudy({ study: 'level2', targetOpenings: 8 }, [context('level2', 0, custom)]);
  assert.equal(report.format, 'levelup-v19-test-pawn-followup-report');
  assert.equal(report.rows.length, 2);
  assert.equal(report.progress.completePairs, 48);
  assert.equal(report.openingEvaluations.counts.missing, 96);
  const markdown = custom.renderReport(report);
  assert.match(markdown, /Only the follow-up pawn movement conventions apply/);
  assert.doesNotMatch(markdown, /QsfN|eight, six or four/);
  assert.match(markdown, /Fixed pawn-family search priors/);
});

test('factory validation rejects ambiguous candidates without resolving future definitions outside their snapshot', () => {
  const candidate = { ...TRIALS.find(row => row.level === 2) };
  for (const trials of [[], [candidate, candidate], [candidate, { ...candidate, id: candidate.id + '-other' }],
    [candidate, { ...candidate, key: candidate.key + '-other' }], [{ ...candidate, level: 4 }],
    [{ ...candidate, anchorId: 'unknown.anchor@1' }], [{ ...candidate, anchorId: 'queen.level1-forward-knight@1' }]]) {
    assert.throws(() => plan.createTrialPlan({ trials }));
  }
  assert.throws(() => plan.createTrialPlan({ trials: [candidate], format: '../other' }));
  assert.throws(() => plan.createTrialPlan({ trials: [candidate], revisionProbes: null }));
  assert.throws(() => plan.createTrialPlan({ trials: [candidate], movementNotes: '' }));
  const future = plan.createTrialPlan({ trials: [{ ...candidate, id: 'pawn.future-research-only@1' }] });
  assert.equal(rootCatalog.getDesign('pawn.future-research-only@1'), undefined);
  assert.throws(() => future.candidates('level2'), /isolated owned research runtime/);
  const wrongTierControl = plan.createTrialPlan({ trials: [candidate],
    controlsForTier: () => [['wrong', 'Wrong tier', 'queen.level1-forward-knight@1']] });
  assert.throws(() => wrongTierControl.candidates('level2'), /same tier/);
  const repeatedControl = plan.createTrialPlan({ trials: [candidate],
    controlsForTier: () => [[candidate.key, 'Repeated candidate', candidate.anchorId]] });
  assert.throws(() => repeatedControl.candidates('level2'), /repeat a candidate/);
});
