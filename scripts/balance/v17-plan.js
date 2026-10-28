'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { getDesignOptions } = require('../../src/design-options');
const { PLAYABLE_LIBRARIES, V16_CANDIDATES } = require('../../src/playable-library');
const { getPlayableProfiles } = require('../playable-profile');
const { getOfficialReferences } = require('./official-references');
const followup = require('./v17-followup-plan');
const targeted = require('./v17-targeted-plan');
const mobility = require('./v17-mobility-plan');
const extras = require('./v17-mobility-extras-plan');

const ROOT = path.resolve(__dirname, '../..');
const OPENINGS = require('../../experiments/balance/v17-openings.json');
const ENGINE = Object.freeze({ nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
const HOMES = Object.freeze({ pawn: 'd2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' });
const FILES = Object.freeze({
  level3: 'experiments/balance/v17-level3-screen.json',
  'reference-2v2': 'experiments/balance/v17-reference-pairs.json',
  'pawn-grants': 'experiments/balance/v17-pawn-grants.json',
  ...followup.FILES,
  ...targeted.FILES,
  ...mobility.FILES,
  ...extras.FILES,
});
const CAPS = Object.freeze({ level3: 832, 'reference-2v2': 240, 'pawn-grants': 240, ...followup.CAPS, ...targeted.CAPS, ...mobility.CAPS, ...extras.CAPS });

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
freeze(OPENINGS);
const key = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const army = designs => ({ upgrades: Object.fromEntries(designs.map(design => [HOMES[design.family], design.id])) });
const comparison = (a, b) => ({ id: `${a.key}-v-${b.key}`, label: `${a.label} versus ${b.label}`,
  armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 } });
const config = (name, comparisons) => normalizeConfig({ schemaVersion: 2, name, seed: 20261028,
  repetitions: 1, engine: ENGINE, openings: OPENINGS, comparisons });

function replacementCandidates() {
  const profiles = getPlayableProfiles();
  const options = new Map(PLAYABLE_LIBRARIES.flatMap((library, index) => library.generation === 16
    ? getDesignOptions(profiles[index].variant) : []).map(option => [option.id, option]));
  return Object.values(V16_CANDIDATES).flat().filter(id => getDesign(id).level === 3).map(id => {
    const design = getDesign(id);
    if (design.placement !== 'replace' || !HOMES[design.family]) throw new Error(`The level-three screen requires a single replacement: ${id}.`);
    return { key: key(id), label: options.get(id)?.name || id, designId: id, army: army([design]) };
  });
}

function referencePieces() {
  return getOfficialReferences().roster.map(reference => ({ key: reference.key, label: reference.name,
    designId: reference.id, army: army([getDesign(reference.id)]) }));
}

function buildLevel3Screen() {
  const candidates = replacementCandidates(), references = referencePieces();
  return config('Version 17: level-three replacement screen (832 games)',
    candidates.flatMap(candidate => references.map(reference => comparison(candidate, reference))));
}

function referenceTeams() {
  const references = referencePieces();
  const teams = [];
  for (let a = 0; a < references.length; a++) for (let b = a + 1; b < references.length; b++) {
    const members = [references[a], references[b]];
    teams.push({ key: members.map(member => member.key).join('-'), label: members.map(member => member.label).join(' + '),
      designIds: members.map(member => member.designId), army: army(members.map(member => getDesign(member.designId))) });
  }
  return teams;
}

function buildReferencePairs() {
  const teams = referenceTeams(), comparisons = [];
  for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) comparisons.push(comparison(teams[a], teams[b]));
  return config('Version 17: reference 2v2 pilot (240 games)', comparisons);
}

/** Declarations are normal balance configurations consumed by the
 * existing paired runner. A changed protocol must use a new declaration. */
function loadExperiment(experiment) {
  if (Object.hasOwn(extras.FILES, experiment)) return extras.loadExtras(experiment);
  if (Object.hasOwn(mobility.FILES, experiment)) return mobility.loadMobility(experiment);
  if (Object.hasOwn(targeted.FILES, experiment)) return targeted.loadTargeted(experiment);
  if (Object.hasOwn(followup.FILES, experiment)) return followup.loadFollowup(experiment);
  const relative = FILES[experiment];
  if (!relative) throw new Error(`Choose an experiment: ${Object.keys(FILES).join(', ')}.`);
  const input = JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const normalized = normalizeConfig(input);
  const pawnGrant = experiment === 'pawn-grants' ? require('./v17-pawn-grants') : null;
  const expected = experiment === 'level3' ? buildLevel3Screen() : experiment === 'reference-2v2' ? buildReferencePairs() : pawnGrant.createPawnGrantConfig();
  if (!isDeepStrictEqual(expected, normalized)) throw new Error(`The declared ${experiment} protocol changed. Use a new experiment declaration.`);
  if (!isDeepStrictEqual(normalized.openings, OPENINGS) || !isDeepStrictEqual(normalized.engine, ENGINE)
    || normalized.seed !== 20261028 || normalized.repetitions !== 1 || makeSchedule(normalized).length !== CAPS[experiment]) {
    throw new Error(`The declared ${experiment} settings or game budget changed.`);
  }
  const comparisons = pawnGrant ? pawnGrant.pawnGrantMetadata : normalized.comparisons.map(item => {
    const labels = item.label.split(' versus ');
    if (labels.length !== 2) throw new Error('Version-17 comparison labels must name both armies.');
    return { id: item.id, aKey: key(labels[0]), aLabel: labels[0], bKey: key(labels[1]), bLabel: labels[1] };
  });
  const descriptors = entries => [...new Map(entries.map(entry => [entry.key, entry])).values()];
  const symmetric = experiment !== 'level3';
  const rows = experiment === 'reference-2v2' ? referenceTeams().map(({ label }) => ({ key: key(label), label }))
    : descriptors(comparisons.map(item => ({ key: item.aKey, label: item.aLabel })));
  const columns = experiment === 'reference-2v2' ? rows : experiment === 'pawn-grants'
    ? [...descriptors(comparisons.filter(item => !rows.some(row => row.key === item.bKey)).map(item => ({ key: item.bKey, label: item.bLabel }))), ...rows]
    : descriptors(comparisons.map(item => ({ key: item.bKey, label: item.bLabel })));
  return freeze({ experiment, file: relative, config: normalized,
    metadata: { kind: experiment, rows, columns, comparisons, symmetric, scheduledGames: CAPS[experiment],
      question: experiment === 'level3' ? 'Flag obvious level-three replacement outliers against the four fixed references.'
        : experiment === 'reference-2v2' ? 'Compare all six distinct-family reference partnerships without extra starting pieces.'
          : 'Compare three level-one pawn purchases and three finite pawn grants against fixed references and each other.',
      openings: 'One initial-position pair and seven short prefixes; prefix moves postpone reserve deployment by one ordinary turn per side.',
      uncertainty: 'Eight fixed opening cases provide a coarse screen; scores are descriptive and do not establish precise material values or individual piece ratings.' } });
}

module.exports = { OPENINGS, ENGINE, HOMES, FILES, CAPS, replacementCandidates, referenceTeams, buildLevel3Screen, buildReferencePairs, loadExperiment };
