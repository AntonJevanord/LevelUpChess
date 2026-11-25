'use strict';

// Portable puzzle data. Rules replay is injected so the same checks work in
// the browser and the offline collector without importing another rules heap.
const { getDesign } = require('./design-catalog');
const { getPlayableProfile, getProfileSnapshot, validateProfileSnapshot, DESIGN_OPTIONS } = require('./design-options');
const { pieceMap, placementFromMap, pocketLetters } = require('./profile-fen');

const FORMAT = 'levelup-puzzle-pack';
const MAX_PACK_BYTES = 20 * 1024 * 1024;
const MAX_PUZZLES = 1000;
const MAX_TREE_NODES = 10000;
const MAX_SOLVER_MOVES = 8;
const STANDARD = Object.freeze({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' });
const STANDARD_LABELS = Object.freeze(Object.fromEntries(Object.values(STANDARD).map(id => [id, id[0].toUpperCase() + id.slice(1)])));
const MOVE = /^(?:[a-h][1-8][a-h][1-8][a-z]?|[A-Z]@[a-h][1-8])$/;
const fail = message => { throw new Error(`Puzzle pack: ${message}`); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const unique = values => [...new Set(values)].sort();
function text(value, name, limit = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\0\r\n]/.test(value)) fail(`invalid ${name}.`);
  return value;
}
function move(value) { if (typeof value !== 'string' || !MOVE.test(value)) fail('invalid solution move.'); return value; }
function pieceIdForType(type, variant = 'chess') {
  const lower = String(type).toLowerCase();
  if (STANDARD[lower]) return STANDARD[lower];
  const profile = typeof variant === 'string' ? getPlayableProfile(variant) : variant;
  const id = profile?.registry?.allocations.find(row => row.letter === lower)?.id;
  if (!id) fail(`unknown piece ${type}.`);
  return id;
}
function pieceLabel(id) { return STANDARD_LABELS[id] || DESIGN_OPTIONS.find(row => row.id === id)?.name || getDesign(id)?.name || id; }
function knownPiece(id, variant) {
  if (Object.hasOwn(STANDARD_LABELS, id)) return true;
  return getPlayableProfile(variant)?.registry.definitions.some(row => row.id === id) || false;
}
function validateTree(tree, remaining = MAX_SOLVER_MOVES, count = { value: 0 }) {
  if (!object(tree) || remaining < 1 || ++count.value > MAX_TREE_NODES) fail('solution tree exceeds its supported bound.');
  move(tree.move);
  if (!Array.isArray(tree.replies) || tree.replies.length > 512) fail('invalid defender replies.');
  const seen = new Set();
  for (const reply of tree.replies) {
    if (!object(reply) || seen.has(move(reply.move))) fail('duplicate or invalid defender reply.');
    seen.add(reply.move); validateTree(reply.next, remaining - 1, count);
  }
  return tree;
}
function validatePuzzle(puzzle, profiles = {}) {
  if (!object(puzzle)) fail('invalid puzzle.');
  text(puzzle.id, 'puzzle id', 160); text(puzzle.title, 'title');
  if (puzzle.variant !== 'chess') {
    validateProfileSnapshot(profiles[puzzle.variant], puzzle.variant);
  }
  if (typeof puzzle.variant !== 'string' || !/^[a-z][a-z0-9_-]{0,100}$/.test(puzzle.variant)) fail('invalid variant.');
  for (const key of ['initialFen', 'fen']) {
    text(puzzle[key], key, 512); pieceMap(puzzle[key]);
    if (puzzle[key].trim().split(/\s+/).length !== 6) fail('invalid position.');
  }
  if (!Array.isArray(puzzle.initialMoves) || puzzle.initialMoves.length > 800) fail('invalid source history.');
  puzzle.initialMoves.forEach(move);
  if (!['w', 'b'].includes(puzzle.solverColor) || puzzle.fen.split(/\s+/)[1] !== puzzle.solverColor) fail('invalid solver color.');
  if (!object(puzzle.goal) || puzzle.goal.type !== 'mate' || !Number.isInteger(puzzle.goal.moves)
    || puzzle.goal.moves < 1 || puzzle.goal.moves > MAX_SOLVER_MOVES) fail('unsupported puzzle goal.');
  validateTree(puzzle.solution, puzzle.goal.moves);
  if (!object(puzzle.pieces) || puzzle.pieces.method !== 'mate-tree-effects') fail('missing piece participation metadata.');
  for (const key of ['present', 'moved', 'involved', 'stationary']) {
    const ids = puzzle.pieces[key];
    if (!Array.isArray(ids) || ids.length > 32 || unique(ids).length !== ids.length || ids.some(id => typeof id !== 'string' || !knownPiece(id, puzzle.variant))) fail(`invalid ${key} piece filters.`);
  }
  if (puzzle.pieces.moved.some(id => !puzzle.pieces.involved.includes(id))
    || puzzle.pieces.stationary.some(id => !puzzle.pieces.involved.includes(id))) fail('inconsistent piece participation.');
  if (!object(puzzle.provenance) || !['authored', 'panel'].includes(puzzle.provenance.kind)) fail('missing puzzle provenance.');
  return puzzle;
}
function validatePuzzlePack(value) {
  let pack = value;
  if (typeof value === 'string') {
    if (value.length > MAX_PACK_BYTES) fail('file is too large.');
    try { pack = JSON.parse(value); } catch { fail('file is not valid JSON.'); }
  }
  if (!object(pack) || pack.schemaVersion !== 1 || pack.format !== FORMAT || !object(pack.profiles)
    || !Array.isArray(pack.puzzles) || pack.puzzles.length > MAX_PUZZLES) fail('unsupported file format.');
  for (const [variant, profile] of Object.entries(pack.profiles)) validateProfileSnapshot(profile, variant);
  const ids = new Set();
  for (const puzzle of pack.puzzles) {
    validatePuzzle(puzzle, pack.profiles);
    if (ids.has(puzzle.id)) fail('duplicate puzzle id.'); ids.add(puzzle.id);
  }
  return pack;
}
function filterPuzzles(puzzles, { minMoves = 1, maxMoves = MAX_SOLVER_MOVES, involved = '', moved = '', present = '' } = {}) {
  const minimum = minMoves === '' ? 1 : Number(minMoves), maximum = maxMoves === '' ? MAX_SOLVER_MOVES : Number(maxMoves);
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || maximum < minimum) return [];
  const chosen = { involved, moved, present };
  return puzzles.filter(puzzle => puzzle.goal.moves >= minimum && puzzle.goal.moves <= maximum
    && Object.entries(chosen).every(([key, value]) => !value || (Array.isArray(value) ? value : [value]).every(id => puzzle.pieces[key].includes(id))));
}
function uciOf(value) { return value.uci || (value.drop ? value.drop.toUpperCase() + '@' + value.to : value.from + value.to + (value.promotion || '')); }
function requestForUci(uci) { move(uci); return uci[1] === '@' ? { drop: uci[0].toLowerCase(), to: uci.slice(2, 4) } : { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }; }
function playUci(game, uci) { return game.move(requestForUci(uci)); }
function legalUcis(game) { return game.moves({ verbose: true }).map(uciOf).sort(); }
async function createPuzzleGame(puzzle, createGame) {
  const game = await createGame(puzzle.initialFen, puzzle.variant);
  try {
    for (const uci of puzzle.initialMoves) {
      if (game.isGameOver()) fail('source history continues after game end.');
      if (!playUci(game, uci)) fail('illegal source history.');
    }
    if (game.fen() !== puzzle.fen || game.turn() !== puzzle.solverColor || game.isGameOver()) fail('source history does not reach the playable puzzle position.');
    return game;
  } catch (error) { game.dispose?.(); throw error; }
}
function inspectTree(game, tree, solverColor, { onMove = () => {}, count = { value: 0 } } = {}) {
  if (++count.value > MAX_TREE_NODES || game.turn() !== solverColor || game.isGameOver()) fail('invalid or excessive solution tree.');
  const planned = game.moves({ verbose: true }).find(row => uciOf(row) === tree.move);
  if (!planned) fail('solution contains an illegal solver move.');
  const made = playUci(game, tree.move); onMove(made, game);
  try {
    if (game.isCheckmate()) {
      if (tree.replies.length) fail('solution continues after mate.');
      return { moves: 1, leaves: 1, nodes: count.value };
    }
    if (game.isGameOver()) fail('solution ends in a draw or the wrong result.');
    const legal = legalUcis(game), declared = tree.replies.map(row => row.move).sort();
    if (!legal.length || legal.length !== declared.length || legal.some((uci, index) => uci !== declared[index])) fail('solution omits or invents a legal defense.');
    let longest = 0, leaves = 0;
    for (const reply of tree.replies) {
      const response = playUci(game, reply.move); onMove(response, game);
      try {
        const next = inspectTree(game, reply.next, solverColor, { onMove, count });
        longest = Math.max(longest, next.moves); leaves += next.leaves;
      } finally { game.undo(); }
    }
    return { moves: longest + 1, leaves, nodes: count.value };
  } finally { game.undo(); }
}
async function replayPuzzle(puzzle, { createGame } = {}) {
  if (typeof createGame !== 'function') fail('rules replay requires a game factory.');
  validateTree(puzzle.solution, puzzle.goal.moves);
  const game = await createPuzzleGame(puzzle, createGame);
  try {
    const proof = inspectTree(game, puzzle.solution, puzzle.solverColor);
    if (proof.moves !== puzzle.goal.moves) fail('declared solution length differs from the proven tree.');
    return proof;
  } finally { game.dispose?.(); }
}
async function derivePuzzlePieces(puzzle, { createGame } = {}) {
  if (typeof createGame !== 'function') fail('piece tagging requires a game factory.');
  validateTree(puzzle.solution, puzzle.goal.moves);
  const game = await createPuzzleGame(puzzle, createGame), moved = new Set(), involved = new Set();
  const profile = puzzle.variant === 'chess' ? undefined : getPlayableProfile(puzzle.variant);
  const id = type => pieceIdForType(type, profile || 'chess');
  const root = pieceMap(puzzle.fen);
  const present = unique([...root.values(), ...pocketLetters(puzzle.fen)].map(id));
  try {
    const proof = inspectTree(game, puzzle.solution, puzzle.solverColor, { onMove(made, afterGame) {
      moved.add(id(made.piece)); involved.add(id(made.piece));
      if (made.captured) involved.add(id(made.captured));
      if (made.promotion) involved.add(id(made.promotion));
      if (/^O-O/.test(made.san)) {
        const before = pieceMap(made.before), after = pieceMap(made.after || afterGame.fen());
        for (const [square, type] of before) {
          const color = type === type.toUpperCase() ? 'w' : 'b';
          if (color === made.color && after.get(square) !== type) {
            moved.add(id(type)); involved.add(id(type));
          }
        }
      }
    } });
    if (proof.moves !== puzzle.goal.moves) fail('declared solution length differs from the proven tree.');
  } finally { game.dispose?.(); }
  involved.add('king');
  const stationary = new Set(), effects = [];
  // Conservative piece-type tags: if any unit of a type moves in any branch,
  // that type is already represented by `moved`. For the remaining types,
  // removing a stationary unit tests support, obstruction and hopper hurdles.
  // This is a positional-effect diagnostic, not an exhaustive motif classifier.
  for (const [square, type] of root) {
    const pieceId = id(type);
    if (type.toLowerCase() === 'k' || moved.has(pieceId)) continue;
    const map = new Map(root); map.delete(square);
    if (Object.hasOwn(root, 'pocket')) map.pocket = root.pocket;
    const fields = puzzle.fen.split(' '); fields[0] = placementFromMap(map);
    // Removed home rooks do not retain fictitious castling rights.
    const castle = { a1: 'Q', h1: 'K', a8: 'q', h8: 'k' }[square];
    if (castle) fields[2] = fields[2].replace(castle, '') || '-';
    let counterfactual, changed = false;
    try {
      counterfactual = await createGame(fields.join(' '), puzzle.variant);
      inspectTree(counterfactual, puzzle.solution, puzzle.solverColor);
    } catch { changed = true; }
    finally { counterfactual?.dispose?.(); }
    if (changed) { stationary.add(pieceId); involved.add(pieceId); effects.push({ id: pieceId, square, reason: 'Removing this stationary unit changes the mating tree or its legal defenses.' }); }
  }
  return { present, moved: unique([...moved]), involved: unique([...involved]), stationary: unique([...stationary]), method: 'mate-tree-effects', effects };
}

module.exports = { FORMAT, MAX_PACK_BYTES, MAX_PUZZLES, MAX_TREE_NODES, MAX_SOLVER_MOVES,
  getProfileSnapshot, validatePuzzle, validatePuzzlePack, filterPuzzles, pieceLabel,
  pieceIdForType, uciOf, requestForUci, playUci, legalUcis, createPuzzleGame,
  inspectTree, replayPuzzle, derivePuzzlePieces };
