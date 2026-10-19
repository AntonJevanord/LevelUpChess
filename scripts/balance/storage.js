const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const STATUSES = new Set(['completed', 'truncated', 'aborted', 'error']);
const IDENTITY_FIELDS = ['configHash', 'rulesHash', 'engineSha256'];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Cannot read ${path.basename(file)}: ${error.message}`, { cause: error }); }
}

function syncDirectory(directory) {
  let fd;
  try {
    fd = fs.openSync(directory, 'r');
    fs.fsyncSync(fd);
  } catch (error) {
    // Windows and some filesystems do not support opening/fsyncing directories.
    if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function atomicWrite(directory, name, content) {
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, path.join(directory, name));
    syncDirectory(directory);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function lockOwner(file) {
  let owner;
  try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot establish ownership of ${path.basename(file)}; refusing to remove it.`, { cause: error });
  }
  if (!owner || !Number.isInteger(owner.pid) || owner.pid < 1 || typeof owner.token !== 'string') {
    throw new Error(`Invalid owner in ${path.basename(file)}; refusing to remove it.`);
  }
  return owner;
}

function definitelyDead(pid) {
  try { process.kill(pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}

function removeOwnedLock(file, token) {
  const owner = lockOwner(file);
  if (owner?.token === token) fs.unlinkSync(file);
}

function createLock(file, owner) {
  const fd = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(fd, JSON.stringify(owner) + '\n', 'utf8');
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    try { fs.unlinkSync(file); } catch { /* Preserve the original write failure. */ }
    throw error;
  }
  fs.closeSync(fd);
}

function acquireLock(directory, runId) {
  const file = path.join(directory, 'run.lock');
  const owner = { pid: process.pid, token: randomUUID(), runId, createdAt: new Date().toISOString() };
  try {
    createLock(file, owner);
    return () => removeOwnedLock(file, owner.token);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const existing = lockOwner(file);
  if (existing && !definitelyDead(existing.pid)) throw new Error(`Run is locked by process ${existing.pid}.`);

  // Serialize stale-lock reclamation, so two starters cannot delete each other's new lock.
  const reclaim = path.join(directory, 'run.lock.reclaim');
  try { createLock(reclaim, owner); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another process is reclaiming the run lock; retry after it finishes.');
    throw error;
  }
  try {
    const current = lockOwner(file);
    if (current) {
      if (!definitelyDead(current.pid)) throw new Error(`Run is locked by process ${current.pid}.`);
      fs.unlinkSync(file);
    }
    try { createLock(file, owner); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Another process acquired the run lock.');
      throw error;
    }
  } finally { removeOwnedLock(reclaim, owner.token); }
  return () => removeOwnedLock(file, owner.token);
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('A run manifest is required.');
  const result = JSON.parse(JSON.stringify(manifest));
  if (result.schemaVersion === undefined) result.schemaVersion = 1;
  if (result.schemaVersion !== 1) throw new Error('Unsupported run manifest schemaVersion; expected 1.');
  for (const field of ['runId', ...IDENTITY_FIELDS]) {
    if (typeof result[field] !== 'string' || !result[field]) throw new Error(`Manifest ${field} must be a nonempty string.`);
  }
  return result;
}

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Game record must be an object.');
  if (!(typeof record.id === 'string' && record.id) && !(Number.isInteger(record.id) && record.id >= 0)) {
    throw new Error('Game record id must be a nonempty string or a nonnegative integer.');
  }
  if (!Number.isInteger(record.attempt) || record.attempt < 1) throw new Error('Game record attempt must be a positive integer.');
  if (!STATUSES.has(record.status)) throw new Error(`Invalid game record status: ${record.status}.`);
}

function readRecords(directory) {
  const file = path.join(directory, 'games.jsonl');
  let content;
  try { content = fs.readFileSync(file); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const end = content.lastIndexOf(10) + 1;
  const records = [];
  const lines = content.subarray(0, end).toString('utf8').split('\n');
  lines.pop();
  for (let index = 0; index < lines.length; index++) {
    try {
      const record = JSON.parse(lines[index]);
      validateRecord(record);
      records.push(record);
    } catch (error) {
      throw new Error(`Invalid games.jsonl record on line ${index + 1}; refusing recovery of a complete line.`, { cause: error });
    }
  }
  if (end !== content.length) {
    const backup = path.join(directory, `games.jsonl.recovery-${randomUUID()}.bak`);
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    const backupFd = fs.openSync(backup, 'r+');
    try { fs.fsyncSync(backupFd); } finally { fs.closeSync(backupFd); }
    syncDirectory(directory);
    const fd = fs.openSync(file, 'r+');
    try { fs.ftruncateSync(fd, end); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    syncDirectory(directory);
  }
  return records;
}

function openStore({ outDir, resume = false, manifest: requestedManifest } = {}) {
  if (typeof outDir !== 'string' || !outDir) throw new Error('An output directory is required.');
  const requested = validateManifest(requestedManifest);
  const directory = path.resolve(outDir);
  fs.mkdirSync(directory, { recursive: true });
  const manifestFile = path.join(directory, 'run.json');
  const original = resume && fs.existsSync(manifestFile) ? validateManifest(readJson(manifestFile)) : null;
  const unlock = acquireLock(directory, original?.runId || requested.runId);
  let recordsFd;
  try {
    const exists = fs.existsSync(manifestFile);
    if (exists && !resume) throw new Error('run.json already exists; use resume or choose a new output directory.');
    if (!exists && resume) throw new Error('Cannot resume: run.json does not exist.');
    if (!exists && ['games.jsonl', 'checkpoint.json', 'summary.json', 'games.pgn'].some(name => fs.existsSync(path.join(directory, name)))) {
      throw new Error('Run output already exists without run.json; choose a new output directory.');
    }
    const manifest = exists ? validateManifest(readJson(manifestFile)) : requested;
    if (resume) for (const field of IDENTITY_FIELDS) {
      if (manifest[field] !== requested[field]) throw new Error(`Cannot resume: ${field} does not match the original run.`);
    }
    if (!exists) {
      const fd = fs.openSync(manifestFile, 'wx');
      try { fs.writeFileSync(fd, JSON.stringify(manifest, null, 2) + '\n'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      syncDirectory(directory);
    }
    const records = readRecords(directory);
    const checkpointFile = path.join(directory, 'checkpoint.json');
    let checkpoint = fs.existsSync(checkpointFile) ? readJson(checkpointFile) : null;
    recordsFd = fs.openSync(path.join(directory, 'games.jsonl'), 'a');
    syncDirectory(directory);
    let closed = false;
    const assertOpen = () => { if (closed) throw new Error('Run store is closed.'); };
    const saveJson = (name, data) => {
      const serialized = JSON.stringify(data, null, 2);
      if (serialized === undefined) throw new Error(`${name} must contain a JSON value.`);
      atomicWrite(directory, name, serialized + '\n');
      return JSON.parse(serialized);
    };
    return {
      manifest,
      records,
      get checkpoint() { return checkpoint; },
      append(record) {
        assertOpen();
        validateRecord(record);
        const serialized = JSON.stringify(record);
        const persisted = JSON.parse(serialized);
        validateRecord(persisted);
        fs.writeFileSync(recordsFd, serialized + '\n', 'utf8');
        fs.fsyncSync(recordsFd);
        records.push(persisted);
      },
      saveCheckpoint(state) { assertOpen(); checkpoint = saveJson('checkpoint.json', state); },
      saveSummary(summary) { assertOpen(); saveJson('summary.json', summary); },
      savePgn(text) {
        assertOpen();
        if (typeof text !== 'string') throw new Error('PGN must be a string.');
        atomicWrite(directory, 'games.pgn', text);
      },
      close() {
        if (closed) return;
        closed = true;
        try { fs.closeSync(recordsFd); }
        finally { unlock(); }
      },
    };
  } catch (error) {
    if (recordsFd !== undefined) fs.closeSync(recordsFd);
    unlock();
    throw error;
  }
}

module.exports = { openStore };
