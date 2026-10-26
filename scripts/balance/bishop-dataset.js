'use strict';

// Offline replay and material extraction for the frozen linked bishop study.
// This module never starts a native engine or rewrites collection evidence.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { decodeMaterial, DEFAULT_SAMPLING } = require('./material-dataset');
const fs = require('node:fs');
const path = require('node:path');
const { validateBishopPlan } = require('./bishop-plan');
const { asSimpleReplayManifest } = require('./bishop-source');
const { extractSimpleDataset: extractSourceDataset, parentEvidence: validateParentEvidence } = require('./simple-dataset');
const ROOT = path.resolve(__dirname, '../..');

const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const STATUSES = ['completed', 'truncated', 'aborted', 'error'];
const FINAL = new Set(['completed', 'truncated']);
const ORDINARY = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo'];
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
function checkAbort(signal) {
  if (signal?.aborted) { const error = new Error('Bishop report cancelled.'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error; }
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.format !== 'levelup-bishop-collection'
    || typeof manifest.runId !== 'string' || !manifest.runId || /[;\r\n]/.test(manifest.runId)
    || manifest.jobs !== 4) fail('An intact linked bishop collection manifest is required.');
  const plan = validateBishopPlan(manifest.plan);
  if (!isDeepStrictEqual(plan.protocol.sampling, DEFAULT_SAMPLING)) fail('Bishop sampling differs from the frozen min16/stride5/stable2 policy.');
  decodeMaterial(plan.schedule[0].startFen, plan.profile);
  return plan;
}

function selectPrefix(manifest, records, checkpoint) {
  const plan = validateManifest(manifest);
  if (!Array.isArray(records)) fail('Bishop journal records must be an array.');
  if (checkpoint !== undefined && !plan.study.checkpoints.includes(checkpoint)) fail('Use a declared 320, 640 or 1280-game checkpoint.');
  const allIds = new Set(plan.schedule.map(game => game.id));
  if (records.some(record => !record || !allIds.has(record.id))) fail('Foreign bishop journal record.');
  const schedule = checkpoint === undefined ? plan.schedule : plan.schedule.slice(0, checkpoint);
  const ids = new Set(schedule.map(game => game.id));
  return { plan, schedule, selected: records.filter(record => ids.has(record.id)) };
}

function latestRecords(plan, records) {
  const scheduled = new Map(plan.schedule.map(game => [game.id, game])), latest = new Map();
  const engine = { nodes: plan.settings.nodes, threads: plan.settings.threads,
    hashMb: plan.settings.hashMb, maxPlies: plan.settings.maxPlies };
  for (const record of records) {
    const game = scheduled.get(record.id);
    if (!game || !STATUSES.includes(record.status) || !Number.isSafeInteger(record.attempt) || record.attempt < 1) fail('Malformed bishop journal record.');
    for (const field of ['unitId', 'pairId', 'kind', 'aColor', 'openingId', 'comparisonId', 'startFen',
      'designA', 'designB', 'whiteDesign', 'blackDesign']) {
      if (record[field] !== game[field]) fail(`Bishop record ${record.id} differs from planned ${field}.`);
    }
    if (record.schemaVersion !== 1 || record.profileHash !== plan.profile.hash || record.registryHash !== plan.registry.hash
      || record.variant !== plan.profile.variant || record.registryReference !== 'collection.json#plan.registry'
      || record.royalMode !== 'king' || record.evaluationCaveat !== null
      || !isDeepStrictEqual(record.evaluation, plan.profile.evaluation)
      || !isDeepStrictEqual(record.engine, engine)
      || !isDeepStrictEqual(record.whiteStrength, { skill: plan.settings.skill })
      || !isDeepStrictEqual(record.blackStrength, { skill: plan.settings.skill })) fail(`Bishop identity or search policy mismatch: ${record.id}.`);
    if (!Array.isArray(record.moves) || !Array.isArray(record.sans) || record.moves.length !== record.sans.length
      || record.totalPlies !== record.moves.length || record.playedPlies !== record.moves.length
      || record.openingPlies !== 0 || !Array.isArray(record.openingMoves) || record.openingMoves.length) fail(`Inconsistent bishop move counts: ${record.id}.`);
    if (record.status === 'completed' ? !Object.hasOwn(SCORES, record.result) : record.result !== '*') fail(`Unscored bishop attempts cannot be chess results: ${record.id}.`);
    const previous = latest.get(record.id);
    if (previous) {
      if (isDeepStrictEqual(previous, record)) continue;
      if (FINAL.has(previous.status) || record.attempt <= previous.attempt
        || previous.moves.some((move, index) => record.moves[index] !== move)) fail(`Conflicting bishop attempts or completed history: ${record.id}.`);
    }
    latest.set(record.id, record);
  }
  return latest;
}

