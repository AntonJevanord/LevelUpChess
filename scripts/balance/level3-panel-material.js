'use strict';

// Offline replay and outcome fitting for the expandable level-three panel.
// Existing collectors, estimators, evaluation tables and run identities stay intact.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { exportDataset, decodeMaterial, DEFAULT_SAMPLING } = require('./material-dataset');
const { analyzeReferenceDataset } = require('./reference-analysis');
const core = require('./reference-regression');

const FAMILIES = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const ANCHORS = Object.freeze({ pawn: 1, queen: 9 });
const SCORES = new Set(['1-0', '0-1', '1/2-1/2']);
const FINAL = new Set(['completed', 'truncated']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function aborted(signal) {
  if (signal?.aborted) { const error = new Error('Level-three material analysis cancelled; raw games are unchanged.'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error; }
}
async function pause(signal) { await new Promise(resolve => setImmediate(resolve)); aborted(signal); }
const cohortKind = kind => kind === 'baseline' ? 'single' : kind;

/** Select the highest valid attempt, independent of copied journal order. */
function completedPairs(stage) {
  if (!Array.isArray(stage.records)) throw new Error('A material stage needs its original game records.');
  const comparisons = new Map((stage.comparisons || []).map(row => [row.id, row]));
  if (comparisons.size !== (stage.comparisons || []).length) throw new Error('Repeated material comparison metadata.');
  const byId = new Map(), excluded = { duplicateAttempts: 0, unfinishedGames: 0, truncatedGames: 0, unpairedGames: 0 };
  for (const record of stage.records) {
    if (!record || typeof record.id !== 'string' || !record.id || !Number.isSafeInteger(record.attempt) || record.attempt < 1
      || !['completed', 'truncated', 'aborted', 'error'].includes(record.status)
      || (record.status === 'completed' ? !SCORES.has(record.result) : record.result !== '*')) throw new Error('Malformed material journal attempt.');
    const attempts = byId.get(record.id) || new Map(), prior = attempts.get(record.attempt);
    if (prior) {
      if (!isDeepStrictEqual(prior, record)) throw new Error(`Conflicting copied material attempt: ${record.id}.`);
      excluded.duplicateAttempts++; continue;
    }
    attempts.set(record.attempt, record); byId.set(record.id, attempts);
  }
  const pairs = new Map();
  for (const attempts of byId.values()) {
    const ordered = [...attempts.values()].sort((a, b) => a.attempt - b.attempt);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1], record = ordered[index];
      if (FINAL.has(previous.status) || ['id', 'pairId', 'comparisonId', 'openingId', 'aColor', 'startFen'].some(key => previous[key] !== record[key])
        || !Array.isArray(previous.moves) || !Array.isArray(record.moves)
        || previous.moves.some((move, ply) => record.moves[ply] !== move)) throw new Error(`Material retry changes a finalized game or its history: ${record.id}.`);
    }
    const record = ordered.at(-1);
    if (record.status === 'truncated') { excluded.truncatedGames++; continue; }
    if (record.status !== 'completed') { excluded.unfinishedGames++; continue; }
    const metadata = comparisons.get(record.comparisonId);
    if (comparisons.size && !metadata) throw new Error(`Unknown material comparison: ${record.comparisonId}.`);
    const kind = cohortKind(metadata?.kind ?? record.kind), designA = metadata?.designA ?? record.designA;
    const designB = metadata && Object.hasOwn(metadata, 'designB') ? metadata.designB : record.designB ?? null;
    if (!['head', 'single'].includes(kind) || typeof designA !== 'string' || !designA
      || (kind === 'head' ? typeof designB !== 'string' || !designB || designA === designB : designB !== null)
      || !['w', 'b'].includes(record.aColor) || typeof record.pairId !== 'string' || !record.pairId) throw new Error('Material comparison needs a single purchase or two distinct head-to-head purchases.');
    if (record.kind !== undefined && cohortKind(record.kind) !== kind
      || record.designA !== undefined && record.designA !== designA
      || record.designB !== undefined && (record.designB ?? null) !== designB) throw new Error('Material comparison metadata conflicts with its journal.');
    const enriched = { ...record, kind, designA, designB,
      whiteDesign: record.aColor === 'w' ? designA : designB,
      blackDesign: record.aColor === 'b' ? designA : designB };
    for (const key of ['whiteDesign', 'blackDesign']) if (record[key] !== undefined && record[key] !== enriched[key]) throw new Error('Material journal changes its purchased color.');
    const pair = pairs.get(record.pairId) || []; pair.push(enriched); pairs.set(record.pairId, pair);
  }
  const selected = [];
  for (const pair of pairs.values()) {
    if (pair.length !== 2) { excluded.unpairedGames += pair.length; continue; }
    if (new Set(pair.map(record => record.aColor)).size !== 2
      || ['comparisonId', 'openingId', 'kind', 'designA', 'designB'].some(key => pair[0][key] !== pair[1][key])) throw new Error('Conflicting material color-pair identity.');
    selected.push(...pair);
  }
  return { records: selected, excluded };
}

