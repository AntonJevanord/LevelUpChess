'use strict';

// Six contextual fits share one position-block bootstrap. The frozen legacy
// estimator remains untouched; this study has its own mathematical identity.
const { createHash } = require('node:crypto');
const core = require('./reference-regression');
const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const COHORTS = ['baseline', 'head', 'combined'];
const MODES = ['primary', 'diagnostic'];
const pause = () => new Promise(resolve => setImmediate(resolve));
const foldOf = (group, count) => parseInt(createHash('sha256').update(group).digest('hex').slice(0, 8), 16) % count;

function aborted(signal) {
  if (signal?.aborted) {
    const error = new Error('Reference analysis stopped; raw collection evidence is preserved.');
    error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
  }
}
async function yieldAnalysis(signal) { await pause(); aborted(signal); }

function select(dataset, cohort) {
  const games = dataset.games.filter(game => cohort === 'combined' || (cohort === 'head' ? game.kind === 'head' : game.kind !== 'head'));
  const ids = new Set(games.map(game => game.gameId));
  return { ...dataset, games, samples: dataset.samples.filter(row => ids.has(row.gameId)) };
}

function bands(names, groups, requested, seed, anchored) {
  return { available: false, reason: null, requested, completed: 0, seed, confidence: 0.95,
    groupUnit: 'whole-selected-position-block', minimumGroups: 4, groupCount: groups.length,
    rankDeficient: 0, nonconverged: 0, pawnNonpositive: 0, possibleSeparation: 0,
    validRatios: 0, pawnCoefficient: { lower: null, upper: null }, coefficientIntervals: {}, ratioIntervals: {},
    interpretation: 'Conditional whole-position percentile ranges; every cohort shares identical block multiplicities, including zero-sample groups.',
    ...(anchored ? { fixedRatios: { pawn: 1, queen: 9 } } : {}),
    coefficients: Object.fromEntries(names.map(name => [name, []])), ratios: Object.fromEntries(names.map(name => [name, []])) };
}

function recordFit(state, rows, names, anchors) {
  const model = core.fit(rows, names, anchors), rank = core.modelRank(rows, names, anchors);
  state.completed++;
  if (!model.converged) {
    state[anchors && model.reason === 'anchor-scale-not-positive' ? 'pawnNonpositive' : 'nonconverged']++;
    return null;
  }
  if (!rank.fullRank) { state.rankDeficient++; return null; }
  for (const name of names) state.coefficients[name].push(model.coefficients[name]);
  if (core.separates(rows, names, model)) { state.possibleSeparation++; return null; }
  if (!(model.coefficients.pawn > 1e-6)) { state.pawnNonpositive++; return null; }
  state.validRatios++;
  const values = Object.fromEntries(names.map(name => [name, anchors && name === 'queen' ? 9
    : anchors && name === 'pawn' ? 1 : model.coefficients[name] / model.coefficients.pawn]));
  for (const name of names) state.ratios[name].push(values[name]);
  return values;
}

function finishBands(state, names, disabledReason) {
  state.available = state.coefficients[names[0]].length > 0;
  state.reason = state.available ? null : disabledReason || 'no-full-rank-converged-resamples';
  state.coefficientIntervals = Object.fromEntries(names.map(name => [name, core.interval(state.coefficients[name])]));
  state.ratioIntervals = Object.fromEntries(names.map(name => [name, core.interval(state.ratios[name])]));
  state.pawnCoefficient = state.coefficientIntervals.pawn || { lower: null, upper: null };
  delete state.coefficients; delete state.ratios;
  return state;
}

