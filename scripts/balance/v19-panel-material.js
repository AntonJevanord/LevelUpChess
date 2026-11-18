'use strict';

// Offline outcome fitting for replacement-piece cells. Reserve grants remain
// in the actual rules profile, but grant-involved games never enter this fit.
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { exportDataset, DEFAULT_SAMPLING } = require('./material-dataset');
const { completedPairs } = require('./level3-panel-material');
const { analyzeDataset } = require('./material-regression');

const FAMILIES = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);
const ANCHORS = Object.freeze({ pawn: 1, queen: 9 });
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function selectBoardPairs(stages, profile) {
  const definitions = new Map(profile.registry.definitions.map(row => [row.id, row]));
  const sources = [], excluded = { grantDesignIds: [...definitions.values()].filter(row => row.placement === 'reserve').map(row => row.id),
    grantGames: 0, grantPairs: 0, grantGameIds: [], unfinishedGames: 0, truncatedGames: 0, unpairedGames: 0, duplicateAttempts: 0 };
  for (const stage of stages) {
    if (!stage || !stage.key || !isDeepStrictEqual(stage.profile, profile)) throw new Error('Material batches must share the exact original compiled profile.');
    const paired = completedPairs(stage);
    for (const key of ['unfinishedGames', 'truncatedGames', 'unpairedGames', 'duplicateAttempts']) excluded[key] += paired.excluded[key];
    const records = [];
    for (const record of paired.records) {
      if (record.engine?.nodes !== stage.nodes) throw new Error('Material batch node budget differs from its recorded search policy.');
      const ids = [record.designA, record.designB].filter(Boolean);
      if (ids.some(id => !definitions.has(id))) throw new Error('Material matchup contains an undeclared design.');
      const grant = ids.some(id => definitions.get(id).placement === 'reserve');
      if (grant) { excluded.grantGames++; excluded.grantGameIds.push(`${stage.key}:${record.id}`); continue; }
      for (const id of ids) {
        const definition = definitions.get(id);
        if (definition.placement !== 'replace' || !FAMILIES.includes(definition.family)) throw new Error('Material fitting supports nonroyal replacement pieces only.');
      }
      records.push(record);
    }
    if (records.length) sources.push({ id: stage.key, records, identity: stage.identity });
  }
  excluded.grantPairs = excluded.grantGames / 2;
  return { sources, excluded };
}

/** Direct whole-piece counts avoid adding marginal confidence endpoints.
 * Original family+bonus encoding counts a custom piece in both columns;
 * subtract its count from the ordinary family and fit its whole count instead.
 * This is a separately declared ridge parameterization, not the legacy fit. */
function wholePieceDataset(dataset, profile) {
  const definitions = new Map(profile.registry.definitions.map(row => [row.id, row]));
  const changes = dataset.featureNames.flatMap((name, index) => {
    if (!name.startsWith('bonus:')) return [];
    const id = name.slice(6), definition = definitions.get(id);
    if (!definition || definition.placement !== 'replace' || !FAMILIES.includes(definition.family)) throw new Error('Unexpected board-only material feature.');
    return [{ index, familyIndex: dataset.featureNames.indexOf(definition.family), id }];
  });
  return { ...dataset, format: 'levelup-v19-board-material-dataset',
    featureNames: dataset.featureNames.map(name => name.startsWith('bonus:') ? `piece:${name.slice(6)}` : name),
    samples: dataset.samples.map(row => {
      const x = [...row.x];
      for (const change of changes) x[change.familyIndex] -= row.x[change.index];
      return { ...row, x };
    }),
    encoding: { ordinary: 'Ordinary board pieces only, as White minus Black counts.',
      custom: 'Each nonroyal replacement design has its own whole-piece count; the original semantic IDs and letter allocations remain unchanged.',
      ridgeBasis: 'Whole-piece count parameterization; this is distinct from the legacy ordinary-family plus upgrade-bonus ridge model.' },
    limitations: dataset.limitations.map(note => note.startsWith('Ordinary family counts plus upgrade bonuses')
      ? 'Ordinary-only family and custom whole-piece counts are outcome-predictive model features, not intrinsic exchange prices or engine MG/EG parameters.' : note),
  };
}