function validateRoster(roster) {
  if (!Array.isArray(roster) || roster.length < 2 || new Set(roster.map(row => row.id)).size !== roster.length
    || roster.some(row => typeof row.id !== 'string' || !row.id || !FAMILIES.includes(row.family))) throw new Error('Declare distinct nonroyal replacement pieces for material fitting.');
  return roster.map(row => ({ id: row.id, family: row.family, name: row.name || row.label || row.id, movement: row.movement }));
}

async function extractStage(stage, roster, { rulesFactory, signal, onProgress }) {
  aborted(signal);
  if (typeof stage.key !== 'string' || !stage.key || !Number.isSafeInteger(stage.nodes) || stage.nodes < 1 || !stage.profile) throw new Error('Each material stage needs a unique key, node budget and original compiled profile.');
  const ids = new Set(roster.map(row => row.id));
  if (stage.profile.registry?.definitions.length !== ids.size || stage.profile.registry.definitions.some(row => !ids.has(row.id))) throw new Error('Material stage must retain the complete declared roster profile.');
  for (const row of roster) {
    const definition = stage.profile.registry.definitions.find(definition => definition.id === row.id);
    if (definition.family !== row.family || definition.placement !== 'replace' || row.movement && definition.movement !== row.movement) throw new Error(`Material roster definition changed: ${row.id}.`);
  }
  const selected = completedPairs(stage);
  for (const record of selected.records) {
    if (record.engine?.nodes !== stage.nodes) throw new Error('Material stage node budget differs from its recorded search policy.');
    for (const id of [record.designA, record.designB].filter(Boolean)) if (!ids.has(id)) throw new Error('Material journal contains a purchase outside the declared roster.');
  }
  const provenance = { key: stage.key, nodes: stage.nodes, manifestSha256: stage.manifest ? hash(stage.manifest) : null,
    manifestHashFormat: 'SHA-256 of JSON.stringify(parsed manifest), not original bytes',
    engineSha256: stage.manifest?.engineSha256 ?? stage.identity?.engineSha256 ?? null,
    runnerSha256: stage.manifest?.runnerSha256 ?? stage.identity?.runnerSha256 ?? null,
    rulesBundleSha256: stage.manifest?.rulesBundleSha256 ?? stage.identity?.rulesBundleSha256 ?? null,
    profileHash: stage.profile.hash, registryHash: stage.profile.registryHash,
    recordsSha256: hash(stage.records), selectedRecordsSha256: hash(selected.records),
    excluded: selected.excluded, selectedGames: selected.records.length };
  if (!selected.records.length) return { provenance, dataset: null };
  onProgress?.(`Replaying ${stage.key}: ${selected.records.length} scored paired games at ${stage.nodes} nodes.`);
  const identity = { ...stage.identity, sourceContext: stage.key, engineSha256: provenance.engineSha256,
    profileHash: stage.profile.hash, registryHash: stage.profile.registryHash };
  // Legacy export is intentionally synchronous during replay. Bound each call
  // to sixteen whole color pairs, then return to the event loop so Ctrl+C and
  // progress updates remain responsive without changing the frozen exporter.
  const rules = await (rulesFactory
    ? rulesFactory({ profile: stage.profile, stage })
    : require('../../dist/balance-rules.cjs').createMatchRules({ profile: stage.profile }));
  const chunkSize = 32;
  let dataset;
  const addCoverage = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'number') target[key] += value;
      else addCoverage(target[key], value);
    }
  };
  for (let offset = 0; offset < selected.records.length; offset += chunkSize) {
    aborted(signal);
    const records = selected.records.slice(offset, offset + chunkSize);
    const chunk = await exportDataset({ sources: [{ id: stage.key, records, identity }],
      profile: stage.profile, sampling: DEFAULT_SAMPLING, openingGroups: stage.openingGroups || {},
      rulesFactory: async () => rules });
    if (!dataset) dataset = chunk;
    else {
      if (!isDeepStrictEqual(dataset.recordedPolicy, chunk.recordedPolicy)
        || !isDeepStrictEqual(dataset.featureNames, chunk.featureNames)) throw new Error('Material stage changes its search, evaluation or feature policy between replay chunks.');
      dataset.games.push(...chunk.games); dataset.samples.push(...chunk.samples);
      addCoverage(dataset.coverage, chunk.coverage);
    }
    onProgress?.(`Replayed ${stage.key}: ${Math.min(offset + records.length, selected.records.length)}/${selected.records.length} scored games.`);
    await pause(signal);
  }
  dataset.sources = [{ ...dataset.sources[0], recordsSha256: hash(selected.records), games: selected.records.length }];
  dataset.coverage.groups = new Set(dataset.games.filter(game => game.samples).map(game => game.groupId)).size;
  aborted(signal);
  const lookup = new Map(selected.records.map(record => [record.id, record]));
  dataset.games = dataset.games.map(game => {
    const record = lookup.get(game.recordId);
    return { ...game, kind: record.kind, designA: record.designA, designB: record.designB,
      whiteDesign: record.whiteDesign, blackDesign: record.blackDesign,
      startX: decodeMaterial(record.startFen, stage.profile).x, sourceContext: stage.key,
      historySha256: hash({ startFen: record.startFen, moves: record.moves,
        result: record.result, reason: record.reason, finalFen: record.finalFen }) };
  });
  return { provenance, dataset };
}

