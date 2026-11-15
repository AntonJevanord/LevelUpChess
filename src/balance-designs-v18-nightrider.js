'use strict';

// Opt-in mobility trials. The current roster keeps its original N0 identity.
const TRIALS = [
  { key: 'nightrider-quiet-diagonal', id: 'knight.nightrider-quiet-diagonal@1',
    label: 'Nightrider: quiet diagonal steps', movement: 'N0mF' },
  { key: 'nightrider-quiet-orthogonal', id: 'knight.nightrider-quiet-orthogonal@1',
    label: 'Nightrider: quiet orthogonal steps', movement: 'N0mW' },
  { key: 'nightrider-quiet-king', id: 'knight.nightrider-quiet-king@1',
    label: 'Nightrider: quiet king steps', movement: 'N0mK' },
];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: 'knight', level: 3, revision: 1, movement: trial.movement,
  legacyType: ['a', 'c', 'd'][index], legacySlot: index + 1, placement: 'replace',
  roles: { pawn: false, castlingRook: false, enPassant: false }, inheritLegacyProbes: false,
}));
for (const trial of TRIALS) Object.freeze(trial);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);

/** Extra proof positions for a compiled isolated profile. The original N0 ray
 * is tested beside the quiet step, so a parser that accidentally grants step
 * captures, unlimited king rays or jumping Nightrider rays fails visibly. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const entries = Object.entries(profile.definitionsByLetter || {})
    .filter(([, definition]) => TRIALS.some(trial => trial.id === definition.id));
  const result = [];
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  for (const [letter, definition] of entries) {
    const type = letter.toUpperCase();
    const frames = [
      ['quiet adjacent movement', { a1: 'K', h8: 'k', d4: type }],
      ['quiet steps cannot capture adjacent enemies', { a1: 'K', h8: 'k', d4: type,
        c3: 'p', d3: 'p', e3: 'p', c4: 'p', e4: 'p', c5: 'p', d5: 'p', e5: 'p' }],
      ['friendly adjacent blockers', { a1: 'K', h8: 'k', d4: type,
        c3: 'P', d3: 'P', e3: 'P', c4: 'P', e4: 'P', c5: 'P', d5: 'P', e5: 'P' }],
      ['first knight-ray landing blocks the continuation', { a1: 'K', h8: 'k', d4: type, e6: 'P', f8: 'p' }],
      ['first knight-ray enemy can be captured but not crossed', { a1: 'K', h8: 'k', d4: type, e6: 'p', f8: 'p' }],
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

module.exports = { NEW_DEFINITIONS, TRIALS, revisionProbes };
