'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const evidence = require('../scripts/balance/v18-completion-evidence');
const shared = require('../scripts/balance/v18-screen-evidence');
const followups = require('../scripts/balance/v18-followup-evidence');
const knights = require('../scripts/balance/v18-knight-evidence');
let input;
test.before(() => { input = evidence.loadEvidence(); });
const study = name => input.studies.find(row => row.study === name);
const report = name => study(name).report.reports[0];
const row = (name, key) => report(name).rows.find(row => row.key === key);
const records = name => study(name).stages.map(stage => ({ nodes: stage.nodes, batchIndex: stage.batchIndex, records: structuredClone(stage.records) }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);

test('all six exact uploads reproduce both reports under explicit derived v0.18.8 contexts', () => {
  assert.deepEqual(input.studies.map(row => [row.study, row.counts.scheduledGames, row.counts.attempts]), [
    ['level1-queens', 384, 384], ['level2-completion', 672, 672],
  ]);
  assert.ok(input.studies.every(row => row.uploadedNumericTablesReproducedExactly));
  assert.equal(input.descriptors.baseTag, 'v0.18.8');
  assert.deepEqual(study('level1-queens').stages.map(row => row.records.length), [192, 192]);
  assert.deepEqual(study('level2-completion').stages.map(row => row.records.length), [336, 336]);
  for (const flag of ['originalCampaignManifestsSupplied', 'originalStageManifestsSupplied', 'originalRuntimeReceiptsSupplied', 'nativePreflightSupplied', 'legalMovesIndependentlyReplayed']) assert.equal(evidence.PROVENANCE[flag], false);
  assert.equal(evidence.PROVENANCE.engineSha256, null);
  assert.equal(evidence.buildAudit(input).recordedDate, '2026-11-17');
});

test('L1 queens preserve exact scores, fresh-control gains and the QfN/QfhN distinction', () => {
  const name = 'level1-queens';
  const expected = { 'baby-amazon-control': 0.2760416666666667, 'queen-camel-capture': 0.6458333333333334,
    'queen-forward-knight': 0.4479166666666667, 'queen-forward-half-knight': 0.59375 };
  for (const [key, value] of Object.entries(expected)) { close(row(name, key).score, value); assert.equal(row(name, key).games, 96); }
  assert.deepEqual(row(name, 'queen-forward-knight').opponents.map(row => row.score), [0.484375, 0.421875, 0.4375]);
  assert.deepEqual(row(name, 'queen-forward-half-knight').opponents.map(row => row.score), [0.546875, 0.625, 0.609375]);
  assert.deepEqual(report(name).cohorts.map(cohort => cohort.rows.find(row => row.key === 'queen-camel-capture').score), [0.6354166666666666, 0.65625]);
  for (const [key, value] of [['queen-camel-capture', 0.3697916666666667], ['queen-forward-knight', 0.171875], ['queen-forward-half-knight', 0.3177083333333333]]) {
    const gain = report(name).gains.find(row => row.key === key); close(gain.difference, value);
    assert.equal(gain.control, 'baby-amazon-control'); assert.equal(gain.sharedOpenings, 16);
    assert.ok(gain.conditionalRange.lower > 0);
  }
  const values = study(name).report.evaluationAudit.values;
  assert.equal(values.find(row => row.id === 'queen.level1-forward-knight@1').movement, 'QfN');
  assert.equal(values.find(row => row.id === 'queen.level1-forward-half-knight@1').movement, 'QfhN');
});

test('L2 candidates retain per-reference effects, repeated halves and family-specific controls', () => {
  const name = 'level2-completion';
  for (const [key, value] of [['queen-side-knight', 0.4739583333333333], ['queen-tall-knight', 0.3854166666666667],
    ['knight-nd', 0.3854166666666667], ['knight-nd-quiet-king', 0.5677083333333334]]) close(row(name, key).score, value);
  assert.deepEqual(row(name, 'queen-side-knight').opponents.map(row => row.score), [0.5625, 0.453125, 0.40625]);
  assert.deepEqual(row(name, 'knight-nd-quiet-king').opponents.map(row => row.score), [0.5, 0.5625, 0.640625]);
  close(report(name).cohorts[0].rows.find(row => row.key === 'knight-nd-quiet-king').score, 0.5729166666666666);
  close(report(name).cohorts[1].rows.find(row => row.key === 'knight-nd-quiet-king').score, 0.5625);
  const sideGain = report(name).gains.find(row => row.key === 'queen-side-knight');
  close(sideGain.difference, 0.1302083333333333); assert.equal(sideGain.control, 'box-control');
  assert.ok(sideGain.conditionalRange.lower > 0);
  assert.ok(report(name).gains.find(row => row.key === 'queen-tall-knight').conditionalRange.lower < 0);
  assert.ok(!report(name).gains.some(row => row.key === 'free-boar'));
});

test('two unscored move limits exclude their completed partners and whole affected overall opening blocks', () => {
  const name = 'level2-completion', audit = evidence.buildAudit(input), result = audit.studies.find(row => row.study === name);
  assert.deepEqual(result.unscoredFinalized.map(row => [row.comparisonId, row.openingId, row.aColor, row.status, row.result, row.reason, row.totalPlies, row.completedPartner]), [
    ['nightrider-control-v-diagonal-grant', 'l3-panel-59', 'w', 'truncated', '*', 'max-plies', 400, true],
    ['free-boar-v-diagonal-grant', 'l3-panel-62', 'b', 'truncated', '*', 'max-plies', 400, true],
  ]);
  assert.equal(result.counts.completedGames, 670); assert.equal(result.counts.pairedGames, 668); assert.equal(result.counts.completePairs, 334);
  for (const [key, excluded, value] of [['nightrider-control', 'l3-panel-59', 0.5111111111111111], ['free-boar', 'l3-panel-62', 0.6555555555555556]]) {
    const summary = row(name, key); assert.equal(summary.games, 90); close(summary.score, value);
    assert.equal(summary.openingCoverage.shared, 15); assert.ok(!summary.openingCoverage.openingIds.includes(excluded));
    assert.equal(summary.opponents.find(opponent => opponent.key === 'diagonal-grant').games, 30);
    assert.ok(summary.flags.includes('partial screen'));
  }
  const gain = report(name).gains.find(row => row.key === 'knight-nd-quiet-king');
  assert.equal(gain.sharedOpenings, 15); close(gain.difference, 0.04444444444444444);
  assert.ok(Math.abs(gain.difference - (row(name, 'knight-nd-quiet-king').score - row(name, 'nightrider-control').score)) > 0.01);
  assert.equal(audit.counts.unpairedCompletedGames, 2);
});

test('all frozen search priors remain tier-specific and no values are fitted to outcomes', () => {
  for (const item of study('level1-queens').report.evaluationAudit.values.filter(row => row.id.startsWith('queen.'))) assert.deepEqual(item.applied, { mg: 2771, eg: 2833 });
  const values = study('level2-completion').report.evaluationAudit.values;
  for (const [prefix, mg, eg] of [['queen.', 3738, 4155], ['knight.', 1203, 1352], ['bishop.', 1782, 1756]]) {
    for (const item of values.filter(row => row.id.startsWith(prefix))) assert.deepEqual(item.applied, { mg, eg });
  }
  for (const [id, mg, eg] of [['pawn.knight-tall-quiet@1', 536, 592], ['pawn.rank-current@1', 773, 808], ['king.reserve-bishop@1', 373, 416]]) assert.deepEqual(values.find(row => row.id === id).applied, { mg, eg });
});

test('derived matchup cells retain all complete pairs while partial overall rows keep common-case coverage', () => {
  const stage = report('level2-completion'), text = evidence.renderAudit(evidence.buildAudit(input));
  const expected = [
    ['nightrider-control', [0.578125, 0.453125, 0.5666666666666667], '| Level-two Nightrider control | 51.11% | 57.81% | 45.31% | 56.67% | 54.17% / 47.62% | 15/16 |'],
    ['free-boar', [0.640625, 0.71875, 0.6166666666666667], '| Free Boar bishop | 65.56% | 64.06% | 71.88% | 61.67% | 69.79% / 60.71% | 15/16 |'],
  ];
  for (const [key, scores, rendered] of expected) {
    const cells = stage.report.matrix.rows.find(row => row.key === key).cells;
    assert.deepEqual(cells.map(cell => cell.pairedGames), [32, 32, 30]);
    cells.forEach((cell, index) => close(cell.score, scores[index]));
    assert.equal(row('level2-completion', key).games, 90);
    assert.equal(row('level2-completion', key).openingCoverage.shared, 15);
    assert.ok(text.includes(rendered), key + ': full matchup scores must not be replaced by common-case-only scores');
  }
  assert.ok(text.includes('Per-reference cells retain every complete color pair'));
});

test('corrupt archives, torn uploads, duplicate attempts and missing or repeated stages cannot add evidence', () => {
  assert.throws(() => evidence.loadEvidence({ readArchive(file) { const bytes = Buffer.from(fs.readFileSync(file)); bytes[35] ^= 1; return bytes; } }), /Archive changed/);
  assert.throws(() => shared.parseJournal(Buffer.from('{"id":"torn"}')), /complete newline/);
  const name = 'level2-completion';
  const duplicate = records(name); duplicate[0].records.push(duplicate[0].records[0]);
  assert.throws(() => evidence.analyzeStudy(name, duplicate, input.descriptors), /Duplicate uploaded attempt/);
  const repeated = records(name); repeated[1] = repeated[0];
  assert.throws(() => evidence.analyzeStudy(name, repeated, input.descriptors), /Duplicate source stage/);
  assert.throws(() => evidence.analyzeStudy(name, records(name).slice(0, 1), input.descriptors), /Every expected/);
  const missing = records(name); missing[1].records.pop();
  assert.throws(() => evidence.analyzeStudy(name, missing, input.descriptors), /unfinished/);
});

test('foreign contexts and reinterpretation of truncated results fail before changing scores', () => {
  const name = 'level2-completion';
  for (const patch of [{ profileHash: '0'.repeat(64) }, { registryHash: '0'.repeat(64) }, { evaluation: null }, { result: '*' },
    { reason: 'unknown' }, { openingId: 'l3-panel-01' }, { openingMoves: [] }, { startFen: 'foreign' },
    { engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 } }, { totalPlies: 999 }]) {
    const rows = records(name); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy(name, rows, input.descriptors));
  }
  const inventedDraw = records(name); const truncated = inventedDraw[1].records.find(row => row.status === 'truncated');
  truncated.result = '1/2-1/2';
  assert.throws(() => evidence.analyzeStudy(name, inventedDraw, input.descriptors), /unscored attempt/);
  const wrongVersion = structuredClone(input.descriptors); wrongVersion.baseTag = 'v0.18.6';
  assert.throws(() => evidence.analyzeStudy(name, records(name), wrongVersion));
  assert.throws(() => evidence.analyzeStudy('level2-knights', records(name), input.descriptors), /declared archived study/);
});

