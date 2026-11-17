'use strict';

// Append fixtures only to new version-19 profiles. Existing compiler and
// research definitions remain unchanged so historical runtime hashes survive.
const { placementFromMap } = require('./profile-fen');
const researchProbes = [
  require('./balance-designs-v18-level1').revisionProbes,
  require('./balance-designs-v18-l1-followup').revisionProbes,
  require('./balance-designs-v18-l2-followup').revisionProbes,
  require('./balance-designs-v18-knight-screen').revisionProbes,
  require('./balance-designs-v18-queen-screen').revisionProbes,
  require('./balance-designs-v18-prepanel-queens').revisionProbes,
  require('./balance-designs-v18-prepanel-level2').revisionProbes,
  require('./balance-designs-v18-prepanel-level3').revisionProbes,
];
const reflect = square => square[0] + (9 - Number(square[1]));
const swap = text => text.replace(/[a-z]/gi, piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase());

function position(pieces, black, { turn = 'w', rights = '-', ep = '-', pocket } = {}) {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [reflect(square), swap(piece)] : [square, piece]));
  if (pocket !== undefined) map.pocket = black ? swap(pocket) : pocket;
  const castling = black && rights !== '-' ? [...'KQkq'].filter(value => swap(rights).includes(value)).join('') : rights;
  return `${placementFromMap(map)} ${black ? turn === 'w' ? 'b' : 'w' : turn} ${castling || '-'} ${black && ep !== '-' ? reflect(ep) : ep} 0 1`;
}

function revisionProbes(profile) {
  if (!profile || !profile.definitionsByLetter) return [];
  const probes = [...(profile.capabilityProbes || [])];
  for (const build of researchProbes) if (build) probes.push(...build(profile));
  const add = (definition, name, pieces, fields) => {
    for (const black of [false, true]) probes.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${name}`, fen: position(pieces, black, fields) });
  };
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter)) {
    const type = letter.toUpperCase();
    if (definition.roles.pawn) {
      add(definition, 'recorded diagonal en-passant convention', { h1: 'K', h8: 'k', c5: type, d5: 'p' }, { ep: 'd6' });
      add(definition, 'ordinary forward and capture promotion choices', { h1: 'K', h6: 'k', b7: type, c8: 'r' });
      add(definition, 'pawn capture paths retain their intervening blockers', { h1: 'K', h8: 'k', d4: type, c5: 'P', e5: 'P', b6: 'p', f6: 'p' });
    }
    if (definition.roles.castlingRook) {
      add(definition, 'both royal castling sides use the upgraded rook', { a1: type, e1: 'K', h1: type, e8: 'k' }, { rights: 'KQ' });
      add(definition, 'castling through check remains forbidden', { a1: type, e1: 'K', h1: type, d8: 'k', f8: 'r' }, { rights: 'KQ' });
    }
    if (definition.placement === 'reserve') {
      add(definition, 'finite home-half drop and occupied square', { a1: 'K', h8: 'k', c4: 'P' }, { pocket: type.repeat(2) });
      add(definition, 'checking drops are prohibited', { a1: 'K', d6: 'k' }, { pocket: type });
      add(definition, 'a grant may interpose a rook check', { e1: 'K', h8: 'k', e8: 'r' }, { pocket: type });
      add(definition, 'a knight check cannot be blocked by a drop', { e1: 'K', h8: 'k', f3: 'n' }, { pocket: type });
      add(definition, 'captured grant disappears instead of entering a pocket', { a1: 'K', h7: 'k', d4: type, d8: 'r' }, { turn: 'b', pocket: '' });
      add(definition, 'a non-pawn grant does not promote', { h1: 'K', h6: 'k', b7: type }, { pocket: '' });
    }
  }
  // A position is authoritative once even if the generic compiler and a
  // specific revision both supplied it. Keep deterministic first-seen names.
  const unique = new Map();
  for (const probe of probes) if (!unique.has(probe.fen)) unique.set(probe.fen, probe);
  return [...unique.values()];
}

module.exports = { revisionProbes };
