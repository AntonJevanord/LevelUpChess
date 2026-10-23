'use strict';

// Offline, outcome-predictive diagnostic. These coefficients are neither search
// parameters nor causal exchange prices. No engine evaluation enters the fit.
const RIDGE = 0.001;
const MIN_BOOTSTRAP_GROUPS = 4;
const MIN_NORMALIZATION_GROUPS = 8;
const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const sigmoid = value => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const sumWeight = rows => rows.reduce((sum, row) => sum + row.weight, 0);
const unique = values => [...new Set(values)].sort();

function prepare(dataset, options) {
  if (!dataset || !Array.isArray(dataset.featureNames) || !dataset.featureNames.length
    || new Set(dataset.featureNames).size !== dataset.featureNames.length
    || dataset.featureNames.some(name => typeof name !== 'string' || !name)
    || !Array.isArray(dataset.samples) || !Array.isArray(dataset.games)) throw new Error('A material dataset needs featureNames, samples and games.');
  const bootstrap = options.bootstrap ?? 200, seed = options.seed ?? 42;
  if (Object.keys(options).some(key => !['bootstrap', 'seed'].includes(key))
    || !Number.isSafeInteger(bootstrap) || bootstrap < 0 || bootstrap > 2000
    || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Use bootstrap 0–2000 and an unsigned 32-bit seed.');
  const games = new Map(dataset.games.map(game => [game.gameId, game]));
  if (games.size !== dataset.games.length) throw new Error('Duplicate dataset game ID.');
  const pairGroups = new Map();
  for (const game of dataset.games) {
    if (typeof game.gameId !== 'string' || !game.gameId || typeof game.groupId !== 'string' || !game.groupId
      || typeof game.pairId !== 'string' || !game.pairId || !Number.isSafeInteger(game.samples) || game.samples < 0
      || !Object.hasOwn(SCORES, game.result)) throw new Error('Malformed dataset game identity or result.');
    if (pairGroups.has(game.pairId) && pairGroups.get(game.pairId) !== game.groupId) throw new Error('A color pair cannot span validation groups.');
    pairGroups.set(game.pairId, game.groupId);
  }
  const totals = new Map();
  for (const row of dataset.samples) {
    const game = games.get(row.gameId);
    if (!game || !Array.isArray(row.x) || row.x.length !== dataset.featureNames.length || row.x.some(value => !Number.isFinite(value) || Math.abs(value) > 256)
      || ![0, 0.5, 1].includes(row.y) || !Number.isFinite(row.weight) || row.weight <= 0
      || typeof row.groupId !== 'string' || !row.groupId || typeof row.pairId !== 'string' || !row.pairId
      || row.groupId !== game.groupId || row.pairId !== game.pairId || row.y !== SCORES[game.result]) throw new Error('Malformed material sample, result or group identity.');
    const total = totals.get(row.gameId) || { weight: 0, count: 0, y: row.y };
    if (total.y !== row.y) throw new Error('Samples from one game must share its final score.');
    total.weight += row.weight; total.count++; totals.set(row.gameId, total);
  }
  for (const [id, game] of games) {
    const total = totals.get(id);
    if (game.samples !== (total?.count || 0) || total && Math.abs(total.weight - 1) > 1e-8) throw new Error('Each sampled game needs unit total weight and matching sample count.');
  }
  const rows = [...dataset.samples].sort((a, b) => a.groupId.localeCompare(b.groupId) || a.gameId.localeCompare(b.gameId)
    || JSON.stringify(a.x).localeCompare(JSON.stringify(b.x)) || a.weight - b.weight);
  return { rows, names: [...dataset.featureNames], groups: unique(rows.map(row => row.groupId)), bootstrap, seed };
}

function design(rows, size) {
  const weight = sumWeight(rows), means = new Array(size).fill(0), scales = new Array(size).fill(0);
  for (const row of rows) for (let j = 0; j < size; j++) means[j] += row.weight * row.x[j] / weight;
  for (const row of rows) for (let j = 0; j < size; j++) scales[j] += row.weight * (row.x[j] - means[j]) ** 2 / weight;
  for (let j = 0; j < size; j++) scales[j] = Math.sqrt(scales[j]) || 1;
  return { means, scales, rows: rows.map(row => ({ ...row, z: [1, ...row.x.map((value, j) => (value - means[j]) / scales[j])] })) };
}

// Pivoted elimination of the standardized unpenalized Gram matrix. Ridge makes
// prediction possible under collinearity; it must never manufacture data rank.
function rankOf(rows, names) {
  const columns = ['intercept', ...names], d = columns.length;
  if (!rows.length) return { rank: 0, columns: d, fullRank: false, dependentFeatures: columns, minimumPivot: null, correlations: [] };
  const prepared = design(rows, names.length), weight = sumWeight(rows);
  const gram = Array.from({ length: d }, () => new Array(d).fill(0)), order = columns.map((_, j) => j);
  for (const row of prepared.rows) for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) gram[i][j] += row.weight * row.z[i] * row.z[j] / weight;
  for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) gram[i][j] = gram[j][i];
  const correlations = [];
  for (let i = 1; i < d; i++) for (let j = i + 1; j < d; j++) if (gram[i][i] > 0 && gram[j][j] > 0) {
    const correlation = Math.max(-1, Math.min(1, gram[i][j] / Math.sqrt(gram[i][i] * gram[j][j])));
    if (Math.abs(correlation) >= 0.8) correlations.push({ left: names[i - 1], right: names[j - 1], correlation });
  }
  let rank = 0, minimumPivot = Infinity;
  for (let k = 0; k < d; k++) {
    let pivot = k;
    for (let j = k + 1; j < d; j++) if (gram[j][j] > gram[pivot][pivot]) pivot = j;
    if (gram[pivot][pivot] <= 1e-9) break;
    [gram[k], gram[pivot]] = [gram[pivot], gram[k]];
    for (const row of gram) [row[k], row[pivot]] = [row[pivot], row[k]];
    [order[k], order[pivot]] = [order[pivot], order[k]];
    const value = gram[k][k]; minimumPivot = Math.min(minimumPivot, value); rank++;
    for (let i = k + 1; i < d; i++) for (let j = i; j < d; j++) {
      gram[j][i] -= gram[i][k] * gram[j][k] / value; gram[i][j] = gram[j][i];
    }
  }
  return { rank, columns: d, fullRank: rank === d, dependentFeatures: order.slice(rank).map(index => columns[index]), minimumPivot: Number.isFinite(minimumPivot) ? minimumPivot : null, correlations };
}

