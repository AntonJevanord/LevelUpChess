'use strict';

// An isolated follow-up, not additions to the playable catalog. The m in the
// second requested movement is essential: its long quiet paths cannot capture.
const TRIALS = Object.freeze([
  Object.freeze({ key: 'pawn-forward-only', id: 'pawn.level2-forward-queen-only@1',
    label: 'Pawn: forward range two', family: 'pawn', level: 2,
    movement: 'fQ2', anchorId: 'pawn.knight-tall-quiet@1' }),
  Object.freeze({ key: 'pawn-quiet-range', id: 'pawn.level2-quiet-range-forward-bishop@1',
    label: 'Pawn: quiet range two and forward diagonal captures', family: 'pawn', level: 2,
    movement: 'mvQ2fceB2', requestedMovement: 'mvQ2fcB2', anchorId: 'pawn.knight-tall-quiet@1' }),
]);
const NEW_DEFINITIONS = Object.freeze(TRIALS.map((row, index) => Object.freeze({
  id: row.id, family: row.family, level: row.level, revision: 1,
  movement: row.movement, legacyType: 'ac'[index], legacySlot: index + 1,
  placement: 'replace', roles: Object.freeze({ pawn: true, castlingRook: false, enPassant: true }),
  inheritLegacyProbes: false,
})));

function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const ids = new Set(NEW_DEFINITIONS.map(row => row.id)), probes = [];
  const reflect = square => square[0] + (9 - Number(square[1]));
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    if (!ids.has(definition.id)) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['quiet range and no sideways moves', { h1: 'K', h7: 'k', d4: type }],
      ['capture-only diagonals and backward restrictions', { h1: 'K', h7: 'k', d4: type,
        b2: 'p', c3: 'p', e3: 'p', f2: 'p', b6: 'p', c5: 'p', e5: 'p', f6: 'p',
        d2: 'p', d3: 'p', d5: 'p', d6: 'p', c4: 'p', e4: 'p' }],
      ['range two cannot cross blockers', { h1: 'K', h7: 'k', d4: type,
        c3: 'P', c5: 'P', d3: 'P', d5: 'P', e3: 'P', e5: 'P' }],
      ['two-square forward move remains available away from home', { h1: 'K', h7: 'k', d3: type }],
      ['mandatory standard promotion', { h1: 'K', h6: 'k', b7: type, c8: 'r' }],
      ['en-passant capture versus quiet landing', { h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'd6'],
      ['royal safety still constrains movement', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
    ];
    for (const [name, pieces, ep = '-'] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
      probes.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} - ${black && ep !== '-' ? reflect(ep) : ep} 0 1` });
    }
  }
  return probes;
}
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
