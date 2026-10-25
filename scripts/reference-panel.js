#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createReferencePlan } = require('./balance/reference-plan');
const { runReferenceStudy } = require('./balance/reference-run');
const { checkReferenceCollection, readReferenceManifest } = require('./balance/reference-collection-run');
const { writeReferenceReport } = require('./balance/reference-report');
const { installControls, selectedEnginePath } = require('./material-collect');

const HELP = `LevelUp four-reference comparison: 2,688 games, four jobs

  npm run material:references -- --check --book PATH
  npm run material:references -- --out DIRECTORY --book PATH [--jobs 4]
  npm run material:references -- --resume DIRECTORY
  npm run material:references -- --report DIRECTORY

128 fresh matched positions, 21 games each: ordinary, four single upgrades in
both colors and all six head-to-head pairings in both colors. The Horizontal
bishop, Knight-capture rook, Camel knight and Amazon remain unchanged.
Prior pilot/study positions are excluded. Skill 20, 20,000 nodes per move,
one search thread, 32 MB hash and 400 plies are fixed. Exactly four jobs.
Cumulative reports at 672/1,344/2,688 games compare baseline, head-to-head
and combined material estimates; grouped holdouts check predictions.
Analysis assumes P=1/Q=9 with unconstrained diagnostics. Native values stay
automatic. No extension beyond the 2,688-game schedule.
q / Ctrl+C stops now; g finishes active games; p finishes active units/pairs.
Immediate stop saves histories; --report refreshes estimates afterward.
--check starts no games; --report works offline without an engine or Python.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--check', '--book', '--out', '--jobs', '--resume', '--report'].includes(flag)) throw new Error(`Unknown option ${flag}. Use --help.`);
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`Repeated option ${flag}.`);
    if (key === 'check') { options.check = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    options[key] = value;
  }
  if (['check', 'out', 'resume', 'report'].filter(key => options[key]).length !== 1) throw new Error('Choose --check, --out, --resume or --report.');
  if ((options.check || options.out) && !options.book) throw new Error('--check and --out require --book PATH.');
  if ((options.resume || options.report) && (options.book || options.jobs)) throw new Error('Resume/report use the saved study; do not supply --book or --jobs.');
  if (options.check && options.jobs) throw new Error('--jobs applies only to a new study.');
  if (options.jobs !== undefined && options.jobs !== '4') throw new Error('This comparison uses exactly four jobs.');
  if (options.jobs) options.jobs = 4;
  return options;
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args), log = services.log || console.log;
  if (options.help) { log(HELP); return { help: true }; }
  if (options.report) {
    const controller = new AbortController();
    const controls = (services.installControls || installControls)(controller, { log });
    try {
      const report = await (services.writeReferenceReport || writeReferenceReport)(path.resolve(options.report), { onProgress: log, signal: controller.signal });
      log(`Reference report: ${report.files.markdown}`);
      return report;
    } catch (error) {
      if (!controller.signal.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
      log('Report stopped; the previous report and recorded games are preserved.');
      return { stopped: true };
    } finally { controls.close(); }
  }
  const enginePath = services.enginePath || selectedEnginePath(), controller = new AbortController();
  const controls = (services.installControls || installControls)(controller, { log });
  try {
    let plan;
    if (options.resume) plan = (services.readReferenceManifest || readReferenceManifest)(path.resolve(options.resume)).plan;
    else {
      const file = path.resolve(options.book);
      plan = await (services.createReferencePlan || createReferencePlan)(fs.readFileSync(file), { bookName: path.basename(file) });
    }
    if (plan?.id !== 'reference-panel-v16-001') throw new Error('This is not the declared four-reference comparison.');
    log(`References: ${plan.openings.length} fresh positions, ${plan.schedule.length} games, four jobs; book SHA-256 ${plan.book.sha256}.`);
    if (options.check) {
      const result = await (services.checkReferenceCollection || checkReferenceCollection)({ plan, enginePath, signal: controller.signal });
      log(`Preflight passed for ${result.startingPositions} starting positions; no searches or games started.`);
      return { checked: true, plan, ...result };
    }
    log('q / Ctrl+C: stop now; g: after active games; p: after active units/pairs.');
    return await (services.runReferenceStudy || runReferenceStudy)({ plan, outDir: path.resolve(options.out || options.resume),
      enginePath, resume: Boolean(options.resume), signal: controller.signal,
      shouldStop: controls.shouldStop, onProgress: log });
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Reference comparison failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