function solve(matrix, vector) {
  const a = matrix.map((row, index) => [...row, vector[index]]), n = vector.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    if (Math.abs(a[pivot][k]) < 1e-15) return null;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    for (let i = k + 1; i < n; i++) {
      const ratio = a[i][k] / a[k][k];
      for (let j = k; j <= n; j++) a[i][j] -= ratio * a[k][j];
    }
  }
  const answer = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) answer[i] = (a[i][n] - dot(a[i].slice(0, n), answer)) / a[i][i];
  return answer;
}

function fit(rows, names) {
  if (!rows.length) return { converged: false, reason: 'no-data', iterations: 0, coefficients: {}, intercept: 0 };
  const transformed = design(rows, names.length), observations = transformed.rows, weight = sumWeight(rows), d = names.length + 1;
  let beta = new Array(d).fill(0), converged = false, iteration = 0;
  const objective = values => observations.reduce((total, row) => {
    const value = dot(row.z, values);
    return total + row.weight * (Math.max(value, 0) + Math.log1p(Math.exp(-Math.abs(value))) - row.y * value) / weight;
  }, values.slice(1).reduce((sum, value) => sum + RIDGE * value * value / 2, 0));
  for (; iteration < 80; iteration++) {
    const gradient = beta.map((value, j) => j ? RIDGE * value : 0);
    const hessian = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => i === j && i ? RIDGE : 0));
    for (const row of observations) {
      const probability = sigmoid(dot(row.z, beta)), error = (probability - row.y) * row.weight / weight;
      const curvature = Math.max(probability * (1 - probability), 1e-14) * row.weight / weight;
      for (let i = 0; i < d; i++) {
        gradient[i] += error * row.z[i];
        for (let j = 0; j <= i; j++) hessian[i][j] += curvature * row.z[i] * row.z[j];
      }
    }
    if (Math.max(...gradient.map(Math.abs)) < 1e-8) { converged = true; break; }
    for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) hessian[i][j] = hessian[j][i];
    const step = solve(hessian, gradient);
    if (!step) break;
    const before = objective(beta); let scale = 1, next;
    do { next = beta.map((value, j) => value - scale * step[j]); scale /= 2; } while (objective(next) > before + 1e-12 && scale > 1e-8);
    if (next.some(value => !Number.isFinite(value) || Math.abs(value) > 100)) break;
    beta = next;
  }
  // A one-class outcome has an unbounded unpenalized intercept, even if a tiny
  // gradient eventually passes tolerance. Never present that as a finite fit.
  if (rows.every(row => row.y === 0) || rows.every(row => row.y === 1)) converged = false;
  const coefficients = Object.fromEntries(names.map((name, j) => [name, beta[j + 1] / transformed.scales[j]]));
  return { converged, reason: converged ? null : 'no-finite-converged-fit', iterations: iteration,
    intercept: beta[0] - dot(beta.slice(1).map((value, j) => value / transformed.scales[j]), transformed.means), coefficients };
}

