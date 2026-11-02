#!/usr/bin/env node
'use strict';

// This opt-in command does not alter or extend the running five-stage campaign.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadExperiment, createReport, renderReport } = require('./balance/v17-level2-bridge');
const { checkExperiment, resolveEngine, validateManifest, writePreflight, readReportInput } = require('./version17-balance');
const { main: parallelMain } = require('./parallel-balance');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');
const { renderV17Csv } = require('./balance/v17-report');

const ROOT = path.resolve(__dirname, '..');
const HELP = `Selected level-two references: separate direct and cross-tier panels

  npm run balance:level2 -- --check [--rules-only] [--engine PATH]
  npm run balance:level2 -- --out DIRECTORY [--jobs 4] [--engine PATH]
  npm run balance:level2 -- --resume DIRECTORY [--engine PATH]
  npm run balance:level2 -- --report DIRECTORY

384 games on sixteen fresh fixed two-ply cases: 96 two-point singles and
288 six-point games (three L2 purchases versus two non-Amazon L3 references).
No games from the current 6752-game campaign are repeated or appended.
Finish the current campaign before launching this separate experiment.

Twenty thousand nodes/move, one thread, 32 MiB hash, 400 total plies.
The existing static worker protocol, fresh per-game engines and q/g/p controls
remain. --resume preserves the original jobs, settings and source identities.
--check performs preflight only; --rules-only omits native proof. --report
reads completed paired evidence offline. No material or Elo fit is produced.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const values = {}, valued = new Set(['out', 'resume', 'report', 'jobs', 'log', 'engine']);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], name = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (Object.hasOwn(values, name)) throw new Error(`Repeated argument: ${flag}.`);
    if (['check', 'rules-only'].includes(name)) { values[name] = true; continue; }
    if (!valued.has(name)) throw new Error(`Unknown argument: ${flag}. Use --help.`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    values[name] = value;
  }
  if (['check', 'out', 'resume', 'report'].filter(name => Object.hasOwn(values, name)).length !== 1) throw new Error('Choose exactly one of --check, --out, --resume or --report.');
  if (values['rules-only'] && !values.check) throw new Error('--rules-only applies only to --check.');
  if (values.engine !== undefined && (values.report || values['rules-only'])) throw new Error('--engine applies only to native validation or match runs.');
  if (values.jobs !== undefined && (!values.out || !/^(?:[1-9]|1[0-6])$/.test(values.jobs))) throw new Error('--jobs requires 1–16 on a new --out run; resume preserves workers.');
  if (values.jobs !== undefined) values.jobs = Number(values.jobs);
  if (values.log !== undefined && (!['games', 'plies'].includes(values.log) || !values.out && !values.resume)) throw new Error('--log games|plies applies only to match runs.');
  return values;
}

function atomicWrite(file, content) {
  const temporary = path.join(path.dirname(file), `.level2-report-${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx'); fs.writeFileSync(descriptor, content); fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined; renameWithRetrySync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    unlinkWithRetrySync(temporary);
  }
}

function writeReports(directory, declaration = loadExperiment()) {
  const root = path.resolve(directory), unlock = acquireLock(root, 'level2-reference-report', '.v17-report.lock');
  try {
    const { manifest, records, source } = readReportInput(root, declaration);
    const report = createReport({ declaration, manifest, records, source });
    const files = { json: path.join(root, 'v17-report.json'), markdown: path.join(root, 'v17-report.md'), csv: path.join(root, 'v17-report.csv') };
    if (fs.existsSync(files.json)) {
      const previous = JSON.parse(fs.readFileSync(files.json, 'utf8'));
      if (previous.format !== report.format || previous.experiment !== report.experiment || previous.runId !== report.runId) throw new Error('Refusing to replace reports belonging to a different run.');
    } else if ([files.markdown, files.csv].some(file => fs.existsSync(file))) throw new Error('Refusing to overwrite unowned reports.');
    for (const [file, content] of [[files.json, JSON.stringify(report, null, 2) + '\n'], [files.markdown, renderReport(report)], [files.csv, renderV17Csv(report)]]) atomicWrite(file, content);
    return { report, files };
  } finally { unlock(); }
}

async function main(args = process.argv.slice(2), { run = parallelMain, check = checkExperiment, persist = writePreflight,
  report = writeReports, log = console.log, enginePath: suppliedEngine } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const declaration = loadExperiment();
  log('Selected level-two reference validation: 384 games; separate 96-game two-point singles and 288-game six-point bridge.');
  if (options.report) {
    const result = report(options.report, declaration); log(`Separate paired panels: ${result.files.markdown}. No games started.`); return result;
  }
  if (options.resume) validateManifest(JSON.parse(fs.readFileSync(path.join(path.resolve(options.resume), 'run.json'), 'utf8')), declaration);
  const enginePath = options['rules-only'] ? undefined : options.engine ? path.resolve(options.engine) : suppliedEngine || resolveEngine();
  const controller = new AbortController(), abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  let proof;
  try {
    proof = await check(declaration, { enginePath, signal: controller.signal, onProgress: log });
    if (controller.signal.aborted) throw new Error('Level-two validation cancelled; no match games started.');
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  if (options.check) { log(options['rules-only'] ? 'Rules-only preflight passed. No games started.' : 'Native and rules preflight passed. No games started.'); return proof; }
  persist(options.resume || options.out, declaration, proof, { resume: Boolean(options.resume) });
  const parallelArgs = options.resume ? ['--resume', options.resume] : ['--config', path.join(ROOT, declaration.file), '--out', options.out, '--jobs', String(options.jobs ?? 4)];
  if (options.log) parallelArgs.push('--log', options.log);
  const comparisonNames = Object.fromEntries(declaration.metadata.comparisons.map(cell => [cell.id, { a: cell.aLabel, b: cell.bLabel }]));
  // parallelMain resolves this established environment selector. Scope the
  // explicit CLI override to this single standalone invocation and restore it.
  const previousEngine = process.env.FAIRY_STOCKFISH_PATH;
  let result;
  try {
    process.env.FAIRY_STOCKFISH_PATH = enginePath;
    result = await run(parallelArgs, { comparisonNames });
  } finally {
    if (previousEngine === undefined) delete process.env.FAIRY_STOCKFISH_PATH;
    else process.env.FAIRY_STOCKFISH_PATH = previousEngine;
  }
  const reports = report(options.resume || options.out, declaration);
  log(`Separate paired panels: ${reports.files.markdown}`);
  return { ...result, validation: proof, report: reports.report, files: reports.files };
}

if (require.main === module) main().catch(error => { console.error(`Level-two references: ${error.message}`); process.exitCode = 1; });
module.exports = { HELP, parseArgs, writeReports, main };
