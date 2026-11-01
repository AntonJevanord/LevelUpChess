'use strict';

// This extension receives records only after the ordinary outcome reporter has
// validated them. It describes fixed opening cohorts, never an Elo/material fit
// or a sequential statistical acceptance decision.
const { isDeepStrictEqual } = require('node:util');

const FORMAT = 'levelup-v17-bracket-screen';
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;
const escape = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
const score = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));

function declaredCohorts(config, metadata) {
  if (!Array.isArray(metadata.openingCohorts) || metadata.openingCohorts.length !== 2) throw new Error('Bracket reports require two predeclared opening cohorts.');
  const expected = new Set(config.openings.map(opening => opening.id)), seen = new Set(), names = new Set();
  const cohorts = metadata.openingCohorts.map((cohort, index) => {
    if (!cohort || typeof cohort.id !== 'string' || !cohort.id || names.has(cohort.id)
      || !Array.isArray(cohort.openingIds) || !cohort.openingIds.length) throw new Error('Bracket opening cohorts need distinct names and nonempty opening lists.');
    names.add(cohort.id);
    for (const id of cohort.openingIds) {
      if (!expected.has(id) || seen.has(id)) throw new Error('Bracket opening cohorts overlap or contain a foreign case.');
      seen.add(id);
    }
    return { id: cohort.id, label: cohort.label || `${index === 0 ? 'First' : 'Second'} fixed ${cohort.openingIds.length} cases`, openingIds: [...cohort.openingIds] };
  });
  if (seen.size !== expected.size) throw new Error('Bracket opening cohorts must cover every scheduled opening exactly once.');
  if (names.has('all-cases')) throw new Error('The all-cases cohort name is reserved.');
  return [...cohorts, { id: 'all-cases', label: `All ${config.openings.length} cases`, openingIds: config.openings.map(opening => opening.id) }];
}

function evaluationAudit(config, metadata) {
  const ids = Object.keys(config.evaluation?.pieceValues || {}).sort();
  if (!ids.length) throw new Error('Bracket reports require an explicit applied piece-value policy.');
  const audit = metadata.evaluationAudit?.values
    ? metadata.evaluationAudit
    : require('./v17-bracket-values').getBracketValueAudit(ids);
  if (!audit || !audit.provenance || !Array.isArray(audit.values)) throw new Error('Bracket evaluation audit is missing its provenance or values.');
  const byId = new Map();
  for (const row of audit.values) {
    if (!row || typeof row.id !== 'string' || byId.has(row.id)) throw new Error('Bracket evaluation audit repeats or omits a design identity.');
    for (const table of ['automatic', 'applied']) for (const phase of ['mg', 'eg']) {
      if (!Number.isSafeInteger(row[table]?.[phase]) || row[table][phase] < 1) throw new Error('Bracket evaluation audit contains an invalid material-table value.');
    }
    if (!isDeepStrictEqual(row.applied, config.evaluation.pieceValues[row.id])) throw new Error('Bracket evaluation audit differs from the applied configuration.');
    byId.set(row.id, row);
  }
  if (!isDeepStrictEqual([...byId.keys()].sort(), ids)) throw new Error('Bracket evaluation audit must cover exactly the configured piece values.');
  for (const field of ['file', 'sha256']) if (metadata.evaluationAudit?.[field] !== undefined
    && metadata.evaluationAudit[field] !== audit.provenance[field]) throw new Error('Bracket calibration receipt changed.');
  return { provenance: { ...audit.provenance }, values: ids.map(id => ({ ...byId.get(id), automatic: { ...byId.get(id).automatic }, applied: { ...byId.get(id).applied } })) };
}

function flags(row) {
  if (row.score === null) return ['pending shared cases'];
  if (row.openingCoverage.shared !== row.openingCoverage.total) return ['partial screen'];
  const result = [];
  if (row.score < 0.4) result.push('below descriptive target');
  else if (row.score > 0.6) result.push('above descriptive target');
  if (row.opponents.some(opponent => opponent.score < 0.3 || opponent.score > 0.7)) result.push('matchup concern');
  return result.length ? result : ['within descriptive target'];
}

function physicalColors(row, metadata, latest) {
  const openings = new Set(row.openingCoverage.openingIds), opponents = new Set(row.opponents.map(opponent => opponent.key));
  const matches = new Map(metadata.comparisons.flatMap(comparison => comparison.aKey === row.key && opponents.has(comparison.bKey)
    ? [[comparison.id, false]] : metadata.symmetric && comparison.bKey === row.key && opponents.has(comparison.aKey) ? [[comparison.id, true]] : []));
  const values = { w: [], b: [] };
  for (const record of latest.values()) if (record.status === 'completed' && openings.has(record.openingId) && matches.has(record.comparisonId)) {
    const invert = matches.get(record.comparisonId), color = invert ? record.aColor === 'w' ? 'b' : 'w' : record.aColor;
    values[color].push(invert ? 1 - score(record) : score(record));
  }
  return ['w', 'b'].map(color => ({ color, games: values[color].length,
    wins: values[color].filter(value => value === 1).length, draws: values[color].filter(value => value === 0.5).length,
    losses: values[color].filter(value => value === 0).length,
    score: values[color].length ? values[color].reduce((sum, value) => sum + value, 0) / values[color].length : null }));
}

