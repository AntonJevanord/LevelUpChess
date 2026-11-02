'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeOpeningChanges: summarize } = require('../scripts/analysis/paired-opening-sensitivity');

test('discrete bootstrap agrees with independently enumerating every four-block resample', () => {
  const values = [0, 0.25, 0.5, 1], brute = [];
  for (const a of values) for (const b of values) for (const c of values) for (const d of values) brute.push((a + b + c + d) / 4);
  brute.sort((a, b) => a - b);
  const result = summarize(values, { units: 4 });
  assert.equal(result.mean, 0.4375);
  assert.equal(result.conditionalBootstrap.lower, brute[Math.ceil(brute.length * 0.025) - 1]);
  assert.equal(result.conditionalBootstrap.upper, brute[Math.ceil(brute.length * 0.975) - 1]);
  assert.equal(result.conditionalBootstrap.probabilityMass, 1);
});
test('sign reversal and ordering preserve paired effects and reverse both interval endpoints', () => {
  const values = [0.25, -0.125, 0, 0.5, 0.125, -0.25, 0.375, 0];
  const a = summarize(values), b = summarize(values.map(value => -value)), c = summarize([...values].reverse());
  assert.equal(a.mean, -b.mean); assert.equal(a.mean, c.mean);
  assert.equal(a.conditionalBootstrap.lower, -b.conditionalBootstrap.upper);
  assert.equal(a.conditionalBootstrap.upper, -b.conditionalBootstrap.lower);
  assert.deepEqual(a.conditionalBootstrap, c.conditionalBootstrap);
  assert.deepEqual(a.signs, { positive: 4, negative: 2, zero: 2 });
});
test('small-sample intervals use opening groups and do not manufacture supported endpoints', () => {
  const result = summarize([0, 0.25, 0, 0.5, 0.125, -0.25, 0.375, 0]);
  assert.equal(result.openingGroups, 8); assert.equal(result.smallSampleT.degreesOfFreedom, 7);
  assert.equal(result.smallSampleT.critical, 2.364624252);
  assert.ok(result.smallSampleT.lower < result.mean); assert.ok(result.smallSampleT.upper > result.mean);
  assert.equal(summarize([0, 0.25]).conditionalBootstrap.available, false);
  assert.equal(summarize([0, 0.25, 0.5]).smallSampleT.available, false);
});
test('constant effects, grid rounding and leave-one-out diagnostics are deterministic', () => {
  const constant = summarize(new Array(8).fill(0.25));
  assert.equal(constant.standardError, 0); assert.equal(constant.conditionalBootstrap.lower, 0.25);
  assert.equal(constant.conditionalBootstrap.upper, 0.25); assert.equal(constant.leaveOneOut.minimum, 0.25);
  assert.equal(constant.leaveOneOut.maximum, 0.25);
  const round = summarize([1e-14, 0, 0, 0]); assert.equal(round.signs.zero, 4);
});
test('malformed blocks and unannounced score grids fail rather than silently changing the estimator', () => {
  for (const values of [[], [0], [NaN, 0], [Infinity, 0], [3, 0], [0.1, 0], new Array(65).fill(0)]) assert.throws(() => summarize(values));
  for (const units of [0, 129, 1.5, null]) assert.throws(() => summarize([0, 1], { units }));
});
