'use strict';

// Estimates compensation from complete opening blocks, never from engine evals.
// All values below are material centipawns: one reference pawn = 100.
const COMPENSATION = Object.freeze([200, 300, 400, 500]);
const LAYOUTS = Object.freeze(['left', 'right']);
const EPSILON = 1e-12;
const STATUSES = ['bracketed', 'plateau', 'below-range', 'above-range'];
const INTERPRETATION = 'Conditional whole-opening-block resampling stability for this fixed layout and opening cohort; not a universal confidence interval, an accuracy guarantee, or independent validation of cumulative stages. Censored and plateau replicates are retained.';

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be a plain object.`);
}

function optionsValue(options) {
  plainObject(options, 'options');
  for (const key of Object.keys(options)) if (!['bootstrapReplicates', 'seed'].includes(key)) throw new Error(`Unsupported material estimate option: ${key}.`);
  const bootstrapReplicates = options.bootstrapReplicates === undefined ? 1000 : options.bootstrapReplicates;
  const seed = options.seed === undefined ? 42 : options.seed;
  if (!Number.isSafeInteger(bootstrapReplicates) || bootstrapReplicates < 0 || bootstrapReplicates > 10000) throw new Error('bootstrapReplicates must be an integer from 0 to 10000.');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be an unsigned 32-bit integer.');
  return { bootstrapReplicates, seed };
}

function openingBlocks(rows) {
  if (!Array.isArray(rows)) throw new Error('Material estimate rows must be an array.');
  const blocks = new Map();
  for (const row of rows) {
    plainObject(row, 'Material estimate row');
    for (const key of Object.keys(row)) if (!['openingId', 'layout', 'compensationCp', 'score'].includes(key)) throw new Error(`Unsupported material estimate row field: ${key}.`);
    if (typeof row.openingId !== 'string' || !row.openingId.trim() || row.openingId.length > 128) throw new Error('Each row needs a nonempty openingId of at most 128 characters.');
    const layout = LAYOUTS.indexOf(row.layout), dose = COMPENSATION.indexOf(row.compensationCp);
    if (layout < 0) throw new Error('Each layout must be left or right.');
    if (dose < 0) throw new Error('Each compensationCp must be 200, 300, 400 or 500.');
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > 1) throw new Error('Each score must be a finite number from 0 to 1.');
    if (!blocks.has(row.openingId)) blocks.set(row.openingId, new Array(8));
    const block = blocks.get(row.openingId), index = layout * 4 + dose;
    if (block[index] !== undefined) throw new Error(`Duplicate material estimate cell for ${row.openingId}, ${row.layout}, ${row.compensationCp}.`);
    block[index] = row.score;
  }
  return [...blocks].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([openingId, block]) => {
    if (Array.from(block).some(score => score === undefined)) throw new Error(`Incomplete material opening block: ${openingId}; all eight layout/compensation cells are required.`);
    return block;
  });
}

function curve(scores) { return scores.map((score, index) => ({ compensationCp: COMPENSATION[index], score })); }

// Equal-weight decreasing pool-adjacent-violators fit. Every dose contains the
// same complete openings and layouts, so there are no unequal cell weights.
function decreasingFit(scores) {
  const blocks = [];
  for (let index = 0; index < scores.length; index++) {
    blocks.push({ from: index, to: index, total: scores[index], count: 1 });
    while (blocks.length >= 2) {
      const a = blocks[blocks.length - 2], b = blocks[blocks.length - 1];
      if (a.total / a.count >= b.total / b.count - EPSILON) break;
      blocks.splice(-2, 2, { from: a.from, to: b.to, total: a.total + b.total, count: a.count + b.count });
    }
  }
  const fitted = new Array(scores.length);
  for (const block of blocks) for (let index = block.from; index <= block.to; index++) fitted[index] = block.total / block.count;
  return fitted;
}

function crossing(scores) {
  const equal = scores.map((score, index) => Math.abs(score - 0.5) <= EPSILON ? index : -1).filter(index => index >= 0);
  if (equal.length) {
    const lowerCp = COMPENSATION[equal[0]], upperCp = COMPENSATION[equal.at(-1)];
    return { status: lowerCp === upperCp ? 'bracketed' : 'plateau', lowerCp, upperCp, pointCp: lowerCp === upperCp ? lowerCp : null };
  }
  if (scores[0] < 0.5) return { status: 'below-range', lowerCp: null, upperCp: COMPENSATION[0], pointCp: null };
  if (scores.at(-1) > 0.5) return { status: 'above-range', lowerCp: COMPENSATION.at(-1), upperCp: null, pointCp: null };
  for (let index = 0; index < scores.length - 1; index++) {
    if (scores[index] > 0.5 && scores[index + 1] < 0.5) {
      const lowerCp = COMPENSATION[index], upperCp = COMPENSATION[index + 1];
      const pointCp = lowerCp + (upperCp - lowerCp) * (scores[index] - 0.5) / (scores[index] - scores[index + 1]);
      return { status: 'bracketed', lowerCp, upperCp, pointCp };
    }
  }
  throw new Error('The monotone compensation curve has no interpretable crossing.');
}

function summarized(scores) {
  const fitted = decreasingFit(scores);
  return { rawCurve: curve(scores), fittedCurve: curve(fitted), estimate: crossing(fitted) };
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  };
}

function bootstrap(blocks, options) {
  const { bootstrapReplicates, seed } = options;
  const result = {
    available: false, reason: null, requestedReplicates: bootstrapReplicates,
    replicates: 0, seed, confidence: 0.95, lowerCp: null, upperCp: null,
    statusCounts: Object.fromEntries(STATUSES.map(status => [status, 0])),
    interpretation: INTERPRETATION,
  };
  if (!blocks.length) { result.reason = 'no-data'; return result; }
  if (!bootstrapReplicates) { result.reason = 'disabled'; return result; }
  if (blocks.length < 8) { result.reason = 'requires-at-least-8-opening-blocks'; return result; }
  const random = randomSource(seed), lower = [], upper = [];
  for (let iteration = 0; iteration < bootstrapReplicates; iteration++) {
    const scores = [0, 0, 0, 0];
    for (let draw = 0; draw < blocks.length; draw++) {
      const block = blocks[Math.floor(random() * blocks.length)];
      for (let dose = 0; dose < 4; dose++) scores[dose] += (block[dose] + block[dose + 4]) / 2;
    }
    const estimate = crossing(decreasingFit(scores.map(score => score / blocks.length)));
    result.statusCounts[estimate.status]++;
    // An interpolated root is a point; plateaus and censored roots retain their
    // possible ranges. Never discard resamples that lack an interior crossing.
    lower.push(estimate.pointCp ?? estimate.lowerCp ?? -Infinity);
    upper.push(estimate.pointCp ?? estimate.upperCp ?? Infinity);
  }
  lower.sort((a, b) => a - b); upper.sort((a, b) => a - b);
  const lowerCp = lower[Math.floor(0.025 * (lower.length - 1))];
  const upperCp = upper[Math.ceil(0.975 * (upper.length - 1))];
  result.available = true; result.replicates = bootstrapReplicates;
  result.lowerCp = Number.isFinite(lowerCp) ? lowerCp : null;
  result.upperCp = Number.isFinite(upperCp) ? upperCp : null;
  return result;
}

/**
 * Estimate compensation from complete blocks of eight rows: both left/right
 * layouts at 200/300/400/500 material cp, each score a complete color-pair mean.
 * Raw scores average openings and layouts equally. A decreasing PAVA curve
 * supplies an observed-grid bracket and optional interpolated point. Plateau
 * roots stay ranges; missing crossings stay one-sided bounds. A null bound is
 * open/unbounded, not zero. Bootstrap bands describe conditional resampling
 * stability of interpolated roots; n<8 blocks has no band. Nested checkpoints
 * do not provide independent validation or a guarantee of greater accuracy.
 */
function estimateMaterial(rows, inputOptions = {}) {
  const options = optionsValue(inputOptions), blocks = openingBlocks(rows);
  if (!blocks.length) return {
    schemaVersion: 1, nOpenings: 0, testedCompensationCp: [], rawCurve: [], fittedCurve: [],
    estimate: { status: 'no-data', lowerCp: null, upperCp: null, pointCp: null }, layouts: [],
    diagnostics: { rawNonMonotone: false, reversals: [], maxRawReversal: 0,
      maxIsotonicAdjustment: 0, layoutPointDifferenceCp: null, layoutRangesOverlap: null },
    bootstrap: bootstrap(blocks, options),
  };
  const totals = new Array(8).fill(0);
  for (const block of blocks) for (let index = 0; index < 8; index++) totals[index] += block[index];
  const means = totals.map(total => total / blocks.length);
  const raw = COMPENSATION.map((_, index) => (means[index] + means[index + 4]) / 2);
  const pooled = summarized(raw), layouts = LAYOUTS.map((layout, index) => ({ layout, ...summarized(means.slice(index * 4, index * 4 + 4)) }));
  const reversals = pooled.rawCurve.slice(0, -1).flatMap((row, index) => {
    const next = pooled.rawCurve[index + 1], increase = next.score - row.score;
    return increase > EPSILON ? [{ lowerCompensationCp: row.compensationCp, upperCompensationCp: next.compensationCp,
      lowerScore: row.score, upperScore: next.score, increase }] : [];
  });
  const [left, right] = layouts.map(layout => layout.estimate);
  const low = estimate => estimate.lowerCp ?? -Infinity, high = estimate => estimate.upperCp ?? Infinity;
  return {
    schemaVersion: 1, nOpenings: blocks.length, testedCompensationCp: [...COMPENSATION], ...pooled, layouts,
    diagnostics: {
      rawNonMonotone: reversals.length > 0, reversals,
      maxRawReversal: reversals.reduce((maximum, row) => Math.max(maximum, row.increase), 0),
      maxIsotonicAdjustment: Math.max(...pooled.fittedCurve.map((row, index) => Math.abs(row.score - pooled.rawCurve[index].score))),
      layoutPointDifferenceCp: left.pointCp === null || right.pointCp === null ? null : Math.abs(left.pointCp - right.pointCp),
      layoutRangesOverlap: Math.max(low(left), low(right)) <= Math.min(high(left), high(right)),
    },
    bootstrap: bootstrap(blocks, options),
  };
}

module.exports = { estimateMaterial };
