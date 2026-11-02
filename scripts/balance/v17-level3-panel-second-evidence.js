'use strict';

// Reproduce a sixteen-complete-case cumulative snapshot plus four new pairs.
// The original campaign/stage manifests and native proofs were not supplied.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { declaredStartFen } = require('./reference-panel-evidence');
const { readPinnedSource, PROVENANCE } = require('./v17-acceptance-evidence');
const plan = require('./level3-panel-plan');
const previous = require('./v17-level3-panel-evidence');
const { FORMAT: ENVELOPE_FORMAT } = require('./level3-panel-journal');
const { createPanelReport, renderPanelReport } = require('./level3-panel-report');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-level3-panel-002';
const TARGET_OPENINGS = 32, COLLECTED_OPENINGS = 16, GAME_COUNT = 5288;
const COMPLETE_GAME_COUNT = 5280, PREVIOUS_COUNT = 2640;
const SOURCES = Object.freeze({
  journal: Object.freeze({ archiveFile: `${PREFIX}.games.jsonl.gz`, archivedSha256: '67642074e1b3270550955497f34fb60420b3add89529b7691a44e355b574cb18', originalName: 'games.jsonl', sha256: '9f4b89d4709ed4df62ff467a66a0421a2f60551fee14eb47aa7c21c112f47249', bytes: 21210378 }),
  uploadedReport: Object.freeze({ archiveFile: `${PREFIX}.uploaded-report.md.gz`, archivedSha256: '2269e9b66db9d9d4ec81cbad8875016f2202c80fba0fd9890273f21aa6f04faf', originalName: 'panel-report.md', sha256: '19fa00eddf46076713852d795f3341c136f17123d08c81c424c7cbd89c39ac7d', bytes: 23611 }),
});
const LABELS = Object.freeze({ 'queen-pawn': 'Herald', 'vertical-bishop': 'Inquisitor', 'rook-pawn': 'Ranger',
  'ranged-rook': 'Cataphract', 'xray-queen': 'Wraith', cruisader: 'Crusader' });
const sha = value => createHash('sha256').update(value).digest('hex');
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const points = value => `${(100 * value).toFixed(2)}`;

function validateRecord(record, planned, config, profile) {
  assert.ok(planned, 'Unknown scheduled game in the panel snapshot.');
  assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
  assert.equal(record.attempt, 1, 'The snapshot contains one attempt per game.');
  assert.equal(record.status, 'completed', 'The snapshot contains only completed games.');
  assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
  assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
  assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < 880, 'Invalid worker-local schedule index.');
  const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
  const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
  assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
  assert.equal(record.royalMode, 'king', 'The panel requires ordinary royal kings.');
  assert.equal(record.evaluationCaveat, null, 'Unexpected king-evaluation caveat.');
  assert.deepEqual(record.engineNames, { w: 'Fairy-Stockfish 230826', b: 'Fairy-Stockfish 230826' }, 'Recorded engine names changed.');
  assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Recorded moves must be strings.');
  assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'Recorded SAN and UCI counts differ.');
  assert.ok(Array.isArray(record.openingMoves), 'Recorded opening moves must be an array.');
  assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
  assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
  assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening counts differ.');
  assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded moves do not start with their declared prefix.');
  assert.ok(record.totalPlies <= config.engine.maxPlies, 'Recorded game exceeds the move limit.');
  assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected terminal reason.');
  assert.ok(['1-0', '0-1', '1/2-1/2'].includes(record.result), 'Completed game lacks a scored result.');
  assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
  assert.equal(typeof record.finalFen, 'string', 'Recorded final FEN is missing.');
  const final = record.finalFen.split(' ');
  assert.equal(final.length, 6, 'Recorded final FEN has an unexpected shape.');
  assert.equal(final[1], record.totalPlies % 2 ? 'b' : 'w', 'Recorded final turn disagrees with ply counts.');
  assert.equal(Number(final[5]), Math.floor(record.totalPlies / 2) + 1, 'Recorded final fullmove count disagrees with ply counts.');
}