function poolStages(extracted, roster) {
  const usable = extracted.filter(stage => stage.dataset);
  if (!usable.length) return null;
  const first = usable[0], featureNames = first.dataset.featureNames;
  for (const stage of usable.slice(1)) {
    if (['profileHash', 'engineSha256', 'runnerSha256', 'rulesBundleSha256'].some(key => stage.provenance[key] !== first.provenance[key])
      || !isDeepStrictEqual(stage.dataset.recordedPolicy, first.dataset.recordedPolicy)
      || !isDeepStrictEqual(stage.dataset.featureNames, featureNames)) throw new Error('Cannot pool different node, engine, evaluation or profile policies into one material fit.');
  }
  const inputGames = usable.flatMap(stage => stage.dataset.games);
  if (new Set(inputGames.map(game => game.gameId)).size !== inputGames.length) throw new Error('Repeated material source game identity.');
  const pairs = new Map();
  for (const game of inputGames) { const pair = pairs.get(game.pairId) || []; pair.push(game); pairs.set(game.pairId, pair); }
  const seenHistories = new Set(), games = [];
  let duplicateHistoryPairs = 0;
  for (const pair of pairs.values()) {
    if (pair.some(game => seenHistories.has(game.historySha256))) { duplicateHistoryPairs++; continue; }
    for (const game of pair) seenHistories.add(game.historySha256);
    games.push(...pair);
  }
  const retained = new Set(games.map(game => game.gameId));
  const samples = usable.flatMap(stage => stage.dataset.samples.filter(sample => retained.has(sample.gameId)));
  return { schemaVersion: 1, format: 'levelup-level3-panel-material-dataset', featureNames,
    sampling: DEFAULT_SAMPLING, roster, games, samples,
    sources: usable.flatMap(stage => stage.dataset.sources), duplicateHistoryPairs,
    limitations: ['Node budgets are analyzed separately. Equal-budget batches retain original source contexts and share opening groups.',
      'Completed, scored color pairs only; unfinished games and truncated partners contribute no fit weight.',
      'Pawn=1 and queen=9 are assumptions; fitted bonuses and totals are conditional outcome associations, not engine values.',
      'Stable material windows do not establish tactical quietness. Different openings may share broader ancestry.',
      ...(duplicateHistoryPairs ? [`${duplicateHistoryPairs} copied-history color pairs were excluded as whole pairs, preserving paired outcomes without adding duplicate fitting weight.`] : []),
      ...(['engineSha256', 'runnerSha256', 'rulesBundleSha256'].every(key => first.provenance[key]) ? []
        : ['Original runtime provenance is incomplete; legal replay cannot attest the executable, runner or rules-bundle identity.'])] };
}

