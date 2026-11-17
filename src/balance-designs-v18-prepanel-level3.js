'use strict';

// New three-point identities. Earlier two-point versions keep their original
// purchase context and every frozen reference retains its tested definition.
const TRIALS = [
  { key: 'knight-l3-nwh', id: 'knight.level3-nwh@1', label: 'Knight: orthogonal steps and three-square jumps', movement: 'NWH' },
  { key: 'knight-l3-nh', id: 'knight.level3-nh@1', label: 'Knight: three-square orthogonal jumps', movement: 'NH' },
  { key: 'knight-l3-nz', id: 'knight.level3-nz@1', label: 'Knight: zebra jumps', movement: 'NZ' },
  { key: 'knight-l3-naz', id: 'knight.level3-naz@1', label: 'Knight: diagonal two-square and zebra jumps', movement: 'NAZ' },
  { key: 'knight-l3-nad', id: 'knight.level3-nad@1', label: 'Knight: diagonal and orthogonal two-square jumps', movement: 'NAD' },
  { key: 'knight-l3-nad-quiet-king', id: 'knight.level3-nad-quiet-king@1', label: 'Knight: two-square jumps and quiet king steps', movement: 'NADmK' },
  { key: 'knight-l3-ndh', id: 'knight.level3-ndh@1', label: 'Knight: two- and three-square orthogonal jumps', movement: 'NDH' },
].map(trial => ({ ...trial, family: 'knight', anchorId: 'knight.purple@3', controlKey: 'unicorn-control' }));
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: 3, revision: 1,
  movement: trial.movement, legacyType: ['a', 'c', 'd', 'e', 'f', 'g', 'h'][index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}));

/** Valid allocated-letter positions for browser/native movement preflight.
 * W steps, A/D/H/Z leaps and quiet K steps retain separate capture geometry. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const targets = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5',
    'c4', 'e4', 'd3', 'd5', 'a4', 'g4', 'd1', 'd7',
    'b1', 'b7', 'f1', 'f7', 'a2', 'a6', 'g2', 'g6',
    'b2', 'b6', 'f2', 'f6', 'b4', 'd2', 'd6', 'f4'];
  const probes = [];
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    if (!TRIALS.some(trial => trial.id === definition.id)) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['clear stepped and jumping geometry', { a1: 'K', h8: 'k', d4: type }],
      ['enemy landings test the declared capture subsets', { a1: 'K', h8: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, 'b'])) }],
      ['friendly landing squares remain blocked', { a1: 'K', h8: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, ['b2', 'f6'].includes(square) ? 'N' : 'B'])) }],
      ['long jumps cross occupied intervening squares', { a1: 'K', h8: 'k', d4: type,
        c4: 'P', e4: 'P', d3: 'P', d5: 'P', e5: 'P', f5: 'P' }],
      ['a pinned nonroyal knight must preserve king safety', { d1: 'K', h8: 'k', d8: 'r', d4: type }],
    ];
    if (definition.movement === 'NADmK') {
      const neighbors = ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'];
      frames.push(
        ['quiet king steps cannot capture adjacent enemies', { a1: 'K', h8: 'k', d4: type,
          ...Object.fromEntries(neighbors.map(square => [square, 'p'])) }],
        ['friendly neighbors block quiet king steps', { a1: 'K', h8: 'k', d4: type,
          ...Object.fromEntries(neighbors.map(square => [square, 'P'])) }],
      );
    }
    for (const [name, pieces] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black
        ? [square[0] + (9 - Number(square[1])), swap(piece)] : [square, piece]));
      probes.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1` });
    }
  }
  return probes;
}

for (const trial of TRIALS) Object.freeze(trial);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
