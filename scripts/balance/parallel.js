'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { getRunIdentity } = require('./run');
const { openStore } = require('./storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');
const { summarize } = require('./stats');
const { shouldPrintProgress } = require('../balance');

const FINAL = new Set(['completed', 'truncated']);
const STATUSES = new Set([...FINAL, 'aborted', 'error']);
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => hash(JSON.stringify(value));
const root = path.resolve(__dirname, '../..');
function jobsValue(jobs) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Parallel jobs must be a whole number from 1 to 16.');
  return jobs;
}

/** Fixed whole-pair shards keep color partners together through stop/resume. */
function partitionSchedule(schedule, jobs) {
  jobsValue(jobs);
  if (!Array.isArray(schedule) || !schedule.length || schedule.length % 2) throw new Error('Parallel schedules must contain complete color pairs.');
  const shards = Array.from({ length: Math.min(jobs, schedule.length / 2) }, () => []);
  const seen = new Set();
  for (let index = 0; index < schedule.length; index += 2) {
    const a = schedule[index], b = schedule[index + 1];
    if (!a || !b || a.pairId !== b.pairId || a.aColor === b.aColor || a.comparisonId !== b.comparisonId || a.openingId !== b.openingId) throw new Error('Parallel schedules must preserve adjacent opposite-color pairs.');
    for (const game of [a, b]) {
      if (typeof game.id !== 'string' || seen.has(game.id)) throw new Error('Parallel schedules must contain distinct game IDs.');
      seen.add(game.id);
    }
    shards[(index / 2) % shards.length].push(a, b);
  }
  return shards;
}

