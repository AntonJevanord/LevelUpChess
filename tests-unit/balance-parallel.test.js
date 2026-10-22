const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');

const api = () => require('../scripts/balance/parallel');
const native = { skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 120000 };
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = (directory, file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
const text = (directory, file) => fs.readFileSync(path.join(directory, file), 'utf8');
function journal(directory) {
  const input = text(directory, 'games.jsonl');
  return input.slice(0, input.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-parallel-tests-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function configuration({ repetitions = 1, nodes = 500, maxPlies = 4 } = {}) {
  return normalizeConfig({
    schemaVersion: 2,
    name: 'Parallel workflow fixture; not balance evidence',
    seed: 42, repetitions, engine: { nodes, threads: 1, hashMb: 16, maxPlies },
    openings: [{ id: 'start', moves: [] }, { id: 'open-e', moves: ['e2e4', 'e7e5'] }],
    comparisons: [
      { id: 'camel-v-amazon', armyA: { upgrades: { b1: 'knight.purple@3' } }, armyB: { upgrades: { d1: 'queen.purple@1' } } },
      { id: 'short-v-companion', armyA: { upgrades: { d1: 'queen.purple@2' } }, armyB: { upgrades: { d1: 'queen.purple@3' } } },
    ],
  });
}
function run(config, outDir, options = {}) {
  return api().runParallel({ config, outDir, jobs: 2, enginePath: process.env.FAIRY_STOCKFISH_PATH || process.execPath, ...options });
}
function directories(directory, manifest = json(directory, 'run.json')) {
  return manifest.parallel.shards.map(shard => path.join(directory, shard.directory));
}
function assertUnlocked(directory, manifest = json(directory, 'run.json')) {
  for (const current of [directory, ...directories(directory, manifest)]) assert.equal(fs.existsSync(path.join(current, 'run.lock')), false, current);
}

test('static parallel partitioning preserves whole color pairs and every scheduled ID exactly once', () => {
  const { partitionSchedule } = api();
  const schedule = makeSchedule(configuration());
  const before = clone(schedule), shards = partitionSchedule(schedule, 3);
  assert.deepEqual(schedule, before);
  assert.deepEqual(partitionSchedule(schedule, 3), shards);
  assert.equal(shards.length, 3);
  assert.deepEqual(shards.map(shard => shard.length), [4, 2, 2]);
  assert.equal(new Set(shards.flat().map(game => game.id)).size, schedule.length);
  assert.deepEqual(shards.flat().map(game => game.id).sort(), schedule.map(game => game.id).sort());
  for (const shard of shards) for (let index = 0; index < shard.length; index += 2) {
    assert.equal(shard[index].pairId, shard[index + 1].pairId);
    assert.notEqual(shard[index].aColor, shard[index + 1].aColor);
    assert.deepEqual(shard[index].comparison, shard[index + 1].comparison);
  }
  assert.equal(partitionSchedule(schedule.slice(0, 2), 16).length, 1, 'idle worker processes need not be launched');
});

test('malformed schedules and unsupported job counts cannot create worker assignments', () => {
  const { partitionSchedule } = api();
  const schedule = makeSchedule(configuration());
  for (const jobs of [0, -1, 1.5, 17, NaN, '2', null]) assert.throws(() => partitionSchedule(schedule, jobs));
  for (const input of [[], null, schedule.slice(1), [...schedule, ...schedule.slice(0, 2)]]) assert.throws(() => partitionSchedule(input, 2));
  const mismatched = clone(schedule); mismatched[1].pairId = 'wrong-pair';
  assert.throws(() => partitionSchedule(mismatched, 2));
  const sameColor = clone(schedule); sameColor[1].aColor = sameColor[0].aColor;
  assert.throws(() => partitionSchedule(sameColor, 2));
});

test('parallel launch requires schema 2 and rejects invalid jobs before creating result files', async t => {
  const directory = temporary(t);
  const legacy = { schemaVersion: 1, name: 'Legacy fixture', comparisons: [{ id: 'ordinary', armyA: {}, armyB: {} }] };
  await assert.rejects(run(legacy, path.join(directory, 'legacy')), /schema|design/i);
  await assert.rejects(run(configuration(), path.join(directory, 'invalid-jobs'), { jobs: 17 }), /jobs|worker|1.*16/i);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('parallel CLI constrains mode-specific flags and never migrates a serial resume', () => {
  const { parseArgs } = require('../scripts/parallel-balance');
  assert.deepEqual(parseArgs(['--config', 'future.json', '--out', 'new-run', '--jobs', '4', '--log', 'plies']),
    { config: 'future.json', out: 'new-run', jobs: 4, log: 'plies' });
  assert.deepEqual(parseArgs(['--resume', 'old-parallel', '--log', 'games']), { resume: 'old-parallel', log: 'games' });
  assert.deepEqual(parseArgs(['--status', 'running']), { status: 'running' });
  for (const args of [[], ['--config', 'x'], ['--jobs', '2'], ['--resume', 'x', '--jobs', '2'],
    ['--status', 'x', '--log', 'games'], ['--config', 'x', '--out', 'y', '--jobs', '17'],
    ['--config', 'x', '--out', 'y', '--jobs', '1.5'], ['--resume', 'x', '--log', 'quiet'], ['--resume', 'x', '--resume', 'y']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('a stop before launch creates no workers and atomic state replacement tolerates sharing errors', async t => {
  const directory = temporary(t), originalRename = fs.renameSync, originalUnlink = fs.unlinkSync;
  let injected = false, retries = 0, previousState;
  fs.renameSync = (from, to) => {
    if (path.basename(to) === 'parallel-state.json' && fs.existsSync(to)) {
      retries++;
      if (!injected) {
        previousState = fs.readFileSync(to, 'utf8'); injected = true;
        throw Object.assign(new Error('Sharing violation'), { code: 'EPERM' });
      }
      if (retries === 2) assert.equal(fs.readFileSync(to, 'utf8'), previousState, 'failed replacement preserves the previous state');
    }
    return originalRename(from, to);
  };
  fs.unlinkSync = file => {
    assert.notEqual(path.basename(file), 'parallel-state.json', 'atomic retry never unlinks its destination');
    return originalUnlink(file);
  };
  t.after(() => { fs.renameSync = originalRename; fs.unlinkSync = originalUnlink; });
  const result = await run(configuration(), directory, { enginePath: process.execPath, shouldStop: () => 'game' });
  assert.equal(result.stopped, true);
  assert.equal(result.nextIndex, 0);
  assert.ok(injected && retries >= 2);
  assert.equal(fs.existsSync(path.join(directory, 'workers')), false);
  assert.equal(json(directory, 'parallel-state.json').activeWorkers, 0);
  assertUnlocked(directory);
  fs.writeFileSync(path.join(directory, 'parallel-state.json'), 'null');
  await assert.rejects(run(configuration(), directory, { resume: true, enginePath: process.execPath }), /session state/i);
  assertUnlocked(directory);
});

test('two native workers retain independent checkpoints and one exact aggregate journal', native, async t => {
  const directory = temporary(t), config = configuration(), schedule = makeSchedule(config), messages = [];
  const result = await run(config, directory, { onProgress: message => messages.push(message) });
  assert.equal(result.stopped, false);
  assert.equal(result.nextIndex, schedule.length);
  assert.equal(result.scheduledGames, schedule.length);
  const manifest = json(directory, 'run.json'), aggregate = journal(directory);
  assert.equal(manifest.parallel.jobs, 2);
  assert.equal(manifest.parallel.shards.length, 2);
  assert.equal(manifest.parallel.sources.length, 3);
  for (const source of manifest.parallel.sources) {
    assert.equal(source.sha256, sha256(fs.readFileSync(path.resolve(__dirname, '..', source.file), 'utf8').replace(/\r\n/g, '\n')));
  }
  assert.deepEqual(manifest.config, config);
  assert.deepEqual(manifest.schedule, schedule);
  assert.equal(manifest.designRegistry.definitions.length, 4);
  assert.equal(aggregate.length, 8);
  assert.equal(new Set(aggregate.map(record => record.id)).size, 8);
  assert.ok(aggregate.every(record => record.status === 'truncated' && record.result === '*'));
  assert.equal(result.summary.statusCounts.truncated, 8);
  assert.equal(result.summary.statusCounts.error, 0);
  assert.ok(result.summary.comparisons.every(comparison => comparison.primaryEstimate.score === null));
  assert.ok(!messages.some(message => /Game .*: ply \d+,/.test(message)), 'ordinary output contains no ply progress');
  for (let index = 0; index < manifest.parallel.shards.length; index++) {
    const shard = manifest.parallel.shards[index], workerDir = path.join(directory, shard.directory), worker = json(workerDir, 'run.json');
    assert.deepEqual(worker.config, config, 'workers retain all declared comparisons and the full design library');
    assert.deepEqual(worker.designRegistry, manifest.designRegistry);
    assert.deepEqual(worker.designProfile, manifest.designProfile);
    assert.equal(worker.engineSha256, manifest.engineSha256);
    assert.equal(worker.rulesHash, manifest.rulesHash);
    assert.equal(worker.configHash, sha256(JSON.stringify({ config, schedule: worker.schedule })));
    assert.notEqual(worker.configHash, manifest.configHash, 'the worker schedule has its own identity');
    assert.ok(messages.some(message => message.startsWith(`[worker ${index + 1}] Starting game`)), 'both worker processes report a game');
    assert.equal(journal(workerDir).length, worker.schedule.length);
    for (const record of journal(workerDir)) assert.ok(worker.schedule.some(game => game.id === record.id));
  }
  assertUnlocked(directory, manifest);
  const originalJournal = text(directory, 'games.jsonl'), originalManifest = text(directory, 'run.json');
  await assert.rejects(run(config, directory, { resume: true, jobs: 3 }), /jobs|worker|frozen/i);
  const resumed = await run(config, directory, { resume: true });
  assert.equal(resumed.nextIndex, 8);
  assert.equal(text(directory, 'games.jsonl'), originalJournal, 'completed attempts are not copied into the aggregate twice');
  assert.equal(text(directory, 'run.json'), originalManifest, 'the immutable run declaration stays unchanged');
  const status = api().readParallelStatus(directory);
  assert.equal(status.scheduledGames, 8);
  assertUnlocked(directory, manifest);

  const tampered = clone(manifest); tampered.engineSha256 = 'changed';
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(tampered) + '\n');
  const changedManifest = text(directory, 'run.json');
  await assert.rejects(run(config, directory, { resume: true }), /engine|identity|match|changed/i);
  assert.equal(text(directory, 'run.json'), changedManifest);
  assert.equal(text(directory, 'games.jsonl'), originalJournal);
  fs.writeFileSync(path.join(directory, 'run.json'), originalManifest);
  const coordinatorChanged = clone(manifest); coordinatorChanged.parallel.sources[0].sha256 = 'changed';
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(coordinatorChanged) + '\n');
  await assert.rejects(run(config, directory, { resume: true }), /parallel|sources|changed/i);
  assert.equal(text(directory, 'games.jsonl'), originalJournal);
  fs.writeFileSync(path.join(directory, 'run.json'), originalManifest);
  const workerDir = directories(directory, manifest)[0], workerJournal = text(workerDir, 'games.jsonl'), forged = { ...journal(workerDir)[0], id: 'unknown-game' };
  for (const duplicate of [journal(workerDir)[0], { ...journal(workerDir)[0], attempt: 2 }]) {
    fs.appendFileSync(path.join(workerDir, 'games.jsonl'), JSON.stringify(duplicate) + '\n');
    await assert.rejects(run(config, directory, { resume: true }), /duplicate|finalization|attempt/i);
    assert.equal(text(directory, 'games.jsonl'), originalJournal);
    assertUnlocked(directory, manifest);
    fs.writeFileSync(path.join(workerDir, 'games.jsonl'), workerJournal);
  }
  fs.appendFileSync(path.join(workerDir, 'games.jsonl'), JSON.stringify(forged) + '\n');
  await assert.rejects(run(config, directory, { resume: true }), /unknown|scheduled|schedule|belong|assigned|journal/i);
  assert.equal(text(directory, 'games.jsonl'), originalJournal, 'unassigned worker records cannot pollute the aggregate');
  assertUnlocked(directory, manifest);
  fs.writeFileSync(path.join(workerDir, 'games.jsonl'), workerJournal);
  const anotherWorkerRecord = journal(directories(directory, manifest)[1])[0];
  fs.appendFileSync(path.join(workerDir, 'games.jsonl'), JSON.stringify(anotherWorkerRecord) + '\n');
  await assert.rejects(run(config, directory, { resume: true }), /worker|shard|schedule|belong|assigned|journal/i);
  assert.equal(text(directory, 'games.jsonl'), originalJournal, 'an existing game ID cannot acquire a second owner');
  assertUnlocked(directory, manifest);
});

test('effective jobs are capped to the number of complete pairs', native, async t => {
  const directory = temporary(t), config = configuration(), schedule = makeSchedule(config).slice(0, 2);
  const result = await run(config, directory, { schedule, jobs: 16 });
  assert.equal(result.nextIndex, 2);
  assert.equal(json(directory, 'run.json').parallel.jobs, 1);
  assert.equal(json(directory, 'parallel-state.json').jobs, 1);
  assertUnlocked(directory);
});

test('parallel pair stops finish active pairs and resume the same frozen assignments', native, async t => {
  const directory = temporary(t), config = configuration({ repetitions: 3 });
  let stop = null;
  const result = await run(config, directory, {
    shouldStop: () => stop,
    onProgress(message) { if (message.includes('Finished ')) stop = 'pair'; },
  });
  assert.equal(result.stopped, true);
  assert.ok(result.nextIndex > 0 && result.nextIndex < result.scheduledGames);
  const first = journal(directory), completedPairs = new Map();
  for (const record of first.filter(record => ['completed', 'truncated'].includes(record.status))) {
    if (!completedPairs.has(record.pairId)) completedPairs.set(record.pairId, []);
    completedPairs.get(record.pairId).push(record);
  }
  assert.ok(completedPairs.size > 0);
  for (const records of completedPairs.values()) assert.equal(records.length, 2, 'each active color pair reaches its boundary');
  const manifest = text(directory, 'run.json');
  assertUnlocked(directory);
  const resumed = await run(config, directory, { resume: true });
  assert.equal(resumed.stopped, false);
  assert.equal(resumed.nextIndex, 24);
  assert.equal(text(directory, 'run.json'), manifest);
  const final = journal(directory).filter(record => ['completed', 'truncated'].includes(record.status));
  assert.equal(final.length, 24);
  assert.equal(new Set(final.map(record => record.id)).size, 24);
  assertUnlocked(directory);
});

test('immediate parallel cancellation retains resumable worker histories', native, async t => {
  const directory = temporary(t), config = configuration({ repetitions: 2 }), controller = new AbortController();
  let observedGame = false;
  const stopped = await run(config, directory, {
    signal: controller.signal,
    onProgress(message) { if (!observedGame && message.includes('Starting game')) { observedGame = true; controller.abort(); } },
  });
  assert.equal(observedGame, true);
  assert.equal(stopped.stopped, true);
  assert.ok(stopped.nextIndex < stopped.scheduledGames);
  const frozen = text(directory, 'run.json');
  assertUnlocked(directory);
  const resumed = await run(config, directory, { resume: true });
  assert.equal(resumed.stopped, false);
  assert.equal(resumed.nextIndex, 16);
  assert.equal(text(directory, 'run.json'), frozen);
  const final = journal(directory).filter(record => ['completed', 'truncated'].includes(record.status));
  assert.equal(final.length, 16);
  assert.equal(new Set(final.map(record => record.id)).size, 16);
  assertUnlocked(directory);
});

test('parallel game stops finish current games without aborting them and remain resumable', native, async t => {
  const directory = temporary(t), config = configuration({ repetitions: 2 });
  let stop = null;
  const stopped = await run(config, directory, {
    shouldStop: () => stop,
    onProgress(message) { if (message.includes('Starting game')) stop = 'game'; },
  });
  assert.equal(stopped.stopped, true);
  const before = journal(directory);
  assert.ok(before.length > 0 && before.length < stopped.scheduledGames);
  assert.ok(before.every(record => record.status === 'truncated'), 'graceful game stop does not interrupt a game');
  assertUnlocked(directory);
  const resumed = await run(config, directory, { resume: true });
  assert.equal(resumed.nextIndex, 16);
  assert.equal(new Set(journal(directory).filter(record => record.status === 'truncated').map(record => record.id)).size, 16);
  assertUnlocked(directory);
});

test('a native preflight failure releases every lock and can resume with the same executable', {
  ...native, skip: !process.env.FAIRY_STOCKFISH_PATH || process.platform === 'win32',
}, async t => {
  const base = temporary(t), directory = path.join(base, 'run'), flag = path.join(base, 'fail.flag'), engine = path.join(base, 'controlled-engine');
  fs.writeFileSync(flag, 'Fail until the external condition is cleared.');
  fs.writeFileSync(engine, '#!/usr/bin/env node\n' + `
    const fs = require('node:fs');
    if (fs.existsSync(${JSON.stringify(flag)})) process.exit(1);
    const result = require('node:child_process').spawnSync(${JSON.stringify(process.env.FAIRY_STOCKFISH_PATH)}, [], { stdio: 'inherit' });
    process.exit(result.status === null ? 1 : result.status);
  `);
  fs.chmodSync(engine, 0o755);
  const config = configuration(), options = { enginePath: engine };
  await assert.rejects(run(config, directory, options), /engine|worker|operation|exited|preflight/i);
  const manifest = json(directory, 'run.json');
  assertUnlocked(directory, manifest);
  assert.equal(journal(directory).filter(record => ['completed', 'truncated'].includes(record.status)).length, 0);
  fs.unlinkSync(flag);
  const completed = await run(config, directory, { ...options, resume: true });
  assert.equal(completed.stopped, false);
  assert.equal(completed.nextIndex, 8);
  assert.equal(journal(directory).filter(record => ['completed', 'truncated'].includes(record.status)).length, 8);
  assertUnlocked(directory, manifest);
});
