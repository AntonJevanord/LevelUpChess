'use strict';

// Exact journals and reconstructed outcome reports. These declarations check
// compatibility; they do not restore original manifests or native proofs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('./v17-plan');
const { makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { createV17Report, renderV17Report } = require('./v17-report');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-mobility-001';
const SOURCES = Object.freeze({
  'mobility-confirm': Object.freeze({ archiveFile: `${PREFIX}.mobility-confirm.games.jsonl.gz`,
    archivedSha256: '919ef6a377b37d48b6ffaf66ee9f52d29793c2c6673728bc83bd77df68569e6f',
    originalName: 'games.jsonl', sha256: 'ad8a05a2c0bc9d3d8a467a42f7203a2ac7df3144704cde5cdba55cc0f2281dad', bytes: 2663656 }),
  'mobility-revisions': Object.freeze({ archiveFile: `${PREFIX}.mobility-revisions.games.jsonl.gz`,
    archivedSha256: '9baeb9c313475e5be3b71115144074c2efc4cd5059e24100ed96659b66468a65',
    originalName: 'games.jsonl', sha256: 'd6cff6c74508775bcd14db2c18e87db530845723a76457dce9ccff08aa2faa6f', bytes: 3468589 }),
});
const EXPECTED = Object.freeze({
  'mobility-confirm': Object.freeze({ scheduledGames: 768, completedGames: 767, truncatedGames: 1, pairedGames: 766, completePairs: 383 }),
  'mobility-revisions': Object.freeze({ scheduledGames: 960, completedGames: 957, truncatedGames: 3, pairedGames: 954, completePairs: 477 }),
});
const PROVENANCE = Object.freeze({ originalManifestSupplied: false, nativePreflightSupplied: false,
  uploadedReportSupplied: false, engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'Only the journals were supplied. Original run.json, v17-preflight.json and Markdown reports were not uploaded; reports here are reconstructed, not reproduced uploaded reports.',
    'Recorded identities, search settings and profiles match the current frozen declarations; this does not attest to the original executable or native value tables.',
    'This audit does not independently replay legal moves or certify terminal positions. It fits no material values or Elo.',
    'Fixed related short opening cases support descriptive comparisons, not population confidence intervals or demonstrated balance equivalence.',
  ]) });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function analyzeMobilityBatchRecords(experiment, records) {
  assert.ok(Object.hasOwn(SOURCES, experiment), 'Choose mobility-confirm or mobility-revisions.');
  assert.ok(Array.isArray(records), 'Recorded journal must be an array.');
  const declaration = loadExperiment(experiment), { config } = declaration;
  const schedule = makeSchedule(config), registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  assert.equal(records.length, schedule.length, 'The archived campaign must contain every scheduled game exactly once.');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'The archived campaign repeats a game identity.');
  const byId = new Map(schedule.map(game => [game.id, game]));
  for (const record of records) {
    const planned = byId.get(record.id);
    assert.ok(planned, 'The archived campaign contains an unknown scheduled game.');
    assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
    assert.equal(record.attempt, 1, 'The archived campaign contains one attempt per game.');
    assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
    // Parallel journals store each worker's local index, not the global index.
    assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0
      && record.scheduleIndex < schedule.length, 'Invalid worker-local schedule index.');
    assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
    assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Recorded moves must be an array of strings.');
    assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'Recorded SAN and UCI counts differ.');
    assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
    assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
    assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening ply counts differ.');
    assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded moves do not start with the declared opening.');
    assert.ok(['completed', 'truncated'].includes(record.status), 'The archived campaign contains completed games or move-limit truncations only.');
    if (record.status === 'completed') {
      assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected recorded terminal reason.');
      assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded outcome and terminal reason disagree.');
      assert.ok(record.totalPlies <= config.engine.maxPlies, 'A completed game exceeds the declared move limit.');
    } else {
      assert.equal(record.result, '*', 'Truncated games must remain unscored.');
      assert.equal(record.reason, 'max-plies', 'Unexpected truncation reason.');
      assert.equal(record.totalPlies, config.engine.maxPlies, 'A move-limit truncation must reach the declared limit.');
    }
  }
  const derivedManifest = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = createV17Report({ ...declaration, records, manifest: derivedManifest });
  const expected = EXPECTED[experiment];
  assert.equal(report.progress.finalizedGames, expected.scheduledGames);
  assert.equal(report.progress.completedGames, expected.completedGames);
  assert.equal(report.progress.pairedGames, expected.pairedGames);
  assert.equal(report.progress.completePairs, expected.completePairs);
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  assert.equal(records.filter(record => record.status === 'truncated').length, expected.truncatedGames);
  return { ...declaration, records, registry, profile, report,
    declaration: { configSha256: sha(JSON.stringify(config)), registryHash: registry.hash, profileHash: profile.hash,
      scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length,
      uploadedReportSupplied: false, reportReproducedExactly: false } };
}

