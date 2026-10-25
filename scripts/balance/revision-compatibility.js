'use strict';

// Read-only, bounded compatibility checks for linked historical evidence.
// `eval`, value diagnostics and perft do not search or create match outcomes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { UciEngine } = require('./uci');
const { decodeMaterial } = require('./material-dataset');

const sha = value => createHash('sha256').update(value).digest('hex');
const OLD_IDS = ['bishop.purple@4', 'rook.purple@2', 'knight.purple@3', 'queen.purple@1'];
const FIELDS = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];
const MIN_SAMPLES = 16;
const MAX_SAMPLES = 48;

function abortIfNeeded(signal) {
  if (signal?.aborted) {
    const error = new Error('Parent compatibility checks cancelled.');
    error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
  }
}

/** Execute a static trace only; never issue a go command or start a search. */
async function staticEvaluation(engine, fen, { signal } = {}) {
  if (typeof fen !== 'string' || /[\r\n]/.test(fen) || fen.trim().split(/\s+/).length !== 6) throw new Error('Static evaluation requires a single six-field FEN.');
  abortIfNeeded(signal);
  if (typeof engine?._run !== 'function' || typeof engine?._exchange !== 'function') throw new Error('A compatible native static diagnostic interface is required.');
  const collected = [];
  const lines = await engine._run(signal, () => engine._exchange([`position fen ${fen}`, 'eval', 'isready'], (line, done) => {
    if (line === 'readyok') { done(collected); return; }
    if (/Unknown command:.*eval/i.test(line)) throw new Error('The native engine does not support static eval.');
    collected.push(line.trimEnd());
  }));
  abortIfNeeded(signal);
  if (!lines.some(line => /^Final evaluation\s*:?(?:\s|$)/.test(line))) throw new Error('The native engine returned no complete static evaluation trace.');
  const inCheck = lines.some(line => /^Final evaluation:\s*none \(in check\)/.test(line));
  return { available: !inCheck, trace: lines.filter(line => line !== '').join('\n') + '\n' };
}

function verifyInventory(newProfile, parentManifest, currentValues, oldValues) {
  const parent = parentManifest?.plan?.profile;
  if (!parent || parent.registry.definitions.length !== 4 || currentValues?.version !== 1
    || oldValues?.version !== 1 || parentManifest.native?.pieceValues?.version !== 1) throw new Error('Intact parent and current native value inventories are required.');
  for (const id of OLD_IDS) {
    const before = parent.registry.allocations.find(entry => entry.id === id);
    const after = newProfile.registry.allocations.find(entry => entry.id === id);
    const beforeDefinition = parent.registry.definitions.find(entry => entry.id === id);
    const afterDefinition = newProfile.registry.definitions.find(entry => entry.id === id);
    if (!isDeepStrictEqual(before, after) || !isDeepStrictEqual(beforeDefinition, afterDefinition)) throw new Error(`Parent design allocation or movement changed: ${id}.`);
  }
  const letters = ['p', 'n', 'b', 'r', 'q', 'k', ...parent.registry.allocations.map(entry => entry.letter)];
  for (const letter of letters) for (const piece of [letter, letter.toUpperCase()]) for (const field of FIELDS) {
    const expected = parentManifest.native.pieceValues.pieces[piece]?.[field];
    if (!Number.isSafeInteger(expected) || expected < 0
      || oldValues.pieces[piece]?.[field] !== expected || currentValues.pieces[piece]?.[field] !== expected) {
      throw new Error(`Historical automatic value changed: ${piece} ${field}.`);
    }
  }
  const amazonLetter = parent.registry.allocations.find(entry => entry.id === 'queen.purple@1').letter.toUpperCase();
  for (const [profile, values] of [[parent, oldValues], [newProfile, currentValues]]) {
    const active = ['p', 'n', 'b', 'r', 'q', 'k', ...profile.registry.allocations.map(entry => entry.letter)].map(letter => letter.toUpperCase());
    for (const field of ['rawMg', 'rawEg']) {
      const strongest = Math.max(...active.map(piece => values.pieces[piece]?.[field]));
      if (!Number.isFinite(strongest) || values.pieces[amazonLetter]?.[field] !== strongest) throw new Error(`Amazon is no longer the strongest active automatic ${field} type.`);
    }
  }
  return { oldAllocationsPreserved: true, inventoryMatches: true, amazonStrongestUnchanged: true,
    comparedPieceTypes: letters.length, comparedColorEntries: letters.length * 2, comparedValueFields: letters.length * 2 * FIELDS.length };
}