async function groupedValidation(rows, names, groups, anchors, count, onProgress, signal) {
  const occupied = core.unique(groups.map(group => foldOf(group, count))).sort((a, b) => a - b);
  const result = { available: false, reason: null, unit: 'whole-selected-position-block',
    strategy: 'sha256-group-id-modulo', requestedFolds: count, occupiedFolds: occupied.length,
    folds: [], metrics: null, baselineMetrics: null };
  const models = new Map();
  if (occupied.length < 2) { result.reason = 'requires-at-least-two-occupied-folds'; return { result, models }; }
  const all = [], baseline = [];
  for (const fold of occupied) {
    await yieldAnalysis(signal);
    const testGroups = groups.filter(group => foldOf(group, count) === fold), testSet = new Set(testGroups);
    const train = rows.filter(row => !testSet.has(row.groupId)), test = rows.filter(row => testSet.has(row.groupId));
    const model = core.fit(train, names, anchors), rank = core.modelRank(train, names, anchors);
    const supported = model.converged && rank.fullRank && model.coefficients.pawn > 1e-6 && !core.separates(train, names, model);
    const mean = train.reduce((sum, row) => sum + row.y * row.weight, 0) / core.sumWeight(train);
    const predict = core.prediction(model, names);
    models.set(fold, { model, supported, testGroups, trainingGroups: groups.filter(group => !testSet.has(group)) });
    result.folds.push({ fold, trainingGroups: groups.filter(group => !testSet.has(group)), testGroups,
      trainingGames: core.unique(train.map(row => row.gameId)).length, testGames: core.unique(test.map(row => row.gameId)).length,
      converged: model.converged, fullRank: rank.fullRank, supported,
      metrics: supported ? core.metrics(test, predict) : { brier: null, logLoss: null },
      baselineMetrics: Number.isFinite(mean) ? core.metrics(test, () => mean) : { brier: null, logLoss: null } });
    if (supported) for (const row of test) { all.push({ ...row, probability: predict(row) }); baseline.push({ ...row, probability: mean }); }
    onProgress?.({ phase: 'validation', completed: result.folds.length, total: occupied.length });
  }
  result.available = result.folds.every(fold => fold.supported);
  result.reason = result.available ? null : 'some-training-folds-unsupported';
  // Do not compare metrics on a silently reduced set of successful folds.
  if (result.available) {
    result.metrics = core.metrics(all, row => row.probability);
    result.baselineMetrics = core.metrics(baseline, row => row.probability);
  }
  return { result, models };
}

function means(rows, multiplicities) {
  let count = 0, observed = 0, predicted = 0;
  for (const row of rows) {
    const weight = multiplicities ? multiplicities.get(row.groupId) || 0 : 1;
    count += weight; observed += weight * row.observedAScore;
    if (row.predictedAScore !== null) predicted += weight * row.predictedAScore;
  }
  const supported = rows.every(row => row.available);
  return { count, observed: count ? observed / count : null,
    predicted: count && supported ? predicted / count : null,
    error: count && supported ? (observed - predicted) / count : null };
}

