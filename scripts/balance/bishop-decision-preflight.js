'use strict';

// Fresh, bounded diagnostics for the decision campaign. Archived tables and
// sampled histories provide compatibility evidence; historical collection
// process manifests were not supplied.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { UciEngine } = require('./uci');
const { checkCapabilities } = require('./capabilities');
const { staticEvaluation, historicalPositions } = require('./revision-compatibility');
const { getDecisionProtocol, validateDecisionStage } = require('./bishop-decision-plan');

const ROOT = path.resolve(__dirname, '../..');
const FIELDS = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];
const ORDINARY = { p: [126, 208], n: [781, 854], b: [825, 915], r: [1276, 1380], q: [2538, 2682], k: [0, 0] };
const ARCHIVES = {
  restore: { file: 'experiments/balance/results/reference-revisions-preflight-001.json', sha256: 'd10aeefcbd0d49de62d7b3ebe31cfa66a7befeba8af238de3ce8c944a2489004' },
  compare: { file: 'experiments/balance/results/bishop-reference-preflight-001.json', sha256: 'fa39093193db46d29a08afea8acf26ba41db14212f36c7726815a3edd8a5a0d8' },
};
const PROMOTION_PROBES = [
  { name: 'White mandatory ordinary promotion', fen: '8/1P6/7k/8/8/8/8/K7 w - - 0 1' },
  { name: 'Black mandatory ordinary promotion', fen: 'k7/8/8/8/8/7K/1p6/8 b - - 0 1' },
];
const sha = value => createHash('sha256').update(value).digest('hex');

function abortIfNeeded(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Decision preflight cancelled.');
  error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
}

function archivedInventory(key, profile) {
  const descriptor = ARCHIVES[key];
  const text = fs.readFileSync(path.join(ROOT, descriptor.file), 'utf8').replace(/\r\n/g, '\n');
  if (sha(text) !== descriptor.sha256) throw new Error('The archived decision preflight evidence changed.');
  const archive = JSON.parse(text);
  if (archive.profileHash !== profile.hash || archive.registryHash !== profile.registry.hash
    || archive.native?.pieceValues?.version !== 1) throw new Error('The archived native inventory does not identify its canonical profile.');
  return archive.native.pieceValues;
}

function validateInventory(values, profile) {
  const letters = [...Object.keys(ORDINARY), ...profile.registry.allocations.map(item => item.letter)];
  if (values?.version !== 1 || !values.pieces || typeof values.pieces !== 'object' || Array.isArray(values.pieces)
    || Object.keys(values.pieces).length !== letters.length * 2) throw new Error('An exact active native value inventory is required.');
  for (const letter of letters) for (const field of FIELDS) {
    const white = values.pieces[letter.toUpperCase()]?.[field], black = values.pieces[letter]?.[field];
    if (!Number.isSafeInteger(white) || white < 0 || white !== black || letter !== 'k' && white === 0) {
      throw new Error(`Invalid or asymmetric native value: ${letter} ${field}.`);
    }
    if (ORDINARY[letter] && white !== ORDINARY[letter][field.endsWith('Mg') ? 0 : 1]) {
      throw new Error(`Ordinary native value changed: ${letter} ${field}.`);
    }
  }
  for (const [id, expected] of [['queen.purple@1', [3738, 3875]], ['knight.purple@3', [1663, 1877]]]) {
    const letter = profile.registry.allocations.find(item => item.id === id)?.letter;
    for (const field of FIELDS) if (values.pieces[letter]?.[field] !== expected[field.endsWith('Mg') ? 0 : 1]) {
      throw new Error(`Retained reference native value changed: ${id} ${field}.`);
    }
  }
  const amazon = profile.registry.allocations.find(item => item.id === 'queen.purple@1').letter;
  for (const field of FIELDS) if (values.pieces[amazon][field] !== Math.max(...letters.map(letter => values.pieces[letter][field]))) {
    throw new Error(`Amazon is no longer the strongest active native ${field} type.`);
  }
}

