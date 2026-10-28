'use strict';

// Exact uploaded bytes and outcome projections only. A reconstructed declaration
// does not restore original process provenance or certify legal move histories.
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
const { SOURCES: FOLLOWUP_SOURCES } = require('./v17-followup-evidence');
const { getDesign } = require('../../src/design-catalog');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-mobility-additions-001';
const SOURCES = Object.freeze({
  journal: Object.freeze({ archiveFile: `${PREFIX}.games.jsonl.gz`,
    archivedSha256: '2e56b2659ec8e726a125b2a253c47b47374d4813306971ada9bbd14618f423ec',
    originalName: 'games.jsonl', sha256: '8065aa8cf7e98d64cd00d38a15d452c602dc2b2b905f496fa71f69698f73e58b', bytes: 2288730 }),
  uploadedReport: Object.freeze({ archiveFile: `${PREFIX}.uploaded-report.md.gz`,
    archivedSha256: 'ba2ff24b04038efbac8c4769db3237898872fe630e92120a4b37ad6218e503cd',
    originalName: 'v17-report.md', sha256: '1ece54afc61b9b68f2960db20616f8be1e7e0be723dc6e418e6665e4193d9f0c', bytes: 2954 }),
});
const PROVENANCE = Object.freeze({ originalManifestSupplied: false, nativePreflightSupplied: false,
  engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'Original run.json and v17-preflight.json were not supplied; declaration compatibility does not attest to the original executable or native value tables.',
    'The audit validates recorded identities and settings, not legal moves or terminal positions. No material values or Elo are fitted.',
    'The thirty-two fixed, related short starts support descriptive screening, not population confidence intervals or demonstrated balance equivalence.',
  ]) });
// The four resubmitted files match these existing exact-byte archives. Reference
// them rather than copy their games or assign new statistical weight.
const RESUBMITTED_SOURCES = Object.freeze(Object.fromEntries(['level3-confirm', 'level3-revisions']
  .map(experiment => [experiment, FOLLOWUP_SOURCES[experiment]])));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const scoreForA = record => record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w'));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;

function readPinnedSource(source, readArchive) {
  const compressed = readArchive(path.join(ROOT, source.archiveFile));
  assert.equal(sha(compressed), source.archivedSha256, `Archive changed: ${source.archiveFile}.`);
  const bytes = gunzipSync(compressed);
  assert.equal(bytes.length, source.bytes, `Original byte count changed: ${source.archiveFile}.`);
  assert.equal(sha(bytes), source.sha256, `Original bytes changed: ${source.archiveFile}.`);
  return bytes;
}

function analyzeMobilityRecords(records, uploadedReport) {
  const declaration = loadExperiment('mobility-additions'), { config, metadata } = declaration;
  const schedule = makeSchedule(config), registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  assert.equal(records.length, schedule.length, 'The archived additions must contain every scheduled game exactly once.');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'The archived additions repeat a game identity.');
  const byId = new Map(schedule.map(game => [game.id, game]));
  for (const record of records) {
    const planned = byId.get(record.id);
    assert.ok(planned, 'The archived additions contain an unknown scheduled game.');
    assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
    assert.equal(record.attempt, 1, 'The archived additions contain one attempt per game.');
    assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
    // Parallel workers record their local schedule index, not the global index.
    assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0
      && record.scheduleIndex < schedule.length, 'Invalid worker-local schedule index.');
    assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
    assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Recorded moves must be an array of strings.');
    assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'Recorded SAN and UCI counts differ.');
    assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
    assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
    assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening ply counts differ.');
    assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded moves do not start with the declared opening.');
    assert.ok(['completed', 'truncated'].includes(record.status), 'The archived additions contain completed games or move-limit truncations only.');
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
  // Generated now for declaration matching only, never treated as original provenance.
  const derivedManifest = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = createV17Report({ ...declaration, records, manifest: derivedManifest });
  assert.equal(report.progress.finalizedGames, 640);
  assert.equal(report.progress.completedGames, 639);
  assert.equal(report.progress.pairedGames, 638);
  assert.equal(report.progress.completePairs, 319);
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  assert.equal(records.filter(record => record.status === 'truncated').length, 1);
  if (uploadedReport !== undefined) assert.equal(renderV17Report(report), uploadedReport, 'Uploaded additions report does not reproduce.');
  return { ...declaration, records, profile, report,
    declaration: { configSha256: sha(JSON.stringify(config)), registryHash: registry.hash, profileHash: profile.hash,
      scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadMobilityEvidence({ readArchive = file => fs.readFileSync(file) } = {}) {
  const decoded = Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => [key, readPinnedSource(source, readArchive)]));
  for (const sources of Object.values(RESUBMITTED_SOURCES)) {
    for (const source of Object.values(sources)) readPinnedSource(source, readArchive);
  }
  assert.equal(decoded.journal.at(-1), 10, 'The exact journal must have a complete final newline.');
  const records = decoded.journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzeMobilityRecords(records, decoded.uploadedReport.toString('utf8')), source: SOURCES, provenance: PROVENANCE };
}

