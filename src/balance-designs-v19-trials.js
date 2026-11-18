'use strict';

// P is the ordinary pawn component, not a separate Fairy-Stockfish atom.
// Trials enter only an owned research snapshot, never the playable catalog.
const P = 'ifmnDfmWfceF';
const TRIALS = [
  { key: 'queen-wide-forward', id: 'queen.level1-wide-forward-knight@1', label: 'Queen: wide forward knight jumps',
    family: 'queen', level: 1, movement: 'QfsN', requestedMovement: 'QsfN', anchorId: 'queen.level1-forward-knight@1' },
  { key: 'queen-box-jumps', id: 'queen.level1-box-jumps@1', label: 'Queen: two-square box jumps',
    family: 'queen', level: 1, movement: 'QAD', anchorId: 'queen.level1-forward-knight@1' },
  { key: 'pawn-diagonal-vertical', id: 'pawn.level2-diagonal-vertical-range@1', label: 'Pawn: diagonal and vertical range two',
    family: 'pawn', level: 2, movement: 'B2vR2', anchorId: 'pawn.knight-tall-quiet@1' },
  { key: 'pawn-forward-queen', id: 'pawn.level2-forward-queen@1', label: 'Pawn: forward queen and quiet retreat',
    family: 'pawn', level: 2, movement: 'fQ2mbQ2', anchorId: 'pawn.knight-tall-quiet@1' },
  { key: 'pawn-full-knight', id: 'pawn.level3-full-knight@1', label: 'Pawn: full knight jumps',
    family: 'pawn', level: 3, movement: P + 'N', requestedMovement: 'PN', anchorId: 'pawn.purple@13' },
  { key: 'pawn-six-knight', id: 'pawn.level3-six-knight@1', label: 'Pawn: six knight jumps',
    family: 'pawn', level: 3, movement: P + 'sNfN', requestedMovement: 'PsNfN', anchorId: 'pawn.purple@13' },
  { key: 'pawn-forward-knight', id: 'pawn.level3-forward-knight@1', label: 'Pawn: four forward knight jumps',
    family: 'pawn', level: 3, movement: P + 'fhN', requestedMovement: 'PfhN', anchorId: 'pawn.purple@13' },
  { key: 'wraith-side-rays', id: 'queen.wraith-side-ray-full@1', label: 'Wraith: full diagonal and sideways hops',
    family: 'queen', level: 3, movement: 'QgsQ0', anchorId: 'queen.purple@7' },
];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: trial.level, revision: 1,
  movement: trial.movement, legacyType: 'acdefghi'[index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: trial.family === 'pawn', castlingRook: false, enPassant: trial.family === 'pawn' },
  inheritLegacyProbes: false,
}));

function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const ids = new Set(NEW_DEFINITIONS.map(row => row.id)), probes = [];
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    if (!ids.has(definition.id)) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['quiet destinations', { h1: 'K', h7: 'k', d4: type }],
      ['enemy landings and backward capture restrictions', { h1: 'K', h7: 'k', d4: type,
        b3: 'p', b5: 'p', c2: 'p', c6: 'p', e2: 'p', e6: 'p', f3: 'p', f5: 'p',
        b2: 'p', f2: 'p', b6: 'p', f6: 'p', d2: 'p', d6: 'p', b4: 'p', f4: 'p' }],
      ['jumps and sliders distinguish intervening blockers', { h1: 'K', h7: 'k', d4: type,
        c3: 'P', c4: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e4: 'P', e5: 'P',
        b2: 'p', f2: 'p', b6: 'p', f6: 'p', d2: 'p', d6: 'p', b4: 'p', f4: 'p' }],
      ['royal safety constrains otherwise available jumps', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
    ];
    if (definition.roles.pawn) frames.push(
      ['ordinary promotion choices', { h1: 'K', h6: 'k', b7: type, c8: 'r' }],
      ['recorded diagonal en-passant convention', { h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'd6'],
      ['home two-step and forward capture geometry', { a1: 'K', h8: 'k', d2: type, c3: 'p', e3: 'p' }],
    );
    for (const [name, pieces, ep = '-'] of frames) for (const black of [false, true]) {
      const reflect = square => square[0] + (9 - Number(square[1]));
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
      probes.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} - ${black && ep !== '-' ? reflect(ep) : ep} 0 1` });
    }
  }
  return probes;
}
for (const row of TRIALS) Object.freeze(row);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { P, TRIALS, NEW_DEFINITIONS, revisionProbes };
