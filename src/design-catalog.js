'use strict';

// A design ID identifies behavior. Engine letters are temporary allocations in
// a particular profile and must never replace these IDs in saved experiments.
const STANDARD_TYPES = Object.freeze({ pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' });

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function definition(family, color, level, movement, legacyType, legacySlot, revision = 1, placement = 'replace') {
  return freeze({
    id: `${family}.${color}@${revision}`,
    family,
    level,
    revision,
    movement,
    legacyType,
    legacySlot,
    placement,
    roles: { pawn: family === 'pawn', castlingRook: family === 'rook', enPassant: family === 'pawn' },
    ...(placement === 'extra' ? { extraSquare: { b1: 'b3', g1: 'g3' } } : {}),
  });
}

const definitions = [
  definition('knight', 'blue', 1, 'NmW', 'e', 1),
  definition('knight', 'orange', 2, 'NsD', 'f', 2),
  definition('knight', 'purple', 3, 'WD', 'g', 3, 1, 'extra'),
  definition('bishop', 'blue', 1, 'BmW', 'h', 4),
  definition('bishop', 'orange', 2, 'BcfN', 'i', 5),
  definition('bishop', 'purple', 3, 'BfbR', 'j', 6),
  definition('queen', 'orange', 2, 'QmN', 't', 7),
  definition('queen', 'purple', 3, 'QN', 'u', 8),
  definition('pawn', 'blue', 1, 'ifmHfmDfmWfceF', 'a', 9),
  definition('pawn', 'orange', 2, 'ifmnDfeWfF', 'c', 10),
  definition('pawn', 'purple', 3, 'mRceB', 'd', 11),
  definition('rook', 'purple', 3, 'RcFcAcNcD', 'o', 12),
  definition('rook', 'blue', 1, 'RimD', 'l', 13),
  definition('rook', 'orange', 2, 'RcpR', 'm', 14),
  definition('queen', 'blue', 1, 'QimNimCimZ', 's', 15),
  // New behavior gets a new ID. The predecessor stays unchanged above.
  definition('pawn', 'purple', 3, 'mR2ceB', 'd', 11, 2),
  definition('rook', 'purple', 3, 'RcN', 'o', 12, 2),
];

const DESIGNS = Object.freeze(Object.fromEntries(definitions.map(design => [design.id, design])));
const LEGACY_DESIGN_IDS = Object.freeze(Object.fromEntries(definitions.filter(design => design.revision === 1).map(design => [design.legacyType, design.id])));

function getDesign(id) {
  return typeof id === 'string' && Object.hasOwn(DESIGNS, id) ? DESIGNS[id] : undefined;
}

module.exports = { DESIGNS, STANDARD_TYPES, LEGACY_DESIGN_IDS, getDesign };
