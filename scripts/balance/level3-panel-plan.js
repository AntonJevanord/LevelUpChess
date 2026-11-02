'use strict';

// New contexts only: the ten accepted bodies, search priors and 64-case book
// remain fixed while a controller enables more complete eight-case batches.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Chess } = require('chess.js');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { getOfficialReferences } = require('./official-references');
const { readSnapshot: bracketValues, getBracketValueReceipt } = require('./v17-bracket-values');
const { readSnapshot: revisionValues, getReceipt: getRevisionReceipt } = require('./v17-level3-revision-values');

const ROOT = path.resolve(__dirname, '../..');
const FORMAT = 'levelup-v17-level3-progressive-panel';
const OPENINGS_FILE = 'experiments/balance/v17-level3-panel-openings.json';
const OPENINGS_SHA256 = '7d88fd4ae164cdb524850bd3d6bf6e349389123d0fa3ca47c158291621e5102c';
const NODE_BUDGETS = Object.freeze([20000, 40000, 80000]);
const OPENING_TARGETS = Object.freeze([8, 16, 32, 64]);
const BATCH_SIZE = 8;
const HOMES = Object.freeze({ pawn: 'd2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' });
const PROTECTED_HOMES = new Set([...Object.values(HOMES), ...Object.values(HOMES).map(square => `${square[0]}${9 - Number(square[1])}`)]);
const HISTORICAL_FILES = Object.freeze([
  'amazon-alternatives', 'amazon-revision', 'blue-rook-confirmation', 'budget-3-confirmation', 'budget-3', 'designs-smoke',
  'level3-holdout', 'level3-round-robin', 'material-anchors', 'material-estimate', 'outlier-effects', 'purple-material-handicaps',
  'revision-1-confirmation', 'revision-1-screen', 'rook-values-auto', 'rook-values-eight', 'skill-sweep', 'smoke', 'upgrade-effects',
  'v17-acceptance-majors', 'v17-acceptance-minors', 'v17-design-focus', 'v17-followup-level3-confirm',
  'v17-followup-level3-revisions', 'v17-followup-pawn-grants', 'v17-level2-bridge', 'v17-level3-confirmation',
  'v17-level3-revision-screen', 'v17-level3-screen', 'v17-mixed-packages', 'v17-mobility-additions', 'v17-mobility-confirm',
  'v17-mobility-expanded', 'v17-mobility-revisions', 'v17-panel-gap', 'v17-panel-level1-pairs', 'v17-panel-level1',
  'v17-pawn-grants', 'v17-reference-grants', 'v17-reference-pairs', 'v17-reference-pawns',
].map(name => `experiments/balance/${name}.json`));
const ROSTER = [
  { key: 'queen-pawn', name: 'Queen pawn', id: 'pawn.queen-sideways@1', family: 'pawn', movement: 'mQ2cfQ2', color: 'red' },
  { key: 'vertical-bishop', name: 'Vertical bishop', id: 'bishop.vertical-blocked@1', family: 'bishop', movement: 'BvW2vnN', color: 'red' },
  { key: 'unicorn', name: 'Unicorn', id: 'knight.purple@3', family: 'knight', movement: 'NC', color: 'red' },
  { key: 'vanguard', name: 'Vanguard', id: 'rook.purple@10', family: 'rook', movement: 'RfB', color: 'red' },
  { key: 'amazon', name: 'Amazon', id: 'queen.purple@1', family: 'queen', movement: 'QN', color: 'red' },
  { key: 'rook-pawn', name: 'Rook pawn', id: 'pawn.purple@13', family: 'pawn', movement: 'mRcfB', color: 'purple' },
  { key: 'cruisader', name: 'Cruisader', id: 'bishop.purple@13', family: 'bishop', movement: 'BsR2nsN', color: 'purple' },
  { key: 'nightrider', name: 'Nightrider', id: 'knight.purple@4', family: 'knight', movement: 'N0', color: 'purple' },
  { key: 'ranged-rook', name: 'Ranged rook', id: 'rook.purple@12', family: 'rook', movement: 'RC', color: 'purple' },
  { key: 'xray-queen', name: 'X-ray queen', id: 'queen.purple@7', family: 'queen', movement: 'QgB0', color: 'purple' },
];
const ORDINARY = Object.freeze({ key: 'ordinary', name: 'Ordinary army', label: 'Ordinary army', id: null, army: { upgrades: {} } });
const sha = value => createHash('sha256').update(value).digest('hex');
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
freeze(ROSTER);