async function analyzeBoardMaterial({ stages, profile, roster, openingGroups = {}, bootstrap = 100, seed = 42,
  onProgress, rulesFactory } = {}) {
  if (!Array.isArray(stages) || !profile || !Array.isArray(roster)) throw new Error('Supply original panel batches, profile and roster.');
  const selection = selectBoardPairs(stages, profile);
  const pieces = roster.filter(row => row.placement === 'replace' && FAMILIES.includes(row.family));
  const report = { schemaVersion: 1, format: 'levelup-v19-board-material-report',
    sourceProfileHash: profile.hash, sourceRegistryHash: profile.registryHash,
    method: { anchors: ANCHORS, bootstrap, seed, sampling: DEFAULT_SAMPLING,
      featureBasis: 'ordinary-only families plus custom whole-piece counts',
      grouping: 'Shared opening structural families; related cases within a family stay together.',
      reservePolicy: 'Exclude entire grant-involved matchups. Every retained replay state must have empty pockets and no reserve pieces or drops.',
      noEngineSearches: true, noEngineValuesChanged: true, noNewGames: true },
    exclusions: selection.excluded, roster: pieces.map(({ id, family, movement, label }) => ({ id, family, movement, label })),
    status: 'no-scored-board-pairs', coverage: null, analysis: null, estimates: null };
  if (!selection.sources.length) return { report, dataset: null };
  onProgress?.(`Replaying ${selection.sources.reduce((sum, source) => sum + source.records.length, 0)} scored board-piece games; ${selection.excluded.grantGames} grant games excluded.`);
  const raw = await exportDataset({ sources: selection.sources, profile, openingGroups, boardOnly: true, rulesFactory });
  const dataset = wholePieceDataset(raw, profile);
  onProgress?.(`Fitting ${dataset.samples.length} material-stable positions from ${dataset.coverage.sampledGames} games.`);
  const analysis = analyzeDataset(dataset, { anchors: ANCHORS, bootstrap, seed, validationFolds: 5, onProgress });
  const values = analysis.normalized.values;
  report.status = analysis.normalized.available ? 'conditional-estimates' : 'unsupported-estimates';
  report.coverage = dataset.coverage; report.analysis = analysis;
  report.estimates = {
    ordinary: FAMILIES.map(family => ({ family, value: ANCHORS[family] ?? values?.[family] ?? null,
      assumed: Object.hasOwn(ANCHORS, family), interval: Object.hasOwn(ANCHORS, family) || !values ? null : analysis.bootstrap.ratioIntervals[family] ?? null })),
    pieces: pieces.map(({ id, family, label, movement }) => {
      const total = values?.[`piece:${id}`] ?? null, ordinary = ANCHORS[family] ?? values?.[family] ?? null;
      return { id, family, label, movement, available: total !== null, total,
        bonus: total !== null && ordinary !== null ? total - ordinary : null,
        interval: total !== null ? analysis.bootstrap.ratioIntervals[`piece:${id}`] ?? null : null,
        reason: total !== null ? null : analysis.normalized.reason };
    }),
  };
  report.datasetSha256 = sha(dataset);
  return { report, dataset };
}

function renderMaterial(report) {
  const number = value => Number.isFinite(value) ? value.toFixed(2) : 'unavailable';
  const interval = value => Number.isFinite(value?.lower) && Number.isFinite(value?.upper) ? `${number(value.lower)}–${number(value.upper)}` : 'unavailable';
  const text = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const rows = ['# Version 19: conditional board-piece material estimates', '',
    '**Pawn = 1 and ordinary queen = 9 are assumptions.** These outcome-based values depend on the opening book, opponents and fixed engine policy; they are not engine search priors or universal exchange prices.', '',
    `Status: ${report.status}. ${report.exclusions.grantGames} complete grant games (${report.exclusions.grantPairs} color pairs) are excluded. Grant strength remains in the original outcome report.`, '',
    `${report.exclusions.truncatedGames} truncated, ${report.exclusions.unfinishedGames} unfinished and ${report.exclusions.unpairedGames} unpaired completed games contribute no fit weight.`, ''];
  if (report.analysis) {
    rows.push(`${report.coverage.completedGames} retained paired games; ${report.coverage.sampledGames} sampled games; ${report.coverage.accepted} material-stable positions; ${report.coverage.groups} structural opening families.`, '',
      `Effective rank ${report.analysis.rank.rank}/${report.analysis.rank.columns}; converged: ${report.analysis.fit.converged}; held-out Brier: ${number(report.analysis.validation.metrics?.brier)}.`, '',
      '| Ordinary piece | Value | Conditional 95% range |', '| --- | ---: | --- |',
      ...report.estimates.ordinary.map(row => `| ${row.family} | ${number(row.value)}${row.assumed ? ' (assumed)' : ''} | ${row.assumed ? 'fixed assumption' : interval(row.interval)} |`), '',
      '| Upgrade | Whole piece | Bonus over ordinary family | Whole-piece conditional 95% range |', '| --- | ---: | ---: | --- |',
      ...report.estimates.pieces.map(row => `| ${text(row.label || row.id)} | ${number(row.total)} | ${number(row.bonus)} | ${interval(row.interval)} |`), '',
      ...(report.analysis.normalized.available ? [] : [`Estimates are withheld: ${(report.analysis.normalized.reasons || []).join(', ')}. More games are not automatically a remedy for deficient rank, coverage or model fit.`, '']));
  }
  rows.push('Custom values are fitted directly from whole-piece counts, with ordinary pieces counted separately. This ridge parameterization differs from the legacy family-plus-bonus fit. Whole-piece ranges come from the corresponding coefficient refits; no interval for the subtracted bonus is inferred from separate endpoints.', '',
    'Each sampled game has unit total fitting weight. Entire structural opening families stay together during validation and resampling. Material-stable windows do not prove tactical quietness. Same-tier head-to-head data can support conditional estimates but do not replace mixed-army/cross-level validation.', '',
    'No original game, runtime, profile, purchase cost or search value was changed. No engines or new games were started. Reserve/pocket values require a separate pocket-aware model; royal kings are not assigned a material price.', '');
  return rows.join('\n');
}

module.exports = { ANCHORS, FAMILIES, selectBoardPairs, wholePieceDataset, analyzeBoardMaterial, renderMaterial };
