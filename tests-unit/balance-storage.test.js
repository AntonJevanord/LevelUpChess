const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openStore } = require('../scripts/balance/storage');

const fixtureManifest = {
  schemaVersion: 1,
  runId: 'test-run',
  configHash: 'config-hash',
  rulesHash: 'rules-hash',
  engineSha256: 'engine-hash',
  config: { games: 2 },
  schedule: [{ id: 'pair-1-white' }, { id: 'pair-1-black' }],
  provenance: { seed: 42 },
};

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-balance-storage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function open(t, outDir, options = {}) {
  const store = openStore({ outDir, manifest: fixtureManifest, ...options });
  t.after(() => store.close());
  return store;
}

function read(directory, name) { return fs.readFileSync(path.join(directory, name), 'utf8'); }
function json(directory, name) { return JSON.parse(read(directory, name)); }
const completed = { id: 'pair-1-white', attempt: 1, status: 'completed', result: '1-0', moves: ['e2e4'] };

test('new store preserves immutable manifest and persists attempts, checkpoint, summary, and PGN', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  const manifestBytes = read(directory, 'run.json');
  assert.deepEqual(store.manifest, fixtureManifest);
  assert.deepEqual(store.records, []);
  assert.equal(store.checkpoint, null);
  assert.deepEqual(Object.keys(json(directory, 'run.lock')).sort(), ['createdAt', 'pid', 'runId', 'token']);
  assert.equal(json(directory, 'run.lock').pid, process.pid);
  assert.equal(json(directory, 'run.lock').runId, fixtureManifest.runId);
  store.append(completed);
  store.append({ id: 'pair-1-black', attempt: 1, status: 'aborted', moves: [] });
  store.append({ id: 'pair-1-black', attempt: 2, status: 'truncated', reason: 'ply-limit' });
  store.saveCheckpoint({ id: 'pair-1-black', ply: 2, moves: ['e2e4', 'e7e5'] });
  store.saveSummary({ wins: 1, truncated: 1 });
  store.savePgn('[Result "1-0"]\n\n1. e4 1-0\n');
  assert.equal(store.records.length, 3);
  assert.deepEqual(store.records[0], completed);
  assert.equal(read(directory, 'games.jsonl').split('\n').length, 4);
  assert.deepEqual(json(directory, 'checkpoint.json'), store.checkpoint);
  assert.deepEqual(json(directory, 'summary.json'), { wins: 1, truncated: 1 });
  assert.match(read(directory, 'games.pgn'), /1\. e4 1-0/);
  assert.equal(read(directory, 'run.json'), manifestBytes);
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
  store.close();
  store.close();
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
  assert.throws(() => store.append(completed), /closed/);
  assert.throws(() => store.saveCheckpoint(null), /closed/);
});

test('resume loads attempts and checkpoint, keeps original run ID, and never rewrites manifest', t => {
  const directory = temporary(t);
  const first = open(t, directory);
  first.append(completed);
  first.saveCheckpoint({ id: completed.id, ply: 1 });
  const original = read(directory, 'run.json');
  first.close();
  const resumed = open(t, directory, { resume: true, manifest: { ...fixtureManifest, runId: 'new-invocation-id' } });
  assert.deepEqual(resumed.records, [completed]);
  assert.deepEqual(resumed.checkpoint, { id: completed.id, ply: 1 });
  assert.equal(resumed.manifest.runId, fixtureManifest.runId);
  assert.equal(json(directory, 'run.lock').runId, fixtureManifest.runId);
  assert.equal(read(directory, 'run.json'), original);
  resumed.append({ id: 'pair-1-black', attempt: 1, status: 'error', error: 'engine exited' });
  assert.equal(read(directory, 'games.jsonl').split('\n').length, 3);
});

test('existing runs require explicit resume and failed opens release the lock', t => {
  const directory = temporary(t);
  open(t, directory).close();
  assert.throws(() => openStore({ outDir: directory, manifest: fixtureManifest }), /already exists/);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
  open(t, directory, { resume: true }).close();
  const fresh = path.join(directory, 'absent');
  assert.throws(() => openStore({ outDir: fresh, resume: true, manifest: fixtureManifest }), /does not exist/);
  assert.equal(fs.existsSync(path.join(fresh, 'run.lock')), false);
});

test('resume rejects each identity mismatch and unsupported manifest schemas', t => {
  const directory = temporary(t);
  open(t, directory).close();
  for (const field of ['configHash', 'rulesHash', 'engineSha256']) {
    assert.throws(() => openStore({ outDir: directory, resume: true, manifest: { ...fixtureManifest, [field]: 'different' } }), new RegExp(field));
    assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
  }
  assert.throws(() => openStore({ outDir: directory, resume: true, manifest: { ...fixtureManifest, schemaVersion: 2 } }), /schemaVersion/);
  const manifest = json(directory, 'run.json');
  manifest.schemaVersion = 2;
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(manifest));
  assert.throws(() => openStore({ outDir: directory, resume: true, manifest: fixtureManifest }), /schemaVersion/);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
});

