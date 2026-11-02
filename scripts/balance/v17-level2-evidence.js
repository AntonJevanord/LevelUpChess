'use strict';

// Exact uploaded outcomes; reconstructed declarations are compatibility checks.
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
const PREFIX = 'v17-level2-001';
const EXPERIMENTS = Object.freeze({ pawns: 'reference-pawns', grants: 'reference-grants' });
const COUNTS = Object.freeze({ pawns: 1440, grants: 1248 });
const SOURCES = {
  pawns: {
    journal: { archiveFile: `${PREFIX}.pawns.games.jsonl.gz`, archivedSha256: '245f00a0b5fc4b79836560a739f003739ead575c73730f7450bb9c1be01fd44b', originalName: 'games.jsonl', sha256: '6a33ea8edf3068a84ff3b23facef5b5c255486f78ca7d6d1bf02d2fc87728e8d', bytes: 6347253 },
    uploadedReport: { archiveFile: `${PREFIX}.pawns.uploaded-report.md.gz`, archivedSha256: '9df9024c39aa8d7ca48132b15e5db1c4c4de795ecdd6201b3e8026928d1018c1', originalName: 'v17-report.md', sha256: '41315de1643cb27b46f419daf1ae5ee6ab5a02bda897c9d73b8c9ad161626e25', bytes: 16675 },
  },
  grants: {
    journal: { archiveFile: `${PREFIX}.grants.games.jsonl.gz`, archivedSha256: '26e712873eb11da09f984a63563b7a44e1d82690a0f5b707bee123169c8ad9f0', originalName: 'games.jsonl', sha256: '03fe0fbb508826fde8150030ff6433e51fa72c7a869869950d2fb2075e85c28c', bytes: 5605862 },
    uploadedReport: { archiveFile: `${PREFIX}.grants.uploaded-report.md.gz`, archivedSha256: 'c69fee28819fe2c10281bed2f990257676bea624bb56d0b0624fd278e3ff135f', originalName: 'v17-report.md', sha256: 'b64ebc6e2d08af61e735ca0dad0a8c863e8ae3541ae4a73b0fd3ecc83d6557df', bytes: 15645 },
  },
};
for (const source of Object.values(SOURCES)) { Object.values(source).forEach(Object.freeze); Object.freeze(source); }
Object.freeze(SOURCES);
const sha = value => createHash('sha256').update(value).digest('hex');
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;

