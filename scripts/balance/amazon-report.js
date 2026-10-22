'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { makeLevel3Report } = require('./level3-report');
const { summarize } = require('./stats');
const { buildCampaign } = require('./prepare');

const CONFIG_FILE = path.resolve(__dirname, '../../experiments/balance/amazon-revision.json');
const ROSTER_FILE = path.resolve(__dirname, '../../experiments/balance/amazon-revision-roster.json');
const percent = score => score === null ? '—' : `${(score * 100).toFixed(1)}%`;

function getCampaign() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
  const config = normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  const schedule = makeSchedule(config);
  if (roster.maxGames !== 540 || roster.openingPairs !== 30 || !isDeepStrictEqual(roster.practicalScoreBand, [0.4, 0.6])
    || roster.referenceId !== 'queen.purple@1' || roster.candidates.length !== 8
    || schedule.length !== 540 || config.openings.length !== 30 || config.comparisons.length !== 9 || config.repetitions !== 1
    || !isDeepStrictEqual(config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 })) {
    throw new Error('The declared Amazon revision campaign must retain its 540-game cap, 30 opening pairs, seven revisions, fixed Amazon, and search settings.');
  }
  const candidateIds = new Set(roster.candidates.filter(candidate => candidate.id !== roster.referenceId).map(candidate => candidate.id));
  const expectedIds = new Set(['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'bishop.purple@3', 'bishop.purple@4', 'rook.purple@4', 'queen.purple@4']);
  if (!isDeepStrictEqual(candidateIds, expectedIds)) throw new Error('The Amazon campaign must contain exactly the seven declared new revisions.');
  const generated = buildCampaign(roster, { mode: 'reference', maxGames: 540, openingPairs: 30, seed: 42, nodes: 100000, openings: config.openings });
  if (!isDeepStrictEqual(config, generated.config)) throw new Error('The Amazon campaign must retain its declared pairings, controls, seed and equal engine strengths.');
  for (const comparison of config.comparisons) {
    if (['standard-control', 'amazon-control'].includes(comparison.id)) continue;
    if (!candidateIds.has(Object.values(comparison.armyA.upgrades)[0]) || Object.keys(comparison.armyA.upgrades).length !== 1
      || !isDeepStrictEqual(comparison.armyB, { upgrades: { d1: roster.referenceId }, remove: [] })) {
      throw new Error('Only the declared new purchases versus the fixed Amazon may enter this campaign.');
    }
  }
  return { roster, config, schedule, configFile: CONFIG_FILE };
}

function verifyCampaignManifest(manifest) {
  const expected = getCampaign();
  if (!manifest || !isDeepStrictEqual(normalizeConfig(manifest.config), expected.config)
    || !isDeepStrictEqual(manifest.schedule, expected.schedule)) {
    throw new Error('This run does not contain the complete frozen 540-game Amazon revision campaign. Use its original configuration and checkout.');
  }
  return expected;
}

function makeAmazonReport(manifest, records) {
  const { roster } = verifyCampaignManifest(manifest);
  // Shared validation checks every army, record, rules/profile identity,
  // strength setting and parallel assignment before calculating a score.
  const base = makeLevel3Report(manifest, records, roster);
  const summaries = new Map(summarize(records).comparisons.map(row => [row.comparisonId, row]));
  const candidates = roster.candidates.filter(candidate => candidate.id !== roster.referenceId).map(candidate => {
    const matchup = base.matrix[candidate.id][roster.referenceId];
    const aggregate = summaries.get(matchup.comparisonId);
    const score = matchup.score;
    const complete = matchup.scoredGames === matchup.scheduledGames;
    const position = score === null ? 'unscored' : score < roster.practicalScoreBand[0] ? 'below-target'
      : score > roster.practicalScoreBand[1] ? 'above-target' : 'within-target';
    return {
      id: candidate.id, label: candidate.label, comparisonId: matchup.comparisonId,
      score, assessment: score === null || complete ? position : `provisional-${position}`, complete,
      completePairs: matchup.completePairs, plannedPairs: matchup.scheduledGames / 2,
      partialPairs: aggregate?.paired.partialPairs || 0,
      scoredGames: matchup.scoredGames, scheduledGames: matchup.scheduledGames,
      uniqueOpenings: matchup.uniqueOpenings, openingClusters: matchup.openingClusters,
      wins: aggregate?.paired.wins || 0, draws: aggregate?.paired.draws || 0, losses: aggregate?.paired.losses || 0,
      statusCounts: matchup.statusCounts,
    };
  });
  return {
    schemaVersion: 1, format: 'levelup-amazon-revision-report', runId: manifest.runId, name: base.name,
    referenceId: roster.referenceId, practicalScoreBand: roster.practicalScoreBand,
    scheduledGames: base.scheduledGames, totalAttempts: base.totalAttempts, statusCounts: base.statusCounts,
    finishedGames: base.scheduledGames - base.timing.remainingGames, finished: base.timing.remainingGames === 0,
    complete: candidates.every(candidate => candidate.complete) && base.controls.every(control => control.scoredGames === control.scheduledGames),
    profileHash: base.profileHash, registryHash: base.registryHash, engine: base.engine,
    engineSha256: manifest.engineSha256, runnerSha256: manifest.runnerSha256,
    candidates, controls: base.controls, timing: base.timing,
    interpretation: 'Candidate points scores use complete color-swapped pairs, weighted equally by opening cluster; draws count as half a point. The 40%–60% band is a practical design target, not a confidence interval or proof of equal material. Partial coverage stays provisional. Related opening prefixes and one engine protocol limit generalization. This reference-only experiment has no cross-candidate rankings or automatic follow-up stage.',
  };
}

function csv(rows) { return rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n'; }

function renderMarkdown(report) {
  const rows = report.candidates.map(row => `| ${row.label} | ${row.id} | ${percent(row.score)} | ${row.assessment} | ${row.completePairs}/${row.plannedPairs} | ${row.wins}/${row.draws}/${row.losses} | ${row.statusCounts.truncated} | ${row.statusCounts.error} |`).join('\n');
  const controls = report.controls.map(row => `- ${row.label}: A ${percent(row.scoreA)}; ${row.completePairs}/${row.scheduledGames / 2} complete pairs; White ${row.physicalColors.whiteWins} wins / ${row.physicalColors.draws} draws / ${row.physicalColors.blackWins} losses; ${row.statusCounts.truncated} truncated, ${row.statusCounts.error} errors.`).join('\n');
  const timing = report.timing.meanSeconds === null ? 'No usable game timestamps yet.' : `${report.timing.sampleGames} timed first-attempt games, mean ${report.timing.meanSeconds.toFixed(1)} seconds. Rough remaining time: ${(report.timing.estimatedRemainingSeconds / 3600).toFixed(1)} hours.${report.timing.executionMode === 'parallel' ? ` ${report.timing.jobs} workers; estimate follows the longest remaining queue.` : ''}`;
  const completion = report.complete ? 'All scheduled games are scored.' : report.finished
    ? 'All scheduled games finished, but unscored games leave incomplete pair coverage. Target-band labels remain provisional.'
    : 'Incomplete campaign: scores and target-band labels remain provisional.';
  return `# ${report.name}\n\n${completion}\n\n${report.interpretation}\n\n| Purchase | Revision | Points vs Amazon | Assessment | Pairs | W/D/L | Truncated attempts | Error attempts |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n## Controls\n\n${controls}\n\nIdentical-army A scores commonly equal 50% by construction. Inspect physical colors, interruptions and completion separately; controls do not establish upgrade balance.\n\n## Runtime\n\n${timing}\n\n${report.timing.basis}\n\nRun: ${report.runId}. Rules profile: ${report.profileHash}. Registry: ${report.registryHash}.\n`;
}

function writeAmazonReport(directory) {
  const outDir = path.resolve(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'));
  let journal;
  try { journal = fs.readFileSync(path.join(outDir, 'games.jsonl'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; journal = ''; }
  // Read only complete journal lines; reporting never repairs source files.
  const records = journal.slice(0, journal.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
  const report = makeAmazonReport(manifest, records);
  const files = { json: 'amazon-report.json', csv: 'amazon-scores.csv', markdown: 'amazon-report.md' };
  const rows = [['design_id', 'purchase', 'comparison_id', 'paired_score', 'assessment', 'complete_pairs', 'planned_pairs', 'scored_games', 'scheduled_games', 'unique_openings', 'wins', 'draws', 'losses', 'truncated_attempts', 'error_attempts'],
    ...report.candidates.map(row => [row.id, row.label, row.comparisonId, row.score, row.assessment, row.completePairs, row.plannedPairs, row.scoredGames, row.scheduledGames, row.uniqueOpenings, row.wins, row.draws, row.losses, row.statusCounts.truncated, row.statusCounts.error])];
  fs.writeFileSync(path.join(outDir, files.json), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, files.csv), csv(rows));
  fs.writeFileSync(path.join(outDir, files.markdown), renderMarkdown(report));
  return { report, files: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, path.join(outDir, file)])) };
}

module.exports = { getCampaign, verifyCampaignManifest, makeAmazonReport, writeAmazonReport };
