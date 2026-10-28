'use strict';

// A separate declaration keeps the completed screens and every measured
// design identity intact. Only these four new alternatives receive games.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getOfficialReferences } = require('./official-references');
const { BOTH_OPENINGS, OLD_OPENINGS, NEW_OPENINGS, ENGINE } = require('./v17-followup-plan');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const ROOT = path.resolve(__dirname, '../..');
const EXPERIMENT = 'design-focus';
const FILES = freeze({ [EXPERIMENT]: 'experiments/balance/v17-design-focus.json' });
const CAPS = freeze({ [EXPERIMENT]: 640 });
const HOMES = freeze({ knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' });
const pawnArmy = id => ({ upgrades: { c2: id, d2: id, e2: id } });
const CANDIDATES = freeze([
  { key: 'grid-bishop', label: 'Grid bishop', designId: 'bishop.purple@19',
    army: { upgrades: { c1: 'bishop.purple@19' } } },
  { key: 'full-diagonal-pawns', label: 'Three full-diagonal pawns', designId: 'pawn.blue@6',
    army: pawnArmy('pawn.blue@6') },
  { key: 'long-forward-grants', label: 'Three long-forward grants', designId: 'king.reserve-pawn@3',
    army: { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@3', count: 3 }] } },
  { key: 'pawn-like-grants', label: 'Three pawn-like grants', designId: 'king.reserve-pawn@4',
    army: { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@4', count: 3 }] } },
]);
const BASELINE = freeze({ key: 'two-step-pawns', label: 'Three two-step pawns', designId: 'pawn.blue@5',
  army: pawnArmy('pawn.blue@5') });

function opponents() {
  return [...getOfficialReferences().roster.map(reference => ({ key: reference.key, label: reference.name,
    designId: reference.id, army: { upgrades: { [HOMES[reference.family]]: reference.id } } })), BASELINE];
}

function buildTargetedConfig() {
  return normalizeConfig({ schemaVersion: 3,
    name: 'Version 17: grid bishop, capture pawn and guard alternatives (640 games)',
    seed: 20261028, repetitions: 1, engine: ENGINE, openings: BOTH_OPENINGS,
    comparisons: CANDIDATES.flatMap(a => opponents().map(b => ({
      id: `${a.key}-v-${b.key}`, label: `${a.label} versus ${b.label}`,
      armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 },
    }))),
  });
}

function loadTargeted(experiment = EXPERIMENT) {
  if (experiment !== EXPERIMENT) throw new Error(`Choose the targeted experiment: ${EXPERIMENT}.`);
  const file = FILES[experiment];
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  if (!isDeepStrictEqual(config, buildTargetedConfig()) || makeSchedule(config).length !== CAPS[experiment]) {
    throw new Error(`The declared ${experiment} protocol changed. Use a new experiment declaration.`);
  }
  const columns = opponents();
  return freeze({ experiment, file, config, metadata: {
    kind: experiment,
    rows: CANDIDATES.map(({ key, label }) => ({ key, label })),
    columns: columns.map(({ key, label }) => ({ key, label })),
    comparisons: CANDIDATES.flatMap(a => columns.map(b => ({ id: `${a.key}-v-${b.key}`,
      aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label }))),
    symmetric: false, scheduledGames: CAPS[experiment],
    question: 'Compare four new three-point purchases with the frozen level-three references and three level-one two-step pawns.',
    openingCohorts: [
      { id: 'original-eight', openingIds: OLD_OPENINGS.map(opening => opening.id) },
      { id: 'new-eight', openingIds: NEW_OPENINGS.map(opening => opening.id) },
    ],
    openings: 'Use the same sixteen fixed cases and both colors. Grants start in finite pockets; nonempty prefixes delay deployment by one ordinary turn per side.',
    uncertainty: 'This is a descriptive fixed-opening screen. Overall score averages only the four level-three references; the three-two-step-pawn baseline remains a separate matchup column.',
    baseline: { key: BASELINE.key, label: BASELINE.label, upgradePoints: 3, pieces: 3 },
  } });
}

module.exports = { EXPERIMENT, FILES, CAPS, CANDIDATES, BASELINE, opponents, buildTargetedConfig, loadTargeted };
