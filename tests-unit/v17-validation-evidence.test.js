const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { readPinnedSource } = require('../scripts/balance/v17-acceptance-evidence');
const {
  SOURCES, PROVENANCE, COUNTS, CALIBRATION_SHA256, REVISION_SHA256,
  analyzeValidationRecords, loadValidationEvidence, buildValidationAudit, renderValidationAudit, main,
} = require('../scripts/balance/v17-validation-evidence');

const loaded = {};
test.before(() => { for (const name of Object.keys(SOURCES)) loaded[name] = loadValidationEvidence(name); });

test('both complete uploads reproduce their immutable declarations through their custom report renderers', () => {
  for (const [name, count] of Object.entries(COUNTS)) {
    const input = loaded[name];
    assert.equal(input.records.length, count);
    assert.deepEqual(input.report.progress, { attempts: count, duplicateCopiesIgnored: 0, finalizedGames: count,
      completedGames: count, pairedGames: count, completePairs: count / 2 });
    assert.equal(input.declaration.reportReproducedExactly, true);
    assert.match(input.declaration.metadataSha256, /^[0-9a-f]{64}$/);
    assert.equal(input.report.runId, null);
    assert.equal(input.manifest, undefined);
    assert.equal(input.nativePreflight, undefined);
  }
  assert.equal(PROVENANCE.originalManifestSupplied, false);
  assert.equal(PROVENANCE.nativePreflightSupplied, false);
  assert.equal(PROVENANCE.legalMovesIndependentlyReplayed, false);
  assert.equal(PROVENANCE.engineSha256, null);
  assert.equal(loaded.trials.valueAudit.provenance.sha256, REVISION_SHA256);
  assert.equal(loaded.trials.valueAudit.provenance.baseline.sha256, CALIBRATION_SHA256);
  assert.equal(loaded.bridge.valueAudit.provenance.sha256, CALIBRATION_SHA256);
});

test('compressed corruption and recompressed original-byte edits fail separate source pins', () => {
  assert.throws(() => loadValidationEvidence('trials', { readArchive(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[20] ^= 1; return bytes;
  } }), /Archive changed/);
  const pin = SOURCES.bridge.uploadedReport;
  const raw = Buffer.from(readPinnedSource(pin)); raw[0] ^= 1;
  const packed = gzipSync(raw, { level: 9 });
  const changedArchivePin = { ...pin, archivedSha256: createHash('sha256').update(packed).digest('hex') };
  assert.throws(() => readPinnedSource(changedArchivePin, () => packed), /Original bytes changed/);
});

test('edited search, applied valuation, strength, movement profile and opening context are rejected', () => {
  for (const name of Object.keys(COUNTS)) {
    const input = loaded[name];
    const change = patch => input.records.map((record, index) => index ? record : { ...record, ...patch });
    for (const patch of [
      { engine: { ...input.config.engine, nodes: 30000 } },
      { evaluation: { pieceValues: {} } },
      { whiteStrength: { skill: 19 } },
    ]) assert.throws(() => analyzeValidationRecords(name, change(patch)), /engine, strength, evaluation or opening context changed/);
    assert.throws(() => analyzeValidationRecords(name, change({ profileHash: '0'.repeat(64) })), /frozen rules profile/);
    assert.throws(() => analyzeValidationRecords(name, change({ startFen: '8/8/8/8/8/8/8/K6k w - - 0 1' })), /starting army changed/);
    assert.throws(() => analyzeValidationRecords(name, change({ openingMoves: [] })), /opening ply count changed/);
    assert.throws(() => analyzeValidationRecords(name, change({ id: 'unknown-game' })), /unknown scheduled game/);
    assert.throws(() => analyzeValidationRecords(name, input.records, 'edited report'), /differs from the exact uploaded report/);
  }
});

test('conflicting duplicate attempts, invented retries and extra unscored outcomes cannot gain weight', () => {
  const input = loaded.trials, changed = input.records.slice();
  changed[1] = { ...changed[0], result: changed[0].result === '1-0' ? '0-1' : '1-0' };
  assert.throws(() => analyzeValidationRecords('trials', changed), /conflicting duplicate attempts/);
  changed[1] = { ...input.records[1], attempt: 2 };
  assert.throws(() => analyzeValidationRecords('trials', changed), /one attempt per game/);
  changed[1] = { ...input.records[1], status: 'truncated', result: '*', reason: 'max-plies' };
  assert.throws(() => analyzeValidationRecords('trials', changed), /only completed games/);
});

