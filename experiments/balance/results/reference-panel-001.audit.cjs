'use strict';

// Offline verification, replay and refitting only; no native engine is started.
// Usage: node experiments/balance/results/reference-panel-001.audit.cjs [RESULTS_DIRECTORY]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { validateReferencePlan } = require(path.join(ROOT, 'scripts/balance/reference-plan'));
const { referenceIdentity } = require(path.join(ROOT, 'scripts/balance/reference-collection-run'));
const { makeReferenceReport, markdown } = require(path.join(ROOT, 'scripts/balance/reference-report'));
const { analyzeReferenceDataset } = require(path.join(ROOT, 'scripts/balance/reference-analysis'));
const { createMatchRules } = require(path.join(ROOT, 'dist/balance-rules.cjs'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const COHORTS = ['baseline', 'head', 'combined'];

async function audit(directory = __dirname, onProgress = () => {}) {
  const inputs = {};
  const load = (key, name) => {
    const bytes = fs.readFileSync(path.join(directory, name));
    inputs[key] = { file: name, bytes: bytes.length, sha256: sha(bytes) };
    return bytes;
  };
  const manifest = JSON.parse(load('manifest', 'reference-panel-001.collection.json'));
  const journal = load('games', 'reference-panel-001.games.jsonl').toString('utf8');
  const datasetBytes = load('dataset', 'reference-panel-001.uploaded-dataset.json');
  const summary = JSON.parse(load('summary', 'reference-panel-001.uploaded-summary.json'));
  const uploadedReport = load('report', 'reference-panel-001.uploaded-report.md').toString('utf8');
  assert.ok(journal.endsWith('\n'), 'Complete journal line ending');
  const records = journal.trim().split('\n').map(JSON.parse), plan = validateReferencePlan(manifest.plan);
  assert.equal(manifest.jobs, 4);
  assert.equal(manifest.runId, summary.runId);
  assert.equal(records.length, 2688);
  assert.equal(new Set(records.map(record => record.id)).size, 2688);
  assert.deepEqual(records.map(record => record.id).sort(), plan.schedule.map(game => game.id).sort());
  assert.ok(records.every(record => record.attempt === 1));
  assert.deepEqual(summary, { schemaVersion: 1, runId: manifest.runId, scheduledGames: 2688,
    finishedGames: 2688, statusCounts: { completed: 2687, truncated: 1, aborted: 0, error: 0 } });
  assert.equal(records.filter(record => record.status === 'completed').length, 2687);
  assert.equal(records.filter(record => record.status === 'truncated').length, 1);

  const preflightName = 'reference-panel-preflight-001.json';
  const preflight = JSON.parse(fs.readFileSync(path.join(__dirname, preflightName)));
  assert.equal(plan.book.sha256, preflight.book.sha256);
  assert.deepEqual(plan.openings.map(opening => opening.positionSha256), preflight.selectedOpeningHashes);
  for (const opening of plan.openings) assert.equal(sha(opening.fen.split(' ').slice(0, 4).join(' ')), opening.positionSha256);
  assert.deepEqual(manifest.native, preflight.native);
  const identity = referenceIdentity(path.join(ROOT, 'stockfish/fairy-stockfish-levelup_x86-64.exe'));
  for (const key of Object.keys(identity).filter(key => key !== 'rulesBundleSha256')) {
    assert.deepEqual(manifest.identity[key], identity[key], `Recorded identity ${key}`);
  }
  assert.equal(manifest.engineSha256, identity.engineSha256);
  const rulesText = fs.readFileSync(path.join(ROOT, 'dist/balance-rules.cjs'), 'utf8').replace(/\r\n/g, '\n');
  const rulesRepresentation = manifest.identity.rulesBundleSha256 === sha(rulesText) ? 'LF'
    : manifest.identity.rulesBundleSha256 === sha(rulesText.replace(/\n/g, '\r\n')) ? 'CRLF' : null;
  assert.ok(rulesRepresentation, 'Recorded rules bundle representation');
  assert.equal(manifest.configHash, sha(JSON.stringify({ plan, jobs: manifest.jobs, collectorSha256: manifest.identity.collectorSha256 })));
  assert.equal(manifest.rulesHash, sha(JSON.stringify({ bundle: manifest.identity.rulesBundleSha256, profile: plan.profile, registry: plan.registry })));

  // The normal reporter replays all completed games. Check unscored truncations
  // too, without recategorizing their outcomes or generating replacement games.
  const rules = await createMatchRules({ profile: plan.profile });
  let truncatedPlies = 0;
  for (const record of records.filter(record => record.status === 'truncated')) {
    assert.equal(record.result, '*'); assert.equal(record.reason, 'max-plies');
    assert.equal(record.moves.length, plan.settings.maxPlies);
    const board = rules.createBoard(record.startFen);
    try {
      for (let ply = 0; ply < record.moves.length; ply++) {
        assert.equal(board.outcome(), null);
        assert.equal(board.san(record.moves[ply]), record.sans[ply]);
        assert.equal(board.push(record.moves[ply]), true); truncatedPlies++;
      }
      assert.equal(board.fen(), record.finalFen); assert.equal(board.outcome(), null);
    } finally { board.dispose(); }
  }
  const final = await makeReferenceReport(manifest, records, { checkpoint: 2688, onProgress });
  assert.equal(json(final.dataset), datasetBytes.toString('utf8'), 'Exact uploaded dataset regeneration');
  assert.equal(final.report.coverage.replayedPlies, 301370);
  assert.equal(final.report.coverage.uniqueHistories, 2687);
  assert.equal(final.report.coverage.samples, 25365);
  assert.equal(final.report.coverage.sampledGames, 2677);

  // Reuse the validated full histories for smaller cumulative fits. A game's
  // outcome and eligible windows do not change when later groups are excluded.
  const checkpoints = [];
  for (const checkpoint of plan.study.checkpoints) {
    const ids = new Set(plan.schedule.slice(0, checkpoint).map(game => game.id));
    const data = { ...final.dataset, games: final.dataset.games.filter(game => ids.has(game.gameId)),
      samples: final.samples.filter(sample => ids.has(sample.gameId)) };
    const analysis = checkpoint === 2688 ? final.report.analysis : await analyzeReferenceDataset(data,
      { bootstrap: plan.study.analysis.bootstrap, seed: plan.settings.seed, validationFolds: plan.study.analysis.validationFolds, onProgress });
    const bonuses = Object.fromEntries(COHORTS.map(cohort => [cohort, Object.fromEntries(plan.roster.map(reference => {
      const key = `bonus:${reference.id}`;
      return [key, analysis.primary[cohort].normalized.values?.[key] ?? null];
    }))]));
    checkpoints.push({ checkpoint, samples: data.samples.length, analysisSourceSha256: final.report.analysisIdentity.sha256, bonuses });
  }
  final.report.checkpointHistory = checkpoints;
  assert.equal(markdown(final.report), uploadedReport, 'Exact uploaded Markdown regeneration including checkpoints');
  const allFits = ['primary', 'diagnostic'].flatMap(mode => COHORTS.map(cohort => final.report.analysis[mode][cohort]));
  const outcomeCounts = key => Object.fromEntries([...new Set(records.map(record => record[key]))].sort()
    .map(value => [value, records.filter(record => record[key] === value).length]));
  return { schemaVersion: 1, format: 'levelup-reference-panel-results-audit', recordedDate: '2026-10-25',
    runId: manifest.runId, inputs, auditSourceSha256: sha(fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n')),
    additionalEngineGames: 0,
    provenance: { recordedJobs: 4, sourceCounts: { runner: identity.runnerSources.length, reference: identity.referenceSources.length },
      recordedSourceAndExecutableHashesVerified: true, rulesRepresentation, engineSha256: identity.engineSha256,
      configAndRulesFingerprintsVerified: true, nativeDiagnosticMatchesPreflight: true,
      selectedOpeningsMatchPreflight: true, originalManifestAvailable: true,
      historicalProcessExecutionIndependentlyAttested: false },
    checks: { allScheduledRecordsPresent: true, allRecordedMovesSANAndOutcomesValidate: true,
      allCompleteHistoriesDistinct: true, exactDatasetRegeneration: true,
      exactMarkdownRegeneration: true, allThreeCheckpointEstimatesReproduced: true },
    completion: { scheduled: 2688, completed: 2687, truncated: 1, errors: 0, aborted: 0,
      completedPlies: final.report.coverage.replayedPlies, truncatedPlies, totalPlies: final.report.coverage.replayedPlies + truncatedPlies,
      outcomes: outcomeCounts('result'), terminations: outcomeCounts('reason'),
      allStartsBlackToMove: plan.openings.every(opening => opening.fen.split(' ')[1] === 'b') },
    finalFitDiagnostics: { allFullRank: allFits.every(fit => fit.rank.fullRank), allConverged: allFits.every(fit => fit.fit.converged),
      validBootstrapRatios: allFits.reduce((sum, fit) => sum + fit.bootstrap.validRatios, 0),
      requestedBootstrapFits: allFits.reduce((sum, fit) => sum + fit.bootstrap.requested, 0) },
    finalReport: final.report,
    decision: { status: 'Close at the declared cap. Useful contextual reference comparisons; cohort equivalence not established.',
      nativeValuesChanged: false, purchasePricesChanged: false, pieceMovementsChanged: false,
      furtherGamesScheduled: false, replayTruncatedPair: false },
    limits: [
      'File hashes verify recorded inputs and configuration, not independent attestation of historical processes.',
      'All selected starts have Black to move; related opening ancestry can remain across position groups.',
      'P=1/Q=9 are assumptions; ranges are conditional on this book, sampled windows and engine playing policy.',
      'Every cohort comparison is inconclusive at the declared ±0.5-pawn resolution; this does not establish no cohort effect.',
      'Out-of-fold starting-score predictions extrapolate later-game material effects and omit position-specific tactics.',
      'Prediction-error ranges condition on fixed fold predictions and omit training-refit uncertainty.',
      'The single truncation remains unscored; no replacement games or automatic extension follow.',
    ] };
}

if (require.main === module) {
  if (process.argv.length > 3) { console.error('Usage: node reference-panel-001.audit.cjs [RESULTS_DIRECTORY]'); process.exitCode = 1; }
  else audit(process.argv[2], event => process.stderr.write((typeof event === 'string' ? event : JSON.stringify(event)) + '\n'))
    .then(result => process.stdout.write(json(result))).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { audit };
