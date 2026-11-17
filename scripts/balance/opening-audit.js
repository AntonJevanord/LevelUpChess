'use strict';

// Read-only diagnostics for recorded forced prefixes. This module never selects
// a book, scores a match, compiles the current catalog, or changes a run folder.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { pieceMap, pocketLetters } = require('../../src/profile-fen');

const FORMAT = 'levelup-opening-audit';
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const colorOf = letter => letter === letter.toUpperCase() ? 'w' : 'b';
const copy = value => JSON.parse(JSON.stringify(value));
const abort = signal => { if (signal?.aborted) { const error = new Error('Opening audit cancelled.'); error.name = 'AbortError'; throw error; } };
const definition = (profile, letter) => profile.definitionsByLetter[letter.toLowerCase()];
const semanticId = (profile, letter) => definition(profile, letter)?.id || `standard.${letter.toLowerCase()}`;

function validateProfile(manifest) {
  const profile = manifest?.designProfile, registry = manifest?.designRegistry;
  assert.ok(profile && registry && manifest.config && Array.isArray(manifest.schedule), 'Opening diagnostics require an archived dynamic design profile, registry, config and schedule.');
  assert.equal(registry.schemaVersion, 1, 'Unsupported archived registry.');
  assert.equal(registry.hash, sha({ schemaVersion: registry.schemaVersion, definitions: registry.definitions, allocations: registry.allocations }), 'Archived registry hash changed.');
  assert.deepEqual(profile.registry, registry, 'Archived profile and registry differ.');
  assert.equal(profile.registryHash, registry.hash, 'Archived registry identity changed.');
  assert.equal(profile.hash, sha({ config: profile.config, registry }), 'Archived profile hash changed.');
  assert.ok(profile.definitionsByLetter && profile.roles && typeof profile.variant === 'string', 'A full archived profile is required.');
  for (const allocation of registry.allocations) assert.deepEqual(profile.definitionsByLetter[allocation.letter], registry.definitions.find(row => row.id === allocation.id), 'Archived letter meanings changed.');
  return profile;
}

function inventory(fen, profile) {
  const result = { board: { w: {}, b: {} }, pocket: { w: {}, b: {} },
    totals: { w: { board: 0, pocket: 0, upgradedBoard: 0, upgradedPocket: 0 }, b: { board: 0, pocket: 0, upgradedBoard: 0, upgradedPocket: 0 } } };
  const add = (letter, zone) => {
    const color = colorOf(letter), id = semanticId(profile, letter);
    result[zone][color][id] = (result[zone][color][id] || 0) + 1;
    result.totals[color][zone]++;
    if (definition(profile, letter)) result.totals[color][zone === 'board' ? 'upgradedBoard' : 'upgradedPocket']++;
  };
  for (const letter of pieceMap(fen).values()) add(letter, 'board');
  for (const letter of pocketLetters(fen)) add(letter, 'pocket');
  return result;
}

function tokenState(fen, profile) {
  const board = new Map(), pocket = new Map(), tokens = [];
  const add = (letter, location, initial = true) => {
    const color = colorOf(letter), token = { tokenId: `${color}:${location.zone}:${location.square || letter}:${tokens.length}`,
      color, letter, originalLetter: letter, designId: definition(profile, letter)?.id || null,
      initialLocation: copy(location), currentLocation: copy(location), captured: false, promoted: false, initial };
    tokens.push(token);
    if (location.zone === 'board') board.set(location.square, token);
    else { const queue = pocket.get(letter) || []; queue.push(token); pocket.set(letter, queue); }
    return token;
  };
  for (const [square, letter] of pieceMap(fen)) add(letter, { zone: 'board', square });
  for (const letter of pocketLetters(fen)) add(letter, { zone: 'pocket' });
  return { board, pocket, tokens, add };
}

