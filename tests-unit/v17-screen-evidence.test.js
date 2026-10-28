'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { renderV17Report } = require('../scripts/balance/v17-report');
const { SOURCES, PROVENANCE, loadScreenEvidence, analyzeScreenRecords, buildScreenEvidenceAudit, renderScreenEvidenceAudit, main } = require('../scripts/balance/v17-screen-evidence');

const directory = path.resolve(__dirname, '../experiments/balance/results');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const level3 = loadScreenEvidence('level3');

test('the six archives preserve exact uploaded bytes and deterministic gzip encodings', () => {
  assert.equal(Object.values(SOURCES).flatMap(Object.values).length, 6);
  for (const source of Object.values(SOURCES).flatMap(Object.values)) {
    const archived = fs.readFileSync(path.join(directory, source.archiveFile));
    const decoded = zlib.gunzipSync(archived);
    assert.equal(sha(archived), source.archivedSha256);
    assert.equal(decoded.length, source.bytes);
    assert.equal(sha(decoded), source.sha256);
    assert.deepEqual(zlib.gzipSync(decoded, { level: 9, mtime: 0 }), archived);
  }
  assert.throws(() => loadScreenEvidence('not-an-experiment'), /Unknown initial-screen/);
});

test('all supplied reports reproduce exactly with complete declared schedules and explicit provenance limits', () => {
  for (const experiment of Object.keys(SOURCES)) {
    const evidence = loadScreenEvidence(experiment);
    const uploaded = zlib.gunzipSync(fs.readFileSync(path.join(directory, SOURCES[experiment].uploadedReport.archiveFile))).toString('utf8');
    assert.equal(renderV17Report(evidence.report, { includeOverall: false }), uploaded);
    assert.equal(evidence.report.runId, null);
    assert.equal(evidence.report.progress.completedGames, experiment === 'level3' ? 832 : 240);
    assert.equal(evidence.report.progress.completePairs, experiment === 'level3' ? 416 : 120);
    assert.ok(evidence.report.comparisons.every(row => row.pairedGames === 16 && row.openings === 8));
    assert.equal(evidence.declaration.reportReproducedExactly, true);
    assert.deepEqual(evidence.provenance, PROVENANCE);
    assert.equal(evidence.provenance.originalManifestSupplied, false);
    assert.equal(evidence.provenance.nativePreflightSupplied, false);
    assert.equal(evidence.provenance.engineSha256, null);
    assert.equal(evidence.provenance.legalMovesIndependentlyReplayed, false);
  }
});

test('archive corruption or an appended duplicate cannot silently change the evidence', () => {
  assert.throws(() => loadScreenEvidence('level3', { readArchive(file) {
    const bytes = fs.readFileSync(file), corrupt = Buffer.from(bytes);
    corrupt[corrupt.length - 1] ^= 1;
    return corrupt;
  } }), /Archive hash changed/);
  assert.throws(() => analyzeScreenRecords('level3', [...level3.records, level3.records[0]]), /every scheduled game exactly once/);
  const sameLength = [...level3.records]; sameLength[1] = sameLength[0];
  assert.throws(() => analyzeScreenRecords('level3', sameLength), /repeats a game identity/);
});

test('derived schedule and search context reject foreign identities and profile or strength changes', () => {
  for (const change of [
    { id: 'foreign-game-id' }, { pairId: 'foreign-pair' }, { aColor: 'w' },
    { openingId: 'foreign-opening' }, { profileHash: 'foreign-profile' }, { registryHash: 'foreign-registry' },
    { variant: 'foreign-variant' }, { registryReference: 'invented-manifest' },
    { engine: { ...level3.config.engine, nodes: 1 } }, { whiteStrength: { skill: 1 } },
  ]) {
    const records = [...level3.records]; records[0] = { ...records[0], ...change };
    assert.throws(() => analyzeScreenRecords('level3', records), /frozen|context|unknown opening/);
  }
});

