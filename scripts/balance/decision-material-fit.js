'use strict';

// A single-cohort, offline fit. Historical estimates retain their own contexts.
const core = require('./reference-regression');
const { supportedColumns, foldOf } = require('./bishop-analysis');
const { getOfficialReferences } = require('./official-references');
const ANCHORS = Object.freeze({ pawn: 1, queen: 9 });
const ORDINARY = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const pause = () => new Promise(resolve => setImmediate(resolve));
function aborted(signal) {
  if (signal?.aborted) {
    const error = new Error('Decision material analysis cancelled; saved games are unchanged.');
    error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
  }
}
async function yieldAnalysis(signal) { await pause(); aborted(signal); }

function checkCohort(dataset) {
  if (!dataset || !Array.isArray(dataset.games) || !dataset.games.length
    || !Array.isArray(dataset.featureNames) || ORDINARY.some(name => !dataset.featureNames.includes(name))
    || !dataset.featureNames.includes('tempo')) throw new Error('A decision material cohort needs ordinary material, tempo and completed head-to-head games.');
  const pairs = new Map();
  for (const game of dataset.games) {
    if (game.kind !== 'head' || typeof game.designA !== 'string' || !game.designA
      || typeof game.designB !== 'string' || !game.designB || game.designA === game.designB
      || !dataset.featureNames.includes(`bonus:${game.designA}`) || !dataset.featureNames.includes(`bonus:${game.designB}`)
      || !['w', 'b'].includes(game.aColor) || typeof game.comparisonId !== 'string' || !game.comparisonId) {
      throw new Error('Use only the new head-to-head cohort with intact design and color-pair identities.');
    }
    const pair = pairs.get(game.pairId) || []; pair.push(game); pairs.set(game.pairId, pair);
  }
  for (const pair of pairs.values()) {
    if (pair.length !== 2 || new Set(pair.map(game => game.aColor)).size !== 2
      || ['groupId', 'comparisonId', 'designA', 'designB'].some(key => pair[0][key] !== pair[1][key])) {
      throw new Error('Decision material analysis requires complete matching color pairs.');
    }
  }
}

async function validation(rows, names, groups, folds, signal, onProgress) {
  const occupied = core.unique(groups.map(group => foldOf(group, folds))).sort((a, b) => a - b);
  const result = { available: false, reason: null, unit: 'whole-selected-position-block',
    strategy: 'sha256-group-id-modulo', requestedFolds: folds, occupiedFolds: occupied.length,
    folds: [], metrics: null, baselineMetrics: null };
  if (occupied.length < 2) { result.reason = 'requires-at-least-two-occupied-folds'; return result; }
  const predicted = [], baseline = [];
  for (const fold of occupied) {
    await yieldAnalysis(signal);
    const testGroups = groups.filter(group => foldOf(group, folds) === fold), testSet = new Set(testGroups);
    const train = rows.filter(row => !testSet.has(row.groupId)), test = rows.filter(row => testSet.has(row.groupId));
    const model = core.fit(train, names, ANCHORS), rank = core.modelRank(train, names, ANCHORS);
    const supported = model.converged && rank.fullRank && model.coefficients.pawn > 1e-6 && !core.separates(train, names, model);
    const mean = train.reduce((sum, row) => sum + row.y * row.weight, 0) / core.sumWeight(train);
    const predict = core.prediction(model, names);
    result.folds.push({ fold, trainingGroups: groups.filter(group => !testSet.has(group)), testGroups,
      trainingGames: core.unique(train.map(row => row.gameId)).length, testGames: core.unique(test.map(row => row.gameId)).length,
      converged: model.converged, fullRank: rank.fullRank, supported,
      metrics: supported ? core.metrics(test, predict) : { brier: null, logLoss: null },
      baselineMetrics: Number.isFinite(mean) ? core.metrics(test, () => mean) : { brier: null, logLoss: null } });
    if (supported) for (const row of test) { predicted.push({ ...row, probability: predict(row) }); baseline.push({ ...row, probability: mean }); }
    onProgress?.({ phase: 'validation', completed: result.folds.length, total: occupied.length });
  }
  result.available = result.folds.every(fold => fold.supported);
  result.reason = result.available ? null : 'some-training-folds-unsupported';
  if (result.available) {
    result.metrics = core.metrics(predicted, row => row.probability);
    result.baselineMetrics = core.metrics(baseline, row => row.probability);
  }
  return result;
}

