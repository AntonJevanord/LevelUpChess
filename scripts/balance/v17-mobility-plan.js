'use strict';

// New declarations add evidence without changing completed schedules, prices,
// movements or letter allocations. Fixed short cases remain descriptive.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { BOTH_OPENINGS: OLD_OPENINGS, ENGINE } = require('./v17-followup-plan');
const { CANDIDATES: FOCUS_CANDIDATES, BASELINE, opponents } = require('./v17-targeted-plan');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const ROOT = path.resolve(__dirname, '../..');
const NEW_OPENINGS = freeze(require('../../experiments/balance/v17-mobility-openings.json'));
const ALL_OPENINGS = freeze([...OLD_OPENINGS, ...NEW_OPENINGS]);
const FILES = freeze({
  'mobility-confirm': 'experiments/balance/v17-mobility-confirm.json',
  'mobility-revisions': 'experiments/balance/v17-mobility-revisions.json',
});
const CAPS = freeze({ 'mobility-confirm': 768, 'mobility-revisions': 960 });
const pawnArmy = id => ({ upgrades: { c2: id, d2: id, e2: id } });
const CONFIRM_CANDIDATES = freeze([...FOCUS_CANDIDATES, BASELINE]);
const REVISIONS = freeze([
  { key: 'capture-forward-grants', label: 'Three capture-forward grants', designId: 'king.reserve-pawn@5',
    army: { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@5', count: 3 }] } },
  { key: 'mobile-forward-grants', label: 'Three mobile-forward grants', designId: 'king.reserve-pawn@6',
    army: { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@6', count: 3 }] } },
  { key: 'king-step-pawns', label: 'Three king-step pawns', designId: 'pawn.blue@7',
    army: pawnArmy('pawn.blue@7') },
]);

function candidates(experiment) {
  if (experiment === 'mobility-confirm') return CONFIRM_CANDIDATES;
  if (experiment === 'mobility-revisions') return REVISIONS;
  throw new Error(`Choose a mobility experiment: ${Object.keys(FILES).join(', ')}.`);
}

function cells(experiment) {
  return candidates(experiment).flatMap(a => opponents().filter(b => b.key !== a.key).map(b => [a, b]));
}

function buildMobilityConfig(experiment) {
  const title = experiment === 'mobility-confirm'
    ? 'Version 17: confirm purchase matchups on sixteen new cases (768 games)'
    : experiment === 'mobility-revisions'
      ? 'Version 17: grant and king-step pawn revisions on thirty-two cases (960 games)' : null;
  if (!title) throw new Error(`Choose a mobility experiment: ${Object.keys(FILES).join(', ')}.`);
  return normalizeConfig({ schemaVersion: 3, name: title, seed: 20261028, repetitions: 1,
    engine: ENGINE, openings: experiment === 'mobility-confirm' ? NEW_OPENINGS : ALL_OPENINGS,
    comparisons: cells(experiment).map(([a, b]) => ({
      id: `${a.key}-v-${b.key}`, label: `${a.label} versus ${b.label}`,
      armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 },
    })) });
}

function loadMobility(experiment) {
  if (!Object.hasOwn(FILES, experiment)) throw new Error(`Choose a mobility experiment: ${Object.keys(FILES).join(', ')}.`);
  const file = FILES[experiment];
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  if (!isDeepStrictEqual(config, buildMobilityConfig(experiment)) || makeSchedule(config).length !== CAPS[experiment]) {
    throw new Error(`The declared ${experiment} protocol changed. Use a new experiment declaration.`);
  }
  const columns = opponents();
  return freeze({ experiment, file, config, metadata: {
    kind: experiment, rows: candidates(experiment).map(({ key, label }) => ({ key, label })),
    columns: columns.map(({ key, label }) => ({ key, label })),
    comparisons: cells(experiment).map(([a, b]) => ({ id: `${a.key}-v-${b.key}`,
      aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label })),
    symmetric: false, scheduledGames: CAPS[experiment],
    question: experiment === 'mobility-confirm'
      ? 'Check the four existing design-focus purchases and the two-step baseline on sixteen new cases, without replaying their completed cases.'
      : 'Compare three revised one-point purchase bundles with the four fixed references and three two-step pawns on thirty-two cases.',
    openingCohorts: [
      ...(experiment === 'mobility-confirm' ? [] : [{ id: 'original-sixteen', openingIds: OLD_OPENINGS.map(opening => opening.id) }]),
      { id: 'new-sixteen', openingIds: NEW_OPENINGS.map(opening => opening.id) },
    ],
    openings: 'Sixteen new fixed two-ply cases preserve a one-ordinary-turn deployment delay per side; these are related short prefixes, not independent deep opening samples.',
    uncertainty: 'Compare the four-reference panel and direct baseline matches separately. Equal panel averages do not imply transitive matchup odds or equal material values.',
    baseline: { key: BASELINE.key, label: BASELINE.label, upgradePoints: 3, pieces: 3 },
    historicalReuse: experiment === 'mobility-confirm'
      ? { designFocusGames: 640, baselineReferenceGames: 128, replayOldCases: false }
      : { changedDesignsReuseNoPredecessorGames: true },
  } });
}

module.exports = { OLD_OPENINGS, NEW_OPENINGS, ALL_OPENINGS, FILES, CAPS,
  CONFIRM_CANDIDATES, REVISIONS, candidates, cells, buildMobilityConfig, loadMobility };
