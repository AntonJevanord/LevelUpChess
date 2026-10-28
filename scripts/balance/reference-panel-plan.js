'use strict';

// These panels compare purchase packages at a declared budget. One-point
// duels, two-point teams and three-point bridges are separate experiments.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { getOfficialReferences } = require('./official-references');
const { ENGINE } = require('./v17-followup-plan');
const { ALL_OPENINGS, OLD_OPENINGS, NEW_OPENINGS } = require('./v17-mobility-plan');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const ROOT = path.resolve(__dirname, '../..');
const ROSTER_FILE = 'experiments/designs/reference-panel-v17.json';
const ROSTER_SHA256 = '010a8a6c1dcfd8f4a6e5283741fbccd82bc1aa7430dbfe5556d756166803f293';
const FILES = freeze({
  'panel-gap': 'experiments/balance/v17-panel-gap.json',
  'panel-level1': 'experiments/balance/v17-panel-level1.json',
  'panel-level1-pairs': 'experiments/balance/v17-panel-level1-pairs.json',
});
const CAPS = freeze({ 'panel-gap': 64, 'panel-level1': 192, 'panel-level1-pairs': 960 });
const BUDGETS = freeze({ 'panel-gap': 3, 'panel-level1': 1, 'panel-level1-pairs': 2 });
const LEVEL1_ROSTER = freeze([
  { key: 'two-step-pawn', id: 'pawn.blue@5', designId: 'pawn.blue@5', name: 'Two-step pawn', label: 'Two-step pawn',
    family: 'pawn', level: 1, movement: 'fmW2fceF2', placement: 'replace', status: 'panel-baseline' },
  { key: 'king-step-pawn', id: 'pawn.blue@7', designId: 'pawn.blue@7', name: 'King-step pawn', label: 'King-step pawn',
    family: 'pawn', level: 1, movement: 'mWFifmnD', placement: 'replace', status: 'panel-baseline' },
  { key: 'pawn-grant', id: 'king.reserve-pawn@6', designId: 'king.reserve-pawn@6', name: 'Pawn grant', label: 'Pawn grant',
    family: 'king', level: 1, movement: 'fWmfF', placement: 'reserve', status: 'panel-baseline' },
]);

function buildReferencePanelRoster() {
  return {
    schemaVersion: 1, format: 'levelup-reference-panel-roster', version: 17,
    level1Status: 'Selected one-point panel baselines; not additions to the frozen version-16 official roster.',
    level1: LEVEL1_ROSTER.map(reference => {
      const design = getDesign(reference.id);
      if (!design || ['family', 'level', 'movement', 'placement'].some(field => design[field] !== reference[field])) {
        throw new Error(`The selected level-one reference changed: ${reference.id}.`);
      }
      return { ...reference, roles: { ...design.roles } };
    }),
    level3: getOfficialReferences().roster.map(reference => ({ ...reference, status: 'official-frozen',
      engineValue: { ...reference.engineValue } })),
    reserves: { royalKing: 'ordinary', finite: true, ownHalf: true, checkingDrops: false, capturedPiecesReturnToReserve: false },
    placements: { singlePawn: ['c2'], twoPawns: ['c2', 'e2'], threePawns: ['c2', 'd2', 'e2'],
      mixedPairOrder: LEVEL1_ROSTER.map(reference => reference.id), black: 'vertical reflection of White home squares' },
  };
}

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function getReferencePanelRoster() {
  const saved = JSON.parse(fs.readFileSync(path.join(ROOT, ROSTER_FILE), 'utf8'));
  if (fingerprint(saved) !== ROSTER_SHA256 || !isDeepStrictEqual(saved, buildReferencePanelRoster())) {
    throw new Error('The selected reference-panel roster changed. Declare a new panel version.');
  }
  return freeze(saved);
}

/** Canonical member order makes the mixed-pawn placement explicit. These are
 * laboratory packages; two reserve grants do not add a second royal king. */
function buildPurchaseArmy(memberIds) {
  if (!Array.isArray(memberIds) || memberIds.length < 1 || memberIds.length > 3) throw new Error('A reference package requires one to three selected purchases.');
  const order = new Map(LEVEL1_ROSTER.map((reference, index) => [reference.id, index]));
  if (memberIds.some(id => !order.has(id))) throw new Error('A reference package contains an unknown level-one reference.');
  const members = [...memberIds].sort((a, b) => order.get(a) - order.get(b));
  const pawns = members.filter(id => getDesign(id).placement === 'replace');
  const homes = pawns.length === 3 ? ['c2', 'd2', 'e2'] : ['c2', 'e2'];
  const grantCount = members.length - pawns.length;
  return { upgrades: Object.fromEntries(pawns.map((id, index) => [homes[index], id])),
    reserve: grantCount ? [{ id: 'king.reserve-pawn@6', count: grantCount }] : [] };
}

function level1Singles() {
  return LEVEL1_ROSTER.map(reference => ({ ...reference, members: [reference.id], army: buildPurchaseArmy([reference.id]) }));
}

