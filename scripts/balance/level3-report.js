'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { summarize } = require('./stats');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { getDesign } = require('../../src/design-catalog');

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const DEFAULT_ROSTER = path.resolve(__dirname, '../../experiments/balance/level3-roster.json');
const percent = score => score === null ? '—' : `${(score * 100).toFixed(1)}%`;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const counts = () => ({ completed: 0, truncated: 0, aborted: 0, error: 0, unknown: 0 });

function validateParallelLayout(parallel, schedule) {
  if (parallel === undefined) return;
  if (!parallel || parallel.schemaVersion !== 1 || !Number.isInteger(parallel.jobs) || parallel.jobs < 1 || parallel.jobs > 16 || !Array.isArray(parallel.shards) || parallel.shards.length !== parallel.jobs) throw new Error('Invalid parallel worker layout.');
  const assigned = new Set(), workers = new Set(), pairWorkers = new Map();
  for (const shard of parallel.shards) {
    if (!Number.isInteger(shard.worker) || shard.worker < 1 || shard.worker > parallel.jobs || workers.has(shard.worker) || !Array.isArray(shard.scheduleIds) || !shard.scheduleIds.length || shard.scheduleIds.length > schedule.size) throw new Error('Invalid parallel worker assignment.');
    workers.add(shard.worker);
    for (const id of shard.scheduleIds) {
      const game = schedule.get(id);
      if (!game || assigned.has(id)) throw new Error('Parallel workers must assign every scheduled game exactly once.');
      assigned.add(id);
      if (pairWorkers.has(game.pairId) && pairWorkers.get(game.pairId) !== shard.worker) throw new Error('A parallel color pair cannot span multiple workers.');
      pairWorkers.set(game.pairId, shard.worker);
    }
  }
  if (assigned.size !== schedule.size) throw new Error('Parallel workers must cover the complete frozen schedule.');
}

function singleArmy(candidate) { return { upgrades: { [candidate.square]: candidate.id }, remove: [] }; }

