'use strict';

// A new experiment only. Existing campaigns retain their complete declarations.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getLevel2References } = require('./level2-references');
const { getOfficialReferences } = require('./official-references');
const { getBracketEvaluation, getBracketValueReceipt } = require('./v17-bracket-values');
const { createV17Report } = require('./v17-report');

const ROOT = path.resolve(__dirname, '../..');
const EXPERIMENT = 'level2-bridge';
const FILE = 'experiments/balance/v17-level2-bridge.json';
const OPENINGS_FILE = 'experiments/balance/v17-level2-bridge-openings.json';
const CAP = 384;
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const OPENINGS = freeze(require('../../experiments/balance/v17-level2-bridge-openings.json'));
// This list is the historical inventory at declaration time, rather than a glob
// that could invalidate the frozen experiment when a future file is added.
const HISTORICAL_FILES = freeze([
  'amazon-alternatives', 'amazon-revision', 'blue-rook-confirmation', 'budget-3-confirmation', 'budget-3',
  'level3-holdout', 'level3-round-robin', 'material-anchors', 'material-estimate', 'outlier-effects',
  'purple-material-handicaps', 'revision-1-confirmation', 'revision-1-screen', 'rook-values-auto',
  'rook-values-eight', 'skill-sweep', 'smoke', 'upgrade-effects', 'v17-acceptance-majors',
  'v17-acceptance-minors', 'v17-design-focus', 'v17-followup-level3-confirm', 'v17-followup-level3-revisions',
  'v17-followup-pawn-grants', 'v17-level3-confirmation', 'v17-level3-screen', 'v17-mobility-additions',
  'v17-mobility-confirm', 'v17-mobility-expanded', 'v17-mobility-revisions', 'v17-panel-gap',
  'v17-panel-level1-pairs', 'v17-panel-level1', 'v17-pawn-grants', 'v17-reference-grants',
  'v17-reference-pairs', 'v17-reference-pawns',
].map(name => `experiments/balance/${name}.json`));

function validateOpenings(openings = OPENINGS) {
  const historical = new Set(HISTORICAL_FILES.flatMap(file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).openings
    .filter(opening => opening.moves.length >= 2).map(opening => opening.moves.slice(0, 2).join(' '))));
  const ids = new Set(), prefixes = new Set();
  if (!Array.isArray(openings) || openings.length !== 16) throw new Error('The level-two bridge needs sixteen fixed opening cases.');
  for (const opening of openings) {
    const prefix = opening.moves?.join(' ');
    if (!opening.id || ids.has(opening.id) || opening.moves?.length !== 2 || prefixes.has(prefix) || historical.has(prefix)) {
      throw new Error('Level-two bridge openings must be distinct fresh two-ply prefixes.');
    }
    ids.add(opening.id); prefixes.add(prefix);
  }
  return openings;
}

function packages() {
  const level2 = getLevel2References().roster;
  const armies = level2.map(reference => {
    const build = count => reference.placement === 'reserve'
      ? { upgrades: {}, reserve: [{ id: reference.id, count }] }
      : { upgrades: Object.fromEntries(['c2', 'd2', 'e2'].slice(0, count).map(square => [square, reference.id])) };
    return { reference, single: { key: `${reference.key}-single`, label: `${reference.name} (one; 2 points)`, army: build(1), budget: 2 },
      triple: { key: `${reference.key}-triple`, label: `${reference.name} (three; 6 points)`, army: build(3), budget: 6 } };
  });
  const homes = { rook: ['a1', 'h1'], knight: ['b1', 'g1'], bishop: ['c1', 'f1'] };
  const doubles = getOfficialReferences().roster.filter(reference => reference.family !== 'queen').map(reference => ({
    key: reference.key, label: `${reference.name} (two; 6 points)`, budget: 6,
    army: { upgrades: Object.fromEntries(homes[reference.family].map(square => [square, reference.id])) },
  }));
  return { armies, doubles };
}

function comparisons() {
  const { armies, doubles } = packages(), pairs = [];
  for (let a = 0; a < armies.length; a++) for (let b = a + 1; b < armies.length; b++) pairs.push({
    panel: 'singles', a: armies[a].single, b: armies[b].single,
  });
  for (const army of armies) for (const opponent of doubles) pairs.push({ panel: 'bridge', a: army.triple, b: opponent });
  return pairs.map(pair => ({ ...pair, id: `${pair.a.key}-v-${pair.b.key}` }));
}

function buildConfig() {
  validateOpenings();
  const matches = comparisons().map(({ id, a, b }) => ({ id, label: `${a.label} versus ${b.label}`,
    armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 } }));
  const ids = [...new Set(matches.flatMap(comparison => [comparison.armyA, comparison.armyB]
    .flatMap(army => [...Object.values(army.upgrades), ...(army.reserve || []).map(entry => entry.id)])))];
  return normalizeConfig({ schemaVersion: 3, name: 'Version 17: selected level-two reference panel and six-point bridge (384 games)',
    seed: 20261102, repetitions: 1, engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: OPENINGS, comparisons: matches, evaluation: getBracketEvaluation(ids) });
}