let previousRecords;
function priorRecords() {
  if (!previousRecords) {
    const raw = readPinnedSource(previous.SOURCES.journal);
    previousRecords = raw.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  }
  return previousRecords;
}
const gameIdentity = row => JSON.stringify([row.stageKey, row.record.id]);
function checkContinuity(envelopes) {
  const byId = new Map(envelopes.map(row => [gameIdentity(row), row]));
  for (const row of priorRecords()) {
    assert.deepEqual(byId.get(gameIdentity(row)), row, 'Previously archived first-eight envelope changed or disappeared.');
  }
  return { previousSnapshot: 'v17-level3-panel-001', previousOriginalSha256: previous.SOURCES.journal.sha256,
    previousGamesRetainedExactly: PREVIOUS_COUNT, newGames: envelopes.length - PREVIOUS_COUNT,
    cumulativeGames: envelopes.length, cumulativeSnapshotsMustNotBeSummed: true };
}
function analyzePanelEnvelopes(envelopes, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Array.isArray(envelopes), 'Panel journal must be an array of provenance envelopes.');
  if (requireComplete) assert.equal(envelopes.length, GAME_COUNT, 'The snapshot must contain all 5288 recorded games exactly once.');
  const stages = [0, 1, 2].flatMap(batch => plan.NODE_BUDGETS.filter(nodes => batch < 2 || nodes === 20000).map(nodes => {
    const declaration = plan.getBatchDeclaration(batch, nodes), { config } = declaration, schedule = makeSchedule(config);
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
    const key = `batch-${String(batch + 1).padStart(2, '0')}-n${nodes}`;
    return { key, nodes, batch, config, metadata: declaration.metadata, registry, profile, schedule,
      expectedRecords: batch < 2 ? 880 : 8, configSha256: sha(JSON.stringify(config)), records: [], recordedRunId: null };
  }));
  const byStage = new Map(stages.map(stage => [stage.key, stage])), identities = new Set();
  for (const envelope of envelopes) {
    assert.ok(envelope && typeof envelope === 'object' && !Array.isArray(envelope), 'Missing provenance envelope.');
    assert.deepEqual(Object.keys(envelope).sort(), ['format', 'record', 'runId', 'schemaVersion', 'stageConfigSha256', 'stageKey'], 'Unexpected envelope fields.');
    assert.equal(envelope.schemaVersion, 1, 'Unexpected envelope schema.');
    assert.equal(envelope.format, ENVELOPE_FORMAT, 'Unexpected envelope format.');
    const stage = byStage.get(envelope.stageKey);
    assert.ok(stage, 'Unknown stage or opening batch in the snapshot.');
    assert.equal(envelope.stageConfigSha256, stage.configSha256, 'Recorded stage config hash changed.');
    assert.ok(typeof envelope.runId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(envelope.runId), 'Missing or invalid recorded stage run ID.');
    if (stage.recordedRunId === null) stage.recordedRunId = envelope.runId;
    else assert.equal(envelope.runId, stage.recordedRunId, 'One stage contains inconsistent recorded run IDs.');
    assert.ok(envelope.record && typeof envelope.record.id === 'string', 'Missing original game record.');
    const identity = gameIdentity(envelope);
    assert.ok(!identities.has(identity), 'The snapshot repeats a stage-scoped game or contains conflicting copied attempts.');
    identities.add(identity); stage.records.push(envelope.record);
  }
  const recordedIds = stages.map(stage => stage.recordedRunId).filter(Boolean);
  assert.equal(new Set(recordedIds).size, recordedIds.length, 'Distinct stages reuse the same recorded run ID.');
  for (const stage of stages) {
    if (requireComplete) assert.equal(stage.records.length, stage.expectedRecords, 'A stage differs from the pinned completed/partial game count.');
    const byId = new Map(stage.schedule.map(game => [game.id, game]));
    for (const record of stage.records) validateRecord(record, byId.get(record.id), stage.config, stage.profile);
    // Compatibility descriptor only; original manifests/native proofs are absent.
    stage.manifest = { config: stage.config, schedule: stage.schedule, designRegistry: stage.registry,
      designProfile: stage.profile, runId: stage.recordedRunId };
  }
  const continuity = checkContinuity(envelopes);
  const report = createPanelReport({ manifest: { targetOpenings: TARGET_OPENINGS }, stages, roster: plan.getRoster() });
  const balancedReport = createPanelReport({ manifest: { targetOpenings: TARGET_OPENINGS },
    stages: stages.filter(stage => stage.batch < 2), roster: plan.getRoster() });
  for (const node of report.nodes) {
    const balanced = balancedReport.nodes.find(row => row.nodes === node.nodes);
    assert.deepEqual(node.matrix.rows.map(row => row.overall), balanced.matrix.rows.map(row => row.overall),
      'Extra partial-batch games must not affect shared-complete-case overall scores.');
  }
  if (requireComplete) {
    assert.equal(report.progress.finalizedGames, GAME_COUNT); assert.equal(report.progress.pairedGames, GAME_COUNT);
    assert.equal(report.progress.scheduledGames, 10560);
    assert.deepEqual(report.nodes.map(node => node.progress.completePairs), [884, 880, 880]);
    assert.ok(report.nodes.every(node => node.matrix.rows.every(row => row.overall.openingCoverage.shared === COLLECTED_OPENINGS)));
  }
  if (uploadedReport !== undefined) assert.equal(renderPanelReport(report), uploadedReport, 'Reconstructed panel differs from the exact uploaded report.');
  return { envelopes, stages, report, balancedReport, continuity, declaration: {
    descriptorKind: PROVENANCE.descriptorKind, reportReproducedExactly: uploadedReport !== undefined,
    targetOpenings: TARGET_OPENINGS, sharedCompleteOpenings: COLLECTED_OPENINGS, plannedTotalGames: 10560,
    stages: stages.map(stage => ({ key: stage.key, nodes: stage.nodes, batch: stage.batch, recordedGames: stage.records.length,
      expectedGames: stage.expectedRecords, configSha256: stage.configSha256,
      metadataSha256: sha(JSON.stringify(stage.metadata)), scheduleSha256: sha(JSON.stringify(stage.schedule)),
      profileHash: stage.profile.hash, registryHash: stage.registry.hash, recordedRunId: stage.recordedRunId,
      originalManifestSupplied: false, nativePreflightSupplied: false })) } };
}