function validatedInput(manifest, records, roster) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(records) || !Array.isArray(roster?.candidates) || roster.candidates.length < 2) throw new Error('A level-3 campaign manifest, journal, and roster are required.');
  const config = normalizeConfig(manifest.config);
  if (config.schemaVersion !== 2) throw new Error('The level-3 report requires a design-registry experiment.');
  const byId = new Map(), byArmy = new Map(), keys = new Set();
  for (const candidate of roster.candidates) {
    const definition = getDesign(candidate.id);
    if (!definition || definition.level !== 3 || typeof candidate.key !== 'string' || !candidate.label || byId.has(candidate.id) || keys.has(candidate.key)) throw new Error('The campaign roster must contain distinct, known level-3 designs.');
    const army = singleArmy(candidate);
    // Family/slot checks are shared with ordinary campaign normalization.
    normalizeConfig({ ...config, evaluation: undefined, comparisons: [{ id: 'roster-check', armyA: army, armyB: army }] });
    byId.set(candidate.id, candidate);
    byArmy.set(JSON.stringify(army), candidate);
    keys.add(candidate.key);
  }
  const reference = byId.get(roster.referenceId);
  if (!reference) throw new Error('The reference design is missing from the campaign roster.');
  const controlIds = new Set((roster.controls || []).map(control => control.id));
  const matchups = new Map();
  const protocolStrength = config.comparisons[0].strengthA;
  for (const comparison of config.comparisons) {
    if (!isDeepStrictEqual(comparison.strengthA, comparison.strengthB)) throw new Error('Level-3 standings require equal engine strength on both sides.');
    if (!isDeepStrictEqual(comparison.strengthA, protocolStrength)) throw new Error('Level-3 standings cannot pool different engine strength settings across matchups.');
    const a = byArmy.get(JSON.stringify(comparison.armyA));
    const b = byArmy.get(JSON.stringify(comparison.armyB));
    if (controlIds.has(comparison.id)) {
      const expected = comparison.id === 'standard-control' ? { upgrades: {}, remove: [] }
        : comparison.id === 'amazon-control' ? singleArmy(reference) : null;
      if (!expected || !isDeepStrictEqual(comparison.armyA, expected) || !isDeepStrictEqual(comparison.armyB, expected)) throw new Error(`Control armies do not match ${comparison.id}.`);
      matchups.set(comparison.id, { control: true, comparison });
    } else {
      if (!a || !b || a.id === b.id || comparison.id !== `${a.key}-v-${b.key}`) throw new Error(`Unrecognized level-3 matchup or armies: ${comparison.id}.`);
      const key = [a.id, b.id].sort().join('|');
      if ([...matchups.values()].some(matchup => matchup.key === key)) throw new Error('A campaign must not duplicate an opponent matchup under another name.');
      matchups.set(comparison.id, { a, b, key, control: false, comparison });
    }
  }
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  if (!isDeepStrictEqual(manifest.designRegistry, registry)
    || !isDeepStrictEqual(manifest.designProfile, { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: profile.registryHash })) throw new Error('The manifest does not preserve the declared catalog definitions and rule identity.');
  const canonical = new Map(makeSchedule(config).map(game => [game.id, game]));
  if (!Array.isArray(manifest.schedule) || !manifest.schedule.length || manifest.schedule.length > (roster.maxGames || 2000)) throw new Error('The frozen schedule is missing or exceeds the campaign cap.');
  const schedule = new Map();
  for (const game of manifest.schedule) {
    if (schedule.has(game.id) || !isDeepStrictEqual(game, canonical.get(game.id))) throw new Error('The frozen schedule does not match the declared campaign.');
    schedule.set(game.id, game);
  }
  validateParallelLayout(manifest.parallel, schedule);
  for (const record of records) {
    const game = record && schedule.get(record.id);
    if (!game || record.comparisonId !== game.comparisonId || record.pairId !== game.pairId || record.openingId !== game.openingId || record.aColor !== game.aColor) throw new Error('A journal record does not belong to the frozen schedule.');
    if (record.profileHash !== profile.hash || record.registryHash !== registry.hash || record.registryReference !== 'run.json#designRegistry'
      || record.variant !== profile.variant || !isDeepStrictEqual(record.engine, config.engine)
      || !isDeepStrictEqual(record.evaluation, config.evaluation)) throw new Error('A journal record has different definitions, rules, or engine settings.');
    const white = record.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB;
    const black = record.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB;
    if (!isDeepStrictEqual(record.whiteStrength, white) || !isDeepStrictEqual(record.blackStrength, black)) throw new Error('A journal record has different engine strength settings.');
  }
  return { config, profile, matchups, schedule, parallel: manifest.parallel };
}

/** Keep stats.js's latest-valid-completion behavior, including failed retries. */
function pairedRecords(records, comparisonId) {
  const latest = new Map();
  for (const record of records) if (record.comparisonId === comparisonId && record.status === 'completed' && RESULTS.has(record.result)) latest.set(record.id, record);
  const pairs = new Map();
  for (const record of latest.values()) {
    if (!pairs.has(record.pairId)) pairs.set(record.pairId, []);
    pairs.get(record.pairId).push(record);
  }
  return [...pairs.values()].filter(pair => pair.length === 2 && pair[0].aColor !== pair[1].aColor && pair[0].openingId === pair[1].openingId).flat();
}