async function analyzeDecisionMaterial(dataset, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['bootstrap', 'seed', 'validationFolds', 'onProgress', 'signal'].includes(key))) throw new Error('Unknown decision material analysis option.');
  const { bootstrap = 200, seed = 42, validationFolds = 5, onProgress, signal } = options;
  aborted(signal); checkCohort(dataset);
  const support = supportedColumns(dataset), projected = support.dataset;
  const prepared = core.prepare(projected, { bootstrap, seed, validationFolds, anchors: ANCHORS, onProgress });
  const { rows, names } = prepared, groups = core.unique(dataset.games.map(game => game.groupId));
  const roster = getOfficialReferences().roster;
  const byGroup = new Map(groups.map(group => [group, rows.filter(row => row.groupId === group)]));
  const coefficients = Object.fromEntries(names.map(name => [name, []]));
  const ratios = Object.fromEntries(names.map(name => [name, []]));
  const whole = Object.fromEntries(roster.map(reference => [reference.id, []]));
  const band = { available: false, reason: null, requested: bootstrap, completed: 0, seed, confidence: 0.95,
    groupUnit: 'whole-selected-position-block', minimumGroups: 4, groupCount: groups.length,
    rankDeficient: 0, nonconverged: 0, pawnNonpositive: 0, possibleSeparation: 0, validRatios: 0,
    pawnCoefficient: { lower: null, upper: null }, coefficientIntervals: {}, ratioIntervals: {}, fixedRatios: { ...ANCHORS },
    interpretation: 'Conditional opening-block percentile ranges; failed fits are counted, and all games in each selected opening share one multiplicity.' };
  if (bootstrap && groups.length >= 4) {
    const random = core.randomSource(seed);
    onProgress?.({ phase: 'bootstrap', completed: 0, total: bootstrap });
    for (let replicate = 0; replicate < bootstrap; replicate++) {
      aborted(signal);
      const draws = new Map();
      for (let index = 0; index < groups.length; index++) {
        const group = groups[Math.floor(random() * groups.length)]; draws.set(group, (draws.get(group) || 0) + 1);
      }
      const sampled = [...draws].flatMap(([group, count]) => byGroup.get(group).map(row => ({ ...row, weight: row.weight * count })));
      const model = core.fit(sampled, names, ANCHORS), rank = core.modelRank(sampled, names, ANCHORS);
      band.completed++;
      if (!model.converged) band[model.reason === 'anchor-scale-not-positive' ? 'pawnNonpositive' : 'nonconverged']++;
      else if (!rank.fullRank) band.rankDeficient++;
      else {
        for (const name of names) coefficients[name].push(model.coefficients[name]);
        if (core.separates(sampled, names, model)) band.possibleSeparation++;
        else if (!(model.coefficients.pawn > 1e-6)) band.pawnNonpositive++;
        else {
          band.validRatios++;
          const values = Object.fromEntries(names.map(name => [name, name === 'pawn' ? 1 : name === 'queen' ? 9 : model.coefficients[name] / model.coefficients.pawn]));
          for (const name of names) ratios[name].push(values[name]);
          for (const reference of roster) if (Number.isFinite(values[`bonus:${reference.id}`])) whole[reference.id].push(values[reference.family] + values[`bonus:${reference.id}`]);
        }
      }
      if ((replicate + 1) % 5 === 0 || replicate + 1 === bootstrap) {
        onProgress?.({ phase: 'bootstrap', completed: replicate + 1, total: bootstrap }); await yieldAnalysis(signal);
      }
    }
  }
  band.available = coefficients[names[0]].length > 0;
  band.reason = band.available ? null : !bootstrap ? 'disabled' : groups.length < 4 ? 'requires-at-least-four-groups' : 'no-full-rank-converged-resamples';
  band.coefficientIntervals = Object.fromEntries(names.map(name => [name, core.interval(coefficients[name])]));
  band.ratioIntervals = Object.fromEntries(names.map(name => [name, core.interval(ratios[name])]));
  band.pawnCoefficient = band.coefficientIntervals.pawn;
  const heldOut = await validation(rows, names, groups, validationFolds, signal, onProgress);
  aborted(signal);
  const analysis = core.analyzeDataset(projected, { bootstrap, seed, validationFolds, anchors: ANCHORS }, band, heldOut);
  analysis.method.bootstrapUnit = 'whole selected-position block';
  analysis.omittedFeatures = support.omittedFeatures;
  analysis.coverage.allGameGroups = groups.length;
  analysis.coverage.zeroSampleGroups = groups.filter(group => !byGroup.get(group).length);
  const values = analysis.normalized.values;
  const estimate = name => ({ value: values?.[name] ?? null,
    interval: values && !Object.hasOwn(ANCHORS, name) ? band.ratioIntervals[name] : null,
    assumed: Object.hasOwn(ANCHORS, name), available: Boolean(values && Object.hasOwn(values, name)) });
  const wholePieces = roster.map(reference => {
    const bonusName = `bonus:${reference.id}`, observed = names.includes(bonusName);
    const available = Boolean(values && observed && whole[reference.id].length >= Math.max(20, bootstrap * 0.9));
    return { id: reference.id, name: reference.name, family: reference.family, available,
      reason: available ? null : !observed ? 'reference-not-observed' : analysis.normalized.reason || 'insufficient-stable-joint-resamples',
      ordinary: values?.[reference.family] ?? null, bonus: values?.[bonusName] ?? null,
      value: available ? values[reference.family] + values[bonusName] : null,
      interval: available ? core.interval(whole[reference.id]) : null,
      validReplicates: whole[reference.id].length };
  });
  return { schemaVersion: 1, format: 'levelup-decision-material-analysis',
    method: { cohort: 'new-comparison-games-only', anchors: { ...ANCHORS }, bootstrap, seed, validationFolds,
      groups, groupCount: groups.length, bootstrapUniverse: 'All completed-game opening groups, including groups without eligible sampled positions.',
      wholePieceIntervals: 'Add ordinary family and upgrade bonus within each same normalized bootstrap refit, then take percentiles.',
      featureSelection: 'Omit only structurally unobserved bonus columns; keep all ordinary and observed bonus columns.',
      historicalPooling: false, noNativeValuesChanged: true },
    omittedFeatures: support.omittedFeatures, analysis,
    estimates: { ordinary: Object.fromEntries(ORDINARY.map(name => [name, estimate(name)])),
      bonuses: Object.fromEntries(names.filter(name => name.startsWith('bonus:')).map(name => [name.slice(6), estimate(name)])),
      tempo: estimate('tempo') },
    wholePieces,
    warnings: ['These outcome-fitted values condition on the selected opening positions and recorded engine/evaluation policy; they are not intrinsic piece prices.',
      'The cohort has no ordinary/single-upgrade controls. Previous material fits remain separate; do not add their ordinary values to these bonuses.',
      'Pawn=1 and queen=9 are assumptions. Whole-piece uncertainty uses joint refits, not sums of marginal interval endpoints.',
      ...(!heldOut.available ? ['Grouped held-out prediction is unsupported; inspect its fold-level rank and fit failures.'] : []),
      ...analysis.warnings] };
}

module.exports = { analyzeDecisionMaterial };
