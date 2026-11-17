'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const evidence = require('../scripts/balance/v18-queen32-evidence');
const shared = require('../scripts/balance/v18-screen-evidence');
const followups = require('../scripts/balance/v18-followup-evidence');
const knights = require('../scripts/balance/v18-knight-evidence');
const completion = require('../scripts/balance/v18-completion-evidence');
let input;
test.before(() => { input = evidence.loadEvidence(); });
const stage = () => input.study.report.reports[0];
const row = key => stage().rows.find(row => row.key === key);
const records = () => input.study.stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, records: structuredClone(stage.records) }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);

test('five exact uploads reproduce a thirty-two-case study under derived v0.18.10 contexts', () => {
  assert.equal(input.study.study, 'prepanel-level1');
  assert.equal(input.study.uploadedNumericTablesReproducedExactly, true);
  assert.equal(input.descriptors.baseTag, 'v0.18.10'); assert.equal(input.descriptors.targetOpenings, 32);
  assert.equal(input.study.report.targetOpenings, 32);
  assert.deepEqual(input.study.stages.map(row => row.records.length), [96, 96, 96, 96]);
  assert.deepEqual(input.study.counts, { attempts: 384, scheduledGames: 384, finalizedGames: 384, completedGames: 383,
    truncatedGames: 1, errorAttempts: 0, abortedAttempts: 0, retries: 0, pairedGames: 382, completePairs: 191 });
  const audit = evidence.buildAudit(input);
  assert.equal(audit.recordedDate, '2026-11-17'); assert.equal(audit.counts.unpairedCompletedGames, 1);
  for (const flag of ['originalCampaignManifestsSupplied', 'originalStageManifestsSupplied', 'originalRuntimeReceiptsSupplied', 'nativePreflightSupplied', 'legalMovesIndependentlyReplayed']) assert.equal(evidence.PROVENANCE[flag], false);
  assert.equal(evidence.PROVENANCE.engineSha256, null);
});

test('QfN remains near the target and QvN retains its separate coverage, colors and conditional ranges', () => {
  const control = row('forward-queen-control'), trial = row('queen-l1-tall-knight');
  assert.deepEqual([control.games, control.wins, control.draws, control.losses, control.upgradePoints], [192, 68, 59, 65, 1]);
  assert.deepEqual([trial.games, trial.wins, trial.draws, trial.losses, trial.upgradePoints], [186, 73, 54, 59, 1]);
  close(control.score, 0.5078125); close(trial.score, 0.5376344086021505);
  assert.deepEqual(control.physicalColors.map(row => row.score), [0.578125, 0.4375]);
  close(trial.physicalColors[0].score, 0.5860215053763441); close(trial.physicalColors[1].score, 0.489247311827957);
  close(control.conditionalRange.lower, 0.4479166666666667); close(control.conditionalRange.upper, 0.5677083333333334);
  close(trial.conditionalRange.lower, 0.46774193548387094); close(trial.conditionalRange.upper, 0.6075268817204302);
  assert.deepEqual(control.flags, ['within descriptive target']); assert.ok(trial.flags.includes('partial screen'));
});

test('the matched 31-case gain uses 186 games per body rather than subtracting headline averages', () => {
  const matched = evidence.matchedComparison(input), gain = stage().gains[0];
  assert.equal(matched.gamesPerBody, 186); assert.equal(matched.sharedOpeningIds.length, 31);
  assert.ok(!matched.sharedOpeningIds.includes('l3-panel-31'));
  close(matched.controlScore, 0.5026881720430108); close(matched.trialScore, 0.5376344086021505);
  close(matched.difference, 0.03494623655913978); assert.equal(gain.sharedOpenings, 31);
  close(matched.conditionalRange.lower, -0.04576612903225807); close(matched.conditionalRange.upper, 0.13440860215053765);
  assert.ok(matched.conditionalRange.lower < 0 && matched.conditionalRange.upper > 0);
  assert.ok(Math.abs(matched.difference - (row('queen-l1-tall-knight').score - row('forward-queen-control').score)) > 0.005);
  assert.deepEqual(matched.halves.map(row => [row.sharedOpeningIds.length, row.gamesPerBody]), [[16, 96], [15, 90]]);
  close(matched.halves[0].controlScore, 0.453125); close(matched.halves[0].trialScore, 0.578125);
  close(matched.halves[1].controlScore, 0.5555555555555556); close(matched.halves[1].trialScore, 0.49444444444444446);
});

test('the move-limit game and completed partner remain unscored while full matchup cells retain their pairs', () => {
  const audit = evidence.buildAudit(input), trial = row('queen-l1-tall-knight');
  assert.deepEqual(audit.study.unscoredFinalized.map(row => [row.comparisonId, row.openingId, row.aColor, row.result, row.reason, row.totalPlies, row.completedPartner]), [
    ['queen-l1-tall-knight-v-two-step-pawn', 'l3-panel-31', 'b', '*', 'max-plies', 400, true],
  ]);
  assert.equal(trial.openingCoverage.shared, 31); assert.equal(trial.games, 186);
  const cells = stage().report.matrix.rows.find(row => row.key === trial.key).cells;
  assert.deepEqual(cells.map(row => row.pairedGames), [62, 64, 64]);
  close(cells[0].score, 0.5645161290322581); close(cells[1].score, 0.484375); close(cells[2].score, 0.546875);
  const rendered = evidence.renderAudit(audit);
  assert.ok(rendered.includes('| Queen: tall knight jumps at level one | 53.76% | 56.45% | 48.44% | 54.69% |'));
  assert.ok(rendered.includes('QvN 53.76% versus QfN 50.27%, a 3.49-percentage-point difference'));
  assert.ok(rendered.includes('raw overall difference is 2.98 points'));
});

