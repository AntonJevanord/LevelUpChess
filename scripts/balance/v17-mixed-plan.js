'use strict';

// The schedule fixes outcomes to compare; worker timing never chooses matchups.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { Chess } = require('chess.js');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { LEVEL1_ROSTER, getReferencePanelRoster } = require('./reference-panel-plan');
const { getLevel2References } = require('./level2-references');
const { getOfficialReferences } = require('./official-references');
const { HISTORICAL_FILES: PREVIOUS_FILES } = require('./v17-level2-bridge');
const { getEvaluation, getReceipt, getValueAudit } = require('./v17-mixed-values');
const { createV17Report } = require('./v17-report');

const ROOT = path.resolve(__dirname, '../..');
const EXPERIMENT = 'mixed-reference-packages';
const FILE = 'experiments/balance/v17-mixed-packages.json';
const OPENINGS_FILE = 'experiments/balance/v17-mixed-openings.json';
const CAP = 1824;
const MIXED_GAMES = 1632;
const GRANT_GAMES = 192;
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const OPENINGS = freeze(require('../../experiments/balance/v17-mixed-openings.json'));
const HISTORICAL_FILES = freeze([...PREVIOUS_FILES,
  'experiments/balance/v17-level2-bridge.json', 'experiments/balance/v17-level3-revision-screen.json']);
const GRANTS = freeze([
  { key: 'w2-grant', label: 'W2 grant', id: 'king.reserve-rook@1', movement: 'W2' },
  { key: 'wd-grant', label: 'WD grant', id: 'king.grant-wd-level3@1', movement: 'WD' },
]);

const canonicalPosition = board => board.fen().split(' ').slice(0, 4).join(' ');
function moveStandard(board, move) {
  if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move)) throw new Error('Opening contains a nonstandard board move.');
  return board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
}
function validateOpenings(openings = OPENINGS) {
  const oldPrefixes = new Set(), oldPositions = new Set();
  for (const file of HISTORICAL_FILES) for (const opening of JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).openings) {
    const board = new Chess();
    for (const [index, move] of opening.moves.entries()) {
      moveStandard(board, move);
      if (index === 3) { oldPrefixes.add(opening.moves.slice(0, 4).join(' ')); oldPositions.add(canonicalPosition(board)); }
    }
    oldPositions.add(canonicalPosition(board));
  }
  if (!Array.isArray(openings) || openings.length !== 12) throw new Error('Declare twelve fixed four-ply mixed-package opening cases.');
  const ids = new Set(), prefixes = new Set(), positions = new Set();
  for (const opening of openings) {
    if (typeof opening.id !== 'string' || !opening.id || ids.has(opening.id) || !Array.isArray(opening.moves) || opening.moves.length !== 4) throw new Error('Mixed opening IDs must be distinct and contain exactly four plies.');
    const prefix = opening.moves.join(' '), board = new Chess();
    for (const move of opening.moves) {
      const played = moveStandard(board, move);
      if (played.captured || played.promotion || board.isGameOver()) throw new Error('Forced mixed openings must preserve purchased pieces and remain nonterminal.');
    }
    const position = canonicalPosition(board);
    if (prefixes.has(prefix) || oldPrefixes.has(prefix) || positions.has(position) || oldPositions.has(position)) throw new Error('Mixed opening four-ply prefixes and canonical positions must be fresh and distinct.');
    ids.add(opening.id); prefixes.add(prefix); positions.add(position);
  }
  return openings;
}