function timingReport(records, schedule, parallel) {
  const final = new Map();
  for (const record of records) if (record.status === 'truncated' || record.status === 'completed' && RESULTS.has(record.result)) final.set(record.id, record);
  const durations = [];
  let excludedRetryGames = 0, missingOrInvalidTimestamps = 0;
  for (const record of final.values()) {
    // A resumed attempt can contain many already-played moves, but its clock
    // starts again at resume. It is not a full-game runtime measurement.
    if (record.attempt > 1) { excludedRetryGames++; continue; }
    const seconds = (Date.parse(record.finishedAt) - Date.parse(record.startedAt)) / 1000;
    if (Number.isFinite(seconds) && seconds >= 0) durations.push(seconds);
    else missingOrInvalidTimestamps++;
  }
  durations.sort((a, b) => a - b);
  const meanSeconds = average(durations);
  const medianSeconds = durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[Math.floor(durations.length / 2)]) / 2 : null;
  const remainingGames = schedule.size - final.size;
  const result = {
    sampleGames: durations.length, missingOrInvalidTimestamps, excludedRetryGames,
    meanSeconds, medianSeconds, observedSeconds: durations.reduce((sum, value) => sum + value, 0),
    remainingGames, estimatedRemainingSeconds: meanSeconds === null ? null : meanSeconds * remainingGames,
    estimatedFullRunSeconds: meanSeconds === null ? null : meanSeconds * schedule.size,
    smallSample: durations.length < 20,
    basis: 'Completed/truncated first-attempt games with valid timestamps; retry completions, aborted/error attempts and preflight excluded. Estimates assume the observed games represent the remaining matchups; hardware, congestion and endings can change runtime.',
  };
  if (parallel) {
    const remainingByWorker = parallel.shards.map(shard => ({ worker: shard.worker, remainingGames: shard.scheduleIds.filter(id => !final.has(id)).length }));
    const longestQueue = Math.max(...remainingByWorker.map(worker => worker.remainingGames));
    result.executionMode = 'parallel';
    result.jobs = parallel.jobs;
    result.remainingByWorker = remainingByWorker;
    result.estimatedSequentialRemainingSeconds = result.estimatedRemainingSeconds;
    result.estimatedRemainingSeconds = meanSeconds === null ? null : meanSeconds * longestQueue;
    result.estimatedFullRunSeconds = meanSeconds === null ? null : meanSeconds * Math.max(...parallel.shards.map(shard => shard.scheduleIds.length));
    result.basis += ' Parallel wall-time estimates use the longest remaining worker queue and observed concurrent game durations. Summed game durations overlap and are not elapsed wall time; worker imbalance and shared CPU resources limit speedup.';
  }
  return result;
}

