'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const evidence = require('../scripts/balance/v18-knight-evidence');
const shared = require('../scripts/balance/v18-screen-evidence');
const followups = require('../scripts/balance/v18-followup-evidence');
let input;
test.before(() => { input = evidence.loadEvidence(); });
const study = () => input.studies[0];
const records = () => study().stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, records: structuredClone(stage.records) }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);

test('exact uploads reproduce a clean completed 480-game study under derived v0.18.6 contexts', () => {
  assert.equal(study().study, 'level2-knights');
  assert.equal(study().uploadedNumericTablesReproducedExactly, true);
  assert.equal(input.descriptors.baseTag, 'v0.18.6');
  assert.deepEqual(study().counts, { attempts: 480, scheduledGames: 480, finalizedGames: 480, completedGames: 480,
    truncatedGames: 0, errorAttempts: 0, abortedAttempts: 0, retries: 0, pairedGames: 480, completePairs: 240 });
  assert.deepEqual(study().stages.map(row => row.records.length), [240, 240]);
  for (const flag of ['originalCampaignManifestsSupplied', 'originalStageManifestsSupplied', 'originalRuntimeReceiptsSupplied', 'nativePreflightSupplied', 'legalMovesIndependentlyReplayed']) assert.equal(evidence.PROVENANCE[flag], false);
  assert.equal(evidence.PROVENANCE.engineSha256, null);
});

test('N0 is an even practical L2 fit across references and both fixed halves without material claims', () => {
  const report = study().report.reports[0], row = report.rows.find(row => row.key === 'nightrider-level2');
  assert.deepEqual([row.games, row.wins, row.draws, row.losses, row.upgradePoints], [96, 42, 21, 33, 2]);
  close(row.score, 0.546875);
  assert.deepEqual(row.opponents.map(row => row.score), [0.546875, 0.578125, 0.515625]);
  assert.deepEqual(row.physicalColors.map(row => [row.color, row.games, row.score]), [['w', 48, 0.625], ['b', 48, 0.46875]]);
  assert.deepEqual(report.cohorts.map(cohort => cohort.rows.find(row => row.key === 'nightrider-level2').score), [0.53125, 0.5625]);
  assert.deepEqual(report.cohorts.map(cohort => [cohort.openingIds[0], cohort.openingIds.at(-1)]), [['l3-panel-33', 'l3-panel-40'], ['l3-panel-41', 'l3-panel-48']]);
  close(row.conditionalRange.lower, 0.4791666666666667); close(row.conditionalRange.upper, 0.6197916666666666);
  assert.deepEqual(row.flags, ['within descriptive target']);
  const text = evidence.renderAudit(evidence.buildAudit(input));
  for (const term of ['practical L2 fit', '1203/1352', '2326/2211', 'not pooled', 'No material value']) assert.ok(text.includes(term), term);
});

test('weak NH and strong NDH retain fresh matched NFA controls and fixed reference priors', () => {
  const report = study().report.reports[0];
  const expected = { 'long-range-control': 0.2864583333333333, 'nfa-control': 0.6979166666666666,
    'knight-nh': 0.3177083333333333, 'knight-ndh': 0.75 };
  for (const [key, score] of Object.entries(expected)) close(report.rows.find(row => row.key === key).score, score);
  assert.deepEqual(report.rows.find(row => row.key === 'knight-ndh').opponents.map(row => row.score), [0.78125, 0.734375, 0.734375]);
  assert.equal(report.gains.length, 3);
  assert.ok(report.gains.every(row => row.control === 'nfa-control' && row.sharedOpenings === 16));
  close(report.gains.find(row => row.key === 'nightrider-level2').difference, -0.15104166666666669);
  const values = study().report.evaluationAudit.values;
  for (const id of ['knight.orange@4', 'knight.level2-nfa@1', 'knight.level2-nh@1', 'knight.level2-ndh@1', 'knight.nightrider-level2@1']) {
    const value = values.find(row => row.id === id); assert.equal(value.anchorId, 'knight.orange@3'); assert.deepEqual(value.applied, { mg: 1203, eg: 1352 });
  }
  for (const [id, mg, eg] of [['pawn.knight-tall-quiet@1', 536, 592], ['pawn.rank-current@1', 773, 808], ['king.reserve-bishop@1', 373, 416]]) assert.deepEqual(values.find(row => row.id === id).applied, { mg, eg });
});

