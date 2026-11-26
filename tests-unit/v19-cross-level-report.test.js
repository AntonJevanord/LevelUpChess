'use strict';

// Synthetic outcome records with real declared profiles/schedules. No engine
// process or scored research game is started by these retrospective tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../scripts/balance/v19-cross-level-plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { makeSchedule } = require('../scripts/balance/plan');
const { buildOpeningEvaluationReport } = require('../scripts/balance/opening-evaluation-report');
const { makeOpeningEvaluation } = require('../scripts/balance/opening-evaluation');
const reports = require('../scripts/balance/v19-cross-level-report');

let campaign;
test.before(() => { campaign = { ...plan.buildCampaignPlan({ jobs: 1 }), runId: 'synthetic-cross-report', initialOpenings: 8, targetOpenings: 8 }; });
function stage(group = plan.groups().find(row => row.sameFamily), placement = 0, batchIndex = 0) {
  const descriptor = plan.getStageDescriptors(batchIndex).find(row => row.groupId === group.id && row.placement === placement);
  const declaration = plan.getStageDeclaration(descriptor.id), registry = createDesignRegistry(declaration.config);
  const profile = compileDesignProfile(registry, declaration.config.evaluation), schedule = makeSchedule(declaration.config);
  const first = declaration.metadata.comparisons[0].id;
  return { ...descriptor, declaration, records: schedule.map(game => ({ ...game, attempt: 1, status: 'completed',
    result: game.comparisonId === first ? game.aColor === 'w' ? '1-0' : '1/2-1/2' : game.aColor === 'w' ? '0-1' : '1-0',
    reason: 'synthetic-outcome-fixture', profileHash: profile.hash, registryHash: registry.hash,
    variant: profile.variant, registryReference: 'run.json#designRegistry', engine: declaration.config.engine,
    evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } })),
    manifest: { runId: 'synthetic-' + descriptor.id, config: declaration.config, schedule,
      designRegistry: registry, designProfile: profile } };
}
const report = (stages, manifest = campaign) => reports.createCrossLevelReport({ manifest, stages, planTools: plan });

test('empty report keeps the full selected panel and queen exclusions without inventing results', () => {
  const value = report([]);
  assert.deepEqual(value.counts, { level1: 11, level2: 12, level3: 11, scheduledTeams: 126,
    scheduledCells: 1386, unavailableTeams: 6, unavailableCells: 66, grantsIncluded: false });
  assert.equal(value.scheduledGames, 22176); assert.equal(value.progress.finalizedGames, 0);
  assert.equal(value.overall.team.score, null); assert.equal(value.overall.team.availableScore, null);
  assert.equal(value.cells.length, 1386); assert.ok(value.cells.every(cell => cell.score === null && cell.games === 0));
  assert.ok(value.unavailable.every(row => /one queen/.test(row.reason)));
  assert.equal(value.selectionReceipt.file, 'experiments/designs/v19-cross-level-001.json');
  assert.deepEqual(value.selectionExclusions.filter(row => row.id).map(row => row.id).sort(),
    ['pawn.knight-tall-quiet@1', 'pawn.queen-sideways@1', 'rook.orange@3']);
  for (const component of value.componentRows) for (const row of component.rows) {
    assert.equal(row.partnerCoverage.total, component.level === 1 ? row.family === 'queen' ? 9 : 12 : row.family === 'queen' ? 9 : 11);
  }
  assert.ok(!JSON.stringify(value).includes('"records":'), 'report JSON must not duplicate authoritative move records');
});

test('paired scores, physical colors and complementary L3 perspective survive two placement partitions', () => {
  const a = stage(), b = stage(plan.groups().find(row => row.id === a.groupId), 1);
  const value = report([a, b]), cell = value.cells.find(row => row.id === a.declaration.metadata.comparisons[0].id);
  assert.equal(cell.games, 16); assert.equal(cell.completePairs, 8);
  assert.deepEqual([cell.wins, cell.draws, cell.losses, cell.score], [8, 8, 0, 0.75]);
  assert.deepEqual(cell.physicalColors.map(row => row.score), [1, 0.5]);
  assert.equal(cell.sharedOpenings.openingIds.length, 8); assert.equal(cell.sharedOpenings.conditionalRange.available, true);
  assert.deepEqual(cell.placements.map(row => row.pairCoverage), [{ complete: 4, scheduled: 4 }, { complete: 4, scheduled: 4 }]);
  const team = value.teamRows.find(row => row.id === a.groupId);
  assert.equal(team.opponentCoverage.represented, 11); assert.equal(team.score, 0.75 / 11);
  assert.equal(team.sharedOpenings.openingIds.length, 8);
  const opponent = value.level3Rows.find(row => row.id === cell.designL3);
  assert.equal(opponent.score, null); assert.equal(opponent.availableScore, 0.25);
  assert.deepEqual(opponent.physicalColors.map(row => row.availableScore), [0.5, 0]);
  assert.equal(value.overall.team.availableScore + value.overall.level3.availableScore, 1);
  assert.equal(value.progress.pairedGames, 176); assert.equal(value.progress.unpairedCompletedGames, 0);
});