function compareInventory(profile, retainedProfile, values, archived) {
  validateInventory(values, profile);
  for (const definition of retainedProfile.registry.definitions) {
    const allocation = retainedProfile.registry.allocations.find(item => item.id === definition.id);
    if (!isDeepStrictEqual(profile.registry.definitions.find(item => item.id === definition.id), definition)
      || !isDeepStrictEqual(profile.registry.allocations.find(item => item.id === definition.id), allocation)) {
      throw new Error(`A retained definition or allocation changed: ${definition.id}.`);
    }
  }
  if (!isDeepStrictEqual(profile.evaluation, retainedProfile.evaluation)) throw new Error('The retained native evaluation policy changed.');
  const letters = [...Object.keys(ORDINARY), ...retainedProfile.registry.allocations.map(item => item.letter)];
  for (const letter of letters) for (const piece of [letter, letter.toUpperCase()]) for (const field of FIELDS) {
    if (values.pieces[piece]?.[field] !== archived.pieces[piece]?.[field]) throw new Error(`Archived native value changed: ${piece} ${field}.`);
  }
  if (profile.registry.definitions.length !== retainedProfile.registry.definitions.length) {
    const added = profile.registry.allocations.find(item => item.id === 'bishop.purple@13');
    if (added?.letter !== 'm') throw new Error('The new bishop allocation must remain m.');
    for (const piece of ['m', 'M']) for (const field of FIELDS) if (values.pieces[piece][field] !== (field.endsWith('Mg') ? 1858 : 1903)) {
      throw new Error(`New bishop native value changed: ${piece} ${field}.`);
    }
  }
  return { oldAllocationsPreserved: true, inventoryMatches: true, archivedPreflightInventoryMatches: true,
    amazonStrongestUnchanged: true, comparedPieceTypes: letters.length, comparedColorEntries: letters.length * 2,
    comparedValueFields: letters.length * 2 * FIELDS.length, currentPieceTypes: profile.registry.definitions.length + 6 };
}

async function compatibility({ plan, library, rules, engine, oldEngine, pieceValues, oldValues, archived, rulesFactory, signal }) {
  const identical = plan.key === 'restore', retainedProfile = identical ? library.revision.profile : library.old.profile;
  const inventory = compareInventory(plan.profile, retainedProfile, pieceValues, archived);
  if (!identical) compareInventory(retainedProfile, retainedProfile, oldValues, archived);
  const records = identical ? library.restoredRecords : library.bishopRecords;
  const oldRules = identical ? rules : await rulesFactory({ profile: retainedProfile });
  const openingIds = [...new Set(records.map(record => record.openingId))].sort().slice(0, 3);
  const candidates = [], seenFens = new Set();
  for (const openingId of openingIds) {
    const block = records.filter(record => record.openingId === openingId);
    const descriptor = { plan: { profile: retainedProfile, schedule: block.map(record => ({ id: record.id })) } };
    for (const sample of await historicalPositions(descriptor, block, oldRules, { signal })) {
      if (seenFens.has(sample.fen)) continue;
      seenFens.add(sample.fen); candidates.push(sample);
    }
  }
  // Every selected matchup contributes both start colors before later frames.
  candidates.sort((a, b) => Number(b.ply === 0) - Number(a.ply === 0));
  const samples = [], limit = identical ? 10 : 30;
  let legalPositions = 0;
  for (const sample of candidates) {
    abortIfNeeded(signal);
    const boards = [oldRules.createBoard(sample.fen), rules.createBoard(sample.fen)];
    let expected;
    try {
      expected = [...boards[0].moves()].sort();
      if (!isDeepStrictEqual(expected, [...boards[1].moves()].sort())) throw new Error('Retained browser legal moves changed under the decision profile.');
    } finally { boards.forEach(board => board.dispose()); }
    const currentMoves = await engine.perft({ fen: sample.fen, signal });
    const oldMoves = identical ? currentMoves : await oldEngine.perft({ fen: sample.fen, signal });
    abortIfNeeded(signal);
    if (!isDeepStrictEqual([...currentMoves].sort(), expected) || !isDeepStrictEqual([...oldMoves].sort(), expected)) {
      throw new Error('Retained native legal moves changed under the decision profile.');
    }
    legalPositions++;
    const before = await staticEvaluation(identical ? engine : oldEngine, sample.fen, { signal });
    const after = identical ? before : await staticEvaluation(engine, sample.fen, { signal });
    if (before.available !== after.available || before.trace !== after.trace) throw new Error(`Retained static evaluation changed: ${sample.gameId}, ply ${sample.ply}.`);
    if (!before.available) continue;
    samples.push({ ...sample, fenSha256: sha(sample.fen), traceSha256: sha(before.trace) });
    if (samples.length >= limit) break;
  }
  if (samples.length < (identical ? 10 : 16)) throw new Error('Too few evaluable retained positions for decision compatibility.');
  if (!identical) {
    const byId = new Map(records.map(record => [record.id, record]));
    const coverage = new Map();
    for (const sample of samples) {
      const record = byId.get(sample.gameId), colors = coverage.get(record.comparisonId) || new Set();
      colors.add(record.aColor); coverage.set(record.comparisonId, colors);
    }
    if ([...new Set(records.map(record => record.comparisonId))].some(id => coverage.get(id)?.size !== 2)) {
      throw new Error('Decision compatibility samples do not cover both colors of every retained matchup.');
    }
  }
  const played = identical ? ['bishop.purple@7', 'knight.purple@3', 'queen.purple@1']
    : ['bishop.purple@4', 'bishop.purple@7', 'bishop.purple@9', 'bishop.purple@11', 'bishop.purple@12', 'rook.purple@10'];
  const present = samples.map(sample => sample.fen.split(' ')[0].toLowerCase()).join('');
  if (played.some(id => !present.includes(retainedProfile.registry.allocations.find(item => item.id === id).letter))) {
    throw new Error('Decision compatibility samples do not cover every retained matchup type.');
  }
  return { passed: true, profileIdentical: identical, ...inventory, sourceProfileHash: retainedProfile.hash,
    sourceGames: records.length, candidateOpeningIds: openingIds,
    historicalCollectionManifestSupplied: false, historicalProcessIdentityVerified: false,
    staticEvaluation: { positions: samples.length, matching: true,
      comparisonBasis: identical ? 'Identical canonical profile with fresh diagnostics; historical process traces were not supplied.'
        : 'Exact equality of fresh native traces under the retained and expanded canonical profiles.',
      sha256: sha(JSON.stringify(samples)), samples },
    legalMoves: { positions: legalPositions, matching: true }, searchesStarted: 0,
    interpretation: identical
      ? 'Fresh native values match the archived revision preflight under its identical canonical profile; sampled recovered histories pass native/browser legal and static diagnostics. The historical collection process manifest was not supplied.'
      : 'Fresh old/new native values match the archived bishop preflight for all retained types; bounded source positions match legal moves and static traces. The historical collection process manifest was not supplied; this is not a universal equivalence proof.' };
}

