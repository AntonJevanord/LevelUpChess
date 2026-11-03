'use strict';

// Performance measurements only. Repeated games from one starting position do
// not become opening diversity or piece-balance evidence.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getOfficialReferences } = require('./official-references');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { createV17Report } = require('./v17-report');

const MODES = Object.freeze(['separate', 'shared']);
const NODES = Object.freeze([20000, 80000]);
const COMPARISON = 'vanguard-v-unicorn';
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
function settings({ nodes, mode, jobs, round }) {
  if (!NODES.includes(nodes) || !MODES.includes(mode)) throw new Error('Choose 20000/80000 nodes and separate/shared engines.');
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 4) throw new Error('Benchmark jobs must be 1 through 4.');
  if (!Number.isInteger(round) || round < 1 || round > 8) throw new Error('Benchmark round must be 1 through 8.');
}
function buildCellConfig({ nodes, mode, jobs = 4, round = 1 } = {}) {
  settings({ nodes, mode, jobs, round });
  const references = getOfficialReferences().roster;
  const vanguard = references.find(row => row.key === 'vanguard'), unicorn = references.find(row => row.key === 'unicorn');
  return normalizeConfig({ schemaVersion: 3,
    name: `BENCHMARK ONLY: ${mode} engines, ${nodes} nodes, round ${round}`,
    seed: 20261118, repetitions: jobs,
    engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: [{ id: 'start', moves: [] }],
    comparisons: [{ id: COMPARISON, label: 'Benchmark Vanguard versus Unicorn',
      armyA: { upgrades: { a1: vanguard.id } }, armyB: { upgrades: { b1: unicorn.id } },
      strengthA: { skill: 20 }, strengthB: { skill: 20 } }],
    evaluation: { pieceValues: { [vanguard.id]: vanguard.engineValue, [unicorn.id]: unicorn.engineValue } } });
}
function buildBenchmarkPlan({ jobs = 4, rounds = 2 } = {}) {
  settings({ nodes: NODES[0], mode: MODES[0], jobs, round: rounds });
  const cells = [];
  for (let round = 1; round <= rounds; round++) {
    const budgets = round % 2 ? [...NODES] : [...NODES].reverse();
    for (const nodes of budgets) {
      // Each budget reverses AB/BA between rounds; budget order also reverses.
      const modes = (round + NODES.indexOf(nodes)) % 2 ? [...MODES] : [...MODES].reverse();
      for (const mode of modes) {
        const key = `round-${String(round).padStart(2, '0')}-n${nodes}-${mode}`;
        const config = buildCellConfig({ nodes, mode, jobs, round }), schedule = makeSchedule(config);
        cells.push({ key, directory: key, round, nodes, mode, games: schedule.length,
          configSha256: sha(config), scheduleSha256: sha(schedule),
          expectedNativeProcessMax: jobs * (mode === 'shared' ? 1 : 2) });
      }
    }
  }
  return { schemaVersion: 1, format: 'levelup-v18-engine-sharing-benchmark-plan', benchmarkOnly: true,
    jobs, rounds, games: cells.reduce((sum, cell) => sum + cell.games, 0), cells,
    searchPolicy: { skill: 20, threads: 1, hashMbPerEngine: 32, nodes: [...NODES], maxPlies: 400,
      freshPhysicalProcessesPerGame: true, startingPosition: 'ordinary chess with Vanguard a1 versus Unicorn b1; colors swapped; no forced prefix' },
    interpretation: 'Same four-job runner/storage protocol, one versus two physical engines per game. Shared transposition history may change moves and game lengths; benchmark games never count as piece-balance evidence.' };
}

