#!/usr/bin/env node
'use strict';

// Read-only outcome comparison. Journals retain their original run, profile
// and design identities; only unchanged designs share an outcome panel.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { loadExperiment } = require('./balance/v17-plan');
const { createV17Report, renderV17Report } = require('./balance/v17-report');
const { readReportInput } = require('./version17-balance');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');

const FORMAT = 'levelup-v17-followup-review';
const INPUTS = { confirm: 'level3-confirm', revisions: 'level3-revisions', 'pawn-grants': 'pawn-grants-revisions' };
const FILES = { json: 'v17-review.json', markdown: 'v17-review.md' };
const HELP = `Review version-17 follow-ups without playing games or starting an engine.

  npm run balance:v17:review -- --confirm DIRECTORY --out DIRECTORY
  npm run balance:v17:review -- --confirm DIRECTORY --revisions DIRECTORY --pawn-grants DIRECTORY --out DIRECTORY

Supply any of the three run folders. Unchanged pieces combine the archived
original eight cases with the eight new cases. Revisions retain their own IDs
and show original-eight, new-eight and combined outcomes separately.
Reports include only complete color pairs. A pooled panel score waits for all
four opponents and scheduled pairs; incomplete cell results remain visible.
40–60% pooled and 35–65% per-cell bands are investigation targets, not tests of
statistical significance. No material values or Elo ratings are estimated.
`;
const pct = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const md = value => String(value).replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], name = flag.startsWith('--') ? flag.slice(2) : '';
    if (![...Object.keys(INPUTS), 'out'].includes(name)) throw new Error(`Unknown argument: ${flag}. Use --help.`);
    if (Object.hasOwn(result, name)) throw new Error(`Repeated argument: ${flag}.`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a directory.`);
    result[name] = value;
  }
  if (!result.out || !Object.keys(INPUTS).some(name => result[name])) throw new Error('Supply at least one run folder and --out DIRECTORY.');
  return result;
}

/** Four equal opponent weights; never let faster workers change the mix. */
function pooledRows(report) {
  if (report.matrix.columns.length !== 4) throw new Error('A follow-up panel must have four fixed reference opponents.');
  return report.matrix.rows.map(row => {
    const complete = row.cells.every(cell => cell.score !== null && cell.completePairs === report.comparisons.find(item => item.id === cell.comparisonId)?.expectedPairs);
    const score = complete ? row.cells.reduce((sum, cell) => sum + cell.score, 0) / 4 : null;
    const matchupFlags = row.cells.filter(cell => cell.score !== null && (cell.score < 0.35 || cell.score > 0.65))
      .map(cell => ({ opponent: report.matrix.columns.find(column => column.key === cell.columnKey).label, score: cell.score }));
    return { key: row.key, label: row.label, score, complete,
      pairedGames: row.cells.reduce((sum, cell) => sum + cell.pairedGames, 0),
      decision: score === null ? 'pending complete panel' : score < 0.4 ? 'below pooled target' : score > 0.6 ? 'above pooled target' : 'within pooled target', matchupFlags };
  });
}

function outcome(declaration, records, name, openings = declaration.config.openings) {
  const ids = new Set(openings.map(opening => opening.id));
  const report = createV17Report({ experiment: declaration.experiment,
    config: { ...declaration.config, name, openings }, metadata: declaration.metadata,
    records: records.filter(record => ids.has(record.openingId)) });
  return { report, pooled: pooledRows(report) };
}

function checkedInput(directory, experiment, read = readReportInput) {
  const declaration = loadExperiment(experiment), input = read(directory, declaration);
  // readReportInput proves manifest, archived INI and native preflight; this
  // additional pass validates every complete journal line against that run.
  createV17Report({ ...declaration, records: input.records, manifest: input.manifest });
  return { ...input, declaration };
}

function createReview(inputs, { loadArchive = experiment => require('./balance/v17-screen-evidence').loadScreenEvidence(experiment) } = {}) {
  const sections = [], sources = [], ownership = {};
  for (const [name, input] of Object.entries(inputs)) {
    if (!Object.hasOwn(INPUTS, name) || input.declaration.experiment !== INPUTS[name]) throw new Error('Follow-up input has the wrong declared experiment.');
    const { declaration, records, manifest } = input;
    createV17Report({ ...declaration, records, manifest });
    ownership[name] = { directory: path.resolve(input.root), runId: manifest.runId };
    sources.push({ kind: name, directory: path.resolve(input.root), runId: manifest.runId,
      configHash: manifest.configHash, engineSha256: manifest.engineSha256,
      profileHash: manifest.designProfile.hash, registryHash: manifest.designRegistry.hash,
      journal: input.source,
      provenance: 'Supplied run manifest, archived rules and native preflight checked; outcomes are not an independent legal replay audit.' });
    if (name === 'confirm') {
      const initial = loadArchive('level3');
      const oldById = new Map(initial.config.comparisons.map(item => [item.id, item]));
      const comparisons = declaration.config.comparisons;
      for (const comparison of comparisons) {
        const previous = oldById.get(comparison.id);
        for (const field of ['armyA', 'armyB', 'strengthA', 'strengthB']) {
          if (!previous || !isDeepStrictEqual(previous[field], comparison[field])) throw new Error('Cannot pool a changed design, army or engine strength with historical outcomes.');
        }
      }
      if (!isDeepStrictEqual(initial.config.engine, declaration.config.engine)
        || initial.config.repetitions !== declaration.config.repetitions
        || !isDeepStrictEqual(initial.config.evaluation, declaration.config.evaluation)) throw new Error('Cannot pool different search or evaluation protocols.');
      const oldIds = new Set(initial.config.openings.map(opening => opening.id));
      const oldMoves = new Set(initial.config.openings.map(opening => JSON.stringify(opening.moves)));
      if (declaration.config.openings.some(opening => oldIds.has(opening.id) || oldMoves.has(JSON.stringify(opening.moves)))) throw new Error('New opening cases overlap the archived cohort.');
      const selected = new Set(comparisons.map(item => item.id));
      const historical = initial.records.filter(record => selected.has(record.comparisonId));
      const combined = [...historical, ...records];
      const historicalIds = new Set(historical.map(record => record.id));
      if (records.some(record => historicalIds.has(record.id))) throw new Error('Historical and new game identities overlap.');
      const title = 'Unchanged level-three pieces';
      sections.push({ id: name, title, cohorts: [
        { id: 'combined-sixteen', ...outcome(declaration, combined, `${title}: sixteen opening cases`, [...initial.config.openings, ...declaration.config.openings]) },
        { id: 'original-eight', ...outcome(declaration, historical, `${title}: original eight cases`, initial.config.openings) },
        { id: 'new-eight', ...outcome(declaration, records, `${title}: eight new cases`) },
      ] });
      sources.push({ kind: 'archived-level3', source: initial.source, provenance: initial.provenance });
    } else {
      const title = name === 'revisions' ? 'Level-three revisions' : 'Revised level-one bundles';
      const cohorts = [{ id: 'combined-sixteen', ...outcome(declaration, records, `${title}: sixteen opening cases`) }];
      for (const cohort of declaration.metadata.openingCohorts) {
        const ids = new Set(cohort.openingIds), openings = declaration.config.openings.filter(opening => ids.has(opening.id));
        cohorts.push({ id: cohort.id, ...outcome(declaration, records, `${title}: ${cohort.id}`, openings) });
      }
      sections.push({ id: name, title, cohorts });
    }
  }
  if (!sections.length) throw new Error('Review requires at least one validated follow-up input.');
  return { schemaVersion: 1, format: FORMAT, sources, ownership, sections,
    notes: [
      '40–60% pooled score is a design target. A reference matchup outside 35–65% is an investigation flag, not automatic rejection.',
      'Scores count draws as half a point and complete color pairs only. Pooled rows give the four references equal weight and remain pending until their full scheduled panels finish.',
      'The sixteen fixed cases support descriptive comparisons. Opening cohorts are not independent random samples and these bands are not confidence intervals.',
      'Only unchanged immutable design IDs share historical outcomes. Changed designs retain separate results; no game file is appended, edited or replayed.',
      'Archived initial journals were supplied without their original run manifests or native preflight proofs. Their recorded profiles and search context match the frozen declarations; independent original engine-build attestation is unavailable.',
      'This is an outcome summary, not a legal replay audit, a material-value fit, or an Elo estimate.',
    ] };
}

function renderReview(review) {
  const lines = ['# Version-17 follow-up review', '', ...review.notes.map(note => `- ${note}`), ''];
  for (const section of review.sections) {
    lines.push(`## ${md(section.title)}`, '', '| Candidate / bundle | Original eight | New eight | All sixteen | Pooled target | Matchup flags (all sixteen) |',
      '| --- | ---: | ---: | ---: | --- | --- |');
    const combined = section.cohorts.find(cohort => cohort.id === 'combined-sixteen');
    for (const row of [...combined.pooled].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) {
      const original = section.cohorts.find(cohort => cohort.id === 'original-eight')?.pooled.find(item => item.key === row.key);
      const fresh = section.cohorts.find(cohort => cohort.id === 'new-eight')?.pooled.find(item => item.key === row.key);
      lines.push(`| ${md(row.label)} | ${pct(original?.score ?? null)} | ${pct(fresh?.score ?? null)} | ${pct(row.score)} | ${row.decision} | ${row.matchupFlags.length ? row.matchupFlags.map(item => `${md(item.opponent)} ${pct(item.score)}`).join('; ') : '—'} |`);
    }
    lines.push('');
    for (const cohort of section.cohorts) {
      // Retain full per-reference W/D/L and partial-pair coverage for each
      // cohort rather than letting a pooled target hide a bad matchup.
      lines.push(renderV17Report(cohort.report).replace(/^# /, '### '), '');
    }
  }
  return lines.join('\n');
}

