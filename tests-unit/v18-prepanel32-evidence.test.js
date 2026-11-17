'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { gzipSync, gunzipSync } = require('node:zlib');
const evidence = require('../scripts/balance/v18-prepanel32-evidence');
const shared = require('../scripts/balance/v18-screen-evidence');
const followups = require('../scripts/balance/v18-followup-evidence');
const knights = require('../scripts/balance/v18-knight-evidence');
const completion = require('../scripts/balance/v18-completion-evidence');
const queen32 = require('../scripts/balance/v18-queen32-evidence');
let input;
test.before(() => { input = evidence.loadEvidence(); });
const study = name => input.studies.find(row => row.study === name);
const stage = name => study(name).report.reports[0];
const row = (name, key) => stage(name).rows.find(row => row.key === key);
const matrix = (name, key) => stage(name).report.matrix.rows.find(row => row.key === key).cells;
const records = name => study(name).stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, records: structuredClone(stage.records) }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);

test('ten exact uploads reproduce both thirty-two-case studies with explicitly derived contexts', () => {
  assert.deepEqual(evidence.STUDIES, ['prepanel-level2', 'prepanel-level3']);
  assert.equal(input.descriptors.baseTag, 'v0.18.10'); assert.equal(input.descriptors.targetOpenings, 32);
  assert.equal(input.descriptors.stages.length, 8);
  assert.deepEqual(input.studies.map(s => s.uploadedNumericTablesReproducedExactly), [true, true]);
  assert.deepEqual(study('prepanel-level2').stages.map(s => s.records.length), [432, 432, 432, 432]);
  assert.deepEqual(study('prepanel-level3').stages.map(s => s.records.length), [512, 512, 512, 512]);
  assert.deepEqual(study('prepanel-level2').counts, { attempts: 1728, scheduledGames: 1728, finalizedGames: 1728,
    completedGames: 1728, truncatedGames: 0, errorAttempts: 0, abortedAttempts: 0, retries: 0, pairedGames: 1728, completePairs: 864 });
  assert.deepEqual(study('prepanel-level3').counts, { attempts: 2048, scheduledGames: 2048, finalizedGames: 2048,
    completedGames: 2046, truncatedGames: 2, errorAttempts: 0, abortedAttempts: 0, retries: 0, pairedGames: 2044, completePairs: 1022 });
  const audit = evidence.buildAudit(input);
  assert.equal(audit.recordedDate, '2026-11-17');
  assert.deepEqual(audit.counts, { attempts: 3776, scheduledGames: 3776, finalizedGames: 3776,
    completedGames: 3774, truncatedGames: 2, errorAttempts: 0, abortedAttempts: 0, retries: 0, pairedGames: 3772, completePairs: 1886,
    unpairedCompletedGames: 2, newMatchGames: 0, engineSearches: 0 });
  for (const flag of ['originalCampaignManifestsSupplied', 'originalStageManifestsSupplied', 'originalRuntimeReceiptsSupplied', 'nativePreflightSupplied', 'legalMovesIndependentlyReplayed']) assert.equal(evidence.PROVENANCE[flag], false);
  assert.equal(evidence.PROVENANCE.engineSha256, null);
});

test('NAD retains near-even reference scores, its color split and a matched gain with conditional uncertainty', () => {
  const nad = row('prepanel-level3', 'knight-l3-nad');
  assert.deepEqual([nad.games, nad.wins, nad.draws, nad.losses, nad.upgradePoints], [256, 106, 53, 97, 3]);
  close(nad.score, 0.517578125);
  assert.deepEqual(matrix('prepanel-level3', nad.key).map(cell => cell.score), [0.515625, 0.5, 0.5546875, 0.5]);
  assert.deepEqual(nad.physicalColors.map(color => color.score), [0.5546875, 0.48046875]);
  close(nad.conditionalRange.lower, 0.45703125); close(nad.conditionalRange.upper, 0.5703125);
  const gain = stage('prepanel-level3').gains.find(row => row.key === nad.key);
  assert.equal(gain.sharedOpenings, 31); close(gain.difference, 0.016129032258064516);
  close(gain.conditionalRange.lower, -0.05650201612903225); close(gain.conditionalRange.upper, 0.08669354838709678);
  assert.deepEqual(nad.flags, ['within descriptive target']);
  assert.equal(row('prepanel-level3', 'knight-l3-naz').score, 0.81640625);
  assert.equal(row('prepanel-level3', 'knight-l3-nh').score, 0.24609375);
});

