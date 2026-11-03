'use strict';

// Synthetic benchmark outcomes only. No executable is launched or game played.
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../scripts/balance/engine-benchmark-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { partitionSchedule } = require('../scripts/balance/parallel');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');

function result(plan, descriptor, overrides = {}) {
  const config = api.buildCellConfig({ ...descriptor, jobs: plan.jobs }), schedule = makeSchedule(config);
  const designRegistry = createDesignRegistry(config), designProfile = compileDesignProfile(designRegistry, config.evaluation);
  const manifest = { config, schedule, designRegistry, designProfile, parallel: { jobs: plan.jobs }, runId: 'synthetic-cell' };
  const physical = descriptor.mode === 'shared' ? 1 : 2;
  const records = schedule.map(game => ({ id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
    openingId: game.openingId, aColor: game.aColor, repetition: game.repetition, attempt: 1,
    status: 'completed', result: '1/2-1/2', reason: 'synthetic-only',
    variant: designProfile.variant, profileHash: designProfile.hash, registryHash: designRegistry.hash,
    registryReference: 'run.json#designRegistry', engine: config.engine, evaluation: config.evaluation,
    whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, openingMoves: [], openingPlies: 0,
    moves: ['e2e4', 'e7e5'], sans: ['e4', 'e5'], playedPlies: 2, totalPlies: 2,
    startedAt: '2026-11-03T12:00:00.000Z', finishedAt: '2026-11-03T12:00:01.000Z',
    benchmarkOnly: true, engineMode: descriptor.mode,
    benchmarkTiming: { prepareMs: 50, searchMs: 100, startPly: 0, searchCalls: 2,
      reportedNodes: 2 * descriptor.nodes, missingNodeReports: 0, physicalEngines: physical,
      nativePids: Array.from({ length: physical }, (_, index) => 1000 + index), elapsedBeforePersistMs: 200 } }));
  return { ...descriptor, elapsedMs: descriptor.mode === 'shared' ? 8000 : 10000, manifest, records, ...overrides };
}

test('default benchmark uses one no-prefix matchup, four complete color pairs per cell and64 games', () => {
  const plan = api.buildBenchmarkPlan();
  assert.equal(plan.games, 64); assert.equal(plan.cells.length, 8); assert.equal(plan.jobs, 4); assert.equal(plan.rounds, 2);
  assert.equal(plan.benchmarkOnly, true);
  for (const descriptor of plan.cells) {
    const config = api.buildCellConfig({ ...descriptor, jobs: plan.jobs }), schedule = makeSchedule(config);
    assert.deepEqual(config.openings, [{ id: 'start', moves: [] }]);
    assert.equal(config.comparisons.length, 1); assert.equal(config.repetitions, 4);
    assert.equal(schedule.length, 8); assert.equal(descriptor.games, 8);
    assert.equal(new Set(schedule.map(game => game.pairId)).size, 4);
    const shards = partitionSchedule(schedule, 4);
    assert.equal(shards.length, 4); assert.ok(shards.every(shard => shard.length === 2 && shard[0].aColor !== shard[1].aColor));
    assert.equal(descriptor.expectedNativeProcessMax, descriptor.mode === 'shared' ? 4 : 8);
    assert.match(config.name, /^BENCHMARK ONLY:/);
    assert.ok(schedule.every(game => game.openingMoves.length === 0));
  }
});

test('fixed effort and reference values are identical between topology modes', () => {
  const references = getOfficialReferences().roster, plan = api.buildBenchmarkPlan();
  const identities = [];
  for (const descriptor of plan.cells) {
    const config = api.buildCellConfig({ ...descriptor, jobs: plan.jobs });
    assert.deepEqual(config.engine, { nodes: descriptor.nodes, threads: 1, hashMb: 32, maxPlies: 400 });
    const comparison = config.comparisons[0];
    assert.deepEqual(comparison.strengthA, { skill: 20 }); assert.deepEqual(comparison.strengthB, { skill: 20 });
    assert.deepEqual(comparison.armyA.upgrades, { a1: 'rook.purple@10' });
    assert.deepEqual(comparison.armyB.upgrades, { b1: 'knight.purple@3' });
    for (const [id, value] of Object.entries(config.evaluation.pieceValues)) assert.deepEqual(value, references.find(row => row.id === id).engineValue);
    identities.push(makeSchedule(config).map(game => [game.id, game.pairId, game.openingId, game.aColor, game.repetition]));
  }
  identities.slice(1).forEach(value => assert.deepEqual(value, identities[0]));
});

