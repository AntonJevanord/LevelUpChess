'use strict';

// Research-only identities. An owned follow-up overlay may register these;
// playable libraries and earlier panel registries remain unchanged.
const TRIALS = [
  { key: 'queen-forward-two-jump', id: 'queen.level2-side-knight-forward-dabbaba@1',
    label: 'Queen: side knight and forward two-jump', family: 'queen', level: 2,
    movement: 'QsNfD', anchorId: 'queen.level2-side-knight@1' },
  { key: 'queen-forward-two-three-jumps', id: 'queen.level2-side-knight-forward-dabbaba-threeleap@1',
    label: 'Queen: side knight and forward two/three-jumps', family: 'queen', level: 2,
    movement: 'QsNfDfH', anchorId: 'queen.level2-side-knight@1' },
  { key: 'rook-no-tall-back-captures', id: 'rook.level2-no-tall-back-capture-knight@1',
    label: 'Rook: no tall-back knight captures', family: 'rook', level: 2,
    movement: 'RcsNcfN', anchorId: 'rook.orange@3' },
  { key: 'queen-no-tall-back-camel', id: 'queen.level3-no-tall-back-camel@1',
    label: 'Queen: no tall-back camel jumps', family: 'queen', level: 3,
    movement: 'QsCfC', anchorId: 'queen.wraith-side-through@1' },
  { key: 'queen-no-tall-back-zebra', id: 'queen.level3-no-tall-back-zebra@1',
    label: 'Queen: no tall-back zebra jumps', family: 'queen', level: 3,
    movement: 'QsZfZ', anchorId: 'queen.wraith-side-through@1' },
  { key: 'zebra-diagonal-queen', id: 'queen.level3-zebra-diagonal-jumps@1',
    label: 'Queen: zebra and diagonal jumps', family: 'queen', level: 3,
    movement: 'QZAG', anchorId: 'queen.wraith-side-through@1' },
  { key: 'queen-zebra-threeleap', id: 'queen.level3-zebra-threeleap@1',
    label: 'Queen: zebra and three-square orthogonal jumps', family: 'queen', level: 3,
    movement: 'QZH', anchorId: 'queen.wraith-side-through@1' },
  { key: 'queen-full-camel', id: 'queen.level3-full-camel@1',
    label: 'Queen: full camel jumps', family: 'queen', level: 3,
    movement: 'QC', anchorId: 'queen.wraith-side-through@1' },
  { key: 'queen-full-zebra', id: 'queen.level3-zebra-retest@1',
    label: 'Queen: full zebra jumps (retest)', family: 'queen', level: 3,
    movement: 'QZ', anchorId: 'queen.wraith-side-through@1' },
];

const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: trial.level, revision: 1,
  movement: trial.movement, legacyType: 'acdefghij'[index], legacySlot: index + 1,
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
      ['jumps cross adjacent friendly blockers', { a8: 'K', h1: 'k', d4: type,
        c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' }],
      ['captures and excluded backward components', { a8: 'K', h1: 'k', d4: type,
        a2: 'p', a3: 'p', a6: 'p', b1: 'p', b3: 'p', b5: 'p', b7: 'p',
        c1: 'p', c2: 'p', c6: 'p', c7: 'p', e1: 'p', e2: 'p', e6: 'p', e7: 'p',
        f1: 'p', f3: 'p', f5: 'p', f7: 'p', g2: 'p', g3: 'p', g6: 'p' }],
      ['forward jumps cross two blockers and can capture', { a8: 'K', h1: 'k', d4: type,
        d5: 'P', d6: 'p', d7: 'p', b2: 'p', b6: 'p', f2: 'p', f6: 'p' }],
      ['diagonal two/three jumps cross two blockers', { a8: 'K', h1: 'k', d4: type,
        c3: 'P', b2: 'p', a1: 'p', e5: 'P', f6: 'p', g7: 'p' }],
      ['royal safety constrains otherwise available jumps', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
    ];
    if (definition.roles.castlingRook) frames.push(
      ['ordinary royal castling with upgraded rooks', { a1: type, e1: 'K', h1: type, e8: 'k' }, 'KQ'],
      ['knight captures attack a king transit square', { e1: 'K', h1: 'R', e2: 'P', e8: 'k', e3: letter }, 'K'],
    );
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
