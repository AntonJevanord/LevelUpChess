'use strict';

// New two-point trials; earlier knight studies keep their original rosters.
const TRIALS = [
  { key: 'knight-nd', id: 'knight.level2-nd@1',
    label: 'Knight: two-square orthogonal jumps', family: 'knight',
    movement: 'ND', anchorId: 'knight.orange@3', controlKey: 'nightrider-control' },
  { key: 'knight-nd-quiet-king', id: 'knight.level2-nd-quiet-king@1',
    label: 'Knight: two-square jumps and quiet king steps', family: 'knight',
    movement: 'NDmK', anchorId: 'knight.orange@3', controlKey: 'nightrider-control' },
];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: 2, revision: 1,
  movement: trial.movement, legacyType: ['a', 'c'][index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}));

function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const targets = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5', 'b4', 'd2', 'd6', 'f4'];
  const result = [];
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    if (!TRIALS.some(trial => trial.id === definition.id)) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['clear knight and two-square orthogonal geometry', { a1: 'K', h8: 'k', d4: type }],
      ['enemy landings can be captured', { a1: 'K', h8: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, 'b'])) }],
      ['friendly landing squares remain blocked', { a1: 'K', h8: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, 'B'])) }],
      ['orthogonal jumps cross occupied intermediate squares', { a1: 'K', h8: 'k', d4: type,
        c4: 'B', e4: 'B', d3: 'B', d5: 'B' }],
      ['a pinned knight must preserve royal king safety', { d1: 'K', h8: 'k', d8: 'r', d4: type }],
    ];
    if (definition.movement === 'NDmK') {
      const neighbors = ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'];
      frames.push(
        ['quiet king steps cannot capture enemy neighbors', { a1: 'K', h8: 'k', d4: type,
          ...Object.fromEntries(neighbors.map(square => [square, 'p'])) }],
        ['friendly neighbors block quiet king steps', { a1: 'K', h8: 'k', d4: type,
          ...Object.fromEntries(neighbors.map(square => [square, 'P'])) }],
      );
    }
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
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