function priority(first, second) {
  if ([first, second].some(row => !row || row.openingCoverage.shared !== row.openingCoverage.total)) return 'pending complete halves';
  const repeated = direction => first.opponents.filter(opponent => direction(opponent.score)
    && second.opponents.some(other => other.key === opponent.key && direction(other.score))).length;
  if (first.score < 0.4 && second.score < 0.4 && repeated(value => value < 0.4) >= 2) return 'buff review priority';
  if (first.score > 0.6 && second.score > 0.6 && repeated(value => value > 0.6) >= 2) return 'nerf review priority';
  return 'mixed or within-band evidence';
}

function createBracketReport({ config, metadata, rows, latest, computeOverall }) {
  if (!Array.isArray(metadata.brackets) || !metadata.brackets.length) throw new Error('Bracket reports require declared design groups.');
  const rowKeys = new Set(rows.map(row => row.key)), groups = new Set(), audit = evaluationAudit(config, metadata);
  const values = new Map(audit.values.map(value => [value.id, value]));
  const rowBudgets = metadata.rowBudgets;
  if (!rowBudgets || rows.some(row => !Number.isSafeInteger(rowBudgets[row.key]) || rowBudgets[row.key] < 1)) throw new Error('Bracket reports require an explicit purchase budget for every row.');
  const configured = new Map(config.comparisons.map(comparison => [comparison.id, comparison]));
  const armyIds = army => [...Object.values(army?.upgrades || {}), ...(army?.reserve || []).map(entry => entry.id)];
  const rowDesigns = new Map(rows.map(row => [row.key, metadata.comparisons.flatMap(comparison => comparison.aKey === row.key
    ? armyIds(configured.get(comparison.id).armyA) : metadata.symmetric && comparison.bKey === row.key ? armyIds(configured.get(comparison.id).armyB) : [])]));
  const cohorts = declaredCohorts(config, metadata).map(cohort => {
    const openingIds = new Set(cohort.openingIds);
    const result = computeOverall(rows, { ...config, openings: config.openings.filter(opening => openingIds.has(opening.id)) }, metadata, latest);
    const summaries = result.rows.map(row => ({ ...row, upgradePoints: rowBudgets[row.key], flags: flags(row), physicalColors: physicalColors(row, metadata, latest) }));
    return { ...cohort, complete: summaries.every(row => row.openingCoverage.shared === row.openingCoverage.total), rows: summaries };
  });
  const lookup = cohorts.map(cohort => new Map(cohort.rows.map(row => [row.key, row])));
  const brackets = metadata.brackets.map(group => {
    if (!group || typeof group.key !== 'string' || !group.key || groups.has(group.key)
      || typeof group.label !== 'string' || !Array.isArray(group.variants) || !group.variants.length) throw new Error('Bracket groups require distinct keys, labels and variants.');
    groups.add(group.key);
    const versions = new Set(), applied = [];
    const variants = group.variants.map(variant => {
      if (!variant || !rowKeys.has(variant.rowKey) || typeof variant.key !== 'string' || versions.has(variant.key)
        || typeof variant.id !== 'string' || !values.has(variant.id) || typeof variant.movement !== 'string') throw new Error('Bracket variants require distinct versions, known rows and audited design IDs.');
      if (!rowDesigns.get(variant.rowKey).includes(variant.id)) throw new Error('Bracket variant identity does not belong to its declared row army.');
      versions.add(variant.key); applied.push(values.get(variant.id).applied);
      return { ...variant, upgradePoints: rowBudgets[variant.rowKey], applied: { ...values.get(variant.id).applied },
        cohorts: cohorts.map((cohort, index) => ({ id: cohort.id, ...lookup[index].get(variant.rowKey) })),
        reviewPriority: priority(lookup[0].get(variant.rowKey), lookup[1].get(variant.rowKey)) };
    });
    if (applied.some(pair => !isDeepStrictEqual(pair, applied[0]))) throw new Error('A movement bracket must use the same applied MG/EG values for every version.');
    if (new Set(variants.map(variant => variant.upgradePoints)).size !== 1) throw new Error('A movement bracket cannot mix purchase budgets.');
    return { key: group.key, label: group.label, family: group.family, level: group.level, variants };
  });
  return { schemaVersion: 1, format: FORMAT, cohorts, brackets, evaluationAudit: audit,
    reviewRules: { target: [0.4, 0.6], matchupConcern: [0.3, 0.7], minimumRepeatedOpponents: 2,
      meaning: 'Descriptive triage only. A review priority requires both complete fixed halves outside the target in the same direction and at least two opponent scores beyond that boundary in both halves. No statistical acceptance or early stopping is implied.' },
    notes: [
      'Reduced/current/expanded describe movement choices; measured strength need not follow that order at a fixed search budget.',
      'Each cohort uses only opening cases with complete color pairs against every included opponent. Opponents and shared cases receive equal weight.',
      'The first and second fixed halves are predeclared opening lists, not the first games or cases to finish. A cohort is complete only when every row has all its scheduled shared cases.',
      'Rows retain their own purchase budgets. Single-queen acceptance and two-upgrade acceptance are not pooled into a global score.',
      'Material tables are internal engine units, not measured pawn values, purchase prices or Elo. The automatic column shows the raw table; the audit JSON also retains automatic capture/evaluation tables. Applied values are common within each bracket, and native preflight checks them across all six tables for both colors.',
      'The tables are conditional on these openings, placements, evaluation policy and search budget. Target and matchup flags guide further review; they do not prove balance or a confidence interval.',
    ] };
}

