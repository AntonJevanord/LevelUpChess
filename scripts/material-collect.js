#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCollectionPlan } = require('./balance/material-collection-plan');
const { runCollection, checkCollection, readCollectionManifest } = require('./balance/material-collection-run');
const { writeCollectionReport } = require('./balance/material-collection-report');

const HELP = `LevelUp material data: capped 96-game pilot

  npm run material:collect -- --check --book PATH
  npm run material:collect -- --out DIRECTORY --book PATH [--jobs 3]
  npm run material:collect -- --resume DIRECTORY
  npm run material:collect -- --report DIRECTORY

Selects 32 full-army book positions. Each supplies one ordinary game and an
Amazon-versus-queen game with each upgrade color: 96 games maximum. Skill 20,
20,000 nodes/move, one search thread, 32 MB/hash and 400 plies are frozen.
--check validates book/rules/native movement and value tables without games.
Resume uses the saved book-position snapshot and original engine/rules/sources.
q / Ctrl+C stops now; g finishes active games; p finishes active units/pairs.
Starts and results print during collection; there is no automatic larger batch.
--report is offline and never launches a native engine.
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
  if ((options.resume || options.report) && (options.book || options.jobs)) throw new Error('Resume/report use the saved plan; do not supply --book or --jobs.');
  if (options.check && options.jobs) throw new Error('--jobs applies only to a new collection.');
  if (options.jobs !== undefined) {
    if (!/^(?:[1-9]|1[0-6])$/.test(options.jobs)) throw new Error('--jobs must be an integer from 1 to 16.');
    options.jobs = Number(options.jobs);
  }
  return options;
}

function selectedEnginePath() {
  if (process.platform !== 'win32' && !process.env.FAIRY_STOCKFISH_PATH) throw new Error('Set FAIRY_STOCKFISH_PATH to a compatible native LevelUp engine on Linux/macOS.');
  return path.resolve(process.env.FAIRY_STOCKFISH_PATH || path.join(__dirname, '../stockfish/fairy-stockfish-levelup_x86-64.exe'));
}

function installControls(controller, { input = process.stdin, events = process, log = console.log } = {}) {
  let stop = null;
  // A fresh terminal has readableFlowing=null but isPaused()=false. Remember
  // actual consumption so the read started here cannot keep the CLI alive.
  const previousRaw = Boolean(input.isRaw), wasFlowing = input.readableFlowing === true;
  const request = action => {
    if (stop === 'now') return;
    stop = action;
    if (action === 'now') { log('Stopping now; saving active histories.'); controller.abort(); }
    else log(action === 'game' ? 'Stopping after active games.' : 'Stopping after active units/pairs.');
  };
  const onData = chunk => {
    for (const key of String(chunk).toLowerCase()) {
      if (key === 'q' || key === '\u0003') request('now');
      else if (key === 'g') request('game');
      else if (key === 'p') request('pair');
    }
  };
  const onSignal = () => request('now');
  events.on('SIGINT', onSignal);
  if (input.isTTY) {
    input.setRawMode?.(true);
    input.on('data', onData);
    input.resume?.();
  }
  return {
    shouldStop: () => stop,
    close() {
      events.removeListener('SIGINT', onSignal);
      if (input.isTTY) {
        input.removeListener('data', onData);
        input.setRawMode?.(previousRaw);
        if (!wasFlowing) input.pause?.();
      }
    },
  };
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args), log = services.log || console.log;
  if (options.help) { log(HELP); return { help: true }; }
  if (options.report) {
    const result = await (services.writeCollectionReport || writeCollectionReport)(path.resolve(options.report));
    log(`Offline collection report: ${result.files.markdown}`);
    return result;
  }
  const enginePath = services.enginePath || selectedEnginePath();
  const controller = new AbortController();
  const controls = (services.installControls || installControls)(controller, { log });
  try {
    let plan;
    if (options.resume) {
      const manifest = (services.readCollectionManifest || readCollectionManifest)(path.resolve(options.resume));
      plan = manifest.plan;
      if (!plan) throw new Error('Collection manifest is missing its frozen plan.');
    } else {
      const file = path.resolve(options.book), bytes = fs.readFileSync(file);
      plan = await (services.createCollectionPlan || createCollectionPlan)(bytes, { bookName: path.basename(file) });
    }
    log(`Plan: ${plan.openings.length} book positions, ${plan.schedule.length} games; book SHA-256 ${plan.book.sha256}.`);
    if (options.check) {
      const result = await (services.checkCollection || checkCollection)({ plan, enginePath, signal: controller.signal, onProgress: log });
      log('Collection preflight passed; no games played and no run directory created.');
      return { checked: true, plan, ...result };
    }
    const outDir = path.resolve(options.out || options.resume);
    log('q / Ctrl+C: stop now; g: after active games; p: after active units/pairs.');
    const result = await (services.runCollection || runCollection)({ plan, outDir, enginePath,
      jobs: options.jobs ?? (options.resume ? undefined : 3), resume: Boolean(options.resume),
      signal: controller.signal, shouldStop: controls.shouldStop, onProgress: log });
    // A fully validated collection always has a manifest. Early cancellation
    // during preflight can return without creating evidence to report.
    if (fs.existsSync(path.join(outDir, 'collection.json'))) {
      const report = await (services.writeCollectionReport || writeCollectionReport)(outDir);
      log(`Collection report: ${report.files.markdown}`);
      return { ...result, report };
    }
    return result;
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Material collection failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, selectedEnginePath, installControls, main };