function buildMobilityAudit() {
  const source = loadMobilityEvidence(), { config, metadata, records, report } = source;
  const cohorts = Object.fromEntries(metadata.openingCohorts.map(cohort => {
    const ids = new Set(cohort.openingIds);
    return [cohort.id, createV17Report({ experiment: source.experiment,
      config: { ...config, openings: config.openings.filter(item => ids.has(item.id)) }, metadata,
      records: records.filter(record => ids.has(record.openingId)) })];
  }));
  const comparisonById = new Map(metadata.comparisons.map(item => [item.id, item]));
  const rowDesigns = new Map(config.comparisons.map(item => {
    const rowKey = comparisonById.get(item.id).aKey;
    const ids = [...new Set([...Object.values(item.armyA.upgrades), ...item.armyA.reserve.map(piece => piece.id)])];
    return [rowKey, ids];
  }));
  const truncations = records.filter(record => record.status === 'truncated').map(record => {
    const partner = records.find(item => item.pairId === record.pairId && item.id !== record.id);
    assert.ok(partner && partner.status === 'completed', 'Truncation must retain its completed opposite-color partner.');
    return { id: record.id, pairId: record.pairId, comparisonId: record.comparisonId, openingId: record.openingId,
      aColor: record.aColor, result: record.result, reason: record.reason, totalPlies: record.totalPlies, finalFen: record.finalFen,
      excludedCompletedPartner: { id: partner.id, aColor: partner.aColor, result: partner.result, reason: partner.reason,
        totalPlies: partner.totalPlies, scoreForA: scoreForA(partner) } };
  });
  return { schemaVersion: 1, format: 'levelup-v17-mobility-additions-evidence', recordedDate: '2026-10-28',
    sources: SOURCES, provenance: PROVENANCE, declaration: source.declaration,
    resubmittedSources: Object.fromEntries(Object.entries(RESUBMITTED_SOURCES).map(([experiment, sources]) =>
      [experiment, { sources, exactDuplicate: true, addedGames: 0 }])),
    scope: 'Only mobility-additions is new evidence in this upload batch. No mobility-confirm, mobility-revisions or mobility-expanded journal was supplied.',
    counts: { scheduledGames: report.scheduledGames, finalizedGames: report.progress.finalizedGames,
      completedGames: report.progress.completedGames, truncatedGames: truncations.length, pairedGames: report.progress.pairedGames,
      completePairs: report.progress.completePairs, excludedCompletedPartners: truncations.length, errors: 0, newMatchGames: 0, engineSearches: 0 },
    rows: report.overall.rows.map(row => {
      const baseline = report.matrix.rows.find(item => item.key === row.key).cells.find(item => item.columnKey === 'two-step-pawns');
      const referenceComparisonIds = new Set(metadata.comparisons.filter(item => item.aKey === row.key
        && row.opponents.some(opponent => opponent.key === item.bKey)).map(item => item.id));
      const designIds = rowDesigns.get(row.key);
      return { key: row.key, label: row.label, designIds, movements: designIds.map(id => getDesign(id).movement),
        score: row.score, games: row.games, wins: row.wins, draws: row.draws, losses: row.losses, opponents: row.opponents,
        baseline: { games: baseline.pairedGames, completePairs: baseline.completePairs, openings: baseline.openings,
          wins: baseline.wins, draws: baseline.draws, losses: baseline.losses, score: baseline.score },
        physicalColors: ['w', 'b'].map(color => {
          const selected = records.filter(item => referenceComparisonIds.has(item.comparisonId) && item.aColor === color);
          assert.ok(selected.every(item => item.status === 'completed'), 'Reference colors require complete games.');
          return { key: color, games: selected.length, score: mean(selected.map(scoreForA)) };
        }),
        cohorts: Object.fromEntries(Object.entries(cohorts).map(([name, result]) => {
          const overall = result.overall.rows.find(item => item.key === row.key);
          const cell = result.matrix.rows.find(item => item.key === row.key).cells.find(item => item.columnKey === 'two-step-pawns');
          return [name, { referenceScore: overall.score, referenceGames: overall.games,
            opponents: overall.opponents.map(item => ({ key: item.key, games: item.games, score: item.score })),
            baselineScore: cell.score, baselineGames: cell.pairedGames, baselinePairs: cell.completePairs }];
        })) };
    }), truncations };
}