// Add the ordinary family and bonus inside each identical normalized refit.
// Summing marginal confidence endpoints would lose their covariance.
async function jointWholeRanges(dataset, roster, { bootstrap, seed, signal, onProgress }) {
  const groups = core.unique(dataset.games.map(game => game.groupId)), names = dataset.featureNames;
  const cohorts = { baseline: dataset.games.filter(game => game.kind !== 'head'), head: dataset.games.filter(game => game.kind === 'head'), combined: dataset.games };
  const values = Object.fromEntries(Object.keys(cohorts).map(cohort => [cohort, Object.fromEntries(roster.map(row => [row.id, []]))]));
  const rows = Object.fromEntries(Object.entries(cohorts).map(([cohort, games]) => {
    const ids = new Set(games.map(game => game.gameId));
    return [cohort, core.prepare({ ...dataset, games, samples: dataset.samples.filter(sample => ids.has(sample.gameId)) }, { bootstrap: 0, anchors: ANCHORS }).rows];
  }));
  if (bootstrap && groups.length >= 4) {
    const random = core.randomSource(seed);
    for (let replicate = 0; replicate < bootstrap; replicate++) {
      aborted(signal);
      const multiplicities = new Map();
      for (let index = 0; index < groups.length; index++) { const group = groups[Math.floor(random() * groups.length)]; multiplicities.set(group, (multiplicities.get(group) || 0) + 1); }
      for (const [cohort, all] of Object.entries(rows)) {
        const sampled = all.flatMap(row => multiplicities.has(row.groupId) ? [{ ...row, weight: row.weight * multiplicities.get(row.groupId) }] : []);
        const model = core.fit(sampled, names, ANCHORS), rank = core.modelRank(sampled, names, ANCHORS);
        if (!model.converged || !rank.fullRank || !(model.coefficients.pawn > 1e-6) || core.separates(sampled, names, model)) continue;
        for (const row of roster) values[cohort][row.id].push((model.coefficients[row.family] + model.coefficients[`bonus:${row.id}`]) / model.coefficients.pawn);
      }
      if ((replicate + 1) % 5 === 0 || replicate + 1 === bootstrap) {
        onProgress?.({ phase: 'whole-piece-bootstrap', completed: replicate + 1, total: bootstrap }); await pause(signal);
      }
    }
  }
  return values;
}

/** No searches or file writes. The caller validates its frozen campaign first. */
async function analyzeMaterial({ stages, roster, bootstrap = 100, seed = 42, validationFolds = 5, onProgress, signal, rulesFactory } = {}) {
  roster = validateRoster(roster);
  if (!Array.isArray(stages) || !stages.length || new Set(stages.map(stage => stage.key)).size !== stages.length) throw new Error('Declare distinct original material stages.');
  // Validate options before replaying a large journal.
  core.prepare({ featureNames: ['pawn', 'queen'], games: [], samples: [] }, { bootstrap, seed, validationFolds, anchors: ANCHORS });
  const budgets = [...new Set(stages.map(stage => stage.nodes))].sort((a, b) => a - b), nodes = [];
  for (const budget of budgets) {
    aborted(signal);
    // Keep replay positions for one budget in memory at a time. The user's
    // research laptop has 8 GB RAM; three full datasets need not coexist.
    const batches = [];
    for (const stage of stages.filter(stage => stage.nodes === budget)) batches.push(await extractStage(stage, roster, { rulesFactory, signal, onProgress }));
    const dataset = poolStages(batches, roster);
    if (!dataset) { nodes.push({ nodes: budget, status: 'no-scored-pairs', provenance: batches.map(stage => stage.provenance), analysis: null, estimates: null }); continue; }
    onProgress?.(`Fitting material at ${budget} nodes from ${dataset.games.length} paired games and ${dataset.samples.length} eligible positions.`);
    const analysis = await analyzeReferenceDataset(dataset, { bootstrap, seed, validationFolds, onProgress, signal });
    const joint = await jointWholeRanges(dataset, roster, { bootstrap, seed, signal, onProgress });
    const estimates = Object.fromEntries(['baseline', 'head', 'combined'].map(cohort => {
      const fit = analysis.primary[cohort], values = fit.normalized.values;
      const ordinary = Object.fromEntries(FAMILIES.map(family => [family, {
        value: Object.hasOwn(ANCHORS, family) ? ANCHORS[family] : values?.[family] ?? null,
        assumed: Object.hasOwn(ANCHORS, family),
        interval: values && !Object.hasOwn(ANCHORS, family) ? fit.bootstrap.ratioIntervals[family] : null }]));
      const pieces = roster.map(row => {
        const bonus = values?.[`bonus:${row.id}`] ?? null, ordinary = values?.[row.family] ?? null;
        const validReplicates = joint[cohort][row.id].length, available = bonus !== null && ordinary !== null;
        return { ...row, available, ordinary, bonus, total: available ? ordinary + bonus : null,
          bonusInterval: available ? fit.bootstrap.ratioIntervals[`bonus:${row.id}`] : null,
          totalInterval: available && validReplicates >= Math.max(20, bootstrap * 0.9) ? core.interval(joint[cohort][row.id]) : null,
          validJointReplicates: validReplicates, reason: available ? null : fit.normalized.reason };
      });
      return [cohort, { ordinary, pieces }];
    }));
    nodes.push({ nodes: budget, status: analysis.primary.combined.normalized.available ? 'conditional-estimates' : 'unsupported-estimates',
      provenance: batches.map(stage => stage.provenance), coverage: { pairedGames: dataset.games.length,
        sampledGames: dataset.games.filter(game => game.samples).length, positions: dataset.samples.length,
        openingGroups: new Set(dataset.games.map(game => game.groupId)).size, duplicateHistoryPairs: dataset.duplicateHistoryPairs }, analysis, estimates });
    await pause(signal);
  }
  return { schemaVersion: 1, format: 'levelup-level3-panel-material-report', roster,
    method: { anchors: { ...ANCHORS }, sampling: DEFAULT_SAMPLING, bootstrap, seed, validationFolds,
      nodePoliciesPooled: false, wholePieceRanges: 'Ordinary family plus upgrade bonus inside the same opening-block bootstrap refit.',
      noEngineValuesChanged: true, newGamesStarted: false }, nodes };
}