function metrics(rows, prediction) {
  const weight = sumWeight(rows); let brier = 0, logLoss = 0;
  for (const row of rows) {
    const probability = Math.max(1e-12, Math.min(1 - 1e-12, prediction(row)));
    brier += row.weight * (probability - row.y) ** 2;
    logLoss -= row.weight * (row.y * Math.log(probability) + (1 - row.y) * Math.log1p(-probability));
  }
  return { brier: weight ? brier / weight : null, logLoss: weight ? logLoss / weight : null };
}
const prediction = (model, names) => row => sigmoid(model.intercept + row.x.reduce((sum, value, j) => sum + value * model.coefficients[names[j]], 0));
const separates = (rows, names, model) => rows.length > 0 && rows.every(row => row.y !== 0.5
  && (model.intercept + row.x.reduce((sum, value, j) => sum + value * model.coefficients[names[j]], 0)) * (2 * row.y - 1) > 1e-6);

function validation(rows, names, groups) {
  const output = { available: false, reason: null, unit: 'whole-opening-family', folds: [], metrics: null, baselineMetrics: null };
  if (groups.length < 2) { output.reason = 'requires-at-least-two-groups'; return output; }
  const all = [], baseline = [];
  for (const group of groups) {
    const train = rows.filter(row => row.groupId !== group), test = rows.filter(row => row.groupId === group), model = fit(train, names);
    const mean = train.reduce((sum, row) => sum + row.y * row.weight, 0) / sumWeight(train), predict = prediction(model, names);
    output.folds.push({ heldOutGroup: group, trainingGroups: groups.filter(value => value !== group), testGroups: [group],
      trainingGames: unique(train.map(row => row.gameId)).length, testGames: unique(test.map(row => row.gameId)).length,
      converged: model.converged, fullRank: rankOf(train, names).fullRank, metrics: metrics(test, predict), baselineMetrics: metrics(test, () => mean) });
    for (const row of test) { all.push({ ...row, probability: predict(row) }); baseline.push({ ...row, probability: mean }); }
  }
  output.available = output.folds.every(fold => fold.converged);
  output.reason = output.available ? null : 'some-training-folds-did-not-converge';
  output.metrics = metrics(all, row => row.probability); output.baselineMetrics = metrics(baseline, row => row.probability);
  return output;
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let value = Math.imul(state ^ state >>> 15, 1 | state); value ^= value + Math.imul(value ^ value >>> 7, 61 | value); return ((value ^ value >>> 14) >>> 0) / 0x100000000; };
}
function interval(values) {
  if (!values.length) return { lower: null, upper: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { lower: sorted[Math.floor((sorted.length - 1) * 0.025)], upper: sorted[Math.ceil((sorted.length - 1) * 0.975)] };
}

function resample(rows, names, groups, requested, seed) {
  const result = { available: false, reason: null, requested, completed: 0, seed, confidence: 0.95, groupUnit: 'whole-opening-family',
    minimumGroups: MIN_BOOTSTRAP_GROUPS, groupCount: groups.length, rankDeficient: 0, nonconverged: 0, pawnNonpositive: 0, possibleSeparation: 0,
    validRatios: 0, pawnCoefficient: { lower: null, upper: null }, coefficientIntervals: {}, ratioIntervals: {},
    interpretation: 'Exploratory conditional whole-family percentile stability; failed and unsupported fits are counted, not hidden. Not a universal confidence interval or representative material calibration.' };
  if (!requested || groups.length < MIN_BOOTSTRAP_GROUPS) { result.reason = !requested ? 'disabled' : 'requires-at-least-four-groups'; return result; }
  const byGroup = new Map(groups.map(group => [group, rows.filter(row => row.groupId === group)])), random = randomSource(seed);
  const coefficients = Object.fromEntries(names.map(name => [name, []])), ratios = Object.fromEntries(names.map(name => [name, []]));
  for (let replicate = 0; replicate < requested; replicate++) {
    const draws = new Map();
    for (let j = 0; j < groups.length; j++) { const group = groups[Math.floor(random() * groups.length)]; draws.set(group, (draws.get(group) || 0) + 1); }
    const sampled = [...draws].flatMap(([group, count]) => byGroup.get(group).map(row => ({ ...row, weight: row.weight * count })));
    const model = fit(sampled, names), rank = rankOf(sampled, names); result.completed++;
    if (!model.converged) { result.nonconverged++; continue; }
    if (!rank.fullRank) { result.rankDeficient++; continue; }
    for (const name of names) coefficients[name].push(model.coefficients[name]);
    if (separates(sampled, names, model)) { result.possibleSeparation++; continue; }
    const pawn = model.coefficients.pawn;
    if (!(pawn > 1e-6)) { result.pawnNonpositive++; continue; }
    result.validRatios++;
    for (const name of names) ratios[name].push(model.coefficients[name] / pawn);
  }
  result.available = coefficients[names[0]].length > 0;
  result.reason = result.available ? null : 'no-full-rank-converged-resamples';
  result.coefficientIntervals = Object.fromEntries(names.map(name => [name, interval(coefficients[name])]));
  result.ratioIntervals = Object.fromEntries(names.map(name => [name, interval(ratios[name])]));
  result.pawnCoefficient = result.coefficientIntervals.pawn || { lower: null, upper: null };
  return result;
}

function analyzeDataset(dataset, options = {}) {
  const { rows, names, groups, bootstrap, seed } = prepare(dataset, options);
  const coverage = { samples: rows.length, games: unique(rows.map(row => row.gameId)).length, pairs: unique(rows.map(row => row.pairId)).length,
    groups: groups.length, groupIds: groups, drawGames: unique(rows.filter(row => row.y === 0.5).map(row => row.gameId)).length,
    features: names.map((name, j) => ({ name, min: rows.length ? rows.reduce((minimum, row) => Math.min(minimum, row.x[j]), Infinity) : null,
      max: rows.length ? rows.reduce((maximum, row) => Math.max(maximum, row.x[j]), -Infinity) : null,
      nonzeroGames: unique(rows.filter(row => row.x[j] !== 0).map(row => row.gameId)).length,
      groupsWithNonzero: unique(rows.filter(row => row.x[j] !== 0).map(row => row.groupId)).length })) };
  const rank = rankOf(rows, names), model = fit(rows, names), bands = resample(rows, names, groups, bootstrap, seed), reasons = [];
  const possibleSeparation = separates(rows, names, model);
  if (!rows.length) reasons.push('no-data');
  if (!rank.fullRank) reasons.push('rank-deficient-design');
  if (!model.converged) reasons.push('fit-not-converged');
  if (possibleSeparation) reasons.push('possible-outcome-separation');
  if (!(model.coefficients.pawn > 1e-6)) reasons.push('pawn-coefficient-not-positive');
  if (groups.length < MIN_NORMALIZATION_GROUPS) reasons.push('fewer-than-eight-opening-families');
  if (coverage.features.some(feature => feature.name !== 'tempo' && feature.groupsWithNonzero < MIN_NORMALIZATION_GROUPS)) reasons.push('insufficient-feature-group-support');
  if (!bands.available || bands.validRatios < Math.max(20, 0.9 * bootstrap)) reasons.push('insufficient-stable-bootstrap-ratios');
  if (!(bands.pawnCoefficient.lower > 1e-6)) reasons.push('pawn-bootstrap-band-not-positive');
  const normalized = { available: !reasons.length, reason: reasons[0] || null, reasons,
    minimumGroups: MIN_NORMALIZATION_GROUPS, values: reasons.length ? null : Object.fromEntries(names.map(name => [name, model.coefficients[name] / model.coefficients.pawn])) };
  const warnings = [...(dataset.limitations || [])];
  if (!rank.fullRank) warnings.push('Ridge yields exploratory predictions despite missing rank; coefficients are not separately identified by these data.');
  if (possibleSeparation) warnings.push('The fitted linear predictor perfectly separates decisive outcomes; finite slopes depend on ridge rather than an ordinary finite unpenalized likelihood estimate.');
  if (rank.minimumPivot !== null && rank.minimumPivot < 1e-5) warnings.push('Strong material-feature collinearity makes coefficients sensitive to sampling and regularization.');
  if (reasons.length) warnings.push(`Pawn-normalized point estimates withheld: ${reasons.join(', ')}.`);
  return { schemaVersion: 1,
    method: { target: 'expected final White score, W/D/L = 1/0.5/0', link: 'fractional-logistic cross-entropy', intercept: 'unpenalized',
      ridge: RIDGE, ridgeScale: 'mean game-weighted loss; penalty on standardized slopes', weighting: 'each sampled game has unit total weight',
      bootstrapUnit: 'whole opening family', minimumBootstrapGroups: MIN_BOOTSTRAP_GROUPS, minimumNormalizationGroups: MIN_NORMALIZATION_GROUPS,
      normalizationThreshold: 'Conservative reporting policy, not a confidence guarantee or a reason to generate more games automatically.',
      regularizationCaveat: 'Ridge produces finite exploratory slopes even for some separated outcomes; absence of a perfect-classification flag does not exclude quasi-separation.',
      interpretation: 'Exploratory outcome-predictive coefficients conditional on this selected dataset and playing policy; not intrinsic or causal piece values.' },
    coverage, rank, fit: { ...model, possibleSeparation, metrics: rows.length ? metrics(rows, prediction(model, names)) : { brier: null, logLoss: null } },
    validation: validation(rows, names, groups), bootstrap: bands, normalized, warnings };
}

module.exports = { analyzeDataset };
