'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateMaterial } = require('../scripts/balance/material-estimate');
const DOSES = [200, 300, 400, 500];

function rows(count, left = [1, 0.75, 0.25, 0], right = left) {
  return Array.from({ length: count }, (_, opening) => ['left', 'right'].flatMap((layout, index) =>
    DOSES.map((compensationCp, dose) => ({ openingId: `opening-${opening}`, layout, compensationCp, score: (index ? right : left)[dose] })))).flat();
}

test('empty data reports no estimate and no resampling band', () => {
  const result = estimateMaterial([]);
  assert.equal(result.nOpenings, 0);
  assert.deepEqual(result.testedCompensationCp, []);
  assert.deepEqual(result.estimate, { status: 'no-data', lowerCp: null, upperCp: null, pointCp: null });
  assert.equal(result.bootstrap.available, false);
  assert.equal(result.bootstrap.reason, 'no-data');
});

test('complete blocks estimate a known grid bracket and interpolated crossing without mutation', () => {
  const input = rows(4), before = structuredClone(input), result = estimateMaterial(input);
  assert.deepEqual(input, before);
  assert.equal(result.nOpenings, 4);
  assert.deepEqual(result.testedCompensationCp, DOSES);
  assert.deepEqual(result.estimate, { status: 'bracketed', lowerCp: 300, upperCp: 400, pointCp: 350 });
  assert.deepEqual(result.rawCurve, result.fittedCurve);
  assert.equal(result.bootstrap.available, false);
  assert.equal(result.bootstrap.reason, 'requires-at-least-8-opening-blocks');
  assert.equal(result.diagnostics.rawNonMonotone, false);
});

test('an exact interior or endpoint crossing remains a point rather than an extrapolation', () => {
  for (const [scores, expected] of [[[0.9, 0.5, 0.2, 0], 300], [[0.5, 0.4, 0.3, 0.1], 200], [[1, 0.8, 0.7, 0.5], 500]]) {
    assert.deepEqual(estimateMaterial(rows(1, scores)).estimate,
      { status: 'bracketed', lowerCp: expected, upperCp: expected, pointCp: expected });
  }
});

test('flat fifty-percent stretches retain a range, including a completely flat curve', () => {
  assert.deepEqual(estimateMaterial(rows(2, [0.8, 0.5, 0.5, 0.2])).estimate,
    { status: 'plateau', lowerCp: 300, upperCp: 400, pointCp: null });
  assert.deepEqual(estimateMaterial(rows(2, [0.5, 0.5, 0.5, 0.5])).estimate,
    { status: 'plateau', lowerCp: 200, upperCp: 500, pointCp: null });
});

test('unbracketed roots produce one-sided bounds with no invented precise value', () => {
  assert.deepEqual(estimateMaterial(rows(1, [0.4, 0.3, 0.2, 0.1])).estimate,
    { status: 'below-range', lowerCp: null, upperCp: 200, pointCp: null });
  assert.deepEqual(estimateMaterial(rows(1, [0.9, 0.8, 0.7, 0.6])).estimate,
    { status: 'above-range', lowerCp: 500, upperCp: null, pointCp: null });
});

test('isotonic fitting exposes raw reversals instead of presenting them as monotone observations', () => {
  const result = estimateMaterial(rows(4, [0.9, 0.3, 0.5, 0.1]));
  assert.deepEqual(result.rawCurve.map(row => row.score), [0.9, 0.3, 0.5, 0.1]);
  assert.deepEqual(result.fittedCurve.map(row => row.score), [0.9, 0.4, 0.4, 0.1]);
  assert.equal(result.diagnostics.rawNonMonotone, true);
  assert.equal(result.diagnostics.reversals.length, 1);
  assert.equal(result.diagnostics.reversals[0].lowerCompensationCp, 300);
  assert.ok(Math.abs(result.diagnostics.maxRawReversal - 0.2) < 1e-12);
  assert.ok(Math.abs(result.diagnostics.maxIsotonicAdjustment - 0.1) < 1e-12);
  assert.equal(result.estimate.status, 'bracketed');
  assert.ok(Math.abs(result.estimate.pointCp - 280) < 1e-12);
});

test('layout estimates receive equal weights and disclose conflicting compensation ranges', () => {
  const result = estimateMaterial(rows(8, [0.8, 0.3, 0.1, 0], [1, 0.9, 0.8, 0.4]));
  result.rawCurve.forEach((row, index) => assert.ok(Math.abs(row.score - [0.9, 0.6, 0.45, 0.2][index]) < 1e-12));
  assert.ok(Math.abs(result.layouts[0].estimate.pointCp - 260) < 1e-10);
  assert.ok(Math.abs(result.layouts[1].estimate.pointCp - 475) < 1e-10);
  assert.ok(Math.abs(result.diagnostics.layoutPointDifferenceCp - 215) < 1e-10);
  assert.equal(result.diagnostics.layoutRangesOverlap, false);
});