function loadPanelEvidence({ readArchive } = {}) {
  const journal = readPinnedSource(SOURCES.journal, readArchive), uploaded = readPinnedSource(SOURCES.uploadedReport, readArchive);
  assert.equal(journal.at(-1), 10, 'The exact uploaded journal must end with a complete newline.');
  assert.equal(sha(journal.subarray(0, previous.SOURCES.journal.bytes)), previous.SOURCES.journal.sha256,
    'The cumulative journal no longer has the exact original first-eight byte prefix.');
  const envelopes = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzePanelEnvelopes(envelopes, uploaded.toString('utf8')), sources: SOURCES, provenance: PROVENANCE };
}

function buildPanelAudit() {
  const input = loadPanelEvidence(), roster = plan.getRoster();
  const budgets = input.report.nodes.map(node => {
    const scores = node.matrix.rows.map(row => row.overall.score), average = mean(scores);
    return { nodes: node.nodes, declaredOpenings: node.declaredOpenings, sharedCompleteOpenings: COLLECTED_OPENINGS,
      targetOpenings: node.targetOpenings, completedGames: node.progress.completedGames, pairedGames: node.progress.pairedGames,
      completePairs: node.progress.completePairs,
      spread: { mean: average, minimum: Math.min(...scores), maximum: Math.max(...scores),
        populationStandardDeviation: Math.sqrt(mean(scores.map(value => (value - average) ** 2))),
        meanAbsoluteDistanceFromHalf: mean(scores.map(value => Math.abs(value - 0.5))),
        weighting: 'Equal design weights; shared-complete opening cases across all nine opponents only.' },
      rows: node.matrix.rows.map(row => ({ key: row.key, name: LABELS[row.key] || row.label, historicalLabel: row.label,
        id: row.id, movement: row.movement, overall: row.overall, ordinary: row.ordinary, opponents: row.cells })) };
  });
  const extraStage = input.stages.find(stage => stage.batch === 2);
  const extraIds = new Set(extraStage.records.map(row => row.id));
  const extraEnvelopes = input.envelopes.filter(row => row.stageKey === extraStage.key && extraIds.has(row.record.id));
  const balancedHeadGames = input.stages.filter(stage => stage.batch < 2).reduce((sum, stage) => sum
    + stage.records.filter(record => stage.metadata.comparisons.find(row => row.id === record.comparisonId).kind === 'head').length, 0);
  return { schemaVersion: 1, format: 'levelup-v17-level3-panel-second-upload-evidence', recordedDate: '2026-11-02',
    sources: SOURCES, provenance: PROVENANCE, declaration: input.declaration, continuity: input.continuity,
    counts: { cumulativeUploadedGames: GAME_COUNT, newlyUploadedGames: GAME_COUNT - PREVIOUS_COUNT,
      previousGamesRetainedExactly: PREVIOUS_COUNT, completedGames: GAME_COUNT, pairedGames: GAME_COUNT, completePairs: 2644,
      balancedSixteenCaseGames: COMPLETE_GAME_COUNT, balancedHeadGames, balancedOrdinaryAnchorGames: COMPLETE_GAME_COUNT - balancedHeadGames,
      extraThirdBatchGames: 8, truncatedGames: 0, errors: 0, retries: 0, engineSearches: 0, newMatchGames: 0 },
    extraStage: { key: extraStage.key, nodes: extraStage.nodes, games: extraStage.records.length,
      openingIds: [...new Set(extraStage.records.map(row => row.openingId))].sort(),
      comparisons: [...new Set(extraStage.records.map(row => row.comparisonId))].sort(),
      originalEnvelopes: extraEnvelopes,
      includedInMatchingCells: true, includedInSixteenCaseOverall: false },
    roster: roster.map(row => ({ key: row.key, name: LABELS[row.key] || row.label,
      id: row.id, family: row.family, movement: row.movement, officialReference: row.officialReference })),
    budgets, sensitivity: input.report.sensitivity,
    limitations: [...PROVENANCE.limitations,
      'This is a cumulative snapshot, not an additional 5288 independent games. It retains the original 2640 games exactly and adds 2648 new records.',
      'Six stages are complete: sixteen shared openings at every node budget. Eight completed 20k games from the third batch update four individual cells, but do not enter shared-sixteen-case overall rows.',
      'The campaign still requests 32 openings and 10560 games. No result from this checkpoint is the final 32-case estimate.',
      'A full symmetric round robin has a roster-average score of 50% by construction; average convergence alone does not demonstrate balance.',
      'Conditional opening-block ranges omit broader opening ancestry, search-prior bias and post-selection after reviewing many matchups.' ] };
}