/** Diagnostics only: no newGame, node search, movetime search or game outcome. */
async function checkDecisionStage({ plan, enginePath, signal,
  engineFactory = options => new UciEngine(options),
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules } = {}) {
  validateDecisionStage(plan); abortIfNeeded(signal);
  if (!plan.schedule.length) throw new Error('Decision preflight requires a nonempty stage.');
  const library = getDecisionProtocol(), retained = plan.key === 'restore' ? library.revision.profile : library.old.profile;
  const archived = archivedInventory(plan.key, retained);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-decision-preflight-'));
  const engines = [];
  let failure;
  const startEngine = async (profile, name) => {
    abortIfNeeded(signal);
    const variantPath = path.join(directory, name);
    fs.writeFileSync(variantPath, profile.config);
    const engine = engineFactory({ path: enginePath, variantPath, variant: profile.variant,
      options: { skill: 20, threads: 1, hash: 32 } });
    engines.push(engine);
    const metadata = await engine.start({ signal });
    abortIfNeeded(signal);
    return { engine, metadata };
  };
  try {
    const rules = await rulesFactory({ profile: plan.profile });
    const { engine, metadata } = await startEngine(plan.profile, 'decision.ini');
    const pieceValues = await engine.pieceValues({ signal });
    compareInventory(plan.profile, retained, pieceValues, archived);
    const previous = plan.key === 'compare' ? await startEngine(retained, 'retained.ini') : null;
    const oldValues = previous ? await previous.engine.pieceValues({ signal }) : pieceValues;
    const compatible = await compatibility({ plan, library, rules, engine, oldEngine: previous?.engine,
      pieceValues, oldValues, archived, rulesFactory, signal });
    const starts = [...new Set(plan.schedule.map(game => game.startFen))];
    const capabilities = await checkCapabilities({ engine, rules, startFens: starts, whiteKing: 0, blackKing: 0, signal });
    for (const fen of [...starts, ...PROMOTION_PROBES.map(probe => probe.fen)]) {
      abortIfNeeded(signal);
      const board = rules.createBoard(fen);
      try {
        if (board.outcome()) throw new Error('A decision starting position or promotion probe is terminal.');
        const expected = [...board.moves()].sort(), actual = await engine.perft({ fen, signal });
        abortIfNeeded(signal);
        if (!isDeepStrictEqual([...actual].sort(), expected)) throw new Error('Native and browser legal moves disagree at a decision start.');
      } finally { board.dispose(); }
    }
    return { engineName: metadata?.idname || null, pieceValues, startingPositions: starts.length,
      capabilityProbes: capabilities.probes + PROMOTION_PROBES.length, roleProbes: PROMOTION_PROBES.length,
      compatibility: compatible, searchesStarted: 0 };
  } catch (error) { failure = error; throw error; }
  finally {
    const closed = await Promise.allSettled(engines.map(engine => Promise.resolve().then(() => engine.close())));
    let cleanup = closed.find(result => result.status === 'rejected')?.reason;
    try { fs.rmSync(directory, { recursive: true, force: true }); }
    catch (error) { cleanup ||= error; }
    if (cleanup) {
      if (failure) (failure.cleanupErrors ||= []).push(cleanup);
      else throw cleanup;
    }
  }
}

module.exports = { checkDecisionStage, PROMOTION_PROBES };