function renderMobilityAudit(audit) {
  const lines = ['# Version-17 Support pawn and Scout grant results', '',
    '**640 scheduled games finalized: 639 completed and one reached the 400-ply limit.** There are 319 complete color pairs (638 scored games), no errors, and one completed partner excluded from its unfinished pair. All 512 reference games completed, so neither reference overall is affected by the truncation. Draws count half a point.', '',
    'Each candidate buys three one-point purchases. Overall weights Vanguard, Unicorn, Cruisader and Amazon equally; the three-two-step-pawn matchup is separate.', '',
    '| Purchase | Vanguard | Unicorn | Cruisader | Amazon | Reference overall | Three two-step pawns |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const row of audit.rows) lines.push(`| ${row.label} | ${row.opponents.map(item => percent(item.score)).join(' | ')} | ${percent(row.score)} | ${percent(row.baseline.score)} |`);
  lines.push('', '| Purchase | References: original / new sixteen | Two-step pawns: original / new sixteen | Reference White / Black |',
    '| --- | ---: | ---: | ---: |');
  for (const row of audit.rows) {
    const old = row.cohorts['original-sixteen'], fresh = row.cohorts['new-sixteen'];
    lines.push(`| ${row.label} | ${percent(old.referenceScore)} / ${percent(fresh.referenceScore)} | ${percent(old.baselineScore)} / ${percent(fresh.baselineScore)} | ${row.physicalColors.map(item => percent(item.score)).join(' / ')} |`);
  }
  lines.push('', 'The Scout baseline uses 15 complete pairs in the original cohort and 16 in the new cohort; its all-case baseline score uses the 31 available complete pairs.', '',
    '## Design decisions', '',
    '- Park the current Support pawn `fmWfceFifmnDsW`: its reference overall is 28.52%, all four reference matchups are below 34%, and it loses clearly to the two-step baseline in both cohorts. An unchanged repeat is unlikely to change this design decision.',
    '- Keep Scout grant `fWbmF` as a provisional one-point playtest candidate: 45.31% against references and 48.39% against the pawn baseline, with similar reference totals on the two cohorts. Avoid an automatic buff; its Cruisader matchup is a repeated weakness (25.00% / 32.81%), while Vanguard is favorable.',
    '- Do not infer isolated piece material values from these three-purchase armies. Reserve deployment, extra bodies and opponent-specific play remain part of the measured outcome.', '',
    '## Excluded pair', '');
  for (const item of audit.truncations) lines.push(
    `- Unscored: \`${item.id}\`, Scout as White, \`${item.reason}\` at ${item.totalPlies} plies.`,
    `- Its completed Black-Scout partner \`${item.excludedCompletedPartner.id}\` ended ${item.excludedCompletedPartner.result} (${item.excludedCompletedPartner.reason}) and remains excluded from the paired score. It is retained in the raw archive.`,
  );
  lines.push('', 'This affects only Scout versus two-step pawns. Preserve the original unscored result; no continuation or replacement is required for this decision.', '',
    '## Evidence scope and reproduction', '', audit.scope, '',
    'The other two uploaded journals match the already archived level-three confirmation and revision journals byte-for-byte. They add no new games or statistical weight. The broader mobility batch remains unreviewed until its separate results are supplied.', '',
    'Exact uploaded bytes are archived with pinned original and compressed SHA-256 hashes. Recorded schedule, profile and search settings match the reconstructed declaration, and the uploaded Markdown reproduces exactly. Original run manifests and native preflight proofs were not supplied; this audit does not attest to the original executable or value tables, independently replay legal moves or certify terminal positions. It fits no material values or Elo. The fixed related opening cases provide descriptive results, not a confidence interval or proof of balance.', '',
    '```powershell', 'node scripts/balance/v17-mobility-evidence.js', '```', '',
    'Use `--write` to regenerate only the derived audit JSON and this report. No engine searches or new games are started.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildMobilityAudit();
  for (const [name, content] of [[`${PREFIX}.audit.json`, JSON.stringify(audit, null, 2) + '\n'],
    [`${PREFIX}.report.md`, renderMobilityAudit(audit)]]) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${name}.`);
  }
  console.log('Mobility additions verified: 639 completed games, one truncation, 319 complete pairs; no searches or new matches.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, RESUBMITTED_SOURCES, PROVENANCE, analyzeMobilityRecords, loadMobilityEvidence, buildMobilityAudit, renderMobilityAudit, main };
