'use strict';

// Offline replay only: this module never starts a native engine or creates games.
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { compileDesignProfile } = require('./design-profile');

const FAMILIES = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);
const ORDINARY = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
// An odd stride samples both turns instead of aliasing tempo with an intercept.
const DEFAULT_SAMPLING = Object.freeze({ minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 });
const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const fail = message => { throw new Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function encodingFor(profile) {
  if (!profile || !isDeepStrictEqual(profile, compileDesignProfile(profile.registry, profile.evaluation))) {
    fail('Material export requires an intact compiled dynamic profile and frozen registry.');
  }
  const ids = profile.registry.definitions.map(definition => definition.id).sort();
  const names = [...FAMILIES, 'tempo', ...ids.map(id => `bonus:${id}`)];
  const letters = new Map(Object.entries(ORDINARY).map(([letter, family]) => [letter, { family }]));
  for (const { id, letter } of profile.registry.allocations) {
    const definition = profile.definitionsByLetter[letter];
    if (!FAMILIES.includes(definition.family)) fail('Royal piece upgrades are not supported by material-count regression.');
    letters.set(letter, { family: definition.family, id });
  }
  return { names, letters, ids };
}

function readMaterial(fen, encoding) {
  if (typeof fen !== 'string') fail('Material positions require FEN strings.');
  const fields = fen.trim().split(/\s+/), ranks = fields[0].split('/');
  if (fields.length !== 6 || !['w', 'b'].includes(fields[1]) || ranks.length !== 8) fail('Unsupported material FEN.');
  const counts = {}, values = Object.fromEntries(encoding.names.map(name => [name, 0]));
  let totalPieces = 0;
  for (const rank of ranks) {
    let squares = 0;
    for (const piece of rank) {
      if (/^[1-8]$/.test(piece)) { squares += Number(piece); continue; }
      if (!/^[A-Za-z]$/.test(piece)) fail('Promoted markers, pockets and nonstandard FEN encodings are unsupported.');
      squares++;
      totalPieces++;
      counts[piece] = (counts[piece] || 0) + 1;
      const letter = piece.toLowerCase();
      if (letter === 'k') continue;
      const type = encoding.letters.get(letter);
      if (!type) fail(`Unknown material piece letter ${piece}; use its frozen design registry.`);
      const sign = piece === piece.toUpperCase() ? 1 : -1;
      values[type.family] += sign;
      if (type.id) values[`bonus:${type.id}`] += sign;
    }
    if (squares !== 8) fail('Every material FEN rank must contain eight squares.');
  }
  if (counts.K !== 1 || counts.k !== 1) fail('Material regression requires exactly one ordinary royal king per color.');
  values.tempo = fields[1] === 'w' ? 1 : -1;
  return { x: encoding.names.map(name => values[name]), totalPieces,
    phase: totalPieces <= 16 ? 'endgame' : 'middlegame',
    signature: Object.keys(counts).sort().map(letter => `${letter}:${counts[letter]}`).join(',') };
}

function decodeMaterial(fen, profile) { return readMaterial(fen, encodingFor(profile)); }

function samplingPolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Sampling options must be an object.');
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_SAMPLING, key)) fail(`Unknown material sampling option: ${key}.`);
  const policy = { ...DEFAULT_SAMPLING, ...input };
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value < (key === 'stride' ? 1 : 0) || value > 10000) fail(`Invalid material sampling ${key}.`);
  }
  return policy;
}

function recordPolicy(record) {
  return { engine: record.engine, evaluation: record.evaluation ?? null,
    whiteStrength: record.whiteStrength, blackStrength: record.blackStrength,
    engineNames: record.engineNames ?? null };
}

/** A conservative first prototype: completed, paired, equal-strength dynamic
 * design games under one frozen policy. Missing process manifests stay unknown. */
