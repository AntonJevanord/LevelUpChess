'use strict';

// Reuse only the exact frozen reference purchases, retaining original profiles.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { exportDataset, DEFAULT_SAMPLING } = require('./material-dataset');
const { getOfficialReferences } = require('./official-references');
const { getDesign } = require('../../src/design-catalog');
const ORDINARY = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo'];
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const sha = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function aborted(signal) {
  if (signal?.aborted) { const error = new Error('Reference material extraction cancelled.'); error.code = 'ABORT_ERR'; error.name = 'AbortError'; throw error; }
}

async function extractReferenceMaterial({ sources, onProgress = () => {}, signal, rulesFactory } = {}) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Declare original reference journal sources.');
  const roster = getOfficialReferences().roster, referenceIds = new Set(roster.map(row => row.id));
  const featureNames = [...ORDINARY, ...roster.map(row => `bonus:${row.id}`).sort()];
  const selection = { inputRecords: 0, referenceRecords: 0, excludedOtherRecords: 0,
    duplicateIdentityRecords: 0, duplicateHistoryRecords: 0, truncatedRecords: 0,
    unfinishedRecords: 0, completedWithoutPartner: 0, selectedGames: 0, bySource: [] };
  const dataset = { schemaVersion: 1, format: 'levelup-reference-only-material-dataset',
    featureNames, sampling: { ...DEFAULT_SAMPLING }, sources: [], games: [], samples: [],
    grouping: { unit: 'whole-selected-position-block', openingIdsSharedAcrossSourceContexts: true },
    limitations: ['Each source is replayed under its original rules and identity; pooled material estimates condition on declared cross-profile compatibility.',
      'Source/process histories remain distinct even when search settings and relevant movement/value tables agree.',
      'All selected games involve exact frozen reference revisions. Other experiments are excluded, not recoded as references.',
      'Truncated games are unscored; completed games without a scored opposite-color partner are excluded.',
      'All games in each opening group share bootstrap multiplicities; broader opening ancestry is unknown.'] };
  // Consolidate copies of one declared context before pairing. A second file
  // may restore the missing opposite color of a partial first copy.
  const usedSourceIds = new Set(), contexts = new Map();
  for (const source of sources) {
    aborted(signal);
    if (!source || typeof source.id !== 'string' || !source.id || usedSourceIds.has(source.id)
      || !source.profile?.registry || !source.identity || !Array.isArray(source.records)) throw new Error('Each source requires a unique ID, original compiled profile, records and identity.');
    usedSourceIds.add(source.id);
    const context = sha({ profileHash: source.profile.hash, identity: source.identity });
    const prior = contexts.get(context);
    if (prior) { prior.records.push(...source.records); prior.sourceIds.push(source.id); }
    else contexts.set(context, { ...source, records: [...source.records], sourceIds: [source.id] });
  }
  const identities = new Map(), histories = new Map();
  const coverage = { completedGames: 0, completePairs: 0, sampledGames: 0, gamesWithoutSamples: 0,
    sampledPairs: 0, sampledCompletePairs: 0, sampledPartialPairs: 0, pairsWithoutSamples: 0,
    replayedPlies: 0, positionsReplayed: 0, candidates: 0, accepted: 0,
    excluded: { terminal: 0, windowEdge: 0, materialChange: 0 }, phases: { middlegame: 0, endgame: 0 } };
  for (const source of contexts.values()) {
    aborted(signal);
    const context = sha({ profileHash: source.profile.hash, identity: source.identity });
    const counts = { id: source.id, inputRecords: source.records.length, referenceRecords: 0,
      excludedOtherRecords: 0, duplicateIdentityRecords: 0, duplicateHistoryRecords: 0,
      truncatedRecords: 0, unfinishedRecords: 0, completedWithoutPartner: 0, selectedGames: 0 };
    const pairs = new Map();
    for (const record of source.records) {
      if (record?.kind !== 'head' || !referenceIds.has(record.designA) || !referenceIds.has(record.designB) || record.designA === record.designB) { counts.excludedOtherRecords++; continue; }
      counts.referenceRecords++;
      for (const id of [record.designA, record.designB]) {
        const observed = source.profile.registry.definitions.find(row => row.id === id), expected = getDesign(id);
        if (!isDeepStrictEqual(observed, expected)) throw new Error(`Source changes a frozen reference definition: ${id}.`);
      }
      const identityKey = `${context}:${record.id}`, prior = identities.get(identityKey);
      if (prior) {
        if (!isDeepStrictEqual(prior, record)) throw new Error(`Conflicting copies of reference game: ${record.id}.`);
        counts.duplicateIdentityRecords++; continue;
      }
      identities.set(identityKey, record);
      if (record.status === 'truncated') { counts.truncatedRecords++; continue; }
      if (record.status !== 'completed') { counts.unfinishedRecords++; continue; }
      if (!['1-0', '0-1', '1/2-1/2'].includes(record.result)) throw new Error(`Completed reference game has no scored result: ${record.id}.`);
      const historyKey = `${context}:${sha({ startFen: record.startFen, moves: record.moves })}`;
      const previous = histories.get(historyKey);
      if (previous) {
        if (['sans', 'finalFen', 'result', 'reason'].some(key => !isDeepStrictEqual(previous[key], record[key]))) throw new Error(`Conflicting identical reference history: ${record.id}.`);
        counts.duplicateHistoryRecords++; continue;
      }
      histories.set(historyKey, record);
      const pair = pairs.get(record.pairId) || []; pair.push(record); pairs.set(record.pairId, pair);
    }
    const selected = [];
    for (const pair of pairs.values()) {
      if (pair.length !== 2) { counts.completedWithoutPartner += pair.length; continue; }
      if (new Set(pair.map(row => row.aColor)).size !== 2
        || ['openingId', 'comparisonId', 'designA', 'designB'].some(key => pair[0][key] !== pair[1][key])) throw new Error('Reference games have conflicting color-pair identities.');
      selected.push(...pair);
    }
    counts.selectedGames = selected.length;
    for (const key of Object.keys(counts)) if (key !== 'id') selection[key] += counts[key];
    selection.bySource.push({ ...counts, sourceIds: source.sourceIds });
    if (!selected.length) continue;
    onProgress(`Replaying ${source.id}: ${selected.length} paired reference games under their original profile.`);
    const rules = rulesFactory ? async ({ profile }) => rulesFactory({ profile, sourceId: source.id }) : undefined;
    const exported = await exportDataset({ sources: [{ id: source.id, identity: source.identity, records: selected, metadata: source.metadata }],
      profile: source.profile, rulesFactory: rules });
    aborted(signal);
    const lookup = new Map(selected.map(row => [row.id, row]));
    const columns = featureNames.map(name => exported.featureNames.indexOf(name));
    const project = values => columns.map(column => column < 0 ? 0 : values[column]);
    dataset.sources.push({ ...exported.sources[0], profileHash: source.profile.hash,
      registryHash: source.profile.registryHash, variant: source.profile.variant,
      recordedPolicy: exported.recordedPolicy, coverage: exported.coverage });
    for (const game of exported.games) {
      const record = lookup.get(game.recordId);
      dataset.games.push({ ...game, kind: 'head', designA: record.designA, designB: record.designB,
        whiteDesign: record.whiteDesign, blackDesign: record.blackDesign,
        sourceContext: source.id, sourceProfileHash: source.profile.hash });
    }
    for (const sample of exported.samples) dataset.samples.push({ ...sample, x: project(sample.x), sourceContext: source.id });
    for (const key of Object.keys(coverage)) {
      if (['excluded', 'phases'].includes(key)) for (const child of Object.keys(coverage[key])) coverage[key][child] += exported.coverage[key][child];
      else coverage[key] += exported.coverage[key];
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  coverage.groups = new Set(dataset.games.filter(game => game.samples > 0).map(game => game.groupId)).size;
  dataset.coverage = coverage;
  dataset.selection = selection;
  if (!dataset.games.length) throw new Error('No complete scored reference pairs remain.');
  return { dataset, selection };
}

module.exports = { extractReferenceMaterial };
