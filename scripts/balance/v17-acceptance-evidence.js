'use strict';

// Uploaded outcomes remain separate from original-run/native-engine proof.
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
const { declaredStartFen } = require('./reference-panel-evidence');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-acceptance-001';
const EXPERIMENTS = Object.freeze({ minors: 'acceptance-minors', majors: 'acceptance-majors' });
const COUNTS = Object.freeze({ minors: 1152, majors: 864 });
const CALIBRATION_SHA256 = '205709189dcec631970253dbdf826669262e412c325764f47880acbfbd96d2f9';
const SOURCES = {
  minors: {
    journal: { archiveFile: `${PREFIX}.minors.games.jsonl.gz`, archivedSha256: 'd22b46a8ba3e173b7d3865a3637ddf0bad6de75eabb61c808ccbc18065aecac3', originalName: 'games.jsonl', sha256: '81b692c0078e43eec180e879fee38471e1bc989baa00c8857e077db104cf0d27', bytes: 4893464 },
    uploadedReport: { archiveFile: `${PREFIX}.minors.uploaded-report.md.gz`, archivedSha256: '6d216481341d53c63ec6b0c086758c2400e7d9ad61b0cd772d250baa20f7ec75', originalName: 'v17-report.md', sha256: 'b6386ba951193731c2510b96845f819357b7c1fad279b7732a5da64b352e444e', bytes: 14288 },
  },
  majors: {
    journal: { archiveFile: `${PREFIX}.majors.games.jsonl.gz`, archivedSha256: 'b8b158dca611110eaba5ba7ff77466d44eb419b59595b741859ac68f2bffc190', originalName: 'games.jsonl', sha256: '2b7f6fa1944fc8a587b4543900a5c01014e313d02893dfe63ea478242ad38d09', bytes: 3548649 },
    uploadedReport: { archiveFile: `${PREFIX}.majors.uploaded-report.md.gz`, archivedSha256: 'd1c76d53ccc70d14522e9e6f807badb84f952aa39893be5364d6ed93aeebc65f', originalName: 'v17-report.md', sha256: 'ba27b1b03f80c615ce797181d13f9dee7e4fb8ec9f5195205ab9a51a848eb75f', bytes: 11800 },
  },
};
for (const source of Object.values(SOURCES)) { Object.values(source).forEach(Object.freeze); Object.freeze(source); }
Object.freeze(SOURCES);
const PROVENANCE = Object.freeze({ originalManifestSupplied: false, nativePreflightSupplied: false,
  uploadedReportSupplied: true, engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'Original run.json, archived INI files and native-preflight proof were not supplied. Reconstructed declarations check compatibility, not original run provenance.',
    'Recorded starts, identities, opening prefixes, search settings and outcomes match the declarations. Engine names and profile hashes do not attest the executable or native material tables.',
    'Moves and terminal outcomes were not independently replayed. No games, engine searches, material fit, Elo or population confidence interval were produced.',
  ]) });
const sha = value => createHash('sha256').update(value).digest('hex');
const percent = value => value === null ? 'pending' : `${(value * 100).toFixed(2)}%`;

function readPinnedSource(pin, read = file => fs.readFileSync(file)) {
  const archive = read(path.join(ROOT, pin.archiveFile));
  assert.equal(sha(archive), pin.archivedSha256, `Archive changed: ${pin.archiveFile}.`);
  const bytes = gunzipSync(archive);
  assert.equal(bytes.length, pin.bytes, `Original byte count changed: ${pin.archiveFile}.`);
  assert.equal(sha(bytes), pin.sha256, `Original bytes changed: ${pin.archiveFile}.`);
  return bytes;
}