function atomicWrite(directory, name, bytes) {
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, path.join(directory, name));
    try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    unlinkWithRetrySync(temporary);
  }
}

function writeReview(directory, review) {
  const root = path.resolve(directory), allowed = new Set([...Object.values(FILES), '.v17-review.lock']);
  if (fs.existsSync(root) && fs.readdirSync(root).some(name => !allowed.has(name))) throw new Error('Review output needs a new empty directory or an existing owned review.');
  fs.mkdirSync(root, { recursive: true });
  const unlock = acquireLock(root, FORMAT, '.v17-review.lock');
  try {
    if (fs.readdirSync(root).some(name => !allowed.has(name))) throw new Error('Review output contains a foreign file.');
    const jsonFile = path.join(root, FILES.json), markdownFile = path.join(root, FILES.markdown);
    if (fs.existsSync(jsonFile)) {
      const previous = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      if (previous.format !== FORMAT || previous.schemaVersion !== 1 || !previous.ownership || !Object.keys(previous.ownership).length
        || Object.entries(previous.ownership).some(([name, owner]) => !isDeepStrictEqual(owner, review.ownership[name]))) throw new Error('Refusing to replace a review belonging to another source run.');
    } else if (fs.existsSync(markdownFile)) throw new Error('Refusing to replace an unowned review file.');
    atomicWrite(root, FILES.json, JSON.stringify(review, null, 2) + '\n');
    atomicWrite(root, FILES.markdown, renderReview(review));
    return { json: jsonFile, markdown: markdownFile };
  } finally { unlock(); }
}

function main(args = process.argv.slice(2), { read = readReportInput, loadArchive, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const inputs = Object.fromEntries(Object.entries(INPUTS).filter(([name]) => options[name])
    .map(([name, experiment]) => [name, checkedInput(options[name], experiment, read)]));
  const review = createReview(inputs, { loadArchive });
  const files = writeReview(options.out, review);
  log(`Follow-up review: ${files.markdown}\nJSON: ${files.json}\nNo games started; source journals remain unchanged.`);
  return { review, files };
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`Version-17 review: ${error.message}`); process.exitCode = 1; }
}
module.exports = { parseArgs, pooledRows, createReview, renderReview, writeReview, checkedInput, main };
