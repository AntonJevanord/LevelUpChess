'use strict';

// Offline manifest verification, replay and refitting. No engine processes start.
// Usage: node material-study-001.audit.cjs [RESULTS_DIRECTORY]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { getStudyProtocol } = require(path.join(ROOT, 'scripts/balance/material-study-plan'));
const { validateStudyPlan, studyIdentity } = require(path.join(ROOT, 'scripts/balance/material-study-run'));
const { makeStudyReport, markdown } = require(path.join(ROOT, 'scripts/balance/material-study-report'));
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

async function audit(directory = __dirname) {
  const files = {};
  const load = (key, name, location = path.join(directory, name)) => {
    const bytes = fs.readFileSync(location);
    files[key] = { file: name, bytes: bytes.length, sha256: sha(bytes) };
    return bytes;
  };
  const journal = load('games', 'material-study-001.games.jsonl').toString('utf8');
  const uploadedSummary = JSON.parse(load('summary', 'material-study-001.uploaded-summary.json'));
  const uploadedReport = load('report', 'material-study-001.uploaded-report.md').toString('utf8');
  const manifest = JSON.parse(load('manifest', 'material-study-001.collection.json'));
  assert.ok(journal.endsWith('\n'), 'The journal must end in a complete line.');
  const records = journal.trim().split('\n').map(JSON.parse);
  const plan = validateStudyPlan(manifest.plan), expected = getStudyProtocol();
  for (const field of ['protocol', 'settings', 'registry', 'profile', 'configSha256', 'study', 'exclusions']) {
    assert.deepEqual(plan[field], expected[field], `Frozen declared ${field}`);
  }
  assert.equal(manifest.jobs, 4);
  assert.equal(manifest.runId, uploadedSummary.runId);
  const preflightName = 'material-study-preflight-001.json';
  const preflight = JSON.parse(load('preflight', preflightName, path.join(__dirname, preflightName)));
  assert.equal(plan.book.sha256, preflight.book.sha256);
  assert.deepEqual(plan.openings.map(opening => opening.positionSha256), preflight.selectedOpeningHashes);
  for (const opening of plan.openings) {
    assert.equal(sha(opening.fen.split(' ').slice(0, 4).join(' ')), opening.positionSha256);
    const ordinary = plan.schedule.find(game => game.openingId === opening.id && game.kind === 'ordinary');
    assert.equal(ordinary.startFen, opening.fen);
    // Resolve allocation through the compiled profile; retain all FEN fields.
    const amazonLetter = Object.entries(plan.profile.definitionsByLetter)
      .find(([, definition]) => definition.id === 'queen.purple@1')[0];
    for (const color of ['w', 'b']) {
      const fields = opening.fen.split(' '), source = color === 'w' ? 'Q' : 'q';
      fields[0] = fields[0].replace(source, color === 'w' ? amazonLetter.toUpperCase() : amazonLetter);
      assert.equal(plan.schedule.find(game => game.openingId === opening.id && game.kind === 'amazon' && game.aColor === color).startFen, fields.join(' '));
    }
  }
  const current = studyIdentity(path.join(ROOT, 'stockfish/fairy-stockfish-levelup_x86-64.exe'));
  for (const key of Object.keys(current).filter(key => key !== 'rulesBundleSha256')) {
    assert.deepEqual(manifest.identity[key], current[key], `Recorded executable/source identity: ${key}`);
  }
  assert.equal(manifest.engineSha256, current.engineSha256);
  const rules = fs.readFileSync(path.join(ROOT, 'dist/balance-rules.cjs'), 'utf8').replace(/\r\n/g, '\n');
  const rulesMatch = manifest.identity.rulesBundleSha256 === sha(rules) ? 'LF'
    : manifest.identity.rulesBundleSha256 === sha(rules.replace(/\n/g, '\r\n')) ? 'CRLF' : null;
  assert.ok(rulesMatch, 'Rules bundle matches LF or Windows CRLF representation');
  assert.equal(manifest.configHash, sha(JSON.stringify({ plan, jobs: manifest.jobs, collectorSha256: manifest.identity.collectorSha256 })));
  assert.equal(manifest.rulesHash, sha(JSON.stringify({ bundle: manifest.identity.rulesBundleSha256, profile: plan.profile, registry: plan.registry })));
  assert.deepEqual(manifest.native, preflight.native);
  assert.equal(records.length, 1152);
  assert.equal(new Set(records.map(record => record.id)).size, 1152);
  assert.deepEqual(records.map(record => record.id).sort(), plan.schedule.map(game => game.id).sort());
  assert.ok(records.every(record => record.status === 'completed' && record.attempt === 1));
  assert.equal(records.filter(record => record.kind === 'ordinary').length, 384);
  assert.equal(records.filter(record => record.kind === 'amazon').length, 768);
  assert.deepEqual(uploadedSummary, { schemaVersion: 1, runId: uploadedSummary.runId,
    scheduledGames: 1152, finishedGames: 1152,
    statusCounts: { completed: 1152, truncated: 0, aborted: 0, error: 0 } });
  const checkpoints = [];
  for (const checkpoint of plan.study.checkpoints) {
    const { report } = await makeStudyReport(manifest, records, { checkpoint });
    checkpoints.push(report);
  }
  const final = checkpoints.at(-1);
  final.checkpointHistory = checkpoints.map(report => ({ checkpoint: report.checkpoint,
    samples: report.coverage.samples, ordinaryRook: report.estimates.ordinary.rook.value,
    combinedRook: report.estimates.combined.rook.value, rookGap: report.ordinaryCombinedRookGap,
    amazonBonus: report.currentEstimate['bonus:queen.purple@1'].value,
    bonusInterval: report.currentEstimate['bonus:queen.purple@1'].interval }));
  assert.equal(markdown(final), uploadedReport, 'Exact uploaded final Markdown regeneration');
  assert.equal(final.coverage.uniqueHistories, 1152);
  assert.equal(final.coverage.replayedPlies, 126924);
  assert.equal(final.coverage.sampledGames, 1143);
  assert.equal(final.coverage.samples, 10689);
  const score = record => record.result === '1/2-1/2' ? 0.5
    : Number((record.result === '1-0') === (record.aColor === 'w'));
  const amazon = records.filter(record => record.kind === 'amazon');
  const counts = key => Object.fromEntries([...new Set(records.map(record => record[key]))]
    .sort().map(value => [value, records.filter(record => record[key] === value).length]));
  return { schemaVersion: 1, format: 'levelup-material-study-results-audit', recordedDate: '2026-10-25',
    runId: uploadedSummary.runId, inputs: files, additionalEngineGames: 0,
    auditSourceSha256: sha(fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n')),
    provenance: { collectionManifestAvailable: true, recordedExecutableAndSourceHashesVerified: true,
      processExecutionIndependentlyAttested: false, recordedJobs: manifest.jobs,
      reportingContext: 'Uploaded original collection manifest; selected-position hashes checked against frozen preflight.',
      rulesRepresentation: rulesMatch, engineSha256: current.engineSha256,
      sourceCounts: { runner: current.runnerSources.length, collector: current.collectorSources.length, study: current.studySources.length },
      runIdSource: 'Matching original manifest and uploaded summary; individual journal records contain no run ID.' },
    checks: { summaryMatches: true, exactDeclaredScheduleAndRecordedPolicy: true,
      selectedPositionsMatchFrozenPreflight: true, pilotPositionsExcluded: true,
      allMovesSANAndFinalOutcomesReplay: true, allHistoriesDistinct: true,
      allThreeCheckpointsRefitted: true, finalMarkdownExactlyReproduced: true },
    outcomes: { results: counts('result'), terminations: counts('reason'),
      amazonSide: { games: amazon.length, wins: amazon.filter(record => score(record) === 1).length,
        draws: amazon.filter(record => score(record) === 0.5).length,
        losses: amazon.filter(record => score(record) === 0).length,
        score: amazon.reduce((sum, record) => sum + score(record), 0) / amazon.length } },
    checkpoints: checkpoints.map(report => ({ checkpoint: report.checkpoint, coverage: report.coverage,
      estimates: report.estimates, ordinaryCombinedRookGap: report.ordinaryCombinedRookGap,
      analysis: report.analysis, materialSupport: report.materialSupport,
      analysisIdentity: report.analysisIdentity })),
    decision: { status: 'Close at 1152 games; usable for rough comparisons in this recorded context.',
      assumedAnchors: { pawn: 1, queen: 9 }, provisionalLevel3Bonus: final.currentEstimate['bonus:queen.purple@1'],
      purchasePricesChanged: false, nativeEvaluationChanged: false, furtherGamesScheduled: false },
    limits: [
      'Manifest executable/source hashes and recorded four-job settings match; hashes are not independent process execution attestation.',
      'Replay and refitting validate recorded behavior and arithmetic, not best-play quality.',
      'Fixed pawn/queen ratios are assumptions; conditional bands are not universal material confidence intervals.',
      'Cumulative checkpoints overlap, and different selected FENs may share broader opening ancestry.',
      'No phase-specific values, best-play guarantees or intrinsic exchange prices are established.',
    ] };
}

if (require.main === module) {
  if (process.argv.length > 3) {
    console.error('Usage: node material-study-001.audit.cjs [RESULTS_DIRECTORY]');
    process.exitCode = 1;
  } else audit(process.argv[2]).then(result => process.stdout.write(json(result)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { audit };