function validateTiming(record, mode, finalized) {
  if (record.benchmarkOnly !== true || record.engineMode !== mode) throw new Error('A benchmark record lost its purpose or engine-mode marker.');
  if (!finalized) return;
  if (!Array.isArray(record.moves) || !Array.isArray(record.sans) || record.moves.length !== record.sans.length
    || record.playedPlies !== record.moves.length || record.totalPlies !== record.moves.length
    || record.openingPlies !== 0 || !Array.isArray(record.openingMoves) || record.openingMoves.length !== 0) {
    throw new Error('Benchmark histories must account for every played ply without a forced opening.');
  }
  const timing = record.benchmarkTiming, physical = mode === 'shared' ? 1 : 2;
  const restoredWithoutSearch = record.attempt > 1 && timing?.searchCalls === 0 && timing.startPly === record.moves.length;
  if (!timing || ['prepareMs', 'searchMs', 'elapsedBeforePersistMs'].some(field => !Number.isFinite(timing[field]) || timing[field] < 0)
    || ['startPly', 'searchCalls', 'reportedNodes', 'missingNodeReports'].some(field => !Number.isSafeInteger(timing[field]) || timing[field] < 0)
    || timing.startPly > record.moves.length || record.attempt === 1 && timing.startPly !== 0
    || timing.startPly + timing.searchCalls !== record.moves.length
    || timing.missingNodeReports > timing.searchCalls
    || !(timing.physicalEngines === physical || timing.physicalEngines === 0 && restoredWithoutSearch)
    || !Array.isArray(timing.nativePids) || timing.nativePids.length !== timing.physicalEngines
    || timing.nativePids.some(pid => !Number.isSafeInteger(pid) || pid < 1)
    || new Set(timing.nativePids).size !== timing.physicalEngines
    || timing.searchCalls === 0 && (timing.reportedNodes !== 0 || timing.searchMs !== 0)) {
    throw new Error('Invalid benchmark timing, restored-prefix accounting or physical-engine measurements.');
  }
}