function parallelSources() {
  return ['scripts/balance/parallel.js', 'scripts/balance/parallel-worker.js', 'scripts/parallel-balance.js'].map(file => ({
    file, sha256: hash(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')),
  }));
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function readJournal(directory) {
  let input;
  try { input = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  // Workers own repair. The aggregate consumes only complete durable lines.
  return input.slice(0, input.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
}
function readParallelStatus(directory) {
  const outDir = path.resolve(directory), manifest = readJson(path.join(outDir, 'run.json'));
  if (!manifest.parallel) throw new Error('This is not a parallel run.');
  const records = readJournal(outDir), final = new Set(records.filter(record => FINAL.has(record.status)).map(record => record.id));
  let state = null;
  try { state = readJson(path.join(outDir, 'parallel-state.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { manifest, state, summary: summarize(records), scheduledGames: manifest.schedule.length, finishedGames: final.size, outDir };
}
function writeState(directory, state) {
  const temporary = path.join(directory, `.parallel-state.${randomUUID()}.tmp`);
  let fd, created = false, failure;
  try {
    fd = fs.openSync(temporary, 'wx'); created = true;
    fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n'); fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, path.join(directory, 'parallel-state.json'));
  } catch (error) { failure = error; }
  for (const clean of [() => { if (fd !== undefined) fs.closeSync(fd); }, () => { if (created) unlinkWithRetrySync(temporary); }]) {
    try { clean(); } catch (error) { if (failure) (failure.cleanupErrors ||= []).push(error); else failure = error; }
  }
  if (failure) throw failure;
}

function makeManifest(config, schedule, jobs, enginePath) {
  if (![2, 3].includes(config.schemaVersion)) throw new Error('Parallel runs require schemaVersion 2 or 3 with ordinary kings.');
  const canonical = new Map(makeSchedule(config).map(game => [game.id, game]));
  for (const game of schedule) if (!isDeepStrictEqual(game, canonical.get(game.id))) throw new Error('The parallel schedule does not match its declared configuration.');
  const partitions = partitionSchedule(schedule, jobs);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation), identity = getRunIdentity(enginePath);
  const rulesProfiles = [{ variant: profile.variant, whiteKing: 0, blackKing: 0, configSha256: hash(profile.config),
    file: `rules/${profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null, profileHash: profile.hash, registryHash: registry.hash }];
  const manifest = {
    schemaVersion: 1, runId: randomUUID(), createdAt: new Date().toISOString(), configHash: fingerprint({ config, schedule }),
    rulesHash: fingerprint({ bundleHash: identity.rulesBundleSha256, runnerSha256: identity.runnerSha256, profiles: [{ variant: profile.variant, config: profile.config }] }),
    ...identity, enginePath: path.resolve(enginePath), config, schedule, rulesProfiles,
    plyLimitBasis: 'total plies, including forced opening prefix', designRegistry: registry,
    designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash },
    parallel: { schemaVersion: 1, jobs: partitions.length, sources: parallelSources(), shards: partitions.map((games, index) => ({
      worker: index + 1, directory: `workers/worker-${String(index + 1).padStart(2, '0')}`, scheduleIds: games.map(game => game.id),
    })) },
  };
  return { manifest, profile, partitions };
}

/** Independent serial workers; only this process writes aggregate artifacts. */
async function runParallel({ config: input, schedule: requestedSchedule, outDir, resume = false, enginePath, jobs: requestedJobs,
  signal, shouldStop = () => null, onProgress = () => {}, log = 'games' } = {}) {
  if (!['games', 'plies'].includes(log)) throw new Error('Parallel log must be games or plies.');
  if (typeof outDir !== 'string' || !outDir || typeof enginePath !== 'string' || !enginePath) throw new Error('Parallel runs need an output directory and engine path.');
  if (signal?.aborted) throw Object.assign(new Error('Parallel run cancelled.'), { name: 'AbortError' });
  const directory = path.resolve(outDir);
  const original = resume ? readJson(path.join(directory, 'run.json')) : null;
  if (resume && !original.parallel) throw new Error('This directory is not a parallel run; use the ordinary balance resume command.');
  if (original && requestedJobs !== undefined && requestedJobs !== original.parallel.jobs) throw new Error('Cannot change parallel jobs when resuming a frozen run.');
  const config = normalizeConfig(input === undefined ? original?.config : input);
  const schedule = requestedSchedule || original?.schedule || makeSchedule(config);
  const requested = jobsValue(requestedJobs === undefined ? original?.parallel.jobs ?? 2 : requestedJobs);
  const generated = makeManifest(config, schedule, requested, enginePath);
  const manifest = original || generated.manifest, jobs = manifest.parallel.jobs;
  if (original) {
    for (const field of ['config', 'schedule', 'configHash', 'rulesHash', 'engineSha256', 'rulesBundleSha256', 'runnerSha256', 'runnerSources', 'designRegistry', 'designProfile', 'rulesProfiles', 'parallel']) {
      if (!isDeepStrictEqual(original[field], generated.manifest[field])) throw new Error(`Cannot resume: parallel ${field} changed. Keep the original jobs, engine, rules, and coordinator sources.`);
    }
  }
  let sessions = [];
  if (resume) {
    try {
      const state = readJson(path.join(directory, 'parallel-state.json'));
      if (state?.schemaVersion !== 1 || !Array.isArray(state.sessions)) throw new Error('Invalid parallel session state.');
      sessions = state.sessions;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let store;
  const children = new Map(), promises = [];
  let firstError = null, stop = null, saving = false;
  const session = { startedAt: new Date().toISOString() }; sessions.push(session);
  const byId = new Map(schedule.map(game => [game.id, game]));
  const send = (child, message) => {
    try { if (child.connected) child.send(message, () => {}); } catch { /* Close handler reports unexpected exits. */ }
  };
  const sendControl = action => {
    if (!['now', 'game', 'pair'].includes(action)) return;
    if (stop === 'now' || stop === action) return;
    stop = action;
    for (const child of children.values()) send(child, { type: 'control', action });
  };
  const abort = () => sendControl('now');
  const validateWorker = (shard, expectedSchedule) => {
    const workerDir = path.join(directory, shard.directory), file = path.join(workerDir, 'run.json');
    if (!fs.existsSync(file)) return null;
    const worker = readJson(file);
    const expectedHash = fingerprint({ config, schedule: expectedSchedule });
    for (const [field, expected] of Object.entries({ config, schedule: expectedSchedule, configHash: expectedHash,
      rulesHash: manifest.rulesHash, engineSha256: manifest.engineSha256, rulesBundleSha256: manifest.rulesBundleSha256,
      runnerSha256: manifest.runnerSha256, runnerSources: manifest.runnerSources, designRegistry: manifest.designRegistry,
      designProfile: manifest.designProfile, rulesProfiles: manifest.rulesProfiles })) {
      if (!isDeepStrictEqual(worker[field], expected)) throw new Error(`Worker ${shard.worker} ${field} does not match its frozen shard.`);
    }
    return worker;
  };
  const validateRecords = (records, ids, worker) => {
    const last = new Map();
    for (const record of records) {
      const game = byId.get(record.id), previous = last.get(record.id);
      if (!game || !ids.has(record.id) || record.pairId !== game.pairId || record.comparisonId !== game.comparisonId || record.openingId !== game.openingId || record.aColor !== game.aColor
        || record.profileHash !== manifest.designProfile.hash || record.registryHash !== manifest.designRegistry.hash
        || record.registryReference !== 'run.json#designRegistry' || record.variant !== manifest.designProfile.variant
        || !isDeepStrictEqual(record.engine, config.engine)) throw new Error(`Worker ${worker} wrote an unknown or mismatched game.`);
      if (!isDeepStrictEqual(record.evaluation, config.evaluation)) throw new Error(`Worker ${worker} journal evaluation does not match the frozen policy.`);
      if (!Number.isInteger(record.attempt) || record.attempt < 1 || !STATUSES.has(record.status)
        || previous && (record.attempt <= previous.attempt || FINAL.has(previous.status))) throw new Error(`Worker ${worker} journal has a duplicate attempt or a game after finalization.`);
      const white = game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB;
      const black = game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB;
      if (!isDeepStrictEqual(record.whiteStrength, white) || !isDeepStrictEqual(record.blackStrength, black)) throw new Error(`Worker ${worker} strength settings changed.`);
      last.set(record.id, record);
    }
  };
  // Reject changed policy annotations before opening a store can acquire a
  // lock or repair a journal, including workers not yet aggregated.
  if (resume) {
    validateRecords(readJournal(directory), new Set(byId.keys()), 'aggregate');
    for (let index = 0; index < manifest.parallel.shards.length; index++) {
      const shard = manifest.parallel.shards[index], records = readJournal(path.join(directory, shard.directory));
      if (!records.length) continue;
      if (!validateWorker(shard, generated.partitions[index])) throw new Error(`Worker ${shard.worker} journal exists without its manifest.`);
      validateRecords(records, new Set(shard.scheduleIds), shard.worker);
    }
  }
  store = openStore({ outDir: directory, resume, manifest: generated.manifest });
  const collect = () => {
    if (saving) return;
    saving = true;
    try {
      validateRecords(store.records, new Set(byId.keys()), 'aggregate');
      const pgns = [], pending = [];
      for (let index = 0; index < manifest.parallel.shards.length; index++) {
        const shard = manifest.parallel.shards[index], workerDir = path.join(directory, shard.directory);
        const ids = new Set(shard.scheduleIds);
        const previous = store.records.filter(record => ids.has(record.id));
        const records = readJournal(workerDir);
        // A worker creates run.json before opening its journal. While that
        // first manifest is being written, another worker may finish a game.
        // No durable record is available to aggregate yet; validate on its
        // first record or after exit instead of reading a partial manifest.
        if (children.has(shard.worker) && !records.length && !previous.length) continue;
        if (!validateWorker(shard, generated.partitions[index])) {
          if (previous.length || records.length) throw new Error(`Worker ${shard.worker} journal exists without its manifest.`);
          continue;
        }
        validateRecords(records, ids, shard.worker);
        if (records.length < previous.length || previous.some((record, i) => !isDeepStrictEqual(record, records[i]))) throw new Error(`Worker ${shard.worker} journal conflicts with the aggregate history.`);
        pending.push(...records.slice(previous.length));
        try { pgns.push(fs.readFileSync(path.join(workerDir, 'games.pgn'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      // Validate every worker before extending the authoritative aggregate.
      for (const record of pending) store.append(record);
      const finished = new Set(store.records.filter(record => FINAL.has(record.status)).map(record => record.id));
      const state = { schemaVersion: 1, jobs, activeWorkers: children.size, scheduledGames: schedule.length,
        finishedGames: finished.size, stop, sessions };
      const summary = { ...summarize(store.records), runId: manifest.runId, scheduledGames: schedule.length, nextIndex: finished.size };
      store.saveSummary(summary);
      store.saveCheckpoint({ schemaVersion: 1, nextIndex: finished.size, current: null, parallel: true });
      writeState(directory, state);
      store.savePgn(pgns.join('\n'));
      return summary;
    } finally { saving = false; }
  };
  let poll;
  try {
    fs.mkdirSync(path.join(directory, 'rules'), { recursive: true });
    const ini = path.join(directory, 'rules', `${generated.profile.variant}.ini`);
    if (fs.existsSync(ini) && fs.readFileSync(ini, 'utf8') !== generated.profile.config) throw new Error('The parent archived rules changed.');
    if (!fs.existsSync(ini)) fs.writeFileSync(ini, generated.profile.config, { flag: 'wx' });
    // Validate and collect existing journals before launching any new process.
    collect();
    signal?.addEventListener('abort', abort);
    if (signal?.aborted) abort();
    sendControl(shouldStop());
    const finished = new Set(store.records.filter(record => FINAL.has(record.status)).map(record => record.id));
    for (let index = 0; index < manifest.parallel.shards.length && !stop; index++) {
      const shard = manifest.parallel.shards[index], workerDir = path.join(directory, shard.directory);
      if (shard.scheduleIds.every(id => finished.has(id))) continue;
      const child = childProcess.fork(path.join(__dirname, 'parallel-worker.js'), [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
      children.set(shard.worker, child);
      child.stdout.resume(); child.stderr.resume();
      let done = false, workerError = null;
      const fail = error => { if (!firstError) firstError = error; workerError = error; sendControl('now'); };
      const promise = new Promise(resolve => {
        child.on('message', message => {
          try {
            if (message?.type === 'progress') {
              if (shouldPrintProgress(message.message, log)) onProgress(`[worker ${shard.worker}] ${message.message}`);
              if (message.message.startsWith('Finished ')) collect();
              sendControl(shouldStop());
            } else if (message?.type === 'error') fail(new Error(`Worker ${shard.worker}: ${message.message}`));
            else if (message?.type === 'done') done = true;
          } catch (error) { fail(error); }
        });
        child.once('error', fail);
        child.once('close', code => {
          children.delete(shard.worker);
          if ((!done || code !== 0) && !workerError) fail(new Error(`Worker ${shard.worker} exited without a completed response (${code}).`));
          try { collect(); } catch (error) { fail(error); }
          resolve();
        });
      });
      promises.push(promise);
      child.send({ type: 'start', options: { config, schedule: generated.partitions[index], outDir: workerDir,
        resume: fs.existsSync(path.join(workerDir, 'run.json')), enginePath } }, error => { if (error) fail(error); });
    }
    // Status should reflect the launched workers during their first games,
    // before any result is available to trigger another aggregate snapshot.
    collect();
    poll = setInterval(() => { try { sendControl(shouldStop()); } catch (error) { firstError ||= error; sendControl('now'); } }, 100);
    await Promise.all(promises);
    session.finishedAt = new Date().toISOString();
    session.elapsedMs = Date.parse(session.finishedAt) - Date.parse(session.startedAt);
    const summary = collect();
    if (firstError) throw firstError;
    return { stopped: summary.nextIndex < schedule.length, nextIndex: summary.nextIndex, scheduledGames: schedule.length, summary, outDir: directory };
  } finally {
    clearInterval(poll); signal?.removeEventListener('abort', abort);
    try {
      if (children.size) { sendControl('now'); await Promise.allSettled(promises); }
    } finally { store.close(); }
  }
}

module.exports = { partitionSchedule, runParallel, readParallelStatus };
