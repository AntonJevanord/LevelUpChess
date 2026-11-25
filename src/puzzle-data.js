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
const MATERIAL_POLICY = 'base-plus-level-v1';
const BASE_MATERIAL = Object.freeze({ pawn: 100, knight: 300, bishop: 300, rook: 500, queen: 900, king: 0 });
function materialValues(profile) {
  const values = Object.fromEntries(Object.entries(STANDARD).map(([letter, family]) => [letter, BASE_MATERIAL[family]]));
  if (profile) for (const allocation of profile.registry.allocations) {
    const definition = profile.registry.definitions.find(row => row.id === allocation.id);
    if (!definition || !Object.hasOwn(BASE_MATERIAL, definition.family)) fail('unknown material-counting definition.');
    values[allocation.letter] = BASE_MATERIAL[definition.family] + definition.level * 100;
  }
  return values;
}
function materialBalance(fen, color, profile) {
  const values = materialValues(profile), pieces = pieceMap(fen);
  return [...pieces.values(), ...pocketLetters(fen)].reduce((total, letter) => {
    const value = values[letter.toLowerCase()];
    if (value === undefined) fail('unknown piece in material count.');
    const owner = letter === letter.toUpperCase() ? 'w' : 'b';
    return total + (owner === color ? value : -value);
  }, 0);
}
function passProbeFen(fen, advanceClock = true) {
  const fields = fen.split(/\s+/), side = fields[1];
  fields[1] = side === 'w' ? 'b' : 'w'; fields[3] = '-';
  if (advanceClock) { fields[4] = String(Number(fields[4]) + 1); if (side === 'b') fields[5] = String(Number(fields[5]) + 1); }
  return fields.join(' ');
}
function validateMaterialGoal(goal) {
  if (!object(goal) || goal.type !== 'material' || !Number.isInteger(goal.moves) || goal.moves < 1 || goal.moves > MAX_SOLVER_MOVES
    || !Number.isSafeInteger(goal.minimumGain) || goal.minimumGain < 1 || goal.minimumGain > 100000
    || goal.valuePolicy !== MATERIAL_POLICY || !Number.isInteger(goal.settlePlies) || goal.settlePlies < 1 || goal.settlePlies > 8) fail('unsupported material goal.');
}
function validateSettlement(node, remaining, count, nesting = 0) {
  if (!object(node) || ++count.value > MAX_TREE_NODES || nesting > 24 || !Number.isSafeInteger(node.gain)) fail('invalid or excessive material-settling certificate.');
  text(node.fen, 'material-settling position', 512); pieceMap(node.fen);
  if (node.kind === 'settled') return;
  if (node.kind === 'probe') { validateSettlement(node.next, remaining, count, nesting + 1); return; }
  if (remaining < 1) fail('material settling exceeds its declared bound.');
  if (node.kind === 'choice') { move(node.move); validateSettlement(node.next, remaining - 1, count, nesting + 1); return; }
  if (node.kind !== 'defenses' || !Array.isArray(node.replies) || !node.replies.length || node.replies.length > 512) fail('invalid material-settling defenses.');
  const seen = new Set();
  for (const reply of node.replies) {
    if (!object(reply) || seen.has(move(reply.move))) fail('duplicate material-settling defense.');
    seen.add(reply.move); validateSettlement(reply.next, remaining - 1, count, nesting + 1);
  }
}
function validateMaterialTree(tree, goal, remaining = goal.moves, count = { value: 0 }) {
  validateMaterialGoal(goal);
  if (!object(tree) || remaining < 1 || ++count.value > MAX_TREE_NODES) fail('material solution exceeds its supported bound.');
  move(tree.move);
  if (!Array.isArray(tree.replies) || !tree.replies.length || tree.replies.length > 512) fail('invalid material defender replies.');
  const seen = new Set();
  for (const reply of tree.replies) {
    if (!object(reply) || seen.has(move(reply.move)) || Boolean(reply.leaf) === Boolean(reply.next)) fail('invalid material defense branch.');
    seen.add(reply.move);
    if (reply.next) validateMaterialTree(reply.next, goal, remaining - 1, count);
    else {
      if (!object(reply.leaf) || !Number.isSafeInteger(reply.leaf.gain)) fail('invalid material leaf.');
      text(reply.leaf.fen, 'material leaf position', 512); pieceMap(reply.leaf.fen);
      validateSettlement(reply.leaf.settlement, goal.settlePlies, count);
    }
  }
  return tree;
}
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
  if (puzzle.goal?.type === 'material') validateMaterialTree(puzzle.solution, puzzle.goal);
  else {
    if (!object(puzzle.goal) || puzzle.goal.type !== 'mate' || !Number.isInteger(puzzle.goal.moves)
      || puzzle.goal.moves < 1 || puzzle.goal.moves > MAX_SOLVER_MOVES) fail('unsupported puzzle goal.');
    validateTree(puzzle.solution, puzzle.goal.moves);
  }
  if (!object(puzzle.pieces) || puzzle.pieces.method !== (puzzle.goal.type === 'material' ? 'material-tree-effects' : 'mate-tree-effects')) fail('missing piece participation metadata.');
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
function filterPuzzles(puzzles, { minMoves = 1, maxMoves = MAX_SOLVER_MOVES, involved = '', moved = '', present = '', goalType = 'any', variantRelevance = 'any' } = {}) {
  const minimum = minMoves === '' ? 1 : Number(minMoves), maximum = maxMoves === '' ? MAX_SOLVER_MOVES : Number(maxMoves);
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || maximum < minimum) return [];
  const chosen = { involved, moved, present };
  return puzzles.filter(puzzle => puzzle.goal.moves >= minimum && puzzle.goal.moves <= maximum
    && (goalType === 'any' || puzzle.goal.type === goalType)
    && (variantRelevance === 'any' || puzzle.relevance?.classification === variantRelevance)
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
function facadePositionKey(game) {
  const fields = game.fen().split(/\s+/).slice(0, 4);
  if (fields[3] !== '-') {
    const targets = new Set(fields[3].match(/[a-h][1-8]/g)), pieces = pieceMap(game.fen());
    fields[3] = unique(game.moves({ verbose: true }).filter(row => targets.has(row.to) && !pieces.has(row.to) && row.captured).map(row => row.to)).join('') || '-';
  }
  return fields.join(' ');
}
function historyKeys(game) {
  const records = game.history?.({ verbose: true }) || [];
  // Reconstruct canonical keys with legal EP rights using the actual facade
  // history, then restore it. This retains pre-root repetition information.
  const moves = [];
  while (game.history().length) moves.push(game.undo());
  const keys = [facadePositionKey(game)];
  for (const record of moves.reverse()) { playUci(game, uciOf(record)); keys.push(facadePositionKey(game)); }
  if (records.length !== moves.length) fail('material history could not be reconstructed.');
  return keys;
}
function tacticalUcis(game) { return game.moves({ verbose: true }).filter(row => row.captured || row.promotion).map(uciOf).sort(); }
function removeStaticCertificateUnit(value, square, letter) {
  if (Array.isArray(value)) return value.map(row => removeStaticCertificateUnit(row, square, letter));
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === 'fen' && typeof item === 'string') {
      const fields = item.split(' '), map = pieceMap(item);
      if (map.get(square) === letter) map.delete(square);
      fields[0] = placementFromMap(map);
      const castle = { a1: 'Q', h1: 'K', a8: 'q', h8: 'k' }[square];
      if (castle) fields[2] = fields[2].replace(castle, '') || '-';
      return [key, fields.join(' ')];
    }
    return [key, removeStaticCertificateUnit(item, square, letter)];
  }));
}
async function inspectMaterialTree(game, tree, solverColor, { goal, profile, baseline,
  createGame, variant = game.variant || 'chess', onMove = () => {}, count = { value: 0 }, keys } = {}) {
  validateMaterialGoal(goal);
  if (typeof createGame !== 'function') fail('material replay requires a game factory.');
  profile ||= variant === 'chess' ? undefined : getPlayableProfile(variant);
  baseline ??= materialBalance(game.fen(), solverColor, profile);
  keys ||= historyKeys(game);
  const repeated = ledger => ledger.filter(key => key === ledger.at(-1)).length >= 3;
  const gain = current => materialBalance(current.fen(), solverColor, profile) - baseline;
  async function settlement(current, certificate, remaining, ledger) {
    if (++count.value > MAX_TREE_NODES || certificate.fen !== current.fen() || certificate.gain !== gain(current)
      || current.isGameOver() || repeated(ledger)) fail('material settling differs from its legal position or history.');
    const solver = current.turn() === solverColor, checked = current.isCheck();
    const tactical = checked ? legalUcis(current) : tacticalUcis(current);
    if (certificate.kind === 'settled') {
      if (solver || checked || tactical.length || gain(current) < goal.minimumGain) fail('material leaf is not tactically settled.');
      return;
    }
    if (certificate.kind === 'probe') {
      if (!solver || checked || gain(current) < goal.minimumGain) fail('invalid static material threat probe.');
      const probe = await createGame(passProbeFen(current.fen()), variant);
      try { await settlement(probe, certificate.next, remaining, [...ledger, facadePositionKey(probe)]); }
      finally { probe.dispose?.(); }
      return;
    }
    if (!remaining) fail('material settling exhausts its bound.');
    if (certificate.kind === 'choice') {
      if (!solver || !tactical.includes(certificate.move)) fail('material recovery is not an allowed capture or check evasion.');
      playUci(current, certificate.move);
      try { await settlement(current, certificate.next, remaining - 1, [...ledger, facadePositionKey(current)]); }
      finally { current.undo(); }
      return;
    }
    if (certificate.kind !== 'defenses' || solver || !checked && gain(current) < goal.minimumGain
      || !tactical.length || JSON.stringify(tactical) !== JSON.stringify(certificate.replies.map(row => row.move).sort())) fail('material settling omits a tactical defense.');
    for (const reply of certificate.replies) {
      playUci(current, reply.move);
      try { await settlement(current, reply.next, remaining - 1, [...ledger, facadePositionKey(current)]); }
      finally { current.undo(); }
    }
  }
  async function core(node, ledger) {
    if (++count.value > MAX_TREE_NODES || game.turn() !== solverColor || game.isGameOver() || repeated(ledger)
      || !legalUcis(game).includes(node.move)) fail('invalid material solver branch.');
    const made = playUci(game, node.move); onMove(made, game);
    const afterSolver = [...ledger, facadePositionKey(game)];
    try {
      if (game.isGameOver() || repeated(afterSolver)) fail('material solution ends in mate or a draw; use its actual goal.');
      const legal = legalUcis(game), declared = node.replies.map(row => row.move).sort();
      if (!legal.length || JSON.stringify(legal) !== JSON.stringify(declared)) fail('material solution omits or invents a legal defense.');
      let longest = 0, leaves = 0;
      for (const reply of node.replies) {
        const response = playUci(game, reply.move); onMove(response, game);
        const nextLedger = [...afterSolver, facadePositionKey(game)];
        try {
          if (reply.leaf) {
            if (reply.leaf.fen !== game.fen() || reply.leaf.gain !== gain(game) || gain(game) < goal.minimumGain
              || game.isGameOver() || repeated(nextLedger)) fail('material gain differs from its declared leaf.');
            await settlement(game, reply.leaf.settlement, goal.settlePlies, nextLedger);
            leaves++;
          } else {
            const next = await core(reply.next, nextLedger); longest = Math.max(longest, next.moves); leaves += next.leaves;
          }
        } finally { game.undo(); }
      }
      return { moves: longest + 1, leaves, nodes: count.value, baseline, minimumGain: goal.minimumGain };
    } finally { game.undo(); }
  }
  return core(tree, keys);
}
async function replayPuzzle(puzzle, { createGame } = {}) {
  if (typeof createGame !== 'function') fail('rules replay requires a game factory.');
  if (puzzle.goal.type === 'material') validateMaterialTree(puzzle.solution, puzzle.goal);
  else validateTree(puzzle.solution, puzzle.goal.moves);
  const game = await createPuzzleGame(puzzle, createGame);
  try {
    const proof = puzzle.goal.type === 'material'
      ? await inspectMaterialTree(game, puzzle.solution, puzzle.solverColor, { goal: puzzle.goal, createGame })
      : inspectTree(game, puzzle.solution, puzzle.solverColor);
    if (proof.moves !== puzzle.goal.moves) fail('declared solution length differs from the proven tree.');
    return proof;
  } finally { game.dispose?.(); }
}
async function derivePuzzlePieces(puzzle, { createGame } = {}) {
  if (typeof createGame !== 'function') fail('piece tagging requires a game factory.');
  const material = puzzle.goal.type === 'material';
  if (material) validateMaterialTree(puzzle.solution, puzzle.goal);
  else validateTree(puzzle.solution, puzzle.goal.moves);
  const game = await createPuzzleGame(puzzle, createGame), moved = new Set(), involved = new Set();
  const profile = puzzle.variant === 'chess' ? undefined : getPlayableProfile(puzzle.variant);
  const id = type => pieceIdForType(type, profile || 'chess');
  const root = pieceMap(puzzle.fen);
  const present = unique([...root.values(), ...pocketLetters(puzzle.fen)].map(id));
  try {
    const onMove = (made, afterGame) => {
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
    };
    const proof = material ? await inspectMaterialTree(game, puzzle.solution, puzzle.solverColor, { goal: puzzle.goal, createGame, onMove })
      : inspectTree(game, puzzle.solution, puzzle.solverColor, { onMove });
    if (proof.moves !== puzzle.goal.moves) fail('declared solution length differs from the proven tree.');
  } finally { game.dispose?.(); }
  if (!material) involved.add('king');
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
      if (material) await inspectMaterialTree(counterfactual, removeStaticCertificateUnit(puzzle.solution, square, type), puzzle.solverColor, {
        goal: puzzle.goal, createGame, baseline: materialBalance(counterfactual.fen(), puzzle.solverColor, profile) });
      else inspectTree(counterfactual, puzzle.solution, puzzle.solverColor);
    } catch { changed = true; }
    finally { counterfactual?.dispose?.(); }
    if (changed) { stationary.add(pieceId); involved.add(pieceId); effects.push({ id: pieceId, square, reason: material ? 'Removing this stationary unit changes the bounded material tactic or its legal defenses.' : 'Removing this stationary unit changes the mating tree or its legal defenses.' }); }
  }
  return { present, moved: unique([...moved]), involved: unique([...involved]), stationary: unique([...stationary]), method: material ? 'material-tree-effects' : 'mate-tree-effects', effects };
}

module.exports = { FORMAT, MAX_PACK_BYTES, MAX_PUZZLES, MAX_TREE_NODES, MAX_SOLVER_MOVES,
  getProfileSnapshot, validatePuzzle, validatePuzzlePack, filterPuzzles, pieceLabel,
  pieceIdForType, uciOf, requestForUci, playUci, legalUcis, createPuzzleGame,
  inspectTree, replayPuzzle, derivePuzzlePieces, MATERIAL_POLICY, BASE_MATERIAL,
  materialValues, materialBalance, passProbeFen, validateMaterialGoal, validateMaterialTree,
  inspectMaterialTree };