function analyzeCell(plan, descriptor, result) {
  if (!result || result.key !== descriptor.key
    || !(Number.isFinite(result.elapsedMs) && result.elapsedMs > 0 || result.elapsedMs === null && result.timingEligible === false)) {
    throw new Error('A cell requires a declared key and positive measured wall time, or explicit null time excluded from timing.');
  }
  for (const field of ['nodes', 'mode', 'round', 'directory']) if (result[field] !== undefined && result[field] !== descriptor[field]) throw new Error('A benchmark result changed its cell identity.');
  const config = buildCellConfig({ ...descriptor, jobs: plan.jobs }), schedule = makeSchedule(config);
  const manifest = result.manifest, records = result.records;
  if (!manifest || !isDeepStrictEqual(manifest.config, config) || !isDeepStrictEqual(manifest.schedule, schedule)
    || manifest.parallel?.jobs !== plan.jobs || !Array.isArray(records)) throw new Error('Cell manifest does not match its benchmark declaration.');
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  if (!isDeepStrictEqual(manifest.designRegistry, registry)
    || ['variant', 'config', 'hash', 'registryHash'].some(field => manifest.designProfile?.[field] !== profile[field])) throw new Error('Benchmark movement or value profile changed.');
  const metadata = { rows: [{ key: 'vanguard', label: 'Vanguard' }], columns: [{ key: 'unicorn', label: 'Unicorn' }],
    comparisons: [{ id: COMPARISON, aKey: 'vanguard', aLabel: 'Vanguard', bKey: 'unicorn', bLabel: 'Unicorn' }] };
  const checked = createV17Report({ experiment: descriptor.key, config, metadata, records, manifest });
  const latest = new Map();
  for (const record of records) {
    const finalized = ['completed', 'truncated'].includes(record.status);
    validateTiming(record, descriptor.mode, finalized);
    latest.set(record.id, record);
  }
  const finished = [...latest.values()].filter(record => ['completed', 'truncated'].includes(record.status));
  const complete = checked.progress.finalizedGames === descriptor.games;
  const freshAttempts = records.length === descriptor.games && records.every(record => record.attempt === 1 && ['completed', 'truncated'].includes(record.status));
  const timingEligible = complete && freshAttempts && result.elapsedMs !== null && result.timingEligible !== false && result.freshSession !== false;
  const timings = finished.map(record => record.benchmarkTiming), sum = field => timings.reduce((value, row) => value + row[field], 0);
  const searchedPlies = sum('searchCalls'), reportedNodes = sum('reportedNodes'), missingNodeReports = sum('missingNodeReports');
  const gameMs = finished.map(record => Date.parse(record.finishedAt) - Date.parse(record.startedAt));
  if (gameMs.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Benchmark game timestamps are invalid.');
  return { ...descriptor, finalizedGames: finished.length, completedGames: finished.filter(record => record.status === 'completed').length,
    truncatedGames: finished.filter(record => record.status === 'truncated').length, attempts: records.length, complete,
    timingEligible, timingExclusion: timingEligible ? null : 'Only complete, fresh, first-attempt cells are compared; interrupted/resumed timings are excluded.',
    elapsedMs: result.elapsedMs, gamesPerHour: timingEligible ? 3600000 * finished.length / result.elapsedMs : null,
    searchedPlies, meanPliesPerGame: finished.length ? finished.reduce((sum, record) => sum + record.moves.length, 0) / finished.length : null,
    meanGameSeconds: mean(gameMs) === null ? null : mean(gameMs) / 1000,
    meanPrepareMs: timings.length ? sum('prepareMs') / timings.length : null,
    searchMs: sum('searchMs'), searchMsPerPly: searchedPlies ? sum('searchMs') / searchedPlies : null,
    reportedNodes, missingNodeReports, reportedNodesPerSearch: !missingNodeReports && searchedPlies ? reportedNodes / searchedPlies : null,
    reportedNodesPerWallSecond: timingEligible && !missingNodeReports ? reportedNodes / (result.elapsedMs / 1000) : null,
    enginesPerGame: descriptor.mode === 'shared' ? 1 : 2,
    configuredNativeHashMb: descriptor.expectedNativeProcessMax * config.engine.hashMb,
    nativeRssBytes: null, nativeRssMeasured: false,
    outcomeCounts: { whiteWins: finished.filter(record => record.result === '1-0').length,
      blackWins: finished.filter(record => record.result === '0-1').length, draws: finished.filter(record => record.result === '1/2-1/2').length },
    measurementScope: 'Cell elapsed wall time includes the runner preflight, game setup, searches, persistence, reporting and engine teardown. Per-game and search sums overlap across workers; they are not wall time. On ineligible retries, search diagnostics cover only the finalized attempt, while game length includes its restored prefix.' };
}
function summarizeBenchmark(manifest, results = []) {
  const expected = buildBenchmarkPlan({ jobs: manifest.jobs, rounds: manifest.rounds });
  for (const field of ['schemaVersion', 'format', 'benchmarkOnly', 'jobs', 'rounds', 'games', 'cells', 'searchPolicy', 'interpretation']) {
    if (!isDeepStrictEqual(manifest[field], expected[field])) throw new Error('The frozen benchmark plan changed.');
  }
  if (!Array.isArray(results) || new Set(results.map(result => result.key)).size !== results.length) throw new Error('Benchmark results must have distinct cell keys.');
  const byKey = new Map(expected.cells.map(cell => [cell.key, cell]));
  const cells = results.map(result => {
    const descriptor = byKey.get(result.key);
    if (!descriptor) throw new Error('Unknown benchmark cell.');
    return analyzeCell(expected, descriptor, result);
  });
  const summaries = NODES.flatMap(nodes => MODES.map(mode => {
    const measured = cells.filter(cell => cell.nodes === nodes && cell.mode === mode && cell.timingEligible);
    return { nodes, mode, eligibleCells: measured.length, plannedCells: expected.rounds,
      medianElapsedMs: median(measured.map(cell => cell.elapsedMs)), medianGamesPerHour: median(measured.map(cell => cell.gamesPerHour)),
      medianSearchMsPerPly: median(measured.map(cell => cell.searchMsPerPly).filter(value => value !== null)),
      medianPliesPerGame: median(measured.map(cell => cell.meanPliesPerGame).filter(value => value !== null)),
      medianPrepareMs: median(measured.map(cell => cell.meanPrepareMs).filter(value => value !== null)),
      medianReportedNodesPerWallSecond: median(measured.map(cell => cell.reportedNodesPerWallSecond).filter(value => value !== null)),
      configuredNativeHashMb: expected.jobs * (mode === 'shared' ? 1 : 2) * 32,
      expectedNativeProcessMax: expected.jobs * (mode === 'shared' ? 1 : 2) };
  }));
  const comparisons = NODES.map(nodes => {
    const pairs = [];
    for (let round = 1; round <= expected.rounds; round++) {
      const separate = cells.find(cell => cell.nodes === nodes && cell.round === round && cell.mode === 'separate' && cell.timingEligible);
      const shared = cells.find(cell => cell.nodes === nodes && cell.round === round && cell.mode === 'shared' && cell.timingEligible);
      if (separate && shared) pairs.push({ round, separateElapsedMs: separate.elapsedMs, sharedElapsedMs: shared.elapsedMs,
        elapsedReductionPercent: 100 * (1 - shared.elapsedMs / separate.elapsedMs),
        throughputRatio: shared.gamesPerHour / separate.gamesPerHour });
    }
    return { nodes, pairedRounds: pairs.length, plannedRounds: expected.rounds, pairs,
      medianElapsedReductionPercent: median(pairs.map(pair => pair.elapsedReductionPercent)),
      medianThroughputRatio: median(pairs.map(pair => pair.throughputRatio)),
      complete: pairs.length === expected.rounds };
  });
  return { schemaVersion: 1, format: 'levelup-v18-engine-sharing-benchmark-report', benchmarkOnly: true,
    runId: manifest.runId || null, plannedCells: expected.cells.length, reportedCells: cells.length,
    eligibleCells: cells.filter(cell => cell.timingEligible).length, plannedGames: expected.games,
    finalizedGames: cells.reduce((sum, cell) => sum + cell.finalizedGames, 0),
    jobs: expected.jobs, rounds: expected.rounds, cells, summaries, comparisons,
    limitations: [
      'Benchmark-only repeated starting-position games are not independent openings, head-to-head balance results or piece-value evidence.',
      'At the default four jobs, either mode has at most four active searches. Four versus eight native processes does not imply twice the CPU search capacity.',
      'Shared hash/search history can change chosen moves, game lengths and search work per node. Games/hour alone cannot distinguish faster searches from shorter games.',
      'Reported nodes and searched plies normalize useful work but positions still differ; a fixed-trajectory replay is a separate follow-up if the result needs explanation.',
      'Cell wall time includes setup, native preflight, persistence, aggregation and teardown. Short benchmark cells do not reproduce every overhead of an 880-game scientific stage.',
      'Configured hash budgets are settings, not measured RSS. Native memory usage is not sampled by this benchmark.',
      'Incomplete, retried or resumed cells remain visible but do not enter fresh timing comparisons. Truncations remain unscored and are counted separately.',
      'Alternating order reduces consistent order bias; CPU power, cooling, disk activity and the small number of rounds still limit precision. No automatic runner switch or whole-panel speed guarantee follows.'
    ] };
}

function renderReport(report) {
  const number = (value, decimals = 2) => value === null ? 'pending' : value.toFixed(decimals);
  return ['# Engine-sharing throughput benchmark', '',
    '**Benchmark only. These games are excluded from balance evidence.**', '',
    `${report.jobs} game workers; ${report.rounds} alternating rounds; ${report.finalizedGames}/${report.plannedGames} games finalized; ${report.eligibleCells}/${report.plannedCells} fresh timed cells.`, '',
    '| Nodes | Engine mode | Eligible rounds | Median cell seconds | Games/hour | Search ms/ply | Plies/game | Nominal native processes | Configured hash MiB |',
    '| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.summaries.map(row => `| ${row.nodes} | ${row.mode} | ${row.eligibleCells}/${row.plannedCells} | ${number(row.medianElapsedMs === null ? null : row.medianElapsedMs / 1000)} | ${number(row.medianGamesPerHour)} | ${number(row.medianSearchMsPerPly)} | ${number(row.medianPliesPerGame)} | ${row.expectedNativeProcessMax} | ${row.configuredNativeHashMb} |`), '',
    '| Nodes | Paired fresh rounds | Median elapsed reduction with shared (%) | Median throughput ratio (shared/separate) |',
    '| ---: | ---: | ---: | ---: |',
    ...report.comparisons.map(row => `| ${row.nodes} | ${row.pairedRounds}/${row.plannedRounds} | ${number(row.medianElapsedReductionPercent)} | ${number(row.medianThroughputRatio)} |`), '',
    'Positive elapsed reduction favors sharing; a throughput ratio above 1 favors sharing. Comparisons use only rounds where both modes completed fresh. Native RSS is not measured.', '',
    '| Cell | Finalized | Truncated | Timing eligible | Wall seconds | Reported nodes/s (wall) | Mean setup ms/game |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: |',
    ...report.cells.map(row => `| ${row.key} | ${row.finalizedGames}/${row.games} | ${row.truncatedGames} | ${row.timingEligible ? 'yes' : 'no'} | ${number(row.elapsedMs === null ? null : row.elapsedMs / 1000)} | ${number(row.reportedNodesPerWallSecond, 0)} | ${number(row.meanPrepareMs)} |`), '',
    ...report.limitations.map(note => `- ${note}`), ''].join('\n');
}

module.exports = { MODES, NODES, buildCellConfig, buildBenchmarkPlan, analyzeCell, summarizeBenchmark, renderReport };
