'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { UciEngine } = require('./uci');
const { checkCapabilities } = require('./capabilities');
const { STANDARD_TYPES } = require('../../src/design-catalog');
const { pieceMap } = require('../../src/profile-fen');
const standardFamilies = Object.fromEntries(Object.entries(STANDARD_TYPES).map(([family, type]) => [type, family]));

function checkAbort(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Design validation cancelled.');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  throw error;
}

/** Validate a complete design campaign without opening a results store or
 * playing games. Native checks use one temporary rules file and perft only. */
async function validateDesignConfig(input, { enginePath, signal, onProgress = () => {}, standardOpeningSources = false } = {}) {
  checkAbort(signal);
  if (input?.schemaVersion !== 2) throw new Error('Design validation requires a schemaVersion 2 configuration.');
  const config = normalizeConfig(input);
  const schedule = makeSchedule(config);
  const registry = createDesignRegistry(config);
  const profile = compileDesignProfile(registry);
  let createMatchRules;
  try { ({ createMatchRules } = require('../../dist/balance-rules.cjs')); }
  catch (error) { throw new Error('Balance rules are not built. Run npm.cmd run build first.', { cause: error }); }
  onProgress(`Validation: ${schedule.length} games, ${config.comparisons.length} comparisons, ${registry.definitions.length} design types.`);
  checkAbort(signal);
  const rules = await createMatchRules({ profile });
  checkAbort(signal);
  const starts = new Set();
  const openingPositions = new Set();
  const checked = new Set();
  let validatedOpenings = 0;
  for (const game of schedule) {
    checkAbort(signal);
    // Repetitions reuse the same opening proof, but colors are checked even
    // when the two armies happen to be identical in a control comparison.
    const key = JSON.stringify([game.comparisonId, game.aColor, game.openingId]);
    if (checked.has(key)) continue;
    checked.add(key);
    const { armyA, armyB } = game.comparison;
    const white = game.aColor === 'w' ? armyA : armyB;
    const black = game.aColor === 'w' ? armyB : armyA;
    const label = `${game.comparisonId}, ${game.openingId}, A as ${game.aColor === 'w' ? 'White' : 'Black'}`;
    let board, reference;
    try {
      const fen = rules.startingFen(white, black);
      starts.add(fen);
      board = rules.createBoard(fen);
      if (standardOpeningSources) reference = rules.createBoard(rules.startingFen({}, {}));
      if (game.openingMoves.length >= config.engine.maxPlies) throw new Error('Opening reaches the total-ply limit before engine play.');
      if (board.outcome()) throw new Error('Opening starts in a terminal position.');
      for (const move of game.openingMoves) {
        checkAbort(signal);
        if (reference) {
          const from = move.slice(0, 2);
          const expected = pieceMap(reference.fen()).get(from)?.toLowerCase();
          const actual = pieceMap(board.fen()).get(from)?.toLowerCase();
          const family = profile.definitionsByLetter[actual]?.family || standardFamilies[actual];
          if (!expected || family !== standardFamilies[expected]) {
            throw new Error(`Opening repurposes ${from}: expected a ${standardFamilies[expected] || 'standard piece'}, found ${family || 'no piece'}.`);
          }
          if (!reference.push(move)) throw new Error(`Opening move is not legal in the standard reference position: ${move}.`);
          if (reference.outcome()) throw new Error('Standard opening prefix reaches a terminal position.');
        }
        if (!board.push(move)) throw new Error(`Illegal opening move: ${move}.`);
        if (board.outcome()) throw new Error('Opening prefix reaches a terminal position.');
      }
      openingPositions.add(board.fen());
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`Design validation failed (${label}): ${error.message}`, { cause: error });
    } finally { board?.dispose(); reference?.dispose(); }
    validatedOpenings++;
    if (validatedOpenings % 100 === 0) {
      onProgress(`Validation: checked ${validatedOpenings} army/color/opening combinations.`);
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  onProgress(`Validation: all ${validatedOpenings} army/color/opening combinations are legal (${openingPositions.size} distinct resulting positions).`);
  checkAbort(signal);
  const result = {
    games: schedule.length,
    pairs: schedule.length / 2,
    comparisons: config.comparisons.length,
    definitions: registry.definitions.length,
    profileHash: profile.hash,
    registryHash: registry.hash,
    startingPositions: starts.size,
    openingPositions: openingPositions.size,
    validatedOpenings,
    movementChecks: 0,
    nativePositionChecks: 0,
    native: false,
  };
  if (enginePath === undefined) return result;

  let directory;
  let engine;
  try {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-design-validation-'));
    const variantPath = path.join(directory, 'profile.ini');
    fs.writeFileSync(variantPath, profile.config);
    const makeEngine = strength => new UciEngine({
      path: enginePath, variant: profile.variant, variantPath,
      options: { ...strength, threads: config.engine.threads, hash: config.engine.hashMb },
    });
    onProgress('Validation: checking native engine settings and movement capabilities.');
    checkAbort(signal);
    engine = makeEngine({ skill: 20 });
    await engine.start({ signal });
    const strengths = new Map(config.comparisons.flatMap(comparison => [comparison.strengthA, comparison.strengthB])
      .map(strength => [JSON.stringify(strength), strength]));
    strengths.delete(JSON.stringify({ skill: 20 }));
    for (const strength of strengths.values()) {
      checkAbort(signal);
      const strengthEngine = makeEngine(strength);
      try { await strengthEngine.start({ signal }); }
      finally { await strengthEngine.close(); }
    }
    const capabilities = await checkCapabilities({ engine, rules, startFens: [...starts], whiteKing: 0, blackKing: 0, signal });
    result.movementChecks = capabilities.probes;
    onProgress(`Validation: native engine passed ${capabilities.probes} movement checks; checking starting armies and opening positions.`);
    for (const fen of new Set([...starts, ...openingPositions])) {
      checkAbort(signal);
      const board = rules.createBoard(fen);
      try {
        const expected = [...board.moves()].sort();
        const actual = await engine.perft({ fen, signal });
        checkAbort(signal);
        if (JSON.stringify([...actual].sort()) !== JSON.stringify(expected)) {
          throw new Error(`Native engine and rules disagree for a campaign starting or opening position: ${fen}`);
        }
      } finally { board.dispose(); }
      result.nativePositionChecks++;
      if (result.nativePositionChecks % 100 === 0) onProgress(`Validation: checked ${result.nativePositionChecks} native army/opening positions.`);
    }
    result.native = true;
    onProgress(`Validation: native engine agrees at all ${result.nativePositionChecks} distinct army/opening positions. No games played.`);
    return result;
  } finally {
    try { await engine?.close(); }
    finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
  }
}

module.exports = { validateDesignConfig };