function updateTokens(state, before, after, move, ply, san, profile, events) {
  const beforeMap = pieceMap(before), afterMap = pieceMap(after), turn = before.split(' ')[1];
  const drop = move.match(/^([A-Z])@([a-h][1-8])$/);
  const from = drop ? null : move.slice(0, 2), to = drop ? drop[2] : move.slice(2, 4);
  let moving;
  if (drop) {
    const letter = turn === 'w' ? drop[1] : drop[1].toLowerCase(), queue = state.pocket.get(letter) || [];
    moving = queue.shift(); assert.ok(moving, 'Recorded drop has no corresponding pocket piece.');
    events.drops.push({ ply, move, san, tokenId: moving.tokenId, color: turn, designId: moving.designId, to });
  } else {
    moving = state.board.get(from); assert.ok(moving && moving.color === turn, 'Recorded moving piece is missing.');
    state.board.delete(from);
  }
  // Opposing pieces do not relocate during an ordinary chess move. This also
  // identifies en-passant victims on a square other than the landing square.
  for (const [square, letter] of beforeMap) if (colorOf(letter) !== turn && afterMap.get(square) !== letter) {
    const victim = state.board.get(square); assert.ok(victim, 'Captured piece lineage is missing.');
    victim.captured = true; victim.currentLocation = null; state.board.delete(square);
    events.captures.push({ ply, move, san, by: turn, color: victim.color, square,
      tokenId: victim.tokenId, letter, designId: victim.designId, upgraded: !!victim.designId });
  }
  const arrived = afterMap.get(to);
  assert.ok(arrived && colorOf(arrived) === turn, 'Recorded landing piece is missing.');
  if (arrived !== moving.letter) {
    assert.ok(!drop && (moving.letter.toLowerCase() === 'p' || definition(profile, moving.letter)?.roles?.pawn), 'Unexpected transformation of a non-pawn.');
    moving.promoted = true;
    events.promotions.push({ ply, move, san, tokenId: moving.tokenId, color: turn, designId: moving.designId, from, to,
      fromLetter: moving.letter, toLetter: arrived });
  }
  moving.letter = arrived; moving.currentLocation = { zone: 'board', square: to }; state.board.set(to, moving);

  // Castling is the only additional friendly relocation in the supported
  // chess-based profiles. Match its rook by its actual archived letter.
  const missing = [...state.board.entries()].filter(([square, token]) => afterMap.get(square) !== token.letter);
  for (const [square, token] of missing) {
    state.board.delete(square);
    const destinations = [...afterMap.entries()].filter(([target, letter]) => letter === token.letter && !state.board.has(target));
    assert.ok(!drop && moving.originalLetter.toLowerCase() === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2 && destinations.length === 1,
      'Unexpected additional friendly transformation or removal during prefix.');
    const target = destinations[0][0]; token.currentLocation = { zone: 'board', square: target }; state.board.set(target, token);
    events.relocations.push({ ply, move, san, tokenId: token.tokenId, color: turn, designId: token.designId, from: square, to: target, reason: 'castling' });
  }
  assert.equal(state.board.size, afterMap.size, 'Recorded board lineage count changed.');
  for (const [square, letter] of afterMap) assert.equal(state.board.get(square)?.letter, letter, 'Recorded board lineage differs.');

  const actualPocket = new Map();
  for (const letter of pocketLetters(after)) actualPocket.set(letter, (actualPocket.get(letter) || 0) + 1);
  for (const [letter, queue] of state.pocket) assert.ok(queue.length <= (actualPocket.get(letter) || 0), 'Unexpected pocket removal without a drop.');
  for (const [letter, count] of actualPocket) while ((state.pocket.get(letter)?.length || 0) < count) {
    const token = state.add(letter, { zone: 'pocket' }, false);
    events.pocketAdditions.push({ ply, move, san, tokenId: token.tokenId, color: token.color, designId: token.designId, letter });
  }
}

