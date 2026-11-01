'use strict';

// Each declaration is a fixed experiment. Prices, material priors and opening
// cohorts are recorded separately; changing one requires a new declaration.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { getDesign } = require('../../src/design-catalog');
const { L1_BRACKETS, L2_PAWN_BRACKETS, L2_GRANT_BRACKETS, L3_NEW } = require('../../src/balance-designs-v17');
const { LEVEL1_ROSTER, buildPurchaseArmy } = require('./reference-panel-plan');
const { getOfficialReferences } = require('./official-references');
const { ALL_OPENINGS: HISTORICAL_OPENINGS } = require('./v17-mobility-plan');

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const ROOT = path.resolve(__dirname, '../..');
const OPENINGS_FILE = 'experiments/balance/v17-bracket-openings.json';
const VALUES_FILE = 'experiments/designs/v17-bracket-values.json';
const OPENINGS = freeze(require('../../experiments/balance/v17-bracket-openings.json'));
const ENGINE = freeze({ nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
const FILES = freeze({
  'acceptance-minors': 'experiments/balance/v17-acceptance-minors.json',
  'acceptance-majors': 'experiments/balance/v17-acceptance-majors.json',
  'reference-pawns': 'experiments/balance/v17-reference-pawns.json',
  'reference-grants': 'experiments/balance/v17-reference-grants.json',
  'level3-confirmation': 'experiments/balance/v17-level3-confirmation.json',
});
const CAPS = freeze({ 'acceptance-minors': 1152, 'acceptance-majors': 864,
  'reference-pawns': 1440, 'reference-grants': 1248, 'level3-confirmation': 2048 });
const TITLES = freeze({
  'acceptance-minors': 'Version 17: level-one knight and bishop brackets (1152 games)',
  'acceptance-majors': 'Version 17: level-one rook and queen brackets (864 games)',
  'reference-pawns': 'Version 17: level-two pawn reference brackets (1440 games)',
  'reference-grants': 'Version 17: level-two grant reference brackets (1248 games)',
  'level3-confirmation': 'Version 17: level-three confirmation and bishop revisions (2048 games)',
});
const HOMES = freeze({ pawn: ['c2'], knight: ['b1', 'g1'], bishop: ['c1', 'f1'], rook: ['a1', 'h1'], queen: ['d1'] });
const L3_ROWS = freeze([
  ['queen-pawn', 'Queen pawn', 'pawn.purple@12'],
  ['rook-pawn-backward', 'Rook pawn: backward captures', 'pawn.purple@7'],
  ['rook-pawn-forward', 'Rook pawn: long forward captures', 'pawn.purple@13'],
  ['nightrider', 'Nightrider', 'knight.purple@4'],
  ['princess-knight', 'Princess knight', 'knight.purple@5'],
  ['grid-knight', 'Grid knight', 'knight.purple@6'],
  ['archbishop', 'Archbishop', 'bishop.purple@16'],
  ['vertical-bishop', 'Vertical bishop', 'bishop.purple@18'],
  ['grid-bishop', 'Grid bishop', 'bishop.purple@19'],
  ['ranged-rook', 'Ranged rook', 'rook.purple@12'],
  ['side-rook', 'Side rook', 'rook.purple@14'],
  ['side-queen', 'Side queen', 'queen.purple@6'],
  ['xray-queen', 'X-ray queen', 'queen.purple@7'],
  ['zebra-queen', 'Zebra queen', 'queen.purple@8'],
]);

function validateOpenings() {
  const seen = new Set(), ids = new Set();
  const previous = new Set(HISTORICAL_OPENINGS.map(opening => opening.moves.join(' ')));
  if (OPENINGS.length !== 16) throw new Error('The bracket campaign requires sixteen declared cases.');
  for (const opening of OPENINGS) {
    const prefix = opening.moves.join(' ');
    if (opening.moves.length !== 2 || seen.has(prefix) || ids.has(opening.id) || previous.has(prefix)) {
      throw new Error('Bracket cases must be distinct new two-ply prefixes.');
    }
    seen.add(prefix); ids.add(opening.id);
  }
  return OPENINGS;
}

function referencePackages(count) {
  if (![1, 2].includes(count)) throw new Error('Choose a single or double level-one reference package.');
  return LEVEL1_ROSTER.map(reference => ({
    key: `${reference.key}-${count === 2 ? 'pair' : 'single'}`,
    label: count === 2 ? `Two ${reference.name.toLowerCase()}s` : reference.name,
    designIds: Array(count).fill(reference.id), upgradePoints: count,
    army: buildPurchaseArmy(Array(count).fill(reference.id)),
  }));
}

function replacementArmy(id, count = 1) {
  const design = getDesign(id), homes = HOMES[design?.family];
  if (!design || design.placement !== 'replace' || !homes || count > homes.length) throw new Error(`Unsupported replacement package: ${id}.`);
  return { upgrades: Object.fromEntries(homes.slice(0, count).map(square => [square, id])) };
}

// Preserve the original level-three screen's pawn file. The level-two
// reference candidates use c2, while historical level-three pawns used d2.
function level3Army(id) {
  if (getDesign(id)?.family === 'pawn') return { upgrades: { d2: id } };
  return replacementArmy(id);
}

function selectedBrackets(experiment) {
  if (experiment === 'acceptance-minors') return L1_BRACKETS.filter(bracket => ['knight', 'bishop'].includes(bracket.family));
  if (experiment === 'acceptance-majors') return L1_BRACKETS.filter(bracket => ['rook', 'queen'].includes(bracket.family));
  if (experiment === 'reference-pawns') return L2_PAWN_BRACKETS;
  if (experiment === 'reference-grants') return L2_GRANT_BRACKETS;
  if (experiment === 'level3-confirmation') return [];
  throw new Error(`Choose a bracket experiment: ${Object.keys(FILES).join(', ')}.`);
}

function candidates(experiment) {
  if (experiment === 'level3-confirmation') return [
    ...L3_ROWS.map(([key, label, designId]) => ({ key, label, designId, family: getDesign(designId).family,
      designIds: [designId], upgradePoints: 3, army: level3Army(designId) })),
    ...L3_NEW.map(row => ({ ...row, designId: row.id, designIds: [row.id], upgradePoints: 3, army: level3Army(row.id) })),
  ];
  const unique = new Map();
  for (const bracket of selectedBrackets(experiment)) for (const variant of bracket.variants) {
    if (unique.has(variant.id)) continue;
    const design = getDesign(variant.id);
    if (!design || ['movement', 'family', 'level'].some(field => design[field] !== (field === 'movement' ? variant.movement : bracket[field]))) {
      throw new Error(`Bracket definition changed: ${variant.id}.`);
    }
    const count = design.level === 1 && design.family !== 'queen' ? 2 : 1;
    unique.set(variant.id, { ...variant, key: `${bracket.key}-${variant.key}`, label: variant.label,
      family: design.family, designId: variant.id, designIds: Array(count).fill(variant.id),
      upgradePoints: design.level * count,
      army: design.placement === 'reserve' ? { upgrades: {}, reserve: [{ id: variant.id, count }] } : replacementArmy(variant.id, count) });
  }
  return [...unique.values()];
}

function opponents(experiment, row) {
  if (experiment === 'level3-confirmation') return getOfficialReferences().roster.map(reference => ({
    key: reference.key, label: reference.name, designIds: [reference.id], upgradePoints: 3, army: level3Army(reference.id),
  }));
  return referencePackages(row.family === 'queen' ? 1 : 2);
}

function cells(experiment) { return candidates(experiment).flatMap(a => opponents(experiment, a).map(b => [a, b])); }
const comparisonId = (a, b) => `${a.key}-v-${b.key}`;
function selectedIds(comparisons) {
  return [...new Set(comparisons.flatMap(comparison => [comparison.armyA, comparison.armyB]
    .flatMap(army => [...Object.values(army.upgrades), ...(army.reserve || []).map(entry => entry.id)])))].sort();
}

function buildBracketConfig(experiment) {
  if (!Object.hasOwn(FILES, experiment)) throw new Error(`Choose a bracket experiment: ${Object.keys(FILES).join(', ')}.`);
  validateOpenings();
  const comparisons = cells(experiment).map(([a, b]) => ({ id: comparisonId(a, b), label: `${a.label} versus ${b.label}`,
    armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 } }));
  const { getBracketEvaluation } = require('./v17-bracket-values');
  return normalizeConfig({ schemaVersion: 3, name: TITLES[experiment], seed: 20261101, repetitions: 1,
    engine: ENGINE, openings: OPENINGS, comparisons, evaluation: getBracketEvaluation(selectedIds(comparisons)) });
}

function reportBrackets(experiment, rows) {
  const byId = new Map(rows.map(row => [row.designId, row]));
  if (experiment !== 'level3-confirmation') return selectedBrackets(experiment).map(bracket => ({ ...bracket,
    variants: bracket.variants.map(variant => ({ ...variant, rowKey: byId.get(variant.id).key })) }));
  return L3_NEW.map(candidate => {
    const base = byId.get(candidate.baseId), changed = byId.get(candidate.id);
    return { key: candidate.valueGroup, label: `${base.label} comparison`, family: 'bishop', level: 3,
      variants: [
        { key: 'reduced', label: changed.label, id: changed.designId, movement: getDesign(changed.designId).movement, rowKey: changed.key },
        { key: 'current', label: base.label, id: base.designId, movement: getDesign(base.designId).movement, rowKey: base.key },
      ] };
  });
}

function loadBracket(experiment) {
  if (!Object.hasOwn(FILES, experiment)) throw new Error(`Choose a bracket experiment: ${Object.keys(FILES).join(', ')}.`);
  const file = FILES[experiment], config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
  if (!isDeepStrictEqual(config, buildBracketConfig(experiment)) || makeSchedule(config).length !== CAPS[experiment]) {
    throw new Error(`The declared ${experiment} protocol changed. Use a new experiment declaration.`);
  }
  const registry = createDesignRegistry(config);
  if (registry.definitions.length > 20) throw new Error('The bracket profile exceeds twenty custom letters.');
  const rows = candidates(experiment), matches = cells(experiment);
  const columns = [...new Map(matches.map(([, b]) => [b.key, { key: b.key, label: b.label }])).values()];
  const points = [...new Set(rows.map(row => row.upgradePoints))];
  const { getBracketValueReceipt } = require('./v17-bracket-values');
  const budgetGroups = points.map(upgradePoints => ({ id: `budget-${upgradePoints}`, label: `${upgradePoints}-point purchases`, upgradePoints,
    rowKeys: rows.filter(row => row.upgradePoints === upgradePoints).map(row => row.key),
    columnKeys: [...new Set(matches.filter(([a]) => a.upgradePoints === upgradePoints).map(([, b]) => b.key))] }));
  return freeze({ experiment, file, config, metadata: {
    kind: experiment, rows: rows.map(({ key, label }) => ({ key, label })), columns,
    comparisons: matches.map(([a, b]) => ({ id: comparisonId(a, b), aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label })),
    symmetric: false, scheduledGames: CAPS[experiment],
    ...(experiment === 'level3-confirmation' ? {} : { referenceValueProfile: 'official-standalone' }),
    question: experiment === 'level3-confirmation'
      ? 'Confirm current level-three designs on new cases, with targeted quiet-knight and quiet-camel bishop alternatives.'
      : experiment.startsWith('acceptance-')
        ? 'Screen reduced, current and expanded level-one abilities against fixed equal-budget level-one purchases.'
        : 'Screen possible level-two pawn or grant references against each fixed two-purchase level-one package.',
    brackets: reportBrackets(experiment, rows), rowBudgets: Object.fromEntries(rows.map(row => [row.key, row.upgradePoints])), budgetGroups,
    armies: rows.map(({ key, label, designIds, upgradePoints }) => ({ key, label, designIds, upgradePoints })),
    openingCohorts: [
      { id: 'first-eight', openingIds: OPENINGS.slice(0, 8).map(opening => opening.id) },
      { id: 'second-eight', openingIds: OPENINGS.slice(8).map(opening => opening.id) },
    ],
    evaluationAudit: getBracketValueReceipt(),
    openings: 'Sixteen fresh fixed two-ply prefixes; each side plays one ordinary prefix move before reserve deployment is allowed.',
    uncertainty: 'Descriptive acceptance triage, not confidence claims, fitted material values or individual-piece Elo. Opening cohorts and budgets stay separate; historical games are not replayed.',
  } });
}

module.exports = { ROOT, OPENINGS_FILE, VALUES_FILE, OPENINGS, ENGINE, FILES, CAPS, TITLES, HOMES, L3_ROWS,
  validateOpenings, referencePackages, replacementArmy, level3Army, selectedBrackets, candidates, opponents, cells, comparisonId,
  selectedIds, buildBracketConfig, reportBrackets, loadBracket };
