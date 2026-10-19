const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, eloFromScore } = require('../scripts/balance/stats');

function game(id, aColor, result, overrides = {}) {
  return { id, attempt: 1, comparisonId: 'blue-v-purple', pairId: 'pair-1', openingId: 'start', aColor, status: 'completed', result, reason: 'checkmate', ...overrides };
}
function pair(id, openingId, whiteResult = '1-0', blackResult = '0-1') {
  return [game(`${id}-w`, 'w', whiteResult, { pairId: id, openingId }), game(`${id}-b`, 'b', blackResult, { pairId: id, openingId })];
}
const comparison = records => summarize(records).comparisons[0];

test('drawn color-swapped games score one half and a finite zero Elo difference', () => {
  const result = comparison(pair('one', 'start', '1/2-1/2', '1/2-1/2'));
  assert.deepEqual(result.overall, { games: 2, wins: 0, draws: 2, losses: 0, score: 0.5 });
  assert.equal(result.paired.completePairs, 1);
  assert.equal(result.paired.pairDraws, 1);
  assert.equal(result.primaryEstimate.score, 0.5);
  assert.equal(result.primaryEstimate.eloDifference, 0);
  assert.equal(result.primaryEstimate.insufficientData, true);
});

test('scores are always from army A perspective after swapping colors', () => {
  const bothAWin = comparison(pair('one', 'start'));
  assert.equal(bothAWin.overall.wins, 2);
  assert.equal(bothAWin.paired.pairWins, 1);
  const whiteAlwaysWins = comparison(pair('one', 'start', '1-0', '1-0'));
  assert.equal(whiteAlwaysWins.overall.score, 0.5);
  assert.equal(whiteAlwaysWins.paired.pairDraws, 1);
  const bothALose = comparison(pair('one', 'start', '0-1', '1-0'));
  assert.equal(bothALose.overall.losses, 2);
  assert.equal(bothALose.paired.pairLosses, 1);
});

test('all wins do not claim a finite Elo or a zero-width uncertainty interval', () => {
  const estimate = comparison([...pair('one', 'opening-a'), ...pair('two', 'opening-b')]).primaryEstimate;
  assert.equal(estimate.score, 1);
  assert.equal(estimate.eloDifference, null);
  assert.equal(estimate.eloUnbounded, true);
  assert.equal(estimate.eloLabel, '+infinity');
  assert.ok(estimate.interval.lower < 1);
  assert.equal(estimate.interval.upper, 1);
  assert.equal(estimate.interval.eloUpper, null);
  assert.equal(estimate.interval.eloUpperLabel, '+infinity');
  assert.doesNotMatch(JSON.stringify(estimate), /NaN|Infinity/);
});

test('partial pairs remain provisional and cannot supply the primary estimate', () => {
  const result = comparison([game('one-w', 'w', '1-0')]);
  assert.equal(result.overall.games, 1);
  assert.equal(result.overall.score, 1);
  assert.equal(result.paired.partialPairs, 1);
  assert.equal(result.paired.completePairs, 0);
  assert.equal(result.primaryEstimate.score, null);
  assert.equal(result.primaryEstimate.eloDifference, null);
  assert.equal(result.primaryEstimate.eloUnbounded, false);
  assert.equal(result.primaryEstimate.interval.lower, null);
});

test('duplicate completed IDs use the latest completed outcome and preserve attempt counts', () => {
  const records = [
    game('one-w', 'w', '0-1'),
    game('one-b', 'b', '0-1'),
    game('one-w', 'w', '1-0', { attempt: 2 }),
    game('one-w', 'w', null, { attempt: 3, status: 'error', reason: 'engine exit' }),
  ];
  const result = comparison(records);
  assert.equal(result.attempts, 4);
  assert.equal(result.statusCounts.completed, 3);
  assert.equal(result.statusCounts.error, 1);
  assert.equal(result.duplicateCompleted, 1);
  assert.equal(result.overall.games, 2);
  assert.equal(result.overall.score, 1);
  assert.equal(result.paired.completePairs, 1);
});