function sourceEvidence(plan, options = {}) {
  const fields = plan.simpleSource || {};
  const manifestBytes = options.sourceManifestBytes !== undefined ? Buffer.from(options.sourceManifestBytes)
    : fs.readFileSync(path.resolve(ROOT, fields.manifestFile));
  const journalBytes = options.sourceJournalBytes !== undefined ? Buffer.from(options.sourceJournalBytes)
    : fs.readFileSync(path.resolve(ROOT, fields.journalFile));
  if (sha(manifestBytes) !== fields.manifestSha256 || sha(journalBytes) !== fields.journalSha256) {
    fail('Frozen simple replay source or journal checksum differs.');
  }
  const replaySource = JSON.parse(manifestBytes), text = journalBytes.toString('utf8');
  if (!text.endsWith('\n')) fail('The completed simple journal must end in a complete line.');
  const manifest = asSimpleReplayManifest(replaySource), records = text.trim().split('\n').map(JSON.parse);
  if (options.sourceManifest && !isDeepStrictEqual(options.sourceManifest, manifest)
    || options.sourceRecords && !isDeepStrictEqual(options.sourceRecords, records)) fail('Source objects differ from their frozen bytes.');
  if (manifest.runId !== fields.runId || manifest.plan.profile.hash !== fields.profileHash
    || manifest.plan.registry.hash !== fields.registryHash) fail('Simple replay source identity differs from the linked plan.');
  // Validate both raw source layers even when replay is cached or injected.
  const parent = validateParentEvidence(manifest.plan, options);
  return { manifest, records, replaySource, manifestBytes, journalBytes, parent, ...fields };
}

function cohortCoverage(games, samples, predicate) {
  const selected = games.filter(predicate), ids = new Set(selected.map(game => game.gameId));
  const rows = samples.filter(sample => ids.has(sample.gameId));
  return { distinctGames: selected.length, sampledGames: selected.filter(game => game.samples).length,
    samples: rows.length, groups: new Set(rows.map(sample => sample.groupId)).size,
    phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, rows.filter(sample => sample.phase === phase).length])) };
}