function level1() { getReferencePanelRoster(); return LEVEL1_ROSTER; }
function level2() { return getLevel2References().roster; }
function mixedTeams() {
  return level1().flatMap(first => level2().map(second => {
    const key = `${first.key}-plus-${second.key}`;
    const hasPawn = [first, second].some(member => member.placement === 'replace');
    const layouts = (hasPawn ? [['c2', 'e2'], ['e2', 'c2']] : [[null, null]]).map((homes, index) => {
      const upgrades = {}, reserve = [], slots = {};
      for (const [memberIndex, member] of [first, second].entries()) {
        if (member.placement === 'replace') {
          if (member.family !== 'pawn') throw new Error('Mixed packages currently require pawn or finite-grant purchases.');
          upgrades[homes[memberIndex]] = member.id; slots[memberIndex ? 'level2' : 'level1'] = homes[memberIndex];
        } else {
          reserve.push({ id: member.id, count: 1 }); slots[memberIndex ? 'level2' : 'level1'] = null;
        }
      }
      const layout = hasPawn ? index ? 'e-c' : 'c-e' : 'reserves';
      const label = hasPawn ? Object.entries(slots).filter(([, home]) => home).map(([level, home]) => `${level === 'level1' ? 'L1' : 'L2'} ${home}`).join('; ') : 'two finite reserves';
      return { key: `${key}-${layout}`, layout, label, slots, army: { upgrades, reserve } };
    });
    return { key, label: `${first.name} + ${second.name}`, level1: first.key, level2: second.key,
      members: [first.id, second.id], layouts, budget: 3 };
  }));
}
function references() {
  const homes = { rook: 'a1', knight: 'b1', bishop: 'c1', queen: 'd1' };
  return getOfficialReferences().roster.map(reference => ({ ...reference, label: reference.name,
    army: { upgrades: { [homes[reference.family]]: reference.id } }, budget: 3 }));
}
function physicalRows() {
  const rows = mixedTeams().flatMap(team => team.layouts.map(layout => ({
    key: layout.key, label: `${team.label} (${layout.label})`, team: team.key, layout: layout.layout,
    panel: 'mixed', army: layout.army, budget: 3,
  })));
  for (const grant of GRANTS) {
    const design = getDesign(grant.id);
    if (!design || design.level !== 3 || design.family !== 'king' || design.placement !== 'reserve' || design.movement !== grant.movement) throw new Error(`The grant trial changed: ${grant.id}.`);
    rows.push({ ...grant, panel: 'grants', army: { upgrades: {}, reserve: [{ id: grant.id, count: 1 }] }, budget: 3 });
  }
  return rows;
}
function comparisons() { return physicalRows().flatMap(a => references().map(b => ({ id: `${a.key}-v-${b.key}`, a, b }))); }
function selectedIds() { return [...new Set(comparisons().flatMap(match => [match.a.army, match.b.army]
  .flatMap(army => [...Object.values(army.upgrades), ...(army.reserve || []).map(entry => entry.id)])))].sort(); }
