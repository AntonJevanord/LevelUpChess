'use strict';

// Bounded checks for the two inherited profiles. The simple replay descriptor
// is derived evidence, not the historical collection manifest or engine audit.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { UciEngine } = require('./uci');
const { decodeMaterial } = require('./material-dataset');
const { checkParentCompatibility, staticEvaluation, historicalPositions } = require('./revision-compatibility');

const FIELDS = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];
const MIN_SAMPLES = 16;
const MAX_SAMPLES = 48;
const sha = value => createHash('sha256').update(value).digest('hex');

function abortIfNeeded(signal) {
  if (signal?.aborted) {
    const error = new Error('Bishop compatibility checks cancelled.');
    error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
  }
}

function verifySimpleInventory(newProfile, simpleManifest, currentValues, simpleValues) {
  const before = simpleManifest?.plan?.profile;
  if (!before || before.registry?.definitions?.length !== 8 || currentValues?.version !== 1 || simpleValues?.version !== 1) {
    throw new Error('Intact simple profile and current native value inventories are required.');
  }
  for (const definition of before.registry.definitions) {
    const id = definition.id;
    const oldAllocation = before.registry.allocations.find(entry => entry.id === id);
    const newAllocation = newProfile.registry.allocations.find(entry => entry.id === id);
    const newDefinition = newProfile.registry.definitions.find(entry => entry.id === id);
    if (!isDeepStrictEqual(oldAllocation, newAllocation) || !isDeepStrictEqual(definition, newDefinition)) {
      throw new Error(`Simple design allocation or movement changed: ${id}.`);
    }
    if (!isDeepStrictEqual(before.evaluation?.pieceValues?.[id], newProfile.evaluation?.pieceValues?.[id])) {
      throw new Error(`Simple evaluation policy changed: ${id}.`);
    }
  }
  const letters = ['p', 'n', 'b', 'r', 'q', 'k', ...before.registry.allocations.map(entry => entry.letter)];
  for (const letter of letters) for (const piece of [letter, letter.toUpperCase()]) for (const field of FIELDS) {
    const expected = simpleValues.pieces?.[piece]?.[field];
    if (!Number.isSafeInteger(expected) || expected < 0 || currentValues.pieces?.[piece]?.[field] !== expected) {
      throw new Error(`Reconstructed simple native value changed: ${piece} ${field}.`);
    }
  }
  // Inherited explicit priors are checked against the declaration as well as
  // against one another; two equally wrong inventories must not pass.
  for (const allocation of before.registry.allocations) {
    const declared = before.evaluation?.pieceValues?.[allocation.id];
    if (!declared) continue;
    for (const piece of [allocation.letter, allocation.letter.toUpperCase()]) for (const field of FIELDS) {
      if (simpleValues.pieces[piece]?.[field] !== declared[field.endsWith('Mg') ? 'mg' : 'eg']) {
        throw new Error(`Declared simple native prior changed: ${piece} ${field}.`);
      }
    }
  }
  const amazon = before.registry.allocations.find(entry => entry.id === 'queen.purple@1')?.letter.toUpperCase();
  if (!amazon) throw new Error('The historical Amazon reference is required.');
  for (const [profile, values] of [[before, simpleValues], [newProfile, currentValues]]) {
    const active = ['p', 'n', 'b', 'r', 'q', 'k', ...profile.registry.allocations.map(entry => entry.letter)];
    for (const field of FIELDS) for (const color of ['white', 'black']) {
      const types = color === 'white' ? active.map(letter => letter.toUpperCase()) : active;
      const expected = values.pieces[color === 'white' ? amazon : amazon.toLowerCase()]?.[field];
      const strongest = Math.max(...types.map(piece => values.pieces[piece]?.[field]));
      if (!Number.isFinite(strongest) || expected !== strongest) throw new Error(`Amazon is no longer the strongest active ${color} ${field} type.`);
    }
  }
  return { oldAllocationsPreserved: true, inventoryMatches: true, amazonStrongestUnchanged: true,
    comparedPieceTypes: letters.length, comparedColorEntries: letters.length * 2,
    comparedValueFields: letters.length * 2 * FIELDS.length,
    historicalCollectionManifestSupplied: false, historicalNativeInventoryVerified: false,
    inventoryBasis: 'Fresh native diagnostics of the reconstructed canonical simple profile and current profile; no original simple-run native inventory was supplied.' };
}

/** Include original games because the simple journal itself never plays the
 * historical bishop/rook. All eight retained types must occur in the probes. */
async function simpleHistoricalPositions(simpleManifest, simpleRecords, parentManifest, parentRecords, rules, { signal } = {}) {
  abortIfNeeded(signal);
  if (!Array.isArray(simpleRecords) || !Array.isArray(parentRecords)) throw new Error('Both linked journals are required for simple compatibility.');
  const merged = { plan: { ...simpleManifest.plan,
    schedule: [...parentManifest.plan.schedule, ...simpleManifest.plan.schedule] } };
  const sourceIds = new Set(simpleManifest.plan.schedule.map(game => game.id));
  const positions = await historicalPositions(merged, [...parentRecords, ...simpleRecords], rules, { signal });
  return positions.map(sample => ({ ...sample, sourceContext: sourceIds.has(sample.gameId) ? 'simple' : 'original' }));
}

