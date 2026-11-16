'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const evidence = require('../scripts/balance/v18-followup-evidence');
const original = require('../scripts/balance/v18-screen-evidence');
let input;
test.before(() => { input = evidence.loadEvidence(); });
const study = name => input.studies.find(row => row.study === name);
const sources = name => study(name).stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, records: [...stage.records] }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);

test('four completed journals reproduce both held-out follow-up reports without invented native provenance', () => {
  assert.deepEqual(input.studies.map(row => [row.study, row.counts.scheduledGames, row.counts.attempts]), [
    ['level1-followup', 768, 768], ['level2-followup', 864, 864],
  ]);
  assert.ok(input.studies.every(row => row.uploadedNumericTablesReproducedExactly));
  assert.equal(input.descriptors.baseTag, 'v0.18.4');
  for (const flag of ['originalCampaignManifestsSupplied', 'originalStageManifestsSupplied', 'nativePreflightSupplied', 'legalMovesIndependentlyReplayed']) assert.equal(evidence.PROVENANCE[flag], false);
  assert.equal(evidence.PROVENANCE.engineSha256, null);
  assert.ok(input.studies.every(row => row.counts.completedGames === row.counts.finalizedGames && row.counts.retries === 0));
});

test('archives preserve exact source bytes and a corrupted upload cannot enter the audit', () => {
  assert.throws(() => evidence.loadEvidence({ readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[35] ^= 1; return bytes;
  } }), /Archive changed/);
  assert.throws(() => original.parseJournal(Buffer.from('{"id":"torn"}')), /complete newline/);
  for (const row of input.studies) assert.equal(row.counts.attempts, row.counts.pairedGames);
});

test('NmQ and BgB0 gains retain fresh controls, all opponents and both opening halves', () => {
  const report = study('level1-followup').report.reports[0];
  const expected = { 'positional-control': 0.3177083333333333, 'positional-quiet-queen': 0.4635416666666667,
    'positional-quiet-king': 0.1875, 'hopping-control': 0.3020833333333333,
    'hopper-quiet-range': 0.34375, 'hopper-full-range': 0.484375,
    'baby-amazon-control': 0.3125, 'blink-queen': 0.390625 };
  for (const [key, value] of Object.entries(expected)) close(report.rows.find(row => row.key === key).score, value);
  const quiet = report.gains.find(row => row.key === 'positional-quiet-queen');
  assert.equal(quiet.control, 'positional-control'); assert.equal(quiet.sharedOpenings, 16);
  close(quiet.difference, 0.14583333333333334);
  close(report.gains.find(row => row.key === 'hopper-full-range').difference, 0.18229166666666669);
  assert.deepEqual(report.cohorts.map(cohort => [cohort.openingIds[0], cohort.openingIds.at(-1)]), [
    ['l3-panel-17', 'l3-panel-24'], ['l3-panel-25', 'l3-panel-32'],
  ]);
});

test('level-two knight and pawn results keep valuation and opponent effects separate', () => {
  const report = study('level2-followup').report.reports[0];
  const expected = { 'knight-nwd': 0.6614583333333334, 'knight-nwh': 0.7708333333333334,
    'knight-nfa': 0.6145833333333334, 'knight-nad': 0.640625,
    'bishop-pawn-control': 0.20833333333333334, 'bishop-pawn-range': 0.453125,
    'bishop-pawn-jump': 0.4270833333333333 };
  for (const [key, value] of Object.entries(expected)) close(report.rows.find(row => row.key === key).score, value);
  assert.deepEqual(report.rows.find(row => row.key === 'knight-nwh').opponents.map(row => row.score), [0.8125, 0.75, 0.75]);
  assert.deepEqual(report.rows.find(row => row.key === 'bishop-pawn-range').opponents.map(row => row.score), [0.484375, 0.46875, 0.40625]);
  const values = study('level2-followup').report.evaluationAudit.values;
  for (const id of ['pawn.bishop-step-current@1', 'pawn.bishop-diagonal-range@1', 'pawn.bishop-diagonal-jump@1']) {
    assert.deepEqual(values.find(row => row.id === id).applied, { mg: 536, eg: 592 });
    assert.equal(values.find(row => row.id === id).anchorId, 'pawn.knight-tall-quiet@1');
  }
  assert.equal(report.gains.find(row => row.key === 'bishop-pawn-range').control, 'bishop-pawn-control');
});