test('archive corruption, partial uploads, repeated stages and duplicate attempts cannot add evidence', () => {
  assert.throws(() => evidence.loadEvidence({ readArchive(file) { const bytes = Buffer.from(fs.readFileSync(file)); bytes[35] ^= 1; return bytes; } }), /Archive changed/);
  assert.throws(() => shared.parseJournal(Buffer.from('{"id":"torn"}')), /complete newline/);
  const duplicate = records(); duplicate[0].records.push(duplicate[0].records[0]);
  assert.throws(() => evidence.analyzeStudy('level2-knights', duplicate, input.descriptors), /Duplicate uploaded attempt/);
  const repeated = records(); repeated[1] = repeated[0];
  assert.throws(() => evidence.analyzeStudy('level2-knights', repeated, input.descriptors), /Duplicate source stage/);
  assert.throws(() => evidence.analyzeStudy('level2-knights', records().slice(0, 1), input.descriptors), /Every expected/);
  const missing = records(); missing[0].records.pop();
  assert.throws(() => evidence.analyzeStudy('level2-knights', missing, input.descriptors), /unfinished/);
});

test('foreign settings, opening prefixes, hashes, outcomes and priors fail the audit', () => {
  for (const patch of [{ profileHash: '0'.repeat(64) }, { registryHash: '0'.repeat(64) }, { evaluation: null }, { result: '*' },
    { reason: 'unknown' }, { openingId: 'l3-panel-01' }, { openingMoves: [] }, { startFen: 'foreign' },
    { engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 } }, { totalPlies: 999 }]) {
    const rows = records(); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy('level2-knights', rows, input.descriptors));
  }
  assert.throws(() => evidence.analyzeStudy('level2-followup', records(), input.descriptors), /declared archived study/);
  const wrongVersion = structuredClone(input.descriptors); wrongVersion.baseTag = 'v0.18.4';
  assert.throws(() => evidence.analyzeStudy('level2-knights', records(), wrongVersion));
});

test('uploaded percentages, gains, physical colors, priors and actual cohort labels reproduce exactly', () => {
  const uploaded = shared.readPinned(input.pins.studies['level2-knights'].uploadedReport).toString('utf8');
  for (const changed of [uploaded.replace('480 scheduled games', '479 scheduled games'),
    uploaded.replace('54.69%', '55.69%'), uploaded.replace('-15.10 | -25.53', '-14.10 | -25.53'),
    uploaded.replace('l3-panel-33 … l3-panel-40', 'l3-panel-01 … l3-panel-08'), uploaded.replace('1203 / 1352', '1204 / 1352')]) {
    assert.throws(() => followups.verifyUploadedReport('level2-knights', study().report, changed));
  }
  const descriptors = structuredClone(input.descriptors);
  descriptors.rosters['level2-knights'].find(row => row.key === 'nightrider-level2').controlKey = 'long-range-control';
  assert.throws(() => evidence.analyzeStudy('level2-knights', records(), descriptors, uploaded), /gains differ/);
});

test('derived artifacts verify offline and preserve both older evidence audits', () => {
  const oldScreens = shared.main([], { log() {} }), oldFollowups = followups.main([], { log() {} });
  const audit = evidence.main([], { log() {} });
  assert.equal(audit.counts.newMatchGames, 0); assert.equal(audit.counts.engineSearches, 0);
  assert.equal(audit.counts.completePairs, 240);
  assert.deepEqual(shared.main([], { log() {} }), oldScreens);
  assert.deepEqual(followups.main([], { log() {} }), oldFollowups);
  assert.throws(() => evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
