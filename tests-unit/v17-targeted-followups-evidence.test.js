'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const evidence = require('../scripts/balance/v17-targeted-followups-evidence');
let input;
test.before(() => { input = evidence.loadEvidence(); });
const study = key => input.studies.find(row => row.study === key);
const sources = key => study(key).stages.map(stage => ({ nodes: stage.nodes, records: [...stage.records] }));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);

test('all five original journals reproduce three exact reports without invented run/native provenance', () => {
  assert.deepEqual(input.studies.map(row => [row.study, row.stages.map(stage => [stage.nodes, stage.records.length])]), [
    ['knight-pawn', [[20000, 2304]]], ['nightrider', [[40000, 256], [80000, 256]]], ['cataphract', [[40000, 256], [80000, 256]]],
  ]);
  assert.ok(input.studies.every(row => row.declaration.reportReproducedExactly));
  assert.equal(input.provenance.engineSha256, null);
  assert.equal(input.provenance.originalCampaignManifestsSupplied, false);
  assert.equal(input.provenance.originalRuntimeReceiptsSupplied, false);
  assert.equal(input.provenance.nativePreflightSupplied, false);
  assert.equal(input.provenance.legalMovesIndependentlyReplayed, false);
});

test('original-byte and archive pins reject changed uploads before report reconstruction', () => {
  assert.throws(() => evidence.loadStudyEvidence('knight-pawn', { readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[40] ^= 1; return bytes;
  } }), /Archive changed/);
});

test('missing budgets, duplicate stages and copied or unpaired games cannot add evidence', () => {
  const knight = sources('nightrider');
  assert.throws(() => evidence.analyzeStudy('nightrider', knight.slice(1)), /budgets are required/);
  assert.throws(() => evidence.analyzeStudy('nightrider', [...knight, knight[0]]), /Duplicate node-budget/);
  const copied = sources('cataphract'); copied[0].records[1] = copied[0].records[0];
  assert.throws(() => evidence.analyzeStudy('cataphract', copied), /Duplicate follow-up game/);
  const missing = sources('knight-pawn'); missing[0].records.pop();
  assert.throws(() => evidence.analyzeStudy('knight-pawn', missing), /incomplete/);
  assert.throws(() => evidence.analyzeStudy('foreign-study', knight), /Choose/);
});

test('schema, profile, value, search, starting-army, strength and opening changes fail closed', () => {
  for (const patch of [{ attempt: 2 }, { mystery: true }, { profileHash: '0'.repeat(64) }, { startFen: 'foreign' },
    { evaluation: null }, { engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 } },
    { whiteStrength: { skill: 1 } }, { openingMoves: [] }, { result: '*' }, { id: 'foreign-game' }]) {
    const rows = sources('cataphract'); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy('cataphract', rows));
  }
  const missing = sources('cataphract'); missing[0].records[0] = { ...missing[0].records[0] }; delete missing[0].records[0].startedAt;
  assert.throws(() => evidence.analyzeStudy('cataphract', missing), /schema changed/);
});

test('terminal metadata and move-count corruption cannot silently change outcomes', () => {
  for (const patch of [{ totalPlies: 999 }, { sans: [] }, { moves: [] }, { reason: 'unknown' }, { finalFen: 'invalid' },
    { finishedAt: 'not-a-timestamp' }, { lastInfo: null }]) {
    const rows = sources('nightrider'); rows[0].records[0] = { ...rows[0].records[0], ...patch };
    assert.throws(() => evidence.analyzeStudy('nightrider', rows));
  }
});

test('quiet-tall pawn result retains partner, placement, color and fixed-half differences', () => {
  const report = study('knight-pawn').report.reports[0], quiet = report.bodies.find(row => row.key === 'tall-quiet');
  close(quiet.score, 383.5 / 768);
  assert.deepEqual([quiet.wins, quiet.draws, quiet.losses, quiet.games], [327, 113, 328, 768]);
  assert.equal(quiet.openingCoverage.shared, 16);
  report.cohorts.forEach((cohort, index) => close(cohort.bodies.find(row => row.key === 'tall-quiet').score, [193 / 384, 190.5 / 384][index]));
  close(quiet.physicalColors[0].score, 223.5 / 384);
  close(quiet.physicalColors[1].score, 160 / 384);
  close(report.gains.find(row => row.key === 'tall-quiet').difference, -0.1171875);
});

test('the confirmation and Cataphract alternatives keep budgets and historical controls separate', () => {
  const night = study('nightrider').report, cat = study('cataphract').report;
  const scores = report => report.reports.map(row => row.report.overall.rows.map(body => body.score));
  assert.deepEqual(scores(night), [[40.5 / 128, 84 / 128], [47 / 128, 79.5 / 128]]);
  assert.deepEqual(scores(cat), [[63.5 / 128, 49.5 / 128], [67 / 128, 51 / 128]]);
  assert.equal(night.crossBudget.rawChanges.find(row => row.key === 'diagonal-captures').difference, -0.03515625);
  assert.equal(cat.reports[0].report.overall.rows.length, 2);
  assert.ok(!cat.reports.some(row => row.report.overall.rows.some(body => body.key === 'original')));
});

test('committed artifacts verify offline and reject flags that could start an engine', () => {
  const audit = evidence.main([]);
  assert.deepEqual(audit.counts, { uploadedGames: 3328, completedGames: 3328, pairedGames: 3328, completePairs: 1664,
    truncatedGames: 0, errors: 0, retries: 0, newMatchGames: 0, engineSearches: 0 });
  assert.throws(() => evidence.main(['--engine', 'unexpected']), /Use no arguments/);
});
