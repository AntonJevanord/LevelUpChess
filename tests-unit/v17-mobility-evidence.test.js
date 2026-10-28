const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  SOURCES, RESUBMITTED_SOURCES, analyzeMobilityRecords, loadMobilityEvidence,
  buildMobilityAudit, renderMobilityAudit, main,
} = require('../scripts/balance/v17-mobility-evidence');

test('the exact additions upload reproduces its report without inventing run provenance', () => {
  const evidence = loadMobilityEvidence();
  assert.equal(evidence.experiment, 'mobility-additions');
  assert.equal(evidence.records.length, 640);
  assert.deepEqual(evidence.report.progress, {
    attempts: 640, duplicateCopiesIgnored: 0, finalizedGames: 640,
    completedGames: 639, pairedGames: 638, completePairs: 319,
  });
  assert.equal(evidence.declaration.reportReproducedExactly, true);
  assert.equal(evidence.provenance.originalManifestSupplied, false);
  assert.equal(evidence.provenance.nativePreflightSupplied, false);
  assert.equal(evidence.provenance.engineSha256, null);
  assert.equal(evidence.provenance.legalMovesIndependentlyReplayed, false);
});

test('pinned uploads reject corruption in either new evidence or reused archives', () => {
  for (const filename of [SOURCES.journal.archiveFile, SOURCES.uploadedReport.archiveFile,
    RESUBMITTED_SOURCES['level3-confirm'].journal.archiveFile]) {
    assert.throws(() => loadMobilityEvidence({ readArchive(file) {
      const bytes = Buffer.from(fs.readFileSync(file));
      if (file.endsWith(filename)) bytes[10] ^= 1;
      return bytes;
    } }), /Archive changed/);
  }
});

test('missing games, copied identities and changed profile/search settings cannot become evidence', () => {
  const { records } = loadMobilityEvidence();
  assert.throws(() => analyzeMobilityRecords(records.slice(1)), /every scheduled game/);
  const copied = [...records]; copied[1] = copied[0];
  assert.throws(() => analyzeMobilityRecords(copied), /repeat a game identity/);
  for (const changes of [{ profileHash: 'foreign' }, { engine: { ...records[0].engine, nodes: 1000 } },
    { repetition: 2 }, { sans: records[0].sans.slice(1) }]) {
    const changed = [...records]; changed[0] = { ...changed[0], ...changes };
    assert.throws(() => analyzeMobilityRecords(changed), /profile|context changed|repetition changed|SAN and UCI counts/);
  }
});

test('move-limit outcomes stay unscored and exclude their completed opposite-color partner', () => {
  const evidence = loadMobilityEvidence();
  const index = evidence.records.findIndex(record => record.status === 'truncated');
  for (const changes of [{ result: '1/2-1/2' }, { reason: 'cancelled' }]) {
    const changed = [...evidence.records]; changed[index] = { ...changed[index], ...changes };
    assert.throws(() => analyzeMobilityRecords(changed), /remain unscored|Unexpected truncation reason/);
  }
  const audit = buildMobilityAudit();
  const scout = audit.rows.find(row => row.key === 'scout-grants');
  assert.equal(scout.baseline.games, 62);
  assert.equal(scout.baseline.completePairs, 31);
  assert.deepEqual([scout.baseline.wins, scout.baseline.draws, scout.baseline.losses], [23, 14, 25]);
  assert.equal(scout.baseline.score, 30 / 62);
  const [truncated] = audit.truncations;
  assert.equal(truncated.openingId, 'followup-symmetrical-english');
  assert.equal(truncated.aColor, 'w');
  assert.equal(truncated.totalPlies, 400);
  assert.equal(truncated.result, '*');
  assert.equal(truncated.excludedCompletedPartner.aColor, 'b');
  assert.equal(truncated.excludedCompletedPartner.result, '0-1');
  assert.equal(truncated.excludedCompletedPartner.totalPlies, 118);
  assert.equal(truncated.excludedCompletedPartner.scoreForA, 1);
  assert.ok(audit.rows.every(row => row.games === 256 && row.opponents.length === 4));
});

test('reference averages stay separate from direct baseline scores and opening cohorts', () => {
  const audit = buildMobilityAudit();
  const support = audit.rows.find(row => row.key === 'support-pawns');
  const scout = audit.rows.find(row => row.key === 'scout-grants');
  assert.equal(support.score, 0.28515625);
  assert.equal(support.baseline.score, 0.25);
  assert.deepEqual([support.wins, support.draws, support.losses], [51, 44, 161]);
  assert.equal(support.cohorts['original-sixteen'].referenceScore, 0.2421875);
  assert.equal(support.cohorts['new-sixteen'].referenceScore, 0.328125);
  assert.equal(support.cohorts['original-sixteen'].baselineScore, 0.234375);
  assert.equal(support.cohorts['new-sixteen'].baselineScore, 0.265625);
  assert.equal(scout.score, 0.453125);
  assert.equal(scout.cohorts['original-sixteen'].referenceScore, 0.46484375);
  assert.equal(scout.cohorts['new-sixteen'].referenceScore, 0.44140625);
  assert.equal(scout.cohorts['original-sixteen'].baselineGames, 30);
  assert.equal(scout.cohorts['new-sixteen'].baselineGames, 32);
  assert.equal(scout.cohorts['original-sixteen'].opponents.find(row => row.key === 'cruisader').score, 0.25);
  assert.equal(scout.cohorts['new-sixteen'].opponents.find(row => row.key === 'cruisader').score, 0.328125);
  assert.deepEqual(scout.physicalColors.map(row => [row.key, row.games, row.score]),
    [['w', 128, 0.5234375], ['b', 128, 0.3828125]]);
});

test('resubmitted historical files add no weight or supposed mobility results', () => {
  const audit = buildMobilityAudit();
  assert.deepEqual(Object.keys(audit.resubmittedSources), ['level3-confirm', 'level3-revisions']);
  assert.ok(Object.values(audit.resubmittedSources).every(source => source.exactDuplicate && source.addedGames === 0));
  assert.deepEqual(audit.counts, {
    scheduledGames: 640, finalizedGames: 640, completedGames: 639, truncatedGames: 1,
    pairedGames: 638, completePairs: 319, excludedCompletedPartners: 1, errors: 0,
    newMatchGames: 0, engineSearches: 0,
  });
  assert.match(audit.scope, /No mobility-confirm, mobility-revisions or mobility-expanded journal was supplied/);
});

test('derived reports reproduce offline with bounded recommendations and provenance limits', () => {
  const report = renderMobilityAudit(buildMobilityAudit());
  assert.match(report, /Park the current Support pawn/);
  assert.match(report, /provisional one-point playtest candidate/);
  assert.match(report, /Original run manifests and native preflight proofs were not supplied/);
  assert.match(report, /No engine searches or new games are started/);
  assert.doesNotThrow(() => main([]));
  assert.throws(() => main(['--unknown']), /Use no arguments or --write/);
});
