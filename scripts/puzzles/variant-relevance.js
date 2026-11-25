'use strict';

// A private rules comparison, never a replacement for a saved game profile.
// Demote movement at the puzzle root: the actual game may have reached that
// position through moves unavailable to an ordinary piece.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pieceMap, pocketLetters, checkedBoard } = require('../../src/profile-fen');
const { getPlayableProfile } = require('../../src/design-options');
const { proveMate, positionKey, replayPosition, cancelled } = require('./mate-proof');

const METHOD = 'ordinary-movement-counterfactual-v1';
const ORDINARY = Object.freeze({ pawn: 'fmWfceFifmnD', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' });
const HISTORY_POLICY = 'Compare movement at the puzzle root with unchanged pieces, colors, pockets, castling/en-passant rights and halfmove clock. The upgraded-only pre-root move sequence is not replayed under ordinary movement; any repeated pre-root position makes the comparison inconclusive.';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const cache = new Map();
let factoryPromise;

function buildOrdinaryCounterfactual(profile) {
  if (!profile || typeof profile.config !== 'string' || !profile.registry?.definitions || !profile.registry?.allocations
    || !/^[a-z0-9][a-z0-9_-]*$/i.test(profile.variant || '')) throw new Error('An exact original profile is required for movement comparison.');
  const definitions = new Map(profile.registry.definitions.map(row => [row.id, row]));
  const changes = [];
  let config = profile.config;
  for (const allocation of profile.registry.allocations) {
    const definition = definitions.get(allocation.id), movement = ORDINARY[definition?.family];
    if (!movement || !/^[a-z]$/.test(allocation.letter)) throw new Error('This piece has no ordinary movement comparison.');
    const pattern = new RegExp(`^(customPiece${allocation.slot}\\s*=\\s*${allocation.letter}:)([^\\s#]+)([^\\r\\n]*)$`, 'gm');
    let count = 0;
    config = config.replace(pattern, (_, prefix, actual, suffix) => {
      if (actual !== definition.movement) throw new Error('The original movement differs from its registry.');
      count++;
      return prefix + movement + suffix;
    });
    if (count !== 1) throw new Error('The original custom-piece allocation is missing or repeated.');
    if (definition.movement !== movement) changes.push({ id: definition.id, letter: allocation.letter,
      family: definition.family, from: definition.movement, to: movement,
      ...(definition.family === 'king' ? { nonroyal: true } : {}) });
  }
  const variant = 'levelup-puzzle-ordinary-' + sha(config).slice(0, 20);
  const header = new RegExp(`^\\[${profile.variant}:chess\\]$`, 'm');
  if (!header.test(config)) throw new Error('This comparison requires an ordinary royal-king profile.');
  config = config.replace(header, `[${variant}:chess]`);
  return { schemaVersion: 1, method: METHOD, variant, config, hash: sha(config), changes,
    sourceProfileHash: profile.hash, sourceRegistryHash: profile.registryHash,
    reservePolicy: 'Custom king-family grants become nonroyal king-step pieces; the ordinary royal king is unchanged.' };
}

async function moduleFactory() {
  if (!factoryPromise) factoryPromise = (async () => {
    // ffish-es6 publishes an ES module without package type=module. Import its
    // trusted module source as ESM and supply the adjacent binary explicitly.
    const file = require.resolve('ffish-es6');
    const source = fs.readFileSync(file), wasmBinary = fs.readFileSync(path.join(path.dirname(file), 'ffish.wasm'));
    const module = await import('data:text/javascript;base64,' + source.toString('base64'));
    return { Module: module.default, wasmBinary,
      implementation: { package: 'ffish-es6', version: require('ffish-es6/package.json').version,
        moduleSha256: sha(source), wasmSha256: sha(wasmBinary) } };
  })().catch(error => { factoryPromise = undefined; throw error; });
  return factoryPromise;
}

function wrap(raw) {
  const alive = () => { if (!raw) throw new Error('Counterfactual board is disposed.'); return raw; };
  return {
    fen: () => alive().fen(), turn: () => alive().turn() ? 'w' : 'b',
    isCheck: () => alive().isCheck(),
    moves: () => alive().legalMoves().split(' ').filter(Boolean),
    push(move) { return this.moves().includes(move) && alive().push(move); },
    san(move) {
      if (!this.moves().includes(move)) throw new Error('Illegal counterfactual move.');
      const board = alive(), san = board.sanMove(move).replace(/[+#]$/, '');
      if (!board.push(move)) throw new Error('Rejected counterfactual move.');
      try { return san + (board.isCheck() ? board.numberLegalMoves() ? '+' : '#' : ''); }
      finally { board.pop(); }
    },
    outcome() {
      const board = alive();
      if (!board.numberLegalMoves()) return board.isCheck()
        ? { result: board.turn() ? '0-1' : '1-0', reason: 'checkmate' }
        : { result: '1/2-1/2', reason: 'stalemate' };
      if (pieceMap(board.fen()).size === 2 && !pocketLetters(board.fen())) return { result: '1/2-1/2', reason: 'insufficient-material' };
      if (board.halfmoveClock() >= 100) return { result: '1/2-1/2', reason: 'fifty-move-rule' };
      return null;
    },
    dispose() { if (raw) raw.delete(); raw = null; },
  };
}

async function createOrdinaryRules(profile) {
  const descriptor = buildOrdinaryCounterfactual(profile);
  let pending = cache.get(descriptor.hash);
  if (!pending) {
    pending = (async () => {
      const { Module, wasmBinary, implementation } = await moduleFactory();
      const engine = await Module({ wasmBinary });
      engine.loadVariantConfig(descriptor.config);
      if (!engine.variants().split(' ').includes(descriptor.variant)) throw new Error('The private movement comparison failed to load.');
      return { engine, implementation };
    })();
    cache.set(descriptor.hash, pending);
    while (cache.size > 2) cache.delete(cache.keys().next().value);
    pending.catch(() => { if (cache.get(descriptor.hash) === pending) cache.delete(descriptor.hash); });
  }
  const { engine, implementation } = await pending;
  const roles = profile.roles || getPlayableProfile(profile.variant)?.roles;
  if (!roles) throw new Error('The original profile has no supported role mapping.');
  return { ...descriptor, implementation, createBoard(fen) { return wrap(checkedBoard(engine, descriptor.variant, fen, 0, 0, roles)); } };
}

function winning(outcome, solverColor) {
  return outcome?.reason === 'checkmate' && outcome.result === (solverColor === 'w' ? '1-0' : '0-1');
}

// An unchanged recorded line can witness an ordinary tactic without searching
// all alternatives. Every legal baseline defense must still be covered; extra
// original defenses removed by the demotion need not be played.
function recordedMateWorks(rules, puzzle) {
  let visited = 0;
  function visit(fen, node, keys) {
    if (++visited > 10000 || !node || keys.filter(key => key === keys.at(-1)).length >= 3) return false;
    const board = rules.createBoard(fen);
    try {
      if (board.outcome() || board.turn() !== puzzle.solverColor || !board.push(node.move)) return false;
      const after = board.outcome();
      if (after) return winning(after, puzzle.solverColor);
      const defendedFen = board.fen(), replies = new Map(node.replies.map(row => [row.move, row.next]));
      const defenseKeys = [...keys, positionKey(board)];
      if (defenseKeys.filter(key => key === defenseKeys.at(-1)).length >= 3) return false;
      for (const reply of board.moves()) {
        if (!replies.has(reply)) return false;
        const child = rules.createBoard(defendedFen);
        try {
          if (!child.push(reply) || child.outcome()) return false;
          if (!visit(child.fen(), replies.get(reply), [...defenseKeys, positionKey(child)])) return false;
        } finally { child.dispose(); }
      }
      return true;
    } finally { board.dispose(); }
  }
  const board = rules.createBoard(puzzle.fen);
  try { return visit(board.fen(), puzzle.solution, [positionKey(board)]); }
  finally { board.dispose(); }
}

async function classifyVariantRelevance({ puzzle, profile, rulesFactory, nodeLimit = 50000,
  timeLimitMs = 5000, signal, proveGoal } = {}) {
  if (signal?.aborted) throw cancelled();
  const base = { schemaVersion: 1, method: METHOD, historyPolicy: HISTORY_POLICY,
    sourceProfileHash: profile?.hash, alteredIds: [] };
  const result = (classification, reason, extra = {}) => ({ ...base, classification, reason, ...extra });
  if (!puzzle?.goal || !['mate', 'material'].includes(puzzle.goal.type)) return result('unknown', 'unsupported-goal');
  try {
    const descriptor = buildOrdinaryCounterfactual(profile);
    const present = new Set([...pieceMap(puzzle.fen).values(), ...pocketLetters(puzzle.fen)].map(value => value.toLowerCase()));
    const grants = new Set(profile.registry.definitions.filter(row => row.placement === 'reserve').map(row => row.id));
    const presentGrants = profile.registry.allocations.filter(row => grants.has(row.id) && present.has(row.letter)).map(row => row.id);
    if (presentGrants.length) return result('unknown', 'no-ordinary-baseline-for-additional-piece', { unsupportedGrantIds: presentGrants });
    const changes = descriptor.changes.filter(row => present.has(row.letter));
    base.alteredIds = changes.map(row => row.id);
    base.changes = changes;
    base.baselineProfileHash = descriptor.hash;
    base.reservePolicy = descriptor.reservePolicy;
    if (!changes.length) return result('ordinary', 'no-changed-custom-movement-in-position');
    if (typeof rulesFactory !== 'function') return result('unknown', 'missing-original-rules');
    const original = await rulesFactory({ profile });
    const replayed = replayPosition(original, puzzle.initialFen, puzzle.initialMoves || []);
    try {
      if (replayed.board.fen() !== puzzle.fen) return result('unknown', 'source-history-mismatch');
      if (new Set(replayed.keys).size !== replayed.keys.length) return result('unknown', 'repeated-position-in-source-history');
    } finally { replayed.board.dispose(); }
    if (puzzle.goal.type === 'mate' && !recordedMateWorks(original, puzzle)) return result('unknown', 'original-mating-tree-invalid');
    if (signal?.aborted) throw cancelled();
    const rules = await createOrdinaryRules(profile);
    base.rulesImplementation = rules.implementation;
    // Reject invalid counterfactuals rather than silently editing rights, royal
    // safety, pockets or piece counts to manufacture a favorable comparison.
    const board = rules.createBoard(puzzle.fen);
    try {
      if (board.turn() !== puzzle.solverColor || board.outcome()) return result('unknown', 'terminal-or-incompatible-ordinary-root');
    } finally { board.dispose(); }
    if (puzzle.goal.type === 'mate' && recordedMateWorks(rules, puzzle)) return result('ordinary', 'recorded-mating-tree-survives-demotion');
    const proofFunction = proveGoal || (puzzle.goal.type === 'mate' ? proveMate : require('./material-proof').proveMaterial);
    const proof = await proofFunction({ rules, profile, initialFen: puzzle.fen, initialMoves: [],
      fen: puzzle.fen, solverColor: puzzle.solverColor, minMoves: 1, maxMoves: puzzle.goal.moves,
      minimumGain: puzzle.goal.minimumGain, settlePlies: puzzle.goal.settlePlies,
      nodeLimit, timeLimitMs, signal });
    if (['proved', 'ambiguous', 'too-short'].includes(proof.status)) return result('ordinary', 'ordinary-goal-still-achievable', { proof });
    if (['no-forced-mate', 'no-material-win'].includes(proof.status)) return result('exclusive', 'ordinary-goal-exhaustively-refuted', { proof });
    return result('unknown', 'ordinary-proof-inconclusive', { proof });
  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) throw error;
    return result('unknown', 'invalid-or-unsupported-counterfactual', { detail: error.message });
  }
}

module.exports = { METHOD, ORDINARY, HISTORY_POLICY, buildOrdinaryCounterfactual,
  createOrdinaryRules, recordedMateWorks, classifyVariantRelevance };