test('AB/BA topology and budget order reverse between rounds, with bounded worker settings', () => {
  const plan = api.buildBenchmarkPlan();
  assert.deepEqual(plan.cells.map(cell => [cell.round, cell.nodes, cell.mode]), [
    [1, 20000, 'separate'], [1, 20000, 'shared'], [1, 80000, 'shared'], [1, 80000, 'separate'],
    [2, 80000, 'separate'], [2, 80000, 'shared'], [2, 20000, 'shared'], [2, 20000, 'separate'],
  ]);
  assert.equal(api.buildBenchmarkPlan({ jobs: 1, rounds: 1 }).games, 8);
  assert.equal(api.buildBenchmarkPlan({ jobs: 2, rounds: 1 }).cells[0].expectedNativeProcessMax, 4);
  for (const jobs of [0, 5, 1.5]) assert.throws(() => api.buildBenchmarkPlan({ jobs }));
  for (const rounds of [0, 9, 1.5]) assert.throws(() => api.buildBenchmarkPlan({ rounds }));
  assert.throws(() => api.buildCellConfig({ nodes: 40000, mode: 'shared' }));
  assert.throws(() => api.buildCellConfig({ nodes: 20000, mode: 'mystery' }));
});

test('report compares matched fresh rounds and normalizes both search work and game length', () => {
  const plan = api.buildBenchmarkPlan(), results = plan.cells.map(cell => result(plan, cell));
  const report = api.summarizeBenchmark({ ...plan, runId: 'synthetic-benchmark' }, results);
  assert.equal(report.finalizedGames, 64); assert.equal(report.eligibleCells, 8); assert.equal(report.runId, 'synthetic-benchmark');
  for (const comparison of report.comparisons) {
    assert.equal(comparison.pairedRounds, 2); assert.equal(comparison.complete, true);
    assert.ok(Math.abs(comparison.medianElapsedReductionPercent - 20) < 1e-12);
    assert.equal(comparison.medianThroughputRatio, 1.25);
  }
  const shared = report.summaries.find(row => row.mode === 'shared' && row.nodes === 20000);
  assert.equal(shared.medianGamesPerHour, 3600); assert.equal(shared.medianSearchMsPerPly, 50);
  assert.equal(shared.medianPliesPerGame, 2); assert.equal(shared.configuredNativeHashMb, 128);
  assert.equal(shared.medianReportedNodesPerWallSecond, 40000);
  assert.ok(report.cells.every(cell => cell.nativeRssBytes === null && cell.nativeRssMeasured === false));
  const text = api.renderReport(report);
  assert.match(text, /excluded from balance evidence/); assert.match(text, /Native RSS is not measured/);
  assert.match(text, /64\/64/); assert.match(text, /shorter games/);
});

test('incomplete and explicitly resumed cells remain visible but never enter fresh comparisons', () => {
  const plan = api.buildBenchmarkPlan(), results = plan.cells.map(cell => result(plan, cell));
  results[0] = { ...results[0], records: results[0].records.slice(0, 2) };
  results[2].timingEligible = false;
  results[4].freshSession = false;
  const report = api.summarizeBenchmark(plan, results);
  assert.equal(report.cells[0].complete, false); assert.equal(report.cells[0].timingEligible, false);
  assert.equal(report.cells[0].gamesPerHour, null); assert.equal(report.eligibleCells, 5);
  assert.deepEqual(report.comparisons.map(row => row.pairedRounds), [1, 0]);
  assert.ok(!report.comparisons.some(row => row.complete));
});

test('truncations are counted as finalized, while unknown node totals stay unavailable', () => {
  const plan = api.buildBenchmarkPlan({ rounds: 1 }), descriptor = plan.cells[0], input = result(plan, descriptor);
  input.records[0] = { ...input.records[0], status: 'truncated', result: '*', reason: 'max-plies',
    benchmarkTiming: { ...input.records[0].benchmarkTiming, missingNodeReports: 1 } };
  const report = api.summarizeBenchmark(plan, [input]), cell = report.cells[0];
  assert.equal(cell.finalizedGames, 8); assert.equal(cell.truncatedGames, 1); assert.equal(cell.completedGames, 7);
  assert.equal(cell.timingEligible, true); assert.equal(cell.reportedNodesPerWallSecond, null);
  assert.equal(cell.reportedNodesPerSearch, null);
  assert.equal(api.summarizeBenchmark(plan).reportedCells, 0);
  assert.ok(api.renderReport(api.summarizeBenchmark(plan)).includes('pending'));
});

test('purpose, mode, profile, paired schedule and timing corruption reject misleading measurements', () => {
  const plan = api.buildBenchmarkPlan({ rounds: 1 }), descriptor = plan.cells[0];
  for (const patch of [{ benchmarkOnly: false }, { engineMode: 'shared' }, { profileHash: 'foreign' },
    { benchmarkTiming: { prepareMs: -1 } }, { totalPlies: 3 }, { evaluation: null }, { whiteStrength: { skill: 1 } }]) {
    const input = result(plan, descriptor); input.records[0] = { ...input.records[0], ...patch };
    assert.throws(() => api.summarizeBenchmark(plan, [input]));
  }
  const duplicate = result(plan, descriptor);
  assert.throws(() => api.summarizeBenchmark(plan, [duplicate, duplicate]), /distinct/);
  assert.throws(() => api.summarizeBenchmark({ ...plan, games: 100 }, []), /plan changed/);
  assert.throws(() => api.summarizeBenchmark(plan, [{ ...duplicate, key: 'unknown' }]), /Unknown/);
  const altered = result(plan, descriptor); altered.manifest.config = { ...altered.manifest.config, name: 'balance study' };
  assert.throws(() => api.summarizeBenchmark(plan, [altered]), /manifest/);
});


