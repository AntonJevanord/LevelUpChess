'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getCampaign } = require('../scripts/balance/rook-values-report');
const { readControlArchive, validateControlRecords, OPENING_GROUPS } = require('../scripts/balance/material-control-source');

const ARCHIVE = path.resolve(__dirname, '../experiments/balance/results');
const JOURNAL = 'rook-values-auto-001.games.jsonl';
const AUDIT = 'rook-values-auto-001.audit.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const records = () => fs.readFileSync(path.join(ARCHIVE, JOURNAL), 'utf8').trim().split('\n').map(JSON.parse);
function copied(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-material-control-source-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of [JOURNAL, AUDIT]) fs.copyFileSync(path.join(ARCHIVE, file), path.join(directory, file));
  return directory;
}

test('control adapter selects exactly 80 automatic controls and preserves original full mapping', () => {
  const source = readControlArchive(), expected = getCampaign().policies.auto;
  assert.equal(source.sources.length, 1);
  assert.equal(source.sources[0].records.length, 80);
  assert.deepEqual(source.selection.comparisons, { 'standard-control': 40, 'amazon-control': 40 });
  assert.equal(source.selection.sourceRecords, 200); assert.equal(source.selection.excludedSubjectRecords, 120);
  assert.equal(source.selection.materialHandicaps, false);
  assert.deepEqual(source.profile, expected.profile);
  assert.equal(source.profile.registry.allocations.length, 4);
  assert.deepEqual(source.profile.registry.allocations.map(item => item.id), [
    'queen.purple@1', 'rook.purple@3', 'rook.purple@4', 'rook.purple@5',
  ]);
  assert.ok(source.sources[0].records.every(record => ['standard-control', 'amazon-control'].includes(record.comparisonId)));
  assert.equal(source.sources[0].identity.engineIdentityVerified, false);
  assert.equal(source.sources[0].identity.sourceIdentityVerified, false);
});

test('checksum and protocol metadata match evidence without altering original journals', () => {
  const before = fs.readFileSync(path.join(ARCHIVE, JOURNAL));
  const source = readControlArchive();
  assert.deepEqual(fs.readFileSync(path.join(ARCHIVE, JOURNAL)), before);
  assert.equal(source.inputs[0].sha256, digest(before));
  assert.equal(source.inputs[0].bytes, before.length);
  assert.equal(source.sources[0].metadata.originalJournal.sha256, digest(before));
  assert.ok(source.protocolConfigFiles.every(file => fs.existsSync(file)));
  assert.equal(source.protocolConfigFiles.length, 3);
});

test('history fingerprints expose all 40 duplicate copies instead of inventing 80 independent histories', () => {
  const source = readControlArchive(), [input] = source.sources;
  assert.equal(source.selection.uniqueHistories, 40); assert.equal(source.selection.duplicateRecords, 40);
  assert.ok(Object.values(source.selection.historyGroups).every(group => group.length === 2));
  for (const record of input.records) {
    const expected = digest(JSON.stringify({ startFen: record.startFen, moves: record.moves,
      result: record.result, reason: record.reason, finalFen: record.finalFen }));
    assert.equal(source.historyHashes[record.id], expected);
    assert.equal(input.historyHashes[record.id], expected);
    assert.equal(source.selection.historyKeys[`${input.id}:${record.id}`], expected);
  }
});

test('related 20 opening prefixes form 7 semantic families without splitting to reach reporting gates', () => {
  const campaign = getCampaign().policies.auto;
  assert.deepEqual(Object.keys(OPENING_GROUPS).sort(), campaign.config.openings.map(opening => opening.id).sort());
  assert.equal(new Set(Object.values(OPENING_GROUPS)).size, 7);
  assert.equal(OPENING_GROUPS['open-e-pawns'], OPENING_GROUPS['open-knights-prefix']);
  assert.equal(OPENING_GROUPS['reversed-sicilian-prefix'], OPENING_GROUPS['anglo-indian-prefix']);
  assert.equal(OPENING_GROUPS['reti-sicilian-prefix'], OPENING_GROUPS['ordinary-knights-prefix']);
});

test('eight-point controls are excluded and adapter does not require that policy journal', t => {
  const directory = copied(t), source = readControlArchive(directory);
  assert.equal(source.selection.excludedPolicy, 'eight-point');
  assert.equal(source.selection.excludedOtherPolicyControlRecords, 80);
  assert.equal(source.selection.otherPolicyJournalLoaded, false);
  assert.deepEqual(fs.readdirSync(directory).sort(), [JOURNAL, AUDIT].sort());
});

test('raw evidence corruption and mismatched audit identity fail before selecting data', t => {
  const directory = copied(t);
  fs.appendFileSync(path.join(directory, JOURNAL), ' ');
  assert.throws(() => readControlArchive(directory), /checksum mismatch/);
  fs.copyFileSync(path.join(ARCHIVE, JOURNAL), path.join(directory, JOURNAL));
  const audit = JSON.parse(fs.readFileSync(path.join(directory, AUDIT), 'utf8'));
  audit.expectedProtocol.profileHash = '0'.repeat(64);
  fs.writeFileSync(path.join(directory, AUDIT), JSON.stringify(audit));
  assert.throws(() => readControlArchive(directory), /does not match/);
});

test('missing games, duplicate IDs and substituted schedule annotations cannot produce partial controls', () => {
  const missing = records(); missing.pop();
  assert.throws(() => validateControlRecords(missing), /complete 200-game schedule/);
  const duplicate = records(); duplicate[1] = structuredClone(duplicate[0]);
  assert.throws(() => validateControlRecords(duplicate), /distinct records/);
  const swapped = records(); swapped[0].comparisonId = 'standard-control';
  if (records()[0].comparisonId === 'standard-control') swapped[0].comparisonId = 'amazon-control';
  assert.throws(() => validateControlRecords(swapped), /schedule annotation/);
});

test('manual values, different strength and altered forced prefixes are rejected even in excluded subjects', () => {
  const manual = records(); manual[0].evaluation = { pieceValues: {} };
  assert.throws(() => validateControlRecords(manual), /profile\/evaluation mismatch/);
  const strength = records(); strength[0].whiteStrength = { skill: 5 };
  assert.throws(() => validateControlRecords(strength), /search\/strength settings/);
  const opening = records(); const target = opening.find(record => record.openingMoves.length > 0);
  target.openingMoves = [];
  assert.throws(() => validateControlRecords(opening), /move counts or prefix/);
});

test('controls require symmetric intact starting armies and selected records stay unchanged', () => {
  const source = records(), before = structuredClone(source);
  validateControlRecords(source); assert.deepEqual(source, before);
  const modified = records(), target = modified.find(record => record.comparisonId === 'standard-control');
  target.startFen = target.startFen.replace('pppppppp', '1ppppppp');
  assert.throws(() => validateControlRecords(modified), /starting army differs/);
});
