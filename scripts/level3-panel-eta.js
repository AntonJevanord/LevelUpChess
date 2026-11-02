#!/usr/bin/env node
'use strict';

// Deliberately separate from the frozen controller: no locks, writes, engine
// imports, game replay or report generation. Safe to run beside an active panel.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BUDGETS = [20000, 40000, 80000];
const TARGETS = [8, 16, 32, 64];
const FINAL = new Set(['completed', 'truncated']);
const STATUSES = new Set([...FINAL, 'aborted', 'error']);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const HELP = `Read-only runtime estimate for an existing level-three panel

  npm.cmd run balance:level3:eta -- --run DIRECTORY [--json]

Run in a second terminal while the panel continues. Reads saved stage and
worker journals; never starts engines, takes a lock or changes experiment files.
Each node budget uses its own first-attempt game timings. A full estimate stays
unavailable until every unfinished budget has timing samples. The estimate
assumes the recorded worker count and similar future game lengths/hardware.
Preflight, downtime and final material fitting are not estimated.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--json' && !options.json) options.json = true;
    else if (key === '--run' && !options.run && args[index + 1] && !args[index + 1].startsWith('--')) options.run = args[++index];
    else throw new Error(`Unknown, repeated or incomplete option: ${key}. Use --help.`);
  }
  if (!options.run) throw new Error('Specify --run DIRECTORY.');
  return options;
}

function readJson(file, optional = false) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}

async function stageManifest(file) {
  // The runner initially creates run.json directly. A live snapshot can catch
  // that very short write; retry the read only, without repairing the file.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return readJson(file, true); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      if (attempt === 2) throw new Error(`Cannot parse ${file}; if this stage is starting, retry the ETA command. No files changed.`, { cause: error });
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}

function readPanel(root) {
  const manifest = readJson(path.join(root, 'panel.json'));
  const { runId, createdAt, initialOpenings, runtimeIdentity, planSha256, ...plan } = manifest;
  if (manifest.format !== 'levelup-v17-level3-progressive-panel' || manifest.schemaVersion !== 1
    || typeof runId !== 'string' || !runId || !createdAt || !runtimeIdentity
    || !TARGETS.includes(initialOpenings) || !Number.isInteger(plan.jobs) || plan.jobs < 1 || plan.jobs > 16
    || planSha256 !== sha(plan) || !Array.isArray(plan.stages) || plan.stages.length !== 24) {
    throw new Error('Not a valid saved level-three panel manifest.');
  }
  const seen = new Set();
  for (const stage of plan.stages) {
    const expected = `batch-${String(stage.batchIndex + 1).padStart(2, '0')}-n${stage.nodes}`;
    if (!Number.isInteger(stage.batchIndex) || stage.batchIndex < 0 || stage.batchIndex > 7
      || !BUDGETS.includes(stage.nodes) || stage.id !== expected || stage.directory !== expected
      || stage.games !== 880 || seen.has(stage.id)) throw new Error('Invalid panel stage layout.');
    seen.add(stage.id);
  }
  const state = readJson(path.join(root, 'panel-state.json'), true) || { runId, targetOpenings: initialOpenings };
  if (state.runId !== runId || !TARGETS.includes(state.targetOpenings) || state.targetOpenings < initialOpenings) throw new Error('Invalid saved panel target.');
  return { manifest, target: state.targetOpenings };
}

/** Consume only newline-terminated entries present when the file was opened.
 * An incomplete tail belongs to the writer; it is neither parsed nor repaired. */
async function readJournal(file, visit) {
  let stat;
  try { stat = fs.statSync(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!stat.isFile()) throw new Error(`Not a journal file: ${file}.`);
  if (!stat.size) return;
  let pending = '';
  for await (const chunk of fs.createReadStream(file, { encoding: 'utf8', end: stat.size - 1 })) {
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
      if (line) visit(JSON.parse(line));
    }
  }
}

async function readStage(root, descriptor, jobs) {
  const directory = path.join(root, descriptor.directory);
  const manifest = await stageManifest(path.join(directory, 'run.json'));
  if (!manifest) return { ...descriptor, finalIds: new Set(), durations: [], remainingByWorker: null, retries: 0, invalidTimings: 0 };
  if (!Array.isArray(manifest.schedule) || manifest.schedule.length !== descriptor.games
    || sha(manifest.schedule) !== descriptor.scheduleSha256 || sha(manifest.config) !== descriptor.configSha256
    || manifest.parallel?.jobs !== jobs || !Array.isArray(manifest.parallel.shards) || manifest.parallel.shards.length !== jobs) {
    throw new Error(`Stage ${descriptor.id} does not match its saved panel plan.`);
  }
  const ids = new Set(manifest.schedule.map(game => game.id));
  if (ids.size !== descriptor.games || [...ids].some(id => typeof id !== 'string' || !id)) throw new Error('Invalid or duplicate scheduled game IDs.');
  const assigned = new Set(), workerIds = new Set();
  for (const shard of manifest.parallel.shards) {
    if (!Number.isInteger(shard.worker) || shard.worker < 1 || shard.worker > jobs || workerIds.has(shard.worker)
      || shard.directory !== `workers/worker-${String(shard.worker).padStart(2, '0')}` || !Array.isArray(shard.scheduleIds)) throw new Error('Invalid saved worker layout.');
    workerIds.add(shard.worker);
    for (const id of shard.scheduleIds) {
      if (!ids.has(id) || assigned.has(id)) throw new Error('Invalid or overlapping worker schedules.');
      assigned.add(id);
    }
  }
  if (assigned.size !== ids.size) throw new Error('Worker schedules do not cover the saved stage.');
  const latest = new Map();
  const visit = allowed => record => {
    if (!allowed.has(record.id) || !Number.isInteger(record.attempt) || record.attempt < 1 || !STATUSES.has(record.status)) throw new Error(`Invalid game in ${descriptor.id}.`);
    const compact = { id: record.id, attempt: record.attempt, status: record.status, startedAt: record.startedAt, finishedAt: record.finishedAt };
    const previous = latest.get(record.id);
    if (previous?.attempt === record.attempt && JSON.stringify(previous) !== JSON.stringify(compact)) throw new Error(`Conflicting journal copies in ${descriptor.id}.`);
    if (!previous || record.attempt >= previous.attempt) latest.set(record.id, compact);
  };
  await readJournal(path.join(directory, 'games.jsonl'), visit(ids));
  // Worker journals can be ahead of the stage aggregate after a power cut or
  // during its next append. Merge by game/attempt, never count both copies.
  for (const shard of manifest.parallel.shards) await readJournal(path.join(directory, shard.directory, 'games.jsonl'), visit(new Set(shard.scheduleIds)));
  const finalIds = new Set(), durations = [];
  let retries = 0, invalidTimings = 0;
  for (const record of latest.values()) if (FINAL.has(record.status)) {
    finalIds.add(record.id);
    if (record.attempt !== 1) { retries++; continue; }
    const seconds = (Date.parse(record.finishedAt) - Date.parse(record.startedAt)) / 1000;
    if (Number.isFinite(seconds) && seconds > 0) durations.push(seconds); else invalidTimings++;
  }
  return { ...descriptor, finalIds, durations, retries, invalidTimings,
    remainingByWorker: manifest.parallel.shards.map(shard => shard.scheduleIds.filter(id => !finalIds.has(id)).length) };
}

function estimate(stages, jobs) {
  const timings = BUDGETS.map(nodes => {
    const rows = stages.filter(stage => stage.nodes === nodes);
    const count = rows.reduce((sum, stage) => sum + stage.durations.length, 0);
    const seconds = rows.reduce((sum, stage) => sum + stage.durations.reduce((a, b) => a + b, 0), 0);
    return { nodes, sampleGames: count, meanGameSeconds: count ? seconds / count : null,
      excludedRetryGames: rows.reduce((sum, stage) => sum + stage.retries, 0),
      invalidTimings: rows.reduce((sum, stage) => sum + stage.invalidTimings, 0) };
  });
  const output = stages.map(stage => {
    const timing = timings.find(row => row.nodes === stage.nodes);
    const finalizedGames = stage.finalIds.size, remainingGames = stage.games - finalizedGames;
    // Future stages use the same whole-color-pair partitioning as the runner.
    const longestQueue = stage.remainingByWorker ? Math.max(...stage.remainingByWorker) : Math.ceil((stage.games / 2) / jobs) * 2;
    return { id: stage.id, nodes: stage.nodes, finalizedGames, remainingGames, longestRemainingWorkerQueue: longestQueue,
      estimatedRemainingSeconds: !remainingGames ? 0 : timing.meanGameSeconds === null ? null : longestQueue * timing.meanGameSeconds };
  });
  const missing = [...new Set(output.filter(stage => stage.estimatedRemainingSeconds === null).map(stage => stage.nodes))];
  const knownSeconds = output.reduce((sum, stage) => sum + (stage.estimatedRemainingSeconds || 0), 0);
  return { scheduledGames: output.reduce((sum, stage) => sum + stage.finalizedGames + stage.remainingGames, 0),
    finalizedGames: output.reduce((sum, stage) => sum + stage.finalizedGames, 0),
    remainingGames: output.reduce((sum, stage) => sum + stage.remainingGames, 0),
    estimatedRemainingSeconds: missing.length ? null : knownSeconds,
    estimatedKnownBudgetSeconds: knownSeconds, budgetsWithoutTimings: missing, timings, stages: output };
}

function runningState(root) {
  const file = path.join(root, '.panel.lock');
  let owner;
  try { owner = readJson(file, true); } catch { return 'unknown (lock is being read)'; }
  if (!owner) return 'paused or finished';
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) return 'unknown';
  try { process.kill(owner.pid, 0); return `running (process ${owner.pid})`; }
  catch (error) { return error.code === 'ESRCH' ? 'paused (stale lock remains)' : 'unknown (process access unavailable)'; }
}

async function readStatus(directory) {
  const root = path.resolve(directory), { manifest, target } = readPanel(root);
  const descriptors = manifest.stages.filter(stage => stage.batchIndex < target / 8), stages = [];
  for (const descriptor of descriptors) stages.push(await readStage(root, descriptor, manifest.jobs));
  return { format: 'levelup-level3-panel-runtime-estimate', runId: manifest.runId, directory: root,
    sampledAt: new Date().toISOString(), state: runningState(root), targetOpenings: target, jobs: manifest.jobs,
    ...estimate(stages, manifest.jobs),
    limitations: 'Read-only, non-atomic snapshot. Per-budget first-attempt full-game durations; longest remaining fixed worker queue per stage, then stages summed. In-progress work is counted as a full remaining game. No cross-budget extrapolation. Hardware, matchup order and worker overhead can change speed. Preflight, pauses, retries and final material fitting are not predicted.' };
}

function duration(seconds) {
  if (seconds === null) return 'unavailable';
  const minutes = Math.ceil(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function render(status) {
  const lines = [`Level-three panel: ${status.state}`, `${status.targetOpenings} openings; ${status.jobs} workers; ${status.finalizedGames}/${status.scheduledGames} games finalized; ${status.remainingGames} remaining.`];
  for (const timing of status.timings) {
    const stages = status.stages.filter(stage => stage.nodes === timing.nodes);
    const remaining = stages.reduce((sum, stage) => sum + stage.remainingGames, 0);
    const seconds = stages.some(stage => stage.estimatedRemainingSeconds === null) ? null : stages.reduce((sum, stage) => sum + stage.estimatedRemainingSeconds, 0);
    lines.push(`${timing.nodes / 1000}k nodes: ${remaining} games remaining; ${timing.sampleGames} timed games${timing.sampleGames ? `, mean ${timing.meanGameSeconds.toFixed(1)}s/game${timing.sampleGames < 20 ? ' (early sample)' : ''}` : ''}; estimated ${duration(seconds)}.`);
  }
  lines.push(`Rough remaining game time: ${duration(status.estimatedRemainingSeconds)}.`);
  if (status.budgetsWithoutTimings.length) lines.push(`Waiting for timing samples at ${status.budgetsWithoutTimings.map(nodes => `${nodes / 1000}k`).join(', ')} nodes; known portion: ${duration(status.estimatedKnownBudgetSeconds)}.`);
  lines.push('Excludes preflight, pauses and final material fitting. In-progress games count as full remaining games. Re-run this command to refresh; no files changed.');
  return lines.join('\n');
}

async function main(args = process.argv.slice(2), { log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const status = await readStatus(options.run);
  log(options.json ? JSON.stringify(status, null, 2) : render(status));
  return status;
}

if (require.main === module) main().catch(error => { console.error(`Panel runtime estimate: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, readPanel, readJournal, readStage, estimate, readStatus, render, main };
