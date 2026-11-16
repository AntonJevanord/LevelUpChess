'use strict';

// Prospective two-point purchases. The level-three Nightrider and every older
// experiment retain their own identity, price and valuation policy.
const TRIALS = [
  { key: 'knight-nh', label: 'Knight: three-square orthogonal jumps',
    id: 'knight.level2-nh@1', family: 'knight', movement: 'NH',
    anchorId: 'knight.orange@3', controlKey: 'nfa-control' },
  { key: 'knight-ndh', label: 'Knight: two- and three-square orthogonal jumps',
    id: 'knight.level2-ndh@1', family: 'knight', movement: 'NDH',
    anchorId: 'knight.orange@3', controlKey: 'nfa-control' },
  { key: 'nightrider-level2', label: 'Nightrider: two-point trial',
    id: 'knight.nightrider-level2@1', family: 'knight', movement: 'N0',
    anchorId: 'knight.orange@3', controlKey: 'nfa-control' },
];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: 'knight', level: 2, revision: 1,
  movement: trial.movement, legacyType: ['a', 'c', 'd'][index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}));

/** Valid allocated-letter positions for browser/native campaign preflight.
 * Bishops occupy leaper targets without accidentally checking the corner
 * kings or placing unpromoted pawns on their final rank. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const entries = Object.entries(profile.definitionsByLetter || {})
    .filter(([, definition]) => TRIALS.some(trial => trial.id === definition.id));
  const targets = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5',
    'a4', 'd1', 'd7', 'g4', 'b4', 'd2', 'd6', 'f4', 'b8', 'f8', 'h2', 'h6'];
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const result = [];
  for (const [letter, definition] of entries) {
    const type = letter.toUpperCase();
    const frames = [
      ['clear knight, long jump and rider geometry', { a1: 'K', h8: 'k', d4: type }],
      ['enemy targets preserve capturing geometry', { a1: 'K', h8: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, 'b'])) }],
      ['friendly targets cannot be captured or crossed by a rider', { a1: 'K', h8: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, 'B'])) }],
      ['first knight-ray landing stops its continuation', { a1: 'K', h8: 'k', d4: type, e6: 'B', f8: 'b' }],
      ['pieces between knight landings do not block a leap', { a1: 'K', h8: 'k', d4: type,
        e5: 'N', d5: 'N', f8: 'b' }],
      ['king safety still restricts a pinned nonroyal knight', { d1: 'K', h8: 'k', d8: 'r', d4: type }],
    ];
    for (const [name, pieces] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black
        ? [square[0] + (9 - Number(square[1])), swap(piece)] : [square, piece]));
      result.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1` });
    }
  }
  return result;
}

for (const trial of TRIALS) Object.freeze(trial);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { NEW_DEFINITIONS, TRIALS, revisionProbes };