test('another process cannot open a live run, even in resume mode', t => {
  const directory = temporary(t);
  open(t, directory);
  const storage = path.resolve(__dirname, '../scripts/balance/storage.js');
  const code = `const { openStore } = require(${JSON.stringify(storage)});\ntry { openStore(${JSON.stringify({ outDir: directory, resume: true, manifest: fixtureManifest })}); process.exitCode = 2; } catch (error) { console.log(error.message); }`;
  const child = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /locked by process/);
  assert.equal(json(directory, 'run.lock').pid, process.pid);
});

test('a definitely dead owner can be reclaimed, but unknown locks are preserved', t => {
  const directory = temporary(t);
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  assert.equal(child.status, 0);
  const deadPid = Number(child.stdout);
  fs.writeFileSync(path.join(directory, 'run.lock'), JSON.stringify({ pid: deadPid, token: 'old-token', runId: 'old-run' }));
  const store = open(t, directory);
  assert.equal(json(directory, 'run.lock').pid, process.pid);
  assert.notEqual(json(directory, 'run.lock').token, 'old-token');
  assert.equal(fs.existsSync(path.join(directory, 'run.lock.reclaim')), false);
  store.close();
  fs.writeFileSync(path.join(directory, 'run.lock'), 'partly written');
  assert.throws(() => openStore({ outDir: directory, resume: true, manifest: fixtureManifest }), /refusing to remove/);
  assert.equal(read(directory, 'run.lock'), 'partly written');
});

test('close removes only its own lock token', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  const otherOwner = { pid: process.pid, token: 'replacement-token', runId: 'replacement-run' };
  fs.writeFileSync(path.join(directory, 'run.lock'), JSON.stringify(otherOwner));
  store.close();
  assert.deepEqual(json(directory, 'run.lock'), otherOwner);
});

test('resume backs up and truncates only an unterminated final JSONL record', t => {
  const directory = temporary(t);
  const initial = open(t, directory);
  initial.append(completed);
  initial.close();
  const good = read(directory, 'games.jsonl');
  const partial = good + '{"id":"pair-1-black","attempt":1,"status":"ab';
  fs.writeFileSync(path.join(directory, 'games.jsonl'), partial);
  const resumed = open(t, directory, { resume: true });
  assert.deepEqual(resumed.records, [completed]);
  assert.equal(read(directory, 'games.jsonl'), good);
  const backups = fs.readdirSync(directory).filter(name => name.startsWith('games.jsonl.recovery-'));
  assert.equal(backups.length, 1);
  assert.equal(read(directory, backups[0]), partial);
  resumed.append({ id: 'pair-1-black', attempt: 2, status: 'completed', result: '1/2-1/2' });
  assert.equal(read(directory, 'games.jsonl').split('\n').length, 3);
});

test('a JSON object without its final newline is an incomplete append and is backed up', t => {
  const directory = temporary(t);
  open(t, directory).close();
  fs.writeFileSync(path.join(directory, 'games.jsonl'), JSON.stringify(completed));
  const resumed = open(t, directory, { resume: true });
  assert.deepEqual(resumed.records, []);
  assert.equal(read(directory, 'games.jsonl'), '');
  assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.bak')).length, 1);
});

test('malformed middle or newline-terminated final records are rejected without modification', t => {
  const directory = temporary(t);
  open(t, directory).close();
  for (const content of [
    JSON.stringify(completed) + '\n{broken}\n' + JSON.stringify(completed) + '\n',
    JSON.stringify(completed) + '\n{broken}\n',
    JSON.stringify(completed) + '\n\n',
  ]) {
    fs.writeFileSync(path.join(directory, 'games.jsonl'), content);
    assert.throws(() => openStore({ outDir: directory, resume: true, manifest: fixtureManifest }), /line 2/);
    assert.equal(read(directory, 'games.jsonl'), content);
    assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
    assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.bak')).length, 0);
  }
});

test('checkpoint replacement uses a synced temporary file in the same directory', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  store.saveCheckpoint({ ply: 1 });
  const originalRename = fs.renameSync;
  const renames = [];
  t.mock.method(fs, 'renameSync', (from, to) => {
    renames.push([from, to]);
    assert.equal(path.dirname(from), directory);
    assert.equal(path.dirname(to), directory);
    assert.equal(json(directory, 'checkpoint.json').ply, 1);
    assert.equal(JSON.parse(fs.readFileSync(from, 'utf8')).ply, 2);
    return originalRename(from, to);
  });
  store.saveCheckpoint({ ply: 2 });
  assert.equal(renames.length, 1);
  assert.equal(json(directory, 'checkpoint.json').ply, 2);
  assert.deepEqual(store.checkpoint, { ply: 2 });
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
});

test('failed atomic replacement leaves the previous checkpoint intact and cleans temporary files', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  store.saveCheckpoint({ ply: 1 });
  t.mock.method(fs, 'renameSync', () => { throw new Error('simulated disk failure'); });
  assert.throws(() => store.saveCheckpoint({ ply: 2 }), /simulated disk failure/);
  assert.deepEqual(json(directory, 'checkpoint.json'), { ply: 1 });
  assert.deepEqual(store.checkpoint, { ply: 1 });
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
});

