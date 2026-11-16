'use strict';

// Follow-up trials register only inside the study's owned research snapshot.
// Existing playable bodies and the three control identities remain unchanged.
const TRIALS = [
  { key: 'positional-quiet-queen', label: 'Positional knight: quiet queen paths',
    id: 'knight.positional-quiet-queen@1', family: 'knight', movement: 'NmQ',
    anchorId: 'knight.blue@2', controlKey: 'positional-control' },
  { key: 'positional-quiet-king', label: 'Positional knight: quiet king steps',
    id: 'knight.positional-quiet-king@1', family: 'knight', movement: 'NmK',
    anchorId: 'knight.blue@2', controlKey: 'positional-control' },
  { key: 'hopper-quiet-range', label: 'Hopping bishop: long quiet hops',
    id: 'bishop.hopper-quiet-range@1', family: 'bishop', movement: 'BgBgmB0',
    anchorId: 'bishop.blue@2', controlKey: 'hopping-control' },
  { key: 'hopper-full-range', label: 'Hopping bishop: long capture hops',
    id: 'bishop.hopper-full-range@1', family: 'bishop', movement: 'BgB0',
    anchorId: 'bishop.blue@2', controlKey: 'hopping-control' },
  { key: 'blink-queen', label: 'Blink queen',
    id: 'queen.blink-level1@1', family: 'queen', movement: 'QmDmAmHmGmNmCmZ',
    anchorId: 'queen.blue@2', controlKey: 'baby-amazon-control' },
];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: 1, revision: 1, movement: trial.movement,
  legacyType: ['a', 'c', 'd', 'e', 'f'][index], legacySlot: index + 1, placement: 'replace',
  roles: { pawn: false, castlingRook: false, enPassant: false }, inheritLegacyProbes: false,
}));

/** Probe actual allocated symbols, including both physical colors. Neutral
 * knight hurdles avoid pawn attacks contaminating quiet/capture checks. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const trials = new Map(TRIALS.map(trial => [trial.id, trial]));
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const result = [];
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    const trial = trials.get(definition.id);
    if (!trial) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['clear movement and normal capture components', { a2: 'K', h7: 'k', d4: type }],
      ['adjacent occupied squares distinguish quiet paths from captures', { a2: 'K', h7: 'k', d4: type,
        c3: 'p', d3: 'p', e3: 'p', c4: 'p', e4: 'p', c5: 'p', d5: 'p', e5: 'p' }],
      ['diagonal hurdle with near and far enemy landings', { a2: 'K', h7: 'k', d4: type,
        e5: 'N', f6: 'p', g7: 'p', c5: 'N', a7: 'p' }],
      ['second hurdle blocks long bishop hops', { a2: 'K', h8: 'k', d4: type,
        e5: 'N', f6: 'N', g7: 'p' }],
      ['quiet short leaps cross surrounding friendly blockers', { a2: 'K', h7: 'k', d4: type,
        c3: 'N', d3: 'N', e3: 'N', c4: 'N', e4: 'N', c5: 'N', d5: 'N', e5: 'N' }],
    ];
    for (const [name, pieces] of frames) for (const black of [false, true]) {
      const map = new Map(Object.entries(pieces).map(([square, piece]) => black
        ? [square[0] + (9 - Number(square[1])), swap(piece)] : [square, piece]));
      result.push({ name: `${trial.id}: ${black ? 'Black' : 'White'} ${name}`,
        fen: `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1` });
    }
  }
  return result;
}

for (const trial of TRIALS) Object.freeze(trial);
for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
Object.freeze(TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { TRIALS, NEW_DEFINITIONS, revisionProbes };
