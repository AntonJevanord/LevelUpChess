'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evidence = require('../scripts/balance/v19-selection-evidence');
const { readPinned } = require('../scripts/balance/v19-trial-evidence');
let input, audit;
test.before(async () => { input = await evidence.loadEvidence(); audit = await evidence.buildAudit(input); });
const study = name => input.studies.find(row => row.study === name);
const row = (name, key) => study(name).report.rows.find(candidate => candidate.key === key);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);
const inputs = name => study(name).stages.map(stage => ({ batchIndex: stage.batchIndex, nodes: stage.nodes, records: structuredClone(stage.records) }));
const uploaded = name => readPinned(input.pins.studies[name].uploadedReport).toString('utf8');

test('both exact uploads reproduce their thirty-two-case reports using the correct distinct plans', () => {
  assert.deepEqual(evidence.STUDIES, ['queens', 'pawns2']);
  assert.equal(input.descriptors.baseTag, 'v0.19.2'); assert.equal(input.descriptors.stages.length, 8);
  assert.deepEqual(input.studies.map(study => study.uploadedNumericTablesReproducedExactly), [true, true]);
  assert.deepEqual(study('queens').stages.map(stage => stage.records.length), [192, 192, 192, 192]);
  assert.deepEqual(study('pawns2').stages.map(stage => stage.records.length), [96, 96, 96, 96]);
  assert.deepEqual(audit.counts, { attempts: 1152, finalizedGames: 1152, completedGames: 1152,
    truncatedGames: 0, errors: 0, retries: 0, completePairs: 576, pairedGames: 1152, engineSearches: 0, newMatchGames: 0 });
  assert.equal(study('queens').report.format, 'levelup-v19-focused-trial-report');
  assert.equal(study('pawns2').report.format, 'levelup-v19-pawn-range-followup-report');
});

test('selected QfsN preserves its weaker measured score and asymmetric reference matchups', () => {
  const queen = row('queens', 'queen-wide-forward');
  assert.equal(queen.movement, 'QfsN'); assert.equal(queen.requestedMovement, 'QsfN');
  assert.deepEqual([queen.games, queen.wins, queen.draws, queen.losses], [192, 53, 56, 83]);
  close(queen.score, 81 / 192);
  assert.deepEqual(queen.cells.map(cell => cell.score), [0.515625, 0.3359375, 0.4140625]);
  assert.deepEqual(queen.physicalColors.map(color => color.score), [0.4479166666666667, 0.3958333333333333]);
  close(row('queens', 'queen-box-jumps').score, 81.5 / 192);
  close(row('queens', 'forward-queen-control').score, 88.5 / 192);
  close(row('queens', 'tall-queen-control').score, 116.5 / 192);
  assert.equal(queen.openingCoverage.shared, 32);
  const review = evidence.renderAudit(audit);
  assert.match(review, /weaker exploration choice/); assert.match(review, /37\.24%–46\.87%/);
});

test('selected fQ2 keeps the same controlled prior and its slightly strong basket score', () => {
  const pawn = row('pawns2', 'pawn-forward-only'), quiet = row('pawns2', 'pawn-quiet-range');
  assert.equal(pawn.movement, 'fQ2'); assert.deepEqual(pawn.prior, { mg: 536, eg: 592 });
  assert.deepEqual([pawn.games, pawn.wins, pawn.draws, pawn.losses], [192, 75, 67, 50]);
  close(pawn.score, 108.5 / 192); close(quiet.score, 111.5 / 192);
  assert.deepEqual(pawn.cells.map(cell => cell.score), [0.609375, 0.5859375, 0.5]);
  assert.equal(pawn.openingCoverage.shared, 32); assert.ok(pawn.cells.every(cell => cell.games === 64));
  const review = evidence.renderAudit(audit);
  assert.match(review, /mildly strong/); assert.match(review, /51\.82%–61\.46%/);
  assert.match(review, /en-passant target leaves the bypassed pawn/);
});

test('all opening positions replay while exact centipawns and bounds remain separate', () => {
  assert.deepEqual(input.studies.map(study => study.replay.prefixesIndependentlyReplayed), [768, 384]);
  assert.ok(input.studies.every(study => study.replay.fullGameContinuationsIndependentlyReplayed === 0));
  const queens = study('queens').report.openingEvaluations.counts, pawns = study('pawns2').report.openingEvaluations.counts;
  assert.deepEqual([queens.exactCp, queens.boundedCp, queens.mate, queens.invalid, queens.missing], [631, 137, 0, 0, 0]);
  assert.deepEqual([pawns.exactCp, pawns.boundedCp, pawns.mate, pawns.invalid, pawns.missing], [333, 51, 0, 0, 0]);
  assert.ok(input.studies.every(study => study.report.rows.every(row => row.openingCoverage.shared === 32)));
});

test('selection metadata records design preference without inventing original runtime provenance', () => {
  assert.deepEqual(audit.selections.map(selection => [selection.id, selection.movement, selection.level]), [
    ['queen.level1-wide-forward-knight@1', 'QfsN', 1], ['pawn.level2-forward-queen-only@1', 'fQ2', 2],
  ]);
  for (const field of ['originalCampaignManifestsSupplied', 'originalStageManifestsSupplied', 'originalRuntimeSnapshotsSupplied',
    'nativePreflightSupplied', 'originalExecutableIndependentlyVerified', 'fullGameMovesIndependentlyReplayed']) assert.equal(evidence.PROVENANCE[field], false);
  assert.equal(evidence.PROVENANCE.recordedEngineSha256, evidence.ENGINE_SHA256);
  assert.match(evidence.renderAudit(audit), /not establish exact balance/);
  assert.match(evidence.renderAudit(audit), /old null-runtime receipt remains preserved/);
});

test('archive corruption, duplicate games, changed budgets and altered report tables are rejected', async () => {
  const pin = input.pins.studies.queens.journals[0], bytes = fs.readFileSync(path.join(evidence.ROOT, pin.archiveFile));
  bytes[0] ^= 1; assert.throws(() => readPinned(pin, () => bytes), /Archive changed/);
  const duplicate = inputs('pawns2'); duplicate[0].records.push(structuredClone(duplicate[0].records[0]));
  await assert.rejects(evidence.analyzeStudy('pawns2', duplicate, input.descriptors, uploaded('pawns2')), /Duplicate uploaded/);
  const changed = inputs('queens'); changed[0].records[0].engine.nodes = 80000;
  await assert.rejects(evidence.analyzeStudy('queens', changed, input.descriptors, uploaded('queens')), /search budget changed/);
  await assert.rejects(evidence.analyzeStudy('pawns2', inputs('pawns2'), input.descriptors, uploaded('pawns2').replace('56.51%', '50.00%')), /numeric report tables differ/);
});

test('the review and structured audit regenerate exactly with no engine option or arbitrary output path', async () => {
  assert.equal(fs.readFileSync(path.join(evidence.ROOT, `${evidence.PREFIX}.audit.json`), 'utf8'), JSON.stringify(audit) + '\n');
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../docs/v19-selected-trials-review.md'), 'utf8'), evidence.renderAudit(audit));
  await assert.rejects(evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