test('record validation rejects missing IDs, attempts, and statuses before appending', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  for (const record of [null, {}, { ...completed, id: '' }, { ...completed, attempt: 0 }, { ...completed, status: 'draw' }]) {
    assert.throws(() => store.append(record));
  }
  assert.equal(read(directory, 'games.jsonl'), '');
  assert.deepEqual(store.records, []);
});

test('orphaned output files cannot be silently adopted by a new run', t => {
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, 'games.jsonl'), JSON.stringify(completed) + '\n');
  assert.throws(() => openStore({ outDir: directory, manifest: fixtureManifest }), /without run.json/);
  assert.equal(fs.existsSync(path.join(directory, 'run.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
});

test('transient sharing failures retry the same checkpoint rename without removing its destination', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  store.saveCheckpoint({ ply: 1 });
  const rename = fs.renameSync;
  const unlink = fs.unlinkSync;
  const sources = [];
  const delays = [];
  const codes = ['EPERM', 'EACCES', 'EBUSY'];
  t.mock.method(Atomics, 'wait', (_array, _index, _value, delay) => { delays.push(delay); });
  t.mock.method(fs, 'unlinkSync', file => {
    assert.notEqual(file, path.join(directory, 'checkpoint.json'));
    return unlink(file);
  });
  t.mock.method(fs, 'renameSync', (from, to) => {
    sources.push(from);
    assert.equal(json(directory, 'checkpoint.json').ply, 1);
    assert.equal(JSON.parse(fs.readFileSync(from, 'utf8')).ply, 2);
    if (codes.length) throw Object.assign(new Error('temporary sharing violation'), { code: codes.shift() });
    return rename(from, to);
  });
  store.saveCheckpoint({ ply: 2 });
  assert.equal(sources.length, 4);
  assert.equal(new Set(sources).size, 1);
  assert.equal(delays.length, 3);
  assert.deepEqual(store.checkpoint, { ply: 2 });
  assert.deepEqual(json(directory, 'checkpoint.json'), { ply: 2 });
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
});

test('persistent sharing failure is bounded and leaves the prior checkpoint and journal resumable', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  store.append(completed);
  store.saveCheckpoint({ ply: 1 });
  const journal = read(directory, 'games.jsonl');
  const cause = Object.assign(new Error('sharing violation'), { code: 'EPERM' });
  let attempts = 0;
  let delayTotal = 0;
  t.mock.method(Atomics, 'wait', (_array, _index, _value, delay) => { delayTotal += delay; });
  t.mock.method(fs, 'renameSync', () => { attempts++; throw cause; });
  assert.throws(() => store.saveCheckpoint({ ply: 2 }), error => {
    assert.equal(error.code, 'EPERM');
    assert.equal(error.cause, cause);
    assert.match(error.message, /checkpoint\.json.*attempts/);
    return true;
  });
  assert.ok(attempts > 1 && attempts <= 10);
  assert.ok(delayTotal >= 1000 && delayTotal <= 2000);
  assert.deepEqual(store.checkpoint, { ply: 1 });
  assert.deepEqual(json(directory, 'checkpoint.json'), { ply: 1 });
  assert.equal(read(directory, 'games.jsonl'), journal);
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
  store.close();
  const resumed = open(t, directory, { resume: true });
  assert.deepEqual(resumed.records, [completed]);
  assert.deepEqual(resumed.checkpoint, { ply: 1 });
});

test('failed temporary cleanup preserves the primary write failure and reports its secondary error', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  store.saveCheckpoint({ ply: 1 });
  const primary = new Error('primary rename failure');
  const unlink = fs.unlinkSync;
  t.mock.method(Atomics, 'wait', () => {});
  t.mock.method(fs, 'renameSync', () => { throw primary; });
  t.mock.method(fs, 'unlinkSync', file => {
    if (file.endsWith('.tmp')) throw Object.assign(new Error('cleanup sharing violation'), { code: 'EBUSY' });
    return unlink(file);
  });
  assert.throws(() => store.saveCheckpoint({ ply: 2 }), error => error === primary);
  assert.equal(primary.cleanupErrors.length, 1);
  assert.equal(primary.cleanupErrors[0].code, 'EBUSY');
  assert.deepEqual(json(directory, 'checkpoint.json'), { ply: 1 });
  for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.tmp'))) unlink(path.join(directory, file));
});

test('lock cleanup retries sharing failures and rechecks its owner before each attempt', t => {
  const directory = temporary(t);
  const store = open(t, directory);
  const lock = path.join(directory, 'run.lock');
  const unlink = fs.unlinkSync;
  let attempts = 0;
  t.mock.method(fs, 'unlinkSync', file => {
    if (file === lock && attempts++ === 0) throw Object.assign(new Error('lock busy'), { code: 'EACCES' });
    return unlink(file);
  });
  t.mock.method(Atomics, 'wait', () => {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token: 'replacement-owner', runId: 'other-run' }));
  });
  store.close();
  assert.equal(attempts, 1);
  assert.equal(json(directory, 'run.lock').token, 'replacement-owner');
});
