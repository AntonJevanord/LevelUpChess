const { PIECES, KNIGHT_LEVELS, KNIGHT_SLOTS, UPGRADE_BUDGETS } = require('./piece-catalog');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Parse placement only: the game rules library validates the complete position.
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
 * Build a new-game army from four levels and a separate budget for each side.
 * levels is { b1, g1, b8, g8 }, or an array in KNIGHT_SLOTS order.
 * Returns { fen, levels, budget, costs: { w, b }, white, black }.
 * Level 3 retains the starting knight and places its extra piece on rank 3/6.
 */
function setupFromLevels(levels, budget) {
  if (!UPGRADE_BUDGETS.includes(budget)) throw new Error('Choose an upgrade budget from 1 to 6.');
  if (!levels || typeof levels !== 'object' || Object.keys(levels).length !== KNIGHT_SLOTS.length) throw new Error('Choose a level for each of the four starting knights.');
  if (Array.isArray(levels) && levels.length !== KNIGHT_SLOTS.length) throw new Error('Choose a level for each of the four starting knights.');
  const choices = {};
  const costs = { w: 0, b: 0 };
  for (const [index, slot] of KNIGHT_SLOTS.entries()) {
    const key = Array.isArray(levels) ? index : slot.square;
    const level = Object.hasOwn(levels, key) ? levels[key] : undefined;
    if (!Number.isInteger(level) || level < 0 || level >= KNIGHT_LEVELS.length) throw new Error('Knight levels must be whole numbers from 0 to 3.');
    choices[slot.square] = level;
    costs[slot.color] += PIECES[KNIGHT_LEVELS[level]].cost;
  }
  if (costs.w > budget || costs.b > budget) throw new Error(`Budget exceeded: White ${costs.w}/${budget} · Black ${costs.b}/${budget}.`);
  const board = placement(START_FEN);
  for (const slot of KNIGHT_SLOTS) {
    const level = choices[slot.square];
    const type = KNIGHT_LEVELS[level];
    if (level === 3) put(board, slot.extraSquare, colored(type, slot.color));
    else put(board, slot.square, colored(type, slot.color));
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

/** Recover next-game choices from a game's initial FEN, including old blue saves. */
function loadInitialSetup(fen) {
  const board = placement(fen);
  return Object.fromEntries(KNIGHT_SLOTS.map(slot => {
    const base = at(board, slot.square);
    const extra = at(board, slot.extraSquare);
    const level = extra === colored('g', slot.color) ? 3
      : base === colored('f', slot.color) ? 2
      : base === colored('e', slot.color) ? 1 : 0;
    return [slot.square, level];
  }));
}

module.exports = { START_FEN, setupFromLevels, loadInitialSetup };
