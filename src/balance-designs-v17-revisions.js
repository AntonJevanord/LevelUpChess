'use strict';

// New research identities only. Purchase prices, material estimates and the
// engine's search-value tables remain separate quantities.
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const TRIALS = [
  { key: 'vertical-blocked', label: 'Blocked Vertical bishop', id: 'bishop.vertical-blocked@1',
    family: 'bishop', level: 3, movement: 'BvW2vnN', placement: 'replace',
    baseId: 'bishop.purple@18', valueBaseId: 'bishop.purple@18', valuePolicy: 'preserve-applied-baseline' },
  { key: 'queen-sideways', label: 'Sideways Queen pawn', id: 'pawn.queen-sideways@1',
    family: 'pawn', level: 3, movement: 'mQ2cfQ2', placement: 'replace',
    baseId: 'pawn.purple@12', valueBaseId: 'pawn.purple@12', valuePolicy: 'preserve-applied-baseline' },
  { key: 'xray-rook', label: 'Rook-ray queen', id: 'queen.xray-rook@1',
    family: 'queen', level: 3, movement: 'QgR0', placement: 'replace',
    baseId: 'queen.purple@7', valueBaseId: 'queen.purple@7', valuePolicy: 'preserve-applied-baseline' },
  { key: 'grant-king', label: 'King grant (three points)', id: 'king.grant-king-level3@1',
    family: 'king', level: 3, movement: 'K', placement: 'reserve',
    baseId: 'king.reserve-king@1', valueBaseId: null, valuePolicy: 'measured-automatic-raw' },
  { key: 'grant-orthogonal-three', label: 'Three-step Orthogonal grant (three points)', id: 'king.grant-orthogonal-three-level3@1',
    family: 'king', level: 3, movement: 'W3', placement: 'reserve',
    baseId: 'king.grant-orthogonal-expanded@1', valueBaseId: 'king.grant-orthogonal-expanded@1', valuePolicy: 'preserve-applied-baseline' },
  { key: 'grant-knight', label: 'Knight grant (three points)', id: 'king.grant-knight-level3@1',
    family: 'king', level: 3, movement: 'N', placement: 'reserve',
    baseId: null, valueBaseId: null, valuePolicy: 'measured-automatic-raw' },
];

const trialDefinitions = TRIALS.map(({ id, family, level, movement, placement }) => ({
  id, family, level, revision: 1, movement, legacyType: 'a', legacySlot: 1, placement,
  roles: { pawn: family === 'pawn', castlingRook: false, enPassant: family === 'pawn' },
  inheritLegacyProbes: false,
}));

// Retain the rejected identity for an opening-mate regression, never as a runnable trial.
const REJECTED_DEFINITIONS = [{
  id: 'queen.xray-omni@1', family: 'queen', level: 3, revision: 1,
  movement: 'QgQ0', legacyType: 'a', legacySlot: 1, placement: 'replace',
  roles: { pawn: false, castlingRook: false, enPassant: false }, inheritLegacyProbes: false,
}];
const NEW_DEFINITIONS = [...trialDefinitions, ...REJECTED_DEFINITIONS];

/** Exact-ID fixtures leave every older profile's probe list untouched.
 * The compiler mirrors these frames, including the EP square, for Black. */
function revisionProbes(definition, type, position) {
  if (definition.id === 'bishop.vertical-blocked@1') return [
    { name: 'tall knight is blocked on its first vertical leg', fen: position({ a1: 'K', h7: 'k', d4: type, d5: 'P', d3: 'P', c6: 'p', e6: 'p', c2: 'p', e2: 'p' }) },
    { name: 'tall knight ignores the second vertical square', fen: position({ a1: 'K', h7: 'k', d4: type, d6: 'P', d2: 'P', c6: 'p', e6: 'p', c2: 'p', e2: 'p' }) },
    { name: 'vertical two-step is a clear-path slide and has no sideways counterpart', fen: position({ a1: 'K', h7: 'k', d4: type, b4: 'p', f4: 'p', d6: 'p', d2: 'p' }) },
  ];
  if (definition.id === 'pawn.queen-sideways@1') return [
    { name: 'two-square quiet queen range with forward-only captures', fen: position({ a1: 'K', h7: 'k', d4: type, b4: 'p', f4: 'p', b2: 'p', d2: 'p', f2: 'p', b6: 'p', d6: 'p', f6: 'p' }) },
    { name: 'quiet sideways and backward slides require a clear intervening square', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P', d3: 'P', f4: 'p', d2: 'p' }) },
    { name: 'quiet EP-target visit keeps the bypassed pawn', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'quiet and capturing forward promotions remain standard', fen: position({ h1: 'K', h6: 'k', b7: type, c8: 'r' }) },
  ];
  if (definition.id === 'queen.xray-rook@1') return [
    { name: 'rook-ray x-ray crosses exactly one hurdle and stops at the next blocker', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P', g4: 'p', h4: 'p', d5: 'P', d7: 'p', d8: 'p' }) },
    { name: 'diagonal rays remain blocked and no knight moves are added', fen: position({ a1: 'K', h7: 'k', d4: type, e5: 'P', g7: 'p', h8: 'p', e6: 'p', f5: 'p' }) },
  ];
  if (TRIALS.some(trial => trial.id === definition.id && trial.placement === 'reserve')) return [
    { name: 'finite guard is capturable and nonroyal', fen: position({ a1: 'K', h7: 'k', d4: type, d8: 'r' }, 'b') },
    { name: 'non-pawn guard cannot capture en passant', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'non-pawn guard does not promote on the final rank', fen: position({ h1: 'K', h6: 'k', b7: type }) },
  ];
  return [];
}

freeze({ NEW_DEFINITIONS, REJECTED_DEFINITIONS, TRIALS });
module.exports = { NEW_DEFINITIONS, REJECTED_DEFINITIONS, TRIALS, revisionProbes };
