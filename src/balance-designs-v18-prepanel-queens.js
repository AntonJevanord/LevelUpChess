'use strict';

// New purchase/search contexts for unchanged movement. Earlier queen trials
// keep their immutable identities, prices, priors and recorded outcomes.
const LEVEL1_TRIALS = [
  { key: 'queen-l1-tall-knight', label: 'Queen: tall knight jumps at level one',
    id: 'queen.level1-tall-knight@1', family: 'queen', level: 1, movement: 'QvN',
    anchorId: 'queen.blue@2', controlKey: 'forward-queen-control' },
];
const LEVEL2_TRIALS = [
  { key: 'queen-l2-camel-capture', label: 'Queen: camel captures at level two',
    id: 'queen.level2-camel-capture@1', family: 'queen', level: 2, movement: 'QcC',
    anchorId: 'queen.orange@2', controlKey: 'side-queen-control' },
];
const TRIALS = [...LEVEL1_TRIALS, ...LEVEL2_TRIALS];
const NEW_DEFINITIONS = TRIALS.map((trial, index) => ({
  id: trial.id, family: trial.family, level: trial.level, revision: 1,
  movement: trial.movement, legacyType: ['a', 'c'][index], legacySlot: index + 1,
  placement: 'replace', roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}));

/** Actual allocated-letter positions for native/browser campaign preflight.
 * Tall N leaps move and capture. Camel leaps capture only. Ordinary queen
 * rays remain clear-path sliders, and both pieces remain nonroyal. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
  const targets = ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5',
    'a3', 'a5', 'c1', 'c7', 'e1', 'e7', 'g3', 'g5'];
  const probes = [];
  for (const [letter, definition] of Object.entries(profile.definitionsByLetter || {})) {
    if (!TRIALS.some(trial => trial.id === definition.id)) continue;
    const type = letter.toUpperCase();
    const frames = [
      ['clear queen rays and selective quiet leaps', { a1: 'K', h7: 'k', d4: type }],
      ['enemy targets preserve exact capture subsets', { a1: 'K', h7: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, 'b'])) }],
      ['friendly landing squares remain blocked', { a1: 'K', h7: 'k', d4: type,
        ...Object.fromEntries(targets.map(square => [square, ['c2', 'f5'].includes(square) ? 'P' : 'B'])) }],
      ['leaps cross blockers that stop ordinary queen rays', { a1: 'K', h7: 'k', d4: type,
        c3: 'P', d3: 'P', e3: 'P', c4: 'P', e4: 'P', c5: 'P', d5: 'P', e5: 'P' }],
      ['a pinned queen must preserve royal king safety', { d1: 'K', h7: 'k', d8: 'r', d4: type }],
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
for (const rows of [LEVEL1_TRIALS, LEVEL2_TRIALS, TRIALS, NEW_DEFINITIONS]) Object.freeze(rows);
module.exports = { TRIALS, LEVEL1_TRIALS, LEVEL2_TRIALS, NEW_DEFINITIONS, revisionProbes };
