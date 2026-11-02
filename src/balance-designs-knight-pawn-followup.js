'use strict';

// Research-only alternatives. The playable Forward Knight pawn remains intact.
const NEW_DEFINITIONS = [
  { id: 'pawn.knight-tall-capture@1', family: 'pawn', level: 2, revision: 1,
    movement: 'ifmnDfmWfceFfsNfceN', legacyType: 'a', legacySlot: 1, placement: 'replace',
    roles: { pawn: true, castlingRook: false, enPassant: true }, inheritLegacyProbes: false },
  { id: 'pawn.knight-tall-quiet@1', family: 'pawn', level: 2, revision: 1,
    movement: 'ifmnDfmWfceFfsNfmN', legacyType: 'c', legacySlot: 2, placement: 'replace',
    roles: { pawn: true, castlingRook: false, enPassant: true }, inheritLegacyProbes: false },
];
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(NEW_DEFINITIONS);
module.exports = { NEW_DEFINITIONS };