function level1Teams() {
  const teams = [];
  const shortKey = { 'two-step-pawn': 'two-step', 'king-step-pawn': 'king-step', 'pawn-grant': 'grant' };
  for (let first = 0; first < LEVEL1_ROSTER.length; first++) for (let second = first; second < LEVEL1_ROSTER.length; second++) {
    const members = [LEVEL1_ROSTER[first], LEVEL1_ROSTER[second]];
    teams.push({ key: members.map(member => shortKey[member.key]).join('-'), label: members.map(member => member.name).join(' + '),
      members: members.map(member => member.id), memberKeys: members.map(member => member.key),
      army: buildPurchaseArmy(members.map(member => member.id)) });
  }
  return teams;
}

function gapArmies() {
  return [
    { key: 'king-step-pawns', label: 'Three king-step pawns', members: Array(3).fill('pawn.blue@7'),
      army: buildPurchaseArmy(Array(3).fill('pawn.blue@7')) },
    { key: 'mobile-forward-grants', label: 'Three mobile-forward grants', members: Array(3).fill('king.reserve-pawn@6'),
      army: buildPurchaseArmy(Array(3).fill('king.reserve-pawn@6')) },
  ];
}

function panelArmies(experiment) {
  if (experiment === 'panel-gap') return gapArmies();
  if (experiment === 'panel-level1') return level1Singles();
  if (experiment === 'panel-level1-pairs') return level1Teams();
  throw new Error(`Choose a reference-panel experiment: ${Object.keys(FILES).join(', ')}.`);
}

function panelCells(experiment) {
  const armies = panelArmies(experiment), cells = [];
  for (let first = 0; first < armies.length; first++) for (let second = first + 1; second < armies.length; second++) cells.push([armies[first], armies[second]]);
  return cells;
}

function comparisonId(experiment, a, b) {
  return `${experiment === 'panel-gap' ? '' : experiment + '-'}${a.key}-v-${b.key}`;
}

function buildPanelConfig(experiment) {
  if (!Object.hasOwn(FILES, experiment)) throw new Error(`Choose a reference-panel experiment: ${Object.keys(FILES).join(', ')}.`);
  const titles = {
    'panel-gap': 'Version 17: missing three-point reference bridge (64 games)',
    'panel-level1': 'Version 17: one-point reference duels (192 games)',
    'panel-level1-pairs': 'Version 17: two-point reference teams (960 games)',
  };
  return normalizeConfig({ schemaVersion: 3, name: titles[experiment], seed: 20261028, repetitions: 1,
    engine: ENGINE, openings: ALL_OPENINGS,
    comparisons: panelCells(experiment).map(([a, b]) => ({ id: comparisonId(experiment, a, b),
      label: `${a.label} versus ${b.label}`, armyA: a.army, armyB: b.army,
      strengthA: { skill: 20 }, strengthB: { skill: 20 } })) });
}

function loadPanel(experiment) {
  if (!Object.hasOwn(FILES, experiment)) throw new Error(`Choose a reference-panel experiment: ${Object.keys(FILES).join(', ')}.`);
  const roster = getReferencePanelRoster(), file = FILES[experiment];
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  if (!isDeepStrictEqual(config, buildPanelConfig(experiment)) || makeSchedule(config).length !== CAPS[experiment]) {
    throw new Error(`The declared ${experiment} protocol changed. Use a new experiment declaration.`);
  }
  const armies = panelArmies(experiment), axes = armies.map(({ key, label }) => ({ key, label }));
  const questions = {
    'panel-gap': 'Complete the missing equal-three-point King-step pawn versus Pawn-grant package comparison without replaying historical cells.',
    'panel-level1': 'Compare every pair of selected one-point references as single purchases.',
    'panel-level1-pairs': 'Compare all six two-purchase level-one teams, including repeated designs, without two-point armies facing level-three references.',
  };
  return freeze({ experiment, file, config, metadata: {
    kind: experiment, rows: axes, columns: axes,
    comparisons: panelCells(experiment).map(([a, b]) => ({ id: comparisonId(experiment, a, b),
      aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label })),
    symmetric: true, scheduledGames: CAPS[experiment], upgradePoints: BUDGETS[experiment],
    referenceValueProfile: 'official-standalone', question: questions[experiment],
    referencePanelRoster: { file: ROSTER_FILE, sha256: ROSTER_SHA256 },
    level1ReferenceIds: roster.level1.map(reference => reference.id),
    armies: armies.map(({ key, label, members }) => ({ key, label, members, upgradePoints: BUDGETS[experiment] })),
    openingCohorts: [
      { id: 'original-sixteen', openingIds: OLD_OPENINGS.map(opening => opening.id) },
      { id: 'new-sixteen', openingIds: NEW_OPENINGS.map(opening => opening.id) },
    ],
    openings: 'Thirty-two fixed related short prefixes; complete color pairs, without claiming independent deep openings.',
    placements: roster.placements,
    uncertainty: 'These separate purchase budgets and fixed placements describe matchups; scores are not material values or individual-piece Elo. No same-army controls or two-point-versus-level-three games are scheduled.',
  } });
}

module.exports = { FILES, CAPS, BUDGETS, LEVEL1_ROSTER, ROSTER_FILE, ROSTER_SHA256,
  buildReferencePanelRoster, getReferencePanelRoster, buildPurchaseArmy,
  level1Singles, level1Teams, gapArmies, panelArmies, panelCells, comparisonId,
  buildPanelConfig, loadPanel };
