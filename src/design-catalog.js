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

function definition(family, color, level, movement, legacyType, legacySlot, revision = 1, placement = 'replace', extraSquare) {
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
    ...(placement === 'insert' ? { extraSquare: { b1: 'b2', g1: 'g2' } } : {}),
    ...(extraSquare ? { extraSquare } : {}),
  });
}

function rosterDefinition(...args) {
  // Allocation hints do not identify historical behavior. In particular, a
  // new rook borrowing "a" must not inherit that letter's old pawn fixtures.
  return freeze({ ...definition(...args), inheritLegacyProbes: false });
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
  // Version 10 candidates preserve their predecessors for archived profiles.
  definition('pawn', 'purple', 3, 'mfRmsRcfB2', 'd', 11, 3),
  definition('pawn', 'purple', 3, 'ifmnDfmWfceFsR', 'd', 11, 4),
  definition('pawn', 'purple', 3, 'fQ2mbQ2', 'd', 11, 5),
  definition('pawn', 'purple', 3, 'fmWfmDfceF', 'd', 11, 6, 'pair'),
  definition('knight', 'purple', 3, 'WD', 'g', 3, 2, 'insert'),
  // Version 11 alternatives and repricing keep every previous ID immutable.
  definition('pawn', 'orange', 2, 'fmWfmDfceF', 'c', 10, 2, 'pair'),
  definition('knight', 'orange', 2, 'NC', 'f', 2, 2),
  definition('bishop', 'purple', 3, 'BmsR2sN', 'j', 6, 2),
  definition('rook', 'purple', 3, 'RmFmDmNmAmHmCmZmG', 'o', 12, 3),
  definition('queen', 'purple', 3, 'Q2', 'u', 8, 2, 'split', { d1: 'd2' }),
  definition('queen', 'purple', 3, 'K', 'u', 8, 3, 'insert', { d1: 'd2' }),
  // Repricing is also a new immutable revision; keep NC movement unchanged.
  definition('knight', 'purple', 3, 'NC', 'g', 3, 3),
  // Version 14: new revisions after the stopped level-3 comparison.
  definition('pawn', 'purple', 3, 'mRceB2', 'd', 11, 7),
  definition('pawn', 'purple', 3, 'mfRmsRcfB', 'd', 11, 8),
  definition('pawn', 'purple', 3, 'ifmnDfmWfceFsRfsN', 'd', 11, 9),
  definition('bishop', 'purple', 3, 'BfbRmN', 'j', 6, 3),
  definition('bishop', 'purple', 3, 'BsR2sN', 'j', 6, 4),
  definition('rook', 'purple', 3, 'RFmDmNmAmHmCmZmG', 'o', 12, 4),
  definition('queen', 'purple', 3, 'FmW', 'u', 8, 4, 'insert', { d1: 'd2' }),
  // Version 15 alternatives keep the version-14 revisions intact for comparison.
  definition('pawn', 'purple', 3, 'ifmnDfmWfceFsRfsNfsC', 'd', 11, 10),
  definition('bishop', 'purple', 3, 'BfbRfbN', 'j', 6, 5),
  definition('bishop', 'purple', 3, 'BsRsN', 'j', 6, 6),
  definition('rook', 'purple', 3, 'RFmDmNmAmHmCmZmGcB2', 'o', 12, 5),
  definition('queen', 'purple', 3, 'mKcfKcsW', 'u', 8, 5, 'insert', { d1: 'd2' }),
  // Version 16 revision screen: retain every measured predecessor above.
  definition('bishop', 'purple', 3, 'BsWsN', 'j', 6, 7),
  definition('bishop', 'purple', 3, 'BsR2msN', 'j', 6, 8),
  definition('bishop', 'purple', 3, 'BsR2fsN', 'j', 6, 9),
  definition('rook', 'purple', 3, 'RcNcF', 'o', 12, 6),
  definition('rook', 'purple', 3, 'RcNF', 'o', 12, 7),
  definition('rook', 'purple', 3, 'RN', 'o', 12, 8),
  // Simple references keep the historical allocations free for linked evidence.
  definition('bishop', 'purple', 3, 'BsR', 'v', 16, 10),
  definition('rook', 'purple', 3, 'RB', 'w', 17, 9),
  definition('rook', 'purple', 3, 'RfB', 'x', 18, 10),
  definition('rook', 'purple', 3, 'RB2', 'y', 19, 11),
  // Quiet horizontal hurdle hops; both are separate immutable test candidates.
  definition('bishop', 'purple', 3, 'BsRgmsR', 'z', 20, 11),
  definition('bishop', 'purple', 3, 'BsRgmsR0', 'l', 21, 12),
  definition('bishop', 'purple', 3, 'BsR2nsN', 'm', 22, 13),
  // Version-16 playable roster. Previous experiments retain their exact IDs,
  // prices, rules and placements; these are unbalanced playtest candidates.
  rosterDefinition('pawn', 'blue', 1, 'fmWfeFifmnD', 'a', 1, 2),
  rosterDefinition('pawn', 'orange', 2, 'fmWfceFifmnDfhN', 'c', 2, 3),
  rosterDefinition('pawn', 'purple', 3, 'fceF2mR', 'd', 3, 11),
  rosterDefinition('pawn', 'blue', 1, 'bmWfmW2fceF', 'e', 4, 3),
  rosterDefinition('pawn', 'orange', 2, 'mWeFifmnD', 'f', 5, 4),
  rosterDefinition('pawn', 'purple', 3, 'feQ2bmQ2', 'g', 6, 12),
  rosterDefinition('knight', 'blue', 1, 'NsmR', 'a', 1, 2),
  rosterDefinition('knight', 'orange', 2, 'NsWsD', 'c', 2, 3),
  rosterDefinition('knight', 'purple', 3, 'N0', 'd', 3, 4),
  rosterDefinition('knight', 'blue', 1, 'NvW', 'e', 4, 3),
  rosterDefinition('knight', 'orange', 2, 'NA', 'f', 5, 4),
  rosterDefinition('knight', 'purple', 3, 'NK', 'g', 6, 5),
  rosterDefinition('knight', 'purple', 3, 'NWH', 'l', 10, 6),
  rosterDefinition('bishop', 'blue', 1, 'BgmB', 'a', 1, 2),
  rosterDefinition('bishop', 'orange', 2, 'BvN', 'c', 2, 2),
  rosterDefinition('bishop', 'purple', 3, 'BcWcNcDcA', 'd', 3, 14),
  rosterDefinition('bishop', 'blue', 1, 'BsW', 'e', 4, 3),
  rosterDefinition('bishop', 'orange', 2, 'BsR', 'f', 5, 3),
  rosterDefinition('bishop', 'purple', 3, 'BvWvNvZ', 'g', 6, 15),
  rosterDefinition('bishop', 'purple', 3, 'BN', 'l', 10, 16),
  rosterDefinition('rook', 'blue', 1, 'RgmR0', 'a', 1, 2),
  rosterDefinition('rook', 'orange', 2, 'RmFmDmAmHmGmNmCmZ', 'c', 2, 2),
  rosterDefinition('rook', 'purple', 3, 'RC', 'd', 3, 12),
  rosterDefinition('rook', 'blue', 1, 'RceF', 'e', 4, 3),
  rosterDefinition('rook', 'orange', 2, 'RcN', 'f', 5, 3),
  rosterDefinition('rook', 'purple', 3, 'RFsNsC', 'g', 6, 13),
  rosterDefinition('queen', 'blue', 1, 'QmfhN', 'e', 4, 2),
  rosterDefinition('queen', 'orange', 2, 'QmHmCmZmG', 'f', 5, 2),
  rosterDefinition('queen', 'purple', 3, 'QsNsC', 'd', 3, 6),
  rosterDefinition('queen', 'purple', 3, 'QgB0', 'g', 6, 7),
  rosterDefinition('queen', 'purple', 3, 'QZ', 'l', 10, 8),
  // A king purchase grants one nonroyal reserve piece. The ordinary royal
  // king stays on e1/e8, including its normal safety and castling rules.
  ...[
    ['pawn', 'fW'], ['bishop', 'F'], ['rook', 'W2'], ['king', 'K'],
    ['knight', 'KmN'], ['queen', 'K2'], ['okapi', 'NZ'],
    ['princess', 'KN'], ['true-queen', 'Q'],
  ].map(([name, movement], index) => rosterDefinition('king', `reserve-${name}`, index + 1, movement, 'acdefghij'[index], index + 1, 1, 'reserve')),
  // Version-17 research revisions are selected only by declared experiments.
  // The playable version-16 libraries and every measured predecessor stay fixed.
  rosterDefinition('pawn', 'purple', 3, 'mRcfB', 'd', 3, 13),
  rosterDefinition('bishop', 'purple', 3, 'BcWcN', 'd', 3, 17),
  rosterDefinition('bishop', 'purple', 3, 'BvWvN', 'g', 6, 18),
  rosterDefinition('rook', 'purple', 3, 'RFsNmsC', 'g', 6, 14),
  rosterDefinition('pawn', 'blue', 1, 'mFfmWfceFifmnD', 'a', 1, 4),
  rosterDefinition('pawn', 'blue', 1, 'fmW2fceF2', 'e', 4, 5),
  rosterDefinition('king', 'reserve-pawn', 1, 'fF', 'a', 1, 2, 'reserve'),
  // Focused capture/guard experiment; measured predecessors stay immutable.
  rosterDefinition('bishop', 'purple', 3, 'BDC', 'd', 3, 19),
  rosterDefinition('king', 'reserve-pawn', 1, 'fW2', 'a', 1, 3, 'reserve'),
  rosterDefinition('king', 'reserve-pawn', 1, 'fmWfceF', 'a', 1, 4, 'reserve'),
  rosterDefinition('pawn', 'blue', 1, 'FfmWifmnD', 'a', 1, 6),
  // Capture-one-square grant alternatives and a more mobile diagonal pawn.
  rosterDefinition('king', 'reserve-pawn', 1, 'cfWmfF', 'a', 1, 5, 'reserve'),
  rosterDefinition('king', 'reserve-pawn', 1, 'fWmfF', 'a', 1, 6, 'reserve'),
  rosterDefinition('pawn', 'blue', 1, 'mWFifmnD', 'a', 1, 7),
  // Support-pawn and Scout-grant additions keep every measured design fixed.
  rosterDefinition('pawn', 'blue', 1, 'fmWfceFifmnDsW', 'a', 1, 8),
  rosterDefinition('king', 'reserve-pawn', 1, 'fWbmF', 'a', 1, 7, 'reserve'),
];

const DESIGNS = Object.freeze(Object.fromEntries(definitions.map(design => [design.id, design])));
const LEGACY_DESIGN_IDS = Object.freeze(Object.fromEntries(definitions.filter(design => design.revision === 1 && design.family !== 'king').map(design => [design.legacyType, design.id])));

function getDesign(id) {
  return typeof id === 'string' && Object.hasOwn(DESIGNS, id) ? DESIGNS[id] : undefined;
}

module.exports = { DESIGNS, STANDARD_TYPES, LEGACY_DESIGN_IDS, getDesign };
