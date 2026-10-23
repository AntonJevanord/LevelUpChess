'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeDataset } = require('../scripts/balance/material-regression');

// Two Bernoulli trials create actual W/D/L labels with E[score] = logistic(Xβ).
// Independent feature variation allows recovery; grouping deliberately keeps
// consecutive color-pair identities together rather than splitting rows.
function synthetic(count = 1024, groups = 12) {
  let state = 31415;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 0x100000000; };
  const games = [], samples = [];
  for (let i = 0; i < count; i++) {
    const x = [Math.floor(random() * 5) - 2, Math.floor(random() * 5) - 2, random() < 0.5 ? -1 : 1];
    const probability = 1 / (1 + Math.exp(-(0.4 * x[0] + 1.1 * x[1] + 0.15 * x[2])));
    const y = (Number(random() < probability) + Number(random() < probability)) / 2;
    const gameId = `game-${i}`, pairId = `pair-${Math.floor(i / 2)}`, groupId = `family-${Math.floor(i / 2) % groups}`;
    games.push({ gameId, pairId, groupId, result: y === 1 ? '1-0' : y === 0 ? '0-1' : '1/2-1/2', samples: 1 });
    samples.push({ gameId, pairId, groupId, x, y, weight: 1, phase: 'mixed' });
  }
  return { featureNames: ['pawn', 'knight', 'tempo'], games, samples, limitations: ['Synthetic validation data.'] };
}
function close(actual, expected, tolerance = 1e-9) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`); }

test('fractional logistic recovers known material effects with draws and beats a held-out baseline', () => {
  const result = analyzeDataset(synthetic(2048), { bootstrap: 32 });
  assert.ok(result.coverage.drawGames > 200);
  assert.equal(result.fit.converged, true); assert.equal(result.rank.fullRank, true);
  close(result.fit.coefficients.pawn, 0.4, 0.12); close(result.fit.coefficients.knight, 1.1, 0.2);
  assert.equal(result.normalized.available, true);
  close(result.normalized.values.knight, 1.1 / 0.4, 0.6);
  assert.equal(result.normalized.values.pawn, 1);
  assert.ok(result.bootstrap.pawnCoefficient.lower > 0);
  assert.ok(result.bootstrap.ratioIntervals.knight.lower < 2.75 && result.bootstrap.ratioIntervals.knight.upper > 2.75);
  assert.ok(result.validation.metrics.brier < result.validation.baselineMetrics.brier);
  assert.ok(result.validation.metrics.logLoss < result.validation.baselineMetrics.logLoss);
  for (const fold of result.validation.folds) {
    assert.equal(fold.testGroups.length, 1);
    assert.ok(!fold.trainingGroups.includes(fold.heldOutGroup));
    assert.equal(fold.testGames + fold.trainingGames, result.coverage.games);
  }
});

test('duplicating positions within a game changes neither fit nor whole-family stability', () => {
  const input = synthetic(256, 8), doubled = structuredClone(input);
  doubled.samples = input.samples.flatMap(row => [{ ...row, weight: 0.5 }, { ...row, weight: 0.5 }]);
  doubled.games.forEach(game => game.samples = 2);
  const a = analyzeDataset(input, { bootstrap: 24 }), b = analyzeDataset(doubled, { bootstrap: 24 });
  for (const name of input.featureNames) close(a.fit.coefficients[name], b.fit.coefficients[name]);
  close(a.validation.metrics.brier, b.validation.metrics.brier);
  for (const name of input.featureNames) for (const bound of ['lower', 'upper']) {
    close(a.bootstrap.coefficientIntervals[name][bound], b.bootstrap.coefficientIntervals[name][bound]);
    close(a.bootstrap.ratioIntervals[name][bound], b.bootstrap.ratioIntervals[name][bound]);
  }
  assert.equal(a.coverage.games, b.coverage.games); assert.equal(b.coverage.samples, a.coverage.samples * 2);
});

test('collinear or constant features stay unidentifiable despite finite ridge predictions', () => {
  const data = synthetic(256, 8);
  data.featureNames.push('bonus:queen.purple@1', 'constant');
  data.samples.forEach(row => row.x.push(2 * row.x[0], 1));
  const result = analyzeDataset(data, { bootstrap: 24 });
  assert.equal(result.fit.converged, true); assert.equal(result.rank.fullRank, false);
  assert.equal(result.rank.rank, 4); assert.equal(result.rank.columns, 6);
  assert.ok(result.rank.correlations.some(row => row.left === 'pawn' && row.right === 'bonus:queen.purple@1' && row.correlation > 0.999));
  assert.ok(result.normalized.reasons.includes('rank-deficient-design'));
  assert.equal(result.normalized.values, null); assert.equal(result.bootstrap.rankDeficient, 24);
});

test('a constant tempo column is not mistaken for a separately identified move value', () => {
  const data = synthetic(128, 8); data.samples.forEach(row => row.x[2] = 1);
  const result = analyzeDataset(data, { bootstrap: 0 });
  assert.equal(result.rank.fullRank, false); assert.ok(result.rank.dependentFeatures.includes('tempo'));
  assert.equal(result.normalized.available, false);
});

test('few opening families retain exploratory intervals while withholding normalized point claims', () => {
  const result = analyzeDataset(synthetic(256, 4), { bootstrap: 24 });
  assert.equal(result.bootstrap.available, true); assert.equal(result.bootstrap.groupUnit, 'whole-opening-family');
  assert.equal(result.normalized.available, false);
  assert.ok(result.normalized.reasons.includes('fewer-than-eight-opening-families'));
  assert.ok(result.normalized.reasons.includes('insufficient-feature-group-support'));
  assert.ok(Number.isFinite(result.bootstrap.ratioIntervals.knight.lower));
  const fewer = analyzeDataset(synthetic(128, 3), { bootstrap: 24 });
  assert.equal(fewer.bootstrap.available, false); assert.match(fewer.bootstrap.reason, /four/);
});

test('seeded grouped resampling is reproducible and independent of journal row order', () => {
  const data = synthetic(128, 8), reversed = structuredClone(data); reversed.samples.reverse(); reversed.games.reverse();
  const options = { bootstrap: 24, seed: 17 };
  assert.deepEqual(analyzeDataset(data, options), analyzeDataset(reversed, options));
  assert.notDeepEqual(analyzeDataset(data, options).bootstrap, analyzeDataset(data, { ...options, seed: 18 }).bootstrap);
});

test('draw-only, one-class and absent data cannot create a pawn-normalized value', () => {
  const draws = synthetic(64, 8); draws.samples.forEach(row => row.y = 0.5);
  draws.games.forEach(game => game.result = '1/2-1/2');
  const drawResult = analyzeDataset(draws, { bootstrap: 0 });
  assert.equal(drawResult.fit.converged, true); assert.equal(drawResult.fit.coefficients.pawn, 0);
  assert.equal(drawResult.normalized.available, false);
  const wins = structuredClone(draws); wins.samples.forEach(row => row.y = 1);
  wins.games.forEach(game => game.result = '1-0');
  const winsResult = analyzeDataset(wins, { bootstrap: 0 });
  assert.equal(winsResult.fit.converged, false); assert.equal(winsResult.normalized.available, false);
  const empty = analyzeDataset({ featureNames: ['pawn'], games: [], samples: [] }, { bootstrap: 0 });
  assert.equal(empty.fit.reason, 'no-data'); assert.equal(empty.normalized.available, false);
  assert.equal(empty.validation.available, false); assert.equal(empty.fit.metrics.brier, null);
});

test('malformed weights and group leakage fail before fitting', () => {
  for (const mutate of [
    data => data.samples[0].weight = 2,
    data => data.samples[0].y = 0.2,
    data => data.samples[0].x[0] = Infinity,
    data => data.samples[0].groupId = 'another',
    data => data.games[1].groupId = 'another',
    data => data.games[0].samples = 2,
    data => data.games[0].result = '*',
    data => data.games[0].result = data.games[0].result === '1-0' ? '0-1' : '1-0',
    data => data.samples.shift(),
  ]) {
    const data = synthetic(32, 4); mutate(data);
    assert.throws(() => analyzeDataset(data, { bootstrap: 0 }));
  }
  for (const options of [{ bootstrap: -1 }, { bootstrap: 1.2 }, { seed: -1 }, { unknown: true }]) {
    assert.throws(() => analyzeDataset(synthetic(16, 4), options));
  }
});

test('ridge can predict completely separated outcomes without certifying material ratios', () => {
  const data = synthetic(128, 8);
  data.samples.forEach((row, index) => {
    row.x[0] = index % 2 ? 1 : -1; row.y = row.x[0] > 0 ? 1 : 0;
    data.games[index].result = row.y ? '1-0' : '0-1';
  });
  const report = analyzeDataset(data, { bootstrap: 24 });
  assert.equal(report.fit.converged, true); assert.equal(report.fit.possibleSeparation, true);
  assert.equal(report.normalized.available, false);
  assert.ok(report.normalized.reasons.includes('possible-outcome-separation'));
});
