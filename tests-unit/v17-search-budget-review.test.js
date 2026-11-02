'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchReview, main } = require('../scripts/balance/v17-search-budget-review');
let review;
test.before(() => { review = buildSearchReview(); });

test('raw diagonal score jump remains uncertain under matched opening blocks', () => {
  const change = review.focus.changes.find(row => row.from === 40000).diagonalScore;
  assert.equal(change.mean, 21 / 128);
  assert.equal(change.conditionalBootstrap.lower, -0.03125); assert.equal(change.conditionalBootstrap.upper, 0.3515625);
  assert.ok(change.smallSampleT.lower < 0); assert.equal(change.signs.positive, 5); assert.equal(change.signs.negative, 3);
  assert.ok(change.leaveOneOut.minimum > 0.1); assert.ok(change.leaveOneOut.maximum < 0.23);
});
test('positive interaction percentile endpoints do not erase the small-sample sensitivity concern', () => {
  const change = review.focus.changes.find(row => row.from === 40000).diagonalGainOverControl;
  assert.equal(change.mean, 22 / 128);
  assert.ok(change.conditionalBootstrap.lower > 0); assert.ok(change.smallSampleT.lower < 0);
  assert.equal(change.smallSampleT.degreesOfFreedom, 7);
});
test('Cataphract repeats its80k lead in the new cohort and remains high without weak opponents', () => {
  const cat = review.cataphract.budgets.find(row => row.nodes === 80000).scopes;
  assert.equal(cat.allNine.games, 288); assert.equal(cat.allNine.openingGroups, 16);
  assert.equal(cat.allNine.firstEight, cat.allNine.secondEight);
  assert.ok(Math.abs(cat.allNine.mean - 191 / 288) < 1e-12);
  assert.equal(cat.frozenFour.games, 128); assert.equal(cat.frozenFour.mean, 80.5 / 128);
  assert.ok(cat.withoutNightriderAndWraith.mean > 0.63);
  assert.ok(cat.allNine.conditionalBootstrap.lower > 0.61);
});
test('budget cohorts, opponent baskets and extra incomplete-case games remain explicit', () => {
  assert.equal(review.counts.extraPanelGamesExcludedFromComparisons, 8);
  assert.equal(review.counts.focusGames, 576); assert.equal(review.counts.balancedPanelGames, 5280);
  assert.ok(review.focus.budgets.every(row => row.rows.every(body => body.games === 64 && body.openingGroups === 8)));
  assert.equal(review.counts.newMatchGames, 0);
});
test('the saved statistical review reproduces without changing any experiment or launching games', () => {
  assert.equal(main([]).format, review.format);
  assert.throws(() => main(['--engine', 'unexpected']));
});
