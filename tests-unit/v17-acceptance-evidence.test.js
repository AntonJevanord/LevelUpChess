const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const {
  SOURCES, PROVENANCE, COUNTS, CALIBRATION_SHA256, readPinnedSource,
  analyzeAcceptanceRecords, loadAcceptanceEvidence, buildAcceptanceAudit, renderAcceptanceAudit, main,
} = require('../scripts/balance/v17-acceptance-evidence');

const loaded = {};
test.before(() => { for (const name of Object.keys(SOURCES)) loaded[name] = loadAcceptanceEvidence(name); });

test('all four exact uploads reproduce complete declarations, cohorts, valuation and Markdown', () => {
  for (const [name, count] of Object.entries(COUNTS)) {
    const input = loaded[name];
    assert.equal(input.records.length, count);
    assert.deepEqual(input.report.progress, { attempts: count, duplicateCopiesIgnored: 0, finalizedGames: count,
      completedGames: count, pairedGames: count, completePairs: count / 2 });
    assert.equal(input.declaration.reportReproducedExactly, true);
    assert.equal(input.report.bracketStudy.evaluationAudit.provenance.sha256, CALIBRATION_SHA256);
    assert.deepEqual(input.report.bracketStudy.cohorts.map(cohort => [cohort.openingIds.length, cohort.complete]), [[8, true], [8, true], [16, true]]);
    assert.ok(input.report.comparisons.every(row => row.openings === 16 && row.pairedGames === 32
      && row.statusCounts.error === 0 && row.statusCounts.truncated === 0));
    assert.equal(input.report.runId, null);
    assert.equal(input.manifest, undefined);
    assert.equal(input.nativePreflight, undefined);
  }
  assert.equal(PROVENANCE.originalManifestSupplied, false);
  assert.equal(PROVENANCE.nativePreflightSupplied, false);
  assert.equal(PROVENANCE.legalMovesIndependentlyReplayed, false);
  assert.equal(PROVENANCE.engineSha256, null);
});

test('compressed corruption and recompressed original-byte edits both fail their own pins', () => {
  assert.throws(() => loadAcceptanceEvidence('minors', { readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[20] ^= 1; return bytes;
  } }), /Archive changed/);
  const pin = SOURCES.minors.uploadedReport;
  const original = readPinnedSource(pin), modified = Buffer.from(original); modified[0] ^= 1;
  const packed = gzipSync(modified, { level: 9 });
  const changedArchivePin = { ...pin, archivedSha256: createHash('sha256').update(packed).digest('hex') };
  assert.throws(() => readPinnedSource(changedArchivePin, () => packed), /Original bytes changed/);
  assert.deepEqual(gunzipSync(gzipSync(original, { level: 9 })), original);
});

test('changed search, movement profile, evaluation, opening, strength or engine name is rejected', () => {
  const input = loaded.majors;
  const change = patch => input.records.map((record, index) => index ? record : { ...record, ...patch });
  for (const patch of [
    { engine: { ...input.config.engine, nodes: 30000 } },
    { evaluation: { pieceValues: {} } },
    { whiteStrength: { skill: 19 } },
    { openingMoves: ['e2e4'] },
  ]) assert.throws(() => analyzeAcceptanceRecords('majors', change(patch)));
  assert.throws(() => analyzeAcceptanceRecords('majors', change({ profileHash: '0'.repeat(64) })), /frozen rules profile/);
  assert.throws(() => analyzeAcceptanceRecords('majors', change({ engineNames: { w: 'Other', b: 'Other' } })), /engine names changed/);
  assert.throws(() => analyzeAcceptanceRecords('majors', change({ startFen: '8/8/8/8/8/8/8/K6k w - - 0 1' })), /starting army changed/);
  assert.throws(() => analyzeAcceptanceRecords('majors', change({ id: 'unknown-game' })), /unknown scheduled game/);
  assert.throws(() => analyzeAcceptanceRecords('majors', change({ totalPlies: 0 })), /total ply count changed/);
  assert.throws(() => analyzeAcceptanceRecords('majors', input.records, 'edited report'), /differs from the exact uploaded report/);
});

test('conflicting duplicates, retries and unscored records cannot become completed evidence', () => {
  const input = loaded.minors, changed = input.records.slice();
  changed[1] = { ...changed[0], result: changed[0].result === '1-0' ? '0-1' : '1-0' };
  assert.throws(() => analyzeAcceptanceRecords('minors', changed), /conflicting duplicate attempts/);
  changed[1] = { ...input.records[1], attempt: 2 };
  assert.throws(() => analyzeAcceptanceRecords('minors', changed), /one attempt per game/);
  changed[1] = { ...input.records[1], status: 'truncated', result: '*', reason: 'max-plies' };
  assert.throws(() => analyzeAcceptanceRecords('minors', changed), /only completed games/);
});

test('a missing color partner is excluded and reduces shared cases only in explicit partial analysis', () => {
  const input = loaded.minors, missing = input.records[0], records = input.records.slice(1);
  assert.throws(() => analyzeAcceptanceRecords('minors', records), /every scheduled game/);
  const partial = analyzeAcceptanceRecords('minors', records, undefined, { requireComplete: false });
  assert.equal(partial.report.progress.completedGames, COUNTS.minors - 1);
  assert.equal(partial.report.progress.pairedGames, COUNTS.minors - 2);
  const comparison = partial.report.comparisons.find(row => row.id === missing.comparisonId);
  assert.equal(comparison.pairedGames, 30);
  assert.equal(comparison.partialPairs, 1);
  const row = partial.report.overall.rows.find(row => row.key === comparison.aKey);
  assert.equal(row.openingCoverage.shared, 15);
  assert.equal(row.games, 90);
  assert.equal(partial.report.bracketStudy.cohorts[2].complete, false);
});

test('cohort detail preserves the near-even Wazzap and the Pawn-rook counter', () => {
  const audit = buildAcceptanceAudit();
  const groups = audit.stages.flatMap(stage => stage.bracketStudy.brackets);
  const current = key => groups.find(group => group.key === key).variants.find(row => row.key === 'current');
  assert.equal(current('wazzap').cohorts[2].score, 50.5 / 96);
  assert.deepEqual(current('wazzap').cohorts.map(row => row.score), [26.5 / 48, 24 / 48, 50.5 / 96]);
  assert.deepEqual(current('pawn-rook').cohorts[2].opponents.map(row => row.score), [20 / 32, 8.5 / 32, 18.5 / 32]);
  assert.deepEqual(current('pawn-rook').cohorts.slice(0, 2).map(row => row.opponents[1].score), [2 / 16, 6.5 / 16]);
  assert.ok(groups.filter(group => group.family !== 'queen').every(group => group.variants.every(row => row.upgradePoints === 2)));
  assert.ok(groups.find(group => group.family === 'queen').variants.every(row => row.upgradePoints === 1));
  assert.ok(groups.every(group => group.variants.every(row => row.cohorts[2].games === 96)));
  assert.equal(audit.counts.uploadedGames, 2016);
  assert.equal(audit.counts.engineSearches, 0);
  assert.match(renderAcceptanceAudit(audit), /single upgraded queen.*budget 1/);
});

test('committed derived evidence reproduces offline without accepting run/search arguments', () => {
  const audit = main([]);
  assert.equal(audit.counts.completePairs, 1008);
  assert.throws(() => main(['--run']), /Use no arguments or --write/);
});
