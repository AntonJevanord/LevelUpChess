#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getCampaign, verifyCampaignManifest, writeAlternativesReport } = require('./balance/alternatives-report');

const HELP = `Alternative level-3 purchases against the fixed Amazon: 1120 scheduled games (1200-game cap)

  npm run balance:alternatives -- --check
  npm run balance:alternatives -- --out DIRECTORY [--jobs 2] [--log games|plies]
  npm run balance:alternatives -- --resume DIRECTORY [--log games|plies]
  npm run balance:alternatives -- --report DIRECTORY

Twelve alternatives and two controls, 40 color-swapped opening pairs each.
Start with two game workers; each engine retains one thread and 100000 nodes.
q / Ctrl+C stops now; g finishes active games; p finishes active color pairs.
The 40%–60% points band is a design target, not proof of balance. No automatic
second stage is scheduled. --check validates all armies/openings without games.
On Linux/macOS set FAIRY_STOCKFISH_PATH to a compatible native executable.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.length === 1 && args[0] === '--check') return { check: true };
  const options = {}, allowed = new Set(['out', 'resume', 'report', 'jobs', 'log']);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    const value = args[index + 1];
    if (!allowed.has(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('Invalid alternatives campaign arguments. Use --help.');
    options[key] = value;
  }
  const modes = ['out', 'resume', 'report'].filter(key => options[key]);
  if (modes.length !== 1) throw new Error('Select --check, --out, --resume, or --report.');
  if (options.jobs !== undefined) {
    if (!options.out || !/^(?:[1-9]|1[0-6])$/.test(options.jobs)) throw new Error('--jobs 1–16 applies only to a new run; worker count is frozen on resume.');
    options.jobs = Number(options.jobs);
  }
  if (options.log !== undefined && (!['games', 'plies'].includes(options.log) || options.report)) throw new Error('--log games|plies applies only to new or resumed runs.');
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log(HELP); return; }
  const { config, schedule, configFile } = getCampaign();
  if (options.report) {
    const result = writeAlternativesReport(options.report);
    console.log(`${result.report.complete ? 'Fully scored' : result.report.finished ? 'Finished with unscored games' : 'Incomplete'} Amazon alternatives campaign; scores use complete color pairs.`);
    for (const row of result.report.candidates) console.log(`${row.label}: ${row.score === null ? 'unscored' : (row.score * 100).toFixed(1) + '%'}; ${row.completePairs}/${row.plannedPairs} pairs; ${row.assessment}.`);
    console.log(`Report: ${result.files.markdown}\nScores: ${result.files.csv}`);
    return result;
  }
  if (options.check) {
    const root = path.resolve(__dirname, '..');
    if (process.platform !== 'win32' && !process.env.FAIRY_STOCKFISH_PATH) throw new Error('Set FAIRY_STOCKFISH_PATH to a compatible native engine on Linux/macOS.');
    const enginePath = path.resolve(process.env.FAIRY_STOCKFISH_PATH || path.join(root, 'stockfish/fairy-stockfish-levelup_x86-64.exe'));
    const controller = new AbortController(), abort = () => controller.abort();
    process.on('SIGINT', abort); process.on('SIGTERM', abort);
    try {
      const result = await require('./balance/validate-designs').validateDesignConfig(config, { enginePath, signal: controller.signal, standardOpeningSources: true, onProgress: console.log });
      console.log(`Checked ${result.games} scheduled games, ${result.definitions} definitions, ${result.movementChecks} movement checks and ${result.nativePositionChecks} exact native positions. No games played.`);
      return result;
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  }
  const logging = options.log ? ['--log', options.log] : [];
  if (options.resume) {
    const manifest = JSON.parse(fs.readFileSync(path.join(path.resolve(options.resume), 'run.json'), 'utf8'));
    verifyCampaignManifest(manifest);
    return require(manifest.parallel ? './parallel-balance' : './balance').main(['--resume', options.resume, ...logging]);
  }
  if (schedule.length !== 1120) throw new Error('The declared campaign exceeds its fixed budget.');
  return require('./parallel-balance').main(['--config', configFile, '--out', options.out, '--jobs', String(options.jobs ?? 2), ...logging]);
}

if (require.main === module) main().catch(error => { console.error(`Amazon alternatives campaign: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
