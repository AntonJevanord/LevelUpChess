'use strict';

// New research-only bodies. Purchase price, native automatic values and the
// common controlled search prior are separate experimental declarations.
const TRIALS = [
  { key: 'knight-nwd', label: 'Knight: wazir and dabbaba', id: 'knight.level2-nwd@1',
    family: 'knight', movement: 'NWD', anchorId: 'knight.orange@3', controlKey: 'dabada-control' },
  { key: 'knight-nwh', label: 'Knight: wazir and three-step jump', id: 'knight.level2-nwh@1',
    family: 'knight', movement: 'NWH', anchorId: 'knight.orange@3', controlKey: 'dabada-control' },
  { key: 'knight-nfa', label: 'Knight: diagonal steps and jumps', id: 'knight.level2-nfa@1',
    family: 'knight', movement: 'NFA', anchorId: 'knight.orange@3', controlKey: 'dabada-control' },
  { key: 'knight-nad', label: 'Knight: diagonal and orthogonal two-jumps', id: 'knight.level2-nad@1',
    family: 'knight', movement: 'NAD', anchorId: 'knight.orange@3', controlKey: 'dabada-control' },
  { key: 'bishop-pawn-range', label: 'Bishop pawn: clear diagonal range', id: 'pawn.bishop-diagonal-range@1',
    family: 'pawn', movement: 'fmWifmnDfceF2bF2', anchorId: 'pawn.knight-tall-quiet@1', controlKey: 'bishop-pawn-control' },
  { key: 'bishop-pawn-jump', label: 'Bishop pawn: diagonal jumps', id: 'pawn.bishop-diagonal-jump@1',
    family: 'pawn', movement: 'fmWifmnDfceFfceAbFbA', anchorId: 'pawn.knight-tall-quiet@1', controlKey: 'bishop-pawn-control' },
];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: 2, revision: 1, movement: trial.movement,
  legacyType: ['a', 'c', 'd', 'e', 'f', 'g'][index], legacySlot: index + 1, placement: 'replace',
  roles: { pawn: trial.family === 'pawn', castlingRook: false, enPassant: trial.family === 'pawn' },
  inheritLegacyProbes: false,
}));

/** Allocated-letter positions for the campaign's native/browser preflight.
 * Forward diagonals remain capture-only, retaining actual en-passant removal;
 * backward diagonals move and capture. F2 slides while A jumps its blocker. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const trials = new Map(TRIALS.map(trial => [trial.id, trial]));
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const probes = [];
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    const trial = trials.get(definition.id);
    if (!trial) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['clear quiet and capturing geometry', { a8: 'K', h8: 'k', d4: type }],
      ['enemies test every added leap and diagonal capture', { a8: 'K', h8: 'k', d4: type,
        c3: 'p', e3: 'p', c5: 'p', e5: 'p', b2: 'p', f2: 'p', b6: 'p', f6: 'p',
        d2: 'p', d6: 'p', b4: 'p', f4: 'p' }],
      ['friendly intermediate blockers distinguish slides and jumps', { a8: 'K', h8: 'k', d4: type,
        c3: 'P', e3: 'P', c5: 'P', e5: 'P', d3: 'P', e4: 'P',
        b2: 'p', f2: 'p', b6: 'p', f6: 'p', d2: 'p', d6: 'p', f4: 'p' }],
    ];
    if (trial.family === 'pawn') frames.push(
      ['home double advance retains a clear intermediate square', { a1: 'K', h8: 'k', c2: type }],
      ['blocked home double advance cannot jump its blocker', { a1: 'K', h8: 'k', c2: type, c3: 'P' }],
      ['declared en-passant landing after an opposing pawn double advance', { a1: 'K', h8: 'k', e5: type, d5: 'p' }, 'd6'],
      ['ordinary forward and diagonal promotion choices', { a1: 'K', h7: 'k', c7: type, d8: 'r' }],
      ['two-square diagonal capture promotion respects the path or jumps it', { a1: 'K', h8: 'k', c6: type, d7: 'P', e8: 'r' }],
    );
    for (const [name, pieces, enPassant = '-'] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black
        ? [square[0] + (9 - Number(square[1])), swap(piece)] : [square, piece]));
      const ep = black && enPassant !== '-' ? enPassant[0] + (9 - Number(enPassant[1])) : enPassant;
      probes.push({ name: `${trial.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} - ${ep} 0 1` });
    }
  }
  return probes;
}
for (const trial of TRIALS) Object.freeze(trial);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