function getRoster() {
  const official = new Set(getOfficialReferences().roster.map(row => row.id));
  return freeze(ROSTER.map(row => {
    const design = getDesign(row.id);
    if (!design || design.level !== 3 || design.placement !== 'replace'
      || ['family', 'movement'].some(field => row[field] !== design[field])) throw new Error(`The selected level-three body changed: ${row.id}.`);
    return { ...row, label: row.name, level: 3, placement: 'replace', officialReference: official.has(row.id),
      army: { upgrades: { [HOMES[row.family]]: row.id } } };
  }));
}

function comparisons() {
  const rows = getRoster(), cells = [];
  const add = (a, b, kind) => cells.push({ id: `${a.key}-v-${b.key}`, kind, designA: a.id, designB: b.id,
    aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label, a, b });
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) add(rows[a], rows[b], 'head');
  for (const row of rows) add(row, ORDINARY, 'baseline');
  return freeze(cells);
}

function getValueAudit() {
  const bracket = bracketValues(), revisions = revisionValues();
  const values = getRoster().map(row => {
    const fromRevision = ['pawn.queen-sideways@1', 'bishop.vertical-blocked@1'].includes(row.id);
    const snapshot = fromRevision ? revisions : bracket;
    const value = snapshot.values.find(value => value.id === row.id);
    if (!value || value.movement !== row.movement) throw new Error(`Missing unchanged search prior: ${row.id}.`);
    return { id: row.id, movement: row.movement, source: fromRevision ? getRevisionReceipt() : getBracketValueReceipt(),
      automatic: { ...value.automatic }, applied: { ...value.applied } };
  });
  return freeze({ sources: [getBracketValueReceipt(), getRevisionReceipt()], values,
    policy: 'Keep the exact previously applied MG/EG pair for each accepted design at every node budget. Values are search priors, not fitted material values.' });
}

function playStandard(board, move) {
  if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move)) throw new Error('Panel openings require orthodox coordinate moves.');
  return board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
}
const positionKey = board => board.fen().split(' ').slice(0, 4).join(' ');
function validateOpenings(openings) {
  const oldPrefixes = new Set(), oldPositions = new Set();
  for (const file of HISTORICAL_FILES) for (const opening of JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).openings) {
    const board = new Chess();
    try {
      for (const [index, move] of opening.moves.entries()) { playStandard(board, move); if (index === 3) oldPositions.add(positionKey(board)); }
      oldPositions.add(positionKey(board));
      if (opening.moves.length >= 4) oldPrefixes.add(opening.moves.slice(0, 4).join(' '));
    } catch { throw new Error(`Historical opening cannot be established: ${file} / ${opening.id}.`); }
  }
  if (!Array.isArray(openings) || openings.length !== 64) throw new Error('Freeze exactly sixty-four opening cases before the first batch.');
  const ids = new Set(), prefixes = new Set(), positions = new Set();
  for (const opening of openings) {
    if (!opening?.id || ids.has(opening.id) || !Array.isArray(opening.moves) || opening.moves.length !== 4) throw new Error('Panel opening IDs must be distinct with exactly four plies.');
    const board = new Chess();
    for (const move of opening.moves) {
      if (PROTECTED_HOMES.has(move.slice(0, 2))) throw new Error('Forced panel prefixes cannot move an upgraded starting piece.');
      const played = playStandard(board, move);
      if (played.captured || played.promotion || board.isGameOver()) throw new Error('Panel prefixes must be quiet, nonpromoting and nonterminal.');
    }
    const prefix = opening.moves.join(' '), position = positionKey(board);
    if (prefixes.has(prefix) || oldPrefixes.has(prefix) || positions.has(position) || oldPositions.has(position)) throw new Error('Panel opening prefixes and canonical positions must be fresh and distinct.');
    ids.add(opening.id); prefixes.add(prefix); positions.add(position);
  }
  return openings;
}

const bytes = fs.readFileSync(path.join(ROOT, OPENINGS_FILE));
if (sha(bytes) !== OPENINGS_SHA256) throw new Error('The frozen progressive-panel casebook bytes changed.');
const OPENINGS = freeze(validateOpenings(JSON.parse(bytes.toString('utf8'))));