function buildConfig() {
  validateOpenings();
  return normalizeConfig({ schemaVersion: 3, name: 'Version 17: mixed level-one/two packages and W2/WD grants (1824 games)',
    seed: 20261103, repetitions: 1, engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 }, openings: OPENINGS,
    comparisons: comparisons().map(({ id, a, b }) => ({ id, label: `${a.label} versus ${b.label}`,
      armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 } })), evaluation: getEvaluation(selectedIds()) });
}
function loadExperiment() {
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, FILE), 'utf8')));
  if (!isDeepStrictEqual(config, buildConfig()) || makeSchedule(config).length !== CAP) throw new Error('The mixed-package declaration changed; declare a new experiment.');
  return freeze({ experiment: EXPERIMENT, file: FILE, config, metadata: {
    kind: EXPERIMENT, scheduledGames: CAP, upgradePoints: 3, symmetric: false,
    rows: physicalRows().map(({ key, label }) => ({ key, label })), columns: references().map(({ key, label }) => ({ key, label })),
    comparisons: comparisons().map(({ id, a, b }) => ({ id, aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label })),
    mixedTeams: mixedTeams(), grantTrials: GRANTS, level1: level1(), level2: level2(),
    panels: [{ id: 'mixed', scheduledGames: MIXED_GAMES }, { id: 'grants', scheduledGames: GRANT_GAMES }],
    evaluationAudit: getReceipt(), appliedValueAudit: getValueAudit(selectedIds()),
    openingCohorts: [{ id: 'first-six', openingIds: OPENINGS.slice(0, 6).map(opening => opening.id) },
      { id: 'second-six', openingIds: OPENINGS.slice(6).map(opening => opening.id) }],
    openings: { file: OPENINGS_FILE, historicalFiles: HISTORICAL_FILES,
      policy: 'Twelve fresh four-ply orthodox prefixes and canonical positions; old first-two-ply sequences may recur. All forced moves are quiet and all placements share each case. These are a new context, not paired causal comparisons with earlier two-ply studies.' },
    question: 'Compare every selected L1+L2 package with frozen L3 references, separate file-placement sensitivity from partner context, and screen W2/WD grants at three points.',
  } });
}

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const recordScore = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
function tally(records) {
  const scores = records.map(recordScore);
  const result = { games: scores.length, wins: scores.filter(value => value === 1).length, draws: scores.filter(value => value === 0.5).length,
    losses: scores.filter(value => value === 0).length, score: average(scores) };
  result.physicalColors = ['w', 'b'].map(color => {
    const values = records.filter(record => record.aColor === color).map(recordScore);
    return { color, games: values.length, wins: values.filter(value => value === 1).length, draws: values.filter(value => value === 0.5).length,
      losses: values.filter(value => value === 0).length, score: average(values) };
  });
  return result;
}
function completedPairs(records) {
  const latest = new Map(), pairs = new Map();
  for (const record of records) if (!latest.has(record.id) || record.attempt > latest.get(record.id).attempt) latest.set(record.id, record);
  for (const record of latest.values()) {
    const pair = pairs.get(record.pairId) || []; pair.push(record); pairs.set(record.pairId, pair);
  }
  const index = new Map();
  for (const pair of pairs.values()) if (pair.length === 2 && pair.every(record => record.status === 'completed') && pair[0].aColor !== pair[1].aColor) {
    index.set(JSON.stringify([pair[0].comparisonId, pair[0].openingId]), pair);
  }
  return index;
}
function summarizeRows(specifications, refs, openingIds, index) {
  return specifications.map(spec => {
    const pairsFor = (layout, reference, opening) => index.get(JSON.stringify([`${layout.key}-v-${reference.key}`, opening]));
    const complete = (reference, opening) => spec.layouts.every(layout => pairsFor(layout, reference, opening));
    const shared = openingIds.filter(opening => refs.every(reference => complete(reference, opening)));
    const summarize = (reference, selected) => {
      const groups = selected.map(opening => spec.layouts.map(layout => pairsFor(layout, reference, opening)));
      const records = groups.flat(2);
      return { ...tally(records), score: average(groups.map(layouts => average(layouts.map(pair => average(pair.map(recordScore)))))) };
    };
    const opponents = refs.map(reference => {
      const local = openingIds.filter(opening => complete(reference, opening));
      return { key: reference.key, label: reference.label, ...summarize(reference, local), openingCoverage: { shared: local.length, total: openingIds.length, openingIds: local } };
    });
    const included = refs.flatMap(reference => shared.flatMap(opening => spec.layouts.flatMap(layout => pairsFor(layout, reference, opening))));
    const cases = shared.map(opening => ({ openingId: opening, score: average(refs.map(reference => summarize(reference, [opening]).score)) }));
    const layouts = spec.layouts.map(layout => {
      const records = refs.flatMap(reference => shared.flatMap(opening => pairsFor(layout, reference, opening)));
      return { key: layout.layout || layout.key, label: layout.label, ...tally(records) };
    });
    return { key: spec.key, label: spec.label, ...(spec.level1 ? { level1: spec.level1, level2: spec.level2 } : {}),
      ...tally(included), score: average(cases.map(item => item.score)), opponents, cases, layouts,
      openingCoverage: { shared: shared.length, total: openingIds.length, openingIds: shared },
      expectedLayouts: spec.layouts.length,
      placementDifference: layouts.length === 2 && shared.length ? layouts[1].score - layouts[0].score : null,
      status: shared.length === openingIds.length ? 'complete' : shared.length ? 'partial shared cases' : 'pending shared cases' };
  });
}
function partnerSummary(rows, firstRoster, secondRoster, openingIds) {
  function means(roster, field) {
    return roster.map(reference => {
      const selected = rows.filter(row => row[field] === reference.key);
      const shared = openingIds.filter(opening => selected.length === 3 && selected.every(row => row.cases.some(item => item.openingId === opening)));
      return { key: reference.key, label: reference.name, score: average(shared.map(opening => average(selected.map(row => row.cases.find(item => item.openingId === opening).score)))),
        teams: selected.length, openingCoverage: { shared: shared.length, total: openingIds.length, openingIds: shared } };
    });
  }
  return { method: 'Equal means of the three logical partner teams over shared opening cases; never pooled by physical game count.',
    matrix: { rows: firstRoster.map(reference => ({ key: reference.key, label: reference.name, cells: secondRoster.map(second => {
      const row = rows.find(item => item.level1 === reference.key && item.level2 === second.key);
      return { columnKey: second.key, teamKey: row.key, score: row.score, games: row.games, openingCoverage: row.openingCoverage };
    }) })), columns: secondRoster.map(reference => ({ key: reference.key, label: reference.name })) },
    level1Means: means(firstRoster, 'level1'), level2Means: means(secondRoster, 'level2') };
}
function summarizePanels(metadata, openingIds, index) {
  const refs = references();
  const mixed = { scheduledGames: metadata.mixedTeams.reduce((sum, team) => sum + team.layouts.length, 0) * refs.length * openingIds.length * 2,
    columns: refs.map(({ key, label }) => ({ key, label })),
    rows: summarizeRows(metadata.mixedTeams, refs, openingIds, index) };
  const grants = { scheduledGames: metadata.grantTrials.length * refs.length * openingIds.length * 2,
    columns: refs.map(({ key, label }) => ({ key, label })),
    rows: summarizeRows(metadata.grantTrials.map(trial => ({ ...trial, layouts: [{ key: trial.key, label: 'one finite reserve' }] })), refs, openingIds, index) };
  return { mixed, grants, partnerSummary: partnerSummary(mixed.rows, metadata.level1, metadata.level2, openingIds) };
}

