'use strict';

// New names preserve the two previously declared campaigns. The expanded
// option is for a fresh revision run; additions-only avoids replaying it.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { ENGINE } = require('./v17-followup-plan');
const { ALL_OPENINGS, OLD_OPENINGS, NEW_OPENINGS, REVISIONS } = require('./v17-mobility-plan');
const { opponents } = require('./v17-targeted-plan');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const ROOT = path.resolve(__dirname, '../..');
const FILES = freeze({
  'mobility-expanded': 'experiments/balance/v17-mobility-expanded.json',
  'mobility-additions': 'experiments/balance/v17-mobility-additions.json',
});
const CAPS = freeze({ 'mobility-expanded': 1600, 'mobility-additions': 640 });
const ADDITIONS = freeze([
  { key: 'support-pawns', label: 'Three Support pawns', designId: 'pawn.blue@8',
    army: { upgrades: { c2: 'pawn.blue@8', d2: 'pawn.blue@8', e2: 'pawn.blue@8' } } },
  { key: 'scout-grants', label: 'Three Scout grants', designId: 'king.reserve-pawn@7',
    army: { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@7', count: 3 }] } },
]);
function candidates(experiment) {
  if (experiment === 'mobility-expanded') return [...REVISIONS, ...ADDITIONS];
  if (experiment === 'mobility-additions') return ADDITIONS;
  throw new Error(`Choose an expanded mobility experiment: ${Object.keys(FILES).join(', ')}.`);
}
function buildExtrasConfig(experiment) {
  const rows = candidates(experiment), columns = opponents();
  return normalizeConfig({ schemaVersion: 3,
    name: experiment === 'mobility-expanded'
      ? 'Version 17: expanded mobility revisions with Support pawns and Scout grants (1600 games)'
      : 'Version 17: Support pawn and Scout grant additions (640 games)',
    seed: 20261028, repetitions: 1, engine: ENGINE, openings: ALL_OPENINGS,
    comparisons: rows.flatMap(a => columns.map(b => ({ id: `${a.key}-v-${b.key}`,
      label: `${a.label} versus ${b.label}`, armyA: a.army, armyB: b.army,
      strengthA: { skill: 20 }, strengthB: { skill: 20 } }))),
  });
}
function loadExtras(experiment) {
  if (!Object.hasOwn(FILES, experiment)) throw new Error('Unknown expanded mobility experiment.');
  const file = FILES[experiment];
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  if (!isDeepStrictEqual(config, buildExtrasConfig(experiment)) || makeSchedule(config).length !== CAPS[experiment]) {
    throw new Error(`The declared ${experiment} protocol changed. Use a new experiment declaration.`);
  }
  const rows = candidates(experiment), columns = opponents();
  return freeze({ experiment, file, config, metadata: {
    kind: experiment, rows: rows.map(({ key, label }) => ({ key, label })),
    columns: columns.map(({ key, label }) => ({ key, label })),
    comparisons: rows.flatMap(a => columns.map(b => ({ id: `${a.key}-v-${b.key}`,
      aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label }))),
    symmetric: false, scheduledGames: CAPS[experiment],
    question: experiment === 'mobility-expanded'
      ? 'Compare all five revised one-point purchases with the fixed references and three two-step pawns on thirty-two cases.'
      : 'Test the two added one-point purchases without replaying any original mobility-revision games.',
    openingCohorts: [
      { id: 'original-sixteen', openingIds: OLD_OPENINGS.map(item => item.id) },
      { id: 'new-sixteen', openingIds: NEW_OPENINGS.map(item => item.id) },
    ],
    baseline: { key: 'two-step-pawns', label: 'Three two-step pawns', upgradePoints: 3, pieces: 3 },
    uncertainty: 'These fixed related starting cases provide a descriptive screen. Overall score includes only the four references; the pawn baseline is separate.',
    alternativeTo: experiment === 'mobility-expanded' ? 'mobility-revisions' : null,
    doNotRunAlongside: experiment === 'mobility-expanded' ? ['mobility-revisions', 'mobility-additions'] : ['mobility-expanded'],
  } });
}
module.exports = { FILES, CAPS, ADDITIONS, candidates, buildExtrasConfig, loadExtras };
