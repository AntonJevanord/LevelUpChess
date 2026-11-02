const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { readPinnedSource } = require('../scripts/balance/v17-acceptance-evidence');
const {
  SOURCES, PROVENANCE, COUNTS, CALIBRATION_SHA256, analyzeLevel2Records,
  loadLevel2Evidence, buildLevel2Audit, renderLevel2Audit, main,
} = require('../scripts/balance/v17-level2-evidence');

const loaded = {};
test.before(() => { for (const name of Object.keys(SOURCES)) loaded[name] = loadLevel2Evidence(name); });

test('four exact uploads reproduce schedules, calibration and both original reports', () => {
  for (const [name, count] of Object.entries(COUNTS)) {
    const input = loaded[name];
    assert.equal(input.records.length, count);
    assert.deepEqual(input.report.progress, { attempts: count, duplicateCopiesIgnored: 0, finalizedGames: count,
      completedGames: count - 1, pairedGames: count - 2, completePairs: count / 2 - 1 });
    assert.equal(input.declaration.reportReproducedExactly, true);
    assert.equal(input.report.bracketStudy.evaluationAudit.provenance.sha256, CALIBRATION_SHA256);
    assert.deepEqual(input.report.bracketStudy.cohorts.map(cohort => [cohort.openingIds.length, cohort.complete]), [[8, true], [8, false], [16, false]]);
    assert.equal(input.report.runId, null);
    assert.equal(input.manifest, undefined);
    assert.equal(input.nativePreflight, undefined);
  }
  assert.equal(PROVENANCE.originalManifestSupplied, false);
  assert.equal(PROVENANCE.nativePreflightSupplied, false);
  assert.equal(PROVENANCE.legalMovesIndependentlyReplayed, false);
  assert.equal(PROVENANCE.engineSha256, null);
});

test('archive corruption and changed original bytes are rejected independently', () => {
  assert.throws(() => loadLevel2Evidence('pawns', { readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[20] ^= 1; return bytes;
  } }), /Archive changed/);
  const pin = SOURCES.grants.uploadedReport;
  const raw = Buffer.from(readPinnedSource(pin)); raw[0] ^= 1;
  const packed = gzipSync(raw, { level: 9 });
  const changedArchivePin = { ...pin, archivedSha256: createHash('sha256').update(packed).digest('hex') };
  assert.throws(() => readPinnedSource(changedArchivePin, () => packed), /Original bytes changed/);
});

test('edited search, valuation, rules, strength, prefix or start cannot pass declaration checks', () => {
  const input = loaded.pawns;
  const change = patch => input.records.map((record, index) => index ? record : { ...record, ...patch });
  assert.throws(() => analyzeLevel2Records('pawns', change({ engine: { ...input.config.engine, nodes: 30000 } })), /engine, strength, evaluation or opening context changed/);
  assert.throws(() => analyzeLevel2Records('pawns', change({ evaluation: { pieceValues: {} } })), /engine, strength, evaluation or opening context changed/);
  assert.throws(() => analyzeLevel2Records('pawns', change({ whiteStrength: { skill: 19 } })), /engine, strength, evaluation or opening context changed/);
  assert.throws(() => analyzeLevel2Records('pawns', change({ profileHash: '0'.repeat(64) })), /frozen rules profile/);
  assert.throws(() => analyzeLevel2Records('pawns', change({ startFen: '8/8/8/8/8/8/8/K6k w - - 0 1' })), /starting army changed/);
  assert.throws(() => analyzeLevel2Records('pawns', change({ openingMoves: [] })), /opening ply count changed/);
  assert.throws(() => analyzeLevel2Records('pawns', change({ id: 'unknown-game' })), /unknown scheduled game/);
  assert.throws(() => analyzeLevel2Records('pawns', input.records, 'edited report'), /differs from the exact uploaded report/);
});

test('conflicting duplicate attempts and invented retries do not add weight', () => {
  const input = loaded.grants, changed = input.records.slice();
  changed[1] = { ...changed[0], result: changed[0].result === '1-0' ? '0-1' : '1-0' };
  assert.throws(() => analyzeLevel2Records('grants', changed), /conflicting duplicate attempts/);
  changed[1] = { ...input.records[1], attempt: 2 };
  assert.throws(() => analyzeLevel2Records('grants', changed), /one attempt per game/);
});

