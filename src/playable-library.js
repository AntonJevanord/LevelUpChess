'use strict';

// Catalog entries outlive individual playtest libraries. Keep this selection
// explicit so another design revision cannot silently reassign this library.
const REFERENCE_DESIGN_IDS = Object.freeze([
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

// Each frozen group fits the 20 custom-letter limit. Shared IDs keep the same
// behavior; letters are meaningful only inside the selected group's profile.
const PLAYABLE_DESIGN_IDS = Object.freeze([
  'pawn.blue@1', 'pawn.orange@1', 'pawn.orange@2',
  'pawn.purple@1', 'pawn.purple@3', 'pawn.purple@4', 'pawn.purple@5',
  'knight.blue@1', 'knight.orange@1', 'knight.purple@2', 'knight.purple@3',
  'bishop.purple@1', 'bishop.purple@2',
  'rook.purple@2', 'rook.purple@3',
  'queen.blue@1', 'queen.orange@1', 'queen.purple@1', 'queen.purple@2', 'queen.purple@3',
]);
const PLAYABLE_LIBRARIES = Object.freeze([
  Object.freeze({ id: 'workshop', name: 'Mobility and pairs', designIds: PLAYABLE_DESIGN_IDS,
    json: 'src/playable-profile.json', ini: 'variants/levelup-playable.ini' }),
  Object.freeze({ id: 'reference', name: 'First prototypes', designIds: REFERENCE_DESIGN_IDS,
    json: 'src/playable-reference-profile.json', ini: 'variants/levelup-playable-reference.ini' }),
]);

module.exports = { PLAYABLE_DESIGN_IDS, REFERENCE_DESIGN_IDS, PLAYABLE_LIBRARIES };
