'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeDataset } = require('../scripts/balance/material-regression');

// Draw-preserving W/D/L trials with known beta_Q=9*beta_P and independent
// rook/upgrade effects. Correlated pawn/queen variation tests the original
// separate standardized penalties rather than a newly standardized sum.
function synthetic(count = 1536, groups = 16, queenVaries = true) {
  let state = 934723;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 0x100000000; };
  const games = [], samples = [];
  for (let i = 0; i < count; i++) {
    const queen = queenVaries ? Math.floor(random() * 3) - 1 : 0;
    const x = [Math.floor(random() * 5) - 2 + queen, Math.floor(random() * 3) - 1,
      queen, random() < 0.5 ? -1 : 1, Math.floor(random() * 3) - 1];
    const probability = 1 / (1 + Math.exp(-(0.3 * x[0] + 1.5 * x[1] + 2.7 * x[2] + 0.1 * x[3] + 0.9 * x[4])));
    const y = (Number(random() < probability) + Number(random() < probability)) / 2;
    const gameId = `game-${i}`, pairId = `triplet-${Math.floor(i / 3)}`, groupId = `book-${Math.floor(i / 3) % groups}`;
    games.push({ gameId, pairId, groupId, result: y === 1 ? '1-0' : y === 0 ? '0-1' : '1/2-1/2', samples: 1 });
    samples.push({ gameId, pairId, groupId, x, y, weight: 1 });
  }
  return { featureNames: ['pawn', 'rook', 'queen', 'tempo', 'bonus:queen.purple@1'], games, samples };
}
function close(actual, expected, tolerance = 1e-9) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} versus ${expected}`); }
const OPTIONS = { anchors: { pawn: 1, queen: 9 }, validationFolds: 5 };

test('separate original pawn/queen penalties reproduce an independent constrained SciPy fit', () => {
  // Independent L-BFGS-B solution using an expanded linear parameter map and
  // the complete original standardized penalty, rather than this Newton path.
  const expected = { pawn: 0.29056024875128, rook: 1.4285293729337372,
    queen: 2.6150422387615198, tempo: 0.2636127416135057, 'bonus:queen.purple@1': 0.8672549151367664 };
  const result = analyzeDataset(synthetic(192), { ...OPTIONS, bootstrap: 0 });
  for (const [name, value] of Object.entries(expected)) close(result.fit.coefficients[name], value, 1e-6);
  close(result.fit.intercept, 0.12935365821546907, 1e-6);
  close(result.validation.metrics.brier, 0.05090884278874175, 1e-6);
  close(result.validation.metrics.logLoss, 0.34561496834502997, 1e-6);
});

test('anchored model recovers effects, resamples whole groups and labels fixed values as assumptions', () => {
  const result = analyzeDataset(synthetic(), { ...OPTIONS, bootstrap: 32 });
  assert.equal(result.fit.converged, true);
  assert.equal(result.rank.fullRank, true);
  assert.equal(result.rank.columns, 5); assert.equal(result.rank.originalColumns, 6);
  close(result.fit.coefficients.queen, 9 * result.fit.coefficients.pawn);
  close(result.normalized.values.rook, 5, 1.1);
  close(result.normalized.values['bonus:queen.purple@1'], 3, 0.8);
  assert.deepEqual(result.normalized.fixedAnchors, { pawn: 1, queen: 9 });
  assert.equal(result.normalized.materialPriceTableSupported, false);
  assert.match(result.normalized.interpretation, /assumptions/);
  assert.equal(result.normalized.values.pawn, 1); assert.equal(result.normalized.values.queen, 9);
  assert.equal(result.bootstrap.validRatios, 32);
  assert.deepEqual(result.bootstrap.ratioIntervals.pawn, { lower: 1, upper: 1 });
  assert.deepEqual(result.bootstrap.ratioIntervals.queen, { lower: 9, upper: 9 });
  assert.ok(result.bootstrap.ratioIntervals['bonus:queen.purple@1'].lower < 3);
  assert.ok(result.bootstrap.ratioIntervals['bonus:queen.purple@1'].upper > 3);
  assert.ok(result.validation.metrics.brier < result.validation.baselineMetrics.brier);
});

test('fixed queen ratio does not demand observations of a separately fitted queen effect', () => {
  const data = synthetic(1536, 16, false);
  const free = analyzeDataset(data, { validationFolds: 5, bootstrap: 0 });
  assert.equal(free.rank.fullRank, false);
  const anchored = analyzeDataset(data, { ...OPTIONS, bootstrap: 32 });
  assert.equal(anchored.rank.fullRank, true);
  assert.equal(anchored.coverage.features.find(feature => feature.name === 'queen').nonzeroGames, 0);
  assert.equal(anchored.normalized.available, true);
  assert.equal(anchored.normalized.values.queen, 9);
  const queensOnly = synthetic(); queensOnly.samples.forEach(row => { row.x[0] = 0; });
  const scaleFromQueens = analyzeDataset(queensOnly, { ...OPTIONS, bootstrap: 24 });
  assert.equal(scaleFromQueens.coverage.features.find(feature => feature.name === 'pawn').nonzeroGames, 0);
  assert.equal(scaleFromQueens.coverage.anchorScaleSupport.groupsWithNonzero, 16);
  assert.equal(scaleFromQueens.rank.fullRank, true);
  assert.equal(scaleFromQueens.normalized.available, true);
});

test('five deterministic folds keep every book triplet together and progress never changes results', () => {
  const data = synthetic(192), progress = [];
  const a = analyzeDataset(data, { ...OPTIONS, bootstrap: 24 });
  const b = analyzeDataset(data, { ...OPTIONS, bootstrap: 24, onProgress: event => progress.push(event) });
  assert.deepEqual(a, b);
  assert.equal(a.validation.folds.length, 5);
  const heldOut = a.validation.folds.flatMap(fold => fold.testGroups);
  assert.equal(new Set(heldOut).size, a.coverage.groups); assert.equal(heldOut.length, a.coverage.groups);
  for (const fold of a.validation.folds) {
    assert.ok(fold.testGroups.every(group => !fold.trainingGroups.includes(group)));
    const testGames = data.games.filter(game => fold.testGroups.includes(game.groupId));
    assert.equal(fold.testGames, testGames.length);
    for (const game of testGames) assert.ok(data.games.filter(other => other.pairId === game.pairId)
      .every(other => fold.testGroups.includes(other.groupId)));
  }
  assert.deepEqual(progress.filter(event => event.phase === 'bootstrap').map(event => event.completed), [0, 20, 24]);
  assert.deepEqual(progress.filter(event => event.phase === 'validation').map(event => event.completed), [1, 2, 3, 4, 5]);
  const reversed = structuredClone(data); reversed.samples.reverse(); reversed.games.reverse();
  assert.deepEqual(analyzeDataset(reversed, { ...OPTIONS, bootstrap: 24 }), a);
});

test('anchored fits are invariant to duplicate samples within each game and feature ordering', () => {
  const data = synthetic(192), doubled = structuredClone(data);
  doubled.games.forEach(game => { game.samples = 2; });
  doubled.samples = data.samples.flatMap(row => [{ ...row, weight: 0.5 }, { ...row, weight: 0.5 }]);
  const a = analyzeDataset(data, { ...OPTIONS, bootstrap: 24 });
  const b = analyzeDataset(doubled, { ...OPTIONS, bootstrap: 24 });
  for (const name of data.featureNames) close(a.fit.coefficients[name], b.fit.coefficients[name]);
  close(a.validation.metrics.brier, b.validation.metrics.brier);
  const order = [2, 4, 1, 0, 3], reordered = structuredClone(data);
  reordered.featureNames = order.map(index => data.featureNames[index]);
  reordered.samples.forEach(row => { row.x = order.map(index => row.x[index]); });
  const c = analyzeDataset(reordered, { ...OPTIONS, bootstrap: 24 });
  for (const name of data.featureNames) close(a.fit.coefficients[name], c.fit.coefficients[name]);
  close(a.validation.metrics.brier, c.validation.metrics.brier);
});

test('nonpositive scale, one-class outcomes and absent data cannot supply anchored prices', () => {
  const data = synthetic(96);
  data.samples.forEach((row, index) => { row.y = 0.5; data.games[index].result = '1/2-1/2'; });
  const draws = analyzeDataset(data, { ...OPTIONS, bootstrap: 24 });
  assert.equal(draws.fit.converged, false); assert.equal(draws.fit.reason, 'anchor-scale-not-positive');
  assert.equal(draws.normalized.available, false); assert.equal(draws.bootstrap.pawnNonpositive, 24);
  const empty = analyzeDataset({ featureNames: ['pawn', 'queen'], games: [], samples: [] }, { ...OPTIONS, bootstrap: 0 });
  assert.equal(empty.fit.reason, 'no-data'); assert.equal(empty.normalized.available, false);
  assert.equal(empty.validation.available, false);
});

test('anchor and grouped-validation options reject unsupported conventions before fitting', () => {
  for (const options of [{ anchors: { pawn: 1, queen: 8 } }, { anchors: { pawn: 1 } },
    { anchors: { pawn: 1, queen: 9, rook: 5 } }, { anchors: [] }, { validationFolds: 1 },
    { validationFolds: 11 }, { validationFolds: 2.5 }, { onProgress: true }]) {
    assert.throws(() => analyzeDataset(synthetic(24), { ...options, bootstrap: 0 }));
  }
  assert.throws(() => analyzeDataset({ featureNames: ['pawn'], games: [], samples: [] }, OPTIONS), /queen/);
});
