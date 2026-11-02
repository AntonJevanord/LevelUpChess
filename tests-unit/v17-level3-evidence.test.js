const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { readPinnedSource } = require('../scripts/balance/v17-acceptance-evidence');
const {
  SOURCES, PROVENANCE, COUNT, CALIBRATION_SHA256, analyzeLevel3Records,
  loadLevel3Evidence, buildLevel3Audit, renderLevel3Audit, main,
} = require('../scripts/balance/v17-level3-evidence');

let input;
test.before(() => { input = loadLevel3Evidence(); });

test('exact uploads reproduce the 2,048-game declaration and original report without native proof', () => {
  assert.equal(input.records.length, COUNT);
  assert.deepEqual(input.report.progress, { attempts: COUNT, duplicateCopiesIgnored: 0, finalizedGames: COUNT,
    completedGames: COUNT - 1, pairedGames: COUNT - 2, completePairs: COUNT / 2 - 1 });
  assert.equal(input.declaration.reportReproducedExactly, true);
  assert.equal(input.report.bracketStudy.evaluationAudit.provenance.sha256, CALIBRATION_SHA256);
  assert.deepEqual(input.report.bracketStudy.cohorts.map(cohort => [cohort.openingIds.length, cohort.complete]), [[8, false], [8, true], [16, false]]);
  assert.equal(input.report.runId, null);
  assert.equal(input.manifest, undefined);
  assert.equal(input.nativePreflight, undefined);
  assert.equal(PROVENANCE.originalManifestSupplied, false);
  assert.equal(PROVENANCE.nativePreflightSupplied, false);
  assert.equal(PROVENANCE.legalMovesIndependentlyReplayed, false);
  assert.equal(PROVENANCE.engineSha256, null);
});

test('compressed corruption and original-byte edits fail separate pinned hash checks', () => {
  assert.throws(() => loadLevel3Evidence({ readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[20] ^= 1; return bytes;
  } }), /Archive changed/);
  const pin = SOURCES.uploadedReport;
  const raw = Buffer.from(readPinnedSource(pin)); raw[0] ^= 1;
  const packed = gzipSync(raw, { level: 9 });
  const changedArchivePin = { ...pin, archivedSha256: createHash('sha256').update(packed).digest('hex') };
  assert.throws(() => readPinnedSource(changedArchivePin, () => packed), /Original bytes changed/);
});

test('edited search, evaluation, movement profile, strength, engine name or starting army is rejected', () => {
  const change = patch => input.records.map((record, index) => index ? record : { ...record, ...patch });
  for (const patch of [
    { engine: { ...input.config.engine, nodes: 30000 } },
    { evaluation: { pieceValues: {} } },
    { whiteStrength: { skill: 19 } },
  ]) assert.throws(() => analyzeLevel3Records(change(patch)), /engine, strength, evaluation or opening context changed/);
  assert.throws(() => analyzeLevel3Records(change({ profileHash: '0'.repeat(64) })), /frozen rules profile/);
  assert.throws(() => analyzeLevel3Records(change({ engineNames: { w: 'Other', b: 'Other' } })), /engine names changed/);
  assert.throws(() => analyzeLevel3Records(change({ startFen: '8/8/8/8/8/8/8/K6k w - - 0 1' })), /starting army changed/);
  assert.throws(() => analyzeLevel3Records(change({ openingMoves: [] })), /opening ply count changed/);
  assert.throws(() => analyzeLevel3Records(change({ id: 'unknown-game' })), /unknown scheduled game/);
  assert.throws(() => analyzeLevel3Records(input.records, 'edited report'), /differs from the exact uploaded report/);
});

test('conflicting duplicates, invented retries and unrecorded status changes cannot add weight', () => {
  const changed = input.records.slice();
  changed[1] = { ...changed[0], result: changed[0].result === '1-0' ? '0-1' : '1-0' };
  assert.throws(() => analyzeLevel3Records(changed), /conflicting duplicate attempts/);
  changed[1] = { ...input.records[1], attempt: 2 };
  assert.throws(() => analyzeLevel3Records(changed), /one attempt per game/);
  changed[1] = { ...input.records[1], status: 'error', result: '*', reason: 'timeout' };
  assert.throws(() => analyzeLevel3Records(changed), /Only completed or truncated/);
});

