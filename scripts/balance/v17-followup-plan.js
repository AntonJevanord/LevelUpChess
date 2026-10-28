'use strict';

// These follow-ups are new declarations. Original version-17 protocols and
// design identities remain unchanged, including the completed eight starts.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { getOfficialReferences } = require('./official-references');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const ROOT = path.resolve(__dirname, '../..');
const ENGINE = freeze({ nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
const OLD_OPENINGS = require('../../experiments/balance/v17-openings.json');
const NEW_OPENINGS = require('../../experiments/balance/v17-followup-openings.json');
freeze(OLD_OPENINGS); freeze(NEW_OPENINGS);
const BOTH_OPENINGS = freeze([...OLD_OPENINGS, ...NEW_OPENINGS]);
const HOMES = freeze({ pawn: 'd2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' });
const FILES = freeze({
  'level3-confirm': 'experiments/balance/v17-followup-level3-confirm.json',
  'level3-revisions': 'experiments/balance/v17-followup-level3-revisions.json',
  'pawn-grants-revisions': 'experiments/balance/v17-followup-pawn-grants.json',
});
const CAPS = freeze({ 'level3-confirm': 576, 'level3-revisions': 640, 'pawn-grants-revisions': 384 });
const UNCHANGED = freeze([
  ['pawn.purple@12', 'Queen pawn'],
  ['knight.purple@4', 'Nightrider'],
  ['knight.purple@5', 'Princess knight'],
  ['knight.purple@6', 'Grid knight'],
  ['bishop.purple@16', 'Archbishop'],
  ['rook.purple@12', 'Ranged rook'],
  ['queen.purple@6', 'Sideways queen'],
  ['queen.purple@7', 'X-ray queen'],
  ['queen.purple@8', 'Zebra queen'],
]);
const REVISIONS = freeze([
  ['pawn.purple@7', 'Rook pawn: backward captures'],
  ['pawn.purple@13', 'Rook pawn: long forward captures'],
  ['bishop.purple@17', 'Mating bishop: short capture set'],
  ['bishop.purple@18', 'Vertical bishop: no zebra'],
  ['rook.purple@14', 'Side rook: quiet camel'],
]);
const key = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function single(id, label) {
  const design = getDesign(id);
  if (!design || design.placement !== 'replace' || design.level !== 3 || !HOMES[design.family]) {
    throw new Error(`The follow-up requires a level-three replacement: ${id}.`);
  }
  return { key: key(id), label, designId: id, army: { upgrades: { [HOMES[design.family]]: id } } };
}

function referencePieces() {
  return getOfficialReferences().roster.map(reference => ({ ...single(reference.id, reference.name), key: reference.key }));
}

function pawnBundles() {
  const pawnArmy = id => ({ upgrades: { c2: id, d2: id, e2: id } });
  return [
    { key: 'quiet-diagonal-pawns', label: 'Three quiet-diagonal pawns', army: pawnArmy('pawn.blue@4') },
    { key: 'two-step-pawns', label: 'Three two-step pawns', army: pawnArmy('pawn.blue@5') },
    { key: 'diagonal-pawn-grants', label: 'Three diagonal pawn grants',
      army: { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@2', count: 3 }] } },
  ];
}

function candidates(experiment) {
  if (experiment === 'level3-confirm') return UNCHANGED.map(([id, label]) => single(id, label));
  if (experiment === 'level3-revisions') return REVISIONS.map(([id, label]) => single(id, label));
  if (experiment === 'pawn-grants-revisions') return pawnBundles();
  throw new Error(`Choose a follow-up: ${Object.keys(FILES).join(', ')}.`);
}

function buildFollowup(experiment) {
  const rows = candidates(experiment), references = referencePieces();
  const openings = experiment === 'level3-confirm' ? NEW_OPENINGS : BOTH_OPENINGS;
  const title = {
    'level3-confirm': 'Version 17: unchanged level-three pieces on eight new starts (576 games)',
    'level3-revisions': 'Version 17: level-three revisions on sixteen starts (640 games)',
    'pawn-grants-revisions': 'Version 17: revised pawn and grant bundles on sixteen starts (384 games)',
  }[experiment];
  return normalizeConfig({ schemaVersion: experiment === 'pawn-grants-revisions' ? 3 : 2,
    name: title, seed: 20261028, repetitions: 1, engine: ENGINE, openings,
    comparisons: rows.flatMap(a => references.map(b => ({
      id: `${a.key}-v-${b.key}`, label: `${a.label} versus ${b.label}`,
      armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 },
    }))),
  });
}

function loadFollowup(experiment) {
  if (!Object.hasOwn(FILES, experiment)) throw new Error(`Choose a follow-up: ${Object.keys(FILES).join(', ')}.`);
  const relative = FILES[experiment];
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8')));
  if (!isDeepStrictEqual(config, buildFollowup(experiment)) || makeSchedule(config).length !== CAPS[experiment]) {
    throw new Error(`The declared ${experiment} protocol changed. Use a new experiment declaration.`);
  }
  const rows = candidates(experiment), references = referencePieces();
  const comparisons = rows.flatMap(a => references.map(b => ({ id: `${a.key}-v-${b.key}`,
    aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label })));
  const question = experiment === 'level3-confirm'
    ? 'Check whether nine unchanged pieces retain their apparent balance and matchup patterns on eight new opening cases.'
    : experiment === 'level3-revisions'
      ? 'Screen targeted revisions against the fixed references on the original eight starts and eight new starts.'
      : 'Screen two revised level-one pawn bundles and a diagonal grant bundle against the fixed references.';
  return freeze({ experiment, file: relative, config, metadata: {
    kind: experiment, rows: rows.map(({ key, label }) => ({ key, label })),
    columns: references.map(({ key, label }) => ({ key, label })), comparisons, symmetric: false,
    scheduledGames: CAPS[experiment], question,
    openingCohorts: [
      ...(experiment === 'level3-confirm' ? [] : [{ id: 'original-eight', openingIds: OLD_OPENINGS.map(opening => opening.id) }]),
      { id: 'new-eight', openingIds: NEW_OPENINGS.map(opening => opening.id) },
    ],
    openings: experiment === 'level3-confirm'
      ? 'Eight new two-ply prefixes only; no completed original opening is replayed for an unchanged piece.'
      : 'Original eight starts plus eight new two-ply prefixes; changed designs receive fresh games on both cohorts.',
    uncertainty: 'These fixed opening cases provide a descriptive screen, not precise strength estimates. Keep opening cohorts separate when comparing revisions.',
  } });
}

module.exports = { ENGINE, OLD_OPENINGS, NEW_OPENINGS, BOTH_OPENINGS, FILES, CAPS,
  UNCHANGED, REVISIONS, pawnBundles, candidates, buildFollowup, loadFollowup };
