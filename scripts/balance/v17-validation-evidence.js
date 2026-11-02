'use strict';

// Original uploads, distinct from reconstructed declaration/native-run evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { declaredStartFen } = require('./reference-panel-evidence');
const { readPinnedSource, PROVENANCE, CALIBRATION_SHA256 } = require('./v17-acceptance-evidence');
const { getBracketValueAudit } = require('./v17-bracket-values');
const trialPlan = require('./v17-level3-revision-plan');
const bridgePlan = require('./v17-level2-bridge');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-validation-001';
const REVISION_SHA256 = '9507dbc13aec08c22562433852ffdb3bc5dea572835dab2ee342cf5729f0358f';
const PLANS = Object.freeze({ trials: trialPlan, bridge: bridgePlan });
const COUNTS = Object.freeze({ trials: 768, bridge: 384 });
const SOURCES = {
  trials: {
    journal: { archiveFile: `${PREFIX}.trials.games.jsonl.gz`, archivedSha256: 'c69d9a31ad6fb501bd270ec40989186fc83d6a01ec067f6936da99f50ff44fbf', originalName: 'games.jsonl', sha256: 'f4e705a3222cade6cd40e6785bd24b413ea0f23fca51fb3e9797f18ec9699cc4', bytes: 2953219 },
    uploadedReport: { archiveFile: `${PREFIX}.trials.uploaded-report.md.gz`, archivedSha256: '8b980ec9842e368021f025e6152779af7799ae91cc4f6057ddc742039975f73b', originalName: 'v17-report.md', sha256: '8c41323f7c6b8284e09d89fd83814b41f0ec150eadd4e43563625b7a1caef4d5', bytes: 8339 },
  },
  bridge: {
    journal: { archiveFile: `${PREFIX}.bridge.games.jsonl.gz`, archivedSha256: 'ed2243e5d180632eca5179e6f4ba599368ce586009e79ad4a79898a8d568b6bb', originalName: 'games.jsonl', sha256: 'b801d3b4953ddd983fd7508cee013536293da9743102e7af57dd16b81584711a', bytes: 1426073 },
    uploadedReport: { archiveFile: `${PREFIX}.bridge.uploaded-report.md.gz`, archivedSha256: '7bc3ed917bee72063265f7bd93d40114243a89b70446622f2cde75cbd685f110', originalName: 'v17-report.md', sha256: '2b47c44663d7855c57d7ba971b0ec25506b38bd3388f304db3926753b090e162', bytes: 6931 },
  },
};
for (const source of Object.values(SOURCES)) { Object.values(source).forEach(Object.freeze); Object.freeze(source); }
Object.freeze(SOURCES);
const sha = value => createHash('sha256').update(value).digest('hex');
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;

function analyzeValidationRecords(name, records, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Object.hasOwn(PLANS, name), 'Choose trials or bridge.');
  assert.ok(Array.isArray(records), 'Validation journal must be an array.');
  const plan = PLANS[name], declaration = plan.loadExperiment(), { config } = declaration;
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
    assert.equal(record.royalMode, 'king', 'Validation requires ordinary royal kings.');
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
    assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected terminal reason.');
    assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
  }
  // Current declarations are used for compatibility, not as original run manifests.
  const descriptor = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = plan.createReport({ declaration, records, manifest: descriptor });
  if (requireComplete) {
    assert.equal(report.progress.completedGames, schedule.length);
    assert.equal(report.progress.pairedGames, schedule.length);
    assert.equal(report.progress.completePairs, schedule.length / 2);
  }
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  const valueAudit = name === 'trials' ? declaration.metadata.appliedValueAudit
    : getBracketValueAudit(Object.keys(config.evaluation.pieceValues));
  if (name === 'trials') {
    assert.equal(valueAudit.provenance.sha256, REVISION_SHA256, 'The frozen revision calibration changed.');
    assert.equal(valueAudit.provenance.baseline.sha256, CALIBRATION_SHA256, 'The baseline bracket calibration changed.');
  } else assert.equal(valueAudit.provenance.sha256, CALIBRATION_SHA256, 'The baseline bracket calibration changed.');
  assert.deepEqual(Object.fromEntries(valueAudit.values.map(row => [row.id, row.applied])), config.evaluation.pieceValues,
    'Applied engine values do not match the frozen configuration.');
  if (uploadedReport !== undefined) assert.equal(plan.renderReport(report), uploadedReport, 'Reconstructed report differs from the exact uploaded report.');
  return { name, ...declaration, records, registry, profile, report, valueAudit,
    declaration: { configSha256: sha(JSON.stringify(config)), metadataSha256: sha(JSON.stringify(declaration.metadata)),
      registryHash: registry.hash, profileHash: profile.hash, scheduleSha256: sha(JSON.stringify(schedule)),
      scheduledGames: schedule.length, descriptorKind: PROVENANCE.descriptorKind,
      reportReproducedExactly: uploadedReport !== undefined } };
}

