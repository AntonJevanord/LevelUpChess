#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeConfig, makeSchedule } = require('./balance/plan');
const { runParallel, readParallelStatus } = require('./balance/parallel');
const { requestStop } = require('./balance');
const { unlinkWithRetrySync } = require('./balance/files');

const HELP = `Independent games in parallel; each engine keeps one search thread

  npm run balance:parallel -- --config FILE --out DIRECTORY [--jobs 2] [--log games|plies]
  npm run balance:parallel -- --resume DIRECTORY [--log games|plies]
  npm run balance:parallel -- --status DIRECTORY
  npm run balance:parallel -- --stop-now DIRECTORY
  npm run balance:parallel -- --stop-after-game DIRECTORY
  npm run balance:parallel -- --stop-after-pair DIRECTORY

Start with two jobs, then try four if CPU and memory allow. Games retain their
fixed node budgets; more workers do not guarantee proportional speedup.
Whole color pairs stay on one worker. The worker count is frozen on resume.
Use a NEW output directory: existing serial runs cannot migrate to parallel.
During a run: q / Ctrl+C stops all workers now; g finishes each active game;
p finishes each active pair. Game starts/results are the default output;
--log plies adds move progress. --status reads the parent aggregate only.
On Linux/macOS set FAIRY_STOCKFISH_PATH to a compatible native engine.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const allowed = new Set(['config', 'out', 'jobs', 'log', 'resume', 'status', 'stop-now', 'stop-after-game', 'stop-after-pair']);
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], name = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${flag}. Use --help.`);
    if (Object.hasOwn(values, name)) throw new Error(`Repeated argument: ${flag}.`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    values[name] = value;
  }
  const modes = ['config', 'resume', 'status', 'stop-now', 'stop-after-game', 'stop-after-pair'].filter(name => Object.hasOwn(values, name));
  if (modes.length !== 1) throw new Error('Select exactly one of --config, --resume, --status, or a stop command.');
  if ((values.out !== undefined || values.jobs !== undefined) && modes[0] !== 'config') throw new Error('--out and --jobs apply only to new runs; worker assignments are frozen on resume.');
  if (modes[0] === 'config' && !values.out) throw new Error('A new parallel run requires --out DIRECTORY.');
  if (values.log !== undefined && (!['games', 'plies'].includes(values.log) || !['config', 'resume'].includes(modes[0]))) throw new Error('--log games|plies applies only to new or resumed runs.');
  if (values.jobs !== undefined) {
    if (!/^(?:[1-9]|1[0-6])$/.test(values.jobs)) throw new Error('--jobs needs a whole number from 1 to 16.');
    values.jobs = Number(values.jobs);
  }
  return values;
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; if (error.code === 'EPERM') return true; throw error; }
}
function installControls(outDir, controller) {
  let stop = null;
  const immediate = () => controller.abort();
  const setStop = action => {
    if (action === 'now') { console.log('Stopping all workers now; saving their current games.'); immediate(); }
    else { stop = action; console.log(`Will stop after each active ${action}.`); }
  };
  const interval = setInterval(() => {
    try {
      const file = path.join(outDir, 'control.json');
      const request = readJson(file), owner = readJson(path.join(outDir, 'run.lock'));
      if (owner.pid !== process.pid) return;
      unlinkWithRetrySync(file);
      if (request.token === owner.token && request.runId === owner.runId && ['now', 'game', 'pair'].includes(request.action)) setStop(request.action);
    } catch (error) { if (error.code !== 'ENOENT') console.error(`Could not read stop request: ${error.message}`); }
  }, 250);
  interval.unref();
  process.on('SIGINT', immediate); process.on('SIGTERM', immediate);
  const stdin = process.stdin, interactive = Boolean(stdin.isTTY && stdin.setRawMode), wasRaw = stdin.isRaw;
  const onKey = input => {
    for (const key of input.toString().toLowerCase()) {
      if (key === '\u0003' || key === 'q') setStop('now');
      else if (key === 'g') setStop('game');
      else if (key === 'p') setStop('pair');
    }
  };
  if (interactive) { stdin.setRawMode(true); stdin.resume(); stdin.on('data', onKey); }
  return {
    shouldStop: () => stop,
    close() {
      clearInterval(interval); process.removeListener('SIGINT', immediate); process.removeListener('SIGTERM', immediate);
      if (interactive) { stdin.removeListener('data', onKey); stdin.setRawMode(Boolean(wasRaw)); stdin.pause(); }
    },
  };
}
function printSummary(summary) {
  for (const comparison of summary.comparisons) {
    const estimate = comparison.primaryEstimate;
    const score = estimate.score === null ? 'unavailable' : `${(estimate.score * 100).toFixed(1)}%`;
    console.log(`${comparison.comparisonId}: A score ${score}; ${comparison.paired.completePairs} complete pairs, ${estimate.uniqueOpenings} openings; ${comparison.statusCounts.truncated} truncated, ${comparison.statusCounts.error} errors.`);
  }
}
async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log(HELP); return; }
  for (const [flag, action] of [['stop-now', 'now'], ['stop-after-game', 'game'], ['stop-after-pair', 'pair']]) {
    if (options[flag]) { requestStop(options[flag], action); return; }
  }
  if (options.status) {
    const status = readParallelStatus(options.status);
    let owner;
    try { owner = readJson(path.join(status.outDir, 'run.lock')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    console.log(`${status.manifest.config.name}\n${status.outDir}`);
    console.log(owner && alive(owner.pid) ? `Running (process ${owner.pid}); ${status.state?.activeWorkers ?? '?'} active workers.` : 'Stopped.');
    console.log(`${status.finishedGames}/${status.scheduledGames} scheduled games finished; ${status.manifest.parallel.jobs} frozen workers; ${status.summary.totalAttempts} attempts.`);
    printSummary(status.summary);
    return status;
  }
  const resume = Boolean(options.resume), outDir = path.resolve(options.resume || options.out);
  const config = resume ? undefined : normalizeConfig(readJson(path.resolve(options.config)));
  const manifest = resume ? readJson(path.join(outDir, 'run.json')) : null;
  if (resume && !manifest.parallel) throw new Error('This is a serial run. Use npm.cmd run balance -- --resume DIRECTORY.');
  const schedule = resume ? manifest.schedule : makeSchedule(config);
  const jobs = resume ? manifest.parallel.jobs : Math.min(options.jobs ?? 2, schedule.length / 2);
  const root = path.resolve(__dirname, '..');
  if (process.platform !== 'win32' && !process.env.FAIRY_STOCKFISH_PATH) throw new Error('Set FAIRY_STOCKFISH_PATH to a compatible native engine on Linux/macOS. See BALANCE.md.');
  const enginePath = path.resolve(process.env.FAIRY_STOCKFISH_PATH || path.join(root, 'stockfish/fairy-stockfish-levelup_x86-64.exe'));
  const controller = new AbortController(), controls = installControls(outDir, controller);
  console.log(`${resume ? 'Resuming' : 'Starting'} ${schedule.length} scheduled games with ${jobs} workers in ${outDir}`);
  console.log('q / Ctrl+C: stop all now; g: after active games; p: after active pairs.');
  try {
    const result = await runParallel({ config, outDir, resume, enginePath, jobs: resume ? undefined : options.jobs ?? 2,
      signal: controller.signal, shouldStop: controls.shouldStop, log: options.log, onProgress: console.log });
    printSummary(result.summary);
    console.log(`${result.stopped ? 'Stopped with worker progress saved.' : 'Run finished.'} Results: ${outDir}`);
    return result;
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Parallel balance run failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
