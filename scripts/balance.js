#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('./balance/plan');
const { summarize } = require('./balance/stats');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./balance/files');

const HELP = `Paired Fairy Stockfish balance experiments

  npm run balance -- --config FILE --out DIRECTORY [--comparisons ID,ID] [--limit-pairs N] [--log games|plies]
  npm run balance -- --resume DIRECTORY [--log games|plies]
  npm run balance -- --status DIRECTORY
  npm run balance -- --stop-now DIRECTORY
  npm run balance -- --stop-after-game DIRECTORY
  npm run balance -- --stop-after-pair DIRECTORY

During a run: q / Ctrl+C stops now; g finishes the game; p finishes the pair.
--comparisons selects complete comparison pairs for a new run, before --limit-pairs.
The full configuration and its design letter allocation remain unchanged.
Game starts and results are printed by default; --log plies adds move progress.
On Linux/macOS, set FAIRY_STOCKFISH_PATH to a compatible native executable.
See BALANCE.md for configuration, results, and interpretation.
`;

function parseArgs(args) {
  const allowed = new Set(['config', 'out', 'comparisons', 'limit-pairs', 'resume', 'status', 'stop-now', 'stop-after-game', 'stop-after-pair', 'log']);
  const values = {};
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const name = flag.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${flag}. Use --help.`);
    if (Object.hasOwn(values, name)) throw new Error(`Repeated argument: ${flag}.`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    values[name] = value;
  }
  const modes = ['config', 'resume', 'status', 'stop-now', 'stop-after-game', 'stop-after-pair'].filter(name => Object.hasOwn(values, name));
  if (modes.length !== 1) throw new Error('Select exactly one of --config, --resume, --status, or a stop command.');
  if ((values.out || values['limit-pairs'] || values.comparisons !== undefined) && modes[0] !== 'config') throw new Error('--out, --limit-pairs, and --comparisons apply only to a new --config run.');
  if (values.log !== undefined && (!['games', 'plies'].includes(values.log) || !['config', 'resume'].includes(modes[0]))) throw new Error('--log games|plies applies only to new or resumed runs.');
  if (values.comparisons !== undefined) values.comparisons = comparisonIds(values.comparisons.split(',').map(id => id.trim()));
  if (values['limit-pairs'] !== undefined) {
    if (!/^[1-9]\d*$/.test(values['limit-pairs']) || !Number.isSafeInteger(Number(values['limit-pairs']))) {
      throw new Error('--limit-pairs must be a positive integer.');
    }
    values['limit-pairs'] = Number(values['limit-pairs']);
  }
  return values;
}

function shouldPrintProgress(message, level = 'games') {
  if (!['games', 'plies'].includes(level)) throw new Error('Choose --log games or --log plies.');
  const ply = message.match(/^Game .*: ply (\d+),/);
  return !ply || level === 'plies' && Number(ply[1]) % 10 === 0;
}

function comparisonIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id))) {
    throw new Error('--comparisons requires a comma-separated list of nonempty comparison IDs.');
  }
  if (new Set(ids).size !== ids.length) throw new Error('--comparisons must not repeat an ID.');
  return ids;
}

/** Filter a schedule, retaining its paired order and the full declared config. */
function selectComparisons(config, schedule, ids) {
  if (ids === undefined) return schedule;
  const selected = new Set(comparisonIds(ids));
  const declared = new Set(config.comparisons.map(comparison => comparison.id));
  for (const id of selected) if (!declared.has(id)) throw new Error(`Unknown comparison ID: ${id}.`);
  return schedule.filter(game => selected.has(game.comparisonId));
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; if (error.code === 'EPERM') return true; throw error; }
}

function requestStop(directory, action) {
  const outDir = path.resolve(directory);
  let owner;
  try { owner = readJson(path.join(outDir, 'run.lock')); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('This run is not active. Use --resume to continue it.'); throw error; }
  if (!Number.isInteger(owner.pid) || owner.pid < 1 || typeof owner.token !== 'string' || !processExists(owner.pid)) {
    throw new Error('This run has no live owner. Use --resume to continue it.');
  }
  const request = { action, runId: owner.runId, token: owner.token, requestedAt: new Date().toISOString() };
  const temporary = path.join(outDir, `.control-${randomUUID()}.tmp`);
  let failure;
  try {
    fs.writeFileSync(temporary, JSON.stringify(request) + '\n', { flag: 'wx' });
    renameWithRetrySync(temporary, path.join(outDir, 'control.json'));
  } catch (error) { failure = error; throw error; }
  finally {
    try { unlinkWithRetrySync(temporary); }
    catch (error) { if (failure) failure.cleanupError = error; else throw error; }
  }
  console.log(`Stop requested (${action}). The runner will save its progress.`);
}

function readJournal(directory) {
  let text;
  try { text = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  // A writer may be partway through its last append; status never repairs files.
  return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function showStatus(directory) {
  const outDir = path.resolve(directory);
  const manifest = readJson(path.join(outDir, 'run.json'));
  let checkpoint = null, owner = null;
  try { checkpoint = readJson(path.join(outDir, 'checkpoint.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { owner = readJson(path.join(outDir, 'run.lock')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const summary = summarize(readJournal(outDir));
  console.log(`${manifest.config.name}\n${outDir}`);
  console.log(owner && processExists(owner.pid) ? `Running (process ${owner.pid}).` : 'Stopped.');
  console.log(`Attempts: ${summary.totalAttempts}; scheduled games: ${manifest.schedule.length}.`);
  if (checkpoint?.current) console.log(`Saved current game: ${checkpoint.current.id}; ${checkpoint.current.moves?.length || 0} plies.`);
  printSummary(summary);
}

function printSummary(summary) {
  for (const comparison of summary.comparisons) {
    const estimate = comparison.primaryEstimate;
    const score = estimate.score === null ? 'unavailable' : `${(estimate.score * 100).toFixed(1)}%`;
    console.log(`${comparison.comparisonId}: A score ${score}; ${comparison.paired.completePairs} complete pairs, ${estimate.uniqueOpenings} openings; ${comparison.statusCounts.truncated} truncated, ${comparison.statusCounts.error} errors.`);
  }
}

function installControls(outDir, controller) {
  let stop = null;
  const immediate = () => controller.abort();
  const setStop = action => {
    if (action === 'now') { console.log('Stopping now; saving the current game.'); immediate(); }
    else {
      stop = action;
      console.log(`Will stop after the current ${action}.`);
    }
  };
  const poll = () => {
    const control = path.join(outDir, 'control.json');
    try {
      const request = readJson(control);
      const owner = readJson(path.join(outDir, 'run.lock'));
      if (owner.pid !== process.pid) return;
      fs.unlinkSync(control);
      if (request.token === owner.token && request.runId === owner.runId && ['now', 'game', 'pair'].includes(request.action)) setStop(request.action);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(`Could not read stop request: ${error.message}`);
    }
  };
  const interval = setInterval(poll, 250);
  interval.unref();
  process.on('SIGINT', immediate);
  process.on('SIGTERM', immediate);
  const stdin = process.stdin;
  const interactive = Boolean(stdin.isTTY && stdin.setRawMode);
  const wasRaw = stdin.isRaw;
  const onKey = input => {
    for (const key of input.toString()) {
      if (key === '\u0003' || key.toLowerCase() === 'q') setStop('now');
      else if (key.toLowerCase() === 'g') setStop('game');
      else if (key.toLowerCase() === 'p') setStop('pair');
    }
  };
  if (interactive) { stdin.setRawMode(true); stdin.resume(); stdin.on('data', onKey); }
  return {
    shouldStop: () => stop,
    close() {
      clearInterval(interval);
      process.removeListener('SIGINT', immediate);
      process.removeListener('SIGTERM', immediate);
      if (interactive) { stdin.removeListener('data', onKey); stdin.setRawMode(Boolean(wasRaw)); stdin.pause(); }
    },
  };
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log(HELP); return; }
  for (const [flag, action] of [['stop-now', 'now'], ['stop-after-game', 'game'], ['stop-after-pair', 'pair']]) {
    if (options[flag]) { requestStop(options[flag], action); return; }
  }
  if (options.status) { showStatus(options.status); return; }
  const root = path.resolve(__dirname, '..');
  let config, schedule, outDir;
  const resume = Boolean(options.resume);
  if (resume) {
    outDir = path.resolve(options.resume);
    const manifest = readJson(path.join(outDir, 'run.json'));
    if (manifest.parallel) throw new Error('This is a parallel run. Use npm.cmd run balance:parallel -- --resume DIRECTORY to resume its workers.');
    config = normalizeConfig(manifest.config);
    schedule = manifest.schedule;
    if (!Array.isArray(schedule) || !schedule.length) throw new Error('The run manifest has no schedule.');
  } else {
    config = normalizeConfig(readJson(path.resolve(options.config)));
    schedule = selectComparisons(config, makeSchedule(config), options.comparisons);
    if (options['limit-pairs']) schedule = schedule.slice(0, options['limit-pairs'] * 2);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    outDir = path.resolve(options.out || path.join('balance-results', `run-${stamp}`));
  }
  const enginePath = path.resolve(process.env.FAIRY_STOCKFISH_PATH || path.join(root, 'stockfish/fairy-stockfish-levelup_x86-64.exe'));
  if (process.platform !== 'win32' && !process.env.FAIRY_STOCKFISH_PATH) {
    throw new Error('Set FAIRY_STOCKFISH_PATH to a compatible native engine on Linux/macOS. See BALANCE.md.');
  }
  if (!fs.existsSync(path.join(root, 'dist/balance-rules.cjs'))) throw new Error('Missing rules bundle. Run npm run build first.');
  const { runMatches } = require('./balance/run');
  const controller = new AbortController();
  const controls = installControls(outDir, controller);
  console.log(`${resume ? 'Resuming' : 'Starting'} ${schedule.length} scheduled games in ${outDir}`);
  console.log('q / Ctrl+C: stop now; g: after game; p: after pair.');
  try {
    const result = await runMatches({ config, schedule, outDir, resume, enginePath, signal: controller.signal, shouldStop: controls.shouldStop, onProgress: message => {
      if (shouldPrintProgress(message, options.log)) console.log(message);
    } });
    printSummary(result.summary);
    if (result.stopped && !fs.existsSync(path.join(outDir, 'run.json'))) console.log('Stopped during preflight. No games started; repeat the original command to retry.');
    else console.log(`${result.stopped ? 'Stopped with progress saved.' : 'Run finished.'} Results: ${outDir}`);
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Balance run failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, selectComparisons, requestStop, showStatus, main, shouldPrintProgress };