test('QcC and all four Free Boar batches retain their equal planned weight', () => {
  const queen = row('prepanel-level2', 'queen-l2-camel-capture'), boar = row('prepanel-level2', 'free-boar-control');
  close(queen.score, 0.5520833333333334); close(boar.score, 0.5520833333333334);
  assert.deepEqual(matrix('prepanel-level2', queen.key).map(cell => cell.score), [0.65625, 0.5, 0.5]);
  assert.deepEqual(matrix('prepanel-level2', boar.key).map(cell => cell.score), [0.6015625, 0.5234375, 0.53125]);
  const cohorts = stage('prepanel-level2').cohorts.map(cohort => cohort.rows.find(row => row.key === boar.key));
  assert.deepEqual(cohorts.map(row => row.games), [48, 48, 48, 48]);
  assert.deepEqual(cohorts.map(row => row.score), [0.59375, 0.5520833333333334, 0.4895833333333333, 0.5729166666666666]);
  close((cohorts[0].score + cohorts[1].score) / 2, 0.5729166666666667);
  close((cohorts[2].score + cohorts[3].score) / 2, 0.53125);
  close(cohorts.reduce((sum, row) => sum + row.score, 0) / cohorts.length, boar.score);
  close(boar.conditionalRange.lower, 0.484375); close(boar.conditionalRange.upper, 0.6171875);
  const gain = stage('prepanel-level2').gains.find(row => row.key === queen.key);
  close(gain.difference, 0.15885416666666669); close(gain.conditionalRange.lower, 0.0625); close(gain.conditionalRange.upper, 0.25);
  const rendered = evidence.renderAudit(evidence.buildAudit(input));
  assert.ok(rendered.includes('QfcCscC remains an untested idea'));
  assert.ok(rendered.includes('The 48.96% batch is retained normally'));
  assert.ok(rendered.includes('do not adjust these outcome scores'));
});

test('the two move-limit caps and completed partners remain unscored without discarding other matrix pairs', () => {
  const audit = evidence.buildAudit(input), l3 = audit.studies.find(row => row.study === 'prepanel-level3');
  assert.deepEqual(l3.unscoredFinalized.map(row => [row.comparisonId, row.openingId, row.aColor, row.result, row.reason, row.totalPlies, row.completedPartner]), [
    ['knight-l3-ndh-v-vanguard', 'l3-panel-02', 'b', '*', 'max-plies', 400, true],
    ['unicorn-control-v-amazon', 'l3-panel-15', 'b', '*', 'max-plies', 400, true],
  ]);
  const ndh = row('prepanel-level3', 'knight-l3-ndh'), control = row('prepanel-level3', 'unicorn-control');
  assert.equal(ndh.games, 248); assert.equal(control.games, 248);
  assert.equal(ndh.openingCoverage.shared, 31); assert.equal(control.openingCoverage.shared, 31);
  assert.ok(!ndh.openingCoverage.openingIds.includes('l3-panel-02'));
  assert.ok(!control.openingCoverage.openingIds.includes('l3-panel-15'));
  assert.deepEqual(matrix('prepanel-level3', ndh.key).map(cell => cell.pairedGames), [62, 64, 64, 64]);
  assert.deepEqual(matrix('prepanel-level3', control.key).map(cell => cell.pairedGames), [64, 64, 64, 62]);
  assert.deepEqual(ndh.opponents.map(cell => cell.games), [62, 62, 62, 62]);
  const gain = stage('prepanel-level3').gains.find(row => row.key === ndh.key);
  assert.equal(gain.sharedOpenings, 30);
  assert.ok(evidence.renderAudit(audit).includes('| Knight: two- and three-square orthogonal jumps | 59.48% | 54.84% | 54.69% | 61.72% | 63.28% | 31/32 |'));
});

test('canonical case labels, knight alternatives and tier-specific frozen values are preserved', () => {
  for (const name of evidence.STUDIES) assert.deepEqual(stage(name).cohorts.map(row => [row.openingIds[0], row.openingIds.at(-1)]), [
    ['l3-panel-01', 'l3-panel-08'], ['l3-panel-09', 'l3-panel-16'], ['l3-panel-17', 'l3-panel-24'], ['l3-panel-25', 'l3-panel-32'],
  ]);
  close(row('prepanel-level2', 'ndmk-control').score, 0.4895833333333333);
  close(row('prepanel-level2', 'knight-nd-quiet-orthogonal').score, 0.53125);
  close(row('prepanel-level2', 'knight-nd-quiet-diagonal').score, 0.4166666666666667);
  const gain = stage('prepanel-level2').gains.find(row => row.key === 'knight-nd-quiet-orthogonal');
  close(gain.difference, 0.04166666666666666); assert.ok(gain.conditionalRange.lower < 0);
  const values = name => study(name).report.evaluationAudit.values;
  for (const movement of ['NDmK', 'NDmW', 'NDmF']) assert.deepEqual(values('prepanel-level2').find(row => row.movement === movement).applied, { mg: 1203, eg: 1352 });
  assert.deepEqual(values('prepanel-level2').find(row => row.movement === 'QcC').applied, { mg: 3738, eg: 4155 });
  for (const movement of ['NAD', 'NZ', 'NDH', 'NAZ', 'NH', 'NWH', 'NADmK']) assert.deepEqual(values('prepanel-level3').find(row => row.movement === movement).applied, { mg: 1663, eg: 1877 });
  assert.ok(!values('prepanel-level2').some(row => row.movement === 'QfcCscC'));
});

