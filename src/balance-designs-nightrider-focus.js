'use strict';

// Loaded only by the isolated focused-study catalog, never the live roster.
const NEW_DEFINITIONS = [
  { id: 'knight.nightrider-diagonal-capture@1', family: 'knight', level: 3, revision: 1,
    movement: 'N0cF', legacyType: 'a', legacySlot: 1, placement: 'replace',
    roles: { pawn: false, castlingRook: false, enPassant: false }, inheritLegacyProbes: false },
  { id: 'knight.nightrider-orthogonal-capture@1', family: 'knight', level: 3, revision: 1,
    movement: 'N0cW', legacyType: 'c', legacySlot: 2, placement: 'replace',
    roles: { pawn: false, castlingRook: false, enPassant: false }, inheritLegacyProbes: false },
];
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(NEW_DEFINITIONS);
module.exports = { NEW_DEFINITIONS };
