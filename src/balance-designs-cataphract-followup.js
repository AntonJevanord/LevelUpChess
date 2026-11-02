'use strict';

// Research-only restrictions. The live RC Cataphract remains unchanged.
const NEW_DEFINITIONS = [
  { id: 'rook.cataphract-no-tall-back@1', family: 'rook', level: 3, revision: 1,
    movement: 'RsCfC', legacyType: 'a', legacySlot: 1, placement: 'replace',
    roles: { pawn: false, castlingRook: true, enPassant: false }, inheritLegacyProbes: false },
  { id: 'rook.cataphract-forward-half@1', family: 'rook', level: 3, revision: 1,
    movement: 'RfhC', legacyType: 'c', legacySlot: 2, placement: 'replace',
    roles: { pawn: false, castlingRook: true, enPassant: false }, inheritLegacyProbes: false },
];
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(NEW_DEFINITIONS);
module.exports = { NEW_DEFINITIONS };
