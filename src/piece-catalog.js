// Display and setup metadata. Legal movement remains in the shared variant rules.
const PIECES = Object.freeze(Object.fromEntries([
  { type: 'p', name: 'pawn', family: 'pawn', level: 0, cost: 0, symbols: { w: '♙', b: '♟' } },
  { type: 'n', name: 'knight', family: 'knight', level: 0, cost: 0, symbols: { w: '♘', b: '♞' } },
  { type: 'b', name: 'bishop', family: 'bishop', level: 0, cost: 0, symbols: { w: '♗', b: '♝' } },
  { type: 'r', name: 'rook', family: 'rook', level: 0, cost: 0, symbols: { w: '♖', b: '♜' } },
  { type: 'q', name: 'queen', family: 'queen', level: 0, cost: 0, symbols: { w: '♕', b: '♛' } },
  { type: 'k', name: 'king', family: 'king', level: 0, cost: 0, symbols: { w: '♔', b: '♚' } },
  { type: 'e', name: 'blue knight, level 1', family: 'knight', level: 1, cost: 1, accent: 'blue', symbols: { w: '♘', b: '♞' } },
  { type: 'f', name: 'orange knight, level 2', family: 'knight', level: 2, cost: 2, accent: 'orange', symbols: { w: '♘', b: '♞' } },
  { type: 'g', name: 'purple knight, level 3', family: 'knight', level: 3, cost: 3, accent: 'purple', symbols: { w: '♘', b: '♞' } },
  { type: 'a', name: 'blue pawn, level 1', family: 'pawn', level: 1, cost: 1, accent: 'blue', symbols: { w: '♙', b: '♟' } },
  { type: 'c', name: 'orange pawn, level 2', family: 'pawn', level: 2, cost: 2, accent: 'orange', symbols: { w: '♙', b: '♟' } },
  { type: 'd', name: 'purple pawn, level 3', family: 'pawn', level: 3, cost: 3, accent: 'purple', symbols: { w: '♙', b: '♟' } },
  { type: 'h', name: 'blue bishop, level 1', family: 'bishop', level: 1, cost: 1, accent: 'blue', symbols: { w: '♗', b: '♝' } },
  { type: 'i', name: 'orange bishop, level 2', family: 'bishop', level: 2, cost: 2, accent: 'orange', symbols: { w: '♗', b: '♝' } },
  { type: 'j', name: 'purple bishop, level 3', family: 'bishop', level: 3, cost: 3, accent: 'purple', symbols: { w: '♗', b: '♝' } },
  { type: 't', name: 'orange queen, level 2', family: 'queen', level: 2, cost: 2, accent: 'orange', symbols: { w: '♕', b: '♛' } },
  { type: 'u', name: 'purple queen, level 3', family: 'queen', level: 3, cost: 3, accent: 'purple', symbols: { w: '♕', b: '♛' } },
  { type: 'o', name: 'purple rook, level 3', family: 'rook', level: 3, cost: 3, accent: 'purple', symbols: { w: '♖', b: '♜' } },
  { type: 'l', name: 'blue rook, level 1', family: 'rook', level: 1, cost: 1, accent: 'blue', symbols: { w: '♖', b: '♜' } },
  { type: 'm', name: 'orange rook, level 2', family: 'rook', level: 2, cost: 2, accent: 'orange', symbols: { w: '♖', b: '♜' } },
  { type: 's', name: 'blue queen, level 1', family: 'queen', level: 1, cost: 1, accent: 'blue', symbols: { w: '♕', b: '♛' } },
].map(piece => [piece.type, Object.freeze({ ...piece, symbols: Object.freeze(piece.symbols) })])));

const KNIGHT_LEVELS = Object.freeze(['n', 'e', 'f', 'g']);
const UPGRADE_BUDGETS = Object.freeze([1, 2, 3, 4, 5, 6]);
const KNIGHT_SLOTS = Object.freeze([
  { square: 'b1', extraSquare: 'b3', color: 'w' },
  { square: 'g1', extraSquare: 'g3', color: 'w' },
  { square: 'b8', extraSquare: 'b6', color: 'b' },
  { square: 'g8', extraSquare: 'g6', color: 'b' },
].map(slot => Object.freeze(slot)));

const PIECE_LEVELS = Object.freeze({
  pawn: Object.freeze(['p', 'a', 'c', 'd']),
  knight: KNIGHT_LEVELS,
  bishop: Object.freeze(['b', 'h', 'i', 'j']),
  queen: Object.freeze(['q', 's', 't', 'u']),
  rook: Object.freeze(['r', 'l', 'm', 'o']),
});
const MAX_PIECE_BUDGET = 45;
const PIECE_BUDGETS = Object.freeze(Array.from({ length: MAX_PIECE_BUDGET }, (_, index) => index + 1));
const PIECE_SLOTS = Object.freeze([
  ...[...'abcdefgh'].map(file => ({ square: file + '2', color: 'w', family: 'pawn' })),
  ...[...'abcdefgh'].map(file => ({ square: file + '7', color: 'b', family: 'pawn' })),
  ...KNIGHT_SLOTS.map(slot => ({ ...slot, family: 'knight' })),
  ...['c1', 'f1', 'c8', 'f8'].map(square => ({ square, color: square[1] === '1' ? 'w' : 'b', family: 'bishop' })),
  ...['d1', 'd8'].map(square => ({ square, color: square[1] === '1' ? 'w' : 'b', family: 'queen' })),
  ...['a1', 'h1', 'a8', 'h8'].map(square => ({ square, color: square[1] === '1' ? 'w' : 'b', family: 'rook' })),
].map(slot => Object.freeze(slot)));
const DEFAULT_PIECE_LEVELS = Object.freeze(Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square, ['b1', 'b8'].includes(slot.square) ? 1 : 0])));

function pieceInfo(type) {
  return typeof type === 'string' && Object.hasOwn(PIECES, type) ? PIECES[type] : undefined;
}

module.exports = { PIECES, pieceInfo, KNIGHT_LEVELS, UPGRADE_BUDGETS, KNIGHT_SLOTS, PIECE_LEVELS, PIECE_BUDGETS, MAX_PIECE_BUDGET, PIECE_SLOTS, DEFAULT_PIECE_LEVELS };