function renderPanelAudit(audit) {
  const lines = ['# Level-three panel: sixteen complete openings', '',
    'The cumulative upload contains **5,288 completed games**, all on attempt 1: six full 880-game stages (5,280 games), plus eight completed 20k games in the third batch. These form 2,644 scored color pairs, with no errors, retries or truncations. The original report reproduces byte-for-byte.', '',
    '**2,640 games are retained exactly from snapshot001, and 2,648 are new. Do not add the cumulative snapshots together.** The first 10,615,304 original bytes have the same pinned SHA-256 as the first upload; every earlier stage-scoped envelope is also compared without changing any field.', '',
    '## Shared sixteen-case overall scores', '',
    '| Design | Betza | 20k | 40k | 80k |', '| --- | --- | ---: | ---: | ---: |',
    ...audit.roster.map(row => `| ${row.name} | \`${row.movement}\` | ${audit.budgets.map(budget => percent(budget.rows.find(other => other.id === row.id).overall.score)).join(' | ')} |`), '',
    'Every overall row uses the same sixteen fully scored opening cases, both colors and nine equally weighted opponents: 288 head-to-head games per piece and budget. Ordinary-army anchors are separate. The eight extra games from the next batch do not affect these overall rows.', '',
    '| Nodes | Completed games | Shared overall cases | Declared cases | Roster min–max | Population SD (pp) |', '| ---: | ---: | ---: | ---: | :--- | ---: |',
    ...audit.budgets.map(budget => `| ${budget.nodes} | ${budget.completedGames} | ${budget.sharedCompleteOpenings} | ${budget.declaredOpenings} | ${percent(budget.spread.minimum)}–${percent(budget.spread.maximum)} | ${points(budget.spread.populationStandardDeviation)} |`), '',
    'The 20k report declares 24 cases because the third stage has begun. Its four updated head-to-head cells contain seventeen cases; the remaining cells generally contain sixteen. The root overall rows require all opponents to finish a case and therefore remain at sixteen. The JSON retains the exact eight extra envelopes and their affected cells.', '',
    '| Design | 20k ordinary W / D / L (score) | 40k | 80k |', '| --- | :--- | :--- | :--- |',
    ...audit.roster.map(row => `| ${row.name} | ${audit.budgets.map(budget => { const value = budget.rows.find(other => other.id === row.id).ordinary; return `${value.wins} / ${value.draws} / ${value.losses} (${percent(value.score)})`; }).join(' | ')} |`), '',
    '## Provenance and reproduction', '', ...audit.limitations.map(note => `- ${note}`), '',
    'Exact uploads are losslessly preserved with compressed and original-byte SHA-256 pins. Envelopes, config hashes, recorded run IDs, scheduled game identities, starts, opening prefixes, search/evaluation policies, SAN/move counts and result shapes match reconstructed declarations. Original manifests and native proofs were not supplied. No legal-move replay, executable attestation, scored games or engine searches were performed.', '',
    'Verify with `node scripts/balance/v17-level3-panel-second-evidence.js`; `--write` refreshes derived artifacts only. The first snapshot, existing campaign plans, catalog and rule bundles remain unchanged.', ''];
  return lines.join('\n');
}
function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = buildPanelAudit(), input = loadPanelEvidence();
  const artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderPanelAudit(audit)], [`${PREFIX}.original-report.md`, renderPanelReport(input.report)]];
  for (const [name, content] of artifacts) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${name}.`);
  }
  console.log('Second panel snapshot verified: 5288 cumulative completions, 2648 new records and sixteen complete shared cases; no searches or games started.');
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { SOURCES, PROVENANCE, TARGET_OPENINGS, COLLECTED_OPENINGS, GAME_COUNT, COMPLETE_GAME_COUNT, PREVIOUS_COUNT,
  analyzePanelEnvelopes, loadPanelEvidence, buildPanelAudit, renderPanelAudit, main };