test('both real truncations retain star results and exclude their completed color partners', () => {
  for (const name of Object.keys(COUNTS)) {
    const input = loaded[name], truncated = input.records.find(record => record.status === 'truncated');
    const partner = input.records.find(record => record.pairId === truncated.pairId && record.id !== truncated.id);
    assert.equal(truncated.result, '*');
    assert.equal(truncated.reason, 'max-plies');
    assert.equal(truncated.totalPlies, 400);
    assert.equal(partner.status, 'completed');
    const comparison = input.report.comparisons.find(row => row.id === truncated.comparisonId);
    assert.equal(comparison.pairedGames, 30);
    assert.equal(comparison.partialPairs, 1);
    assert.equal(comparison.statusCounts.truncated, 1);
    const row = input.report.overall.rows.find(row => row.key === comparison.aKey);
    assert.equal(row.games, 90);
    assert.equal(row.openingCoverage.shared, 15);
    assert.ok(!row.openingCoverage.openingIds.includes(truncated.openingId));
    const changed = input.records.map(record => record === truncated ? { ...record, result: '1/2-1/2' } : record);
    assert.throws(() => analyzeLevel2Records(name, changed), /must remain unscored/);
  }
});

test('an additional missing partner reduces shared coverage only in explicit partial analysis', () => {
  const input = loaded.grants;
  const missing = input.records.find(record => record.status === 'completed'
    && input.report.comparisons.find(row => row.id === record.comparisonId).pairedGames === 32);
  const remaining = input.records.filter(record => record.id !== missing.id);
  assert.throws(() => analyzeLevel2Records('grants', remaining), /every scheduled game/);
  const partial = analyzeLevel2Records('grants', remaining, undefined, { requireComplete: false });
  assert.equal(partial.report.progress.completedGames, COUNTS.grants - 2);
  assert.equal(partial.report.progress.pairedGames, COUNTS.grants - 4);
  const comparison = partial.report.comparisons.find(row => row.id === missing.comparisonId);
  assert.equal(comparison.pairedGames, 30);
  assert.equal(comparison.partialPairs, 1);
});

test('preferred current designs keep exact outcomes while reused F/F2 rows are not double-counted', () => {
  const audit = buildLevel2Audit();
  const pawnRows = new Map(audit.stages.find(stage => stage.name === 'pawns').overall.rows.map(row => [row.key, row]));
  const grantRows = new Map(audit.stages.find(stage => stage.name === 'grants').overall.rows.map(row => [row.key, row]));
  assert.equal(pawnRows.get('forward-knight-current').score, 51.5 / 96);
  assert.equal(pawnRows.get('rank-current').score, 49.5 / 96);
  assert.equal(grantRows.get('grant-diagonal-current').score, 52 / 96);
  assert.deepEqual(pawnRows.get('forward-knight-current').opponents.map(row => row.score), [17 / 32, 16 / 32, 18.5 / 32]);
  assert.deepEqual(pawnRows.get('rank-current').opponents.map(row => row.score), [19 / 32, 15 / 32, 15.5 / 32]);
  assert.deepEqual(grantRows.get('grant-diagonal-current').opponents.map(row => row.score), [19 / 32, 17 / 32, 16 / 32]);
  assert.equal(grantRows.get('grant-orthogonal-reduced').openingCoverage.shared, 15);
  const summary = renderLevel2Audit(audit);
  assert.equal(summary.split('\n').filter(line => line.startsWith('| Diagonal grant: current |')).length, 2); // Full table + preferred shortlist.
  assert.equal(summary.split('\n').filter(line => line.startsWith('| Long diagonal grant: reduced |')).length, 0);
  assert.ok(audit.stages.every(stage => stage.bracketStudy.brackets.every(group => group.variants.every(row => row.upgradePoints === 2))));
  assert.equal(audit.counts.uploadedGames, 2688);
  assert.equal(audit.counts.pairedGames, 2684);
  assert.equal(audit.counts.excludedCompletedPartners, 2);
  assert.equal(audit.counts.engineSearches, 0);
});

test('all committed evidence reproduces offline and run/search arguments are rejected', () => {
  const audit = main([]);
  assert.equal(audit.counts.completePairs, 1342);
  assert.throws(() => main(['--run']), /Use no arguments or --write/);
});