function loadMobilityBatchEvidence(experiment, { readArchive = file => fs.readFileSync(file) } = {}) {
  const source = SOURCES[experiment];
  assert.ok(source, 'Choose mobility-confirm or mobility-revisions.');
  const compressed = readArchive(path.join(ROOT, source.archiveFile));
  assert.equal(sha(compressed), source.archivedSha256, `Archive changed: ${source.archiveFile}.`);
  const bytes = gunzipSync(compressed);
  assert.equal(bytes.length, source.bytes, `Original byte count changed: ${source.archiveFile}.`);
  assert.equal(sha(bytes), source.sha256, `Original bytes changed: ${source.archiveFile}.`);
  assert.equal(bytes.at(-1), 10, 'The exact journal must have a complete final newline.');
  const records = bytes.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzeMobilityBatchRecords(experiment, records), source, provenance: PROVENANCE };
}

function summarizeTruncations(records) {
  return records.filter(record => record.status === 'truncated').map(record => {
    const partner = records.find(item => item.pairId === record.pairId && item.id !== record.id);
    assert.ok(partner && partner.status === 'completed', 'Each recorded truncation retains a completed opposite-color partner.');
    return { id: record.id, pairId: record.pairId, comparisonId: record.comparisonId, openingId: record.openingId,
      aColor: record.aColor, result: record.result, reason: record.reason, totalPlies: record.totalPlies, finalFen: record.finalFen,
      excludedCompletedPartner: { id: partner.id, aColor: partner.aColor, result: partner.result,
        reason: partner.reason, totalPlies: partner.totalPlies } };
  });
}

function buildMobilityBatchAudit() {
  const experiments = Object.keys(SOURCES).map(experiment => {
    const source = loadMobilityBatchEvidence(experiment), { report } = source;
    return { experiment, source: source.source, declaration: source.declaration,
      counts: { scheduledGames: report.scheduledGames, finalizedGames: report.progress.finalizedGames,
        completedGames: report.progress.completedGames, truncatedGames: source.records.filter(record => record.status === 'truncated').length,
        pairedGames: report.progress.pairedGames, completePairs: report.progress.completePairs, errors: 0 },
      truncations: summarizeTruncations(source.records), overall: report.overall, matrix: report.matrix };
  });
  return { schemaVersion: 1, format: 'levelup-v17-mobility-batch-evidence', recordedDate: '2026-10-28',
    sources: SOURCES, provenance: PROVENANCE,
    counts: { uploadedScheduledGames: 1728, uploadedCompletedGames: 1724, uploadedTruncatedGames: 4,
      pairedGames: 1720, completePairs: 860, excludedCompletedPartners: 4, errors: 0, newMatchGames: 0, engineSearches: 0 },
    experiments };
}

function renderMobilityBatchReport(experiment) {
  const { report } = loadMobilityBatchEvidence(experiment);
  const note = '> Reconstructed from the exact archived journal. No original run manifest, native preflight proof or uploaded Markdown report was supplied. Recorded identities and settings match the frozen declaration; legal moves and terminal positions were not independently replayed. See [the combined mobility review](v17-mobility-001.report.md) for historical reuse and design conclusions.';
  return renderV17Report(report).replace('\n\n', `\n\n${note}\n\n`);
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildMobilityBatchAudit();
  const artifacts = [
    ['v17-mobility-batch-001.audit.json', JSON.stringify(audit, null, 2) + '\n'],
    ...Object.keys(SOURCES).map(experiment => [`${PREFIX}.${experiment}.report.md`, renderMobilityBatchReport(experiment)]),
  ];
  for (const [name, content] of artifacts) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${name}.`);
  }
  console.log('Mobility confirmation/revision journals verified: 1,724 completions, four truncations; no engine searches or new games.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, analyzeMobilityBatchRecords, loadMobilityBatchEvidence,
  summarizeTruncations, buildMobilityBatchAudit, renderMobilityBatchReport, main };
