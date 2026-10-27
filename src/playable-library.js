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
  'pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'pawn.purple@5',
  'knight.blue@1', 'knight.orange@1', 'knight.purple@2', 'knight.purple@3',
  'bishop.blue@1', 'bishop.purple@3', 'bishop.purple@4',
  'rook.purple@2', 'rook.purple@4',
  'queen.blue@1', 'queen.orange@1', 'queen.purple@1', 'queen.purple@4',
]);
// Paired alternatives coexist in one profile, so either side can try a revision
// without switching libraries or changing the other side's selected design.
const ALTERNATIVE_DESIGN_IDS = Object.freeze([
  'pawn.blue@1', 'pawn.orange@1', 'pawn.orange@2',
  'pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'pawn.purple@10', 'pawn.purple@5',
  'knight.purple@2', 'knight.purple@3',
  'bishop.purple@3', 'bishop.purple@4', 'bishop.purple@5', 'bishop.purple@6',
  'rook.purple@2', 'rook.purple@4', 'rook.purple@5',
  'queen.purple@1', 'queen.purple@4', 'queen.purple@5',
]);
const OFFICIAL_REFERENCE_DESIGN_IDS = Object.freeze([
  'rook.purple@10', 'knight.purple@3', 'bishop.purple@13', 'queen.purple@1',
]);
const RESERVE_DESIGN_IDS = Object.freeze([
  'king.reserve-pawn@1', 'king.reserve-bishop@1', 'king.reserve-rook@1',
  'king.reserve-king@1', 'king.reserve-knight@1', 'king.reserve-queen@1',
  'king.reserve-okapi@1', 'king.reserve-princess@1', 'king.reserve-true-queen@1',
]);
const V16_CANDIDATES = Object.freeze({
  pawns: Object.freeze(['pawn.blue@2', 'pawn.orange@3', 'pawn.purple@11', 'pawn.blue@3', 'pawn.orange@4', 'pawn.purple@12']),
  knights: Object.freeze(['knight.blue@2', 'knight.orange@3', 'knight.purple@4', 'knight.blue@3', 'knight.orange@4', 'knight.purple@5', 'knight.purple@6']),
  bishops: Object.freeze(['bishop.blue@2', 'bishop.orange@2', 'bishop.purple@14', 'bishop.blue@3', 'bishop.orange@3', 'bishop.purple@15', 'bishop.purple@16']),
  rooks: Object.freeze(['rook.blue@2', 'rook.orange@2', 'rook.purple@12', 'rook.blue@3', 'rook.orange@3', 'rook.purple@13']),
  queens: Object.freeze(['queen.blue@2', 'queen.orange@2', 'queen.purple@6', 'queen.purple@7', 'queen.purple@8']),
});
const closeoutLibrary = (group, candidates = []) => Object.freeze({
  id: `v16-${group}`,
  name: group === 'references' ? 'Version 16 references' : `${group[0].toUpperCase() + group.slice(1, -1)} workshop`,
  generation: 16,
  designIds: Object.freeze([...OFFICIAL_REFERENCE_DESIGN_IDS, ...candidates, ...RESERVE_DESIGN_IDS]),
  json: `src/playable-v16-${group}-profile.json`,
  ini: `variants/levelup-playable-v16-${group}.ini`,
});
const PLAYABLE_LIBRARIES = Object.freeze([
  Object.freeze({ id: 'workshop', name: 'Rebalance workshop', designIds: PLAYABLE_DESIGN_IDS,
    json: 'src/playable-profile.json', ini: 'variants/levelup-playable.ini' }),
  Object.freeze({ id: 'reference', name: 'First prototypes (archive)', designIds: REFERENCE_DESIGN_IDS,
    json: 'src/playable-reference-profile.json', ini: 'variants/levelup-playable-reference.ini' }),
  Object.freeze({ id: 'alternatives', name: 'Design alternatives', designIds: ALTERNATIVE_DESIGN_IDS,
    json: 'src/playable-alternatives-profile.json', ini: 'variants/levelup-playable-alternatives.ini' }),
  closeoutLibrary('references'),
  ...Object.entries(V16_CANDIDATES).map(([group, candidates]) => closeoutLibrary(group, candidates)),
]);

module.exports = { PLAYABLE_DESIGN_IDS, REFERENCE_DESIGN_IDS, ALTERNATIVE_DESIGN_IDS, OFFICIAL_REFERENCE_DESIGN_IDS, RESERVE_DESIGN_IDS, V16_CANDIDATES, PLAYABLE_LIBRARIES };
