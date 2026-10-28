#!/usr/bin/env node
'use strict';

// Reports only. Running a match is deliberately left to balance:v17 so that
// each capped stage retains the existing stop/resume and journal semantics.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { loadExperiment } = require('./balance/v17-plan');
const { readReportInput } = require('./version17-balance');
const { createV17Report } = require('./balance/v17-report');
const { acquireLock } = require('./balance/storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');
const { ROSTER_SHA256 } = require('./balance/reference-panel-plan');
const { FORMAT, INPUTS, HISTORICAL_SHA256, buildReferencePanel, renderReferencePanel, renderReferencePanelCsv } = require('./balance/reference-panel-report');

const FILES = Object.freeze({ json: 'reference-panel.json', markdown: 'reference-panel.md', csv: 'reference-panel.csv' });
const LOCK = '.reference-panel.lock';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const HELP = `Build the complete reference matchup panel without starting games.

  npm run balance:panel -- --out DIRECTORY
  npm run balance:panel -- --gap DIRECTORY --singles DIRECTORY --pairs DIRECTORY --out DIRECTORY

No run folders are required for the archived overview. Supply any finished or
active run folders to update its separate sections:
  --gap      panel-gap: 64 games for the missing three-point package cell
  --singles  panel-level1: 192 one-point reference duel games
  --pairs    panel-level1-pairs: 960 two-point reference team games

Each supplied folder requires its exact run.json, archived rules and native
preflight. Only complete journal lines and scored color pairs contribute.
Existing level-three and lower-tier evidence retains its original context;
there is no mixed-context Overall, material estimate or Elo rating.
Output must be new/empty or an owned reference-panel directory. Existing input
run ownership cannot be removed or changed when refreshing the same report.
No engines or games are started, and no source journals are modified.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], name = flag.startsWith('--') ? flag.slice(2) : '';
    if (![...Object.keys(INPUTS), 'out'].includes(name)) throw new Error(`Unknown argument: ${flag}. Use --help.`);
    if (Object.hasOwn(options, name)) throw new Error(`Repeated argument: ${flag}.`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a directory.`);
    options[name] = value;
  }
  if (!options.out) throw new Error('Supply --out DIRECTORY. Run folders are optional.');
  return options;
}

function checkedInput(directory, experiment, read = readReportInput) {
  const declaration = loadExperiment(experiment), input = read(directory, declaration);
  createV17Report({ ...declaration, records: input.records, manifest: input.manifest });
  return { ...input, declaration, recordsSha256: sha(JSON.stringify(input.records)) };
}

function atomicWrite(directory, name, content) {
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, path.join(directory, name));
    try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    unlinkWithRetrySync(temporary);
  }
}

function writePanel(directory, panel) {
  const root = path.resolve(directory), allowed = new Set([...Object.values(FILES), LOCK]);
  if (fs.existsSync(root) && fs.readdirSync(root).some(name => !allowed.has(name))) throw new Error('Reference-panel output needs a new empty directory or an existing owned panel.');
  fs.mkdirSync(root, { recursive: true });
  const unlock = acquireLock(root, FORMAT, LOCK);
  try {
    if (fs.readdirSync(root).some(name => !allowed.has(name))) throw new Error('Reference-panel output contains a foreign file.');
    const jsonFile = path.join(root, FILES.json);
    if (fs.existsSync(jsonFile)) {
      const previous = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      if (previous.format !== FORMAT || previous.schemaVersion !== 1
        || previous.rosterSha256 !== ROSTER_SHA256 || previous.historicalAuditSha256 !== HISTORICAL_SHA256
        || !previous.ownership || Object.entries(previous.ownership).some(([name, owner]) => !isDeepStrictEqual(owner, panel.ownership[name]))) {
        throw new Error('Refusing to replace a panel belonging to another roster or source run.');
      }
    } else if ([FILES.markdown, FILES.csv].some(name => fs.existsSync(path.join(root, name)))) {
      throw new Error('Refusing to replace an unowned reference-panel file.');
    }
    // Refuse arbitrary objects that could overwrite another report format.
    if (panel.format !== FORMAT || panel.schemaVersion !== 1) throw new Error('Invalid reference-panel report.');
    const saved = { ...panel, rosterSha256: ROSTER_SHA256, historicalAuditSha256: HISTORICAL_SHA256 };
    atomicWrite(root, FILES.json, JSON.stringify(saved, null, 2) + '\n');
    atomicWrite(root, FILES.markdown, renderReferencePanel(saved));
    atomicWrite(root, FILES.csv, renderReferencePanelCsv(saved));
    return Object.fromEntries(Object.entries(FILES).map(([kind, name]) => [kind, path.join(root, name)]));
  } finally { unlock(); }
}

function main(args = process.argv.slice(2), { read = readReportInput, loadArchive, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const inputs = Object.fromEntries(Object.entries(INPUTS).filter(([name]) => options[name])
    .map(([name, experiment]) => [name, checkedInput(options[name], experiment, read)]));
  const panel = buildReferencePanel(inputs, { loadArchive });
  const files = writePanel(options.out, panel);
  log(`Reference panel: ${files.markdown}\nJSON: ${files.json}\nCSV: ${files.csv}\nNo engines or games started; source journals remain unchanged.`);
  return { panel, files };
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`Reference panel: ${error.message}`); process.exitCode = 1; }
}
module.exports = { FILES, HELP, parseArgs, checkedInput, writePanel, main };