/** Select source-bound early/middle/late positions without playing new games. */
async function historicalPositions(parentManifest, parentRecords, rules, { signal } = {}) {
  abortIfNeeded(signal);
  const latest = new Map(parentRecords.map(record => [record.id, record]));
  const available = parentManifest.plan.schedule.map(game => latest.get(game.id))
    .filter(record => record && ['completed', 'truncated'].includes(record.status));
  const selected = new Map();
  const add = predicate => { const record = available.find(predicate); if (record) selected.set(record.id, record); };
  add(record => record.kind === 'ordinary');
  for (const id of OLD_IDS) for (const color of ['w', 'b']) add(record => record.kind === 'single' && record.designA === id && record.aColor === color);
  const comparisons = [...new Set(available.filter(record => record.kind === 'head').map(record => record.comparisonId))].sort();
  for (const comparison of comparisons) for (const color of ['w', 'b']) add(record => record.kind === 'head' && record.comparisonId === comparison && record.aColor === color);
  const candidates = [];
  for (const [index, record] of [...selected.values()].entries()) {
    abortIfNeeded(signal);
    const wanted = [0, Math.floor(record.moves.length / 2), Math.max(0, record.moves.length - 4)];
    const frames = new Map(), board = rules.createBoard(record.startFen);
    try {
      for (let ply = 0; ply <= Math.max(...wanted); ply++) {
        if (board.outcome() !== null) break;
        if (wanted.includes(ply)) frames.set(ply, { gameId: record.id, kind: record.kind, ply, fen: board.fen() });
        if (ply < Math.max(...wanted) && board.push(record.moves[ply]) !== true) throw new Error(`Cannot replay parent static diagnostic ${record.id} at ply ${ply + 1}.`);
      }
    } finally { board.dispose(); }
    // Rotate the stage priority so a bounded prefix still covers all phases.
    const ordered = wanted.map((_, offset) => wanted[(index + offset) % wanted.length]);
    candidates.push(ordered.map(ply => frames.get(ply)).filter(Boolean));
  }
  const result = [], seen = new Set();
  for (let pass = 0; pass < 3; pass++) for (const frames of candidates) {
    const sample = frames[pass];
    if (!sample || seen.has(sample.fen)) continue;
    seen.add(sample.fen); result.push(sample);
  }
  return result;
}

async function checkParentCompatibility({ engine, newProfile, parentManifest, parentRecords,
  pieceValues, enginePath = engine?.path, signal,
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules,
  engineFactory = options => new UciEngine(options) } = {}) {
  abortIfNeeded(signal);
  if (!engine || !newProfile || !Array.isArray(parentRecords) || !parentRecords.length) throw new Error('Parent compatibility requires the linked parent evidence and active engine.');
  const parentProfile = parentManifest.plan.profile;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-parent-compatibility-'));
  const variantPath = path.join(directory, 'parent.ini');
  fs.writeFileSync(variantPath, parentProfile.config);
  const oldEngine = engineFactory({ path: enginePath, variantPath, variant: parentProfile.variant,
    options: { skill: 20, threads: 1, hash: 32 } });
  try {
    await oldEngine.start({ signal });
    const oldValues = await oldEngine.pieceValues({ signal });
    const inventory = verifyInventory(newProfile, parentManifest, pieceValues, oldValues);
    const oldRules = await rulesFactory({ profile: parentProfile });
    const newRules = await rulesFactory({ profile: newProfile });
    const candidates = await historicalPositions(parentManifest, parentRecords, oldRules, { signal });
    const samples = []; let legalPositions = 0;
    for (const sample of candidates) {
      abortIfNeeded(signal);
      const boards = [oldRules.createBoard(sample.fen), newRules.createBoard(sample.fen)];
      let expected;
      try {
        const before = [...boards[0].moves()].sort(), after = [...boards[1].moves()].sort();
        if (!isDeepStrictEqual(before, after)) throw new Error('Historical browser legal moves changed under the extended profile.');
        expected = before;
      } finally { boards.forEach(board => board.dispose()); }
      const oldMoves = await oldEngine.perft({ fen: sample.fen, signal });
      const newMoves = await engine.perft({ fen: sample.fen, signal });
      if (!isDeepStrictEqual([...oldMoves].sort(), expected) || !isDeepStrictEqual([...newMoves].sort(), expected)) throw new Error('Historical native legal moves changed under the extended profile.');
      legalPositions++;
      const before = await staticEvaluation(oldEngine, sample.fen, { signal });
      const after = await staticEvaluation(engine, sample.fen, { signal });
      if (before.available !== after.available || before.trace !== after.trace) throw new Error(`Historical static evaluation changed at ${sample.gameId}, ply ${sample.ply}.`);
      if (!before.available) continue;
      samples.push({ ...sample, phase: decodeMaterial(sample.fen, parentProfile).phase,
        fenSha256: sha(sample.fen), traceSha256: sha(before.trace) });
      if (samples.length >= MAX_SAMPLES) break;
      if (samples.length % 8 === 0) { await new Promise(resolve => setImmediate(resolve)); abortIfNeeded(signal); }
    }
    if (samples.length < MIN_SAMPLES) throw new Error('Too few evaluable historical positions for linked compatibility checks.');
    const coverage = new Set(samples.map(sample => sample.kind));
    if (!['ordinary', 'single', 'head'].every(kind => coverage.has(kind))) throw new Error('Historical static checks do not cover all parent game kinds.');
    const lettersPresent = samples.map(sample => sample.fen.split(' ')[0].toLowerCase()).join('');
    if (parentProfile.registry.allocations.some(entry => !lettersPresent.includes(entry.letter))) throw new Error('Historical static checks do not cover every parent upgrade.');
    return { passed: true, ...inventory,
      staticEvaluation: { positions: samples.length, matching: true, sha256: sha(JSON.stringify(samples)), samples,
        phases: Object.fromEntries(['middlegame', 'endgame'].map(phase => [phase, samples.filter(sample => sample.phase === phase).length])) },
      legalMoves: { positions: legalPositions, matching: true }, searchesStarted: 0,
      interpretation: 'Bounded diagnostics preserve parent allocations, values and sampled static evaluation/legal behavior. Original parent manifests and policy identities remain separate; this is not a universal equivalence proof.' };
  } finally { await oldEngine.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

module.exports = { checkParentCompatibility, staticEvaluation, historicalPositions, verifyInventory };
