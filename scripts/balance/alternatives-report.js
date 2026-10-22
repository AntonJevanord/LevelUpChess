'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('./plan');
const { makeLevel3Report } = require('./level3-report');
const { summarize } = require('./stats');
const { buildCampaign } = require('./prepare');

const CONFIG_FILE = path.resolve(__dirname, '../../experiments/balance/amazon-alternatives.json');
const ROSTER_FILE = path.resolve(__dirname, '../../experiments/balance/amazon-alternatives-roster.json');
// Freeze the cohort as well as its size: replacing an opening is a new experiment.
const CONFIG_SHA256 = 'b377da056b4dfbf93a00b48d0b46734839db41de3ef65c6011b14bb0c497b523';
const GROUPS = [
  ['ranging-courier', 'pawn.purple@7', 'pawn.purple@8'],
  ['rank', 'pawn.purple@9', 'pawn.purple@10'],
  ['vertical', 'bishop.purple@3', 'bishop.purple@5'],
  ['sideways', 'bishop.purple@4', 'bishop.purple@6'],
  ['blink', 'rook.purple@4', 'rook.purple@5'],
  ['companion', 'queen.purple@4', 'queen.purple@5'],
];
const percent = score => score === null ? '—' : `${(score * 100).toFixed(1)}%`;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function getCampaign() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
  const config = normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  const schedule = makeSchedule(config);
  if (roster.maxGames !== 1200 || roster.scheduledGames !== 1120 || roster.openingPairs !== 40 || !isDeepStrictEqual(roster.practicalScoreBand, [0.4, 0.6])
    || roster.referenceId !== 'queen.purple@1' || roster.candidates.length !== 13
    || schedule.length !== 1120 || config.openings.length !== 40 || config.comparisons.length !== 14 || config.repetitions !== 1
    || !isDeepStrictEqual(config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 })) {
    throw new Error('The declared Amazon alternatives campaign must retain its 1200-game cap, 1120-game schedule, 40 opening pairs, twelve alternatives, fixed Amazon, and search settings.');
  }
  const candidateIds = new Set(roster.candidates.filter(candidate => candidate.id !== roster.referenceId).map(candidate => candidate.id));
  const expectedIds = new Set(['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'pawn.purple@10', 'bishop.purple@3', 'bishop.purple@5', 'bishop.purple@4', 'bishop.purple@6', 'rook.purple@4', 'rook.purple@5', 'queen.purple@4', 'queen.purple@5']);
  if (!isDeepStrictEqual(candidateIds, expectedIds)) throw new Error('The Amazon campaign must contain exactly the twelve declared alternatives.');
  if (!isDeepStrictEqual(roster.alternativeGroups?.map(group => [group.key, ...group.designIds]), GROUPS)
    || roster.alternativeGroups.some(group => typeof group.label !== 'string' || !group.label.trim())) {
    throw new Error('The alternatives campaign must preserve its six declared design groups.');
  }
  if (createHash('sha256').update(JSON.stringify(config)).digest('hex') !== CONFIG_SHA256) {
    throw new Error('The alternatives campaign configuration changed; retain its frozen openings, armies, settings and labels.');
  }
  const generated = buildCampaign(roster, { mode: 'reference', maxGames: 1200, openingPairs: 40, seed: 42, nodes: 100000, openings: config.openings });
  if (!isDeepStrictEqual(config, generated.config)) throw new Error('The Amazon campaign must retain its declared pairings, controls, seed and equal engine strengths.');
  for (const comparison of config.comparisons) {
    if (['standard-control', 'amazon-control'].includes(comparison.id)) continue;
    if (!candidateIds.has(Object.values(comparison.armyA.upgrades)[0]) || Object.keys(comparison.armyA.upgrades).length !== 1
      || !isDeepStrictEqual(comparison.armyB, { upgrades: { d1: roster.referenceId }, remove: [] })) {
      throw new Error('Only the declared alternative purchases versus the fixed Amazon may enter this campaign.');
    }
  }
  return { roster, config, schedule, configFile: CONFIG_FILE };
}

function verifyCampaignManifest(manifest) {
  const expected = getCampaign();
  if (!manifest || !isDeepStrictEqual(normalizeConfig(manifest.config), expected.config)
    || !isDeepStrictEqual(manifest.schedule, expected.schedule)) {
    throw new Error('This run does not contain the complete frozen 1120-game Amazon alternatives campaign. Use its original configuration and checkout.');
  }
  return expected;
}

function makeAlternativesReport(manifest, records) {
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
  const alternatives = roster.alternativeGroups.map(group => {
    const designs = group.designIds.map(id => candidates.find(candidate => candidate.id === id));
    const openingMaps = designs.map(design => new Map(design.openingClusters.map(opening => [opening.openingId, opening.score])));
    const sharedOpenings = [...openingMaps[0].keys()].filter(id => openingMaps[1].has(id)).sort();
    const openingScores = sharedOpenings.map(openingId => ({ openingId, scores: openingMaps.map(openings => openings.get(openingId)) }));
    const scores = designs.map((design, index) => {
      const score = mean(openingScores.map(opening => opening.scores[index]));
      return { id: design.id, label: design.label, score, distanceFromEven: score === null ? null : Math.abs(score - 0.5) };
    });
    const complete = designs.every(design => design.complete);
    const distanceDifference = scores[0].distanceFromEven === null ? null : scores[0].distanceFromEven - scores[1].distanceFromEven;
    const nearerToEvenId = distanceDifference === null || Math.abs(distanceDifference) < 1e-12 ? null : scores[distanceDifference < 0 ? 0 : 1].id;
    return {
      key: group.key, label: group.label, scores, sharedOpeningCount: sharedOpenings.length,
      plannedOpenings: roster.openingPairs, complete,
      assessment: !sharedOpenings.length ? 'unscored' : complete ? 'descriptive-comparison' : 'provisional-comparison',
      nearerToEvenId, distanceDifference, openingScores,
      interpretation: 'Compare distance from 50% only on shared, completely scored color pairs. A smaller observed distance does not establish a statistically reliable advantage or select a design automatically. Readability, enjoyment and counterplay remain selection criteria.',
    };
  });
  return {
    schemaVersion: 1, format: 'levelup-amazon-alternatives-report', runId: manifest.runId, name: base.name,
    referenceId: roster.referenceId, practicalScoreBand: roster.practicalScoreBand,
    scheduledGames: base.scheduledGames, totalAttempts: base.totalAttempts, statusCounts: base.statusCounts,
    finishedGames: base.scheduledGames - base.timing.remainingGames, finished: base.timing.remainingGames === 0,
    complete: candidates.every(candidate => candidate.complete) && base.controls.every(control => control.scoredGames === control.scheduledGames),
    profileHash: base.profileHash, registryHash: base.registryHash, engine: base.engine,
    engineSha256: manifest.engineSha256, runnerSha256: manifest.runnerSha256,
    candidates, alternatives, controls: base.controls, timing: base.timing,
    interpretation: 'Candidate points scores use complete color-swapped pairs, weighted equally by opening cluster; draws count as half a point. The 40%–60% band is a practical design target, not a confidence interval or proof of equal material. Partial coverage stays provisional. Related opening prefixes and one engine protocol limit generalization. This reference-only experiment has no cross-candidate rankings or automatic follow-up stage.',
  };
}

function csv(rows) { return rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n'; }

function renderMarkdown(report) {
  const rows = report.candidates.map(row => `| ${row.label} | ${row.id} | ${percent(row.score)} | ${row.assessment} | ${row.completePairs}/${row.plannedPairs} | ${row.wins}/${row.draws}/${row.losses} | ${row.statusCounts.truncated} | ${row.statusCounts.error} |`).join('\n');
  const groups = report.alternatives.map(group => `| ${group.label} | ${group.scores.map(score => `${score.label}: ${percent(score.score)}`).join('; ')} | ${group.sharedOpeningCount}/${group.plannedOpenings} | ${group.nearerToEvenId ? group.scores.find(score => score.id === group.nearerToEvenId).label : group.sharedOpeningCount ? 'Equal observed distance' : '—'} | ${group.assessment} |`).join('\n');
  const controls = report.controls.map(row => `- ${row.label}: A ${percent(row.scoreA)}; ${row.completePairs}/${row.scheduledGames / 2} complete pairs; White ${row.physicalColors.whiteWins} wins / ${row.physicalColors.draws} draws / ${row.physicalColors.blackWins} losses; ${row.statusCounts.truncated} truncated, ${row.statusCounts.error} errors.`).join('\n');
  const timing = report.timing.meanSeconds === null ? 'No usable game timestamps yet.' : `${report.timing.sampleGames} timed first-attempt games, mean ${report.timing.meanSeconds.toFixed(1)} seconds. Rough remaining time: ${(report.timing.estimatedRemainingSeconds / 3600).toFixed(1)} hours.${report.timing.executionMode === 'parallel' ? ` ${report.timing.jobs} workers; estimate follows the longest remaining queue.` : ''}`;
  const completion = report.complete ? 'All scheduled games are scored.' : report.finished
    ? 'All scheduled games finished, but unscored games leave incomplete coverage; inspect the affected rows and controls.'
    : 'Incomplete campaign: inspect coverage; scores from unfinished comparisons remain provisional.';
  return `# ${report.name}\n\n${completion}\n\n${report.interpretation}\n\n| Purchase | Revision | Points vs Amazon | Assessment | Pairs | W/D/L | Truncated attempts | Error attempts |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n## Alternative pairs\n\nScores below use only openings with complete color pairs for both designs. Differences are descriptive, including after full coverage; nearer 50% does not prove a design is better balanced. An unfinished group's comparison remains provisional.\n\n| Group | Points on shared openings | Shared openings | Descriptively nearer 50% | Coverage |\n| --- | --- | --- | --- | --- |\n${groups}\n\nNo automatic selection or additional run follows this table. Consider readability, enjoyment, counterplay and opening sensitivity before keep, revise or park decisions.\n\n## Controls\n\n${controls}\n\nIdentical-army A scores commonly equal 50% by construction. Inspect physical colors, interruptions and completion separately; controls do not establish upgrade balance or calibrate material values.\n\n## Runtime\n\n${timing}\n\n${report.timing.basis}\n\nRun: ${report.runId}. Rules profile: ${report.profileHash}. Registry: ${report.registryHash}.\n`;
}

function writeAlternativesReport(directory) {
  const outDir = path.resolve(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'));
  let journal;
  try { journal = fs.readFileSync(path.join(outDir, 'games.jsonl'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; journal = ''; }
  // Read only complete journal lines; reporting never repairs source files.
  const records = journal.slice(0, journal.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
  const report = makeAlternativesReport(manifest, records);
  const files = { json: 'alternatives-report.json', csv: 'alternatives-scores.csv', markdown: 'alternatives-report.md' };
  const rows = [['design_id', 'purchase', 'comparison_id', 'paired_score', 'assessment', 'complete_pairs', 'planned_pairs', 'scored_games', 'scheduled_games', 'unique_openings', 'wins', 'draws', 'losses', 'truncated_attempts', 'error_attempts'],
    ...report.candidates.map(row => [row.id, row.label, row.comparisonId, row.score, row.assessment, row.completePairs, row.plannedPairs, row.scoredGames, row.scheduledGames, row.uniqueOpenings, row.wins, row.draws, row.losses, row.statusCounts.truncated, row.statusCounts.error])];
  fs.writeFileSync(path.join(outDir, files.json), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, files.csv), csv(rows));
  fs.writeFileSync(path.join(outDir, files.markdown), renderMarkdown(report));
  return { report, files: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, path.join(outDir, file)])) };
}

module.exports = { getCampaign, verifyCampaignManifest, makeAlternativesReport, writeAlternativesReport };