test('uploaded numeric tables, held-out labels, partial coverage, gains and priors are independently checked', () => {
  const name = 'level2-completion', uploaded = shared.readPinned(input.pins.studies[name].uploadedReport).toString('utf8');
  for (const changed of [uploaded.replace('672 scheduled games', '671 scheduled games'), uploaded.replace('47.40%', '48.40%'),
    uploaded.replace('15/16', '16/16'), uploaded.replace('4.44 | -5.56', '5.44 | -5.56'),
    uploaded.replace('l3-panel-49 … l3-panel-56', 'l3-panel-01 … l3-panel-08'), uploaded.replace('3738 / 4155', '3739 / 4155')]) {
    assert.throws(() => followups.verifyUploadedReport(name, study(name).report, changed));
  }
  const descriptors = structuredClone(input.descriptors);
  descriptors.rosters[name].find(row => row.key === 'knight-nd-quiet-king').controlKey = 'box-control';
  assert.throws(() => evidence.analyzeStudy(name, records(name), descriptors, uploaded), /gains differ/);
});

test('all derived artifacts verify offline and retain all three earlier evidence audits unchanged', () => {
  const before = [shared, followups, knights].map(module => module.main([], { log() {} }));
  const audit = evidence.main([], { log() {} });
  assert.deepEqual(audit.counts, { attempts: 1056, scheduledGames: 1056, finalizedGames: 1056, completedGames: 1054,
    truncatedGames: 2, errorAttempts: 0, abortedAttempts: 0, retries: 0, pairedGames: 1052, completePairs: 526,
    unpairedCompletedGames: 2, newMatchGames: 0, engineSearches: 0 });
  assert.deepEqual([shared, followups, knights].map(module => module.main([], { log() {} })), before);
  assert.throws(() => evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