function described(matches) {
  return matches.map(({ id, a, b }) => ({ id, aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label }));
}
function axes(armies) { return armies.map(({ key, label }) => ({ key, label })); }
function panelMetadata(panel) {
  const { armies, doubles } = packages(), matches = comparisons().filter(match => match.panel === panel);
  const rows = panel === 'singles' ? armies.map(army => army.single) : armies.map(army => army.triple);
  return { rows: axes(rows), columns: axes(panel === 'singles' ? rows : doubles), comparisons: described(matches),
    symmetric: panel === 'singles', question: panel === 'singles'
      ? 'Compare one selected two-point purchase against each other selected two-point purchase.'
      : 'Compare three identical selected level-two purchases against two identical non-Amazon level-three references.' };
}

function loadExperiment() {
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, FILE), 'utf8')));
  if (!isDeepStrictEqual(config, buildConfig()) || makeSchedule(config).length !== CAP) throw new Error('The level-two bridge declaration changed; declare a new experiment.');
  const { armies, doubles } = packages(), all = [...armies.map(army => army.single), ...armies.map(army => army.triple), ...doubles];
  return freeze({ experiment: EXPERIMENT, file: FILE, config, metadata: {
    kind: EXPERIMENT, scheduledGames: CAP, rows: axes(all), columns: axes(all), comparisons: described(comparisons()), symmetric: true,
    question: 'Validate the selected two-point references directly and test their six-point purchase bundles against doubled non-Amazon references. Budgets are reported separately.',
    referenceValueProfile: 'official-standalone', evaluationAudit: getBracketValueReceipt(),
    selectedLevel2DeclarationSha256: getLevel2References().declarationSha256,
    panels: [{ id: 'singles', budget: 2, scheduledGames: 96 }, { id: 'bridge', budget: 6, scheduledGames: 288 }],
    openingCohorts: [{ id: 'first-eight', openingIds: OPENINGS.slice(0, 8).map(opening => opening.id) },
      { id: 'second-eight', openingIds: OPENINGS.slice(8).map(opening => opening.id) }],
  } });
}

/** Colors use the same shared cases as the row mean. The full report validates
 * attempt/pair identities first; selecting latest complete pairs also prevents
 * repeated copies, unpaired results or interrupted partners gaining weight. */
function withPhysicalColors(report, metadata, records) {
  const latest = new Map(), pairs = new Map();
  for (const record of records) {
    if (!latest.has(record.id) || record.attempt > latest.get(record.id).attempt) latest.set(record.id, record);
  }
  for (const record of latest.values()) {
    const pair = pairs.get(record.pairId) || [];
    pair.push(record); pairs.set(record.pairId, pair);
  }
  const paired = [...pairs.values()].filter(pair => pair.length === 2
    && pair.every(record => record.status === 'completed') && pair[0].aColor !== pair[1].aColor).flat();
  const score = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
  report.overall = { ...report.overall, rows: report.overall.rows.map(row => {
    const openings = new Set(row.openingCoverage.openingIds), opponents = new Set(row.opponents.map(opponent => opponent.key));
    const matches = new Map(metadata.comparisons.flatMap(comparison => comparison.aKey === row.key && opponents.has(comparison.bKey)
      ? [[comparison.id, false]] : metadata.symmetric && comparison.bKey === row.key && opponents.has(comparison.aKey) ? [[comparison.id, true]] : []));
    const values = { w: [], b: [] };
    for (const record of paired) if (openings.has(record.openingId) && matches.has(record.comparisonId)) {
      const inverted = matches.get(record.comparisonId), color = inverted ? record.aColor === 'w' ? 'b' : 'w' : record.aColor;
      values[color].push(inverted ? 1 - score(record) : score(record));
    }
    return { ...row, physicalColors: ['w', 'b'].map(color => ({ color, games: values[color].length,
      wins: values[color].filter(value => value === 1).length, draws: values[color].filter(value => value === 0.5).length,
      losses: values[color].filter(value => value === 0).length,
      score: values[color].length ? values[color].reduce((sum, value) => sum + value, 0) / values[color].length : null })) };
  }) };
  return report;
}

/** Validate the full run first. Panel/cohort projections are derived summaries,
 * not substituted manifests or new experiment identities. */