/** Describe one frozen campaign, without assigning piece Elo or material values. */
function makeLevel3Report(manifest, records, roster = JSON.parse(fs.readFileSync(DEFAULT_ROSTER, 'utf8'))) {
  const { config, profile, matchups, schedule, parallel } = validatedInput(manifest, records, roster);
  const summary = summarize(records), summaries = new Map(summary.comparisons.map(comparison => [comparison.comparisonId, comparison]));
  const matrix = Object.fromEntries(roster.candidates.map(candidate => [candidate.id, {}]));
  const controls = [], results = [];
  const appearance = new Map(roster.candidates.map(candidate => [candidate.id, { scheduledGames: 0, statusCounts: counts(), openingIds: new Set() }]));
  for (const [comparisonId, matchup] of matchups) {
    const aggregate = summaries.get(comparisonId);
    const actualPairs = pairedRecords(records, comparisonId);
    const scheduledGames = [...schedule.values()].filter(game => game.comparisonId === comparisonId).length;
    const value = {
      comparisonId, scoreA: aggregate?.primaryEstimate.score ?? null,
      completePairs: aggregate?.paired.completePairs || 0, scoredGames: actualPairs.length,
      uniqueOpenings: aggregate?.primaryEstimate.uniqueOpenings || 0, scheduledGames,
      statusCounts: aggregate?.statusCounts || counts(),
      openingClusters: aggregate?.openingClusters || [],
    };
    if (matchup.control) {
      const whiteWins = actualPairs.filter(record => record.result === '1-0').length;
      const blackWins = actualPairs.filter(record => record.result === '0-1').length;
      const draws = actualPairs.length - whiteWins - blackWins;
      controls.push({ ...value, label: matchup.comparison.label,
        physicalColors: { games: actualPairs.length, whiteWins, draws, blackWins, whiteScore: actualPairs.length ? (whiteWins + draws / 2) / actualPairs.length : null },
        interpretation: 'Identical armies and settings make a paired A score near 50% expected; repeated identical games can force exactly 50%. Inspect physical-color results, errors, truncations and timings. This is a pipeline baseline, not evidence that upgrades are balanced.',
      });
      continue;
    }
    results.push({ ...value, designA: matchup.a.id, designB: matchup.b.id });
    for (const [candidate, opponent, inverse] of [[matchup.a, matchup.b, false], [matchup.b, matchup.a, true]]) {
      matrix[candidate.id][opponent.id] = { ...value, score: value.scoreA === null ? null : inverse ? 1 - value.scoreA : value.scoreA };
      const evidence = appearance.get(candidate.id);
      evidence.scheduledGames += scheduledGames;
      for (const status of Object.keys(evidence.statusCounts)) evidence.statusCounts[status] += value.statusCounts[status] || 0;
      for (const record of actualPairs) evidence.openingIds.add(record.openingId);
    }
  }
  const standings = roster.candidates.map(candidate => {
    const opponents = Object.entries(matrix[candidate.id]).filter(([, result]) => result.score !== null);
    const evidence = appearance.get(candidate.id);
    const completeOpponentCoverage = opponents.length === roster.candidates.length - 1;
    const partialMeanScore = average(opponents.map(([, result]) => result.score));
    const scoredGames = opponents.reduce((sum, [, result]) => sum + result.scoredGames, 0);
    const completeScheduledScores = evidence.scheduledGames > 0 && scoredGames === evidence.scheduledGames;
    return {
      id: candidate.id, label: candidate.label, rank: null,
      meanScore: completeOpponentCoverage && completeScheduledScores ? partialMeanScore : null, partialMeanScore,
      opponentCoverage: opponents.length, totalOpponents: roster.candidates.length - 1,
      completeOpponentCoverage, scheduledGames: evidence.scheduledGames, scoredGames,
      completeScheduledScores,
      completePairs: opponents.reduce((sum, [, result]) => sum + result.completePairs, 0),
      uniqueOpenings: evidence.openingIds.size, statusCounts: evidence.statusCounts,
      versusReference: matrix[candidate.id][roster.referenceId] || null,
    };
  });
  // A purchase that happens to finish first is not provisionally rank 1.
  // Show coverage and scores during play; rank only a complete round robin.
  const rankingAvailable = standings.every(row => row.completeOpponentCoverage && row.completeScheduledScores);
  const ranked = (rankingAvailable ? [...standings] : []).sort((a, b) => b.meanScore - a.meanScore || a.label.localeCompare(b.label));
  ranked.forEach((row, index) => { row.rank = index && row.meanScore === ranked[index - 1].meanScore ? ranked[index - 1].rank : index + 1; });
  standings.sort((a, b) => (a.rank === null) - (b.rank === null) || (a.rank || 0) - (b.rank || 0) || a.label.localeCompare(b.label));
  return {
    schemaVersion: 1, runId: manifest.runId, name: config.name, referenceId: roster.referenceId,
    profileHash: profile.hash, registryHash: profile.registryHash, engine: config.engine,
    scheduledGames: schedule.size, totalAttempts: records.length, statusCounts: summary.statusCounts, rankingAvailable,
    standings, matrix, matchups: results, controls, timing: timingReport(records, schedule, parallel),
    interpretation: 'Equal-opponent means use complete color-swapped pairs and equally weighted opening-cluster scores. Full means require every roster opponent and every scheduled game for that design to be scored. Rankings wait for the entire round robin to be scored. Partial means can cover different opponents and must not be ranked. Controls are excluded. These are provisional whole-army results under one frozen protocol, not piece Elo, material values, or counts of actual special-ability use.',
  };
}