test('a complete journal without a committed wall timing retains outcomes but no fabricated speed', () => {
  const plan = api.buildBenchmarkPlan({ rounds: 1 }), input = result(plan, plan.cells[0], { elapsedMs: null, timingEligible: false });
  const report = api.summarizeBenchmark(plan, [input]), cell = report.cells[0];
  assert.equal(cell.complete, true); assert.equal(cell.finalizedGames, 8);
  assert.equal(cell.elapsedMs, null); assert.equal(cell.timingEligible, false);
  assert.equal(cell.gamesPerHour, null); assert.equal(cell.reportedNodesPerWallSecond, null);
  assert.equal(cell.searchMsPerPly, 50); assert.equal(cell.meanPliesPerGame, 2);
  assert.equal(report.comparisons[0].pairedRounds, 0);
  assert.match(api.renderReport(report), /pending/);
  assert.throws(() => api.summarizeBenchmark(plan, [{ ...input, timingEligible: true }]), /measured wall time/);
  assert.throws(() => api.summarizeBenchmark(plan, [{ ...input, elapsedMs: 0 }]), /measured wall time/);
});


test('a resumed final attempt counts new searches separately from its restored prefix', () => {
  const plan = api.buildBenchmarkPlan({ rounds: 1 }), input = result(plan, plan.cells[0]);
  const original = input.records[0];
  const interrupted = { ...original, status: 'aborted', result: '*', reason: 'cancelled',
    moves: original.moves.slice(0, 1), sans: original.sans.slice(0, 1), totalPlies: 1, playedPlies: 1 };
  const resumed = { ...original, attempt: 2,
    benchmarkTiming: { ...original.benchmarkTiming, startPly: 1, searchCalls: 1,
      searchMs: 50, reportedNodes: original.engine.nodes } };
  input.records = [interrupted, resumed, ...input.records.slice(1)];
  const report = api.summarizeBenchmark(plan, [input]), cell = report.cells[0];
  assert.equal(cell.complete, true); assert.equal(cell.finalizedGames, 8); assert.equal(cell.attempts, 9);
  assert.equal(cell.timingEligible, false); assert.equal(cell.gamesPerHour, null);
  assert.equal(cell.searchedPlies, 15); assert.equal(cell.meanPliesPerGame, 2);
  assert.equal(report.comparisons[0].pairedRounds, 0);
});

test('a retry restored at its terminal or move-limit position may finish without starting engines', () => {
  for (const status of ['completed', 'truncated']) {
    const plan = api.buildBenchmarkPlan({ rounds: 1 }), input = result(plan, plan.cells[0]);
    const original = input.records[0];
    const interrupted = { ...original, status: 'error', result: '*', reason: 'synthetic persistence interruption' };
    const resumed = { ...original, attempt: 2, status, result: status === 'truncated' ? '*' : original.result,
      reason: status === 'truncated' ? 'max-plies' : original.reason,
      benchmarkTiming: { ...original.benchmarkTiming, startPly: original.moves.length, searchCalls: 0,
        searchMs: 0, reportedNodes: 0, physicalEngines: 0, nativePids: [] } };
    input.records = [interrupted, resumed, ...input.records.slice(1)];
    const report = api.summarizeBenchmark(plan, [input]), cell = report.cells[0];
    assert.equal(cell.complete, true); assert.equal(cell.timingEligible, false);
    assert.equal(cell.searchedPlies, 14); assert.equal(cell.meanPliesPerGame, 2);
    assert.equal(cell.truncatedGames, status === 'truncated' ? 1 : 0);
  }
});

test('restored-prefix counters cannot disguise a first-attempt or incomplete search history', () => {
  const plan = api.buildBenchmarkPlan({ rounds: 1 });
  for (const timingPatch of [{ startPly: 1, searchCalls: 1 }, { startPly: -1 }, { startPly: 3 },
    { startPly: 0, searchCalls: 0, searchMs: 0, reportedNodes: 0, physicalEngines: 0, nativePids: [] }]) {
    const input = result(plan, plan.cells[0]);
    input.records[0] = { ...input.records[0], benchmarkTiming: { ...input.records[0].benchmarkTiming, ...timingPatch } };
    assert.throws(() => api.summarizeBenchmark(plan, [input]), /restored-prefix accounting/);
  }
});