function createReport({ declaration = loadExperiment(), records, manifest, source } = {}) {
  const report = createV17Report({ ...declaration, records, manifest }); // Complete context, schedule and attempt validation precedes all projections.
  const index = completedPairs(records), openings = declaration.config.openings.map(opening => opening.id);
  const panels = summarizePanels(declaration.metadata, openings, index);
  const cohorts = declaration.metadata.openingCohorts.map(cohort => ({ id: cohort.id,
    ...summarizePanels(declaration.metadata, cohort.openingIds, index) }));
  return { ...report, ...(source ? { source } : {}), ...panels, cohorts,
    evaluationAudit: declaration.metadata.appliedValueAudit, openingPolicy: declaration.metadata.openings,
    interpretation: 'Partner and placement contrasts are descriptive conditional performance, not isolated causal coordination, material values or individual piece Elo.' };
}

const percent = value => value === null ? '—' : `${(100 * value).toFixed(2)}%`;
function renderReport(report) {
  const lines = [`# ${report.name}`, '',
    `Finalized games: ${report.progress.finalizedGames}/${report.scheduledGames}; scored complete pairs: ${report.progress.completePairs}.`, '',
    'All armies spend three points. Mixed purchases and the W2/WD grant trials are separate panels. Draws count half a point. Physical games, opening cases and placement variants are not interchangeable sample counts.', '',
    '## Mixed packages: level-one × level-two', '',
    '| L1 / L2 | ' + report.partnerSummary.matrix.columns.map(column => column.label).join(' | ') + ' |',
    '| --- | ' + report.partnerSummary.matrix.columns.map(() => '---:').join(' | ') + ' |',
    ...report.partnerSummary.matrix.rows.map(row => `| ${row.label} | ${row.cells.map(cell => `${percent(cell.score)} (${cell.openingCoverage.shared}/${cell.openingCoverage.total})`).join(' | ')} |`), '',
    'These cells equally weight each frozen opponent and the required placements over shared complete opening cases. The grant-only package has one real placement; every other team has two. It is never replayed under a fictional second layout.', ''];
  for (const [name, panel] of [['Mixed teams versus references', report.mixed], ['Three-point grant trials', report.grants]]) {
    lines.push(`## ${name}`, '', '| Row / reference | ' + panel.columns.map(column => column.label).join(' | ') + ' | Overall score (cases) |',
      '| --- | ' + panel.columns.map(() => '---:').join(' | ') + ' | ---: |',
      ...panel.rows.map(row => `| ${row.label} | ${row.opponents.map(opponent => `${percent(opponent.score)} (${opponent.openingCoverage.shared}/${opponent.openingCoverage.total})`).join(' | ')} | ${percent(row.score)} (${row.openingCoverage.shared}/${row.openingCoverage.total}) |`), '',
      '| Row | Fixed cohort | Score (cases) | W / D / L (games) | White score | Black score |', '| --- | --- | ---: | :--- | ---: | ---: |');
    for (const row of panel.rows) {
      const summaries = report.cohorts.map((cohort, index) => ({ label: index ? 'Second fixed six' : 'First fixed six',
        row: (panel === report.mixed ? cohort.mixed : cohort.grants).rows.find(item => item.key === row.key) }));
      summaries.push({ label: 'All twelve', row });
      for (const item of summaries) lines.push(`| ${row.label} | ${item.label} | ${percent(item.row.score)} (${item.row.openingCoverage.shared}/${item.row.openingCoverage.total}) | ${item.row.wins} / ${item.row.draws} / ${item.row.losses} (${item.row.games}) | ${percent(item.row.physicalColors[0].score)} | ${percent(item.row.physicalColors[1].score)} |`);
    }
    lines.push('');
  }
  lines.push('## Placement diagnostics', '', '| Mixed team | Placement | Score | W / D / L (games) | Second minus first (pp) |', '| --- | --- | ---: | :--- | ---: |',
    ...report.mixed.rows.flatMap(row => row.layouts.map(layout => `| ${row.label} | ${layout.label} | ${percent(layout.score)} | ${layout.wins} / ${layout.draws} / ${layout.losses} (${layout.games}) | ${row.placementDifference === null ? '—' : (100 * row.placementDifference).toFixed(2)} |`)), '',
    'Placement rows use exactly the logical team’s shared cases across all four opponents. Black uses the vertical reflection of the same files. A placement contrast is not a separate set of opening cases.', '',
    '## Partner-averaged diagnostics', '', '| Level | Purchase | Equal-team mean | Shared cases |', '| --- | --- | ---: | ---: |',
    ...[['L1', report.partnerSummary.level1Means], ['L2', report.partnerSummary.level2Means]].flatMap(([level, rows]) => rows.map(row => `| ${level} | ${row.label} | ${percent(row.score)} | ${row.openingCoverage.shared}/${row.openingCoverage.total} |`)), '',
    report.partnerSummary.method, '',
    '## Declared search priors', '', '| Design | Movement | Automatic raw MG / EG | Applied MG / EG | Policy |', '| --- | --- | ---: | ---: | --- |',
    ...report.evaluationAudit.values.map(value => `| ${value.id} | \`${value.movement}\` | ${value.automatic.mg} / ${value.automatic.eg} | ${value.applied.mg} / ${value.applied.eg} | ${value.valuePolicy} |`), '',
    `Receipt: ${report.evaluationAudit.provenance.file}; SHA-256 \`${report.evaluationAudit.provenance.sha256}\`.`, '',
    'W2 and WD share the same applied W2 prior; their measured automatic values remain visible. Existing priors stay unchanged. These engine units are not fitted material prices.', '',
    'Twelve quiet four-ply prefixes preserve purchased pieces. The first two plies may recur from earlier studies; the four-ply sequences and standard resulting positions are fresh. The four forced plies count toward the 400-total-ply cap; grants cannot deploy during the prefix.', '',
    'Twenty thousand nodes per move, one thread, 32 MiB hash and Skill 20. Royal kings remain ordinary; reserves are finite, deploy on the owner’s half without giving check and never refill after captures.', '',
    'Partner, placement and purchase-count results describe conditional contexts. This factorial panel can expose a repeated partner or file effect; it cannot identify pure coordination without stronger controls. No material fit, individual-piece Elo or pooled grand mean across panels is produced.', '');
  return lines.join('\n');
}

module.exports = { ROOT, EXPERIMENT, FILE, OPENINGS_FILE, CAP, MIXED_GAMES, GRANT_GAMES, OPENINGS, HISTORICAL_FILES, GRANTS,
  canonicalPosition, moveStandard, validateOpenings, level1, level2, mixedTeams, references, physicalRows, comparisons, selectedIds,
  buildConfig, loadExperiment, createReport, renderReport };
