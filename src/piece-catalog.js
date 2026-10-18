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
].map(piece => [piece.type, Object.freeze({ ...piece, symbols: Object.freeze(piece.symbols) })])));

const KNIGHT_LEVELS = Object.freeze(['n', 'e', 'f', 'g']);
const UPGRADE_BUDGETS = Object.freeze([1, 2, 3, 4, 5, 6]);
const KNIGHT_SLOTS = Object.freeze([
  { square: 'b1', extraSquare: 'b3', color: 'w' },
  { square: 'g1', extraSquare: 'g3', color: 'w' },
  { square: 'b8', extraSquare: 'b6', color: 'b' },
  { square: 'g8', extraSquare: 'g6', color: 'b' },
].map(slot => Object.freeze(slot)));

function pieceInfo(type) {
  return typeof type === 'string' && Object.hasOwn(PIECES, type) ? PIECES[type] : undefined;
}

module.exports = { PIECES, pieceInfo, KNIGHT_LEVELS, UPGRADE_BUDGETS, KNIGHT_SLOTS };
