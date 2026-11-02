'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSchedule } = require('../scripts/balance/plan');
const { getDesign } = require('../src/design-catalog');
const { getLevel2References } = require('../scripts/balance/level2-references');
const { getBracketEvaluation, getBracketValueReceipt } = require('../scripts/balance/v17-bracket-values');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const api = require('../scripts/balance/v17-level2-bridge');

function fixtures() {
  const declaration = api.loadExperiment(), { config } = declaration, schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const manifest = { config, schedule, designRegistry: registry,
    designProfile: { variant: profile.variant, hash: profile.hash, registryHash: registry.hash } };
  const records = schedule.map(game => ({ id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
    openingId: game.openingId, openingMoves: game.openingMoves, repetition: 1, aColor: game.aColor,
    attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'synthetic-report-fixture-only',
    profileHash: profile.hash, registryHash: registry.hash, registryReference: 'run.json#designRegistry', variant: profile.variant,
    engine: config.engine, evaluation: config.evaluation,
    whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
    blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB }));
  return { declaration, manifest, records };
}
function win(record, won) { record.result = won === (record.aColor === 'w') ? '1-0' : '0-1'; }

test('384 slots comprise three two-point singles and nine six-point bridge cells, all color paired', () => {
  const declaration = api.loadExperiment(), schedule = makeSchedule(declaration.config), matches = api.comparisons();
  assert.equal(schedule.length, 384);
  assert.deepEqual(makeSchedule(declaration.config), schedule);
  assert.deepEqual(declaration.metadata.panels.map(panel => panel.scheduledGames), [96, 288]);
  assert.deepEqual([matches.filter(match => match.panel === 'singles').length, matches.filter(match => match.panel === 'bridge').length], [3, 9]);
  assert.equal(new Set(schedule.map(game => game.id)).size, 384);
  for (let index = 0; index < schedule.length; index += 2) {
    assert.equal(schedule[index].pairId, schedule[index + 1].pairId);
    assert.notEqual(schedule[index].aColor, schedule[index + 1].aColor);
  }
  assert.deepEqual(declaration.config.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.deepEqual(declaration.config.evaluation, getBracketEvaluation(Object.keys(declaration.config.evaluation.pieceValues)));
  assert.deepEqual(declaration.metadata.evaluationAudit, getBracketValueReceipt());
  assert.equal(declaration.metadata.selectedLevel2DeclarationSha256, getLevel2References().declarationSha256);
});

test('selected purchases retain exact movements, ordinary kings, pawn homes, finite F pockets and native L3 homes', () => {
  const { armies, doubles } = api.packages();
  assert.deepEqual(armies.map(row => [row.reference.id, getDesign(row.reference.id).movement]), [
    ['pawn.orange@3', 'fmWfceFifmnDfhN'], ['pawn.rank-current@1', 'ifmnDmfWfceFsR'], ['king.reserve-bishop@1', 'F'],
  ]);
  for (const row of armies.slice(0, 2)) {
    assert.deepEqual(Object.keys(row.single.army.upgrades), ['c2']);
    assert.deepEqual(Object.keys(row.triple.army.upgrades), ['c2', 'd2', 'e2']);
    assert.ok(Object.values(row.triple.army.upgrades).every(id => id === row.reference.id));
  }
  assert.deepEqual(armies[2].triple.army, { upgrades: {}, reserve: [{ id: 'king.reserve-bishop@1', count: 3 }] });
  assert.deepEqual(doubles.map(row => [row.key, Object.keys(row.army.upgrades)]), [
    ['vanguard', ['a1', 'h1']], ['unicorn', ['b1', 'g1']], ['cruisader', ['c1', 'f1']],
  ]);
  for (const match of api.comparisons()) {
    assert.equal(match.a.budget, match.b.budget);
    for (const side of [match.a, match.b]) {
      const count = Object.values(side.army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
        + (side.army.reserve || []).reduce((sum, entry) => sum + entry.count * getDesign(entry.id).level, 0);
      assert.equal(count, side.budget);
      assert.ok(!Object.hasOwn(side.army.upgrades, 'e1'));
    }
  }
});

test('sixteen short holdout prefixes are distinct from every declared historical opening and cover both fixed halves', () => {
  assert.equal(api.validateOpenings().length, 16);
  const copy = structuredClone(api.OPENINGS); copy[0].moves = ['e2e4', 'e7e5'];
  assert.throws(() => api.validateOpenings(copy), /fresh/);
  const duplicate = structuredClone(api.OPENINGS); duplicate[1] = duplicate[0];
  assert.throws(() => api.validateOpenings(duplicate), /distinct/);
  assert.throws(() => api.validateOpenings(api.OPENINGS.slice(0, 15)), /sixteen/);
  const cohorts = api.loadExperiment().metadata.openingCohorts;
  assert.deepEqual(cohorts.map(row => row.openingIds.length), [8, 8]);
  assert.equal(new Set(cohorts.flatMap(row => row.openingIds)).size, 16);
});

test('all 384 actual army/color/opening positions are legal without playing scored games', async () => {
  const checked = await validateDesignConfig(api.loadExperiment().config, { standardOpeningSources: true });
  assert.equal(checked.games, 384); assert.equal(checked.validatedOpenings, 384);
  assert.equal(checked.native, false);
});

test('panel reports preserve opposite score perspectives and separate singles from bridge results', () => {
  const f = fixtures(), matches = api.comparisons(), singles = new Set(matches.filter(match => match.panel === 'singles').map(match => match.id));
  for (const record of f.records) win(record, singles.has(record.comparisonId));
  const report = api.createReport(f), [single, bridge] = report.panels;
  assert.equal(report.progress.completePairs, 192);
  assert.deepEqual(report.panels.map(panel => [panel.budget, panel.report.scheduledGames, panel.report.progress.completePairs]), [[2, 96, 48], [6, 288, 144]]);
  const firstKey = api.packages().armies[0].single.key, lastKey = api.packages().armies[2].single.key;
  assert.equal(single.report.overall.rows.find(row => row.key === firstKey).score, 1);
  assert.equal(single.report.overall.rows.find(row => row.key === lastKey).score, 0);
  assert.ok(bridge.report.overall.rows.every(row => row.score === 0));
  const reversed = single.report.matrix.rows[1].cells[0];
  assert.equal(reversed.inverted, true); assert.equal(reversed.score, 0);
  const before = structuredClone(single), changed = structuredClone(f);
  for (const record of changed.records) if (!singles.has(record.comparisonId)) win(record, true);
  assert.deepEqual(api.createReport(changed).panels[0], before);
  const markdown = api.renderReport(report);
  assert.match(markdown, /Two-point reference singles/); assert.match(markdown, /Six-point cross-tier bridge/);
  assert.match(markdown, /No pooled score, material fit or piece Elo/);
  assert.match(markdown, /First fixed eight/);
});

test('physical White/Black diagnostics handle A-role and mirrored B-role rows in both panels and fixed halves', () => {
  const f = fixtures();
  f.records.forEach(record => { record.result = '1-0'; }); // Physical White always wins, regardless of A/B role.
  const report = api.createReport(f);
  for (const panel of report.panels) {
    const gamesPerColor = panel.id === 'singles' ? 32 : 48;
    for (const current of [panel.report, ...panel.cohorts.map(cohort => cohort.report)]) {
      const count = current === panel.report ? gamesPerColor : gamesPerColor / 2;
      for (const row of current.overall.rows) {
        assert.equal(row.score, 0.5); assert.equal(row.games, 2 * count);
        assert.deepEqual(row.physicalColors, [
          { color: 'w', games: count, wins: count, draws: 0, losses: 0, score: 1 },
          { color: 'b', games: count, wins: 0, draws: 0, losses: count, score: 0 },
        ]);
      }
    }
  }
  // The final single is B in both of its comparisons; the middle single has
  // one A role and one B role. Both must still report physical colors above.
  assert.ok(api.comparisons().filter(match => match.panel === 'singles' && match.b.key === api.packages().armies[2].single.key).length === 2);
  const markdown = api.renderReport(report);
  assert.match(markdown, /White score \| White W \/ D \/ L \(games\) \| Black score/);
  assert.match(markdown, /All sixteen.*100\.00% \| 32 \/ 0 \/ 0 \(32\) \| 0\.00% \| 0 \/ 0 \/ 32 \(32\)/);
});

test('physical-color counts exclude truncated, unpaired and copied partners over the row shared cases', () => {
  for (const aColor of ['w', 'b']) {
    const f = fixtures(), match = api.comparisons().find(row => row.panel === 'bridge');
    f.records.forEach(record => { record.result = '1-0'; });
    const truncated = f.records.find(record => record.comparisonId === match.id && record.openingId === api.OPENINGS[0].id && record.aColor === aColor);
    Object.assign(truncated, { status: 'truncated', result: '*', reason: 'max-plies' });
    f.records = f.records.filter(record => !(record.comparisonId === match.id && record.openingId === api.OPENINGS[1].id && record.aColor === aColor));
    const report = api.createReport(f), panel = report.panels[1];
    const row = panel.report.overall.rows.find(item => item.key === match.a.key);
    assert.equal(row.openingCoverage.shared, 14); assert.equal(row.games, 84);
    assert.deepEqual(row.physicalColors, [
      { color: 'w', games: 42, wins: 42, draws: 0, losses: 0, score: 1 },
      { color: 'b', games: 42, wins: 0, draws: 0, losses: 42, score: 0 },
    ]);
    assert.deepEqual(panel.cohorts.map(cohort => cohort.report.overall.rows.find(item => item.key === match.a.key).physicalColors.map(color => color.games)), [[18, 18], [24, 24]]);
    assert.ok(panel.report.overall.rows.filter(item => item.key !== match.a.key).every(item => item.physicalColors.every(color => color.games === 48)));
    assert.deepEqual(api.createReport({ ...f, records: [...f.records, ...structuredClone(f.records)] }).panels[1].report.overall, panel.report.overall);
  }
});

test('a repeated older interrupted attempt cannot replace the completed retry in physical-color counts', () => {
  const f = fixtures(), original = api.createReport(f);
  const first = f.records[0], aborted = { ...first, status: 'aborted', result: '*', reason: 'cancelled' };
  const completed = { ...first, attempt: 2 };
  const records = [aborted, completed, ...f.records.slice(1), structuredClone(aborted)];
  const retried = api.createReport({ ...f, records });
  assert.equal(retried.progress.duplicateCopiesIgnored, 1);
  for (let i = 0; i < original.panels.length; i++) {
    assert.deepEqual(retried.panels[i].report.overall, original.panels[i].report.overall);
    assert.deepEqual(retried.panels[i].cohorts.map(c => c.report.overall), original.panels[i].cohorts.map(c => c.report.overall));
  }
});

test('missing partners, truncations and fast extra opponent results preserve shared-case weighting', () => {
  const f = fixtures(), match = api.comparisons().find(row => row.panel === 'bridge'), rowKey = match.a.key;
  const target = f.records.find(record => record.comparisonId === match.id && record.openingId === api.OPENINGS[0].id);
  target.status = 'truncated'; target.result = '*'; target.reason = 'max-plies';
  const report = api.createReport(f), row = report.panels[1].report.overall.rows.find(item => item.key === rowKey);
  assert.equal(report.progress.finalizedGames, 384); assert.equal(report.progress.completePairs, 191);
  assert.equal(row.openingCoverage.shared, 15); assert.equal(row.games, 90); assert.equal(row.score, 0.5);
  assert.equal(report.panels[1].cohorts[0].report.overall.rows.find(item => item.key === rowKey).openingCoverage.shared, 7);
  assert.ok(report.panels[0].report.overall.rows.every(item => item.openingCoverage.shared === 16));
  const duplicated = api.createReport({ ...f, records: [...f.records, ...structuredClone(f.records)] });
  for (let index = 0; index < report.panels.length; index++) {
    assert.deepEqual(duplicated.panels[index].report.overall, report.panels[index].report.overall);
    assert.deepEqual(duplicated.panels[index].report.matrix, report.panels[index].report.matrix);
    assert.deepEqual(duplicated.panels[index].cohorts.map(cohort => cohort.report.overall), report.panels[index].cohorts.map(cohort => cohort.report.overall));
  }
});

test('empty and uneven live panels retain pending or shared-case scores instead of rewarding fast opponents', () => {
  const f = fixtures(), pending = api.createReport({ ...f, records: [] });
  assert.ok(pending.panels.every(panel => panel.report.overall.rows.every(row => row.score === null && row.games === 0)));
  assert.ok(pending.panels.every(panel => panel.report.overall.rows.every(row => row.physicalColors.every(color => color.score === null && color.games === 0))));
  assert.doesNotMatch(api.renderReport(pending), /50\.00%/);
  const first = new Set(api.OPENINGS.slice(0, 8).map(opening => opening.id));
  const records = f.records.filter(record => first.has(record.openingId));
  const baseline = api.createReport({ ...f, records });
  const extra = structuredClone(f.records.filter(record => record.openingId === api.OPENINGS[8].id
    && record.comparisonId === api.comparisons().find(match => match.panel === 'bridge').id));
  extra.forEach(record => win(record, true));
  const updated = api.createReport({ ...f, records: [...records, ...extra] });
  for (let index = 0; index < baseline.panels.length; index++) {
    assert.deepEqual(updated.panels[index].report.overall, baseline.panels[index].report.overall);
    assert.deepEqual(updated.panels[index].cohorts[0], baseline.panels[index].cohorts[0]);
  }
});

test('the full-run audit rejects changed values, engine settings and opening context before making projections', () => {
  for (const mutate of [record => record.engine.nodes++, record => record.evaluation.pieceValues['pawn.orange@3'].mg++,
    record => record.openingMoves[0] = 'h2h4', record => record.registryHash = 'changed']) {
    const f = fixtures(); f.records = structuredClone(f.records); mutate(f.records[0]);
    assert.throws(() => api.createReport(f), /context|profile/);
  }
});
