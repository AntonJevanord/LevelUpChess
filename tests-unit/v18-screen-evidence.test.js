'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const evidence = require('../scripts/balance/v18-screen-evidence');
let input;
test.before(() => { input = evidence.loadEvidence(); });
const study = name => input.studies.find(row => row.study === name);
const sources = name => study(name).stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, records: [...stage.records] }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);

test('eight complete journals reproduce all three reports numeric tables without invented native provenance', () => {
  assert.deepEqual(input.studies.map(row => [row.study, row.counts.scheduledGames, row.counts.attempts]), [
    ['level1', 864, 872], ['level2', 768, 768], ['mobility', 2048, 2048],
  ]);
  assert.ok(input.studies.every(row => row.uploadedNumericTablesReproducedExactly));
  assert.equal(input.descriptors.baseTag, 'v0.18.3');
  assert.equal(evidence.PROVENANCE.originalCampaignManifestsSupplied, false);
  assert.equal(evidence.PROVENANCE.originalStageManifestsSupplied, false);
  assert.equal(evidence.PROVENANCE.nativePreflightSupplied, false);
  assert.equal(evidence.PROVENANCE.legalMovesIndependentlyReplayed, false);
  assert.equal(evidence.PROVENANCE.engineSha256, null);
});

test('archived bytes are verified before any analysis and torn journal tails are refused', () => {
  assert.throws(() => evidence.loadEvidence({ readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[30] ^= 1; return bytes;
  } }), /Archive changed/);
  assert.throws(() => evidence.parseJournal(Buffer.from('{"id":"torn"}')), /complete newline/);
});

test('historical timeouts, interrupted starts and retries remain evidence without changing final pair scores', () => {
  const row = study('level1');
  assert.deepEqual(row.counts, { attempts: 872, scheduledGames: 864, finalizedGames: 864, completedGames: 863,
    truncatedGames: 1, errorAttempts: 6, abortedAttempts: 2, retries: 8, pairedGames: 862, completePairs: 431 });
  const all = row.stages.flatMap(stage => stage.records);
  assert.ok(all.some(record => record.status === 'aborted' && record.playedPlies === 0 && !record.engineNames.b));
  assert.ok(all.some(record => record.attempt > 1));
  assert.equal(row.report.reports[0].rows.find(row => row.key === 'pawn-rook').openingCoverage.shared, 15);
});

test('duplicate attempts, repeated stages, missing cases and foreign contexts fail closed', () => {
  const duplicate = sources('level2'); duplicate[0].records.push(duplicate[0].records[0]);
  assert.throws(() => evidence.analyzeStudy('level2', duplicate, input.descriptors), /Duplicate uploaded attempt/);
  const repeated = sources('level2'); repeated[1] = repeated[0];
  assert.throws(() => evidence.analyzeStudy('level2', repeated, input.descriptors), /Duplicate source stage/);
  assert.throws(() => evidence.analyzeStudy('level2', sources('level2').slice(1), input.descriptors), /Every expected/);
  const missing = sources('level2'); missing[0].records.pop();
  assert.throws(() => evidence.analyzeStudy('level2', missing, input.descriptors), /unfinished/);
  const foreign = sources('level2'); foreign[0].nodes = 20000;
  assert.throws(() => evidence.analyzeStudy('level2', foreign, input.descriptors), /Foreign node/);
  for (const patch of [{ schemaVersion: 2 }, { profileHash: '0'.repeat(64) }, { evaluation: null },
    { engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 } }, { whiteStrength: { skill: 1 } },
    { startFen: 'foreign' }, { openingMoves: [] }, { registryReference: 'other.json' }, { id: 'foreign' }]) {
    const rows = sources('level2'); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy('level2', rows, input.descriptors));
  }
});

test('result, history and terminal metadata corruption cannot become a scored game', () => {
  for (const patch of [{ totalPlies: 999 }, { sans: [] }, { reason: 'unknown' }, { result: '*' },
    { finalFen: 'foreign' }, { finishedAt: 'not-a-time' }, { lastInfo: null }]) {
    const rows = sources('mobility'); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy('mobility', rows, input.descriptors));
  }
});

test('Free Boar counter and promising L1 bodies retain their separate fixed-reference outcomes', () => {
  const l2 = study('level2').report.reports[0], boar = l2.rows.find(row => row.key === 'free-boar');
  close(boar.score, 0.59375);
  assert.deepEqual(boar.opponents.map(row => row.score), [0.46875, 0.828125, 0.484375]);
  const l1 = study('level1').report.reports[0];
  for (const [key, score] of [['wazzap-knight', 0.515625], ['wazzap', 0.5], ['ghost-diagonal-omni', 0.5], ['pawn-rook', 0.49444444444444446]]) {
    close(l1.rows.find(row => row.key === key).score, score);
  }
  assert.equal(l2.rows.find(row => row.key === 'bishop-pawn').label, 'Bishop pawn');
  assert.equal(l2.report.matrix.columns[2].label, 'Diagonal grant');
});

test('mobility rows and matched gains retain partial opening coverage without treating truncations as draws', () => {
  const report = study('mobility').report;
  assert.equal(study('mobility').counts.truncatedGames, 3);
  assert.equal(study('mobility').counts.pairedGames, 2042);
  const expected = {
    'nightrider-quiet-diagonal': [0.54296875, 0.51953125],
    'nightrider-quiet-orthogonal': [0.515625, 0.5416666666666666],
    'nightrider-quiet-king': [0.60546875, 0.71875],
    'wraith-full-diagonal': [0.5703125, 0.6041666666666666],
  };
  for (const [key, scores] of Object.entries(expected)) report.reports.forEach((budget, index) => close(budget.rows.find(row => row.key === key).score, scores[index]));
  assert.equal(report.reports[1].rows.find(row => row.key === 'wraith-full-diagonal').openingCoverage.shared, 15);
  assert.equal(report.reports[1].gains.find(row => row.key === 'nightrider-quiet-orthogonal').sharedOpenings, 14);
  assert.equal(report.reports[1].gains.find(row => row.key === 'wraith-full-diagonal').sharedOpenings, 15);
});

test('uploaded headline, matchup, gain and value-table changes cannot silently pass review', () => {
  const original = evidence.readPinned(input.pins.studies.mobility.uploadedReport).toString('utf8');
  const report = study('mobility').report;
  for (const changed of [original.replace('2048 scheduled games', '2047 scheduled games'), original.replace('71.88%', '70.00%'),
    original.replace('| 15 | 35.00 |', '| 15 | 36.00 |'), original.replace('3772 / 3470', '3773 / 3470')]) {
    assert.throws(() => evidence.verifyUploadedReport('mobility', report, changed));
  }
});

test('committed derived artifacts verify without engine/game flags', () => {
  const audit = evidence.main([], { log() {} });
  assert.deepEqual(audit.counts, { attempts: 3688, scheduledGames: 3680, finalizedGames: 3680, completedGames: 3676,
    truncatedGames: 4, errorAttempts: 6, abortedAttempts: 2, retries: 8, pairedGames: 3672, completePairs: 1836,
    newMatchGames: 0, engineSearches: 0 });
  assert.throws(() => evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