test('all four canonical eight-case cohorts and tier-specific frozen priors are preserved', () => {
  assert.deepEqual(stage().cohorts.map(row => [row.openingIds[0], row.openingIds.at(-1)]), [
    ['l3-panel-01', 'l3-panel-08'], ['l3-panel-09', 'l3-panel-16'], ['l3-panel-17', 'l3-panel-24'], ['l3-panel-25', 'l3-panel-32'],
  ]);
  assert.deepEqual(stage().cohorts.map(cohort => cohort.rows.find(row => row.key === 'forward-queen-control').score), [0.4375, 0.46875, 0.5625, 0.5625]);
  const values = input.study.report.evaluationAudit.values;
  for (const id of ['queen.level1-forward-knight@1', 'queen.level1-tall-knight@1']) assert.deepEqual(values.find(row => row.id === id).applied, { mg: 2771, eg: 2833 });
  assert.equal(values.find(row => row.id === 'queen.level1-tall-knight@1').movement, 'QvN');
  assert.equal(values.find(row => row.id === 'queen.level1-forward-knight@1').movement, 'QfN');
});

test('opening-target extension is opt-in and a wrong headline, target or cohort label fails', () => {
  assert.throws(() => shared.analyzeStudy(evidence.STUDY, records(), input.descriptors, undefined, { allowedStudies: [evidence.STUDY] }), /opening count differs/);
  assert.throws(() => shared.analyzeStudy(evidence.STUDY, records(), input.descriptors, undefined, { allowedStudies: [evidence.STUDY], targetOpenings: 24 }), /declared opening target/);
  const uploaded = shared.readPinned(input.pins.studies[evidence.STUDY].uploadedReport).toString('utf8');
  for (const changed of [uploaded.replace('32 fixed opening cases', '16 fixed opening cases'), uploaded.replace('384 scheduled games', '383 scheduled games'),
    uploaded.replace('l3-panel-25 … l3-panel-32', 'l3-panel-17 … l3-panel-24'), uploaded.replace('3.49 | -4.58', '2.98 | -4.58'),
    uploaded.replace('50.78%', '51.78%'), uploaded.replace('2771 / 2833', '2772 / 2833')]) {
    assert.throws(() => followups.verifyUploadedReport(evidence.STUDY, input.study.report, changed));
  }
  const wrong = structuredClone(input.descriptors); wrong.targetOpenings = 16;
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, records(), wrong));
});

test('corrupt archives, torn uploads, duplicates and incomplete or repeated stages cannot add evidence', () => {
  assert.throws(() => evidence.loadEvidence({ readArchive(file) { const bytes = Buffer.from(fs.readFileSync(file)); bytes[35] ^= 1; return bytes; } }), /Archive changed/);
  assert.throws(() => shared.parseJournal(Buffer.from('{"id":"torn"}')), /complete newline/);
  const duplicate = records(); duplicate[0].records.push(duplicate[0].records[0]);
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, duplicate, input.descriptors), /Duplicate uploaded attempt/);
  const repeated = records(); repeated[3] = repeated[0];
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, repeated, input.descriptors), /Duplicate source stage/);
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, records().slice(0, 3), input.descriptors), /Every expected/);
  const missing = records(); missing[3].records.pop();
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, missing, input.descriptors), /unfinished/);
});

test('foreign settings, contexts and reinterpretation of the truncation fail before changing scores', () => {
  for (const patch of [{ profileHash: '0'.repeat(64) }, { registryHash: '0'.repeat(64) }, { evaluation: null }, { result: '*' },
    { openingId: 'l3-panel-49' }, { openingMoves: [] }, { startFen: 'foreign' }, { totalPlies: 999 },
    { engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 } }]) {
    const rows = records(); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy(evidence.STUDY, rows, input.descriptors));
  }
  const invented = records(); invented[3].records.find(row => row.status === 'truncated').result = '1/2-1/2';
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, invented, input.descriptors), /unscored attempt/);
  const wrong = structuredClone(input.descriptors); wrong.baseTag = 'v0.18.8';
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, records(), wrong));
  const control = structuredClone(input.descriptors); control.rosters[evidence.STUDY].find(row => row.controlKey).controlKey = 'missing-control';
  assert.throws(() => evidence.analyzeStudy(evidence.STUDY, records(), control), /Unknown archived matched control/);
});

test('default sixteen-case audits stay byte-for-byte reproducible and the new audit remains offline', () => {
  const before = [shared, followups, knights, completion].map(module => module.main([], { log() {} }));
  const audit = evidence.main([], { log() {} });
  const after = [shared, followups, knights, completion].map(module => module.main([], { log() {} }));
  assert.deepEqual(after, before);
  assert.deepEqual(before.map(row => row.counts.finalizedGames), [3680, 1632, 480, 1056]);
  assert.equal(audit.counts.newMatchGames, 0); assert.equal(audit.counts.engineSearches, 0);
  assert.throws(() => evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
