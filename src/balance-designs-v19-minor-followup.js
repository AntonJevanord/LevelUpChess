'use strict';

// Isolated research identities; no live library or earlier study changes.
// The confirmed lowercase h keeps the diagonal-bracket knight forward-only.
const TRIALS = [
  { key: 'knight-zebra', id: 'knight.level2-zebra@1', label: 'Knight: full zebra',
    family: 'knight', level: 2, movement: 'NZ', anchorId: 'knight.nightrider-level2@1' },
  { key: 'knight-zebra-alfil', id: 'knight.level2-zebra-alfil@1', label: 'Knight: zebra and diagonal two-jumps',
    family: 'knight', level: 2, movement: 'NZA', anchorId: 'knight.nightrider-level2@1' },
  { key: 'knight-forward-zebra-alfil', id: 'knight.level2-forward-zebra-forward-alfil@1', label: 'Knight: forward zebra and diagonal two-jumps',
    family: 'knight', level: 2, movement: 'NfhZfA', anchorId: 'knight.nightrider-level2@1' },
  { key: 'knight-forward-zebra-diagonals', id: 'knight.level2-forward-zebra-forward-diagonal-jumps@1', label: 'Knight: forward zebra and diagonal two/three-jumps',
    family: 'knight', level: 2, movement: 'NfhZfAfG', anchorId: 'knight.nightrider-level2@1' },
  { key: 'knight-no-tall-back-zebra-alfil', id: 'knight.level2-no-tall-back-zebra-forward-alfil@1', label: 'Knight: no tall-back zebra and forward diagonal two-jumps',
    family: 'knight', level: 2, movement: 'NfZsZfA', anchorId: 'knight.nightrider-level2@1' },
  { key: 'knight-forward-zebra', id: 'knight.level2-forward-zebra@1', label: 'Knight: forward zebra',
    family: 'knight', level: 2, movement: 'NfhZ', anchorId: 'knight.nightrider-level2@1' },
  { key: 'knight-no-tall-back-zebra', id: 'knight.level2-no-tall-back-zebra@1', label: 'Knight: no tall-back zebra',
    family: 'knight', level: 2, movement: 'NsZfZ', anchorId: 'knight.nightrider-level2@1' },
  { key: 'bishop-dabbaba', id: 'bishop.level1-dabbaba@1', label: 'Bishop: full orthogonal two-jumps',
    family: 'bishop', level: 1, movement: 'BD', anchorId: 'bishop.hopper-full-range@1' },
  { key: 'bishop-side-dabbaba', id: 'bishop.level1-side-dabbaba@1', label: 'Bishop: sideways two-jumps',
    family: 'bishop', level: 1, movement: 'BsD', anchorId: 'bishop.hopper-full-range@1' },
  { key: 'bishop-quiet-dabbaba', id: 'bishop.level1-quiet-dabbaba@1', label: 'Bishop: quiet orthogonal two-jumps',
    family: 'bishop', level: 1, movement: 'BmD', anchorId: 'bishop.hopper-full-range@1' },
  { key: 'bishop-quiet-side-vertical-dabbaba', id: 'bishop.level1-quiet-side-full-vertical-dabbaba@1', label: 'Bishop: quiet sideways and full vertical two-jumps',
    family: 'bishop', level: 1, movement: 'BsmDvD', anchorId: 'bishop.hopper-full-range@1' },
  { key: 'bishop-quiet-side-capture-vertical-dabbaba', id: 'bishop.level1-quiet-side-capture-vertical-dabbaba@1', label: 'Bishop: quiet sideways and capture-only vertical two-jumps',
    family: 'bishop', level: 1, movement: 'BsmDvcD', anchorId: 'bishop.hopper-full-range@1' },
  { key: 'bishop-full-side-quiet-vertical-dabbaba', id: 'bishop.level1-full-side-quiet-vertical-dabbaba@1', label: 'Bishop: full sideways and quiet vertical two-jumps',
    family: 'bishop', level: 1, movement: 'BsDvmD', anchorId: 'bishop.hopper-full-range@1' },
];

const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: trial.level, revision: 1,
  movement: trial.movement, legacyType: 'acdefghijlmos'[index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: false, enPassant: false },
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
      ['jumps cross friendly adjacent blockers', { a8: 'K', h1: 'k', d4: type,
        c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P' }],
      ['captures and omitted backward or quiet-only components', { a8: 'K', h1: 'k', d4: type,
        a1: 'p', a2: 'p', a4: 'p', a6: 'p', a7: 'p', b1: 'p', b2: 'p', b3: 'p', b4: 'p', b5: 'p', b6: 'p', b7: 'p',
        c2: 'p', c6: 'p', d1: 'p', d2: 'p', d6: 'p', d7: 'p', e2: 'p', e6: 'p',
        f1: 'p', f2: 'p', f3: 'p', f4: 'p', f5: 'p', f6: 'p', f7: 'p', g1: 'p', g2: 'p', g4: 'p', g6: 'p', g7: 'p' }],
      ['jumps ignore intermediate enemy pieces', { a8: 'K', h1: 'k', d4: type,
        c3: 'p', c4: 'p', c5: 'p', d3: 'p', d5: 'p', e3: 'p', e4: 'p', e5: 'p' }],
      ['royal safety still constrains escape jumps', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
    ];
    for (const [name, pieces] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
      probes.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1` });
    }
  }
  return probes;
}

for (const row of TRIALS) Object.freeze(row);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
