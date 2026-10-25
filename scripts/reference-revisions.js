#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRevisionPlan } = require('./balance/revision-plan');
const { runRevisionStudy } = require('./balance/revision-run');
const { checkRevisionCollection, readRevisionManifest } = require('./balance/revision-collection-run');
const { writeRevisionReport } = require('./balance/revision-report');
const { installControls, selectedEnginePath } = require('./material-collect');

const HELP = `LevelUp bishop/rook revisions: 4,608 new games, four jobs

  npm run material:revisions -- --check
  npm run material:revisions -- --out DIRECTORY [--jobs 4]
  npm run material:revisions -- --resume DIRECTORY
  npm run material:revisions -- --report DIRECTORY

Links the completed 2,688-game reference panel without replaying its games.
Uses the same 128 selected positions and member squares: six new candidates
each face ordinary pieces, the Camel knight and the unchanged Amazon in both
colors. Historical baseline and reference matchups are reused, not repeated.
The archived parent is copied read-only into the NEW results directory;
the original experiment files are never changed. No book argument is needed.

Skill 20, 20,000 nodes per move, one search thread, 32 MB hash, 400 plies and
four jobs are fixed. Native values stay automatic. Preflight checks the old
allocations, values, sampled legal moves and static evaluations before reuse.
Cumulative reports at 1,152/2,304/4,608 NEW games pool parent and new evidence
with shared position groups, assuming P=1/Q=9. No automatic extra games.
q / Ctrl+C stops now; g finishes active games; p finishes active units/pairs.
Immediate stop saves histories; --report refreshes estimates afterward.
--check starts no games; --report needs no engine or Python.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--check', '--out', '--jobs', '--resume', '--report'].includes(flag)) throw new Error(`Unknown option ${flag}. Use --help.`);
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`Repeated option ${flag}.`);
    if (key === 'check') { options.check = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    options[key] = value;
  }
  if (['check', 'out', 'resume', 'report'].filter(key => options[key]).length !== 1) throw new Error('Choose --check, --out, --resume or --report.');
  if ((options.check || options.resume || options.report) && options.jobs) throw new Error('--jobs applies only to a new study.');
  if (options.jobs !== undefined && options.jobs !== '4') throw new Error('This comparison uses exactly four jobs.');
  if (options.jobs) options.jobs = 4;
  return options;
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args), log = services.log || console.log;
  if (options.help) { log(HELP); return { help: true }; }
  const controller = new AbortController();
  const controls = (services.installControls || installControls)(controller, { log });
  try {
    if (options.report) {
      try {
        const report = await (services.writeRevisionReport || writeRevisionReport)(path.resolve(options.report), { onProgress: log, signal: controller.signal });
        log(`Revision report: ${report.files.markdown}`);
        return report;
      } catch (error) {
        if (!controller.signal.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
        log('Report stopped; the previous report and recorded games are preserved.');
        return { stopped: true };
      }
    }
    const enginePath = services.enginePath || selectedEnginePath();
    const plan = options.resume
      ? (services.readRevisionManifest || readRevisionManifest)(path.resolve(options.resume)).plan
      : await (services.createRevisionPlan || createRevisionPlan)();
    if (plan?.id !== 'reference-revisions-v16-001') throw new Error('This is not the declared linked bishop/rook revision study.');
    log(`Revisions: ${plan.openings.length} inherited positions; ${plan.schedule.length} NEW games; ${plan.parent.scheduledGames} parent records retained; four jobs.`);
    if (options.check) {
      const result = await (services.checkRevisionCollection || checkRevisionCollection)({ plan, enginePath, signal: controller.signal });
      log(`Preflight passed for ${result.startingPositions} starting positions; parent compatibility passed; no searches or games started.`);
      return { checked: true, plan, ...result };
    }
    log('q / Ctrl+C: stop now; g: after active games; p: after active units/pairs.');
    return await (services.runRevisionStudy || runRevisionStudy)({ plan, outDir: path.resolve(options.out || options.resume),
      enginePath, resume: Boolean(options.resume), signal: controller.signal,
      shouldStop: controls.shouldStop, onProgress: log });
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Revision study failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