// Reuse an already validated immutable parent within the long-lived collector
// process. Raw checksums are still checked on every report invocation.
const sourceCache = new Map();
async function extractBishopDataset(manifest, records, options = {}) {
  checkAbort(options.signal);
  const plan = validateManifest(manifest), evidence = sourceEvidence(plan, options);
  const cacheKey = `${evidence.manifestSha256}:${evidence.journalSha256}`;
  const cacheAllowed = !options.sourceRulesFactory && !options.parentRulesFactory && !options.extractSource;
  let inherited = cacheAllowed ? sourceCache.get(cacheKey) : null;
  if (!inherited) {
    options.onProgress?.('Replaying retained original and simple games under their source profiles; no games are rerun.');
    inherited = await (options.extractSource || extractSourceDataset)(evidence.manifest, evidence.records,
      { rulesFactory: options.sourceRulesFactory, parentRulesFactory: options.parentRulesFactory,
        parentManifestBytes: options.parentManifestBytes, parentJournalBytes: options.parentJournalBytes,
        onProgress: options.onProgress, signal: options.signal });
    checkAbort(options.signal);
    if (cacheAllowed) sourceCache.set(cacheKey, inherited);
  }
  const extension = await extractExtensionDataset(manifest, records, options);
  const featureNames = extension.dataset.featureNames;
  const project = (values, oldNames) => featureNames.map(name => {
    const column = oldNames.indexOf(name);
    return column < 0 ? 0 : values[column];
  });
  const games = [], samples = [], seenIds = new Set(), histories = new Map(), duplicateGames = [];
  const append = (extracted, sourceContext, sourceManifest) => {
    const keep = new Set();
    for (const original of extracted.dataset.games) {
      if (seenIds.has(original.gameId)) fail(`Parent and extension repeat a game ID: ${original.gameId}.`);
      seenIds.add(original.gameId);
      const previous = histories.get(original.historyHash);
      if (previous) {
        duplicateGames.push({ gameId: original.gameId, retainedGameId: previous, historyHash: original.historyHash, sourceContext });
        continue;
      }
      histories.set(original.historyHash, original.gameId); keep.add(original.gameId);
      const context = sourceContext === 'inherited' ? (original.sourceContext === 'parent' ? 'parent' : 'simple') : sourceContext;
      games.push({ ...original, startX: project(original.startX, extracted.dataset.featureNames),
        sourceContext: context, sourceRunId: original.sourceRunId || sourceManifest.runId,
        sourceProfileHash: original.sourceProfileHash || sourceManifest.plan.profile.hash,
        sourceRegistryHash: original.sourceRegistryHash || sourceManifest.plan.registry.hash });
    }
    for (const original of extracted.samples) if (keep.has(original.gameId)) samples.push({ ...original,
      x: project(original.x, extracted.dataset.featureNames),
      sourceContext: sourceContext === 'inherited' ? (original.sourceContext === 'parent' ? 'parent' : 'simple') : sourceContext,
      sourceRunId: original.sourceRunId || sourceManifest.runId,
      sourceProfileHash: original.sourceProfileHash || sourceManifest.plan.profile.hash,
      sourceRegistryHash: original.sourceRegistryHash || sourceManifest.plan.registry.hash });
  };
  append(inherited, 'inherited', evidence.manifest); append(extension, 'bishop', manifest);
  const limitations = [
    'Original and simple games are reused once under their respective source profiles; none is counted as a newly collected game.',
    'The original simple collection manifest was not supplied. Its pinned replay descriptor reconstructs the declared plan and source identity; historical native inventory and original manifest checksum remain unattested.',
    'The four new bishop designs have no ordinary/single games in this study. Their baseline bonuses and cohort differences are unavailable; direct matchups and head/combined estimates answer the declared comparison.',
    'Linked estimates combine historical and extension contexts. Compatibility diagnostics are bounded evidence, not universal playing-policy equivalence.',
    'Source context is retained as provenance, not fitted as a causal adjustment; pooled estimates assume contextual comparability.',
    'All inherited and new conditions for one selected position share its original group in validation and resampling.',
    'At intermediate checkpoints all parent groups are present while only the reported new prefix has been collected.',
    'Pawn=1 and queen=9 remain assumptions; conditional estimates do not establish intrinsic prices.',
  ];
  const dataset = { ...extension.dataset, format: 'levelup-linked-bishop-dataset', featureNames,
    identity: { ...extension.dataset.identity, parentRunId: plan.parent.runId, simpleRunId: evidence.manifest.runId,
      parentManifestSha256: plan.parent.manifestSha256, parentJournalSha256: plan.parent.journalSha256,
      simpleReplaySourceSha256: evidence.manifestSha256, simpleJournalSha256: evidence.journalSha256 },
    sourceContexts: { parent: inherited.dataset.sourceContexts.parent,
      simple: { ...inherited.dataset.sourceContexts.extension, originalManifestSupplied: false,
        replaySourceSha256: evidence.manifestSha256, historicalNativeInventoryVerified: false },
      bishop: { runId: manifest.runId, profile: plan.profile, registry: plan.registry,
        manifestIdentity: manifest.identity || null } }, games, sampleCount: samples.length, limitations };
  const addCounts = key => Object.fromEntries(STATUSES.map(status => [status,
    (inherited.coverage[key]?.[status] || 0) + (extension.coverage[key]?.[status] || 0)]));
  const coverage = {
    scheduledGames: inherited.coverage.scheduledGames + extension.coverage.scheduledGames,
    studyScheduledGames: inherited.coverage.studyScheduledGames + plan.schedule.length,
    finalizedGames: inherited.coverage.finalizedGames + extension.coverage.finalizedGames,
    observedGames: inherited.coverage.observedGames + extension.coverage.observedGames,
    remainingGames: extension.coverage.remainingGames,
    journalAttempts: inherited.coverage.journalAttempts + extension.coverage.journalAttempts,
    completedRecords: inherited.coverage.completedRecords + extension.coverage.completedRecords,
    uniqueHistories: games.length, sampledGames: games.filter(game => game.samples).length,
    gamesWithoutSamples: games.filter(game => !game.samples).length, samples: samples.length,
    replayedPlies: inherited.coverage.replayedPlies + extension.coverage.replayedPlies,
    statusCounts: addCounts('statusCounts'), attemptStatusCounts: addCounts('attemptStatusCounts'),
    partialScoredPairs: inherited.coverage.partialScoredPairs + extension.coverage.partialScoredPairs,
    duplicateGames: [...inherited.coverage.duplicateGames, ...extension.coverage.duplicateGames, ...duplicateGames],
    openingGroups: new Set(games.map(game => game.groupId)).size,
    sampledOpeningGroups: new Set(samples.map(sample => sample.groupId)).size,
    inheritedGames: inherited.coverage.finalizedGames, newGames: extension.coverage.finalizedGames,
    newScheduledGames: extension.coverage.scheduledGames, newStudyCap: plan.schedule.length,
    newCompletedRecords: extension.coverage.completedRecords,
    newOpeningGroups: new Set(extension.dataset.games.map(game => game.groupId)).size,
    inherited: inherited.coverage, extension: extension.coverage,
    cohorts: { baseline: cohortCoverage(games, samples, game => game.kind !== 'head'),
      head: cohortCoverage(games, samples, game => game.kind === 'head'), combined: cohortCoverage(games, samples, () => true) },
    phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, samples.filter(sample => sample.phase === phase).length])),
  };
  coverage.materialSupport = Object.fromEntries(featureNames.filter(name => name !== 'tempo').map(name => {
    const index = featureNames.indexOf(name), rows = samples.filter(sample => sample.x[index] !== 0);
    return [name, { samples: rows.length, games: new Set(rows.map(row => row.gameId)).size,
      groups: new Set(rows.map(row => row.groupId)).size,
      positiveGames: new Set(rows.filter(row => row.x[index] > 0).map(row => row.gameId)).size,
      negativeGames: new Set(rows.filter(row => row.x[index] < 0).map(row => row.gameId)).size }];
  }));
  const warnings = [...limitations];
  if (coverage.remainingGames) warnings.push('New collection is incomplete; parent evidence is complete but candidate coverage is still partial.');
  if (coverage.statusCounts.truncated) warnings.push('Ply-limited games remain unscored, including the original parent truncation; no replacement games are added.');
  if (coverage.partialScoredPairs) warnings.push('Some completed games have an unscored color partner; paired matchup scores exclude those partial pairs.');
  if (!manifest.native?.parentCompatibility?.passed) warnings.push('Parent/extension compatibility diagnostics are not supplied in this report; pooling does not establish playing-policy equivalence.');
  return { plan, schedule: extension.schedule, selected: extension.selected, dataset, samples, coverage, warnings,
    source: evidence,
    epd: Object.fromEntries(['ordinary', 'single', 'head'].map(kind => [kind, inherited.epd[kind] + extension.epd[kind]])) };
}

