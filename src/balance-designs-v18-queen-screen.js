'use strict';

// Prospective queen purchases. These immutable bodies are registered only in
// the owned research runtime; historical queens and playable profiles remain.
const LEVEL1_TRIALS = [
  { key: 'queen-camel-capture', label: 'Queen: camel captures',
    id: 'queen.level1-camel-capture@1', family: 'queen', level: 1, movement: 'QcC',
    anchorId: 'queen.blue@2', controlKey: 'baby-amazon-control' },
  { key: 'queen-forward-knight', label: 'Queen: forward-tall knight jumps',
    id: 'queen.level1-forward-knight@1', family: 'queen', level: 1, movement: 'QfN',
    anchorId: 'queen.blue@2', controlKey: 'baby-amazon-control' },
  { key: 'queen-forward-half-knight', label: 'Queen: forward-half knight jumps (sanity check)',
    id: 'queen.level1-forward-half-knight@1', family: 'queen', level: 1, movement: 'QfhN',
    anchorId: 'queen.blue@2', controlKey: 'baby-amazon-control' },
];
const LEVEL2_TRIALS = [
  { key: 'queen-side-knight', label: 'Queen: wide knight jumps',
    id: 'queen.level2-side-knight@1', family: 'queen', level: 2, movement: 'QsN',
    anchorId: 'queen.orange@2', controlKey: 'box-control' },
  { key: 'queen-tall-knight', label: 'Queen: tall knight jumps',
    id: 'queen.level2-tall-knight@1', family: 'queen', level: 2, movement: 'QvN',
    anchorId: 'queen.orange@2', controlKey: 'box-control' },
];
const TRIALS = [...LEVEL1_TRIALS, ...LEVEL2_TRIALS];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: 'queen', level: trial.level, revision: 1,
  movement: trial.movement, legacyType: ['a', 'c', 'd', 'e', 'f'][index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}));

/** Allocated-letter browser/native preflight positions. fN means the TWO tall
 * forward leaps; fhN is all FOUR forward leaps. sN is four wide leaps and vN
 * four tall leaps. Quiet camel
 * jumps are absent from QcC. Kings a1/h7 avoid the queen's open rays. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const entries = Object.entries(profile.definitionsByLetter || {})
    .filter(([, definition]) => TRIALS.some(trial => trial.id === definition.id));
  const targets = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5',
    'a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5'];
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const probes = [];
  for (const [letter, definition] of entries) {
    const type = letter.toUpperCase();
    const frames = [
      ['clear queen rays and selective quiet leaps', { a1: 'K', h7: 'k', d4: type }],
      ['enemy targets test exact capture subsets', { a1: 'K', h7: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, 'b'])) }],
      ['friendly landing squares cannot be captured', { a1: 'K', h7: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, ['c2', 'f5'].includes(square) ? 'P' : 'B'])) }],
      ['leaps cross blockers that stop queen rays', { a1: 'K', h7: 'k', d4: type,
        c4: 'P', d5: 'P', e4: 'P', d3: 'P', c5: 'P', e5: 'P', c6: 'b', e6: 'b' }],
      ['royal safety still restricts a pinned nonroyal queen', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
    ];
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
Object.freeze(LEVEL1_TRIALS); Object.freeze(LEVEL2_TRIALS); Object.freeze(NEW_DEFINITIONS);
module.exports = { LEVEL1_TRIALS, LEVEL2_TRIALS, NEW_DEFINITIONS, revisionProbes };