test('missing trial color partner is excluded from overall and physical-color shared-case diagnostics', () => {
  const input = loaded.trials;
  const missing = input.records.find(record => record.comparisonId === 'vertical-blocked-v-amazon');
  const remaining = input.records.filter(record => record.id !== missing.id);
  assert.throws(() => analyzeValidationRecords('trials', remaining), /every scheduled game/);
  const partial = analyzeValidationRecords('trials', remaining, undefined, { requireComplete: false });
  assert.equal(partial.report.progress.completedGames, COUNTS.trials - 1);
  assert.equal(partial.report.progress.pairedGames, COUNTS.trials - 2);
  const row = partial.report.overall.rows.find(row => row.key === 'vertical-blocked');
  assert.equal(row.openingCoverage.shared, 15);
  assert.equal(row.games, 120);
  assert.deepEqual(row.physicalColors.map(color => color.games), [60, 60]);
  assert.ok(!row.openingCoverage.openingIds.includes(missing.openingId));
});

test('missing bridge partner does not alter singles or allow faster opponents to change its shared mean', () => {
  const input = loaded.bridge, missing = input.records[0];
  assert.equal(missing.comparisonId, 'forward-knight-pawn-triple-v-vanguard');
  const partial = analyzeValidationRecords('bridge', input.records.slice(1), undefined, { requireComplete: false });
  assert.equal(partial.report.progress.pairedGames, COUNTS.bridge - 2);
  const singles = partial.report.panels.find(panel => panel.id === 'singles');
  assert.equal(singles.report.progress.pairedGames, 96);
  assert.deepEqual(singles.report.overall.rows, input.report.panels[0].report.overall.rows);
  const bridge = partial.report.panels.find(panel => panel.id === 'bridge');
  const row = bridge.report.overall.rows.find(row => row.key === 'forward-knight-pawn-triple');
  assert.equal(row.openingCoverage.shared, 15);
  assert.equal(row.games, 90);
  assert.deepEqual(row.physicalColors.map(color => color.games), [45, 45]);
});

test('blocked bishop and sideways pawn preserve trial identities, outcomes and color orientation', () => {
  const report = loaded.trials.report, rows = new Map(report.overall.rows.map(row => [row.key, row]));
  const bishop = rows.get('vertical-blocked'), pawn = rows.get('queen-sideways');
  assert.equal(report.trialDefinitions.find(row => row.key === bishop.key).movement, 'BvW2vnN');
  assert.equal(report.trialDefinitions.find(row => row.key === pawn.key).movement, 'mQ2cfQ2');
  assert.deepEqual([bishop.wins, bishop.draws, bishop.losses, bishop.score], [48, 32, 48, 0.5]);
  assert.deepEqual(report.cohorts.map(cohort => cohort.report.overall.rows.find(row => row.key === bishop.key).score), [0.5, 0.5]);
  assert.deepEqual(bishop.physicalColors.map(row => row.score), [33 / 64, 31 / 64]);
  assert.equal(pawn.score, 68.5 / 128);
  assert.deepEqual(pawn.opponents.map(row => row.score), [14 / 32, 19 / 32, 18 / 32, 17.5 / 32]);
  assert.deepEqual(pawn.physicalColors.map(row => row.score), [35 / 64, 33.5 / 64]);
  assert.equal(rows.get('xray-rook').score, 84 / 128);
  assert.equal(rows.get('grant-king').score, 88.5 / 128);
  assert.equal(rows.get('grant-orthogonal-three').score, 78.5 / 128);
  assert.equal(rows.get('grant-knight').score, 79.5 / 128);
});

test('two-point and six-point summaries remain separate with their observed stacking/color effects', () => {
  const audit = buildValidationAudit(), trial = audit.stages.find(stage => stage.name === 'trials');
  const bridge = audit.stages.find(stage => stage.name === 'bridge');
  assert.equal(trial.upgradePoints, 3);
  assert.equal(bridge.overall, undefined);
  assert.deepEqual(bridge.panels.map(panel => [panel.id, panel.budget, panel.scheduledGames]), [['singles', 2, 96], ['bridge', 6, 288]]);
  assert.deepEqual(bridge.panels[0].overall.rows.map(row => row.score), [39.5 / 64, 28 / 64, 28.5 / 64]);
  assert.deepEqual(bridge.panels[1].overall.rows.map(row => row.score), [64.5 / 96, 21.5 / 96, 53 / 96]);
  assert.deepEqual(bridge.panels[1].overall.rows[2].physicalColors.map(row => row.score), [32.5 / 48, 20.5 / 48]);
  assert.deepEqual(audit.stages[0].openings, audit.stages[1].openings);
  assert.equal(audit.counts.uploadedGames, 1152);
  assert.equal(audit.counts.engineSearches, 0);
  assert.match(renderValidationAudit(audit), /No overall percentage is pooled across these contexts/);
});

test('all derived artifacts reproduce offline and executable/search arguments are rejected', () => {
  const audit = main([]);
  assert.equal(audit.counts.completePairs, 576);
  assert.equal(audit.counts.truncatedGames, 0);
  assert.throws(() => main(['--run']), /Use no arguments or --write/);
});