test('truncated, aborted, and error attempts are neither draws nor losses', () => {
  const result = comparison([
    ...pair('one', 'start', '1/2-1/2', '1/2-1/2'),
    game('trunc', 'w', '1/2-1/2', { status: 'truncated', reason: 'max plies' }),
    game('abort', 'w', '0-1', { status: 'aborted', reason: 'cancelled' }),
    game('error', 'b', '1-0', { status: 'error', reason: 'engine exit' }),
  ]);
  assert.equal(result.overall.games, 2);
  assert.equal(result.overall.draws, 2);
  assert.deepEqual(result.statusCounts, { completed: 2, truncated: 1, aborted: 1, error: 1, unknown: 0 });
  assert.equal(result.reasons['max plies'], 1);
});

test('repeated opening pairs cannot increase confidence or overweight their family', () => {
  const base = [...pair('a', 'opening-a'), ...pair('b', 'opening-b', '0-1', '1-0')];
  const repeated = [...base, ...pair('a-repeat-1', 'opening-a'), ...pair('a-repeat-2', 'opening-a')];
  const first = comparison(base);
  const second = comparison(repeated);
  assert.equal(second.overall.score, 0.75);
  assert.equal(second.primaryEstimate.score, 0.5);
  assert.equal(second.primaryEstimate.uniqueOpenings, 2);
  assert.deepEqual(second.primaryEstimate.interval, first.primaryEstimate.interval);
  assert.equal(second.openingClusters[0].completePairs, 3);
});

test('pairs with mismatched openings, duplicate colors, or extra games are excluded', () => {
  const result = comparison([
    game('a-w', 'w', '1-0', { pairId: 'a', openingId: 'opening-a' }),
    game('a-b', 'b', '0-1', { pairId: 'a', openingId: 'opening-b' }),
    game('b-w', 'w', '1-0', { pairId: 'b' }),
    game('b-w2', 'w', '1-0', { pairId: 'b' }),
    ...pair('c', 'start'),
    game('c-extra', 'b', '0-1', { pairId: 'c' }),
  ]);
  assert.equal(result.overall.games, 7);
  assert.equal(result.paired.invalidPairs, 3);
  assert.equal(result.paired.completePairs, 0);
  assert.equal(result.primaryEstimate.score, null);
});

test('comparisons are separated and JSON-safe even for unusual identifier keys', () => {
  const result = summarize([
    ...pair('one', 'start'),
    ...pair('two', 'start').map(record => ({ ...record, comparisonId: '__proto__', reason: '__proto__' })),
  ]);
  assert.equal(result.comparisons.length, 2);
  const unusual = result.comparisons.find(item => item.comparisonId === '__proto__');
  assert.equal(unusual.reasons.__proto__, 2);
  assert.equal(JSON.parse(JSON.stringify(result)).totalAttempts, 4);
});

test('invalid records and malformed completed games are visible but cannot affect scores', () => {
  const result = summarize([null, {}, game('bad', 'x', '1-0'), game('bad-result', 'w', null)]);
  assert.equal(result.invalidRecords, 2);
  assert.equal(result.comparisons[0].invalidCompleted, 2);
  assert.equal(result.comparisons[0].overall.games, 0);
  assert.deepEqual(summarize([]).comparisons, []);
});

test('Elo conversion has the standard score-gap relation and rejects nonfinite endpoints', () => {
  assert.equal(eloFromScore(0.5), 0);
  assert.ok(Math.abs(eloFromScore(0.75) - 190.848501887865) < 1e-9);
  assert.equal(eloFromScore(0.25), -eloFromScore(0.75));
  for (const score of [0, 1, null, undefined, NaN, Infinity, -0.1, 1.1]) assert.equal(eloFromScore(score), null);
});