test('primary scores wait for opponent coverage while strict common cases remain separately visible', () => {
  const s = stage(), first = s.declaration.metadata.comparisons[0].id;
  s.records = s.records.filter(row => row.comparisonId === first);
  const value = report([s]), team = value.teamRows.find(row => row.id === s.groupId);
  assert.equal(team.score, null); assert.equal(team.availableScore, 0.75);
  assert.deepEqual(team.opponentCoverage, { represented: 1, total: 11 });
  assert.equal(team.sharedOpenings.score, null); assert.equal(team.sharedOpenings.openingIds.length, 0);
  assert.equal(team.sharedOpenings.conditionalRange.available, false);
  const remaining = stage(), planned = remaining.records.find(row => row.comparisonId !== first && row.aColor === 'w');
  remaining.records = remaining.records.filter(row => row.id !== planned.id);
  const partial = report([remaining]), row = partial.teamRows.find(row => row.id === remaining.groupId);
  assert.equal(row.opponentCoverage.represented, 11); assert.equal(row.sharedOpenings.openingIds.length, 3);
  assert.equal(partial.progress.unpairedCompletedGames, 1);
  assert.equal(row.sharedOpenings.conditionalRange.available, false);
});

test('retries, duplicate copies and unscored partners retain honest progress and never manufacture draws', () => {
  const s = stage(), original = structuredClone(s.records[0]);
  s.records[0] = { ...original, status: 'error', result: '*', reason: 'synthetic-interruption' };
  s.records.splice(1, 0, { ...original, attempt: 2 });
  s.records.push(structuredClone(s.records[1]));
  const truncated = s.records.find(row => row.id !== original.id);
  truncated.status = 'truncated'; truncated.result = '*'; truncated.reason = 'max-plies';
  const value = report([s]);
  assert.equal(value.progress.statusCounts.error, 1); assert.equal(value.progress.latestCounts.error, 0);
  assert.equal(value.progress.latestCounts.truncated, 1); assert.equal(value.progress.duplicateCopiesIgnored, 1);
  assert.equal(value.progress.unpairedCompletedGames, 1);
  assert.equal(value.progress.pairedGames, s.manifest.schedule.length - 2);
  assert.equal(value.openingEvaluations.counts.duplicateCopiesIgnored, 1);
});

test('changed semantic profiles, runtime identity, records, duplicate stages and foreign targets are refused', () => {
  const s = stage();
  for (const mutate of [
    row => { row.manifest.designProfile.hash += '-tampered'; },
    row => { row.manifest.schedule[0].aColor = 'broken'; },
    row => { row.records[0].registryHash = 'broken'; },
    row => { row.records[0].openingMoves = ['e2e4']; },
    row => { row.placement = 7; },
  ]) {
    const changed = structuredClone(s); mutate(changed); assert.throws(() => report([changed]));
  }
  assert.throws(() => report([s, s]), /repeated|target/);
  assert.throws(() => report([{ ...s, id: 'b08-g999-p0' }]), /target/);
  assert.throws(() => report([s], { ...campaign, identity: { engineSha256: 'a'.repeat(64) } }), /runtime identity/);
  assert.throws(() => report([], { ...campaign, study: 'level1' }), /cross-level/);
});

test('per-profile opening diagnostics preserve exact counts and separate centipawn contexts', () => {
  const records = [];
  for (const [profileIndex, cp] of [100, -200].entries()) for (const aColor of ['w', 'b']) {
    const row = { id: `${profileIndex}-${aColor}`, pairId: `pair-${profileIndex}`, comparisonId: `comparison-${profileIndex}`,
      openingId: 'same-opening', attempt: 1, aColor, status: 'completed', result: '1/2-1/2', openingMoves: [],
      profileHash: String(profileIndex + 1).repeat(64), registryHash: 'c'.repeat(64), variant: 'synthetic-profile-' + profileIndex,
      engine: { nodes: 40000 }, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
    row.openingEvaluation = makeOpeningEvaluation({ fen: '8/8/8/8/8/8/K7/7k w - - 0 1', openingPlies: 0,
      attempt: 1, color: 'w', engineSha256: 'a'.repeat(64), strength: { skill: 20 }, limits: { nodes: 40000 } },
    { info: { score: { type: 'cp', value: cp } } });
    records.push(row);
  }
  const expected = buildOpeningEvaluationReport(records), merged = reports.openingDiagnosticsByProfile(records);
  assert.deepEqual(merged.counts, expected.counts); assert.equal(merged.contexts.length, 2);
  assert.deepEqual(merged.contexts.map(row => row.exactCp.white.mean).sort((a, b) => a - b), [-200, 100]);
  assert.equal(merged.stratifiedBy, 'recorded-profile-hash');
  assert.ok(merged.openings.every(row => row.stratumProfileHash));
});

test('Markdown, complete cell CSV and matrix explicitly label provisional coverage and unavailable queens', () => {
  const value = report([stage()]), markdown = reports.renderCrossLevelReport(value);
  assert.match(markdown, /Teams containing each L1/); assert.match(markdown, /not an isolated piece contribution/);
  assert.match(markdown, /Available scores.*partial coverage is provisional/i);
  assert.match(markdown, /1386 cells/); assert.match(markdown, /66 cells/);
  const matrix = reports.renderCrossLevelMatrix(value), csv = reports.renderCrossLevelCsv(value);
  assert.match(matrix, /unavailable/); assert.match(matrix, /Strider|Squire/);
  assert.equal(csv.trim().split('\r\n').length, 1 + 1386 + 66);
  assert.match(csv, /team_white_score,team_black_score/);
});
