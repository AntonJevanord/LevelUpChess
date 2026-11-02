'use strict';

// Tiny native protocol/recovery fixtures, never scientific balance evidence.
// Every game stops after two plies and is deliberately unscored. The original
// runtimes are extracted from the real v0.17.8 and approved v0.17.10 trees.
// Later research builds intentionally retain their stricter identity checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const currentSerial = require('../scripts/balance/run');
const { RECEIPT_FILE, loadApproval } = require('../scripts/balance/checkpoint-upgrade');
const { validateManifest } = require('../scripts/version17-balance');

const ROOT = path.resolve(__dirname, '..');
const native = { skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 120000 };
const enginePath = process.env.FAIRY_STOCKFISH_PATH;
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const bytes = file => fs.readFileSync(file);
const journal = directory => fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
let oldRoot;
let approvedRoot;
let oldSerial;
let oldParallel;
let runMatches, getRunIdentity, runParallel;

function extract(tag) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-historical-checkpoint-'));
  const balanceFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', tag, '--', 'experiments/balance'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(file => file.endsWith('.json') && path.posix.dirname(file) === 'experiments/balance');
  const archive = execFileSync('git', ['archive', tag, 'scripts', 'src', 'variants', 'dist', 'experiments/designs', ...balanceFiles],
    { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
  return directory;
}

test.before(() => {
  if (!enginePath) return;
  oldRoot = extract('v0.17.8');
  approvedRoot = extract('v0.17.10');
  oldSerial = require(path.join(oldRoot, 'scripts/balance/run'));
  oldParallel = require(path.join(oldRoot, 'scripts/balance/parallel'));
  ({ runMatches, getRunIdentity } = require(path.join(approvedRoot, 'scripts/balance/run')));
  ({ runParallel } = require(path.join(approvedRoot, 'scripts/balance/parallel')));
  const before = oldSerial.getRunIdentity(enginePath), after = getRunIdentity(enginePath), approval = loadApproval().approval;
  assert.equal(before.runnerSha256, approval.from.runnerSha256);
  assert.equal(after.runnerSha256, approval.to.runnerSha256);
  assert.equal(before.rulesBundleSha256, after.rulesBundleSha256, 'old and current movement bundles must match exactly');
  assert.equal(before.engineSha256, after.engineSha256);
});
test.after(() => { for (const directory of [oldRoot, approvedRoot]) if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-native-checkpoint-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function config(repetitions = 2) {
  return normalizeConfig({ schemaVersion: 3, name: 'Native checkpoint protocol fixture; not balance evidence', seed: 100,
    repetitions, engine: { nodes: 20, threads: 1, hashMb: 16, maxPlies: 2 },
    openings: [{ id: 'start', moves: [] }], comparisons: [{ id: 'pawn-fixture',
      armyA: { upgrades: { c2: 'pawn.blue@5' } }, armyB: { upgrades: { c2: 'pawn.blue@7' } } }] });
}
function assertFinal(directory, expected) {
  const records = journal(directory);
  assert.equal(records.length, expected);
  assert.equal(new Set(records.map(record => record.id)).size, expected);
  assert.ok(records.every(record => record.status === 'truncated' && record.result === '*' && record.totalPlies === 2));
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
  return records;
}
function assertReceipt(directory, manifest) {
  const receipt = json(path.join(directory, RECEIPT_FILE));
  assert.equal(receipt.runId, manifest.runId);
  assert.equal(receipt.frozenExperimentIdentity.runnerSha256, manifest.runnerSha256);
  assert.equal(receipt.actualRuntimeIdentity.runnerSha256, getRunIdentity(enginePath).runnerSha256);
  assert.equal(receipt.checkpointPolicy, 'game-boundary; graceful stops and errors flush once');
}

test('actual v0.17.8 serial progress resumes under game-boundary storage without replaying finalized games', native, async t => {
  const directory = temporary(t), configuration = config(), schedule = makeSchedule(configuration);
  let stop = null;
  const first = await oldSerial.runMatches({ config: configuration, schedule, outDir: directory, enginePath,
    shouldStop: () => stop, onProgress(message) { if (message.startsWith('Finished ')) stop = 'game'; } });
  assert.equal(first.nextIndex, 1);
  const originalManifest = bytes(path.join(directory, 'run.json')), firstRecord = journal(directory)[0];
  const originalJournal = bytes(path.join(directory, 'games.jsonl'));
  const resumed = await runMatches({ config: configuration, schedule, outDir: directory, enginePath, resume: true });
  assert.equal(resumed.nextIndex, 4);
  assert.deepEqual(bytes(path.join(directory, 'run.json')), originalManifest);
  validateManifest(json(path.join(directory, 'run.json')), { config: configuration });
  assert.deepEqual(bytes(path.join(directory, 'games.jsonl')).subarray(0, originalJournal.length), originalJournal);
  const records = assertFinal(directory, 4);
  assert.deepEqual(records.find(record => record.id === firstRecord.id), firstRecord);
  assertReceipt(directory, JSON.parse(originalManifest));
  const unchanged = bytes(path.join(directory, 'games.jsonl'));
  await runMatches({ config: configuration, schedule, outDir: directory, enginePath, resume: true });
  assert.deepEqual(bytes(path.join(directory, 'games.jsonl')), unchanged);
});

test('an actual old parent with no worker manifests creates approved inherited workers on resume', native, async t => {
  const directory = temporary(t), configuration = config();
  const first = await oldParallel.runParallel({ config: configuration, outDir: directory, jobs: 2, enginePath, shouldStop: () => 'game' });
  assert.equal(first.nextIndex, 0);
  assert.equal(fs.existsSync(path.join(directory, 'workers')), false);
  const originalBytes = bytes(path.join(directory, 'run.json')), manifest = JSON.parse(originalBytes);
  const resumed = await runParallel({ outDir: directory, resume: true, enginePath });
  assert.equal(resumed.nextIndex, 4);
  assert.deepEqual(bytes(path.join(directory, 'run.json')), originalBytes);
  validateManifest(json(path.join(directory, 'run.json')), { config: configuration });
  assertFinal(directory, 4); assertReceipt(directory, manifest);
  for (const shard of manifest.parallel.shards) {
    const worker = path.join(directory, shard.directory), workerManifest = json(path.join(worker, 'run.json'));
    assert.equal(workerManifest.runnerSha256, manifest.runnerSha256);
    assert.deepEqual(workerManifest.runnerSources, manifest.runnerSources);
    assert.equal(workerManifest.rulesHash, manifest.rulesHash);
    assertReceipt(worker, workerManifest);
  }
});

test('old worker journals ahead of the aggregate merge once and retain original worker manifests', native, async t => {
  const directory = temporary(t), configuration = config(3);
  let stop = null;
  const first = await oldParallel.runParallel({ config: configuration, outDir: directory, jobs: 2, enginePath,
    shouldStop: () => stop, onProgress(message) { if (message.includes('Starting game ')) stop = 'pair'; } });
  assert.ok(first.nextIndex > 0 && first.nextIndex < 6, 'the old source must leave actual native work to resume');
  const manifestBytes = bytes(path.join(directory, 'run.json')), manifest = JSON.parse(manifestBytes);
  const workers = manifest.parallel.shards.map(shard => {
    const directoryForWorker = path.join(directory, shard.directory);
    return { directory: directoryForWorker, manifest: bytes(path.join(directoryForWorker, 'run.json')),
      prefix: bytes(path.join(directoryForWorker, 'games.jsonl')), records: journal(directoryForWorker), scheduled: shard.scheduleIds.length };
  });
  const durable = workers.flatMap(worker => worker.records);
  assert.equal(durable.length, first.nextIndex);
  // Controlled crash-state fixture: workers have synced their results, while
  // the aggregate contains only its first complete line. No real data is used.
  const aggregate = bytes(path.join(directory, 'games.jsonl'));
  const prefix = aggregate.subarray(0, aggregate.indexOf(10) + 1);
  fs.writeFileSync(path.join(directory, 'games.jsonl'), prefix);
  const resumed = await runParallel({ outDir: directory, resume: true, enginePath });
  assert.equal(resumed.nextIndex, 6);
  assert.deepEqual(bytes(path.join(directory, 'run.json')), manifestBytes);
  validateManifest(json(path.join(directory, 'run.json')), { config: configuration });
  const records = assertFinal(directory, 6);
  for (const record of durable) assert.deepEqual(records.find(value => value.id === record.id), record);
  assertReceipt(directory, manifest);
  for (const worker of workers) {
    assert.deepEqual(bytes(path.join(worker.directory, 'run.json')), worker.manifest);
    assert.deepEqual(bytes(path.join(worker.directory, 'games.jsonl')).subarray(0, worker.prefix.length), worker.prefix);
    if (worker.records.length < worker.scheduled) assertReceipt(worker.directory, JSON.parse(worker.manifest));
  }
  const journalAfter = bytes(path.join(directory, 'games.jsonl'));
  await runParallel({ outDir: directory, resume: true, enginePath });
  assert.deepEqual(bytes(path.join(directory, 'games.jsonl')), journalAfter);
  assert.equal(createHash('sha256').update(bytes(path.join(directory, 'run.json'))).digest('hex'),
    createHash('sha256').update(manifestBytes).digest('hex'));
});

test('a later research build cannot silently reuse the historical storage-only approval', native, async t => {
  const directory = temporary(t), configuration = config(), schedule = makeSchedule(configuration);
  let stop = null;
  await oldSerial.runMatches({ config: configuration, schedule, outDir: directory, enginePath,
    shouldStop: () => stop, onProgress(message) { if (message.startsWith('Finished ')) stop = 'game'; } });
  const originals = ['run.json', 'games.jsonl', 'checkpoint.json'].map(file => [file, bytes(path.join(directory, file))]);
  await assert.rejects(currentSerial.runMatches({ config: configuration, schedule, outDir: directory, enginePath, resume: true }), /Cannot apply the game-checkpoint storage upgrade: rulesBundleSha256 changed/);
  for (const [file, content] of originals) assert.deepEqual(bytes(path.join(directory, file)), content);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
});
