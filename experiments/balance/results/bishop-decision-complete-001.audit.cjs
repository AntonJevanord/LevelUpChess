'use strict';

// Offline verification of the supplied final decision evidence. This starts
// no native engine, new game, or material regression.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { getDecisionProtocol, validateDecisionPlan, validateDecisionStage } = require('../../../scripts/balance/bishop-decision-plan');
const { makeDecisionReport, markdown } = require('../../../scripts/balance/bishop-decision-report');
const { recoverRevisionRecords } = require('../../../scripts/balance/reference-matrix');
const { requireOfficialReferenceValues } = require('../../../scripts/balance/official-references');
const { createMatchRules } = require('../../../dist/balance-rules.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const BASENAME = 'bishop-decision-complete-001';
const HISTORICAL_COMMIT = '6eeb93957c289e2d03dff67f1e1eb14a1805d4f6';
const INPUTS = {
  games: { suffix: 'games.jsonl', bytes: 4361009, sha256: 'e36ae6d3e25901bd283c087380cc0a0d5cfef81953b60bf85a1b1e7e6b6377c8', gzipSha256: '32354a18094cb4480b8f2714458190432bd3bb2d43f863f48b0d6b59a0ca4e74' },
  collection: { suffix: 'collection.json', bytes: 1161297, sha256: '76eeb80950661b45c0642c7a72837042f2264e0a50571a57a6a92db1a83f335f', gzipSha256: '286d129accc554ede1071c0deba6a096736f917f4f317697bf0f8284e60f5879' },
  campaign: { suffix: 'campaign.json', bytes: 8873684, sha256: 'efb180d7addbbb55f2c2267bf7e8c7e639145862486f9ec936df40dac0b43257', gzipSha256: '76095f1d6196cd7e913653d05512c1d53bccdfdbe008cb1354cdf98f9c24ae5c' },
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = value => sha(JSON.stringify(value));
const read = file => fs.readFileSync(path.join(__dirname, file));
function archived(input) {
  const file = `${BASENAME}.${input.suffix}.gz`, compressed = read(file), bytes = zlib.gunzipSync(compressed);
  assert.equal(sha(compressed), input.gzipSha256, `Compressed ${input.suffix} changed.`);
  assert.equal(bytes.length, input.bytes);
  assert.equal(sha(bytes), input.sha256, `Original ${input.suffix} changed.`);
  return { bytes, metadata: { file, compressedBytes: compressed.length, compressedSha256: sha(compressed),
    originalBytes: bytes.length, originalSha256: sha(bytes) } };
}
function journal(bytes) {
  assert.equal(bytes.at(-1), 10, 'The journal must end with a complete newline.');
  return bytes.toString('utf8').trim().split('\n').map(JSON.parse);
}
function historical(file) {
  return execFileSync('git', ['show', `${HISTORICAL_COMMIT}:${path.posix.normalize(file)}`], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
}
function verifySourceIdentity(identity) {
  assert.equal(identity.runnerSources.length, 13); assert.equal(identity.decisionSources.length, 39);
  assert.equal(fingerprint(identity.runnerSources), identity.runnerSha256);
  assert.equal(fingerprint(identity.decisionSources), identity.decisionSha256);
  assert.equal(identity.collectorSha256, identity.decisionSha256);
  const checked = [];
  for (const [kind, sources] of [['runner', identity.runnerSources], ['decision', identity.decisionSources]]) {
    for (const source of sources) {
      const file = path.posix.normalize(kind === 'runner' ? `scripts/balance/${source.file}` : source.file);
      assert.equal(sha(historical(file).toString('utf8').replace(/\r\n/g, '\n')), source.sha256, `Historical ${file} differs.`);
      checked.push({ kind, file, sha256: source.sha256 });
    }
  }
  const bundle = historical('dist/balance-rules.cjs');
  const windowsBundle = Buffer.from(bundle.toString('utf8').replace(/\r?\n/g, '\r\n'));
  assert.equal(sha(windowsBundle), identity.rulesBundleSha256, 'Recorded Windows rules bundle differs beyond LF/CRLF.');
  const engine = historical('stockfish/fairy-stockfish-levelup_x86-64.exe');
  assert.equal(sha(engine), identity.engineSha256);
  return { historicalCommit: HISTORICAL_COMMIT, normalizedRunnerSources: 13, normalizedDecisionSources: 39,
    sourceDeclarationsSha256: fingerprint(checked), allDeclaredSourcesMatch: true,
    rulesBundle: { repositoryLfSha256: sha(bundle), recordedWindowsCrlfSha256: sha(windowsBundle), onlyLineEndingsDiffer: true },
    windowsEngineSha256: sha(engine) };
}
async function replay(context, records, profile) {
  const rules = await createMatchRules({ profile }), pairs = new Map(); let plies = 0;
  for (let index = 0; index < records.length; index++) {
    const row = records[index];
    assert.equal(row.profileHash, profile.hash); assert.equal(row.registryHash, profile.registryHash);
    assert.equal(row.variant, profile.variant); assert.equal(row.status, 'completed'); assert.equal(row.attempt, 1);
    assert.equal(row.moves.length, row.sans.length); assert.equal(row.totalPlies, row.moves.length);
    assert.equal(row.playedPlies, row.moves.length); assert.equal(row.openingPlies, 0); assert.deepEqual(row.openingMoves, []);
    assert.ok(row.moves.length <= 400); assert.equal(row.royalMode, 'king'); assert.equal(row.evaluationCaveat, null);
    assert.deepEqual(row.evaluation, profile.evaluation);
    assert.deepEqual(row.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
    assert.deepEqual(row.whiteStrength, { skill: 20 }); assert.deepEqual(row.blackStrength, { skill: 20 });
    const board = rules.createBoard(row.startFen);
    try {
      for (let ply = 0; ply < row.moves.length; ply++) {
        assert.equal(board.outcome(), null, `${context}: terminal before ${row.id}, ply ${ply + 1}.`);
        assert.equal(board.san(row.moves[ply]), row.sans[ply], `${context}: SAN ${row.id}, ply ${ply + 1}.`);
        assert.equal(board.push(row.moves[ply]), true, `${context}: illegal ${row.id}, ply ${ply + 1}.`);
      }
      assert.equal(board.fen(), row.finalFen);
      assert.deepEqual(board.outcome(), { result: row.result, reason: row.reason });
    } finally { board.dispose(); }
    plies += row.moves.length;
    const colors = pairs.get(row.pairId) || []; colors.push(row.aColor); pairs.set(row.pairId, colors);
    if ((index + 1) % 128 === 0 || index + 1 === records.length) console.log(`${context}: replayed ${index + 1}/${records.length} games and ${plies} plies; no searches.`);
  }
  for (const colors of pairs.values()) assert.deepEqual(colors.sort(), ['b', 'w']);
  return { context, games: records.length, completePairs: pairs.size, legalPlies: plies,
    profileHash: profile.hash, recordsSha256: fingerprint(records) };
}
async function main() {
  const inputs = Object.fromEntries(Object.entries(INPUTS).map(([key, input]) => [key, archived(input)]));
  const campaign = JSON.parse(inputs.campaign.bytes), collection = JSON.parse(inputs.collection.bytes), records = journal(inputs.games.bytes);
  const library = getDecisionProtocol();
  validateDecisionPlan(campaign.plan); validateDecisionStage(collection.plan);
  assert.equal(campaign.schemaVersion, 1); assert.equal(campaign.format, 'levelup-bishop-decision-campaign');
  assert.equal(collection.schemaVersion, 1); assert.equal(collection.format, 'levelup-head-collection');
  assert.equal(campaign.jobs, 4); assert.equal(collection.jobs, 4);
  assert.deepEqual(collection.plan, campaign.plan.stages.find(stage => stage.key === 'compare').plan);
  assert.deepEqual(collection.identity, campaign.identity); assert.deepEqual(collection.native, campaign.native.compare);
  assert.equal(collection.engineSha256, campaign.engineSha256); assert.equal(campaign.engineSha256, campaign.identity.engineSha256);
  assert.equal(collection.configHash, fingerprint({ plan: collection.plan, jobs: 4, collectorSha256: collection.identity.collectorSha256 }));
  assert.equal(collection.rulesHash, fingerprint({ bundle: collection.identity.rulesBundleSha256, profile: collection.plan.profile, registry: collection.plan.registry }));
  assert.equal(campaign.plan.totalGames, 1280); assert.equal(campaign.plan.stages[0].plan.schedule.length, 0);
  assert.equal(records.length, 1280); assert.equal(new Set(records.map(row => row.id)).size, 1280);
  const scheduled = new Map(collection.plan.schedule.map(game => [game.id, game]));
  for (const row of records) {
    const game = scheduled.get(row.id); assert.ok(game, `Foreign decision game ${row.id}.`);
    for (const field of ['id', 'unitId', 'pairId', 'kind', 'comparisonId', 'openingId', 'aColor', 'designA', 'designB', 'whiteDesign', 'blackDesign', 'startFen', 'openingMoves']) assert.deepEqual(row[field], game[field]);
  }
  const sourceIdentity = verifySourceIdentity(campaign.identity);
  await requireOfficialReferenceValues({ pieceValues: async () => collection.native.pieceValues }, collection.plan.profile);
  assert.equal(collection.native.startingPositions, 1280); assert.equal(collection.native.capabilityProbes, 120);
  assert.equal(collection.native.roleProbes, 2); assert.equal(collection.native.searchesStarted, 0);
  assert.equal(collection.native.compatibility.passed, true);
  assert.equal(collection.native.compatibility.inventoryMatches, true);
  assert.equal(collection.native.compatibility.staticEvaluation.matching, true);
  assert.equal(collection.native.compatibility.legalMoves.matching, true);
  const rawSources = new Map(campaign.plan.sourceEvidence.filter(item => item.name !== 'retained-revisions.games.jsonl').map(item => [item.name, fs.readFileSync(path.resolve(ROOT, item.file))]));
  rawSources.set('retained-revisions.games.jsonl', zlib.gunzipSync(read('reference-revisions-retained-001.games.jsonl.gz')));
  for (const item of campaign.plan.sourceEvidence) assert.equal(sha(rawSources.get(item.name)), item.sha256, `Source ${item.name} differs.`);
  const restored = recoverRevisionRecords([{ file: 'retained-revisions.games.jsonl', records: journal(rawSources.get('retained-revisions.games.jsonl')) }]).records;
  assert.deepEqual(restored, campaign.plan.restoredRecords);
  const bishop = journal(rawSources.get('bishop.games.jsonl')).filter(row => ['bishop.purple@7', 'bishop.purple@12'].includes(row.designA));
  assert.deepEqual(bishop, campaign.plan.inheritedBishopRecords);
  assert.equal(restored.length, 512); assert.equal(bishop.length, 512);
  console.log('Input, manifest, source identities and recorded diagnostics verified. Replaying all 2304 relevant histories.');
  const replayed = [];
  replayed.push(await replay('new-compare', records, collection.plan.profile));
  replayed.push(await replay('inherited-bishop', bishop, library.old.profile));
  replayed.push(await replay('restored-revision', restored, library.revision.profile));
  assert.equal(replayed[0].legalPlies, 151488);
  assert.deepEqual(campaign.sourceReplay.sources, replayed.slice(1).map(({ context, games, legalPlies, profileHash, recordsSha256 }) => ({ context, games, plies: legalPlies, profileHash, recordsSha256 })));
  const report = makeDecisionReport({ plan: campaign.plan, stageRecords: { compare: records }, bootstrap: 200 });
  const markdownBytes = Buffer.from(markdown(report));
  assert.equal(markdownBytes.toString(), read('bishop-decision-final-001.uploaded-report.md').toString('utf8').replace(/\r\n/g, '\n'));
  assert.equal(report.coverage.pairedGames, 2304); assert.equal(report.coverage.scoredPairs, 1152);
  const output = {
    schemaVersion: 1, format: 'levelup-complete-bishop-decision-audit', recordedDate: '2026-10-27',
    inputs: Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.metadata])),
    campaignRunId: campaign.runId, comparisonRunId: collection.runId, sourceIdentity,
    checks: { uploadedManifestsAndCanonicalPlansAgree: true, allSourceEvidenceHashesMatch: true,
      newProfileRegistryAndEvaluationMatch: true, recordedNativeInventoriesAndCompatibilityPassed: true,
      newReferenceValueTablesMatchFrozenRoster: true, inheritedHistoriesMatchRawArchives: true,
      all2304RelevantHistoriesReplay: true, allNineScoresAndConditionalIntervalsReproduceUploadedMarkdown: true,
      historicalInheritedProcessManifestsSupplied: false, newNativeSearchesStarted: false, materialFitsComputedByThisAudit: false },
    recordedNative: { startingPositions: 1280, capabilityProbes: 120, roleProbes: 2,
      compatibilityStaticPositions: collection.native.compatibility.staticEvaluation.positions,
      compatibilityLegalPositions: collection.native.compatibility.legalMoves.positions },
    replayed, relevantGames: 2304, legalPlies: replayed.reduce((sum, source) => sum + source.legalPlies, 0),
    regeneratedDecisionMarkdownSha256: sha(markdownBytes),
    matchups: report.matchups.map(({ designA, designB, games, pairs, wins, draws, losses, score, interval }) => ({ designA, designB, games, pairs, wins, draws, losses, score, interval })),
    engineSearches: 0, newMatchGames: 0,
    limitations: [
      'Recorded new-process source and engine identities match historical repository artifacts, including Windows CRLF rules bytes. Recorded diagnostics are verified for internal consistency; this audit does not rerun native diagnostics or search.',
      'Historical inherited game process manifests remain absent. Raw identities, legal replay and bounded recorded compatibility do not establish universal process or search equivalence.',
      'Reproduced intervals condition on the fixed 128 selected opening groups and recorded playing contexts; they are not universal balance guarantees.'
    ]
  };
  const text = JSON.stringify(output, null, 2) + '\n', file = path.join(__dirname, `${BASENAME}.audit.json`);
  if (process.argv.includes('--write')) fs.writeFileSync(file, text);
  else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), text);
  console.log(`Complete bishop decision audit passed: 2304 histories, ${output.legalPlies} legal plies, exact final score report; no searches.`);
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