function loadValidationEvidence(name, { readArchive } = {}) {
  const source = SOURCES[name];
  assert.ok(source, 'Choose trials or bridge.');
  const journal = readPinnedSource(source.journal, readArchive), uploadedReport = readPinnedSource(source.uploadedReport, readArchive);
  assert.equal(journal.at(-1), 10, 'The exact uploaded journal must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzeValidationRecords(name, records, uploadedReport.toString('utf8')), source, provenance: PROVENANCE };
}

function buildValidationAudit() {
  const stages = Object.keys(PLANS).map(name => {
    const input = loadValidationEvidence(name);
    const stage = { name, experiment: input.experiment, source: input.source, declaration: input.declaration,
      engine: input.config.engine, recordedEngineNames: input.records[0].engineNames, evaluation: input.config.evaluation,
      valueAudit: input.valueAudit, openings: input.config.openings, progress: input.report.progress };
    if (name === 'trials') Object.assign(stage, { upgradePoints: 3, trialDefinitions: input.report.trialDefinitions,
      comparisons: input.report.comparisons, overall: input.report.overall,
      cohorts: input.report.cohorts.map(cohort => ({ id: cohort.id, overall: cohort.report.overall })) });
    else stage.panels = input.report.panels.map(panel => ({ id: panel.id, budget: panel.budget,
      scheduledGames: panel.scheduledGames, progress: panel.report.progress,
      comparisons: panel.report.comparisons, overall: panel.report.overall,
      cohorts: panel.cohorts.map(cohort => ({ id: cohort.id, overall: cohort.report.overall })) }));
    return stage;
  });
  assert.deepEqual(stages[0].openings, stages[1].openings, 'The two studies must retain their shared frozen opening cases.');
  return { schemaVersion: 1, format: 'levelup-v17-validation-upload-evidence', recordedDate: '2026-11-02',
    sources: SOURCES, provenance: PROVENANCE,
    counts: { uploadedGames: 1152, completedGames: 1152, pairedGames: 1152, completePairs: 576,
      truncatedGames: 0, excludedCompletedPartners: 0, errors: 0, retries: 0, newMatchGames: 0, engineSearches: 0 }, stages };
}

function summaryRows(lines, overall, cohorts) {
  for (const row of overall.rows) {
    const halves = cohorts.map(cohort => cohort.overall.rows.find(other => other.key === row.key));
    lines.push(`| ${row.label} | ${halves.map(half => percent(half.score)).join(' | ')} | ${percent(row.score)} | ${row.wins} / ${row.draws} / ${row.losses} | ${row.physicalColors.map(color => percent(color.score)).join(' | ')} |`);
  }
}

function renderValidationAudit(audit) {
  const trials = audit.stages.find(stage => stage.name === 'trials'), bridge = audit.stages.find(stage => stage.name === 'bridge');
  const lines = ['# Level-three trials and level-two validation evidence', '',
    'All 1,152 uploaded games completed on attempt 1: 768 level-three trial games and 384 level-two validation games. There were no errors, retries, truncations or excluded partners. All 576 color-swapped pairs are scored, and both original reports reproduce byte-for-byte.', '',
    'These are three separate purchase contexts: one three-point trial versus one frozen three-point reference; one two-point purchase versus another two-point purchase; and three identical two-point purchases versus two identical non-Amazon three-point references (six points per side). No overall percentage is pooled across these contexts.', '',
    '## Three-point trials', '',
    'Each trial has 128 games: sixteen fixed cases, both colors and four equally weighted frozen references. Both eight-case halves are predeclared opening lists, not completion order. Draws count half a point.', '',
    '| Trial | First 8 | Second 8 | All 16 | W / D / L | White | Black |',
    '| --- | ---: | ---: | ---: | :--- | ---: | ---: |'];
  summaryRows(lines, trials.overall, trials.cohorts);
  lines.push('', 'The selected Blocked Vertical bishop scores 50.00% in each fixed half and overall; its opponent scores range from 45.31% to 57.81%. The selected Sideways Queen pawn scores 53.13%/53.91% across halves and 53.52% overall, with opponent scores from 43.75% to 59.38%. These support retaining them for playtesting, rather than proving exact universal balance.', '',
    'Rook-ray queen scores 65.63% (63.28%/67.97% across halves) and is parked. Three-point King grant scores 69.14% (White 76.56%, Black 61.72%); this does not establish its strength at a future four-point price. Three-step Orthogonal grant scores 61.33% and Knight grant 62.11%. No new price is inferred from those percentages.', '',
    '## Two-point singles and six-point bridge', '');
  for (const panel of bridge.panels) {
    lines.push(panel.id === 'singles' ? '### Two-point singles' : '### Six-point bridge', '',
      `${panel.scheduledGames} games; ${panel.budget} upgrade points per side. The following means include only this panel’s scheduled opponents.`, '',
      '| Purchase | First 8 | Second 8 | All 16 | W / D / L | White | Black |',
      '| --- | ---: | ---: | ---: | :--- | ---: | ---: |');
    summaryRows(lines, panel.overall, panel.cohorts); lines.push('');
  }
  lines.push('Forward Knight pawn scores 61.72% in singles and 67.19% as a three-purchase bundle. Rank pawn scores 43.75% in singles and 22.40% in the bridge; the latter’s White/Black scores are 31.25%/13.54%. Diagonal grant scores 44.53% in singles and 55.21% in the bridge, with bridge halves 44.79%/65.63% and White/Black 67.71%/42.71%. These contexts expose stacking, opponent and placement effects; they do not provide an additive material value or piece Elo.', '',
    '## Provenance and reproduction', '',
    'Both studies retain the same sixteen frozen two-ply prefixes, 20,000 nodes per move, Skill 20, one thread, 32 MiB hash and a 400-total-ply cap. The level-two study retains bracket calibration `'+CALIBRATION_SHA256+'`; the new level-three trials retain revision receipt `'+REVISION_SHA256+'`, whose baseline is the same bracket calibration. These are declared engine priors, not outcome-fitted material estimates.', '',
    ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact original uploads are preserved as deterministic gzip with original-byte and archive SHA-256 pins. The audit JSON retains configuration, metadata, registry, profile and schedule receipts, both applied-value audits, all per-opponent results and the separate cohort/color summaries. Original-run/native-preflight validation remains separate.', '',
    'Selection or retention of a playable design is a project decision; this archive changes no movement, immutable identity, price, reference, catalog, runtime or engine setting. Sixteen fixed cases support descriptive review without population confidence intervals or automatic final acceptance.', '',
    'Verify offline with `node scripts/balance/v17-validation-evidence.js`; use `--write` to regenerate derived artifacts only. No engine or game is started.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildValidationAudit();
  const artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit, null, 2) + '\n'], [`${PREFIX}.report.md`, renderValidationAudit(audit)],
    ...Object.keys(PLANS).map(name => [`${PREFIX}.${name}.report.md`, PLANS[name].renderReport(loadValidationEvidence(name).report)])];
  for (const [file, content] of artifacts) {
    const target = path.join(ROOT, file);
    if (args.length) fs.writeFileSync(target, content);
    else assert.equal(fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${file}.`);
  }
  console.log('Validation uploads verified: 1,152 completed games, 576 complete pairs; three purchase contexts kept separate. No engines or games started.');
  return audit;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
module.exports = { SOURCES, PROVENANCE, COUNTS, CALIBRATION_SHA256, REVISION_SHA256,
  analyzeValidationRecords, loadValidationEvidence, buildValidationAudit, renderValidationAudit, main };
