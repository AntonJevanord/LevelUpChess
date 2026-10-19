// These are estimates for the compared armies and this engine protocol, rather
// than ratings assigned to individual pieces or calibrated UCI Elo settings.
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const STATUSES = ['completed', 'truncated', 'aborted', 'error'];

function eloFromScore(score) {
  if (!Number.isFinite(score) || score <= 0 || score >= 1) return null;
  return 400 * Math.log10(score / (1 - score));
}

function eloLabel(score) {
  if (score === 0) return '-infinity';
  if (score === 1) return '+infinity';
  return score === null ? 'unavailable' : 'finite';
}

function emptyResults() {
  return { games: 0, wins: 0, draws: 0, losses: 0, score: null };
}

function gameScore(record) {
  if (record.result === '1/2-1/2') return 0.5;
  return (record.result === '1-0') === (record.aColor === 'w') ? 1 : 0;
}

function tally(games) {
  const totals = emptyResults();
  for (const game of games) {
    const score = gameScore(game);
    totals.games++;
    if (score === 1) totals.wins++;
    else if (score === 0.5) totals.draws++;
    else totals.losses++;
  }
  if (totals.games) totals.score = (totals.wins + totals.draws / 2) / totals.games;
  return totals;
}

function validId(value) {
  return typeof value === 'string' && value.length > 0;
}

function validCompleted(record) {
  return validId(record.id) && validId(record.pairId) && validId(record.openingId)
    && (record.aColor === 'w' || record.aColor === 'b') && RESULTS.has(record.result);
}

function summarizeComparison(comparisonId, records) {
  const statusCounts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  statusCounts.unknown = 0;
  const reasons = {};
  const completed = new Map();
  let invalidCompleted = 0;
  let duplicateCompleted = 0;
  for (const record of records) {
    const status = STATUSES.includes(record.status) ? record.status : 'unknown';
    statusCounts[status]++;
    const reason = typeof record.reason === 'string' && record.reason ? record.reason : 'unspecified';
    Object.defineProperty(reasons, reason, { value: (Object.hasOwn(reasons, reason) ? reasons[reason] : 0) + 1, enumerable: true, writable: true, configurable: true });
    if (record.status !== 'completed') continue;
    if (!validCompleted(record)) { invalidCompleted++; continue; }
    if (completed.has(record.id)) duplicateCompleted++;
    // Input order is log order. A failed retry cannot erase a completed game.
    completed.set(record.id, record);
  }

  const games = [...completed.values()];
  const pairs = new Map();
  for (const game of games) {
    if (!pairs.has(game.pairId)) pairs.set(game.pairId, []);
    pairs.get(game.pairId).push(game);
  }
  let partialPairs = 0;
  let invalidPairs = 0;
  let pairWins = 0;
  let pairDraws = 0;
  let pairLosses = 0;
  const pairedGames = [];
  const clusters = new Map();
  for (const pair of pairs.values()) {
    if (pair.length === 1) { partialPairs++; continue; }
    if (pair.length !== 2 || pair[0].aColor === pair[1].aColor || pair[0].openingId !== pair[1].openingId) {
      invalidPairs++;
      continue;
    }
    const score = (gameScore(pair[0]) + gameScore(pair[1])) / 2;
    if (score > 0.5) pairWins++;
    else if (score === 0.5) pairDraws++;
    else pairLosses++;
    pairedGames.push(...pair);
    const openingId = pair[0].openingId;
    if (!clusters.has(openingId)) clusters.set(openingId, []);
    clusters.get(openingId).push(score);
  }

  const openingClusters = [...clusters].sort(([a], [b]) => a.localeCompare(b)).map(([openingId, scores]) => ({
    openingId,
    completePairs: scores.length,
    score: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  }));
  const n = openingClusters.length;
  // Average families equally: re-running one opening neither increases its
  // weight nor pretends that the repeated games are independent observations.
  const score = n ? openingClusters.reduce((sum, opening) => sum + opening.score, 0) / n : null;
  const radius = n ? Math.sqrt(Math.log(2 / 0.05) / (2 * n)) : null;
  const lower = n ? Math.max(0, score - radius) : null;
  const upper = n ? Math.min(1, score + radius) : null;
  const eloDifference = eloFromScore(score);
  return {
    comparisonId,
    attempts: records.length,
    statusCounts,
    reasons,
    invalidCompleted,
    duplicateCompleted,
    overall: tally(games),
    paired: {
      ...tally(pairedGames),
      completePairs: pairedGames.length / 2,
      partialPairs,
      invalidPairs,
      pairWins,
      pairDraws,
      pairLosses,
    },
    openingClusters,
    primaryEstimate: {
      score,
      scoreBasis: 'equal-weight opening-cluster means of complete color-swapped pairs',
      uniqueOpenings: n,
      insufficientData: n < 2,
      eloDifference,
      eloUnbounded: score === 0 || score === 1,
      eloLabel: eloLabel(score),
      interpretation: 'score-equivalent Elo difference for these armies under this protocol; not piece Elo or calibrated engine strength',
      interval: {
        confidence: 0.95,
        method: 'Hoeffding bound over independent opening-cluster means',
        lower,
        upper,
        eloLower: eloFromScore(lower),
        eloUpper: eloFromScore(upper),
        eloLowerLabel: eloLabel(lower),
        eloUpperLabel: eloLabel(upper),
        assumption: 'Conditional on independently sampled opening families represented by distinct openingId values; fixed or related openings are descriptive only.',
      },
    },
  };
}

/**
 * Summarize JSONL attempt records supplied in their original log order.
 * Returns a JSON-safe object whose comparisons array is sorted by ID. Counts
 * retain all attempts; scored games use only the latest valid completed record
 * per comparison/game ID. A primary estimate requires complete mirrored pairs.
 */
function summarize(records) {
  if (!Array.isArray(records)) throw new TypeError('Balance records must be an array.');
  const groups = new Map();
  let invalidRecords = 0;
  for (const record of records) {
    if (!record || typeof record !== 'object' || !validId(record.comparisonId)) { invalidRecords++; continue; }
    if (!groups.has(record.comparisonId)) groups.set(record.comparisonId, []);
    groups.get(record.comparisonId).push(record);
  }
  const comparisons = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, group]) => summarizeComparison(id, group));
  const statusCounts = Object.fromEntries([...STATUSES, 'unknown'].map(status => [status,
    comparisons.reduce((sum, comparison) => sum + comparison.statusCounts[status], 0)]));
  return { schemaVersion: 1, totalAttempts: records.length, invalidRecords, statusCounts, comparisons };
}

module.exports = { summarize, eloFromScore };