function renderMaterial(report) {
  const number = value => Number.isFinite(value) ? value.toFixed(2) : 'unavailable';
  const interval = value => Number.isFinite(value?.lower) && Number.isFinite(value?.upper) ? `${number(value.lower)}–${number(value.upper)}` : 'unavailable';
  const escape = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
  const lines = ['# Level-three material estimates', '',
    'Each node budget is fitted separately. Pawn = 1 and queen = 9 are assumed. Values are conditional on these openings and the fixed engine policy; engine search values and purchase costs stay unchanged.', ''];
  for (const entry of report.nodes) {
    lines.push(`## ${entry.nodes.toLocaleString('en-US')} nodes`, '', `Status: ${entry.status}.`, '');
    if (!entry.analysis) { lines.push('No complete scored color pairs yet.', ''); continue; }
    lines.push(`${entry.coverage.pairedGames} scored paired games; ${entry.coverage.sampledGames} sampled games; ${entry.coverage.positions} eligible positions; ${entry.coverage.openingGroups} opening groups.`, '',
      '| Ordinary piece | Combined value | Conditional 95% range |', '| --- | ---: | --- |',
      ...FAMILIES.map(family => { const estimate = entry.estimates.combined.ordinary[family]; return `| ${family} | ${number(estimate.value)}${estimate.assumed ? ' (assumed)' : ''} | ${estimate.assumed ? 'fixed assumption' : interval(estimate.interval)} |`; }), '',
      '| Upgrade | Baseline bonus | Head-to-head bonus | Combined bonus | Whole piece | Whole-piece conditional 95% range |',
      '| --- | ---: | ---: | ---: | ---: | --- |');
    for (const row of report.roster) {
      const inCohort = cohort => entry.estimates[cohort].pieces.find(piece => piece.id === row.id);
      const combined = inCohort('combined');
      lines.push(`| ${escape(row.name)} | ${number(inCohort('baseline').bonus)} | ${number(inCohort('head').bonus)} | ${number(combined.bonus)} | ${number(combined.total)} | ${interval(combined.totalInterval)} |`);
    }
    lines.push('', '| Fit | Effective rank | Converged | Held-out Brier | Estimate support |', '| --- | ---: | --- | ---: | --- |');
    for (const mode of ['primary', 'diagnostic']) for (const cohort of ['baseline', 'head', 'combined']) {
      const fit = entry.analysis[mode][cohort];
      lines.push(`| ${mode} ${cohort} | ${fit.rank.rank}/${fit.rank.columns} | ${fit.fit.converged} | ${number(fit.validation.metrics?.brier)} | ${escape(fit.normalized.available ? 'conditional only' : fit.normalized.reason)} |`);
    }
    lines.push('');
  }
  lines.push('Head-to-head scores compare upgrade bonuses over each ordinary army. Whole-piece totals add the ordinary family estimate from the same fit. Their ranges use joint refits, preserving covariance.', '',
    'Games have equal total fitting weight. Folds and resamples withhold whole opening groups; material-stable windows do not prove tactical quietness. Unfinished or truncated pairs are excluded. Unsupported estimates remain unavailable. Free-ratio diagnostic fits test the anchored model without changing it.', '');
  return lines.join('\n');
}

module.exports = { completedPairs, analyzeMaterial, renderMaterial };