test('duplicate journals, incomplete stages and foreign contexts cannot become additional results', () => {
  const duplicate = sources('level1-followup'); duplicate[0].records.push(duplicate[0].records[0]);
  assert.throws(() => evidence.analyzeStudy('level1-followup', duplicate, input.descriptors), /Duplicate uploaded attempt/);
  const repeated = sources('level1-followup'); repeated[1] = repeated[0];
  assert.throws(() => evidence.analyzeStudy('level1-followup', repeated, input.descriptors), /Duplicate source stage/);
  assert.throws(() => evidence.analyzeStudy('level1-followup', repeated.slice(0, 1), input.descriptors), /Every expected/);
  const missing = sources('level2-followup'); missing[0].records.pop();
  assert.throws(() => evidence.analyzeStudy('level2-followup', missing, input.descriptors), /unfinished/);
  for (const patch of [{ profileHash: '0'.repeat(64) }, { evaluation: null }, { result: '*' }, { reason: 'unknown' },
    { openingId: 'l3-panel-01' }, { openingMoves: [] }, { startFen: 'foreign' },
    { engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 } }, { totalPlies: 999 }]) {
    const rows = sources('level2-followup'); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy('level2-followup', rows, input.descriptors));
  }
});

test('control mappings come from the archived roster and cannot silently point at another body', () => {
  const descriptors = structuredClone(input.descriptors);
  descriptors.rosters['level1-followup'].find(row => row.key === 'positional-quiet-queen').controlKey = 'baby-amazon-control';
  const uploaded = original.readPinned(input.pins.studies['level1-followup'].uploadedReport).toString('utf8');
  assert.throws(() => evidence.analyzeStudy('level1-followup', sources('level1-followup'), descriptors, uploaded), /gains differ/);
  const missing = structuredClone(input.descriptors);
  missing.rosters['level2-followup'].find(row => row.key === 'knight-nwd').controlKey = 'missing-control';
  assert.throws(() => evidence.analyzeStudy('level2-followup', sources('level2-followup'), missing), /Unknown archived matched control/);
});

test('uploaded priors, control labels, gains, ranges and actual held-out cohort labels are checked', () => {
  const uploaded = original.readPinned(input.pins.studies['level1-followup'].uploadedReport).toString('utf8');
  for (const changed of [uploaded.replace('768 scheduled games', '767 scheduled games'),
    uploaded.replace('46.35%', '47.00%'), uploaded.replace('14.58 | 4.69', '15.58 | 4.69'),
    uploaded.replace('| 2 × Positional knight control | 16 |', '| Baby Amazon control | 16 |'),
    uploaded.replace('l3-panel-17 … l3-panel-24', 'l3-panel-01 … l3-panel-08'),
    uploaded.replace('2771 / 2833', '2772 / 2833')]) {
    assert.throws(() => evidence.verifyUploadedReport('level1-followup', study('level1-followup').report, changed));
  }
});

test('adding optional follow-up settings preserves the old archive and all default audit output', () => {
  const before = original.main([], { log() {} });
  const audit = evidence.main([], { log() {} });
  const after = original.main([], { log() {} });
  assert.deepEqual(after, before);
  assert.equal(before.counts.finalizedGames, 3680);
  assert.deepEqual(audit.counts, { attempts: 1632, scheduledGames: 1632, finalizedGames: 1632, completedGames: 1632,
    truncatedGames: 0, errorAttempts: 0, abortedAttempts: 0, retries: 0, pairedGames: 1632,
    completePairs: 816, newMatchGames: 0, engineSearches: 0 });
  assert.throws(() => evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