function renderBracketReport(study) {
  const lines = ['## Movement brackets and fixed opening cohorts', '',
    '| Cohort | Fixed cases | Every scheduled row complete |', '| --- | ---: | :--- |',
    ...study.cohorts.map(cohort => `| ${escape(cohort.label)} | ${cohort.openingIds.length} | ${cohort.complete ? 'yes' : 'no'} |`), '',
    'Scores below show the row army’s overall score against its scheduled benchmarks. Parentheses give shared completed cases; a partial half remains descriptive.', ''];
  for (const group of study.brackets) {
    lines.push(`### ${escape(group.label)}`, '',
      '| Version | Movement | Purchase budget | First half | Second half | All cases | Descriptive flag | Review priority |',
      '| --- | :--- | ---: | ---: | ---: | ---: | :--- | :--- |');
    for (const variant of group.variants) {
      const cells = variant.cohorts.map(cohort => `${percent(cohort.score)} (${cohort.openingCoverage.shared}/${cohort.openingCoverage.total})`);
      const all = variant.cohorts[2];
      lines.push(`| ${escape(variant.key)} | \`${escape(variant.movement)}\` | ${variant.upgradePoints} | ${cells.join(' | ')} | ${escape(all.flags.join('; '))} | ${escape(variant.reviewPriority)} |`);
    }
    lines.push('');
  }
  lines.push('### All-row cohort summary', '', '| Army | Budget | First half | Second half | All cases | All-case W / D / L | White / Black |',
    '| --- | ---: | ---: | ---: | ---: | :--- | :--- |');
  const first = new Map(study.cohorts[0].rows.map(row => [row.key, row])), second = new Map(study.cohorts[1].rows.map(row => [row.key, row]));
  for (const row of study.cohorts[2].rows) {
    const cells = [first.get(row.key), second.get(row.key), row].map(item => `${percent(item.score)} (${item.openingCoverage.shared}/${item.openingCoverage.total})`);
    lines.push(`| ${escape(row.label)} | ${row.upgradePoints} | ${cells.join(' | ')} | ${row.wins} / ${row.draws} / ${row.losses} | ${row.physicalColors.map(color => percent(color.score)).join(' / ')} |`);
  }
  const provenance = study.evaluationAudit.provenance;
  lines.push('', '### Declared engine material tables', '',
    `Calibration: ${escape(provenance.file || 'declared fixture')}; SHA-256 ${escape(provenance.sha256 || 'not supplied')}.`, '',
    ...(provenance.policy ? [escape(provenance.policy), ''] : []),
    ...(provenance.engineSha256 ? [`Calibration engine SHA-256: ${escape(provenance.engineSha256)}.`, ''] : []),
    '| Design ID | Value group | Automatic raw MG / EG | Applied MG / EG |', '| :--- | :--- | ---: | ---: |',
    ...study.evaluationAudit.values.map(value => `| ${escape(value.id)} | ${escape(value.valueGroup || 'unchanged')} | ${value.automatic.mg} / ${value.automatic.eg} | ${value.applied.mg} / ${value.applied.eg} |`), '',
    ...study.notes.map(note => `- ${note}`), '', `- ${study.reviewRules.meaning}`, '');
  return lines;
}

module.exports = { FORMAT, createBracketReport, renderBracketReport };