async function checkBishopCompatibility({ engine, newProfile, parentManifest, parentRecords,
  simpleManifest, simpleRecords, pieceValues, enginePath = engine?.path, signal,
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules,
  engineFactory = options => new UciEngine(options) } = {}) {
  abortIfNeeded(signal);
  if (!engine || !newProfile || !parentManifest || !Array.isArray(parentRecords) || !parentRecords.length
    || !simpleManifest?.plan?.profile || !Array.isArray(simpleRecords) || !simpleRecords.length
    || simpleManifest.provenance?.originalManifestSupplied !== false
    || simpleManifest.provenance?.historicalNativeInventoryVerified !== false) {
    throw new Error('Original parent evidence and the explicitly derived simple replay source are required.');
  }
  const parentCompatibility = await checkParentCompatibility({ engine, newProfile, parentManifest, parentRecords,
    pieceValues, enginePath, signal, rulesFactory, engineFactory });
  abortIfNeeded(signal);
  const oldProfile = simpleManifest.plan.profile;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-bishop-compatibility-'));
  const variantPath = path.join(directory, 'simple.ini');
  fs.writeFileSync(variantPath, oldProfile.config);
  const oldEngine = engineFactory({ path: enginePath, variantPath, variant: oldProfile.variant,
    options: { skill: 20, threads: 1, hash: 32 } });
  try {
    await oldEngine.start({ signal });
    const oldValues = await oldEngine.pieceValues({ signal });
    const inventory = verifySimpleInventory(newProfile, simpleManifest, pieceValues, oldValues);
    const oldRules = await rulesFactory({ profile: oldProfile });
    const newRules = await rulesFactory({ profile: newProfile });
    const candidates = await simpleHistoricalPositions(simpleManifest, simpleRecords, parentManifest, parentRecords, oldRules, { signal });
    const samples = []; let legalPositions = 0;
    for (const sample of candidates) {
      abortIfNeeded(signal);
      const boards = [oldRules.createBoard(sample.fen), newRules.createBoard(sample.fen)];
      let expected;
      try {
        expected = [...boards[0].moves()].sort();
        if (!isDeepStrictEqual(expected, [...boards[1].moves()].sort())) throw new Error('Historical simple browser legal moves changed under the bishop profile.');
      } finally { boards.forEach(board => board.dispose()); }
      const beforeMoves = await oldEngine.perft({ fen: sample.fen, signal });
      const afterMoves = await engine.perft({ fen: sample.fen, signal });
      if (!isDeepStrictEqual([...beforeMoves].sort(), expected) || !isDeepStrictEqual([...afterMoves].sort(), expected)) {
        throw new Error('Historical simple native legal moves changed under the bishop profile.');
      }
      legalPositions++;
      const before = await staticEvaluation(oldEngine, sample.fen, { signal });
      const after = await staticEvaluation(engine, sample.fen, { signal });
      if (before.available !== after.available || before.trace !== after.trace) {
        throw new Error(`Historical simple static evaluation changed at ${sample.gameId}, ply ${sample.ply}.`);
      }
      if (!before.available) continue;
      samples.push({ ...sample, phase: decodeMaterial(sample.fen, oldProfile).phase,
        fenSha256: sha(sample.fen), traceSha256: sha(before.trace) });
      if (samples.length >= MAX_SAMPLES) break;
      if (samples.length % 8 === 0) { await new Promise(resolve => setImmediate(resolve)); abortIfNeeded(signal); }
    }
    if (samples.length < MIN_SAMPLES) throw new Error('Too few evaluable historical simple positions for compatibility checks.');
    const kinds = new Set(samples.map(sample => sample.kind)), contexts = new Set(samples.map(sample => sample.sourceContext));
    if (!['ordinary', 'single', 'head'].every(kind => kinds.has(kind)) || !['original', 'simple'].every(context => contexts.has(context))) {
      throw new Error('Historical simple checks do not cover both sources and all game kinds.');
    }
    const lettersPresent = samples.map(sample => sample.fen.split(' ')[0].toLowerCase()).join('');
    if (oldProfile.registry.allocations.some(entry => !lettersPresent.includes(entry.letter))) throw new Error('Historical static checks do not cover every retained simple upgrade.');
    const simpleCompatibility = { passed: true, ...inventory,
      staticEvaluation: { positions: samples.length, matching: true, sha256: sha(JSON.stringify(samples)), samples,
        phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, samples.filter(sample => sample.phase === phase).length])) },
      legalMoves: { positions: legalPositions, matching: true }, searchesStarted: 0 };
    return { passed: true, parentCompatibility, simpleCompatibility, searchesStarted: 0,
      historicalCollectionManifestSupplied: false, historicalNativeInventoryVerified: false,
      interpretation: 'Bounded diagnostics preserve inherited definitions, allocations, policy tables and sampled static/legal behavior. The supplied simple descriptor is derived replay evidence; its original manifest, historical native inventory and actual executable remain unverified. No universal policy-equivalence or historical binary attestation is claimed.' };
  } finally { await oldEngine.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

module.exports = { checkBishopCompatibility, verifySimpleInventory, simpleHistoricalPositions };