async function replayPrefix({ rules, profile, startFen, openingMoves, signal }) {
  assert.ok(Array.isArray(openingMoves), 'Opening moves must be an array.');
  const board = rules.createBoard(startFen), state = tokenState(startFen, profile);
  const events = { captures: [], promotions: [], drops: [], relocations: [], pocketAdditions: [], checks: [], terminals: [] };
  const terminalBefore = board.outcome();
  let lastSan = null;
  try {
    for (const [index, move] of openingMoves.entries()) {
      abort(signal); assert.ok(board.moves().includes(move), `Illegal recorded opening move at ply ${index + 1}: ${move}.`);
      const before = board.fen(), san = board.san(move);
      assert.equal(board.push(move), true, 'The recorded opening move could not be applied.');
      updateTokens(state, before, board.fen(), move, index + 1, san, profile, events);
      if (/[+#]$/.test(san)) events.checks.push({ ply: index + 1, move, san, checkedColor: board.turn() });
      const terminal = board.outcome(); if (terminal) events.terminals.push({ ply: index + 1, ...terminal });
      lastSan = san;
    }
    const endFen = board.fen(), upgradedPieces = state.tokens.filter(token => token.initial && token.designId).map(token => ({
      tokenId: token.tokenId, designId: token.designId, color: token.color,
      initialLocation: token.initialLocation, currentLocation: token.currentLocation,
      status: token.captured ? 'captured' : token.promoted ? 'promoted' : token.currentLocation.zone,
      retainsDesign: !token.captured && !token.promoted && token.letter.toLowerCase() === token.originalLetter.toLowerCase(),
    }));
    const flags = [];
    if (events.captures.length) flags.push('forced-prefix-capture');
    if (events.captures.some(row => row.upgraded)) flags.push('upgraded-piece-captured-during-prefix');
    if (events.promotions.some(row => row.designId)) flags.push('upgraded-pawn-promoted-during-prefix');
    if (events.drops.length) flags.push('reserve-deployed-during-prefix');
    if (events.checks.length) flags.push('forced-prefix-check');
    if (terminalBefore || events.terminals.length) flags.push('terminal-position-during-prefix');
    return { startFen, endFen, openingMoves: [...openingMoves], before: inventory(startFen, profile), after: inventory(endFen, profile), events,
      upgradedPieces, flags, startInCheck: null, endInCheck: lastSan === null ? null : /[+#]$/.test(lastSan),
      terminalBefore, terminalAfter: board.outcome() };
  } finally { board.dispose(); }
}

function normalizeEvaluation(result, fen) {
  const info = result?.info || result, input = info?.score;
  if (!input) return { available: false, perspective: 'white', reason: 'No score returned.' };
  assert.ok(['cp', 'mate'].includes(input.type) && Number.isSafeInteger(input.value), 'Unsupported diagnostic engine score.');
  assert.ok(!input.bound || ['lowerbound', 'upperbound'].includes(input.bound), 'Unsupported diagnostic score bound.');
  const black = fen.split(' ')[1] === 'b', score = { type: input.type, value: (black ? -1 : 1) * input.value };
  if (input.bound) score.bound = black ? input.bound === 'lowerbound' ? 'upperbound' : 'lowerbound' : input.bound;
  const output = { available: true, perspective: 'white', score };
  for (const key of ['depth', 'seldepth', 'nodes', 'time', 'nps', 'pv', 'raw']) if (info[key] !== undefined) output[key] = copy(info[key]);
  if (result?.move !== undefined) output.move = result.move;
  return output;
}

function validateRecord(record, planned, manifest, rules, requireWholePrefix = true) {
  assert.ok(record && planned, 'Unknown recorded scheduled game.');
  assert.equal(record.schemaVersion, 1, 'Unsupported recorded game schema.');
  for (const key of ['id', 'pairId', 'comparisonId', 'openingId', 'repetition', 'aColor']) assert.deepEqual(record[key], planned[key], `Recorded ${key} differs from the schedule.`);
  assert.ok(['w', 'b'].includes(record.aColor) && Number.isSafeInteger(record.attempt) && record.attempt >= 1, 'Invalid recorded color or attempt.');
  const comparison = manifest.config.comparisons.find(row => row.id === planned.comparisonId);
  const opening = manifest.config.openings.find(row => row.id === planned.openingId);
  assert.ok(comparison && opening, 'Scheduled comparison or opening is absent from the config.');
  assert.deepEqual(planned.comparison, comparison, 'Scheduled armies differ from the archived config.');
  assert.deepEqual(planned.openingMoves, opening.moves, 'Scheduled prefix differs from the archived config.');
  assert.deepEqual(record.openingMoves, opening.moves, 'Recorded prefix differs from the archived config.');
  assert.equal(record.openingPlies, opening.moves.length, 'Recorded opening-ply count changed.');
  assert.ok(Array.isArray(record.moves) && (!requireWholePrefix || record.moves.length >= opening.moves.length), 'Recorded game does not contain its whole forced prefix.');
  assert.deepEqual(record.moves.slice(0, opening.moves.length), opening.moves.slice(0, record.moves.length), 'Recorded game does not begin with the declared prefix.');
  assert.equal(record.profileHash, manifest.designProfile.hash, 'Recorded profile hash changed.');
  assert.equal(record.registryHash, manifest.designRegistry.hash, 'Recorded registry hash changed.');
  assert.equal(record.variant, manifest.designProfile.variant, 'Recorded variant changed.');
  assert.equal(record.registryReference, 'run.json#designRegistry', 'Recorded registry reference changed.');
  assert.equal(record.comparisonLabel, comparison.label, 'Recorded comparison label changed.');
  assert.deepEqual(record.engine, manifest.config.engine, 'Recorded search policy changed.');
  assert.deepEqual(record.evaluation ?? null, manifest.config.evaluation ?? null, 'Recorded value policy changed.');
  assert.deepEqual(record.whiteStrength, record.aColor === 'w' ? comparison.strengthA : comparison.strengthB, 'Recorded White strength changed.');
  assert.deepEqual(record.blackStrength, record.aColor === 'b' ? comparison.strengthA : comparison.strengthB, 'Recorded Black strength changed.');
  const white = record.aColor === 'w' ? comparison.armyA : comparison.armyB;
  const black = record.aColor === 'b' ? comparison.armyA : comparison.armyB;
  assert.equal(record.startFen, rules.startingFen(white, black), 'Recorded starting army differs from the archived profile.');
  return { comparison, opening };
}

async function auditGames(sources, options = {}) {
  const { evaluate, inspectPosition, nodes = 10000, evaluationIdentity = '', signal, onProgress = () => {},
    createRules = require('../../dist/balance-rules.cjs').createMatchRules } = options;
  assert.ok(Array.isArray(sources) && sources.length, 'Supply at least one recorded source.');
  assert.ok(Number.isSafeInteger(nodes) && nodes > 0 && nodes <= 100000000, 'Diagnostic nodes must be a positive bounded integer.');
  assert.ok(evaluate === undefined || typeof evaluate === 'function', 'Diagnostic evaluator must be a function.');
  assert.ok(inspectPosition === undefined || typeof inspectPosition === 'function', 'Position inspector must be a function.');
  const counts = { inputAttempts: 0, latestGames: 0, eligibleGames: 0, skippedUnfinished: 0, duplicateCopiesIgnored: 0,
    uniquePositions: 0, evaluationCalls: 0, evaluationCacheHits: 0 };
  const groups = new Map(), ruleCache = new Map(), evaluationCache = new Map(), inspectionCache = new Map(), attempts = new Map();
  const mergedSources = new Map();
  for (const [index, source] of sources.entries()) {
    const id = source.id || source.manifest?.runId || `source-${index}`;
    assert.ok(Array.isArray(source.records), 'Recorded source requires journal records.');
    if (!mergedSources.has(id)) mergedSources.set(id, { id, manifest: source.manifest, records: [...source.records] });
    else {
      const earlier = mergedSources.get(id);
      assert.deepEqual(earlier.manifest, source.manifest, 'Repeated source identity has conflicting manifests.');
      earlier.records.push(...source.records);
    }
  }
  const evaluatePosition = async (profile, fen) => {
    const key = sha({ profileHash: profile.hash, fen, nodes, evaluationIdentity });
    if (evaluationCache.has(key)) { counts.evaluationCacheHits++; return copy(await evaluationCache.get(key)); }
    counts.evaluationCalls++;
    const pending = Promise.resolve(evaluate({ profile, fen, nodes, signal })).then(result => normalizeEvaluation(result, fen));
    evaluationCache.set(key, pending); return copy(await pending);
  };
  const inspect = async (profile, fen) => {
    const key = sha({ profileHash: profile.hash, fen });
    if (!inspectionCache.has(key)) inspectionCache.set(key, Promise.resolve(inspectPosition({ profile, fen, signal })));
    return copy(await inspectionCache.get(key));
  };
  const archivedRules = async profile => {
    let rules = ruleCache.get(profile.hash);
    if (rules) ruleCache.delete(profile.hash);
    else rules = await createRules({ profile });
    ruleCache.set(profile.hash, rules);
    // Each rules object retains its WASM module. Cross-level archives may use
    // many mappings, so do not keep a module alive for every source profile.
    while (ruleCache.size > 2) ruleCache.delete(ruleCache.keys().next().value);
    return rules;
  };
  for (const source of mergedSources.values()) {
    abort(signal);
    const manifest = source.manifest, profile = validateProfile(manifest), sourceId = source.id;
    const rules = await archivedRules(profile), planned = new Map(manifest.schedule.map(row => [row.id, row]));
    assert.equal(planned.size, manifest.schedule.length, 'Archived schedule repeats a game.');
    const latest = new Map();
    for (const record of source.records) {
      counts.inputAttempts++;
      const key = `${sourceId}:${record.id}:${record.attempt}`;
      if (attempts.has(key)) {
        assert.ok(isDeepStrictEqual(attempts.get(key), record), 'Conflicting copies of a recorded attempt.');
        counts.duplicateCopiesIgnored++; continue;
      }
      attempts.set(key, record);
      if (!latest.has(record.id) || latest.get(record.id).attempt < record.attempt) latest.set(record.id, record);
    }
    for (const record of latest.values()) {
      abort(signal); counts.latestGames++;
      assert.ok(['completed', 'truncated', 'error', 'aborted'].includes(record.status), 'Unsupported recorded game status.');
      const eligible = ['completed', 'truncated'].includes(record.status);
      const { comparison } = validateRecord(record, planned.get(record.id), manifest, rules, eligible);
      if (!eligible) { counts.skippedUnfinished++; continue; }
      counts.eligibleGames++;
      const key = sha({ profileHash: profile.hash, engine: record.engine, evaluation: record.evaluation ?? null,
        comparisonId: record.comparisonId, armyA: comparison.armyA, armyB: comparison.armyB,
        openingId: record.openingId, aColor: record.aColor, openingMoves: record.openingMoves, startFen: record.startFen });
      if (!groups.has(key)) {
        const replay = await replayPrefix({ rules, profile, startFen: record.startFen, openingMoves: record.openingMoves, signal });
        const row = { key, sourceIds: [], gameIds: [], recordReferences: [], profileHash: profile.hash, registryHash: profile.registryHash,
          variant: profile.variant, comparisonId: record.comparisonId, comparisonLabel: comparison.label,
          openingId: record.openingId, aColor: record.aColor, repetitions: [], recordedEngine: copy(record.engine), ...replay };
        if (inspectPosition) {
          row.tactics = { before: await inspect(profile, row.startFen), after: await inspect(profile, row.endFen) };
          for (const [stage, field] of [['before', 'startInCheck'], ['after', 'endInCheck']]) {
            const inspection = row.tactics[stage];
            if (typeof inspection?.inCheck === 'boolean') row[field] = inspection.inCheck;
            else if (typeof inspection?.turnInCheck === 'boolean') row[field] = inspection.turnInCheck;
          }
          if (row.tactics.after?.upgradedPieces?.some(piece => piece.royalShieldPin?.exposesCheck)) row.flags.push('upgrade-pin-after-prefix');
          if (row.tactics.after?.upgradedPieces?.some(piece => piece.captureThreats?.some(threat => threat.unrecapturedCandidate))) row.flags.push('unrecaptured-capture-candidate-after-prefix');
        } else row.tactics = { available: false, reason: 'No tactical inspector supplied.' };
        if (row.endInCheck && !row.flags.includes('forced-prefix-check')) row.flags.push('check-after-prefix');
        if (evaluate) {
          const before = await evaluatePosition(profile, row.startFen), after = await evaluatePosition(profile, row.endFen);
          const exactCp = value => value.available && value.score.type === 'cp' && !value.score.bound;
          const deltaCp = exactCp(before) && exactCp(after) ? after.score.value - before.score.value : null;
          row.evaluation = { before, after, deltaCp, deltaCpWhite: deltaCp, deltaCpA: deltaCp === null ? null : deltaCp * (row.aColor === 'w' ? 1 : -1) };
        }
        groups.set(key, row); counts.uniquePositions++;
        onProgress({ positions: counts.uniquePositions, evaluationCalls: counts.evaluationCalls, comparisonId: row.comparisonId, openingId: row.openingId });
      }
      const row = groups.get(key);
      if (!row.sourceIds.includes(sourceId)) row.sourceIds.push(sourceId);
      if (!row.gameIds.includes(record.id)) row.gameIds.push(record.id);
      if (!row.repetitions.includes(record.repetition)) row.repetitions.push(record.repetition);
      row.recordReferences.push({ sourceId, id: record.id, attempt: record.attempt, status: record.status });
    }
  }
  return { schemaVersion: 1, format: FORMAT, scope: 'recorded-forced-prefix-only', nodes: evaluate ? nodes : null,
    evaluationIdentity: evaluate ? evaluationIdentity : null, counts, positions: [...groups.values()],
    notes: ['Only the recorded forced opening prefix is replayed; later engine play and recorded game outcomes are not independently verified.',
      'Flags and evaluations are diagnostics, not a selection rule. No opening is removed, reranked, or chosen for a match.',
      'Centipawn swings compare engine estimates under the archived profile; they are not material values or causal upgrade effects.',
      'Capture candidates and pins are not proofs that material will be lost; principal variations require human review.'] };
}

module.exports = { FORMAT, validateProfile, inventory, replayPrefix, normalizeEvaluation, auditGames };