async function predictions(dataset, prepared, models, groups, { validationFolds, bootstrap, seed, onProgress, signal }) {
  const games = dataset.games.filter(game => game.kind === 'head').map(game => {
    const fold = foldOf(game.groupId, validationFolds), saved = models.get(fold);
    const available = Boolean(saved?.supported), observedWhiteScore = SCORES[game.result];
    const predictedWhiteScore = available ? core.prediction(saved.model, prepared.names)({ x: game.startX }) : null;
    return { gameId: game.gameId, pairId: game.pairId, groupId: game.groupId, comparisonId: game.comparisonId,
      designA: game.designA, designB: game.designB, aColor: game.aColor, fold, observedWhiteScore, predictedWhiteScore,
      observedAScore: game.aColor === 'w' ? observedWhiteScore : 1 - observedWhiteScore,
      predictedAScore: predictedWhiteScore === null ? null : game.aColor === 'w' ? predictedWhiteScore : 1 - predictedWhiteScore,
      available, reason: available ? null : saved ? 'training-fold-unsupported' : 'requires-at-least-two-occupied-folds' };
  });
  const byComparison = new Map();
  for (const game of games) { const rows = byComparison.get(game.comparisonId) || []; rows.push(game); byComparison.set(game.comparisonId, rows); }
  const matchups = [...byComparison].sort(([a], [b]) => a.localeCompare(b)).map(([comparisonId, rows]) => {
    const pairs = new Map();
    for (const row of rows) { const pair = pairs.get(row.pairId) || []; pair.push(row); pairs.set(row.pairId, pair); }
    const complete = [...pairs.values()].filter(pair => pair.length === 2 && new Set(pair.map(row => row.aColor)).size === 2
      && new Set(pair.map(row => row.groupId)).size === 1 && new Set(pair.map(row => row.designA)).size === 1
      && new Set(pair.map(row => row.designB)).size === 1);
    const paired = complete.flat(), value = means(paired);
    const wdl = selected => ({ games: selected.length, wins: selected.filter(row => row.observedAScore === 1).length,
      draws: selected.filter(row => row.observedAScore === 0.5).length, losses: selected.filter(row => row.observedAScore === 0).length,
      score: means(selected).observed });
    return { comparisonId, designA: rows[0].designA, designB: rows[0].designB,
      games: paired.length, completedGames: rows.length, completePairs: complete.length,
      partialPairs: pairs.size - complete.length, partialGames: rows.length - paired.length,
      ...wdl(paired), allCompleted: wdl(rows),
      observedAScore: value.observed, pairedObservedAScore: value.observed,
      predictedAScore: value.predicted, pairedPredictedAScore: value.predicted, predictionError: value.error,
      unavailablePredictionGames: paired.filter(row => !row.available).length,
      observedInterval: null, errorInterval: null,
      byColor: Object.fromEntries(['w', 'b'].map(color => { const selected = paired.filter(row => row.aColor === color), m = means(selected);
        return [color, { games: selected.length, observedAScore: m.observed, predictedAScore: m.predicted }]; })),
      _paired: paired, _observed: [], _errors: [] };
  });
  if (bootstrap && groups.length >= 4 && matchups.length) {
    const random = core.randomSource(seed);
    for (let replicate = 0; replicate < bootstrap; replicate++) {
      aborted(signal);
      const draws = new Map();
      for (let index = 0; index < groups.length; index++) { const group = groups[Math.floor(random() * groups.length)]; draws.set(group, (draws.get(group) || 0) + 1); }
      for (const matchup of matchups) { const m = means(matchup._paired, draws);
        if (m.observed !== null) matchup._observed.push(m.observed);
        if (m.error !== null) matchup._errors.push(m.error);
      }
      if ((replicate + 1) % 20 === 0 || replicate + 1 === bootstrap) { onProgress?.({ phase: 'matchup-ranges', completed: replicate + 1, total: bootstrap }); await yieldAnalysis(signal); }
    }
  }
  for (const matchup of matchups) {
    if (matchup._observed.length >= Math.max(20, bootstrap * 0.9)) matchup.observedInterval = core.interval(matchup._observed);
    if (matchup._errors.length >= Math.max(20, bootstrap * 0.9)) matchup.errorInterval = core.interval(matchup._errors);
    matchup.validObservedResamples = matchup._observed.length; matchup.validErrorResamples = matchup._errors.length;
    delete matchup._paired; delete matchup._observed; delete matchup._errors;
  }
  return { available: games.length > 0 && games.every(game => game.available),
    reason: !games.length ? 'no-head-to-head-games' : games.every(game => game.available) ? null : 'some-training-folds-unsupported',
    unit: 'whole-selected-position-block', requestedFolds: validationFolds, folds: [...models].map(([fold, value]) => ({ fold,
      supported: value.supported, trainingGroups: value.trainingGroups, testGroups: value.testGroups })),
    games, matchups, errorDirection: 'observed-minus-predicted', predictionErrorDirection: 'observed-minus-predicted', interpretation: 'Predictions use only other position blocks. Matchup ranges resample complete color pairs within whole blocks; error ranges condition on the fitted out-of-fold predictions and do not refit training models.' };
}