function analyzeLevel2Records(name, records, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Object.hasOwn(EXPERIMENTS, name), 'Choose pawns or grants.');
  assert.ok(Array.isArray(records), 'Level-two journal must be an array.');
  const declaration = loadExperiment(EXPERIMENTS[name]), { config } = declaration;
  const schedule = makeSchedule(config), registry = createDesignRegistry(config);
  const profile = compileDesignProfile(registry, config.evaluation);
  assert.equal(schedule.length, COUNTS[name]);
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
    assert.equal(record.royalMode, 'king', 'Level-two screening requires ordinary royal kings.');
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
  // This descriptor is reconstructed now, never offered as an original manifest.
  const descriptor = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = createV17Report({ ...declaration, records, manifest: descriptor });
  if (requireComplete) {
    assert.equal(report.progress.finalizedGames, schedule.length);
    assert.equal(report.progress.completedGames, schedule.length - 1);
    assert.equal(report.progress.pairedGames, schedule.length - 2);
    assert.equal(report.progress.completePairs, schedule.length / 2 - 1);
  }
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  assert.equal(report.bracketStudy.evaluationAudit.provenance.sha256, CALIBRATION_SHA256, 'The frozen bracket calibration changed.');
  if (uploadedReport !== undefined) assert.equal(renderV17Report(report), uploadedReport, 'Reconstructed report differs from the exact uploaded report.');
  return { name, ...declaration, records, registry, profile, report,
    declaration: { configSha256: sha(JSON.stringify(config)), registryHash: registry.hash, profileHash: profile.hash,
      scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length,
      descriptorKind: PROVENANCE.descriptorKind, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadLevel2Evidence(name, { readArchive } = {}) {
  const source = SOURCES[name];
  assert.ok(source, 'Choose pawns or grants.');
  const journal = readPinnedSource(source.journal, readArchive);
  const report = readPinnedSource(source.uploadedReport, readArchive);
  assert.equal(journal.at(-1), 10, 'The exact uploaded journal must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzeLevel2Records(name, records, report.toString('utf8')), source, provenance: PROVENANCE };
}

function buildLevel2Audit() {
  const stages = Object.keys(EXPERIMENTS).map(name => {
    const input = loadLevel2Evidence(name), byId = new Map(input.records.map(record => [record.id, record]));
    const truncations = input.records.filter(record => record.status === 'truncated').map(record => ({
      id: record.id, pairId: record.pairId, comparisonId: record.comparisonId, openingId: record.openingId,
      aColor: record.aColor, reason: record.reason, totalPlies: record.totalPlies,
      excludedCompletedPartner: [...byId.values()].find(partner => partner.pairId === record.pairId && partner.id !== record.id)?.id || null,
    }));
    return { name, experiment: input.experiment, source: input.source, declaration: input.declaration,
      engine: input.config.engine, recordedEngineNames: input.records[0].engineNames, evaluation: input.config.evaluation,
      openings: input.config.openings, progress: input.report.progress, truncations,
      comparisons: input.report.comparisons, overall: input.report.overall, bracketStudy: input.report.bracketStudy };
  });
  return { schemaVersion: 1, format: 'levelup-v17-level2-upload-evidence', recordedDate: '2026-11-01',
    sources: SOURCES, provenance: PROVENANCE,
    counts: { uploadedGames: 2688, finalizedGames: 2688, completedGames: 2686, pairedGames: 2684,
      completePairs: 1342, truncatedGames: 2, excludedCompletedPartners: 2, errors: 0, retries: 0,
      newMatchGames: 0, engineSearches: 0 }, stages };
}

function renderLevel2Audit(audit) {
  const lines = ['# Level-two pawn and grant evidence', '',
    'All 2,688 scheduled games finalized on attempt 1: 1,440 pawn games and 1,248 grant games. There were 2,686 completed games, two 400-ply truncations and no errors or retries. The two completed partners of truncated games remain excluded: 2,684 games form 1,342 scored complete pairs. Both original Markdown reports reproduce byte-for-byte.', '',
    'One two-point candidate purchase faces two identical one-point reference purchases. Pawns replace one starting pawn; grants begin in reserve under the declared deployment rules. TT = two Two-step pawns; KK = two King-step pawns; GG = two Pawn grants. Draws count half a point. Overall scores weight opponents and shared fully paired opening cases equally.', '',
    'Most rows include 96 games across all sixteen fixed cases. Reduced Rook pawn and reduced Orthogonal grant use fifteen shared cases (90 games) for their overall score; their individual matchup cells retain any other complete pairs. The JSON retains all opponent/cohort/color detail.', '',
    '| Candidate | Movement | Budget | First 8 (shared) | Second 8 (shared) | All cases (shared) | TT | KK | GG | Overall W / D / L |',
    '| --- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |'];
  const seen = new Set();
  for (const stage of audit.stages) for (const group of stage.bracketStudy.brackets) for (const variant of group.variants) {
    if (seen.has(variant.rowKey)) continue; // F/F2 are shared across two declared brackets.
    seen.add(variant.rowKey);
    const all = variant.cohorts[2];
    const matches = stage.comparisons.filter(row => row.aKey === variant.rowKey);
    lines.push(`| ${all.label} | \`${variant.movement}\` | ${variant.upgradePoints} | ${variant.cohorts.map(cohort => `${percent(cohort.score)} (${cohort.openingCoverage.shared}/${cohort.openingCoverage.total})`).join(' | ')} | ${matches.map(row => percent(row.score)).join(' | ')} | ${all.wins} / ${all.draws} / ${all.losses} |`);
  }
  lines.push('', 'Individual matchup columns use all complete color pairs for that opponent; overall and its W/D/L use only the cases shared across all three opponents. The two partially covered rows therefore need not equal the arithmetic mean of the displayed matchup cells.', '',
    '## Selected working references', '',
    'The current Forward Knight pawn, current Rank pawn and current Diagonal grant are selected as working level-two references, following the user’s preference. Their existing identities, movement, prices and engine values remain unchanged. Selection is a project design decision supported by this screen; it is not a statistical proof of final balance.', '',
    '| Candidate | ID | Movement | First 8 | Second 8 | All 16 | TT / KK / GG |',
    '| --- | :--- | :--- | ---: | ---: | ---: | :--- |');
  const favorites = new Set(['forward-knight-current', 'rank-current', 'grant-diagonal-current']);
  const favoritesSeen = new Set();
  for (const stage of audit.stages) for (const group of stage.bracketStudy.brackets) for (const variant of group.variants) {
    if (!favorites.has(variant.rowKey) || favoritesSeen.has(variant.rowKey)) continue;
    favoritesSeen.add(variant.rowKey);
    lines.push(`| ${variant.cohorts[2].label} | \`${variant.id}\` | \`${variant.movement}\` | ${variant.cohorts.map(cohort => percent(cohort.score)).join(' | ')} | ${variant.cohorts[2].opponents.map(opponent => percent(opponent.score)).join(' / ')} |`);
  }
  lines.push('', 'The Orthogonal grants score 51.67% (`W`, fifteen shared cases), 72.40% (`W2`) and 68.75% (`W3`) in this two-point screen. These observations do not establish an appropriate higher-tier price. Current Full Knight pawn scores 65.10%; expanded scores 75.00%. Bishop pawns remain below the descriptive target at 17.19%–32.29%.', '',
    '## Truncations and provenance', '',
    '| Stage | Truncated scheduled game | Excluded completed partner |', '| --- | :--- | :--- |',
    ...audit.stages.flatMap(stage => stage.truncations.map(row => `| ${stage.experiment} | \`${row.id}\` | \`${row.excludedCompletedPartner}\` |`)), '',
    'Truncated games remain unscored; neither their final positions nor engine evaluations were converted into draws or wins. Missing partners are not replayed by this script.', '',
    'These are descriptive outcomes conditional on fixed starting placement, sixteen short prefixes, 20,000 nodes per move, one thread, 32 MiB hash and the declared common MG/EG policy within each bracket. Calibration remains `'+CALIBRATION_SHA256+'`. No confidence interval, material-value fit, individual-piece Elo or final balance acceptance is implied.', '',
    ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact original uploads are archived as deterministic gzip with original-byte and archive SHA-256 pins. Reconstructed declaration/profile/schedule receipts and applied-value audits are retained in JSON. The original-run/native-proof validator remains separate.', '',
    'Verify offline: `node scripts/balance/v17-level2-evidence.js`. Use `--write` to regenerate derived artifacts only. No engine or game is started.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildLevel2Audit();
  const artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit, null, 2) + '\n'], [`${PREFIX}.report.md`, renderLevel2Audit(audit)],
    ...Object.keys(EXPERIMENTS).map(name => [`${PREFIX}.${name}.report.md`, renderV17Report(loadLevel2Evidence(name).report)])];
  for (const [file, content] of artifacts) {
    const target = path.join(ROOT, file);
    if (args.length) fs.writeFileSync(target, content);
    else assert.equal(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${file}.`);
  }
  console.log('Level-two uploads verified: 2,688 finalized, 2,684 scored paired games, 2 unscored truncations. No engines or games started.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, EXPERIMENTS, COUNTS, CALIBRATION_SHA256,
  analyzeLevel2Records, loadLevel2Evidence, buildLevel2Audit, renderLevel2Audit, main };
