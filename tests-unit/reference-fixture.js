'use strict';

// Portable positions generated from legal, non-capturing ordinary openings.
// No external book, native executable or search is needed by unit fixtures.
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { createReferencePlan } = require('../scripts/balance/reference-plan');
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let positions, pending;
function makePositions() {
  if (positions) return positions;
  const queue = [START], result = [], seen = new Set();
  for (let index = 0; index < queue.length && result.length < 600; index++) {
    const fen = queue[index], key = fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue;
    seen.add(key); result.push(fen);
    const board = new Chess(fen);
    for (const move of board.moves({ verbose: true })) {
      if (move.captured || move.promotion) continue;
      board.move(move); queue.push(board.fen()); board.undo();
    }
  }
  assert.equal(result.length, 600); positions = result; return positions;
}
function makeBook() { return Buffer.from(makePositions().map(fen => fen + ';').join('\n') + '\n'); }
function getPlan() { return pending ||= createReferencePlan(makeBook()); }
module.exports = { makePositions, makeBook, getPlan };
