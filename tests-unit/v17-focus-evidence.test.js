const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { analyzeScreenRecords } = require('../scripts/balance/v17-screen-evidence');
const { loadFocusEvidence, buildFocusAudit, renderFocusAudit, main } = require('../scripts/balance/v17-focus-evidence');

test('the exact design-focus upload reproduces every completed pair with explicit provenance limits', () => {
  const source = loadFocusEvidence();
  assert.equal(source.records.length, 640);
  assert.equal(source.report.progress.pairedGames, 640);
  assert.equal(source.report.progress.completePairs, 320);
  assert.equal(source.provenance.originalManifestSupplied, false);
  assert.equal(source.provenance.nativePreflightSupplied, false);
  assert.equal(source.provenance.engineSha256, null);
  assert.equal(source.provenance.legalMovesIndependentlyReplayed, false);
});

test('corruption, duplicate/missing games and changed recorded context cannot alter the archive', () => {
  assert.throws(() => loadFocusEvidence({ readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[10] ^= 1; return bytes;
  } }), /Archive changed/);
  const { records } = loadFocusEvidence();
  assert.throws(() => analyzeScreenRecords('design-focus', records.slice(1)), /every scheduled/);
  const copied = [...records]; copied[1] = copied[0];
  assert.throws(() => analyzeScreenRecords('design-focus', copied), /repeats a game/);
  const changed = [...records]; changed[0] = { ...changed[0], profileHash: 'foreign' };
  assert.throws(() => analyzeScreenRecords('design-focus', changed), /frozen rules profile/);
});

test('panel scores, separate baseline and opening-cohort differences remain visible', () => {
  const audit = buildFocusAudit(), rows = Object.fromEntries(audit.rows.map(row => [row.key, row]));
  assert.equal(rows['grid-bishop'].score, 0.5859375);
  assert.equal(rows['grid-bishop'].baseline.score, 0.765625);
  assert.equal(rows['full-diagonal-pawns'].score, 0.34765625);
  assert.equal(rows['full-diagonal-pawns'].cohorts['original-eight'].baselineScore, 0.65625);
  assert.equal(rows['full-diagonal-pawns'].cohorts['new-eight'].baselineScore, 0.3125);
  assert.equal(rows['long-forward-grants'].score, 0.55859375);
  assert.ok(Object.values(rows['long-forward-grants'].cohorts).every(cohort => cohort.baselineScore === 0.71875));
  assert.equal(rows['pawn-like-grants'].score, 0.63671875);
  assert.ok(audit.rows.every(row => row.games === 128 && row.baseline.games === 32));
  assert.deepEqual(audit.counts, { completedGames: 640, pairedGames: 640, completePairs: 320, newMatchGames: 0, engineSearches: 0 });
});

test('derived reports reproduce offline and distinguish matchup evidence from universal strength', () => {
  const text = renderFocusAudit(buildFocusAudit());
  assert.match(text, /58\.59%/);
  assert.match(text, /71\.88%/);
  assert.match(text, /does not imply transitive equality/);
  assert.match(text, /Original run manifests and native preflight proofs were not supplied/);
  assert.doesNotThrow(() => main([]));
});