module.exports = { validateManifest, selectPrefix, latestRecords, sourceEvidence, extractExtensionDataset, extractBishopDataset };
function epdText(states, record, manifest) {
  const variant = record.kind === 'ordinary' ? 'chess' : manifest.plan.profile.variant;
  const metadata = `;variant ${variant};collection_profile ${manifest.plan.profile.variant};result ${record.result};game ${manifest.runId}:${record.id}`
    + `;opening ${record.openingId};kind ${record.kind};profile ${manifest.plan.profile.hash};registry ${manifest.plan.registry.hash}`;
  return states.slice(1).map((state, index) => `${state.fen};bm ${record.moves[index + 1] || 'none'};hmvc ${state.hmvc}${metadata}\n`).join('');
}

async function extractExtensionDataset(manifest, records, { checkpoint, rulesFactory, onProgress = () => {}, signal } = {}) {
  checkAbort(signal);
  const { plan, schedule, selected } = selectPrefix(manifest, records, checkpoint);
  const latest = latestRecords(plan, selected), finalized = schedule.filter(game => FINAL.has(latest.get(game.id)?.status)).length;
  if (checkpoint !== undefined && finalized !== checkpoint) fail('Cannot freeze a bishop checkpoint before every scheduled prefix game is finished.');
  const rules = await (rulesFactory || require('../../dist/balance-rules.cjs').createMatchRules)({ profile: plan.profile });
  const featureNames = [...ORDINARY, ...plan.registry.definitions.map(definition => `bonus:${definition.id}`).sort()];
  const cache = new Map(), material = fen => {
    const fields = fen.split(' '), key = [...fields[0].replace(/[1-8/]/g, '')].sort().join('') + fields[1];
    if (!cache.has(key)) cache.set(key, decodeMaterial(fen, plan.profile));
    return cache.get(key);
  };
  const limitations = [
    'Pawn = 1 and queen = 9 are declared analysis assumptions, not measured ratios.',
    'All three game kinds contribute to the combined fit; each sampled game has unit total weight and draws remain scored.',
    'Whole selected-position blocks preserve historical and extension conditions; distinct FENs may share broader opening ancestry.',
    'Material-stable windows do not prove tactical quietness, and game outcomes do not establish intrinsic exchange prices.',
    'The completed parent is linked under its original profile; unrelated pilot and EPD data are excluded.',
    'Manifest hashes identify recorded inputs; replay does not independently attest the executable or historical processes.',
  ];
  const dataset = { schemaVersion: 1, format: 'levelup-bishop-dataset', featureNames,
    sampling: plan.protocol.sampling, roster: plan.roster,
    profile: { hash: plan.profile.hash, registryHash: plan.registry.hash, registry: plan.registry },
    identity: { runId: manifest.runId, manifestIdentity: manifest.identity || null },
    games: [], samples: [], limitations };
  const histories = new Map(), duplicateGames = [], excluded = { terminal: 0, windowEdge: 0, materialChange: 0 };
  const epd = { ordinary: '', single: '', head: '' }, statusCounts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  let replayedPlies = 0, completedRecords = 0, candidates = 0;
  for (const game of schedule) {
    checkAbort(signal);
    const record = latest.get(game.id);
    if (!record) continue;
    statusCounts[record.status]++;
    if (record.status !== 'completed') continue;
    completedRecords++;
    const board = rules.createBoard(record.startFen), states = [];
    try {
      const snapshot = () => {
        const fen = board.fen(), decoded = material(fen), previous = states.at(-1);
        states.push({ fen, outcome: board.outcome(), ...decoded,
          hmvc: previous && previous.signature === decoded.signature ? previous.hmvc + 1 : 0 });
      };
      snapshot();
      for (let ply = 0; ply < record.moves.length; ply++) {
        checkAbort(signal);
        if (states.at(-1).outcome !== null || board.san(record.moves[ply]) !== record.sans[ply]
          || board.push(record.moves[ply]) !== true) fail(`Illegal move/SAN or continuation after termination: ${record.id}, ply ${ply + 1}.`);
        replayedPlies++; snapshot();
        if (replayedPlies % 128 === 0) { await new Promise(resolve => setImmediate(resolve)); checkAbort(signal); }
      }
      if (board.fen() !== record.finalFen || !isDeepStrictEqual(states.at(-1).outcome, { result: record.result, reason: record.reason })) fail(`Final bishop FEN/outcome mismatch: ${record.id}.`);
    } finally { board.dispose(); }
    const historyHash = sha(JSON.stringify({ startFen: record.startFen, moves: record.moves, result: record.result, reason: record.reason, finalFen: record.finalFen }));
    if (histories.has(historyHash)) {
      duplicateGames.push({ gameId: record.id, retainedGameId: histories.get(historyHash), historyHash }); continue;
    }
    histories.set(historyHash, record.id);
    epd[record.kind] += epdText(states, record, manifest);
    const accepted = [], { minPly, stride, stableBefore, stableAfter } = plan.protocol.sampling;
    for (let ply = minPly; ply < states.length; ply += stride) {
      candidates++;
      const state = states[ply];
      if (state.outcome !== null) { excluded.terminal++; continue; }
      if (ply + stableAfter >= states.length || ply < stableBefore) { excluded.windowEdge++; continue; }
      if (states.slice(ply - stableBefore, ply + stableAfter + 1).some(other => other.signature !== state.signature)) { excluded.materialChange++; continue; }
      accepted.push({ x: [...state.x], y: SCORES[record.result], weight: 0, gameId: record.id,
        pairId: record.unitId, groupId: record.openingId, phase: state.phase, ply, fen: state.fen });
    }
    for (const sample of accepted) { sample.weight = 1 / accepted.length; dataset.samples.push(sample); }
    dataset.games.push({ gameId: record.id, pairId: record.unitId, groupId: record.openingId,
      kind: record.kind, aColor: record.aColor, openingId: record.openingId, comparisonId: record.comparisonId,
      designA: record.designA, designB: record.designB, whiteDesign: record.whiteDesign, blackDesign: record.blackDesign,
      result: record.result, samples: accepted.length, historyHash, startFen: record.startFen, startX: [...states[0].x] });
    if (completedRecords % 128 === 0) { onProgress(`Replayed ${completedRecords} completed bishop games.`); await new Promise(resolve => setImmediate(resolve)); }
  }
  const sampled = dataset.games.filter(game => game.samples);
  const cohortCoverage = predicate => {
    const games = dataset.games.filter(predicate), ids = new Set(games.map(game => game.gameId));
    const samples = dataset.samples.filter(sample => ids.has(sample.gameId));
    return { distinctGames: games.length, sampledGames: games.filter(game => game.samples).length,
      samples: samples.length, groups: new Set(samples.map(sample => sample.groupId)).size,
      phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, samples.filter(sample => sample.phase === phase).length])) };
  };
  const support = Object.fromEntries(featureNames.filter(name => name !== 'tempo').map(name => {
    const index = featureNames.indexOf(name), rows = dataset.samples.filter(sample => sample.x[index] !== 0);
    return [name, { samples: rows.length, games: new Set(rows.map(row => row.gameId)).size,
      groups: new Set(rows.map(row => row.groupId)).size,
      positiveGames: new Set(rows.filter(row => row.x[index] > 0).map(row => row.gameId)).size,
      negativeGames: new Set(rows.filter(row => row.x[index] < 0).map(row => row.gameId)).size }];
  }));
  const pairStatuses = new Map();
  for (const game of schedule.filter(game => game.kind !== 'ordinary')) {
    const statuses = pairStatuses.get(game.unitId) || [];
    statuses.push(latest.get(game.id)?.status || 'pending'); pairStatuses.set(game.unitId, statuses);
  }
  const partialScoredPairs = [...pairStatuses.values()].filter(statuses => statuses.filter(status => status === 'completed').length === 1).length;
  const coverage = { scheduledGames: schedule.length, studyScheduledGames: plan.schedule.length,
    journalAttempts: selected.length, observedGames: latest.size, finalizedGames: finalized,
    remainingGames: schedule.length - finalized, statusCounts, completedRecords, uniqueHistories: dataset.games.length,
    sampledGames: sampled.length, gamesWithoutSamples: dataset.games.length - sampled.length,
    duplicateGames, samples: dataset.samples.length, replayedPlies, candidates, excluded, partialScoredPairs,
    openingGroups: new Set(sampled.map(game => game.groupId)).size, blocks: schedule.length / plan.protocol.conditionsPerPosition,
    attemptStatusCounts: Object.fromEntries(STATUSES.map(status => [status, selected.filter(record => record.status === status).length])),
    cohorts: { baseline: cohortCoverage(game => game.kind !== 'head'), head: cohortCoverage(game => game.kind === 'head'),
      combined: cohortCoverage(() => true) }, materialSupport: support,
    phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, dataset.samples.filter(sample => sample.phase === phase).length])) };
  const warnings = [...limitations];
  if (coverage.remainingGames) warnings.push('Collection is incomplete; estimates use only completed distinct outcomes and may be affected by unfinished-game selection.');
  if (statusCounts.truncated) warnings.push('Ply-limited games are unscored, not draws or losses.');
  if (partialScoredPairs) warnings.push(`${partialScoredPairs} pairs currently contribute a completed outcome from only one color; provisional evidence is not fully paired.`);
  const metadata = { ...dataset, samples: undefined, sampleCount: dataset.samples.length };
  return { plan, schedule, selected, coverage, warnings, dataset: metadata, samples: dataset.samples, epd };
}
