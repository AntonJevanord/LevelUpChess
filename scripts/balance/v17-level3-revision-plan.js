'use strict';

// A new declaration for changed movement/price identities only. Completed
// campaigns, their outcomes and the earlier 72-entry valuation stay intact.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { getDesign } = require('../../src/design-catalog');
const { TRIALS } = require('../../src/balance-designs-v17-revisions');
const { getOfficialReferences } = require('./official-references');
const { OPENINGS, OPENINGS_FILE, validateOpenings, withPhysicalColors } = require('./v17-level2-bridge');
const { getEvaluation, getReceipt, getValueAudit } = require('./v17-level3-revision-values');
const { createV17Report } = require('./v17-report');

const ROOT = path.resolve(__dirname, '../..');
const EXPERIMENT = 'level3-revision-screen';
const FILE = 'experiments/balance/v17-level3-revision-screen.json';
const CAP = 768;
const HOMES = Object.freeze({ pawn: 'd2', bishop: 'c1', queen: 'd1', rook: 'a1', knight: 'b1' });
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function trialRows() {
  return TRIALS.map(trial => {
    const design = getDesign(trial.id);
    if (!design || ['family', 'level', 'movement', 'placement'].some(field => design[field] !== trial[field]) || design.level !== 3) {
      throw new Error(`The new level-three trial changed: ${trial.id}.`);
    }
    return { ...trial, budget: 3, army: design.placement === 'reserve'
      ? { upgrades: {}, reserve: [{ id: trial.id, count: 1 }] }
      : { upgrades: { [HOMES[design.family]]: trial.id } } };
  });
}
function references() {
  return getOfficialReferences().roster.map(reference => ({ ...reference, label: reference.name, budget: 3,
    army: { upgrades: { [HOMES[reference.family]]: reference.id } } }));
}
function comparisons() {
  return trialRows().flatMap(a => references().map(b => ({ id: `${a.key}-v-${b.key}`, a, b })));
}
function selectedIds() { return [...TRIALS.map(trial => trial.id), ...getOfficialReferences().roster.map(reference => reference.id)].sort(); }

function buildConfig() {
  validateOpenings();
  if (TRIALS.length !== 6) throw new Error('Declare a new screen when the six-trial roster changes.');
  return normalizeConfig({ schemaVersion: 3, name: 'Version 17: six new level-three trials against frozen references (768 games)',
    seed: 20261102, repetitions: 1, engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: OPENINGS, comparisons: comparisons().map(({ id, a, b }) => ({ id, label: `${a.label} versus ${b.label}`,
      armyA: a.army, armyB: b.army, strengthA: { skill: 20 }, strengthB: { skill: 20 } })),
    evaluation: getEvaluation(selectedIds()) });
}

function loadExperiment() {
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(ROOT, FILE), 'utf8')));
  if (!isDeepStrictEqual(config, buildConfig()) || makeSchedule(config).length !== CAP) {
    throw new Error('The new level-three screen declaration changed; declare a new experiment.');
  }
  return freeze({ experiment: EXPERIMENT, file: FILE, config, metadata: {
    kind: EXPERIMENT, scheduledGames: CAP, upgradePoints: 3, symmetric: false,
    rows: trialRows().map(({ key, label }) => ({ key, label })), columns: references().map(({ key, label }) => ({ key, label })),
    comparisons: comparisons().map(({ id, a, b }) => ({ id, aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label })),
    trials: TRIALS, evaluationAudit: getReceipt(), appliedValueAudit: getValueAudit(selectedIds()),
    question: 'Screen three changed movement designs and three newly priced finite grants against the four frozen level-three references. Every army spends three points; experimental pieces never face one another.',
    openingCohorts: [{ id: 'first-eight', openingIds: OPENINGS.slice(0, 8).map(opening => opening.id) },
      { id: 'second-eight', openingIds: OPENINGS.slice(8).map(opening => opening.id) }],
    openings: { file: OPENINGS_FILE, policy: 'Shared predeclared holdout with the separate level-two bridge; fresh relative to the completed 6752-game campaign and all earlier canonical declarations.' },
  } });
}

/** Whole-run identity checks precede the descriptive fixed-half projections. */
function createReport({ declaration = loadExperiment(), records, manifest, source } = {}) {
  const report = withPhysicalColors(createV17Report({ ...declaration, records, manifest }), declaration.metadata, records);
  const cohorts = declaration.metadata.openingCohorts.map(cohort => {
    const selected = records.filter(record => cohort.openingIds.includes(record.openingId));
    return { id: cohort.id, report: withPhysicalColors(createV17Report({ experiment: `${EXPERIMENT}:${cohort.id}`,
      config: { ...declaration.config, openings: declaration.config.openings.filter(opening => cohort.openingIds.includes(opening.id)) },
      metadata: declaration.metadata, records: selected }), declaration.metadata, selected) };
  });
  return { ...report, ...(source ? { source } : {}), cohorts, upgradePoints: 3,
    evaluationAudit: declaration.metadata.appliedValueAudit, trialDefinitions: declaration.metadata.trials,
    openingPolicy: declaration.metadata.openings };
}

