'use strict';

// Exact uploads remain separate from reconstructed declaration compatibility.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { declaredStartFen } = require('./reference-panel-evidence');
const { readPinnedSource, PROVENANCE } = require('./v17-acceptance-evidence');
const { randomSource, interval } = require('./reference-regression');
const plan = require('./v17-mixed-plan');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-mixed-001';
const CALIBRATION_SHA256 = '495f4e8796b8ea4181aee3d959432a4820e87ac7641eb339e4fb25908222048e';
const SOURCES = Object.freeze({
  journal: Object.freeze({ archiveFile: `${PREFIX}.games.jsonl.gz`, archivedSha256: 'd595b568914245d2dd1a6683f1f70530a8a9c0251df13b5e14de22d0c6c82a5b', originalName: 'games.jsonl', sha256: '838344f942967bc37d453f0eebc10f5ea76403c9fea0fd7c44803367bf35fbfe', bytes: 7338572 }),
  uploadedReport: Object.freeze({ archiveFile: `${PREFIX}.uploaded-report.md.gz`, archivedSha256: '96c0133767c88ccb1a9af3d84035f1d3088462623e59ea65b8f14727a6002df4', originalName: 'v17-report.md', sha256: '9d5f9e1e1a60a1ecfabca2a8fda41d511c62049ec1ebe672328d048df169a7b7', bytes: 10560 }),
});
const sha = value => createHash('sha256').update(value).digest('hex');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const pp = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}`;

function analyzeMixedRecords(records, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Array.isArray(records), 'Mixed journal must be an array.');
  const declaration = plan.loadExperiment(), { config } = declaration, schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  assert.equal(schedule.length, 1824);
  if (requireComplete) assert.equal(records.length, schedule.length, 'The upload must contain every scheduled game exactly once.');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'The upload repeats a game identity or contains conflicting duplicate attempts.');
  const byId = new Map(schedule.map(game => [game.id, game]));
  for (const record of records) {
    const planned = byId.get(record.id);
    assert.ok(planned, 'The upload contains an unknown scheduled game.');
    assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
    assert.equal(record.attempt, 1, 'The upload contains one attempt per game.');
    assert.ok(['completed', 'truncated'].includes(record.status), 'The upload contains only finalized games.');
    assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
    assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
    assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < schedule.length, 'Invalid worker-local schedule index.');
    const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
    const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
    assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
    assert.equal(record.royalMode, 'king', 'Mixed games require ordinary royal kings.');
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
      assert.equal(record.result, '*', 'A truncation must remain unscored.');
      assert.equal(record.reason, 'max-plies', 'Unexpected truncation reason.');
      assert.equal(record.totalPlies, config.engine.maxPlies, 'A move-limit truncation must reach the declared cap.');
    } else {
      assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected terminal reason.');
      assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
    }
  }
  const descriptor = { config, schedule, designRegistry: registry, designProfile: profile };
  const report = plan.createReport({ declaration, records, manifest: descriptor });
  if (requireComplete) assert.equal(report.progress.finalizedGames, schedule.length);
  assert.equal(report.progress.duplicateCopiesIgnored, 0);
  assert.equal(report.evaluationAudit.provenance.sha256, CALIBRATION_SHA256, 'The frozen mixed calibration changed.');
  assert.deepEqual(Object.fromEntries(report.evaluationAudit.values.map(row => [row.id, row.applied])), config.evaluation.pieceValues, 'Applied search values changed.');
  if (uploadedReport !== undefined) assert.equal(plan.renderReport(report), uploadedReport, 'Reconstructed report differs from the exact uploaded report.');
  return { ...declaration, records, registry, profile, report,
    declaration: { configSha256: sha(JSON.stringify(config)), metadataSha256: sha(JSON.stringify(declaration.metadata)),
      registryHash: registry.hash, profileHash: profile.hash, scheduleSha256: sha(JSON.stringify(schedule)), scheduledGames: schedule.length,
      descriptorKind: PROVENANCE.descriptorKind, reportReproducedExactly: uploadedReport !== undefined } };
}

function loadMixedEvidence({ readArchive } = {}) {
  const journal = readPinnedSource(SOURCES.journal, readArchive), uploadedReport = readPinnedSource(SOURCES.uploadedReport, readArchive);
  assert.equal(journal.at(-1), 10, 'The exact journal must end with a complete newline.');
  const records = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzeMixedRecords(records, uploadedReport.toString('utf8')), source: SOURCES, provenance: PROVENANCE };
}

function grantContrast(report, { resamples = 10000, seed = 42 } = {}) {
  const w2 = report.grants.rows.find(row => row.key === 'w2-grant'), wd = report.grants.rows.find(row => row.key === 'wd-grant');
  const index = new Map(w2.cases.map(row => [row.openingId, row.score]));
  const cases = wd.cases.filter(row => index.has(row.openingId)).map(row => ({ openingId: row.openingId,
    w2Score: index.get(row.openingId), wdScore: row.score, difference: row.score - index.get(row.openingId) }));
  const random = randomSource(seed), draws = [];
  if (cases.length >= 4) for (let replicate = 0; replicate < resamples; replicate++) {
    let sum = 0;
    for (let draw = 0; draw < cases.length; draw++) sum += cases[Math.floor(random() * cases.length)].difference;
    draws.push(sum / cases.length);
  }
  return { direction: 'WD minus W2', scoreDifference: mean(cases.map(row => row.difference)), cases,
    conditionalRange: { ...interval(draws), confidence: 0.95, groups: cases.length, resamples, seed,
      groupUnit: 'whole-opening-case', interpretation: 'Matched fixed-opening percentile range; retain both colors and all four opponents. Related openings and engine/prior bias remain outside the range.' },
    betterCases: cases.filter(row => row.difference > 0).length, tiedCases: cases.filter(row => row.difference === 0).length,
    worseCases: cases.filter(row => row.difference < 0).length,
    byOpponent: wd.opponents.map(row => ({ key: row.key, label: row.label, w2Score: w2.opponents.find(other => other.key === row.key).score,
      wdScore: row.score, difference: row.score - w2.opponents.find(other => other.key === row.key).score })) };
}

function buildMixedAudit() {
  const input = loadMixedEvidence(), { records, report } = input;
  const completed = records.filter(row => row.status === 'completed').length;
  return { schemaVersion: 1, format: 'levelup-v17-mixed-upload-evidence', recordedDate: '2026-11-02', sources: SOURCES, provenance: PROVENANCE,
    declaration: input.declaration, engine: input.config.engine, evaluation: input.config.evaluation,
    evaluationAudit: report.evaluationAudit, openings: input.config.openings,
    counts: { uploadedGames: records.length, finalizedGames: report.progress.finalizedGames, completedGames: completed,
      pairedGames: report.progress.pairedGames, completePairs: report.progress.completePairs,
      truncatedGames: records.filter(row => row.status === 'truncated').length,
      excludedCompletedPartners: completed - report.progress.pairedGames, errors: 0, retries: 0, newMatchGames: 0, engineSearches: 0 },
    truncations: records.filter(row => row.status === 'truncated').map(({ id, pairId, comparisonId, openingId, aColor, reason, totalPlies }) => ({ id, pairId, comparisonId, openingId, aColor, reason, totalPlies })),
    progress: report.progress, mixed: report.mixed, grants: report.grants, partnerSummary: report.partnerSummary,
    cohorts: report.cohorts, grantContrast: grantContrast(report),
    limitations: [...PROVENANCE.limitations,
      'Mixed packages, three-point solo grants, first/second opening cohorts and placement contexts remain distinct. No grand mean is pooled across panels.',
      'The WD/W2 range resamples twelve matched fixed opening blocks; it is conditional rather than a population confidence interval or proof of intrinsic superiority.',
      'WD has extra deployed jumps, but forbidden checking drops can remove reserve placements allowed to W2. The full drop-game legal choices are not necessarily a superset.',
      'Shared W2/WD search priors control a declared input; they do not establish that either prior equals the piece\'s true value.' ] };
}

function renderMixedAudit(audit) {
  const lines = ['# Mixed references and W2/WD evidence', '',
    'All 1,824 scheduled games finalized on attempt 1: 1,822 completed and two reached the 400-total-ply cap. There were no errors or retries. The two completed partners of truncations remain excluded: 1,820 games form 910 scored color pairs. The original uploaded report reproduces byte-for-byte.', '',
    '## Three-point grants', '', '| Grant | First six | Second six | All twelve | W / D / L | White | Black |', '| --- | ---: | ---: | ---: | :--- | ---: | ---: |'];
  for (const row of audit.grants.rows) {
    const halves = audit.cohorts.map(cohort => cohort.grants.rows.find(other => other.key === row.key));
    lines.push(`| ${row.label} | ${halves.map(half => percent(half.score)).join(' | ')} | ${percent(row.score)} | ${row.wins} / ${row.draws} / ${row.losses} | ${row.physicalColors.map(color => percent(color.score)).join(' | ')} |`);
  }
  const contrast = audit.grantContrast, band = contrast.conditionalRange;
  lines.push('', `WD minus W2 is **${pp(contrast.scoreDifference)} percentage points**, with a conditional matched-opening 95% range of **${pp(band.lower)} to ${pp(band.upper)} points**. Twelve whole opening blocks retain both colors and equally weight all four reference opponents; ${contrast.betterCases} cases favor WD, ${contrast.worseCases} favor W2 and ${contrast.tiedCases} tie. The range crosses zero and does not establish that W2 is intrinsically stronger.`, '',
    '| Reference | W2 score | WD score | WD minus W2 (pp) |', '| --- | ---: | ---: | ---: |',
    ...contrast.byOpponent.map(row => `| ${row.label} | ${percent(row.w2Score)} | ${percent(row.wdScore)} | ${pp(row.difference)} |`), '',
    'WD scores better against Cruisader and worse against the other three references. Its extra jumps add deployed mobility, while the nonchecking-drop rule can remove deployment squares allowed to W2. Both grants retain applied MG/EG 563/635; WD automatic values are 773/866. This controls an input without proving optimal search valuation. These observations do not isolate why their game scores differ.', '',
    '## Mixed partners', '', '| Three-point team | First six | Second six | All twelve | W / D / L | White | Black |', '| --- | ---: | ---: | ---: | :--- | ---: | ---: |');
  for (const row of audit.mixed.rows) {
    const halves = audit.cohorts.map(cohort => cohort.mixed.rows.find(other => other.key === row.key));
    lines.push(`| ${row.label} | ${halves.map(half => percent(half.score)).join(' | ')} | ${percent(row.score)} (${row.openingCoverage.shared}/12) | ${row.wins} / ${row.draws} / ${row.losses} | ${row.physicalColors.map(color => percent(color.score)).join(' | ')} |`);
  }
  lines.push('', 'The Forward Knight pawn remains above 50% with all three level-one partners, in both fixed halves and at both c/e placements. Its equal-team partner mean is 63.28%; Rank pawn is 46.59% and Diagonal grant 54.45%, with different shared-case coverage retained in JSON. King-step plus Forward Knight is strongest at 70.31% and performs well with both colors. The repeated Knight-pawn signal supports testing narrower jump components without claiming a precise additive value or isolated causal synergy.', '',
    'The Two-step-pawn plus Diagonal-grant team has a 19.32-point e-file-minus-c-file contrast. Other file contrasts, especially those with incomplete shared cases, remain descriptive. The grant-only team has one real reserve placement and half the physical games of a two-layout team; logical partner means give it equal weight.', '',
    '## Provenance and reproduction', '',
    `The twelve frozen quiet four-ply prefixes, 20,000 nodes, one thread, 32 MiB hash, Skill 20 and mixed receipt \`${CALIBRATION_SHA256}\` stay unchanged. These are search priors rather than fitted material prices.`, '',
    ...audit.limitations.map(note => `- ${note}`), '',
    'Exact uploads are preserved as deterministic gzip, pinned by archive and original-byte SHA-256. Derived JSON retains the declaration/profile/schedule hashes, all opponent/cohort/color/file results, original calibration and matched contrast details. Historical labels remain unchanged even when the playable presentation gains new names.', '',
    'Verify with `node scripts/balance/v17-mixed-evidence.js`; `--write` regenerates derived artifacts only. This archive changes no movement, price, reference, catalog, runner, engine or current panel identity.', '');
  return lines.join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildMixedAudit(), input = loadMixedEvidence();
  const artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderMixedAudit(audit)], [`${PREFIX}.original-report.md`, plan.renderReport(input.report)]];
  for (const [name, content] of artifacts) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${name}.`);
  }
  console.log('Mixed uploads verified: 1,824 finalized, 1,822 completed, 910 scored pairs; no engines or games started.');
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { SOURCES, PROVENANCE, CALIBRATION_SHA256, analyzeMixedRecords, loadMixedEvidence, grantContrast, buildMixedAudit, renderMixedAudit, main };
