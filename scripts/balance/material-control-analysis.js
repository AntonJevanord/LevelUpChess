'use strict';

// Predeclared offline checks on equal-army controls. No engine or game creation.
const { analyzeDataset } = require('./material-regression');
const { isDeepStrictEqual } = require('node:util');

const ORDINARY_FEATURES = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo']);
const AMAZON = 'bonus:queen.purple@1';
const UNUSED = Object.freeze(['bonus:rook.purple@3', 'bonus:rook.purple@4', 'bonus:rook.purple@5']);
const COMPARISONS = Object.freeze(['standard-control', 'amazon-control']);
const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const fail = message => { throw new Error(message); };

function prepareControls(dataset, historyKeys) {
  if (!dataset || !Array.isArray(dataset.featureNames) || !Array.isArray(dataset.samples) || !Array.isArray(dataset.games)
    || new Set(dataset.featureNames).size !== dataset.featureNames.length
    || ORDINARY_FEATURES.some(name => !dataset.featureNames.includes(name))) fail('Control analysis needs all ordinary material features, samples and games.');
  const allowed = new Set([...ORDINARY_FEATURES, AMAZON, ...UNUSED]);
  if (dataset.featureNames.some(name => !allowed.has(name))) fail('Unsupported control-analysis feature.');
  if (!historyKeys || typeof historyKeys !== 'object' || Array.isArray(historyKeys)) fail('Verified full-history keys are required for every control game.');
  const games = new Map(), rows = new Map(), totals = new Map();
  for (const game of dataset.games) {
    if (!game || typeof game.gameId !== 'string' || !game.gameId || games.has(game.gameId)
      || !COMPARISONS.includes(game.comparisonId) || !Object.hasOwn(SCORES, game.result)
      || typeof game.groupId !== 'string' || !game.groupId || typeof game.pairId !== 'string' || !game.pairId
      || !Number.isSafeInteger(game.samples) || game.samples < 0) fail('Malformed or non-control game in material analysis.');
    if (!Object.hasOwn(historyKeys, game.gameId) || !/^[a-f0-9]{64}$/.test(historyKeys[game.gameId])) fail('Missing verified full-history key for a control game.');
    games.set(game.gameId, game); rows.set(game.gameId, []); totals.set(game.gameId, 0);
  }
  if (Object.keys(historyKeys).length !== games.size) fail('History keys must cover exactly the selected control games.');
  for (const sample of dataset.samples) {
    const game = games.get(sample.gameId);
    if (!game || !Array.isArray(sample.x) || sample.x.length !== dataset.featureNames.length
      || sample.x.some(value => !Number.isFinite(value)) || sample.y !== SCORES[game.result]
      || !Number.isFinite(sample.weight) || sample.weight <= 0 || sample.pairId !== game.pairId
      || sample.groupId !== game.groupId || !['middlegame', 'endgame'].includes(sample.phase)) fail('Malformed control sample, label or grouping.');
    rows.get(game.gameId).push(sample); totals.set(game.gameId, totals.get(game.gameId) + sample.weight);
  }
  for (const game of games.values()) if (rows.get(game.gameId).length !== game.samples
    || game.samples && Math.abs(totals.get(game.gameId) - 1) > 1e-8) fail('Control game sample counts and unit weights must match.');
  const unusedIndices = UNUSED.map(name => dataset.featureNames.indexOf(name)).filter(index => index >= 0);
  if (dataset.samples.some(sample => unusedIndices.some(index => sample.x[index] !== 0))) fail('Control data contains an active Blink upgrade; unused custom features cannot be dropped.');
  const amazonIndex = dataset.featureNames.indexOf(AMAZON);
  if (dataset.samples.some(sample => games.get(sample.gameId).comparisonId === 'standard-control'
    && amazonIndex >= 0 && sample.x[amazonIndex] !== 0)) fail('Ordinary control data contains an Amazon upgrade imbalance.');
  if (dataset.games.some(game => game.comparisonId === 'amazon-control') && amazonIndex < 0) fail('Amazon controls require their explicit upgrade feature, even when unidentifiable.');

  const histories = new Map();
  const representation = samples => samples.map(sample => ({ x: sample.x, y: sample.y, phase: sample.phase, ply: sample.ply, fen: sample.fen }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  for (const game of [...games.values()].sort((a, b) => a.gameId.localeCompare(b.gameId))) {
    const key = historyKeys[game.gameId], existing = histories.get(key);
    if (existing) {
      const retained = games.get(existing.retainedGameId);
      if (retained.comparisonId !== game.comparisonId || retained.result !== game.result || retained.groupId !== game.groupId
        || !isDeepStrictEqual(representation(rows.get(retained.gameId)), representation(rows.get(game.gameId)))) fail('Duplicate history keys disagree on cohort, labels, grouping or replayed samples.');
      existing.recordGameIds.push(game.gameId);
    } else histories.set(key, { historyKey: key, retainedGameId: game.gameId, recordGameIds: [game.gameId] });
  }
  const retained = new Set([...histories.values()].map(item => item.retainedGameId));
  return {
    dataset: { ...dataset, games: dataset.games.filter(game => retained.has(game.gameId)).map(game => ({ ...game })),
      samples: dataset.samples.filter(sample => retained.has(sample.gameId)).map(sample => ({ ...sample, x: [...sample.x] })),
      limitations: [...(dataset.limitations || []), 'Identical full recorded histories are counted once; original A/B labels do not create independent observations.'] },
    deduplication: { inputRecords: dataset.games.length, uniqueHistories: histories.size,
      duplicatedRecords: dataset.games.length - histories.size, inputSamples: dataset.samples.length,
      uniqueSamples: dataset.samples.filter(sample => retained.has(sample.gameId)).length,
      keyDefinition: 'Verified SHA-256 of full starting FEN, moves, result, reason and final FEN; never inferred from sparse samples.',
      histories: [...histories.values()] },
  };
}

function projectControls(dataset, { comparisonIds, phase = null, featureNames }) {
  const selected = dataset.games.filter(game => comparisonIds.includes(game.comparisonId)), ids = new Set(selected.map(game => game.gameId));
  const byGame = new Map(selected.map(game => [game.gameId, []]));
  for (const sample of dataset.samples) if (ids.has(sample.gameId) && (!phase || sample.phase === phase)) byGame.get(sample.gameId).push(sample);
  const indices = featureNames.map(name => dataset.featureNames.indexOf(name));
  if (indices.some(index => index < 0)) fail('A required control feature is missing.');
  const games = [], samples = [];
  for (const game of selected) {
    const accepted = byGame.get(game.gameId);
    if (!accepted.length) continue;
    games.push({ ...game, samples: accepted.length });
    for (const sample of accepted) samples.push({ ...sample, x: indices.map(index => sample.x[index]), weight: 1 / accepted.length });
  }
  return { dataset: { ...dataset, featureNames: [...featureNames], games, samples },
    selection: { comparisonIds: [...comparisonIds], phase, inputUniqueGames: selected.length, sampledGames: games.length,
      gamesWithoutSamples: selected.length - games.length, samples: samples.length,
      droppedZeroFeatures: dataset.featureNames.filter(name => !featureNames.includes(name)),
      weighting: 'Each retained history has unit total sample weight, recomputed after phase selection.' } };
}

function arithmeticRatios(analysis) {
  const { fit, rank } = analysis, pawn = fit.coefficients.pawn;
  const reason = !rank.fullRank ? 'rank-deficient-design' : !fit.converged ? 'fit-not-converged'
    : fit.possibleSeparation ? 'possible-outcome-separation' : !(pawn > 1e-6) ? 'pawn-coefficient-not-positive' : null;
  return { available: !reason, reason, calibrated: false,
    interpretation: 'Raw fitted-slope arithmetic for ordinary-material sanity checks; not a released material-price table.',
    values: reason ? null : Object.fromEntries(ORDINARY_FEATURES.map(name => [name, fit.coefficients[name] / pawn])),
    queenMinusRook: reason ? null : (fit.coefficients.queen - fit.coefficients.rook) / pawn };
}

function inspectBonus(analysis) {
  const support = analysis.coverage.features.find(feature => feature.name === AMAZON);
  let reason = !support ? 'not-modelled-ordinary-only' : !support.nonzeroGames ? 'unidentifiable-zero-upgrade-imbalance'
    : !analysis.rank.fullRank ? 'rank-deficient-design' : !analysis.fit.converged ? 'fit-not-converged'
      : analysis.fit.possibleSeparation ? 'possible-outcome-separation'
        : !(analysis.fit.coefficients.pawn > 1e-6) ? 'pawn-coefficient-not-positive' : null;
  return { available: !reason, reason, calibrated: false, nonzeroGames: support?.nonzeroGames || 0,
    supportGroups: support?.groupsWithNonzero || 0,
    rawCoefficient: reason ? null : analysis.fit.coefficients[AMAZON],
    rawPawnRatio: reason ? null : analysis.fit.coefficients[AMAZON] / analysis.fit.coefficients.pawn,
    interpretation: 'No observed upgrade imbalance means no information about its bonus; a ridge coefficient of zero is not zero piece strength.' };
}

function analyzeControls(input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['bootstrap', 'seed', 'historyKeys'].includes(key))) fail('Unsupported control-analysis options.');
  const bootstrap = options.bootstrap ?? 200, seed = options.seed ?? 42;
  if (!Number.isSafeInteger(bootstrap) || bootstrap < 0 || bootstrap > 1000
    || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) fail('Use bootstrap 0–1000 and an unsigned 32-bit seed.');
  const { dataset, deduplication } = prepareControls(input, options.historyKeys);
  const definitions = [
    { id: 'ordinary', comparisonIds: ['standard-control'], featureNames: ORDINARY_FEATURES, bootstrap },
    { id: 'combined', comparisonIds: COMPARISONS, featureNames: [...ORDINARY_FEATURES, AMAZON], bootstrap },
    { id: 'middlegame', comparisonIds: ['standard-control'], phase: 'middlegame', featureNames: ORDINARY_FEATURES, bootstrap: 0 },
    { id: 'endgame', comparisonIds: ['standard-control'], phase: 'endgame', featureNames: ORDINARY_FEATURES, bootstrap: 0 },
  ];
  const analyses = Object.fromEntries(definitions.map(definition => {
    const projected = projectControls(dataset, definition);
    const analysis = analyzeDataset(projected.dataset, { bootstrap: definition.bootstrap, seed });
    return [definition.id, { id: definition.id, featureNames: [...definition.featureNames], selection: projected.selection,
      analysis, ordinaryRatios: arithmeticRatios(analysis), amazonBonus: inspectBonus(analysis) }];
  }));
  return { schemaVersion: 1, format: 'levelup-material-controls-diagnostic',
    method: { primaryFits: ['ordinary', 'combined'], phaseFits: ['middlegame', 'endgame'],
      phaseCohort: 'standard-control', phaseBootstrap: 0,
      phaseInterpretation: 'Predeclared sensitivity check using the same ordinary histories; no phase-specific resampling or parameter tuning.',
      sourcePoliciesPooled: false, engineGamesStarted: 0 },
    selection: deduplication, analyses,
    phaseSensitivity: { cohort: 'standard-control', bootstrap: 0,
      middlegame: analyses.middlegame.ordinaryRatios, endgame: analyses.endgame.ordinaryRatios },
    decision: { status: 'diagnostic-only', ordinaryBaselineIdentified: analyses.ordinary.ordinaryRatios.available,
      ordinaryMaterialTableSupported: analyses.ordinary.analysis.normalized.available,
      amazonBonusStatus: analyses.combined.amazonBonus.available ? 'exploratory-only' : 'unavailable',
      amazonBonusReason: analyses.combined.amazonBonus.reason,
      interpretation: 'Ordinary baseline checks precede any Amazon price interpretation; fixed reference targets are not used to tune the fit. No new game batch follows automatically.' },
    warnings: [
      'Twenty ordinary and twenty Amazon histories, when present, are still a small fixed cohort; deduplication does not create representative sampling.',
      'Phase fits reuse these histories and are dependent sensitivity checks, not independent confirmations.',
      'Inactive Blink columns are omitted only after verifying their observed counts are zero. An absent Amazon imbalance is retained and reported as unidentifiable.',
      'Full numerical rank and accurate outcome prediction do not establish transferable material values.' ] };
}

module.exports = { analyzeControls, prepareControls, projectControls };