async function exportDataset({ sources, profile, sampling = {}, openingGroups = {}, rulesFactory } = {}) {
  const encoding = encodingFor(profile), policy = samplingPolicy(sampling);
  if (!Array.isArray(sources) || !sources.length) fail('Material export requires at least one journal source.');
  if (!openingGroups || typeof openingGroups !== 'object' || Array.isArray(openingGroups)) fail('Opening groups must map opening IDs to families.');
  const pairs = new Map(), ids = new Set(), sourceIds = new Set();
  let commonIdentity, commonPolicy;
  const entries = [];
  for (const source of sources) {
    if (!source || typeof source.id !== 'string' || !source.id || sourceIds.has(source.id)) fail('Journal source IDs must be distinct nonempty strings.');
    sourceIds.add(source.id);
    if (!source.identity || typeof source.identity !== 'object' || Array.isArray(source.identity)) fail('Every source requires an explicit identity context, including unknown execution provenance.');
    if (commonIdentity === undefined) commonIdentity = source.identity;
    else if (!isDeepStrictEqual(source.identity, commonIdentity)) fail('Cannot pool different engine, source or evaluation identity contexts.');
    if (!Array.isArray(source.records) || !source.records.length) fail(`Journal ${source.id} is empty.`);
    for (const record of source.records) {
      if (!record || typeof record.id !== 'string' || ids.has(record.id)) fail('Journal game IDs must be globally distinct; duplicate games cannot be pooled.');
      ids.add(record.id);
      if (record.status !== 'completed' || !Object.hasOwn(SCORES, record.result)) fail(`Only completed scored games may be exported: ${record.id}.`);
      if (record.profileHash !== profile.hash || record.registryHash !== profile.registryHash || record.variant !== profile.variant
        || record.royalMode !== 'king' || record.evaluationCaveat !== null || !isDeepStrictEqual(record.evaluation, profile.evaluation)) {
        fail(`Game ${record.id} does not match the frozen profile/evaluation/royal context.`);
      }
      if (!record.engine || !record.whiteStrength || !record.blackStrength || !isDeepStrictEqual(record.whiteStrength, record.blackStrength)) {
        fail('Material outcome fitting currently requires equal-strength engines with recorded search settings.');
      }
      const current = recordPolicy(record);
      if (commonPolicy === undefined) commonPolicy = current;
      else if (!isDeepStrictEqual(current, commonPolicy)) fail('Cannot pool journals with different recorded search, strength or evaluation policies.');
      if (typeof record.pairId !== 'string' || !record.pairId || typeof record.openingId !== 'string' || !record.openingId
        || typeof record.comparisonId !== 'string' || !['w', 'b'].includes(record.aColor)) fail(`Missing color-pair metadata: ${record.id}.`);
      if (!Array.isArray(record.moves) || !Array.isArray(record.sans) || record.moves.length !== record.sans.length
        || record.totalPlies !== record.moves.length || !Array.isArray(record.openingMoves)
        || record.openingPlies !== record.openingMoves.length || record.playedPlies !== record.totalPlies - record.openingPlies
        || !isDeepStrictEqual(record.moves.slice(0, record.openingPlies), record.openingMoves)) fail(`Inconsistent move counts or opening prefix: ${record.id}.`);
      const groupId = openingGroups[record.openingId] ?? source.metadata?.openingGroups?.[record.openingId] ?? record.openingId;
      if (typeof groupId !== 'string' || !groupId) fail('Every opening must have a nonempty group ID.');
      const pairId = `${source.id}:${record.pairId}`, gameId = `${source.id}:${record.id}`;
      const entry = { source, record, pairId, gameId, groupId };
      const pair = pairs.get(pairId) || [];
      pair.push(entry); pairs.set(pairId, pair); entries.push(entry);
    }
  }
  for (const pair of pairs.values()) {
    if (pair.length !== 2 || new Set(pair.map(item => item.record.aColor)).size !== 2
      || pair[0].record.openingId !== pair[1].record.openingId || pair[0].record.comparisonId !== pair[1].record.comparisonId
      || pair[0].groupId !== pair[1].groupId || !isDeepStrictEqual(pair[0].record.openingMoves, pair[1].record.openingMoves)) fail('Material journals require complete matching color-swapped pairs.');
  }
  for (const [key, observed] of Object.entries({ profileHash: profile.hash, registryHash: profile.registryHash,
    engineSettings: commonPolicy.engine, whiteStrength: commonPolicy.whiteStrength, blackStrength: commonPolicy.blackStrength })) {
    if (Object.hasOwn(commonIdentity, key) && !isDeepStrictEqual(commonIdentity[key], observed)) fail(`Declared identity ${key} does not match the journal/profile.`);
  }
  const rules = await (rulesFactory || require('../../dist/balance-rules.cjs').createMatchRules)({ profile });
  const samples = [], games = [], exclusions = { terminal: 0, windowEdge: 0, materialChange: 0 };
  let replayedPlies = 0, candidates = 0, positionsReplayed = 0;
  for (const { source, record, pairId, gameId, groupId } of entries) {
    const board = rules.createBoard(record.startFen), states = [];
    try {
      const snapshot = () => {
        const fen = board.fen(), outcome = board.outcome();
        states.push({ fen, outcome, ...readMaterial(fen, encoding) });
      };
      snapshot();
      for (let ply = 0; ply < record.moves.length; ply++) {
        if (states.at(-1).outcome !== null) fail(`Game ${record.id} continues after termination at ply ${ply}.`);
        if (board.san(record.moves[ply]) !== record.sans[ply] || board.push(record.moves[ply]) !== true) fail(`Illegal move or SAN in ${record.id}, ply ${ply + 1}.`);
        replayedPlies++; snapshot();
      }
      if (board.fen() !== record.finalFen || !isDeepStrictEqual(states.at(-1).outcome, { result: record.result, reason: record.reason })) fail(`Final position/outcome mismatch: ${record.id}.`);
    } finally { board.dispose(); }
    const accepted = [];
    positionsReplayed += states.length;
    for (let ply = policy.minPly; ply < states.length; ply += policy.stride) {
      candidates++;
      const state = states[ply];
      if (state.outcome !== null) { exclusions.terminal++; continue; }
      if (ply < policy.stableBefore || ply + policy.stableAfter >= states.length) { exclusions.windowEdge++; continue; }
      if (states.slice(ply - policy.stableBefore, ply + policy.stableAfter + 1).some(other => other.signature !== state.signature)) { exclusions.materialChange++; continue; }
      accepted.push({ x: state.x, y: SCORES[record.result], weight: 0, gameId, pairId, groupId,
        phase: state.phase, ply, fen: state.fen });
    }
    for (const sample of accepted) { sample.weight = 1 / accepted.length; samples.push(sample); }
    games.push({ gameId, pairId, groupId, result: record.result, samples: accepted.length,
      sourceId: source.id, recordId: record.id, comparisonId: record.comparisonId, openingId: record.openingId,
      aColor: record.aColor, replayedPlies: record.moves.length });
  }
  const sampledGames = games.filter(game => game.samples > 0);
  const sampledPairSizes = new Map();
  for (const game of sampledGames) sampledPairSizes.set(game.pairId, (sampledPairSizes.get(game.pairId) || 0) + 1);
  const sampledCompletePairs = [...sampledPairSizes.values()].filter(count => count === 2).length;
  const sampledPartialPairs = sampledPairSizes.size - sampledCompletePairs;
  return { schemaVersion: 1, format: 'levelup-material-dataset',
    featureNames: encoding.names, sampling: policy, identity: structuredClone(commonIdentity),
    recordedPolicy: commonPolicy, profile: { hash: profile.hash, registryHash: profile.registryHash,
      registry: profile.registry, variant: profile.variant, evaluation: profile.evaluation ?? null },
    sources: sources.map(source => ({ id: source.id, identity: structuredClone(source.identity),
      metadata: structuredClone(source.metadata ?? {}), recordsSha256: hash(source.records),
      recordsHashFormat: 'SHA-256 of JSON.stringify(records); not original journal bytes', games: source.records.length })),
    grouping: { unit: 'opening-family', openingGroups: { ...openingGroups },
      fallback: 'Opening IDs without an explicit family remain separate groups.' },
    samples, games,
    coverage: { completedGames: games.length, completePairs: pairs.size, sampledGames: sampledGames.length,
      gamesWithoutSamples: games.length - sampledGames.length, groups: new Set(sampledGames.map(game => game.groupId)).size,
      sampledPairs: sampledPairSizes.size, sampledCompletePairs, sampledPartialPairs,
      pairsWithoutSamples: pairs.size - sampledPairSizes.size,
      replayedPlies, positionsReplayed, candidates, accepted: samples.length, excluded: exclusions,
      phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, samples.filter(sample => sample.phase === phase).length])) },
    limitations: [
      'Recorded settings and replayed legal moves do not attest the executable or process identity; missing execution provenance remains unknown.',
      'Selected handicap games are a pipeline diagnostic, not a representative population of ordinary or upgraded-piece positions.',
      'Samples from the same game and related openings are dependent; use game-balanced weights and grouped validation/resampling.',
      'Material-stable windows filter recent/nearby captures and promotions but do not establish tactical quietness.',
      'Ordinary family counts plus upgrade bonuses are model features, not intrinsic exchange prices or engine MG/EG parameters.',
      'Each sampled game has total weight one; games with no accepted positions are retained in coverage but contribute no fitting weight.',
      ...(sampledPartialPairs ? [`${sampledPartialPairs} color pairs contribute samples from only one game; sampled evidence is not fully color-paired.`] : []) ] };
}

module.exports = { DEFAULT_SAMPLING, decodeMaterial, exportDataset };