test('whole-opening resampling preserves dose and layout covariance', () => {
  const input = rows(8);
  for (const row of input) {
    const even = Number(row.openingId.split('-')[1]) % 2 === 0;
    const first = (row.layout === 'left') === even;
    row.score = (first ? [1, 0.9, 0.6, 0.2] : [0.8, 0.3, 0.2, 0])[DOSES.indexOf(row.compensationCp)];
  }
  const result = estimateMaterial(input, { bootstrapReplicates: 200 });
  assert.equal(result.bootstrap.available, true);
  assert.equal(result.bootstrap.replicates, 200);
  assert.ok(Math.abs(result.bootstrap.lowerCp - 350) < 1e-10);
  assert.ok(Math.abs(result.bootstrap.upperCp - 350) < 1e-10);
  assert.equal(result.bootstrap.statusCounts.bracketed, 200);
});

test('bootstrap retains censored and plateau replicates rather than conditioning on a crossing', () => {
  const input = rows(8);
  for (const row of input) row.score = Number(row.openingId.split('-')[1]) < 4 ? 0.9 : 0.1;
  const result = estimateMaterial(input, { bootstrapReplicates: 1000, seed: 42 });
  assert.equal(result.estimate.status, 'plateau');
  assert.equal(result.bootstrap.available, true);
  assert.equal(result.bootstrap.lowerCp, null);
  assert.equal(result.bootstrap.upperCp, null);
  assert.ok(result.bootstrap.statusCounts['below-range'] > 0);
  assert.ok(result.bootstrap.statusCounts['above-range'] > 0);
  assert.ok(result.bootstrap.statusCounts.plateau > 0);
  assert.equal(Object.values(result.bootstrap.statusCounts).reduce((sum, count) => sum + count, 0), 1000);
  assert.match(result.bootstrap.interpretation, /not a universal confidence interval/);
});

test('all-censored resamples preserve the corresponding finite boundary and open tail', () => {
  const below = estimateMaterial(rows(8, [0.4, 0.3, 0.2, 0.1]));
  assert.equal(below.bootstrap.lowerCp, null);
  assert.equal(below.bootstrap.upperCp, 200);
  assert.equal(below.bootstrap.statusCounts['below-range'], 1000);
  const above = estimateMaterial(rows(8, [0.9, 0.8, 0.7, 0.6]));
  assert.equal(above.bootstrap.lowerCp, 500);
  assert.equal(above.bootstrap.upperCp, null);
  assert.equal(above.bootstrap.statusCounts['above-range'], 1000);
});

test('resampling is seeded and independent of input row order; it can be disabled', () => {
  const input = rows(16);
  for (const row of input) row.score = Math.max(0, Math.min(1, row.score + Number(row.openingId.split('-')[1]) / 100));
  const options = { bootstrapReplicates: 100, seed: 7 };
  assert.deepEqual(estimateMaterial(input, options), estimateMaterial([...input].reverse(), options));
  assert.deepEqual(estimateMaterial(input, options), estimateMaterial(input, options));
  assert.notDeepEqual(estimateMaterial(input, options).bootstrap, estimateMaterial(input, { ...options, seed: 8 }).bootstrap);
  const disabled = estimateMaterial(input, { bootstrapReplicates: 0 });
  assert.equal(disabled.bootstrap.available, false);
  assert.equal(disabled.bootstrap.reason, 'disabled');
});

test('malformed, duplicate and incomplete cells cannot create an estimate', () => {
  assert.throws(() => estimateMaterial(null), /array/);
  const input = rows(1);
  assert.throws(() => estimateMaterial([...input, input[0]]), /Duplicate/);
  assert.throws(() => estimateMaterial(input.slice(1)), /Incomplete/);
  for (const changed of [null, [], { ...input[0], extra: true }, { ...input[0], openingId: '' }, { ...input[0], layout: 'other' },
    { ...input[0], compensationCp: 250 }, { ...input[0], score: NaN }, { ...input[0], score: -0.1 },
    { ...input[0], score: 1.1 }, { ...input[0], score: '0.5' }]) {
    assert.throws(() => estimateMaterial([changed, ...input.slice(1)]));
  }
  for (const options of [null, [], { other: 1 }, { bootstrapReplicates: -1 }, { bootstrapReplicates: 10001 },
    { bootstrapReplicates: 0.5 }, { bootstrapReplicates: null }, { seed: null }, { seed: -1 }, { seed: 2 ** 32 }, { seed: '42' }]) assert.throws(() => estimateMaterial(input, options));
});