function csv(rows) { return rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n'; }

function renderMarkdown(report) {
  const rows = report.standings.map(row => `| ${row.rank ?? '—'} | ${row.label} | ${percent(row.meanScore)} | ${percent(row.partialMeanScore)} | ${row.opponentCoverage}/${row.totalOpponents} | ${row.completePairs} | ${row.uniqueOpenings} | ${percent(row.versusReference?.score ?? null)} |`).join('\n');
  const controls = report.controls.map(control => `- ${control.label}: paired A ${percent(control.scoreA)}; physical White ${control.physicalColors.whiteWins} wins / ${control.physicalColors.draws} draws / ${control.physicalColors.blackWins} losses; ${control.completePairs} complete pairs; ${control.statusCounts.truncated || 0} truncated, ${control.statusCounts.error || 0} errors.`).join('\n');
  const timing = report.timing.meanSeconds === null ? 'No usable game timestamps yet.' : `${report.timing.sampleGames} timed games; mean ${report.timing.meanSeconds.toFixed(1)} seconds, median ${report.timing.medianSeconds.toFixed(1)} seconds. Rough remaining time: ${(report.timing.estimatedRemainingSeconds / 3600).toFixed(1)} hours.${report.timing.executionMode === 'parallel' ? ` ${report.timing.jobs} parallel workers; estimate follows the longest remaining queue.` : ''}${report.timing.smallSample ? ' Fewer than 20 samples: treat this as an early estimate.' : ''}`;
  return `# ${report.name}\n\n${report.interpretation}\n\n| Rank | Purchase | Full mean | Available-opponent mean | Opponents | Pairs | Openings | vs Amazon |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n## Controls\n\n${controls || 'No control games scored yet.'}\n\nIdentical control armies commonly produce identical paired games and exactly 50% for A. That score alone does not validate balance or reveal White’s advantage. Physical-color results, runtime, errors, truncations and movement checks provide the useful diagnostics.\n\n## Runtime\n\n${timing}\n\n${report.timing.basis}\n`;
}

function writeLevel3Report(directory) {
  const outDir = path.resolve(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'));
  let journal;
  try { journal = fs.readFileSync(path.join(outDir, 'games.jsonl'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; journal = ''; }
  // Status/reporting is read-only with respect to the journal: ignore a live
  // writer's torn final append without attempting recovery or truncation.
  const records = journal.slice(0, journal.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(line => JSON.parse(line));
  const report = makeLevel3Report(manifest, records);
  const files = {
    json: 'level3-report.json', standings: 'level3-standings.csv', matrix: 'level3-matrix.csv', markdown: 'level3-report.md',
  };
  const ids = Object.keys(report.matrix);
  const standingRows = [['rank', 'design_id', 'purchase', 'full_mean', 'available_opponent_mean', 'opponents', 'total_opponents', 'complete_pairs', 'unique_openings', 'vs_amazon', 'scheduled_games', 'scored_games', 'truncated_attempts', 'error_attempts'],
    ...report.standings.map(row => [row.rank, row.id, row.label, row.meanScore, row.partialMeanScore, row.opponentCoverage, row.totalOpponents, row.completePairs, row.uniqueOpenings, row.versusReference?.score, row.scheduledGames, row.scoredGames, row.statusCounts.truncated, row.statusCounts.error])];
  const matrixRows = [['design_id', ...ids], ...ids.map(id => [id, ...ids.map(opponent => report.matrix[id][opponent]?.score)])];
  fs.writeFileSync(path.join(outDir, files.json), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, files.standings), csv(standingRows));
  fs.writeFileSync(path.join(outDir, files.matrix), csv(matrixRows));
  fs.writeFileSync(path.join(outDir, files.markdown), renderMarkdown(report));
  return { report, files: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, path.join(outDir, file)])) };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/balance/level3-report.js RUN_DIRECTORY');
    const result = writeLevel3Report(process.argv[2]);
    console.log(`Campaign report written to ${result.files.markdown}`);
  } catch (error) { console.error(`Level-3 report failed: ${error.message}`); process.exitCode = 1; }
}

module.exports = { makeLevel3Report, writeLevel3Report };
