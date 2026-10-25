#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createStudyPlan } = require('./balance/material-study-plan');
const { runStudy } = require('./balance/material-study-run');
const { checkCollection, readCollectionManifest } = require('./balance/material-collection-run');
const { writeStudyReport } = require('./balance/material-study-report');
const { installControls, selectedEnginePath } = require('./material-collect');

const HELP = `LevelUp material confirmation: 1,152 new games, four jobs

  npm run material:study -- --check --book PATH
  npm run material:study -- --out DIRECTORY --book PATH [--jobs 4]
  npm run material:study -- --resume DIRECTORY
  npm run material:study -- --report DIRECTORY

384 fresh book positions, each ordinary once and Amazon in both colors.
The 32 pilot positions are excluded. Skill 20, 20,000 nodes/move, one search
thread, 32 MB hash and 400 plies remain fixed. Four jobs are mandatory.
Cumulative checkpoints at 384/768/1,152 games save estimates before play resumes.
Analysis assumes P=1/Q=9 and retains an unconstrained diagnostic; engine values
are unchanged. No automatic extension after 1,152 games.
q / Ctrl+C stops now; g finishes active games; p finishes active units/pairs.
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
  if (options.jobs !== undefined && options.jobs !== '4') throw new Error('This study uses exactly four jobs.');
  if (options.jobs) options.jobs = 4;
  return options;
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args), log = services.log || console.log;
  if (options.help) { log(HELP); return { help: true }; }
  if (options.report) {
    const report = await (services.writeStudyReport || writeStudyReport)(path.resolve(options.report), { onProgress: log });
    log(`Study report: ${report.files.markdown}`);
    return report;
  }
  const enginePath = services.enginePath || selectedEnginePath(), controller = new AbortController();
  const controls = (services.installControls || installControls)(controller, { log });
  try {
    let plan;
    if (options.resume) plan = (services.readCollectionManifest || readCollectionManifest)(path.resolve(options.resume)).plan;
    else {
      const file = path.resolve(options.book);
      plan = await (services.createStudyPlan || createStudyPlan)(fs.readFileSync(file), { bookName: path.basename(file) });
    }
    if (!plan?.study) throw new Error('This is not the declared material confirmation study.');
    log(`Study: ${plan.openings.length} fresh positions, ${plan.schedule.length} games, four jobs; book SHA-256 ${plan.book.sha256}.`);
    if (options.check) {
      const result = await (services.checkCollection || checkCollection)({ plan, enginePath, signal: controller.signal });
      log(`Preflight passed for ${result.startingPositions} starting positions; no searches or games started.`);
      return { checked: true, plan, ...result };
    }
    log('q / Ctrl+C: stop now; g: after active games; p: after active units/pairs.');
    return await (services.runStudy || runStudy)({ plan, outDir: path.resolve(options.out || options.resume),
      enginePath, resume: Boolean(options.resume), signal: controller.signal,
      shouldStop: controls.shouldStop, onProgress: log });
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Material study failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
