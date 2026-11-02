'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { makeSchedule } = require('../scripts/balance/plan');
const { getDesign } = require('../src/design-catalog');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { getEvaluation, getReceipt } = require('../scripts/balance/v17-mixed-values');
const api = require('../scripts/balance/v17-mixed-plan');

function fixture() {
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
function setScore(record, score) { record.result = score === 0.5 ? '1/2-1/2' : score === Number(record.aColor === 'w') ? '1-0' : '0-1'; }

test('1824 paired slots comprise nine logical mixed teams, seventeen genuine layouts and two grant trials', () => {
  const declaration = api.loadExperiment(), schedule = makeSchedule(declaration.config), matches = api.comparisons();
  assert.equal(schedule.length, 1824); assert.equal(declaration.config.comparisons.length, 76);
  assert.deepEqual(makeSchedule(declaration.config), schedule);
  assert.equal(api.mixedTeams().length, 9);
  assert.deepEqual(api.mixedTeams().map(team => team.layouts.length).sort(), [1, 2, 2, 2, 2, 2, 2, 2, 2]);
  assert.equal(api.physicalRows().length, 19);
  assert.equal(new Set(api.physicalRows().map(row => JSON.stringify(row.army))).size, 19);
  assert.deepEqual(declaration.metadata.panels.map(panel => panel.scheduledGames), [1632, 192]);
  assert.equal(matches.filter(match => match.a.panel === 'mixed').length, 68);
  assert.equal(matches.filter(match => match.a.panel === 'grants').length, 8);
  assert.equal(new Set(schedule.map(game => game.id)).size, schedule.length);
  const references = new Set(getOfficialReferences().roster.map(row => row.id));
  for (const match of matches) {
    assert.equal(match.a.budget, 3); assert.equal(match.b.budget, 3);
    assert.ok(references.has(Object.values(match.b.army.upgrades)[0]));
    for (const army of [match.a.army, match.b.army]) {
      const cost = Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
        + (army.reserve || []).reduce((sum, entry) => sum + entry.count * getDesign(entry.id).level, 0);
      assert.equal(cost, 3); assert.ok(!Object.hasOwn(army.upgrades, 'e1'));
    }
  }
  for (let index = 0; index < schedule.length; index += 2) {
    assert.equal(schedule[index].pairId, schedule[index + 1].pairId);
    assert.notEqual(schedule[index].aColor, schedule[index + 1].aColor);
  }
  assert.deepEqual(declaration.config.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
  assert.deepEqual(declaration.config.evaluation, getEvaluation(api.selectedIds()));
  assert.deepEqual(declaration.metadata.evaluationAudit, getReceipt());
});

test('two-pawn roles reverse files, single pawns change files and the two distinct grants never acquire a fictitious layout', () => {
  for (const team of api.mixedTeams()) {
    const [first, second] = team.members.map(getDesign);
    if (first.placement === 'reserve' && second.placement === 'reserve') {
      assert.equal(team.layouts.length, 1);
      assert.deepEqual(team.layouts[0].army, { upgrades: {}, reserve: team.members.map(id => ({ id, count: 1 })) });
      continue;
    }
    assert.equal(team.layouts.length, 2);
    for (const [index, layout] of team.layouts.entries()) {
      const homes = index ? ['e2', 'c2'] : ['c2', 'e2'];
      for (const [memberIndex, id] of team.members.entries()) {
        if (getDesign(id).placement === 'replace') assert.equal(layout.army.upgrades[homes[memberIndex]], id);
        else assert.ok(layout.army.reserve.some(entry => entry.id === id && entry.count === 1));
      }
      assert.deepEqual(Object.keys(layout.army.upgrades).sort(), Object.values(layout.slots).filter(Boolean).sort());
    }
  }
  assert.deepEqual(api.GRANTS.map(row => [row.id, row.movement]), [['king.reserve-rook@1', 'W2'], ['king.grant-wd-level3@1', 'WD']]);
  const registry = createDesignRegistry(api.loadExperiment().config), profile = compileDesignProfile(registry, api.loadExperiment().config.evaluation);
  assert.equal(registry.definitions.length, 12);
  assert.match(profile.config, /pieceDrops = true/); assert.match(profile.config, /dropChecks = false/);
  assert.match(profile.config, /capturesToHand = false/); assert.match(profile.config, /twoBoards = false/);
  assert.match(profile.config, /promotionPieceTypes = nbrq/);
});

test('fresh twelve-case four-ply book allows prior two-ply beginnings but rejects transpositions, old positions, captures and early mate', () => {
  assert.equal(api.validateOpenings().length, 12);
  assert.ok(api.OPENINGS.every(opening => opening.moves.length === 4));
  assert.equal(api.HISTORICAL_FILES.includes(api.FILE), false);
  const duplicate = structuredClone(api.OPENINGS); duplicate[1].id = duplicate[0].id;
  assert.throws(() => api.validateOpenings(duplicate), /distinct/);
  const transposition = structuredClone(api.OPENINGS); transposition[1].moves = ['g1f3', 'g8f6', 'd2d4', 'd7d5'];
  assert.throws(() => api.validateOpenings(transposition), /fresh and distinct/);
  const old = structuredClone(api.OPENINGS); old[0].moves = ['c2c4', 'c7c5', 'g1f3', 'g8f6'];
  assert.throws(() => api.validateOpenings(old), /fresh and distinct/);
  const capture = structuredClone(api.OPENINGS); capture[0].moves = ['e2e4', 'd7d5', 'e4d5', 'd8d5'];
  assert.throws(() => api.validateOpenings(capture), /preserve purchased pieces/);
  const mate = structuredClone(api.OPENINGS); mate[0].moves = ['g2g4', 'e7e5', 'f2f3', 'd8h4'];
  assert.throws(() => api.validateOpenings(mate), /remain nonterminal/);
  const short = structuredClone(api.OPENINGS); short[0].moves = short[0].moves.slice(0, 2);
  assert.throws(() => api.validateOpenings(short), /exactly four plies/);
  const positions = api.OPENINGS.map(opening => {
    const board = new Chess(); for (const move of opening.moves) assert.equal(api.moveStandard(board, move).captured, undefined);
    return api.canonicalPosition(board);
  });
  assert.equal(new Set(positions).size, 12);
  assert.deepEqual(api.loadExperiment().metadata.openingCohorts.map(cohort => cohort.openingIds.length), [6, 6]);
});

test('all 1824 actual army/layout/color/opening combinations validate without scored games', async () => {
  const proof = await validateDesignConfig(api.loadExperiment().config, { standardOpeningSources: true });
  assert.equal(proof.games, 1824); assert.equal(proof.validatedOpenings, 1824);
  assert.equal(proof.native, false);
});

test('logical scores first average layouts and references while physical colors retain real included counts', () => {
  const f = fixture(); f.records.forEach(record => { record.result = '1-0'; });
  const report = api.createReport(f);
  assert.equal(report.progress.completePairs, 912);
  assert.equal(report.comparisons.length, 76);
  assert.equal(report.mixed.rows.length, 9); assert.equal(report.grants.rows.length, 2);
  for (const row of [...report.mixed.rows, ...report.grants.rows]) {
    const count = row.expectedLayouts === 2 ? 96 : 48;
    assert.equal(row.games, 2 * count); assert.equal(row.score, 0.5);
    assert.deepEqual(row.physicalColors, [
      { color: 'w', games: count, wins: count, draws: 0, losses: 0, score: 1 },
      { color: 'b', games: count, wins: 0, draws: 0, losses: count, score: 0 },
    ]);
    assert.equal(row.openingCoverage.shared, 12);
  }
  assert.equal(report.mixed.rows.reduce((sum, row) => sum + row.games, 0), 1632);
  assert.equal(report.grants.rows.reduce((sum, row) => sum + row.games, 0), 192);
  for (const cohort of report.cohorts) {
    assert.equal(cohort.mixed.scheduledGames, 816); assert.equal(cohort.grants.scheduledGames, 96);
    for (const row of [...cohort.mixed.rows, ...cohort.grants.rows]) {
      assert.equal(row.openingCoverage.shared, 6);
      assert.equal(row.games, row.expectedLayouts === 2 ? 96 : 48);
    }
  }
  assert.match(api.renderReport(report), /First fixed six/);
  assert.match(api.renderReport(report), /White score \| Black score/);
  assert.match(api.renderReport(report), /cannot identify pure coordination/);
});

test('placement contrasts are visible and partner means give the smaller grant-only team equal weight', () => {
  const f = fixture(), matches = new Map(api.comparisons().map(match => [match.id, match]));
  for (const record of f.records) {
    const match = matches.get(record.comparisonId);
    if (match.a.panel === 'grants') setScore(record, 1);
    else {
      const team = api.mixedTeams().find(team => team.key === match.a.team);
      setScore(record, team.level2 === 'forward-knight-pawn' ? 1 : team.level2 === 'rank-pawn' ? 0.5 : 0);
    }
  }
  const report = api.createReport(f);
  assert.deepEqual(report.partnerSummary.level2Means.map(row => row.score), [1, 0.5, 0]);
  assert.ok(report.partnerSummary.level1Means.every(row => row.score === 0.5));
  assert.equal(report.mixed.rows.find(row => row.expectedLayouts === 1).games, 96);
  const changed = fixture();
  const team = api.mixedTeams()[0];
  const firstKeys = new Set(api.comparisons().filter(match => match.a.key === team.layouts[0].key).map(match => match.id));
  const secondKeys = new Set(api.comparisons().filter(match => match.a.key === team.layouts[1].key).map(match => match.id));
  for (const record of changed.records) if (firstKeys.has(record.comparisonId)) setScore(record, 1); else if (secondKeys.has(record.comparisonId)) setScore(record, 0);
  const row = api.createReport(changed).mixed.rows[0];
  assert.equal(row.score, 0.5); assert.deepEqual(row.layouts.map(layout => layout.score), [1, 0]);
  assert.equal(row.placementDifference, -1);
});

test('one missing or truncated layout partner removes its entire opening from logical/color and partner-shared means', () => {
  for (const mode of ['missing', 'truncated']) for (const color of ['w', 'b']) {
    const f = fixture(), team = api.mixedTeams()[0], comparison = `${team.layouts[0].key}-v-vanguard`;
    const target = f.records.find(record => record.comparisonId === comparison && record.openingId === api.OPENINGS[0].id && record.aColor === color);
    if (mode === 'missing') f.records = f.records.filter(record => record !== target);
    else Object.assign(target, { status: 'truncated', result: '*', reason: 'max-plies' });
    const report = api.createReport(f), row = report.mixed.rows[0];
    assert.equal(row.openingCoverage.shared, 11); assert.equal(row.games, 176);
    assert.deepEqual(row.physicalColors.map(item => item.games), [88, 88]);
    assert.deepEqual(report.cohorts.map(cohort => cohort.mixed.rows[0].openingCoverage.shared), [5, 6]);
    assert.deepEqual(report.partnerSummary.level1Means.map(item => item.openingCoverage.shared), [11, 12, 12]);
    assert.deepEqual(report.partnerSummary.level2Means.map(item => item.openingCoverage.shared), [11, 12, 12]);
    assert.equal(row.opponents[0].openingCoverage.shared, 11);
    assert.ok(row.opponents.slice(1).every(item => item.openingCoverage.shared === 12));
    assert.ok(row.layouts.every(layout => layout.games === 88));
    assert.ok(report.grants.rows.every(item => item.games === 96));
  }
});

test('faster extra opponent/layout completions cannot move any shared-case row or partner mean', () => {
  const f = fixture(), first = new Set(api.OPENINGS.slice(0, 6).map(opening => opening.id));
  const records = f.records.filter(record => first.has(record.openingId));
  const before = api.createReport({ ...f, records });
  const extra = structuredClone(f.records.filter(record => record.openingId === api.OPENINGS[6].id
    && record.comparisonId === f.declaration.config.comparisons[0].id));
  extra.forEach(record => setScore(record, 1));
  const after = api.createReport({ ...f, records: [...records, ...extra] });
  assert.deepEqual(after.mixed.rows.map(({ opponents, ...row }) => row), before.mixed.rows.map(({ opponents, ...row }) => row));
  assert.deepEqual(after.partnerSummary, before.partnerSummary);
  assert.deepEqual(after.cohorts[0], before.cohorts[0]);
});

test('duplicate copies and an old aborted copy after its completed retry do not change derived scores or colors', () => {
  const f = fixture(), before = api.createReport(f), first = f.records[0];
  const aborted = { ...first, result: '*', status: 'aborted', reason: 'synthetic-cancelled' };
  const completed = { ...first, attempt: 2 };
  const retried = api.createReport({ ...f, records: [aborted, completed, ...f.records.slice(1), structuredClone(aborted), ...structuredClone(f.records.slice(1))] });
  assert.equal(retried.progress.duplicateCopiesIgnored, 1824);
  assert.deepEqual(retried.mixed, before.mixed); assert.deepEqual(retried.grants, before.grants);
  assert.deepEqual(retried.partnerSummary, before.partnerSummary); assert.deepEqual(retried.cohorts, before.cohorts);
});

test('grant results stay separate from mixed rows, and empty cases remain pending without invented draws', () => {
  const f = fixture(), before = api.createReport(f), grantIds = new Set(api.comparisons().filter(match => match.a.panel === 'grants').map(match => match.id));
  const changed = structuredClone(f.records);
  changed.forEach(record => { if (grantIds.has(record.comparisonId)) setScore(record, 1); });
  const after = api.createReport({ ...f, records: changed });
  assert.deepEqual(after.mixed, before.mixed); assert.deepEqual(after.partnerSummary, before.partnerSummary);
  assert.ok(after.grants.rows.every(row => row.score === 1));
  const pending = api.createReport({ ...f, records: [] });
  assert.ok([...pending.mixed.rows, ...pending.grants.rows].every(row => row.score === null && !row.games && row.physicalColors.every(color => color.score === null)));
  assert.ok(pending.partnerSummary.level1Means.every(row => row.score === null));
  assert.doesNotMatch(api.renderReport(pending), /50\.00%/);
});

test('whole-run context rejects altered profiles, values, engine settings and prefixes before logical projection', () => {
  for (const mutate of [record => record.engine.nodes++, record => record.evaluation.pieceValues['pawn.orange@3'].mg++,
    record => record.profileHash = 'changed', record => record.openingMoves[0] = 'h2h4']) {
    const f = fixture(); f.records = structuredClone(f.records); mutate(f.records[0]);
    assert.throws(() => api.createReport(f), /context|profile/);
  }
});
