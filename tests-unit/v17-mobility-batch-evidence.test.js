const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  SOURCES, analyzeMobilityBatchRecords, loadMobilityBatchEvidence,
  buildMobilityBatchAudit, renderMobilityBatchReport, main,
} = require('../scripts/balance/v17-mobility-batch-evidence');

test('both exact journals match their distinct declared campaigns without claiming uploaded reports', () => {
  for (const [experiment, attempts, completedGames, pairedGames, completePairs] of [
    ['mobility-confirm', 768, 767, 766, 383],
    ['mobility-revisions', 960, 957, 954, 477],
  ]) {
    const evidence = loadMobilityBatchEvidence(experiment);
    assert.deepEqual(evidence.report.progress, {
      attempts, duplicateCopiesIgnored: 0, finalizedGames: attempts,
      completedGames, pairedGames, completePairs,
    });
    assert.equal(evidence.declaration.uploadedReportSupplied, false);
    assert.equal(evidence.declaration.reportReproducedExactly, false);
    assert.equal(evidence.provenance.originalManifestSupplied, false);
    assert.equal(evidence.provenance.nativePreflightSupplied, false);
    assert.equal(evidence.provenance.engineSha256, null);
    assert.equal(evidence.provenance.legalMovesIndependentlyReplayed, false);
    assert.match(renderMobilityBatchReport(experiment), /Reconstructed from the exact archived journal/);
  }
});

test('corruption, copied or missing games and foreign run context cannot change frozen evidence', () => {
  for (const experiment of Object.keys(SOURCES)) {
    assert.throws(() => loadMobilityBatchEvidence(experiment, { readArchive(file) {
      const bytes = Buffer.from(fs.readFileSync(file)); bytes[10] ^= 1; return bytes;
    } }), /Archive changed/);
    const { records } = loadMobilityBatchEvidence(experiment);
    assert.throws(() => analyzeMobilityBatchRecords(experiment, records.slice(1)), /every scheduled game/);
    const copied = [...records]; copied[1] = copied[0];
    assert.throws(() => analyzeMobilityBatchRecords(experiment, copied), /repeats a game identity/);
    for (const changes of [{ profileHash: 'foreign' }, { registryHash: 'foreign' },
      { engine: { ...records[0].engine, nodes: 1000 } }, { repetition: 2 },
      { sans: records[0].sans.slice(1) }]) {
      const changed = [...records]; changed[0] = { ...changed[0], ...changes };
      assert.throws(() => analyzeMobilityBatchRecords(experiment, changed),
        /profile|context changed|repetition changed|SAN and UCI counts/);
    }
  }
});

test('four move-limit truncations and their scored partners stay out of paired results', () => {
  const audit = buildMobilityBatchAudit();
  assert.deepEqual(audit.counts, {
    uploadedScheduledGames: 1728, uploadedCompletedGames: 1724, uploadedTruncatedGames: 4,
    pairedGames: 1720, completePairs: 860, excludedCompletedPartners: 4,
    errors: 0, newMatchGames: 0, engineSearches: 0,
  });
  assert.equal(audit.experiments.flatMap(item => item.truncations).length, 4);
  for (const experiment of Object.keys(SOURCES)) {
    const evidence = loadMobilityBatchEvidence(experiment);
    const index = evidence.records.findIndex(record => record.status === 'truncated');
    for (const changes of [{ result: '1/2-1/2' }, { reason: 'cancelled' }]) {
      const changed = [...evidence.records]; changed[index] = { ...changed[index], ...changes };
      assert.throws(() => analyzeMobilityBatchRecords(experiment, changed), /remain unscored|Unexpected truncation reason/);
    }
  }
});

test('a missing king-step reference pair restricts the overall to common cases across all four references', () => {
  const { report } = loadMobilityBatchEvidence('mobility-revisions');
  const king = report.overall.rows.find(row => row.key === 'king-step-pawns');
  assert.equal(king.games, 248);
  assert.equal(king.openingCoverage.shared, 31);
  assert.equal(king.openingCoverage.total, 32);
  assert.equal(king.score, 120 / 248);
  assert.ok(king.opponents.every(opponent => opponent.games === 62));
  assert.ok(!king.openingCoverage.openingIds.includes('english-prefix'));
  const cells = report.matrix.rows.find(row => row.key === king.key).cells;
  assert.deepEqual(cells.map(cell => cell.pairedGames), [64, 62, 64, 64, 64]);
  assert.equal(cells.at(-1).score, 0.515625);
  assert.notEqual(king.score, cells.slice(0, 4).reduce((sum, cell) => sum + cell.score, 0) / 4);
});

test('direct pawn baseline truncations cannot alter complete reference-panel coverage', () => {
  for (const [experiment, key, cases, score, baselineGames] of [
    ['mobility-confirm', 'pawn-like-grants', 16, 0.58984375, 30],
    ['mobility-revisions', 'mobile-forward-grants', 32, 0.44921875, 60],
  ]) {
    const { report } = loadMobilityBatchEvidence(experiment);
    const row = report.overall.rows.find(item => item.key === key);
    assert.equal(row.openingCoverage.shared, cases);
    assert.equal(row.games, cases * 8);
    assert.equal(row.score, score);
    assert.equal(report.matrix.rows.find(item => item.key === key).cells.at(-1).pairedGames, baselineGames);
  }
});

test('the saved batch audit and reconstructed reports reproduce offline', () => {
  assert.doesNotThrow(() => main([]));
  assert.throws(() => main(['--unknown']), /Use no arguments or --write/);
});