function buildConfig({ nodes, batchIndex } = {}) {
  if (!NODE_BUDGETS.includes(nodes)) throw new Error('Panel search budgets are 20000, 40000 and 80000 nodes.');
  if (!Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex > 7) throw new Error('Panel batchIndex must be 0 through 7.');
  const evaluation = { pieceValues: Object.fromEntries(getValueAudit().values.map(value => [value.id, value.applied])) };
  return normalizeConfig({ schemaVersion: 3, name: `Version 17: complete level-three panel (batch ${batchIndex + 1}, ${nodes} nodes)`,
    seed: 20261104 + batchIndex, repetitions: 1, engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: OPENINGS.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE),
    comparisons: comparisons().map(cell => ({ id: cell.id, label: `${cell.aLabel} versus ${cell.bLabel}`,
      armyA: cell.a.army, armyB: cell.b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 } })), evaluation });
}

function getBatchDeclaration(batchIndex, nodes) {
  const config = buildConfig({ nodes, batchIndex }), matches = comparisons();
  return freeze({ experiment: `level3-panel-b${String(batchIndex + 1).padStart(2, '0')}-n${nodes}`, file: null, config,
    metadata: { kind: 'level3-panel', batchIndex, nodes, scheduledGames: 880, symmetric: true, upgradePoints: 3,
      rows: [...getRoster(), ORDINARY].map(({ key, label }) => ({ key, label })),
      columns: [...getRoster(), ORDINARY].map(({ key, label }) => ({ key, label })),
      comparisons: matches.map(({ id, kind, designA, designB, aKey, aLabel, bKey, bLabel }) => ({ id, kind, designA, designB, aKey, aLabel, bKey, bLabel })),
      roster: getRoster(), evaluationAudit: getValueAudit(),
      question: 'Compare all forty-five accepted level-three pairs and ten single-upgrade ordinary-army anchors independently at three fixed node budgets.',
      openings: { file: OPENINGS_FILE, sha256: OPENINGS_SHA256, policy: 'Sixty-four frozen fresh quiet four-ply cases, enabled in consecutive eight-case batches. Purchased pieces do not move during the forced prefix. Every node budget shares the same cases.' } } });
}

function expectedGames(openings) {
  if (!OPENING_TARGETS.includes(openings)) throw new Error('Select a total of 8, 16, 32 or 64 openings.');
  return openings * 55 * NODE_BUDGETS.length * 2;
}

function buildCampaignPlan({ jobs = 4 } = {}) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Panel jobs must be an integer from 1 to 16.');
  const stages = [];
  for (let batchIndex = 0; batchIndex < 8; batchIndex++) for (const nodes of NODE_BUDGETS) {
    const declaration = getBatchDeclaration(batchIndex, nodes), { config } = declaration, schedule = makeSchedule(config);
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
    const id = `batch-${String(batchIndex + 1).padStart(2, '0')}-n${nodes}`;
    stages.push({ id, directory: id, experiment: declaration.experiment, batchIndex, nodes, games: schedule.length,
      openingIds: config.openings.map(opening => opening.id), configSha256: sha(JSON.stringify(config)), scheduleSha256: sha(JSON.stringify(schedule)),
      profileHash: profile.hash, registryHash: registry.hash, comparisons: declaration.metadata.comparisons });
  }
  return freeze({ schemaVersion: 1, format: FORMAT, jobs, games: expectedGames(64), nodes: [...NODE_BUDGETS],
    openingTargets: [...OPENING_TARGETS], batchSize: BATCH_SIZE, book: { file: OPENINGS_FILE, sha256: OPENINGS_SHA256 },
    roster: getRoster(), evaluationAudit: getValueAudit(), stages });
}

function selectedStages(openings, plan = buildCampaignPlan()) {
  expectedGames(openings);
  return plan.stages.filter(stage => stage.batchIndex < openings / BATCH_SIZE);
}

module.exports = { ROOT, FORMAT, OPENINGS_FILE, OPENINGS_SHA256, NODE_BUDGETS, OPENING_TARGETS, BATCH_SIZE,
  HOMES, HISTORICAL_FILES, ROSTER, ORDINARY, OPENINGS, getRoster, comparisons, getValueAudit, validateOpenings,
  buildConfig, getBatchDeclaration, expectedGames, buildCampaignPlan, selectedStages };
