'use strict';

// The original stage journals remain authoritative. The campaign owns this
// append-only index, scoped by stage, game and attempt; its caller holds the
// campaign lock. Reading a report never repairs or otherwise changes evidence.
const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'levelup-level3-panel-game';
const FILE = 'games.jsonl';
const STATUSES = new Set(['completed', 'truncated', 'aborted', 'error']);
const ENVELOPE_FIELDS = ['format', 'record', 'runId', 'schemaVersion', 'stageConfigSha256', 'stageKey'];
const fail = message => { throw new Error(`Level-three campaign journal: ${message}`); };
const string = value => typeof value === 'string' && value.length > 0;

function canonical(value, parents = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || parents.has(value)) fail('records must contain finite JSON values.');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('records must contain plain JSON objects.');
  parents.add(value);
  const result = Array.isArray(value) ? value.map(child => canonical(child, parents))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], parents)]));
  parents.delete(value);
  return result;
}
const serialized = value => JSON.stringify(canonical(value));
const identity = envelope => JSON.stringify([envelope.stageKey, envelope.record.id, envelope.record.attempt]);

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || !string(record.id)
    || !Number.isSafeInteger(record.attempt) || record.attempt < 1 || !STATUSES.has(record.status)) {
    fail('every source record requires a game ID, positive attempt and valid status.');
  }
  canonical(record);
  return record;
}

function sources(stages) {
  if (!Array.isArray(stages)) fail('declare all source stage contexts.');
  const expected = new Map(), byStage = new Map();
  for (const stage of stages) {
    if (!stage || !string(stage.key) || byStage.has(stage.key)
      || !/^[a-f0-9]{64}$/.test(stage.configSha256 || '') || !string(stage.manifest?.runId)
      || !Array.isArray(stage.records)) fail('each stage requires a distinct key, config SHA-256, original run ID and records.');
    byStage.set(stage.key, stage);
    for (const record of stage.records) {
      validateRecord(record);
      const envelope = { schemaVersion: 1, format: FORMAT, stageKey: stage.key,
        stageConfigSha256: stage.configSha256, runId: stage.manifest.runId, record };
      const key = identity(envelope), previous = expected.get(key);
      if (previous && serialized(previous) !== serialized(envelope)) fail(`conflicting source copies of ${stage.key}/${record.id}, attempt ${record.attempt}.`);
      if (!previous) expected.set(key, envelope);
    }
  }
  return { expected, byStage };
}

function validateEnvelope(envelope, source, seen) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || serialized(Object.keys(envelope).sort()) !== serialized(ENVELOPE_FIELDS)
    || envelope.schemaVersion !== 1 || envelope.format !== FORMAT) fail('unsupported or foreign aggregate envelope.');
  const stage = source.byStage.get(envelope.stageKey);
  if (!stage || stage.configSha256 !== envelope.stageConfigSha256 || stage.manifest.runId !== envelope.runId) fail(`unknown or changed source context ${envelope.stageKey}.`);
  validateRecord(envelope.record);
  const key = identity(envelope), expected = source.expected.get(key);
  if (!expected || serialized(expected) !== serialized(envelope)) fail(`aggregate differs from its original source: ${envelope.stageKey}/${envelope.record.id}, attempt ${envelope.record.attempt}.`);
  if (seen.has(key)) fail(`duplicate aggregate identity ${envelope.stageKey}/${envelope.record.id}, attempt ${envelope.record.attempt}.`);
  seen.add(key);
  return envelope;
}

function inspect(root, stages) {
  const source = sources(stages), file = path.join(root, FILE);
  let input = Buffer.alloc(0), exists = false;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('aggregate must be an ordinary file.');
    input = fs.readFileSync(file); exists = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const end = input.lastIndexOf(10) + 1, prefix = input.subarray(0, end).toString('utf8');
  const records = [], seen = new Set();
  for (const line of prefix.split('\n').slice(0, -1)) {
    let envelope;
    try { envelope = JSON.parse(line); }
    catch (cause) { throw new Error('Level-three campaign journal: a complete line is corrupt; original bytes were preserved.', { cause }); }
    records.push(validateEnvelope(envelope, source, seen));
  }
  const tail = input.subarray(end), missingNewline = { value: false };
  let repairedBytes = 0;
  if (tail.length) {
    let envelope, valid = false;
    try { envelope = JSON.parse(tail.toString('utf8')); valid = true; } catch { /* Partial EOF line: only the campaign writer may repair it. */ }
    if (valid) { records.push(validateEnvelope(envelope, source, seen)); missingNewline.value = true; }
    else repairedBytes = tail.length;
  }
  const missing = [...source.expected].filter(([key]) => !seen.has(key)).map(([, envelope]) => envelope);
  return { file, exists, size: input.length, end, records, missing, repairedBytes, missingNewline: missingNewline.value };
}

function readJournal(root, stages) {
  const state = inspect(root, stages);
  return { count: state.records.length, records: state.records, appended: 0, repairedBytes: 0,
    partialTailBytes: state.repairedBytes, missingNewline: state.missingNewline };
}

function syncJournal(root, stages) {
  // Inspect every complete source and aggregate line before opening a file for
  // mutation. A mismatched later source must not leave earlier sources appended.
  const state = inspect(root, stages);
  if (!state.missing.length && !state.repairedBytes && !state.missingNewline) return { count: state.records.length, records: state.records, appended: 0, repairedBytes: 0 };
  let fd;
  try {
    fd = fs.openSync(state.file, state.exists ? 'r+' : 'wx');
    if (state.repairedBytes) fs.ftruncateSync(fd, state.end);
    let position = state.repairedBytes ? state.end : state.size;
    const append = content => {
      const bytes = Buffer.from(content);
      let written = 0;
      while (written < bytes.length) {
        const count = fs.writeSync(fd, bytes, written, bytes.length - written, position + written);
        if (!count) fail('the filesystem could not append a complete line.');
        written += count;
      }
      position += bytes.length;
    };
    if (state.missingNewline) append('\n');
    for (const envelope of state.missing) append(JSON.stringify(envelope) + '\n');
    fs.fsyncSync(fd);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
  const records = [...state.records, ...state.missing];
  return { count: records.length, records, appended: state.missing.length, repairedBytes: state.repairedBytes };
}

module.exports = { FORMAT, FILE, readJournal, syncJournal };
