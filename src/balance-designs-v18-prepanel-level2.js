'use strict';

// New two-point alternatives are registered only in their owned research
// runtime. Earlier studies and the live playable catalog retain their bodies.
const TRIALS = [
  { key: 'knight-nd-quiet-orthogonal', id: 'knight.level2-nd-quiet-orthogonal@1',
    label: 'Knight: ND and quiet orthogonal steps', family: 'knight', movement: 'NDmW',
    anchorId: 'knight.orange@3', controlKey: 'ndmk-control' },
  { key: 'knight-nd-quiet-diagonal', id: 'knight.level2-nd-quiet-diagonal@1',
    label: 'Knight: ND and quiet diagonal steps', family: 'knight', movement: 'NDmF',
    anchorId: 'knight.orange@3', controlKey: 'ndmk-control' },
  { key: 'bishop-side-two', id: 'bishop.level2-side-two@1',
    label: 'Bishop: two-square sideways range', family: 'bishop', movement: 'BsW2',
    anchorId: 'bishop.orange@3', controlKey: 'free-boar-control' },
  { key: 'bishop-side-blocked-knight', id: 'bishop.level2-side-blocked-knight@1',
    label: 'Bishop: sideways step and blocked knight', family: 'bishop', movement: 'BsWsnN',
    anchorId: 'bishop.orange@3', controlKey: 'free-boar-control' },
  { key: 'bishop-side-three', id: 'bishop.level2-side-three@1',
    label: 'Bishop: three-square sideways range', family: 'bishop', movement: 'BsW3',
    anchorId: 'bishop.orange@3', controlKey: 'free-boar-control' },
];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: 2, revision: 1,
  movement: trial.movement, legacyType: ['a', 'c', 'd', 'e', 'f'][index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}));

function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const result = [];
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    if (!TRIALS.some(trial => trial.id === definition.id)) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['clear range and quiet-step geometry', { h1: 'K', a8: 'k', d4: type }],
      ['enemy landings distinguish quiet steps from captures', { h1: 'K', a8: 'k', d4: type,
        c3: 'p', c4: 'p', c5: 'p', d3: 'p', d5: 'p', e3: 'p', e4: 'p', e5: 'p',
        b4: 'p', f4: 'p', b3: 'p', b5: 'p', f3: 'p', f5: 'p' }],
      ['friendly landings remain blocked', { h1: 'K', a8: 'k', d4: type,
        c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' }],
      ['first sideways square blocks sliders and lame knight', { h1: 'K', a8: 'k', d4: type,
        c4: 'P', e4: 'P', b4: 'p', f4: 'p', b5: 'p', f5: 'p' }],
      ['second sideways square blocks slides but not lame knight', { h1: 'K', a8: 'k', d4: type,
        b4: 'P', f4: 'P', b5: 'p', f5: 'p' }],
      ['pinned nonroyal body must preserve king safety', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
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
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
