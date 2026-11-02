'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { SOURCES, loadMixedEvidence, analyzeMixedRecords, buildMixedAudit, grantContrast, main } = require('../scripts/balance/v17-mixed-evidence');
let input;
test.before(() => { input = loadMixedEvidence(); });
const changed = patch => input.records.map((row, index) => index ? row : { ...row, ...patch });

test('all1824 finalized mixed games reproduce the exact upload without inventing execution provenance', () => {
  assert.equal(input.records.length, 1824); assert.equal(input.report.progress.completedGames, 1822);
  assert.equal(input.report.progress.pairedGames, 1820); assert.equal(input.report.progress.completePairs, 910);
  assert.equal(input.declaration.reportReproducedExactly, true);
  assert.equal(input.provenance.originalManifestSupplied, false); assert.equal(input.provenance.nativePreflightSupplied, false);
  assert.equal(input.provenance.legalMovesIndependentlyReplayed, false);
});
test('lossless archive pins reject corrupt evidence before any score is derived', () => {
  assert.throws(() => loadMixedEvidence({ readArchive(file) { const raw = Buffer.from(fs.readFileSync(file)); raw[40] ^= 1; return raw; } }), /Archive changed/);
  assert.match(SOURCES.journal.sha256, /^[a-f0-9]{64}$/);
});
test('truncations and their opposite-color partners stay unscored', () => {
  const audit = buildMixedAudit();
  assert.equal(audit.counts.truncatedGames, 2); assert.equal(audit.counts.excludedCompletedPartners, 2);
  assert.ok(audit.truncations.every(row => row.reason === 'max-plies' && row.totalPlies === 400));
  const row = input.records.find(row => row.status === 'truncated');
  const records = input.records.map(record => record === row ? { ...record, result: '1/2-1/2' } : record);
  assert.throws(() => analyzeMixedRecords(records), /unscored/);
});
test('copies, absent games and changed registry/search/opening contexts cannot become evidence', () => {
  assert.throws(() => analyzeMixedRecords([...input.records, input.records[0]]));
  assert.throws(() => analyzeMixedRecords(input.records.slice(1)));
  for (const patch of [{ attempt: 2 }, { profileHash: '0'.repeat(64) }, { registryHash: '0'.repeat(64) },
    { engine: { ...input.records[0].engine, nodes: 40000 } }, { royalMode: 'capture' },
    { openingMoves: [] }, { startFen: 'foreign' }, { totalPlies: 401 }]) assert.throws(() => analyzeMixedRecords(changed(patch)));
});
test('grant contrast retains matched opening blocks and its conditional range crosses zero', () => {
  const contrast = grantContrast(input.report);
  assert.equal(contrast.cases.length, 12); assert.ok(Math.abs(contrast.scoreDifference + 11 / 96) < 1e-12);
  assert.equal(contrast.betterCases, 2); assert.equal(contrast.worseCases, 8); assert.equal(contrast.tiedCases, 2);
  assert.ok(contrast.conditionalRange.lower < 0); assert.ok(contrast.conditionalRange.upper > 0);
  assert.equal(contrast.byOpponent.find(row => row.key === 'cruisader').difference, 1 / 16);
  assert.deepEqual(grantContrast(input.report), contrast);
});
test('Knight pawn signal survives partners, placement variants and both fixed halves', () => {
  // Match the stable purchase ID through the declared team metadata, not an
  // English display string that may later acquire a presentation alias.
  const keys = input.metadata.mixedTeams.filter(team => team.members.includes('pawn.orange@3')).map(team => team.key);
  const selected = input.report.mixed.rows.filter(row => keys.includes(row.key));
  assert.equal(selected.length, 3);
  for (const row of selected) {
    assert.ok(row.score > 0.5); assert.equal(row.openingCoverage.shared, 12);
    assert.ok(row.layouts.every(layout => layout.score > 0.5));
    for (const cohort of input.report.cohorts) assert.ok(cohort.mixed.rows.find(other => other.key === row.key).score > 0.5);
  }
  assert.equal(input.report.grants.rows.find(row => row.key === 'wd-grant').score, 53 / 96);
});
test('derived evidence artifacts reproduce without games or source mutations', () => {
  assert.equal(main([]).counts.newMatchGames, 0);
  assert.equal(buildMixedAudit().counts.engineSearches, 0);
});
