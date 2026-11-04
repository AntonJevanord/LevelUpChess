'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evidence = require('../scripts/balance/v17-level3-panel-final-evidence');
const insights = require('../scripts/panel-insights');
let bundle, audit;
test.before(() => { bundle = evidence.loadBundle(); audit = evidence.buildAudit(bundle); });

test('pinned compact archive and all uploaded reports verify and retain exact source identities', () => {
  assert.equal(bundle.pairs.source.selectedOpenings, 64);
  assert.deepEqual(bundle.pairs.cohorts.map(row => row.pairs.length), [2880, 2877, 2877]);
  assert.equal(audit.provenance.colorAndExclusionReportsReproducedExactly, true);
  assert.equal(audit.provenance.panelHeadAndOverallScoresReproduced, true);
  assert.equal(evidence.DUPLICATE_COLOR_UPLOAD.identicalTo, 'colors');
  assert.ok(evidence.SOURCES.pairs.archivedBytes < 140000);
  for (const key of ['pairs', 'material', 'panel']) {
    assert.match(evidence.SOURCES[key].sedimentId, /^file_/);
    assert.match(evidence.SOURCES[key].sha256, /^[a-f0-9]{64}$/);
  }
});

test('finalized/scored coverage remains distinct from the compact H2H and recorded anchor coverage', () => {
  assert.equal(audit.counts.finalizedGames, 21120);
  assert.equal(audit.counts.scoredPairedGames, 21106);
  assert.equal(audit.counts.headPairs, 8634);
  assert.equal(audit.counts.headGames, 17268);
  assert.equal(audit.counts.ordinaryPairedGamesRecorded, 3838);
  assert.equal(audit.counts.finalizedRecordsOutsideScoredPairs, 14);
  assert.equal(audit.counts.colorPairsWithoutAScore, 7);
  assert.equal(audit.counts.exactTruncationCountKnown, false);
  assert.equal(audit.counts.exactErrorAttemptCountKnown, false);
  assert.deepEqual(audit.receiptCounts.map(row => row.scoredPairedGames), [7040, 7032, 7034]);
  assert.equal(audit.continuity.retainedHeadGames, 4320);
});

test('recorded material coefficients and ordinary anchors stay reported evidence, never native attestations or new fits', () => {
  const at80k = audit.budgets.find(row => row.nodes === 80000);
  assert.equal(at80k.reportedMaterial.upgrades.find(row => row.key === 'amazon').combinedBonus, 3.06);
  assert.equal(at80k.reportedMaterial.ordinary.find(row => row.piece === 'rook').value, 4.60);
  assert.equal(at80k.reportedMaterial.fitsReported.length, 6);
  assert.equal(at80k.reportedMaterial.ordinaryAnchorsReported.length, 10);
  for (const key of ['finalRawJournalAvailable', 'originalFilesReverifiedHere', 'ordinaryAnchorOutcomesReproduced',
    'legalMovesIndependentlyReplayed', 'materialEstimatesRefitted', 'nativePreflightSupplied']) assert.equal(audit.provenance[key], false);
  assert.equal(audit.provenance.sourceReceiptsRecorded, true);
  assert.equal(audit.provenance.newGames, 0); assert.equal(audit.provenance.nativeSearches, 0);
  assert.match(evidence.renderAudit(audit), /not a new fit/);
});

test('changed compressed evidence or uploaded report bytes cannot silently replace the pinned source', () => {
  for (const suffix of ['.json.gz', '.material-report.md']) assert.throws(() => evidence.loadBundle({ read(file) {
    const bytes = Buffer.from(fs.readFileSync(file));
    if (file.endsWith(suffix)) bytes[Math.floor(bytes.length / 2)] ^= 1;
    return bytes;
  } }), /checksum changed/);
});

test('a validly resealed compact export cannot change schedule identity or disagree with the uploaded outcomes', () => {
  const changedSchedule = structuredClone(bundle.pairs);
  changedSchedule.cohorts[0].pairs[0].whiteGameId = 'foreign-game-w';
  const { payloadSha256, ...payload } = changedSchedule;
  assert.throws(() => evidence.validateDeclaration(insights.seal(payload)), /scheduled game identity/);
  const changedScore = structuredClone(bundle.pairs);
  changedScore.cohorts[0].pairs[0].aWhite = 1 - changedScore.cohorts[0].pairs[0].aWhite;
  changedScore.cohorts[0].pairs[0].aBlack = 1 - changedScore.cohorts[0].pairs[0].aBlack;
  const { payloadSha256: ignored, ...scorePayload } = changedScore;
  const resealed = insights.seal(scorePayload);
  assert.throws(() => evidence.verifyReports({ ...bundle, pairs: resealed }, audit.receiptCounts), /report differs/);
});

test('panel and material coverage mismatches fail independently of the compact export integrity', () => {
  assert.throws(() => evidence.verifyReports({ ...bundle,
    panel: bundle.panel.replace('scored paired games: 21106.', 'scored paired games: 21108.') }, audit.receiptCounts));
  assert.throws(() => evidence.verifyReports({ ...bundle,
    material: bundle.material.replace('7040 scored paired games', '7038 scored paired games') }, audit.receiptCounts));
});

test('derived archive artifacts reproduce and older archived outcomes remain unchanged', () => {
  const root = path.resolve(__dirname, '../experiments/balance/results');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'v17-level3-panel-004.audit.json'), 'utf8')), audit);
  assert.equal(fs.readFileSync(path.join(root, 'v17-level3-panel-004.report.md'), 'utf8'), evidence.renderAudit(audit));
  const changed = structuredClone(bundle.pairs), prior = changed.cohorts[0].pairs.find(row => row.stageKey === 'batch-01-n20000');
  prior.aWhite = prior.aWhite === 0 ? 1 : 0;
  assert.throws(() => evidence.checkHistoricalContinuity(changed), /prior head-to-head outcome changed/);
  assert.throws(() => evidence.main(['--engine', 'anything']), /no arguments/);
});
