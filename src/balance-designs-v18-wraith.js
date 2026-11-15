'use strict';

// Research-only Wraith variations. The existing QgB0 roster and all archived
// profiles retain their exact definitions. A hurdle is the first occupied
// square on a ray; it is crossed, rather than captured by the hopper component.
const TRIALS = [
  { key: 'wraith-side-through', label: 'Wraith: long sideways captures',
    id: 'queen.wraith-side-through@1', family: 'queen', level: 3,
    movement: 'QgmQ0gcBgcsR0', placement: 'replace',
    baseId: 'queen.purple@7', valueBaseId: 'queen.purple@7',
    valuePolicy: 'preserve-applied-baseline' },
  { key: 'wraith-short-through', label: 'Wraith: short through captures',
    id: 'queen.wraith-short-through@1', family: 'queen', level: 3,
    movement: 'QgmQ0gcsQ', placement: 'replace',
    baseId: 'queen.purple@7', valueBaseId: 'queen.purple@7',
    valuePolicy: 'preserve-applied-baseline' },
];

const NEW_DEFINITIONS = TRIALS.map(({ id, family, level, movement, placement }, index) => ({
  id, family, level, revision: 1, movement, placement,
  legacyType: index ? 'c' : 'a', legacySlot: index + 1,
  roles: { pawn: false, castlingRook: false, enPassant: false },
  inheritLegacyProbes: false,
}));

function wraithProbes(definition, type, position) {
  if (!NEW_DEFINITIONS.some(row => row.id === definition.id)) return [];
  const kings = { a2: 'K', h7: 'k' };
  return [
    { name: 'ordinary queen moves remain available without a hurdle',
      fen: position({ ...kings, d4: type }) },
    { name: 'quiet hops cross one hurdle in every queen direction',
      fen: position({ ...kings, d4: type, e4: 'P', c4: 'P', d5: 'P', d3: 'P',
        e5: 'P', c5: 'P', e3: 'P', c3: 'P' }) },
    { name: 'diagonal hopper captures land immediately beyond the first hurdle',
      fen: position({ ...kings, d4: type, e5: 'P', f6: 'p', g7: 'p', c5: 'P', b6: 'p',
        e3: 'P', f2: 'p', c3: 'P', b2: 'p' }) },
    { name: 'sideways hopper capture range and vertical capture exclusion',
      fen: position({ ...kings, d4: type, e4: 'P', g4: 'p', h4: 'p', c4: 'P', a4: 'p',
        d5: 'P', d7: 'p', d3: 'P', d1: 'p' }) },
    { name: 'second friendly blocker stops quiet and capturing hopper rays',
      fen: position({ ...kings, d4: type, e4: 'P', f4: 'P', g4: 'p', e5: 'P', f6: 'P', g7: 'p' }) },
  ];
}

/** Adapt the exact-ID frames to a compiled profile's actual letter allocation.
 * Both colors are included because this prospective preflight runs after the
 * original compiler's immutable capability-probe list has been constructed. */
function revisionProbes(profile) {
  const { placementFromMap } = require('./profile-fen');
  const entries = Object.entries(profile.definitionsByLetter || {})
    .filter(([, definition]) => NEW_DEFINITIONS.some(row => row.id === definition.id));
  const result = [];
  const swap = text => text.replace(/[a-z]/gi, piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase());
  for (const [letter, definition] of entries) {
    const frames = wraithProbes(definition, letter.toUpperCase(), pieces => `${placementFromMap(new Map(Object.entries(pieces)))} w - - 0 1`);
    for (const frame of frames) for (const black of [false, true]) {
      const fields = frame.fen.split(' ');
      if (black) { fields[0] = swap(fields[0].split('/').reverse().join('/')); fields[1] = 'b'; }
      result.push({ name: `${definition.id}: ${black ? 'Black' : 'White'} ${frame.name}`, fen: fields.join(' ') });
    }
  }
  return result;
}

for (const definition of NEW_DEFINITIONS) { Object.freeze(definition.roles); Object.freeze(definition); }
for (const trial of TRIALS) Object.freeze(trial);
Object.freeze(NEW_DEFINITIONS); Object.freeze(TRIALS);
module.exports = { NEW_DEFINITIONS, TRIALS, wraithProbes, revisionProbes };
