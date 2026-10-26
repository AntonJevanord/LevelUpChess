#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createBishopPlan } = require('./balance/bishop-plan');
const { runBishopStudy, printEstimate } = require('./balance/bishop-run');
const { checkBishopCollection, readBishopManifest } = require('./balance/bishop-collection-run');
const { writeBishopReport } = require('./balance/bishop-report');
const { installControls, selectedEnginePath } = require('./material-collect');

const HELP = `LevelUp bishop references: 1,280 new games, four jobs

  npm run material:bishops -- --check
  npm run material:bishops -- --out DIRECTORY [--jobs 4]
  npm run material:bishops -- --resume DIRECTORY
  npm run material:bishops -- --report DIRECTORY

Tests five bishops against RfB: original horizontal BsR2sN, short-side BsWsN,
forward-jump BsR2fsN, quiet-hopping rank BsRgmsR and through-rank BsRgmsR0.
128 inherited positions, both colors: 1,280 new head-to-head games.
Reuses 5,760 original-panel and simple-study records without replaying games.
Use a NEW results folder; raw source snapshots are copied and checked.
No book download, repeated ordinary-army baseline or repeated reference match.
The simple source is a derived replay snapshot; its original collection manifest
was not supplied. The report keeps that historical provenance limit explicit.

RB uses the ordinary queen's native MG/EG values, 2538/2682; other types retain
automatic values. RfB keeps castling. Skill 20, 20,000
nodes per move, one thread, 32 MB hash, 400 plies and four jobs are fixed.
Checkpoints at 320/640/1,280 NEW games print ordinary P/N/B/R/Q estimates,
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
        const report = await (services.writeBishopReport || writeBishopReport)(path.resolve(options.report), { onProgress: log, signal: controller.signal });
        if (report.report) printEstimate(report.report, { roster: report.report.roster || [] }, log);
        log(`Bishop-reference report: ${report.files.markdown}`);
        return report;
      } catch (error) {
        if (!controller.signal.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
        log('Report stopped; the previous report and recorded games are preserved.');
        return { stopped: true };
      }
    }
    const enginePath = services.enginePath || selectedEnginePath();
    const plan = options.resume
      ? (services.readBishopManifest || readBishopManifest)(path.resolve(options.resume)).plan
      : await (services.createBishopPlan || createBishopPlan)();
    if (plan?.id !== 'bishop-references-v16-001') throw new Error('This is not the declared bishop-reference study.');
    log(`Bishop references: ${plan.openings.length} inherited positions; ${plan.schedule.length} NEW games; 5760 existing records retained; four jobs.`);
    if (options.check) {
      const result = await (services.checkBishopCollection || checkBishopCollection)({ plan, enginePath, signal: controller.signal });
      log(`Preflight passed for ${result.startingPositions} starting positions; parent compatibility passed; no searches or games started.`);
      return { checked: true, plan, ...result };
    }
    log('q / Ctrl+C: stop now; g: after active games; p: after active units/pairs.');
    return await (services.runBishopStudy || runBishopStudy)({ plan, outDir: path.resolve(options.out || options.resume),
      enginePath, resume: Boolean(options.resume), signal: controller.signal,
      shouldStop: controls.shouldStop, onProgress: log });
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Bishop-reference study failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
