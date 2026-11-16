'use strict';

// Prospective lower-tier revisions, registered only in the screen's owned
// research snapshot. Exact historical NmR/QmN bodies keep their existing IDs.
const TRIALS = [
  { key: 'positional', label: 'Positional knight', id: 'knight.positional-expanded@1',
    family: 'knight', movement: 'NmR', anchorId: 'knight.blue@2' },
  { key: 'wazzap-knight', label: 'Wazzap knight', id: 'knight.wazzap@1',
    family: 'knight', movement: 'NW', anchorId: 'knight.blue@3' },
  { key: 'hopping', label: 'Hopping bishop', id: 'bishop.hopping-capture@1',
    family: 'bishop', movement: 'BgB', anchorId: 'bishop.blue@2' },
  { key: 'ghost-diagonal', label: 'Ghost rook: quiet diagonals', id: 'rook.ghost-diagonal@1',
    family: 'rook', movement: 'RmBgmR0', anchorId: 'rook.blue@2' },
  { key: 'ghost-diagonal-omni', label: 'Ghost rook: quiet diagonal hops', id: 'rook.ghost-diagonal-omni@1',
    family: 'rook', movement: 'RmBgmQ0', anchorId: 'rook.blue@2' },
  { key: 'baby-amazon', label: 'Baby Amazon', id: 'queen.advancing-expanded@1',
    family: 'queen', movement: 'QmN', anchorId: 'queen.blue@2' },
];
const REUSED = new Set(['knight.positional-expanded@1', 'queen.advancing-expanded@1']);
const NEW_DEFINITIONS = TRIALS.filter(trial => !REUSED.has(trial.id)).map((trial, index) => ({
  id: trial.id, family: trial.family, level: 1, revision: 1, movement: trial.movement,
  legacyType: ['a', 'c', 'd', 'e'][index], legacySlot: index + 1, placement: 'replace',
  roles: { pawn: false, castlingRook: trial.family === 'rook', enPassant: false }, inheritLegacyProbes: false,
}));

/** Full rules/native preflight frames use actual allocated letters, retain
 * adjacent/far captures and quiet blocker distinctions, and mirror both colors. */
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
      ['clear quiet movement and ordinary capture lines', { a2: 'K', h7: 'k', d4: type }],
      ['adjacent enemies distinguish quiet steps and captures', { a2: 'K', h7: 'k', d4: type,
        c3: 'p', d3: 'p', e3: 'p', c4: 'p', e4: 'p', c5: 'p', d5: 'p', e5: 'p' }],
      ['hurdles and far landing captures retain movement restrictions', { a2: 'K', h7: 'k', d4: type,
        e4: 'P', h4: 'p', e5: 'P', f6: 'p', c5: 'P', a7: 'p' }],
      ['second friendly blockers stop ordinary and hopper paths', { a2: 'K', h7: 'k', d4: type,
        e4: 'P', f4: 'P', g4: 'p', e5: 'P', f6: 'P', g7: 'p' }],
    ];
    if (definition.roles.castlingRook) frames.push(['ordinary royal king castles with both revised rooks',
      { a1: type, e1: 'K', h1: type, a8: 'r', e8: 'k', h8: 'r' }, 'KQkq']);
    for (const [name, pieces, castling = '-'] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black
        ? [square[0] + (9 - Number(square[1])), swap(piece)] : [square, piece]));
      probes.push({ name: `${trial.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} ${castling} - 0 1` });
    }
  }
  return probes;
}
for (const trial of TRIALS) Object.freeze(trial);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