test('recorded outcomes retain source provenance and do not certify independently replayed results', () => {
  const records = [...level3.records];
  records[0] = { ...records[0], result: records[0].result === '1-0' ? '0-1' : '1-0' };
  assert.throws(() => analyzeScreenRecords('level3', records, renderV17Report(level3.report, { includeOverall: false })), /differs from the exact uploaded report/);
  records[0] = { ...level3.records[0], result: '1/2-1/2' };
  assert.throws(() => analyzeScreenRecords('level3', records), /outcome and terminal reason disagree/);
  records[0] = { ...level3.records[0], playedPlies: 0 };
  assert.throws(() => analyzeScreenRecords('level3', records), /ply counts differ/);
});

test('aggregate scores weight the four references and preserve physical colors and opening sensitivity', () => {
  const rows = Object.fromEntries(level3.aggregates.map(row => [row.label, row]));
  assert.equal(rows['Rook pawn'].games, 64);
  assert.deepEqual([rows['Rook pawn'].wins, rows['Rook pawn'].draws, rows['Rook pawn'].losses], [15, 12, 37]);
  assert.equal(rows['Rook pawn'].score, 0.328125);
  assert.equal(rows['Rook pawn'].flag, 'coarse-low-outlier');
  assert.equal(rows['Mating bishop'].score, 0.8203125);
  assert.equal(rows['Vertical bishop'].score, 0.796875);
  assert.equal(rows['Side rook'].score, 0.671875);
  assert.deepEqual(level3.aggregates.filter(row => row.flag === 'coarse-high-outlier').map(row => row.label).sort(), ['Mating bishop', 'Side rook', 'Vertical bishop']);
  assert.equal(rows['Princess knight'].flag, 'unchanged-follow-up');
  assert.equal(rows['Zebra queen'].flag, 'unchanged-follow-up');
  assert.equal(rows['X-ray queen'].physicalColors.find(row => row.key === 'w').score, 0.765625);
  assert.equal(rows['X-ray queen'].physicalColors.find(row => row.key === 'b').score, 0.390625);
  assert.equal(rows['Rook pawn'].leaveOneOpeningOut.omissions.length, 8);
  assert.equal(rows['Rook pawn'].leaveOneOpeningOut.lower, 0.30357142857142855);
  assert.equal(rows['Rook pawn'].leaveOneOpeningOut.upper, 0.36607142857142855);
});

test('bundle aggregates exclude direct bundle games and team means invert both comparison perspectives', () => {
  const bundles = Object.fromEntries(loadScreenEvidence('pawn-grants').aggregates.map(row => [row.label, row]));
  assert.ok(Object.values(bundles).every(row => row.games === 64 && row.opponents.length === 4));
  assert.equal(bundles['Three Bishop pawns'].score, 0.2421875);
  assert.equal(bundles['Three Returning pawns'].score, 0.1953125);
  assert.equal(bundles['Three pawn grants'].score, 0.4140625);
  const teams = loadScreenEvidence('reference-2v2').aggregates;
  assert.ok(teams.every(row => row.games === 80 && row.opponents.length === 5));
  assert.ok(Math.abs(teams.find(row => row.label === 'Vanguard + Amazon').score - 0.6) < 1e-12);
  assert.ok(Math.abs(teams.reduce((sum, row) => sum + row.score, 0) / teams.length - 0.5) < 1e-12);
});

test('derived artifacts are reproducible offline and distinguish sensitivity from confidence', () => {
  const audit = buildScreenEvidenceAudit(), markdown = renderScreenEvidenceAudit(audit);
  assert.equal(audit.totalCompletedGames, 1312);
  assert.equal(audit.engineSearches, 0);
  assert.equal(audit.newMatchGames, 0);
  assert.match(markdown, /not 95% confidence intervals/);
  assert.match(markdown, /chosen after seeing this screen/);
  assert.match(markdown, /original run manifests and native preflight proofs were not uploaded/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'v17-screen-001.audit.json'), 'utf8')), audit);
  assert.equal(fs.readFileSync(path.join(directory, 'v17-screen-001.report.md'), 'utf8'), markdown);
  assert.doesNotThrow(() => main([]));
});