function analyzeAcceptanceRecords(name, records, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Object.hasOwn(EXPERIMENTS, name), 'Choose minors or majors.');
  assert.ok(Array.isArray(records), 'Acceptance journal must be an array.');
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
    assert.equal(record.status, 'completed', 'The upload contains only completed games.');
    assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
    assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
    assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < schedule.length,
      'Invalid worker-local schedule index.');
    const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
    const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
    assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
    assert.equal(record.royalMode, 'king', 'Acceptance requires ordinary royal kings.');
    assert.equal(record.evaluationCaveat, null, 'Unexpected king-evaluation caveat.');
    assert.deepEqual(record.engineNames, { w: 'Fairy-Stockfish 230826', b: 'Fairy-Stockfish 230826' }, 'Recorded engine names changed.');
    assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Recorded moves must be strings.');
    assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'Recorded SAN and UCI counts differ.');
    assert.ok(Array.isArray(record.openingMoves), 'Recorded opening moves must be an array.');
    assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
    assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
    assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening ply counts differ.');
    assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded moves do not start with the declared prefix.');
    assert.ok(record.totalPlies <= config.engine.maxPlies, 'A completed game exceeds the move limit.');
    assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected terminal reason.');
    assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
  }
  // Generated now, solely for compatibility checks. This is not an original manifest.
  const derivedDescriptor = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = createV17Report({ ...declaration, records, manifest: derivedDescriptor });
  if (requireComplete) {
    assert.equal(report.progress.completedGames, schedule.length);
    assert.equal(report.progress.pairedGames, schedule.length);
    assert.equal(report.progress.completePairs, schedule.length / 2);
  }
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  assert.equal(report.bracketStudy.evaluationAudit.provenance.sha256, CALIBRATION_SHA256, 'The frozen bracket calibration changed.');
  if (uploadedReport !== undefined) assert.equal(renderV17Report(report), uploadedReport, 'Reconstructed report differs from the exact uploaded report.');
  return { name, ...declaration, records, registry, profile, report,
    declaration: { configSha256: sha(JSON.stringify(config)), registryHash: registry.hash, profileHash: profile.hash,
      scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length,
      descriptorKind: PROVENANCE.descriptorKind, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadAcceptanceEvidence(name, { readArchive } = {}) {
  const source = SOURCES[name];
  assert.ok(source, 'Choose minors or majors.');
  const journal = readPinnedSource(source.journal, readArchive);
  const report = readPinnedSource(source.uploadedReport, readArchive);
  assert.equal(journal.at(-1), 10, 'The exact uploaded journal must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzeAcceptanceRecords(name, records, report.toString('utf8')), source, provenance: PROVENANCE };
}

function buildAcceptanceAudit() {
  const stages = Object.keys(EXPERIMENTS).map(name => {
    const input = loadAcceptanceEvidence(name);
    return { name, experiment: input.experiment, source: input.source, declaration: input.declaration,
      engine: input.config.engine, recordedEngineNames: input.records[0].engineNames, evaluation: input.config.evaluation, openings: input.config.openings,
      progress: input.report.progress, comparisons: input.report.comparisons, overall: input.report.overall,
      bracketStudy: input.report.bracketStudy };
  });
  return { schemaVersion: 1, format: 'levelup-v17-acceptance-upload-evidence', recordedDate: '2026-11-01',
    sources: SOURCES, provenance: PROVENANCE,
    counts: { uploadedGames: 2016, completedGames: 2016, pairedGames: 2016, completePairs: 1008,
      truncatedGames: 0, errors: 0, retries: 0, newMatchGames: 0, engineSearches: 0 }, stages };
}

function renderAcceptanceAudit(audit) {
  const lines = ['# Level-one acceptance evidence', '',
    'All 2,016 uploaded games completed on attempt 1: 1,152 minor-piece games and 864 rook/queen games, forming 1,008 color-swapped pairs. No truncations, errors or retries were recorded. Both uploaded reports reproduce byte-for-byte.', '',
    'Each row below includes 96 games: 16 fixed opening cases, both colors, and three equally weighted benchmark armies. Knights, bishops and rooks use two identical candidate upgrades versus two identical reference purchases (budget 2). The single upgraded queen faces one reference purchase (budget 1). These budgets remain separate.', '',
    'TT = Two-step pawns; KK = King-step pawns; GG = Pawn grants. For the queen rows, T/K/G each means one purchase. Scores count draws as half a point.', '',
    '| Family | Budget | Reduced | Current | Expanded |', '| --- | ---: | ---: | ---: | ---: |'];
  for (const stage of audit.stages) for (const group of stage.bracketStudy.brackets) {
    lines.push(`| ${group.label} | ${group.variants[0].upgradePoints} | ${group.variants.map(variant => percent(variant.cohorts[2].score)).join(' | ')} |`);
  }
  lines.push('', '## Fixed-cohort and opponent detail', '',
    'First and second halves refer to the predeclared opening lists, rather than completion order. Each half has 48 games per row; each all-case opponent cell has 32 games. Opponent scores for both halves and physical-color splits are retained in the audit JSON.', '',
    '| Family / version | Movement | Budget | First 8 | Second 8 | All 16 | TT / T | KK / K | GG / G | W / D / L |',
    '| --- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |');
  for (const stage of audit.stages) for (const group of stage.bracketStudy.brackets) for (const variant of group.variants) {
    const all = variant.cohorts[2];
    lines.push(`| ${group.label}: ${variant.key} | \`${variant.movement}\` | ${variant.upgradePoints} | ${variant.cohorts.map(cohort => percent(cohort.score)).join(' | ')} | ${all.opponents.map(opponent => percent(opponent.score)).join(' | ')} | ${all.wins} / ${all.draws} / ${all.losses} |`);
  }
  lines.push('', '## Interpretation', '',
    '- Current Wazzap bishop (`BsW`) is the clearest candidate to retain: 52.60% overall, 55.21%/50.00% across halves, and 48.44%–54.69% across benchmarks.',
    '- Expanded Climbing knight (`NvWvD`) is promising near the upper edge: 59.38% overall, 61.46%/57.29% across halves. It merits playtesting before a reference decision.',
    '- Current Pawn rook (`RceF`) averages 48.96%, but King-step pawns hold it to 26.56%, versus 62.50% against Two-step pawns and 57.81% against grants. Its reduced version has the same weak matchup. Expanded `RceF2` is consistently strong at 72.92% overall (78.13%/67.71% across halves).',
    '- Expanded Positional knight (39.06%) and Ghost rook (41.67%) improve on their siblings, but retain weak matchup/cohort results. All Hopping bishop variants remain at 20.31%–27.08%.',
    '- All Advancing queen variants underperform their one-point comparisons (25.00%–35.94%). The expanded queen rises from 29.17% to 42.71% between fixed halves, so its average should not be treated as a precise universal value.',
    '- Reduced/current/expanded label movement choices. The nonmonotonic Hopping results do not prove that added quiet moves weaken a piece; outcomes also depend on fixed search and valuation.', '',
    'These are descriptive screening results conditional on 20,000 nodes per move, one thread, 32 MiB hash, fixed starts and the declared common MG/EG values within each bracket. The calibration SHA-256 remains `'+CALIBRATION_SHA256+'`. No outcome-fitted material value, individual-piece Elo, confidence interval or statistical acceptance is implied.', '',
    'Keep the active level-two run and its frozen declarations unchanged. Review/playtest the promising level-one candidates after that run; any redesign or evaluation-policy change needs its own identity and a targeted follow-up rather than replaying unchanged cells.', '',
    '## Provenance and reproduction', '',
    ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact original uploads are preserved as deterministic gzip archives with original-byte and archive hashes in the audit JSON and verifier. Derived declarations are never accepted as original-run/native-preflight evidence.', '',
    'Verify offline with `node scripts/balance/v17-acceptance-evidence.js`; regenerate only derived artifacts with `--write`. No engine is started. Detailed original-style reports are retained for each stage.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildAcceptanceAudit();
  const artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit, null, 2) + '\n'], [`${PREFIX}.report.md`, renderAcceptanceAudit(audit)],
    ...Object.keys(EXPERIMENTS).map(name => [`${PREFIX}.${name}.report.md`, renderV17Report(loadAcceptanceEvidence(name).report)])];
  for (const [file, content] of artifacts) {
    const target = path.join(ROOT, file);
    if (args.length) fs.writeFileSync(target, content);
    else assert.equal(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${file}.`);
  }
  console.log('Acceptance uploads verified: 2,016 completions, 1,008 complete pairs; budgets and fixed cohorts remain separate. No engines or games started.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, EXPERIMENTS, COUNTS, CALIBRATION_SHA256, readPinnedSource,
  analyzeAcceptanceRecords, loadAcceptanceEvidence, buildAcceptanceAudit, renderAcceptanceAudit, main };
