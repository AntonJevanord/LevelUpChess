'use strict';

// Isolated research identities; existing profiles and live catalogs keep their
// original meanings. Directional modifiers apply only to the following atom.
const TRIALS = [
  { key: 'queen-side-two-knight', id: 'queen.level2-side-knight-side-dabbaba@1',
    label: 'Queen: sideways two-jump and knight', family: 'queen', level: 2,
    movement: 'QsDsN', anchorId: 'queen.level2-side-knight@1' },
  { key: 'queen-side-two-knight-diagonal', id: 'queen.level2-side-knight-side-dabbaba-alfil@1',
    label: 'Queen: sideways two-jump, knight and diagonal two-jump', family: 'queen', level: 2,
    movement: 'QsDsNA', anchorId: 'queen.level2-side-knight@1' },
  { key: 'queen-side-two-three-knight', id: 'queen.level2-side-knight-side-dabbaba-threeleap@1',
    label: 'Queen: sideways knight and two/three-jumps', family: 'queen', level: 2,
    movement: 'QsNsDsH', anchorId: 'queen.level2-side-knight@1' },
  { key: 'rook-forward-half-knight', id: 'rook.level2-forward-half-knight-captures@1',
    label: 'Rook: forward-half knight captures', family: 'rook', level: 2,
    movement: 'RcfhN', anchorId: 'rook.orange@3' },
  { key: 'rook-wide-knight', id: 'rook.level2-wide-knight-captures@1',
    label: 'Rook: wide knight captures', family: 'rook', level: 2,
    movement: 'RcsN', anchorId: 'rook.orange@3' },
  { key: 'queen-side-camel-zebra', id: 'queen.level3-side-camel-zebra@1',
    label: 'Queen: sideways camel and zebra', family: 'queen', level: 3,
    movement: 'QsCsZ', anchorId: 'queen.wraith-side-through@1' },
  { key: 'queen-side-three-camel-zebra', id: 'queen.level3-side-threeleap-camel-zebra@1',
    label: 'Queen: sideways three-jump, camel and zebra', family: 'queen', level: 3,
    movement: 'QsHsCsZ', anchorId: 'queen.wraith-side-through@1' },
  { key: 'queen-side-three-camel-zebra-diagonal', id: 'queen.level3-side-threeleap-camel-zebra-tripper@1',
    label: 'Queen: sideways three-jump, camel, zebra and diagonal three-jump', family: 'queen', level: 3,
    movement: 'QsHsCsZG', anchorId: 'queen.wraith-side-through@1' },
];

const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: trial.level, revision: 1,
  movement: trial.movement, legacyType: 'acdefghi'[index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: trial.family === 'rook', enPassant: false },
  inheritLegacyProbes: false,
}));

function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const ids = new Set(NEW_DEFINITIONS.map(row => row.id)), probes = [];
  const reflect = square => square[0] + (9 - Number(square[1]));
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    if (!ids.has(definition.id)) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['quiet movement and directional reach', { a8: 'K', h1: 'k', d4: type }],
      ['jump through adjacent friendly blockers', { a8: 'K', h1: 'k', d4: type,
        c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' }],
      ['captures and omitted directions', { a8: 'K', h1: 'k', d4: type,
        a1: 'p', a2: 'p', a3: 'p', a4: 'p', a5: 'p', a6: 'p', a7: 'p',
        b2: 'p', b3: 'p', b4: 'p', b5: 'p', b6: 'p', c2: 'p', c6: 'p',
        e2: 'p', e6: 'p', f2: 'p', f3: 'p', f4: 'p', f5: 'p', f6: 'p',
        g1: 'p', g2: 'p', g3: 'p', g4: 'p', g5: 'p', g6: 'p', g7: 'p' }],
      ['orthogonal and diagonal jumps cross two blockers', { a8: 'K', h1: 'k', d4: type,
        c4: 'P', b4: 'p', a4: 'p', e4: 'P', f4: 'p', g4: 'p',
        c3: 'P', b2: 'p', a1: 'p', e5: 'P', f6: 'p', g7: 'p' }],
      ['royal safety constrains off-file jumps', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
    ];
    if (definition.roles.castlingRook) {
      const attacker = definition.movement === 'RcfhN' ? 'e3' : 'd2';
      frames.push(
        ['ordinary royal castling with upgraded rooks', { a1: type, e1: 'K', h1: type, e8: 'k' }, 'KQ'],
        ['knight capture attacks the king transit square', { e1: 'K', h1: 'R', e2: 'P', e8: 'k', [attacker]: letter }, 'K'],
      );
    }
    for (const [name, pieces, castling = '-'] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
      probes.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} ${black ? castling.toLowerCase() : castling} - 0 1` });
    }
  }
  return probes;
}

for (const row of TRIALS) Object.freeze(row);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
