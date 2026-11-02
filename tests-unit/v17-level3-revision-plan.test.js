'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSchedule } = require('../scripts/balance/plan');
const { getDesign } = require('../src/design-catalog');
const { TRIALS } = require('../src/balance-designs-v17-revisions');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { getEvaluation, getReceipt } = require('../scripts/balance/v17-level3-revision-values');
const { OPENINGS } = require('../scripts/balance/v17-level2-bridge');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const api = require('../scripts/balance/v17-level3-revision-plan');

function fixture() {
  const declaration = api.loadExperiment(), { config } = declaration, schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const manifest = { config, schedule, designRegistry: registry, designProfile: { variant: profile.variant, hash: profile.hash, registryHash: registry.hash } };
  const records = schedule.map(game => ({ id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
    openingId: game.openingId, openingMoves: game.openingMoves, repetition: 1, aColor: game.aColor,
    attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'synthetic-report-fixture-only',
    profileHash: profile.hash, registryHash: registry.hash, registryReference: 'run.json#designRegistry', variant: profile.variant,
    engine: config.engine, evaluation: config.evaluation,
    whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
    blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB }));
  return { declaration, manifest, records };
}

test('six new identities meet only the four frozen references in exactly 768 paired slots', () => {
  const declaration = api.loadExperiment(), schedule = makeSchedule(declaration.config);
  assert.equal(schedule.length, 768); assert.equal(declaration.config.comparisons.length, 24);
  assert.deepEqual(makeSchedule(declaration.config), schedule);
  assert.equal(new Set(schedule.map(game => game.id)).size, 768);
  const trialIds = new Set(TRIALS.map(trial => trial.id)), referenceIds = new Set(getOfficialReferences().roster.map(reference => reference.id));
  const frequencies = new Map();
  for (const comparison of declaration.config.comparisons) {
    const a = [...Object.values(comparison.armyA.upgrades), ...(comparison.armyA.reserve || []).map(entry => entry.id)];
    const b = Object.values(comparison.armyB.upgrades);
    assert.equal(a.length, 1); assert.equal(b.length, 1); assert.ok(trialIds.has(a[0])); assert.ok(referenceIds.has(b[0]));
    assert.equal(getDesign(a[0]).level, 3); assert.equal(getDesign(b[0]).level, 3);
    frequencies.set(a[0], (frequencies.get(a[0]) || 0) + 1);
  }
  assert.deepEqual([...frequencies.values()], [4, 4, 4, 4, 4, 4]);
  assert.ok(!JSON.stringify(declaration.config).includes('knight.purple@4'));
  assert.ok(!JSON.stringify(declaration.config).includes('queen.xray-omni@1'));
  assert.ok(JSON.stringify(declaration.config).includes('queen.xray-rook@1'));
  for (let index = 0; index < schedule.length; index += 2) {
    assert.equal(schedule[index].pairId, schedule[index + 1].pairId); assert.notEqual(schedule[index].aColor, schedule[index + 1].aColor);
  }
  assert.deepEqual(declaration.config.openings, OPENINGS);
  assert.deepEqual(declaration.config.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.deepEqual(declaration.config.evaluation, getEvaluation(api.selectedIds()));
  assert.deepEqual(declaration.metadata.evaluationAudit, getReceipt());
});

test('candidate movements, promotions and finite reserve prices stay exact without replacing royal kings', () => {
  const rows = api.trialRows(), registry = createDesignRegistry(api.loadExperiment().config), profile = compileDesignProfile(registry, api.loadExperiment().config.evaluation);
  assert.deepEqual(rows.map(row => row.movement), ['BvW2vnN', 'mQ2cfQ2', 'QgR0', 'K', 'W3', 'N']);
  assert.deepEqual(rows.slice(0, 3).map(row => Object.keys(row.army.upgrades)), [['c1'], ['d2'], ['d1']]);
  for (const row of rows.slice(3)) {
    assert.deepEqual(row.army, { upgrades: {}, reserve: [{ id: row.id, count: 1 }] });
    assert.equal(getDesign(row.id).roles.pawn, false); assert.equal(getDesign(row.id).level, 3);
  }
  assert.equal(getDesign(rows[1].id).roles.pawn, true);
  assert.equal(registry.definitions.length, 10);
  assert.match(profile.config, /pieceDrops = true/); assert.match(profile.config, /capturesToHand = false/);
  assert.match(profile.config, /dropChecks = false/); assert.match(profile.config, /twoBoards = false/);
  assert.match(profile.config, /promotionPieceTypes = nbrq/);
  for (const row of rows) assert.ok(!Object.hasOwn(row.army.upgrades, 'e1'));
});

test('all 768 actual army/color/opening positions validate without scored games', async () => {
  const checked = await validateDesignConfig(api.loadExperiment().config, { standardOpeningSources: true });
  assert.equal(checked.games, 768); assert.equal(checked.validatedOpenings, 768); assert.equal(checked.native, false);
});

test('six-by-four matrices retain equal-reference overall scores, fixed halves and physical-color diagnostics', () => {
  const f = fixture(); f.records.forEach(record => { record.result = '1-0'; });
  const report = api.createReport(f);
  assert.equal(report.progress.completePairs, 384); assert.equal(report.matrix.rows.length, 6); assert.equal(report.matrix.columns.length, 4);
  for (const current of [report, ...report.cohorts.map(cohort => cohort.report)]) {
    const count = current === report ? 64 : 32;
    for (const row of current.overall.rows) {
      assert.equal(row.score, 0.5); assert.equal(row.games, count * 2);
      assert.deepEqual(row.physicalColors, [
        { color: 'w', games: count, wins: count, draws: 0, losses: 0, score: 1 },
        { color: 'b', games: count, wins: 0, draws: 0, losses: count, score: 0 },
      ]);
    }
  }
  const markdown = api.renderReport(report);
  assert.match(markdown, /First fixed eight/); assert.match(markdown, /White score.*Black score/);
  assert.match(markdown, /four references/); assert.match(markdown, /not fitted material/);
  assert.match(markdown, /Declared engine search values/); assert.match(markdown, /Automatic raw MG \/ EG \| Applied MG \/ EG/);
  assert.match(markdown, /\| `W3` \| 705 \/ 773 \| 563 \/ 635 \|/);
  assert.match(markdown, /\| `N` \| 773 \/ 866 \| 773 \/ 866 \|/);
  assert.equal(report.evaluationAudit, f.declaration.metadata.appliedValueAudit);
});

test('truncated partners and uneven completions cannot leak into shared-case or physical-color scores', () => {
  const f = fixture(), id = f.declaration.config.comparisons[0].id, rowKey = f.declaration.metadata.comparisons[0].aKey;
  f.records.forEach(record => { record.result = '1-0'; });
  const target = f.records.find(record => record.comparisonId === id && record.openingId === OPENINGS[0].id);
  Object.assign(target, { status: 'truncated', result: '*', reason: 'max-plies' });
  f.records = f.records.filter(record => !(record.comparisonId === id && record.openingId === OPENINGS[1].id && record.aColor === 'b'));
  const report = api.createReport(f), row = report.overall.rows.find(item => item.key === rowKey);
  assert.equal(row.openingCoverage.shared, 14); assert.equal(row.games, 112);
  assert.deepEqual(row.physicalColors.map(color => color.games), [56, 56]);
  assert.deepEqual(report.cohorts.map(cohort => cohort.report.overall.rows.find(item => item.key === rowKey).physicalColors.map(color => color.games)), [[24, 24], [32, 32]]);
  const firstEight = new Set(OPENINGS.slice(0, 8).map(opening => opening.id));
  const partial = fixture(), records = partial.records.filter(record => firstEight.has(record.openingId));
  const baseline = api.createReport({ ...partial, records });
  const extras = partial.records.filter(record => record.comparisonId === id && record.openingId === OPENINGS[8].id);
  extras.forEach(record => { record.result = record.aColor === 'w' ? '1-0' : '0-1'; });
  const after = api.createReport({ ...partial, records: [...records, ...extras] });
  assert.deepEqual(after.overall, baseline.overall); assert.deepEqual(after.cohorts[0], baseline.cohorts[0]);
});

test('copied earlier attempts cannot replace final attempts in color diagnostics', () => {
  const f = fixture(), target = f.records[0], aborted = { ...target, status: 'aborted', result: '*', reason: 'synthetic-cancellation' };
  const completed = { ...target, attempt: 2 };
  const records = [aborted, completed, ...f.records.slice(1), structuredClone(aborted)];
  const report = api.createReport({ ...f, records });
  assert.deepEqual(report.overall, api.createReport(f).overall);
  assert.equal(report.progress.duplicateCopiesIgnored, 1); assert.equal(report.progress.pairedGames, 768);
});

test('empty reports remain pending and strict full-context validation rejects changed settings or values', () => {
  const f = fixture(), pending = api.createReport({ ...f, records: [] });
  assert.ok(pending.overall.rows.every(row => row.score === null && row.physicalColors.every(color => color.games === 0 && color.score === null)));
  assert.doesNotMatch(api.renderReport(pending), /50\.00%/);
  for (const mutate of [record => record.engine.nodes++, record => record.evaluation.pieceValues[TRIALS[0].id].mg++,
    record => record.openingMoves[0] = 'h2h4', record => record.profileHash = 'changed']) {
    const changed = fixture(); changed.records = structuredClone(changed.records); mutate(changed.records[0]);
    assert.throws(() => api.createReport(changed), /context|profile/);
  }
});