test('the real Archbishop truncation and its completed partner stay excluded from scores', () => {
  const truncated = input.records.find(record => record.status === 'truncated');
  const partner = input.records.find(record => record.pairId === truncated.pairId && record.id !== truncated.id);
  assert.equal(truncated.comparisonId, 'archbishop-v-unicorn');
  assert.equal(truncated.aColor, 'b');
  assert.equal(truncated.result, '*');
  assert.equal(truncated.reason, 'max-plies');
  assert.equal(truncated.totalPlies, 400);
  assert.equal(partner.status, 'completed');
  const comparison = input.report.comparisons.find(row => row.id === truncated.comparisonId);
  assert.equal(comparison.pairedGames, 30);
  assert.equal(comparison.partialPairs, 1);
  assert.equal(comparison.statusCounts.truncated, 1);
  const row = input.report.overall.rows.find(row => row.key === 'archbishop');
  assert.equal(row.games, 120);
  assert.equal(row.openingCoverage.shared, 15);
  assert.ok(!row.openingCoverage.openingIds.includes(truncated.openingId));
  const changed = input.records.map(record => record === truncated ? { ...record, result: '1/2-1/2' } : record);
  assert.throws(() => analyzeLevel3Records(changed), /must remain unscored/);
});

test('an additional missing partner affects only explicit partial analysis and shared-case coverage', () => {
  const missing = input.records.find(record => record.comparisonId === 'ranged-rook-v-amazon');
  const remaining = input.records.filter(record => record.id !== missing.id);
  assert.throws(() => analyzeLevel3Records(remaining), /every scheduled game/);
  const partial = analyzeLevel3Records(remaining, undefined, { requireComplete: false });
  assert.equal(partial.report.progress.completedGames, COUNT - 2);
  assert.equal(partial.report.progress.pairedGames, COUNT - 4);
  const comparison = partial.report.comparisons.find(row => row.id === missing.comparisonId);
  assert.equal(comparison.pairedGames, 30);
  assert.equal(comparison.partialPairs, 1);
  const row = partial.report.overall.rows.find(row => row.key === 'ranged-rook');
  assert.equal(row.openingCoverage.shared, 15);
  assert.equal(row.games, 120);
});

test('selected existing designs keep their exact identities, scores and opponent effects', () => {
  const audit = buildLevel3Audit(), rows = new Map(audit.rows.map(row => [row.key, row]));
  assert.equal(audit.rows.length, 16);
  assert.equal(audit.comparisons.length, 64);
  assert.ok(audit.rows.every(row => row.upgradePoints === 3));
  const bishop = rows.get('vertical-bishop'), pawn = rows.get('rook-pawn-forward'), rook = rows.get('ranged-rook');
  assert.deepEqual([bishop.designId, bishop.movement], ['bishop.purple@18', 'BvWvN']);
  assert.deepEqual([pawn.designId, pawn.movement], ['pawn.purple@13', 'mRcfB']);
  assert.deepEqual([rook.designId, rook.movement], ['rook.purple@12', 'RC']);
  assert.equal(bishop.cohorts[2].score, 62.5 / 128);
  assert.equal(pawn.cohorts[2].score, 61.5 / 128);
  assert.equal(rook.cohorts[2].score, 68 / 128);
  assert.deepEqual(bishop.cohorts[2].opponents.map(row => row.score), [14 / 32, 15.5 / 32, 17.5 / 32, 15.5 / 32]);
  assert.deepEqual(pawn.cohorts[2].opponents.map(row => row.score), [13 / 32, 18.5 / 32, 15 / 32, 15 / 32]);
  assert.deepEqual(rook.cohorts[2].opponents.map(row => row.score), [19 / 32, 18.5 / 32, 13 / 32, 17.5 / 32]);
  assert.deepEqual(bishop.cohorts.slice(0, 2).map(row => row.score), [32.5 / 64, 30 / 64]);
  assert.equal(rows.get('quiet-archbishop').cohorts[2].score, 26 / 128);
  assert.equal(rows.get('quiet-camel-grid').cohorts[2].score, 44 / 128);
  assert.equal(audit.truncations.length, 1);
  assert.equal(audit.counts.newMatchGames, 0);
  assert.match(renderLevel3Audit(audit), /no movement, identity, price, applied value or reference status/);
});

test('all derived evidence reproduces offline and run/search arguments are rejected', () => {
  const audit = main([]);
  assert.equal(audit.counts.completePairs, 1023);
  assert.equal(audit.counts.excludedCompletedPartners, 1);
  assert.equal(audit.counts.engineSearches, 0);
  assert.throws(() => main(['--run']), /Use no arguments or --write/);
});