test('source pins retain deterministic archives and reject corrupt or missing input', () => {
  const pins = [input.pins.declarations, ...Object.values(input.pins.studies).flatMap(study => [...study.journals, study.uploadedReport])];
  assert.equal(pins.length, 11);
  for (const pin of pins) {
    let archived;
    shared.readPinned(pin, file => { archived = fs.readFileSync(file); return archived; });
    assert.deepEqual(archived, gzipSync(gunzipSync(archived), { level: 9, mtime: 0 }));
  }
  assert.throws(() => evidence.loadEvidence({ readArchive(file) { const bytes = Buffer.from(fs.readFileSync(file)); bytes[35] ^= 1; return bytes; } }), /Archive changed/);
  assert.throws(() => evidence.loadEvidence({ readArchive() { const error = new Error('Missing archive'); error.code = 'ENOENT'; throw error; } }), /Missing archive/);
  assert.throws(() => shared.parseJournal(Buffer.from('{"id":"torn"}')), /complete newline/);
});

test('wrong targets, report cells, cohorts, gains and search priors fail reproduction', () => {
  const name = 'prepanel-level2', report = study(name).report;
  assert.throws(() => shared.analyzeStudy(name, records(name), input.descriptors, undefined, { allowedStudies: evidence.STUDIES }), /opening count differs/);
  const uploaded = shared.readPinned(input.pins.studies[name].uploadedReport).toString('utf8');
  for (const changed of [uploaded.replace('32 fixed opening cases', '16 fixed opening cases'), uploaded.replace('1728 scheduled games', '1727 scheduled games'),
    uploaded.replace('l3-panel-25 … l3-panel-32', 'l3-panel-17 … l3-panel-24'), uploaded.replace('15.89 | 6.25', '14.89 | 6.25'),
    uploaded.replace('55.21%', '56.21%'), uploaded.replace('3738 / 4155', '3739 / 4155')]) {
    assert.notEqual(changed, uploaded); assert.throws(() => followups.verifyUploadedReport(name, report, changed));
  }
  const descriptors = structuredClone(input.descriptors); descriptors.targetOpenings = 16;
  assert.throws(() => evidence.analyzeStudy(name, records(name), descriptors));
});

test('duplicates, foreign contexts and reinterpretation of truncations cannot add evidence', () => {
  const name = 'prepanel-level3', duplicate = records(name); duplicate[0].records.push(duplicate[0].records[0]);
  assert.throws(() => evidence.analyzeStudy(name, duplicate, input.descriptors), /Duplicate uploaded attempt/);
  const repeated = records(name); repeated[3] = repeated[0];
  assert.throws(() => evidence.analyzeStudy(name, repeated, input.descriptors), /Duplicate source stage/);
  assert.throws(() => evidence.analyzeStudy(name, records(name).slice(0, 3), input.descriptors), /Every expected/);
  const missing = records(name); missing[3].records.pop();
  assert.throws(() => evidence.analyzeStudy(name, missing, input.descriptors), /unfinished/);
  for (const patch of [{ profileHash: '0'.repeat(64) }, { registryHash: '0'.repeat(64) }, { evaluation: null },
    { openingId: 'l3-panel-49' }, { openingMoves: [] }, { startFen: 'foreign' }, { totalPlies: 999 },
    { engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 } }]) {
    const rows = records(name); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy(name, rows, input.descriptors));
  }
  const invented = records(name); invented[0].records.find(row => row.status === 'truncated').result = '1/2-1/2';
  assert.throws(() => evidence.analyzeStudy(name, invented, input.descriptors), /unscored attempt/);
  const context = structuredClone(input.descriptors); context.baseTag = 'v0.18.8';
  assert.throws(() => evidence.analyzeStudy(name, records(name), context));
  const control = structuredClone(input.descriptors); control.rosters[name].find(row => row.controlKey).controlKey = 'missing-control';
  assert.throws(() => evidence.analyzeStudy(name, records(name), control), /Unknown archived matched control/);
});

test('all five earlier evidence archives remain byte-for-byte reproducible and this review stays offline', () => {
  const modules = [shared, followups, knights, completion, queen32];
  const before = modules.map(module => module.main([], { log() {} }));
  const audit = evidence.main([], { log() {} });
  assert.deepEqual(modules.map(module => module.main([], { log() {} })), before);
  assert.deepEqual(before.map(row => row.counts.finalizedGames), [3680, 1632, 480, 1056, 384]);
  assert.equal(audit.counts.engineSearches, 0); assert.equal(audit.counts.newMatchGames, 0);
  assert.throws(() => evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
