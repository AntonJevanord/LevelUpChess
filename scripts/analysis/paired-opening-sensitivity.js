'use strict';

// Offline descriptive sensitivity over complete matched opening blocks.
// A deterministic empirical bootstrap removes Monte Carlo noise, not opening
// dependence, selection bias or the small-sample limitations of percentile CIs.
const T95 = Object.freeze({ 4: 3.182446305, 8: 2.364624252, 16: 2.131449546,
  32: 2.039513446, 64: 1.998340543 });

function summarizeOpeningChanges(values, { units = 16 } = {}) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 64
    || !Number.isInteger(units) || units < 1 || units > 128
    || values.some(value => !Number.isFinite(value) || Math.abs(value) > 2
      || Math.abs(value * units - Math.round(value * units)) > 1e-8)) {
    throw new Error('Use 2–64 finite opening-block values on the declared integer score grid (units 1–128).');
  }
  const integers = values.map(value => Math.round(value * units)), count = values.length;
  const normalized = integers.map(value => value / units);
  const average = integers.reduce((sum, value) => sum + value, 0) / (count * units);
  const variance = normalized.reduce((sum, value) => sum + (value - average) ** 2, 0) / (count - 1);
  const standardError = Math.sqrt(variance / count);
  const minimum = Math.min(...integers), span = Math.max(...integers) - minimum;
  const frequencies = new Map();
  for (const value of integers) frequencies.set(value - minimum, (frequencies.get(value - minimum) || 0) + 1);
  let probabilities = Float64Array.of(1);
  for (let draw = 0; draw < count; draw++) {
    const next = new Float64Array(probabilities.length + span);
    for (let sum = 0; sum < probabilities.length; sum++) if (probabilities[sum]) {
      for (const [value, frequency] of frequencies) next[sum + value] += probabilities[sum] * frequency / count;
    }
    probabilities = next;
  }
  const quantile = target => {
    let cumulative = 0;
    for (let index = 0; index < probabilities.length; index++) {
      cumulative += probabilities[index];
      if (cumulative >= target - 1e-12) return (index + count * minimum) / (count * units);
    }
    throw new Error('The opening-block bootstrap probability mass is incomplete.');
  };
  const critical = T95[count], leaveOneOut = normalized.map((value, index) => ({ omittedIndex: index,
    mean: (average * count - value) / (count - 1) }));
  return { openingGroups: count, mean: average, standardError,
    signs: { positive: normalized.filter(value => value > 0).length, negative: normalized.filter(value => value < 0).length,
      zero: normalized.filter(value => value === 0).length },
    conditionalBootstrap: { available: count >= 4, confidence: 0.95,
      lower: count >= 4 ? quantile(0.025) : null, upper: count >= 4 ? quantile(0.975) : null,
      method: 'Whole-opening empirical bootstrap via discrete convolution; numerical probabilities, no Monte Carlo resampling.',
      probabilityMass: probabilities.reduce((a, b) => a + b, 0), units },
    smallSampleT: { available: critical !== undefined, confidence: 0.95, degreesOfFreedom: count - 1,
      critical: critical ?? null, lower: critical === undefined ? null : average - critical * standardError,
      upper: critical === undefined ? null : average + critical * standardError,
      interpretation: 'Approximate sensitivity check on opening-block means; fixed/related openings are not an IID population sample.' },
    leaveOneOut: { minimum: Math.min(...leaveOneOut.map(row => row.mean)), maximum: Math.max(...leaveOneOut.map(row => row.mean)), cases: leaveOneOut },
    limitations: ['Every input must already combine both colors and equally weighted matched opponents for one opening.',
      'Blocks reused across budgets and bodies stay paired before this calculation; physical games are not independently resampled.',
      'Percentile bootstrap coverage can be poor with eight blocks; compare the small-sample sensitivity interval and replicate.',
      'These conditional summaries omit broader opening ancestry, model/search bias and selection after viewing many matchups. No automatic significance decision is made.'] };
}

module.exports = { summarizeOpeningChanges };
