'use strict';

// Synthetic journal fixtures only: no engine processes or research games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FORMAT, readJournal, syncJournal } = require('../scripts/balance/level3-panel-journal');

function temporary(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-panel-journal-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function stage(key = 'batch-01-nodes-20000', records = [{ id: 'same-game-id', attempt: 1, status: 'completed', result: '1-0', moves: ['e2e4'] }]) {
  return { key, configSha256: 'a'.repeat(64), manifest: { runId: `original-${key}` }, records };
}
const journal = root => path.join(root, 'games.jsonl');

test('aggregate appends once per stage/game/attempt and scopes colliding native IDs by stage', t => {
  const root = temporary(t), first = stage(), second = stage('batch-01-nodes-40000');
  const result = syncJournal(root, [first, second]);
  assert.equal(result.count, 2); assert.equal(result.appended, 2); assert.equal(result.repairedBytes, 0);
  assert.deepEqual(result.records.map(row => row.stageKey), [first.key, second.key]);
  assert.ok(result.records.every(row => row.format === FORMAT && row.schemaVersion === 1));
  const bytes = fs.readFileSync(journal(root));
  assert.equal(syncJournal(root, [first, second]).appended, 0);
  assert.deepEqual(fs.readFileSync(journal(root)), bytes);
  const third = stage('batch-02-nodes-20000');
  assert.equal(syncJournal(root, [first, second, third]).appended, 1);
  assert.deepEqual(fs.readFileSync(journal(root)).subarray(0, bytes.length), bytes);
});

test('exact duplicate source copies are idempotent while retries are retained', t => {
  const root = temporary(t), first = stage(); first.records[0].status = 'aborted';
  first.records.push(structuredClone(first.records[0]));
  assert.equal(syncJournal(root, [first]).count, 1);
  first.records.push({ ...first.records[0], attempt: 2, status: 'completed' });
  const result = syncJournal(root, [first]);
  assert.equal(result.appended, 1); assert.equal(result.count, 2);
  assert.deepEqual(result.records.map(row => [row.record.attempt, row.record.status]), [[1, 'aborted'], [2, 'completed']]);
});

test('JSON key order is immaterial when comparing source records', t => {
  const root = temporary(t), first = stage(); syncJournal(root, [first]);
  first.records = [{ moves: ['e2e4'], result: '1-0', status: 'completed', attempt: 1, id: 'same-game-id' }];
  assert.equal(syncJournal(root, [first]).appended, 0);
});

test('every source is validated before an earlier missing record can be appended', t => {
  const root = temporary(t), first = stage(); syncJournal(root, [first]);
  const bytes = fs.readFileSync(journal(root));
  const extra = stage('batch-02-nodes-20000');
  for (const mutate of [
    row => { row.records[0].attempt = 0; },
    row => { row.records[0].id = ''; },
    row => { row.records[0].status = 'unknown'; },
    row => { row.records[0].bad = NaN; },
    row => { row.records[0].bad = undefined; },
    row => { row.records.push({ ...row.records[0], status: 'error' }); },
    row => { row.configSha256 = 'changed'; },
    row => { row.manifest.runId = ''; },
  ]) {
    const changed = structuredClone(extra); mutate(changed);
    assert.throws(() => syncJournal(root, [first, stage('valid-missing-stage'), changed]));
    assert.deepEqual(fs.readFileSync(journal(root)), bytes);
  }
});

test('changed run, config, record or unknown stage is rejected without changing aggregate bytes', t => {
  const root = temporary(t), first = stage(); syncJournal(root, [first]);
  const bytes = fs.readFileSync(journal(root));
  for (const stages of [[], [{ ...first, key: 'unknown' }], [{ ...first, configSha256: 'b'.repeat(64) }],
    [{ ...first, manifest: { runId: 'replacement' } }], [{ ...first, records: [{ ...first.records[0], result: '0-1' }] }],
    [{ ...first, records: [] }], [first, first]]) {
    assert.throws(() => syncJournal(root, stages));
    assert.deepEqual(fs.readFileSync(journal(root)), bytes);
  }
});

test('only partial EOF bytes are repaired and authoritative missing lines are reappended', t => {
  const root = temporary(t), first = stage(); syncJournal(root, [first]);
  const bytes = fs.readFileSync(journal(root));
  first.records.push({ ...first.records[0], id: 'new-game' });
  const torn = Buffer.from('{"schemaVersion":1,"format":"levelup-level3-');
  fs.appendFileSync(journal(root), torn);
  const beforeRead = fs.readFileSync(journal(root)), read = readJournal(root, [first]);
  assert.equal(read.count, 1); assert.equal(read.partialTailBytes, torn.length);
  assert.deepEqual(fs.readFileSync(journal(root)), beforeRead);
  const result = syncJournal(root, [first]);
  assert.equal(result.repairedBytes, torn.length); assert.equal(result.appended, 1); assert.equal(result.count, 2);
  assert.deepEqual(fs.readFileSync(journal(root)).subarray(0, bytes.length), bytes);
  assert.equal(readJournal(root, [first]).partialTailBytes, 0);
});

test('a complete valid envelope without newline is preserved rather than discarded', t => {
  const root = temporary(t), first = stage(); syncJournal(root, [first]);
  const bytes = fs.readFileSync(journal(root)); fs.writeFileSync(journal(root), bytes.subarray(0, -1));
  assert.equal(readJournal(root, [first]).missingNewline, true);
  const result = syncJournal(root, [first]);
  assert.equal(result.appended, 0); assert.equal(result.count, 1); assert.equal(result.repairedBytes, 0);
  assert.deepEqual(fs.readFileSync(journal(root)), bytes);
});

test('complete-line corruption, foreign envelopes and duplicate aggregate identities are never repaired', t => {
  for (const mutate of [
    bytes => Buffer.concat([bytes, Buffer.from('{broken}\n')]),
    bytes => Buffer.concat([bytes, bytes]),
    bytes => { const row = JSON.parse(bytes.toString()); row.extra = true; return Buffer.from(JSON.stringify(row) + '\n'); },
    bytes => { const row = JSON.parse(bytes.toString()); row.format = 'foreign'; return Buffer.from(JSON.stringify(row) + '\n'); },
    bytes => { const row = JSON.parse(bytes.toString()); row.stageKey = 'unknown'; return Buffer.from(JSON.stringify(row)); },
  ]) {
    const root = temporary(t), first = stage(); syncJournal(root, [first]);
    const changed = mutate(fs.readFileSync(journal(root))); fs.writeFileSync(journal(root), changed);
    assert.throws(() => syncJournal(root, [first])); assert.deepEqual(fs.readFileSync(journal(root)), changed);
  }
});

test('invalid later evidence does not trigger otherwise valid EOF repair', t => {
  const root = temporary(t), first = stage(); syncJournal(root, [first]);
  fs.appendFileSync(journal(root), '{partial'); const bytes = fs.readFileSync(journal(root));
  const bad = stage('later'); bad.records[0].attempt = -1;
  assert.throws(() => syncJournal(root, [first, bad]));
  assert.deepEqual(fs.readFileSync(journal(root)), bytes);
});

test('missing journals remain absent on read and symbolic links are refused', t => {
  const root = temporary(t), first = stage();
  assert.equal(readJournal(root, [first]).count, 0); assert.equal(fs.existsSync(journal(root)), false);
  const actual = path.join(root, 'original.jsonl'); fs.writeFileSync(actual, 'preserve');
  try { fs.symlinkSync(actual, journal(root)); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Symbolic links unavailable.'); return; } throw error; }
  assert.throws(() => syncJournal(root, [first]), /ordinary file/);
  assert.equal(fs.readFileSync(actual, 'utf8'), 'preserve');
});
