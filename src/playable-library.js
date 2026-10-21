'use strict';

// Catalog entries outlive individual playtest libraries. Keep this selection
// explicit so another design revision cannot silently reassign this library.
const PLAYABLE_DESIGN_IDS = Object.freeze([
  'pawn.blue@1',
  'pawn.orange@1',
  'pawn.purple@1',
  'pawn.purple@3',
  'pawn.purple@4',
  'pawn.purple@5',
  'pawn.purple@6',
  'knight.blue@1',
  'knight.orange@1',
  'knight.purple@2',
  'bishop.blue@1',
  'bishop.orange@1',
  'bishop.purple@1',
  'rook.blue@1',
  'rook.orange@1',
  'rook.purple@1',
  'rook.purple@2',
  'queen.blue@1',
  'queen.orange@1',
  'queen.purple@1',
]);

module.exports = { PLAYABLE_DESIGN_IDS };
