'use strict';

// Exact uploaded outcomes; reconstructed declarations do not attest native runs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('./v17-plan');
const { makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { createV17Report, renderV17Report } = require('./v17-report');
const { declaredStartFen } = require('./reference-panel-evidence');
const { readPinnedSource, PROVENANCE, CALIBRATION_SHA256 } = require('./v17-acceptance-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-level3-001';
const EXPERIMENT = 'level3-confirmation';
const COUNT = 2048;
const SOURCES = Object.freeze({
  journal: Object.freeze({ archiveFile: `${PREFIX}.games.jsonl.gz`, archivedSha256: 'a3888f95aaf62c3ce2a571d957dca5d7092d20b2bdc726760d302e62015a4adf', originalName: 'games.jsonl', sha256: 'bf2d97a0cc968b213e193e90400c780c264584c089d7575de386035508103297', bytes: 8492763 }),
  uploadedReport: Object.freeze({ archiveFile: `${PREFIX}.uploaded-report.md.gz`, archivedSha256: '8cf0e1aefd797c8864e576be197fd8101b3c1f395b770aaadfd01aefa69d2060', originalName: 'v17-report.md', sha256: 'ee70947c2ec8965638287f294c1749d4af2482dda16b71264d8dd2616ada4000', bytes: 15540 }),
});
const sha = value => createHash('sha256').update(value).digest('hex');
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;

function analyzeLevel3Records(records, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Array.isArray(records), 'Level-three journal must be an array.');
  const declaration = loadExperiment(EXPERIMENT), { config } = declaration;
  const schedule = makeSchedule(config), registry = createDesignRegistry(config);
  const profile = compileDesignProfile(registry, config.evaluation);
  assert.equal(schedule.length, COUNT);
  if (requireComplete) assert.equal(records.length, schedule.length, 'The upload must contain every scheduled game exactly once.');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'The upload repeats a game identity or contains conflicting duplicate attempts.');
  const byId = new Map(schedule.map(game => [game.id, game]));
  for (const record of records) {
    const planned = byId.get(record.id);
    assert.ok(planned, 'The upload contains an unknown scheduled game.');
    assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
    assert.equal(record.attempt, 1, 'The upload contains one attempt per game.');
    assert.ok(['completed', 'truncated'].includes(record.status), 'Only completed or truncated games were uploaded.');
    assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
    assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
    assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < schedule.length,
      'Invalid worker-local schedule index.');
    const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
    const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
    assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
    assert.equal(record.royalMode, 'king', 'Level-three screening requires ordinary royal kings.');
    assert.equal(record.evaluationCaveat, null, 'Unexpected king-evaluation caveat.');
    assert.deepEqual(record.engineNames, { w: 'Fairy-Stockfish 230826', b: 'Fairy-Stockfish 230826' }, 'Recorded engine names changed.');
    assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Recorded moves must be strings.');
    assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'Recorded SAN and UCI counts differ.');
    assert.ok(Array.isArray(record.openingMoves), 'Recorded opening moves must be an array.');
    assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
    assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
    assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening ply counts differ.');
    assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded moves do not start with the declared prefix.');
    assert.ok(record.totalPlies <= config.engine.maxPlies, 'A game exceeds the move limit.');
    if (record.status === 'truncated') {
      assert.equal(record.reason, 'max-plies', 'Unexpected truncation reason.');
      assert.equal(record.result, '*', 'A truncated game must remain unscored.');
      assert.equal(record.totalPlies, config.engine.maxPlies, 'A move-limit truncation must reach the declared limit.');
    } else {
      assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected terminal reason.');
      assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
    }
  }
  // Generated solely for current declaration compatibility, not original provenance.
  const descriptor = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = createV17Report({ ...declaration, records, manifest: descriptor });
  if (requireComplete) {
    assert.equal(report.progress.finalizedGames, COUNT);
    assert.equal(report.progress.completedGames, COUNT - 1);
    assert.equal(report.progress.pairedGames, COUNT - 2);
    assert.equal(report.progress.completePairs, COUNT / 2 - 1);
  }
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  assert.equal(report.bracketStudy.evaluationAudit.provenance.sha256, CALIBRATION_SHA256, 'The frozen bracket calibration changed.');
  if (uploadedReport !== undefined) assert.equal(renderV17Report(report), uploadedReport, 'Reconstructed report differs from the exact uploaded report.');
  return { ...declaration, records, registry, profile, report,
    declaration: { configSha256: sha(JSON.stringify(config)), registryHash: registry.hash, profileHash: profile.hash,
      scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length,
      descriptorKind: PROVENANCE.descriptorKind, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadLevel3Evidence({ readArchive } = {}) {
  const journal = readPinnedSource(SOURCES.journal, readArchive);
  const uploadedReport = readPinnedSource(SOURCES.uploadedReport, readArchive);
  assert.equal(journal.at(-1), 10, 'The exact uploaded journal must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzeLevel3Records(records, uploadedReport.toString('utf8')), source: SOURCES, provenance: PROVENANCE };
}

function buildLevel3Audit() {
  const input = loadLevel3Evidence(), byDesign = new Map(input.registry.definitions.map(row => [row.id, row]));
  const truncations = input.records.filter(record => record.status === 'truncated').map(record => ({
    id: record.id, pairId: record.pairId, comparisonId: record.comparisonId, openingId: record.openingId,
    aColor: record.aColor, reason: record.reason, totalPlies: record.totalPlies,
    excludedCompletedPartner: input.records.find(partner => partner.pairId === record.pairId && partner.id !== record.id)?.id || null,
  }));
  const rows = input.metadata.rows.map(row => {
    const army = input.metadata.armies.find(army => army.key === row.key);
    assert.equal(army.designIds.length, 1, 'Each level-three row requires one upgrade identity.');
    const definition = byDesign.get(army.designIds[0]);
    assert.equal(definition.level, 3);
    return { ...row, designId: definition.id, movement: definition.movement, upgradePoints: army.upgradePoints,
      cohorts: input.report.bracketStudy.cohorts.map(cohort => ({ id: cohort.id, ...cohort.rows.find(item => item.key === row.key) })) };
  });
  return { schemaVersion: 1, format: 'levelup-v17-level3-upload-evidence', recordedDate: '2026-11-02',
    experiment: input.experiment, sources: SOURCES, provenance: PROVENANCE, declaration: input.declaration,
    engine: input.config.engine, recordedEngineNames: input.records[0].engineNames, evaluation: input.config.evaluation,
    openings: input.config.openings, progress: input.report.progress,
    counts: { uploadedGames: COUNT, finalizedGames: COUNT, completedGames: COUNT - 1, pairedGames: COUNT - 2,
      completePairs: COUNT / 2 - 1, truncatedGames: 1, excludedCompletedPartners: 1, errors: 0, retries: 0,
      newMatchGames: 0, engineSearches: 0 },
    comparisons: input.report.comparisons, overall: input.report.overall, bracketStudy: input.report.bracketStudy, rows, truncations };
}

function renderLevel3Audit(audit) {
  const lines = ['# Level-three confirmation evidence', '',
    'All 2,048 scheduled games finalized on attempt 1: 2,047 completed and one 400-ply truncation, with no errors or retries. The truncated game and its completed color partner remain excluded from scoring: 2,046 games form 1,023 complete pairs. The original uploaded Markdown report reproduces byte-for-byte.', '',
    'Each three-point candidate replacement faces one frozen three-point reference replacement. V = Vanguard; U = Unicorn; C = Cruisader; A = Amazon. Most rows include 128 games across sixteen fixed cases; Archbishop uses fifteen shared cases (120 games) for its overall score. Draws count half a point.', '',
    'The first and second cohorts are the predeclared fixed eight-case lists, not completion order. Overall scores weight the four reference opponents equally on shared fully paired cases. Individual matchup columns retain all complete pairs for that opponent, so the Archbishop average need not equal the mean of its displayed matchup cells.', '',
    '| Candidate | Movement | First 8 (shared) | Second 8 (shared) | All cases (shared) | V | U | C | A | Overall W / D / L |',
    '| --- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |'];
  for (const row of audit.rows) {
    const all = row.cohorts[2], matches = audit.comparisons.filter(comparison => comparison.aKey === row.key);
    lines.push(`| ${row.label} | \`${row.movement}\` | ${row.cohorts.map(cohort => `${percent(cohort.score)} (${cohort.openingCoverage.shared}/${cohort.openingCoverage.total})`).join(' | ')} | ${matches.map(comparison => percent(comparison.score)).join(' | ')} | ${all.wins} / ${all.draws} / ${all.losses} |`);
  }
  lines.push('', '## Selected existing designs', '',
    'The user selected the current Vertical bishop, long-forward-capture Rook pawn and Ranged rook to retain for the next roster. These are project design choices informed by this screen; the evidence archive changes no movement, identity, price, applied value or reference status.', '',
    '| Selected design | Immutable ID | Movement | Overall | V / U / C / A |',
    '| --- | :--- | :--- | ---: | :--- |');
  for (const key of ['vertical-bishop', 'rook-pawn-forward', 'ranged-rook']) {
    const row = audit.rows.find(row => row.key === key), all = row.cohorts[2];
    lines.push(`| ${row.label} | \`${row.designId}\` | \`${row.movement}\` | ${percent(all.score)} | ${all.opponents.map(opponent => percent(opponent.score)).join(' / ')} |`);
  }
  lines.push('', 'Vertical bishop scores 48.83%, with all four opponent scores between 43.75% and 54.69%. Long-forward-capture Rook pawn scores 48.05%, ranging 40.63%–57.81%. Ranged rook scores 53.13%, ranging 40.63%–59.38%. These results support retaining them for playtesting without claiming exact universal balance.', '',
    'The quiet-knight Archbishop scores 20.31% versus the ordinary Archbishop’s 67.08% on fifteen shared cases. Quiet-camel Grid bishop scores 34.38% versus Grid bishop’s 61.33%. These are large descriptive differences under the fixed search/value policy, not calibrated material deltas. Queen alternatives remain near the lower edge overall (40.23%–41.80%); the Queen pawn’s 41.02% hides a 15.63% Vanguard score and 59.38% Amazon score.', '',
    '## Truncation and provenance', '',
    ...audit.truncations.map(row => `- Unscored: \`${row.id}\` (${row.totalPlies} plies); completed partner excluded: \`${row.excludedCompletedPartner}\`.`), '',
    'The final position and engine evaluation were not converted into a win or draw. This script neither resumes nor replaces the truncated game.', '',
    'These are descriptive results conditional on sixteen short prefixes, fixed placements, 20,000 nodes per move, one thread, 32 MiB hash and the declared MG/EG policy. Calibration remains `'+CALIBRATION_SHA256+'`. No confidence interval, material fit, individual-piece Elo or final statistical balance acceptance is implied.', '',
    ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact original uploads are preserved as deterministic gzip with original-byte and archive SHA-256 pins. Reconstructed registry/profile/config/schedule receipts are compatibility checks, while the original-run/native-preflight validator remains separate.', '',
    'Verify offline: `node scripts/balance/v17-level3-evidence.js`. Use `--write` to regenerate derived artifacts only. No engine or game is started.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildLevel3Audit();
  const artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit, null, 2) + '\n'], [`${PREFIX}.report.md`, renderLevel3Audit(audit)],
    [`${PREFIX}.original-report.md`, renderV17Report(loadLevel3Evidence().report)]];
  for (const [file, content] of artifacts) {
    const target = path.join(ROOT, file);
    if (args.length) fs.writeFileSync(target, content);
    else assert.equal(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${file}.`);
  }
  console.log('Level-three upload verified: 2,048 finalized, 2,046 scored paired games, 1 unscored truncation. No engines or games started.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, EXPERIMENT, COUNT, CALIBRATION_SHA256,
  analyzeLevel3Records, loadLevel3Evidence, buildLevel3Audit, renderLevel3Audit, main };