const percent = value => value === null ? '—' : `${(100 * value).toFixed(2)}%`;
function renderReport(report) {
  const overall = new Map(report.overall.rows.map(row => [row.key, row]));
  const labels = new Map([...report.trialDefinitions.map(trial => [trial.id, trial.label]),
    ...getOfficialReferences().roster.map(reference => [reference.id, `${reference.name} (frozen reference)`])]);
  const lines = [`# ${report.name}`, '',
    `Finalized games: ${report.progress.finalizedGames}/${report.scheduledGames}; scored complete pairs: ${report.progress.completePairs}.`, '',
    'Every army spends three upgrade points. New trial designs face only Vanguard, Unicorn, Cruisader and Amazon. Scores count draws as half a point; unscored outcomes and incomplete pairs are excluded.', '',
    '| Trial / frozen reference | ' + report.matrix.columns.map(column => column.label).join(' | ') + ' | Overall score (cases) |',
    '| --- | ' + report.matrix.columns.map(() => '---:').join(' | ') + ' | ---: |',
    ...report.matrix.rows.map(row => `| ${row.label} | ${row.cells.map(cell => percent(cell.score)).join(' | ')} | ${percent(overall.get(row.key).score)} (${overall.get(row.key).openingCoverage.shared}/16) |`), '',
    '| Trial | Fixed cohort | Overall score (cases) | W / D / L (included games) | White score | White W / D / L (games) | Black score | Black W / D / L (games) |',
    '| --- | --- | ---: | :--- | ---: | :--- | ---: | :--- |',
    ...report.overall.rows.flatMap(row => {
      const groups = [...report.cohorts.map((cohort, index) => ({ label: index === 0 ? 'First fixed eight' : 'Second fixed eight',
        row: cohort.report.overall.rows.find(other => other.key === row.key) })), { label: 'All sixteen', row }];
      return groups.map(group => `| ${row.label} | ${group.label} | ${percent(group.row.score)} (${group.row.openingCoverage.shared}/${group.row.openingCoverage.total}) | ${group.row.wins} / ${group.row.draws} / ${group.row.losses} (${group.row.games}) | `
        + group.row.physicalColors.map(color => `${percent(color.score)} | ${color.wins} / ${color.draws} / ${color.losses} (${color.games})`).join(' | ') + ' |');
    }), '',
    'Overall and physical-color summaries use the same shared fully scored opening cases, equally weighting the four references. Extra finished games against a faster opponent do not alter those means.', '',
    '| A versus B | Paired games | A W / D / L | A score | Complete pairs | Truncated attempts | Errors |',
    '| --- | ---: | :--- | ---: | ---: | ---: | ---: |',
    ...report.comparisons.map(cell => `| ${cell.aLabel} / ${cell.bLabel} | ${cell.pairedGames} | ${cell.wins} / ${cell.draws} / ${cell.losses} | ${percent(cell.score)} | ${cell.completePairs}/${cell.expectedPairs} | ${cell.statusCounts.truncated} | ${cell.statusCounts.error} |`), '',
    '## Declared engine search values', '',
    '| Design | Movement | Automatic raw MG / EG | Applied MG / EG | Policy |',
    '| --- | --- | ---: | ---: | --- |',
    ...report.evaluationAudit.values.map(value => `| ${labels.get(value.id)} | \`${value.movement}\` | ${value.automatic.mg} / ${value.automatic.eg} | ${value.applied.mg} / ${value.applied.eg} | ${value.valuePolicy} |`), '',
    `Receipt: ${report.evaluationAudit.provenance.file}; SHA-256 \`${report.evaluationAudit.provenance.sha256}\`.`, '',
    'The sixteen two-ply cases are shared with the separately declared level-two validation and were frozen before either new study starts. Completed screening games are not repeated or pooled into this report.', '',
    'Movement/price definitions and the immutable evaluation receipt are retained in JSON. Search priors preserve the old applied baselines for the three movement revisions and W3; the newly priced K/N grants use their measured custom-piece raw values. These search units are not fitted material values or purchase prices.', '',
    'Twenty thousand nodes per move, one thread, 32 MiB hash, Skill 20 and a 400-total-ply cap. Finite grants retain an ordinary royal king, deploy only in the owner’s half without giving check, cannot promote and never refill reserves. Only predeclared outcomes are scored; this report does not replay games or fit material/Elo values.', '',
    'Sixteen fixed cases are a descriptive screen. Review persistent opponent and physical-color differences before changing a design; a mean near 50% does not establish universal balance.', ''];
  return lines.join('\n');
}

module.exports = { ROOT, EXPERIMENT, FILE, CAP, HOMES, trialRows, references, comparisons, selectedIds, buildConfig, loadExperiment, createReport, renderReport };
