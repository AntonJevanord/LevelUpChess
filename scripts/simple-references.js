#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createSimplePlan } = require('./balance/simple-plan');
const { runSimpleStudy, printEstimate } = require('./balance/simple-run');
const { checkSimpleCollection, readSimpleManifest } = require('./balance/simple-collection-run');
const { writeSimpleReport } = require('./balance/simple-report');
const { installControls, selectedEnginePath } = require('./material-collect');

const HELP = `LevelUp simple references: 3,072 new games, four jobs

  npm run material:simple -- --check
  npm run material:simple -- --out DIRECTORY [--jobs 4]
  npm run material:simple -- --resume DIRECTORY
  npm run material:simple -- --report DIRECTORY

Tests rank bishop BsR, queen-movement rook RB, forward-diagonal rook RfB and
short-diagonal rook RB2 against the unchanged Amazon QN and Camel knight NC.
128 inherited positions: 2,048 head-to-head games plus 1,024 ordinary-army games.
Reuses the pinned 2,688-game reference panel without replaying it. Use a NEW
results folder; parent raw files are copied there and checked. No book argument.

RB uses the ordinary queen's native MG/EG values, 2538/2682; other types retain
automatic values. All three rook candidates keep castling. Skill 20, 20,000
nodes per move, one thread, 32 MB hash, 400 plies and four jobs are fixed.
Checkpoints at 768/1,536/3,072 NEW games print ordinary P/N/B/R/Q estimates,
the queen-minus-rook gap, upgrade bonuses and head-to-head results. P=1/Q=9 are
analysis assumptions. No automatic expansion beyond the declared schedule.
q / Ctrl+C stops now; g finishes active games; p finishes active pairs.
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
        const report = await (services.writeSimpleReport || writeSimpleReport)(path.resolve(options.report), { onProgress: log, signal: controller.signal });
        if (report.report) printEstimate(report.report, { roster: report.report.roster || [] }, log);
        log(`Simple-reference report: ${report.files.markdown}`);
        return report;
      } catch (error) {
        if (!controller.signal.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
        log('Report stopped; the previous report and recorded games are preserved.');
        return { stopped: true };
      }
    }
    const enginePath = services.enginePath || selectedEnginePath();
    const plan = options.resume
      ? (services.readSimpleManifest || readSimpleManifest)(path.resolve(options.resume)).plan
      : await (services.createSimplePlan || createSimplePlan)();
    if (plan?.id !== 'simple-references-v16-001') throw new Error('This is not the declared simple-reference study.');
    log(`Simple references: ${plan.openings.length} inherited positions; ${plan.schedule.length} NEW games; ${plan.parent.scheduledGames} parent records retained; four jobs.`);
    if (options.check) {
      const result = await (services.checkSimpleCollection || checkSimpleCollection)({ plan, enginePath, signal: controller.signal });
      log(`Preflight passed for ${result.startingPositions} starting positions; parent compatibility passed; no searches or games started.`);
      return { checked: true, plan, ...result };
    }
    log('q / Ctrl+C: stop now; g: after active games; p: after active units/pairs.');
    return await (services.runSimpleStudy || runSimpleStudy)({ plan, outDir: path.resolve(options.out || options.resume),
      enginePath, resume: Boolean(options.resume), signal: controller.signal,
      shouldStop: controls.shouldStop, onProgress: log });
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Simple-reference study failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