function createReport({ declaration = loadExperiment(), records, manifest, source } = {}) {
  const original = withPhysicalColors(createV17Report({ ...declaration, records, manifest }), declaration.metadata, records);
  const panels = declaration.metadata.panels.map(panel => {
    const ids = new Set(comparisons().filter(match => match.panel === panel.id).map(match => match.id));
    const metadata = panelMetadata(panel.id), config = { ...declaration.config,
      name: panel.id === 'singles' ? 'Two-point reference singles' : 'Six-point cross-tier bridge',
      comparisons: declaration.config.comparisons.filter(comparison => ids.has(comparison.id)) };
    const selected = records.filter(record => ids.has(record.comparisonId));
    const report = withPhysicalColors(createV17Report({ experiment: `${EXPERIMENT}:${panel.id}`, config, metadata, records: selected }), metadata, selected);
    const cohorts = declaration.metadata.openingCohorts.map(cohort => {
      const cohortRecords = selected.filter(record => cohort.openingIds.includes(record.openingId));
      return { id: cohort.id, report: withPhysicalColors(createV17Report({
        experiment: `${EXPERIMENT}:${panel.id}:${cohort.id}`, metadata,
        config: { ...config, openings: config.openings.filter(opening => cohort.openingIds.includes(opening.id)) }, records: cohortRecords,
      }), metadata, cohortRecords) };
    });
    return { ...panel, report, cohorts };
  });
  return { ...original, ...(source ? { source } : {}), panels,
    selectedLevel2DeclarationSha256: declaration.metadata.selectedLevel2DeclarationSha256 };
}

const percent = value => value === null ? '—' : `${(100 * value).toFixed(2)}%`;
function renderReport(report) {
  const lines = [`# ${report.name}`, '',
    `Finalized games: ${report.progress.finalizedGames}/${report.scheduledGames}; scored complete pairs: ${report.progress.completePairs}.`, '',
    'The two-point singles and six-point bridge are separate panels. Scores count draws as half a point; unscored and unpaired games are excluded. No pooled score, material fit or piece Elo is calculated.', ''];
  for (const panel of report.panels) {
    const current = panel.report, overall = new Map(current.overall.rows.map(row => [row.key, row]));
    lines.push(`## ${current.name}`, '', `${panel.budget} upgrade points per side; ${current.progress.finalizedGames}/${panel.scheduledGames} finalized games.`, '',
      '| Row army / opponent | ' + current.matrix.columns.map(column => column.label).join(' | ') + ' | Overall score (cases) |',
      '| --- | ' + current.matrix.columns.map(() => '---:').join(' | ') + ' | ---: |',
      ...current.matrix.rows.map(row => `| ${row.label} | ${row.cells.map(cell => percent(cell.score)).join(' | ')} | ${percent(overall.get(row.key).score)} (${overall.get(row.key).openingCoverage.shared}/16) |`), '',
      '| Selected purchase | Fixed cohort | Overall score (cases) | W / D / L (included games) | White score | White W / D / L (games) | Black score | Black W / D / L (games) |',
      '| --- | --- | ---: | :--- | ---: | :--- | ---: | :--- |',
      ...current.overall.rows.flatMap(row => {
        const summaries = [...panel.cohorts.map((cohort, index) => ({ label: index === 0 ? 'First fixed eight' : 'Second fixed eight',
          row: cohort.report.overall.rows.find(other => other.key === row.key) })), { label: 'All sixteen', row }];
        return summaries.map(summary => {
          const value = summary.row;
          return `| ${row.label} | ${summary.label} | ${percent(value.score)} (${value.openingCoverage.shared}/${value.openingCoverage.total}) | ${value.wins} / ${value.draws} / ${value.losses} (${value.games}) | `
            + value.physicalColors.map(color => `${percent(color.score)} | ${color.wins} / ${color.draws} / ${color.losses} (${color.games})`).join(' | ') + ' |';
        });
      }), '', 'Overall scores equally weight opponents over shared fully completed opening cases within this panel. Physical White/Black diagnostics use exactly those included pairs and shared cases; excluded partners and faster extra opponent results add no weight.', '',
      '| A versus B | Paired games | A W / D / L | A score | Complete pairs | Truncated attempts | Errors |',
      '| --- | ---: | :--- | ---: | ---: | ---: | ---: |',
      ...current.comparisons.map(cell => `| ${cell.aLabel} / ${cell.bLabel} | ${cell.pairedGames} | ${cell.wins} / ${cell.draws} / ${cell.losses} | ${percent(cell.score)} | ${cell.completePairs}/${cell.expectedPairs} | ${cell.statusCounts.truncated} | ${cell.statusCounts.error} |`), '');
  }
  lines.push('Twenty thousand nodes per move, one search thread, 32 MiB hash and a 400-total-ply cap. Applied MG/EG values and all six engine tables retain the declared calibration.', '',
    'These sixteen fixed prefixes are descriptive validation cases. The bridge checks stacking and tier relationships; it does not require every direct matchup to score exactly 50%. Native preflight checks movement and values before matches; this outcome report does not independently replay games.', '');
  return lines.join('\n');
}

module.exports = { ROOT, EXPERIMENT, FILE, OPENINGS_FILE, OPENINGS, HISTORICAL_FILES, CAP,
  validateOpenings, packages, comparisons, buildConfig, loadExperiment, panelMetadata, withPhysicalColors, createReport, renderReport };
