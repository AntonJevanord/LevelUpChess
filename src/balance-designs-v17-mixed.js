'use strict';

// A new reserve experiment, not a replacement for an earlier movement or price.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

const NEW_DEFINITIONS = [{
  id: 'king.grant-wd-level3@1', family: 'king', level: 3, revision: 1,
  movement: 'WD', legacyType: 'a', legacySlot: 1, placement: 'reserve',
  roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}];

/** Exact-ID probes preserve the archived fixtures of every older definition. */
function grantProbes(definition, type, position) {
  if (definition.id !== 'king.grant-wd-level3@1') return [];
  return [
    { name: 'orthogonal steps and two-square jumps with no longer or diagonal moves',
      fen: position({ a1: 'K', h7: 'k', d4: type, d6: 'p', f4: 'p', d2: 'p', b4: 'p' }) },
    { name: 'two-square orthogonal jumps cross friendly intermediate blockers',
      fen: position({ a1: 'K', h7: 'k', d4: type, d5: 'P', e4: 'P', d3: 'P', c4: 'P', d6: 'p', f4: 'p', d2: 'p', b4: 'p' }) },
    { name: 'finite nonroyal grant remains capturable',
      fen: position({ a1: 'K', h7: 'k', d4: type, d8: 'r' }, 'b') },
    { name: 'non-pawn grant keeps ordinary nonpromotion at the last rank',
      fen: position({ h1: 'K', h6: 'k', b7: type }) },
  ];
}

freeze({ NEW_DEFINITIONS });
module.exports = { NEW_DEFINITIONS, grantProbes };