async function analyzeReferenceDataset(dataset, options = {}) {
  const allowed = ['bootstrap', 'seed', 'validationFolds', 'onProgress', 'signal', 'anchors'];
  if (Object.keys(options).some(key => !allowed.includes(key))) throw new Error('Unknown reference analysis option.');
  if (options.anchors !== undefined && JSON.stringify(options.anchors) !== JSON.stringify({ pawn: 1, queen: 9 })) throw new Error('The reference study assumes pawn=1 and queen=9.');
  const bootstrap = options.bootstrap ?? 200, seed = options.seed ?? 42, validationFolds = options.validationFolds ?? 5;
  const onProgress = options.onProgress, signal = options.signal;
  aborted(signal);
  const prepared = core.prepare(dataset, { bootstrap, seed, validationFolds, anchors: { pawn: 1, queen: 9 }, onProgress });
  for (const game of dataset.games) {
    if (!['ordinary', 'single', 'head'].includes(game.kind)) throw new Error('Unknown reference game cohort.');
    if (game.kind === 'head' && (typeof game.comparisonId !== 'string' || !game.comparisonId
      || typeof game.designA !== 'string' || typeof game.designB !== 'string' || game.designA === game.designB
      || !dataset.featureNames.includes(`bonus:${game.designA}`) || !dataset.featureNames.includes(`bonus:${game.designB}`)
      || !['w', 'b'].includes(game.aColor) || !Array.isArray(game.startX) || game.startX.length !== dataset.featureNames.length
      || game.startX.some(value => !Number.isFinite(value) || Math.abs(value) > 256))) throw new Error('Head-to-head prediction needs intact start features and design identities.');
  }
  const groups = core.unique(dataset.games.map(game => game.groupId)), names = prepared.names;
  const cohorts = Object.fromEntries(COHORTS.map(cohort => [cohort, select(dataset, cohort)]));
  const rows = Object.fromEntries(COHORTS.map(cohort => [cohort, core.prepare(cohorts[cohort], { bootstrap, seed, validationFolds }).rows]));
  const states = Object.fromEntries(MODES.map(mode => [mode, Object.fromEntries(COHORTS.map(cohort => [cohort, bands(names, groups, bootstrap, seed, mode === 'primary')]))]));
  const bonusNames = names.filter(name => name.startsWith('bonus:'));
  const paired = Object.fromEntries(bonusNames.map(name => [name, []])), failures = { unsupportedPairedFits: 0 };
  const byGroup = Object.fromEntries(COHORTS.map(cohort => [cohort, new Map(groups.map(group => [group, rows[cohort].filter(row => row.groupId === group)]))]));
  if (bootstrap && groups.length >= 4) {
    const random = core.randomSource(seed);
    onProgress?.({ phase: 'coupled-bootstrap', completed: 0, total: bootstrap });
    for (let replicate = 0; replicate < bootstrap; replicate++) {
      aborted(signal);
      const draws = new Map();
      for (let index = 0; index < groups.length; index++) { const group = groups[Math.floor(random() * groups.length)]; draws.set(group, (draws.get(group) || 0) + 1); }
      const values = {};
      for (const mode of MODES) {
        values[mode] = {};
        for (const cohort of COHORTS) {
          const sampled = [...draws].flatMap(([group, count]) => byGroup[cohort].get(group).map(row => ({ ...row, weight: row.weight * count })));
          values[mode][cohort] = recordFit(states[mode][cohort], sampled, names, mode === 'primary' ? { pawn: 1, queen: 9 } : null);
        }
      }
      if (values.primary.baseline && values.primary.head) {
        for (const name of bonusNames) paired[name].push(values.primary.head[name] - values.primary.baseline[name]);
      } else failures.unsupportedPairedFits++;
      if ((replicate + 1) % 5 === 0 || replicate + 1 === bootstrap) {
        onProgress?.({ phase: 'coupled-bootstrap', completed: replicate + 1, total: bootstrap }); await yieldAnalysis(signal);
      }
    }
  }
  const result = { primary: {}, diagnostic: {} };
  let predictionModels = new Map();
  for (const mode of MODES) for (const cohort of COHORTS) {
    await yieldAnalysis(signal);
    const anchors = mode === 'primary' ? { pawn: 1, queen: 9 } : null;
    const band = finishBands(states[mode][cohort], names, !bootstrap ? 'disabled' : groups.length < 4 ? 'requires-at-least-four-groups' : null);
    const validation = await groupedValidation(rows[cohort], names, groups, anchors, validationFolds,
      event => onProgress?.({ ...event, mode, cohort }), signal);
    const analysis = core.analyzeDataset(cohorts[cohort], { bootstrap, seed, validationFolds, anchors }, band, validation.result);
    analysis.method.bootstrapUnit = 'whole selected-position block';
    analysis.method.groupingCaveat = 'Different selected positions may share opening ancestry.';
    analysis.normalized.materialPriceTableSupported = false;
    result[mode][cohort] = analysis;
    if (mode === 'primary' && cohort === 'combined') predictionModels = validation.models;
  }
  const differences = { direction: 'head-minus-baseline', margin: 0.5, requested: bootstrap,
    completed: states.primary.baseline.completed, groupIds: groups, failures,
    interpretation: 'Paired refits use identical whole-position resample multiplicities. The ±0.5 guide is practical conditional agreement, not universal statistical equivalence.', byFeature: {} };
  for (const name of bonusNames) {
    const baseline = result.primary.baseline.normalized.values?.[name] ?? null;
    const head = result.primary.head.normalized.values?.[name] ?? null;
    const available = baseline !== null && head !== null && paired[name].length >= Math.max(20, bootstrap * 0.9);
    const range = available ? core.interval(paired[name]) : null;
    const decision = !available ? 'unavailable' : range.lower >= -0.5 && range.upper <= 0.5 ? 'agreement-at-resolution'
      : range.lower > 0.5 || range.upper < -0.5 ? 'context-dependent' : 'inconclusive';
    differences.byFeature[name] = { available, baseline, head, difference: baseline !== null && head !== null ? head - baseline : null,
      interval: range, decision, validReplicates: paired[name].length,
      reason: available ? null : 'requires-supported-cohort-values-and-stable-paired-refits' };
  }
  result.differences = differences;
  result.predictions = await predictions(dataset, prepared, predictionModels, groups, { validationFolds, bootstrap, seed, onProgress, signal });
  result.method = { anchors: { pawn: 1, queen: 9 }, bootstrap, seed, validationFolds, groupCount: groups.length,
    bootstrapUniverse: 'All completed-game position groups, including groups with no eligible samples in a cohort.',
    predictionTarget: 'Starting-position expected White score, converted to design A perspective by color.',
    cohorts: { baseline: 'ordinary + single-upgrade', head: 'head-to-head only', combined: 'all games' },
    noNativeValuesChanged: true, matchedOpponentContext: 'Cohort differences do not isolate a causal method effect.' };
  result.warnings = [
    'Pawn=1 and queen=9 are assumed; fitted ratios and ranges remain conditional on this book and playing policy.',
    'All games inform final combined values; out-of-fold starting predictions withhold complete position blocks.',
    'Different book positions may share broader opening ancestry. No universal material-price or equivalence claim follows.',
    'Head-to-head rank or coverage failures can prevent absolute bonus estimates despite useful relative comparisons.',
    'Starting predictions extrapolate the sampled later-game material model to the opening; position-specific tactics are not modeled.',
  ];
  return result;
}

module.exports = { analyzeReferenceDataset, foldOf };
