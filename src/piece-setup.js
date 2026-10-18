const { PIECES, PIECE_LEVELS, PIECE_SLOTS, PIECE_BUDGETS } = require('./piece-catalog');
const { START_FEN } = require('./knight-setup');

// Only the placement is needed here; game rules validate the complete FEN.
function placement(fen) {
  if (typeof fen !== 'string') throw new Error('The starting FEN is invalid.');
  const ranks = fen.trim().split(/\s+/)[0].split('/');
  if (ranks.length !== 8) throw new Error('The starting FEN is invalid.');
  return ranks.map(rank => {
    const row = [];
    for (const character of rank) {
      if (/^[1-8]$/.test(character)) row.push(...Array(Number(character)).fill(null));
      else if (/^[A-Za-z]$/.test(character)) row.push(character);
      else throw new Error('The starting FEN is invalid.');
    }
    if (row.length !== 8) throw new Error('The starting FEN is invalid.');
    return row;
  });
}

const coordinates = square => [8 - Number(square[1]), square.charCodeAt(0) - 97];
const at = (board, square) => {
  const [rank, file] = coordinates(square);
  return board[rank][file];
};
const put = (board, square, character) => {
  const [rank, file] = coordinates(square);
  board[rank][file] = character;
};
const colored = (type, color) => color === 'w' ? type.toUpperCase() : type;

/**
 * Build a new game from an object with exactly one integer level per PIECE_SLOT.
 * The same 1–39 point budget applies independently to each side.
 * Returns { fen, levels, budget, costs: { w, b }, white, black }.
 */
function pieceSetupFromLevels(levels, budget) {
  if (!PIECE_BUDGETS.includes(budget)) throw new Error('Choose an upgrade budget from 1 to 39.');
  if (!levels || typeof levels !== 'object' || Array.isArray(levels) || Object.keys(levels).length !== PIECE_SLOTS.length) throw new Error('Choose a level for each of the 26 upgradeable starting pieces.');
  const choices = {};
  const costs = { w: 0, b: 0 };
  for (const slot of PIECE_SLOTS) {
    const level = Object.hasOwn(levels, slot.square) ? levels[slot.square] : undefined;
    if (!Number.isInteger(level) || level < 0 || level > 3) throw new Error('Piece levels must be whole numbers from 0 to 3.');
    const type = PIECE_LEVELS[slot.family][level];
    if (!type) throw new Error(`Level ${level} is not available for the ${slot.family} on ${slot.square}.`);
    choices[slot.square] = level;
    costs[slot.color] += PIECES[type].cost;
  }
  if (costs.w > budget || costs.b > budget) throw new Error(`Budget exceeded: White ${costs.w}/${budget} · Black ${costs.b}/${budget}.`);
  const board = placement(START_FEN);
  for (const slot of PIECE_SLOTS) {
    const level = choices[slot.square];
    const type = PIECE_LEVELS[slot.family][level];
    // Purple knights add a piece; every other upgrade replaces its starting piece.
    const square = slot.family === 'knight' && level === 3 ? slot.extraSquare : slot.square;
    put(board, square, colored(type, slot.color));
  }
  const ranks = board.map(row => {
    let result = '';
    let empty = 0;
    for (const character of row) {
      if (!character) { empty++; continue; }
      if (empty) { result += empty; empty = 0; }
      result += character;
    }
    return result + (empty || '');
  });
  return { fen: ranks.join('/') + ' w KQkq - 0 1', levels: choices, budget, costs, white: costs.w, black: costs.b };
}

/** Infer all next-game choices from the initial FEN, including legacy knights. */
function loadPieceSetup(fen) {
  const board = placement(fen);
  return Object.fromEntries(PIECE_SLOTS.map(slot => {
    if (slot.family === 'knight' && at(board, slot.extraSquare) === colored('g', slot.color)) return [slot.square, 3];
    const character = at(board, slot.square);
    const level = PIECE_LEVELS[slot.family].findIndex(type => type && character === colored(type, slot.color));
    return [slot.square, Math.max(level, 0)];
  }));
}

module.exports = { START_FEN, pieceSetupFromLevels, loadPieceSetup };
