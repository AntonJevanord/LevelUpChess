'use strict';

// Reproduce an eight-case snapshot from provenance-enveloped uploaded records.
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
const { FORMAT: ENVELOPE_FORMAT } = require('./level3-panel-journal');
const { createPanelReport, renderPanelReport } = require('./level3-panel-report');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-level3-panel-001';
const TARGET_OPENINGS = 32, COLLECTED_OPENINGS = 8, GAME_COUNT = 2640;
const SOURCES = Object.freeze({
  journal: Object.freeze({ archiveFile: `${PREFIX}.games.jsonl.gz`, archivedSha256: 'cea6f653b9f58054d7b3c81330db29bc1505eedbdf8e5a4ab53067725acc7162', originalName: 'games.jsonl', sha256: '54438ee60dbef72f9863678aea4ff2215fc8baa27dfe60506472b15454f4f6ba', bytes: 10615304 }),
  uploadedReport: Object.freeze({ archiveFile: `${PREFIX}.uploaded-report.md.gz`, archivedSha256: '6c33b9c938fde158a105f308746b1ab7fb1c940bdbbe17bca04242fc277394e7', originalName: 'panel-report.md', sha256: '83f6320607b7cbb3a46d57b0a48a19c7af1d42a8654b210e6dc6ca27f7635b42', bytes: 23293 }),
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

function analyzePanelEnvelopes(envelopes, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Array.isArray(envelopes), 'Panel journal must be an array of provenance envelopes.');
  if (requireComplete) assert.equal(envelopes.length, GAME_COUNT, 'The snapshot must contain every first-batch game exactly once.');
  const stages = plan.NODE_BUDGETS.map(nodes => {
    const declaration = plan.getBatchDeclaration(0, nodes), { config } = declaration, schedule = makeSchedule(config);
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
    const key = `batch-01-n${nodes}`;
    return { key, nodes, batch: 0, config, metadata: declaration.metadata, registry, profile, schedule,
      configSha256: sha(JSON.stringify(config)), records: [], recordedRunId: null };
  });
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
    const identity = JSON.stringify([stage.key, envelope.record.id]);
    assert.ok(!identities.has(identity), 'The snapshot repeats a stage-scoped game or contains conflicting copied attempts.');
    identities.add(identity); stage.records.push(envelope.record);
  }
  const recordedIds = stages.map(stage => stage.recordedRunId).filter(Boolean);
  assert.equal(new Set(recordedIds).size, recordedIds.length, 'Distinct stages reuse the same recorded run ID.');
  for (const stage of stages) {
    if (requireComplete) assert.equal(stage.records.length, 880, 'A node budget lacks its complete first eight openings.');
    const byId = new Map(stage.schedule.map(game => [game.id, game]));
    for (const record of stage.records) validateRecord(record, byId.get(record.id), stage.config, stage.profile);
    // A compatibility descriptor, not an original run manifest. The original
    // recorded stage ID is retained separately and never presented as attested.
    stage.manifest = { config: stage.config, schedule: stage.schedule, designRegistry: stage.registry,
      designProfile: stage.profile, runId: stage.recordedRunId };
  }
  const report = createPanelReport({ manifest: { targetOpenings: TARGET_OPENINGS }, stages, roster: plan.getRoster() });
  if (requireComplete) {
    assert.equal(report.progress.finalizedGames, GAME_COUNT); assert.equal(report.progress.pairedGames, GAME_COUNT);
    assert.equal(report.progress.scheduledGames, 10560);
    assert.ok(report.nodes.every(node => node.progress.completePairs === 440));
  }
  if (uploadedReport !== undefined) assert.equal(renderPanelReport(report), uploadedReport, 'Reconstructed panel differs from the exact uploaded report.');
  return { envelopes, stages, report, declaration: {
    descriptorKind: PROVENANCE.descriptorKind, reportReproducedExactly: uploadedReport !== undefined,
    targetOpenings: TARGET_OPENINGS, collectedOpenings: COLLECTED_OPENINGS, plannedTotalGames: 10560,
    stages: stages.map(stage => ({ key: stage.key, nodes: stage.nodes, configSha256: stage.configSha256,
      metadataSha256: sha(JSON.stringify(stage.metadata)), scheduleSha256: sha(JSON.stringify(stage.schedule)),
      profileHash: stage.profile.hash, registryHash: stage.registry.hash, recordedRunId: stage.recordedRunId,
      originalManifestSupplied: false, nativePreflightSupplied: false })) } };
}

function loadPanelEvidence({ readArchive } = {}) {
  const journal = readPinnedSource(SOURCES.journal, readArchive), uploaded = readPinnedSource(SOURCES.uploadedReport, readArchive);
  assert.equal(journal.at(-1), 10, 'The exact uploaded journal must end with a complete newline.');
  const envelopes = journal.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
  return { ...analyzePanelEnvelopes(envelopes, uploaded.toString('utf8')), sources: SOURCES, provenance: PROVENANCE };
}

function buildPanelAudit() {
  const input = loadPanelEvidence(), roster = plan.getRoster();
  const budgets = input.report.nodes.map(node => {
    const scores = node.matrix.rows.map(row => row.overall.score), average = mean(scores);
    return { nodes: node.nodes, collectedOpenings: node.declaredOpenings, targetOpenings: node.targetOpenings,
      completedGames: node.progress.completedGames, pairedGames: node.progress.pairedGames,
      completePairs: node.progress.completePairs, engine: input.stages.find(stage => stage.nodes === node.nodes).config.engine,
      spread: { mean: average, minimum: Math.min(...scores), maximum: Math.max(...scores),
        populationStandardDeviation: Math.sqrt(mean(scores.map(value => (value - average) ** 2))),
        meanAbsoluteDistanceFromHalf: mean(scores.map(value => Math.abs(value - 0.5))),
        weighting: 'Equal design weights; each overall row equally weights nine opponents and the same eight complete opening/color pairs. The roster mean is 50% by complete round-robin construction.' },
      rows: node.matrix.rows.map(row => ({ key: row.key, name: LABELS[row.key] || row.label, historicalLabel: row.label,
        id: row.id, movement: row.movement, overall: row.overall, ordinary: row.ordinary, opponents: row.cells })) };
  });
  return { schemaVersion: 1, format: 'levelup-v17-level3-panel-upload-evidence', recordedDate: '2026-11-02',
    sources: SOURCES, provenance: PROVENANCE, declaration: input.declaration,
    counts: { uploadedGames: GAME_COUNT, completedGames: GAME_COUNT, pairedGames: GAME_COUNT, completePairs: 1320,
      headGames: 2160, ordinaryAnchorGames: 480, truncatedGames: 0, errors: 0, retries: 0, engineSearches: 0, newMatchGames: 0 },
    roster: roster.map(row => ({ key: row.key, name: LABELS[row.key] || row.label, historicalLabel: row.label,
      id: row.id, family: row.family, movement: row.movement, officialReference: row.officialReference })),
    budgets, sensitivity: input.report.sensitivity,
    limitations: [...PROVENANCE.limitations,
      'This upload is the first complete eight-opening batch of a campaign requesting 32 total openings. It is a checkpoint snapshot, not the final 32-case result.',
      'A complete symmetric round robin has a roster-average score of 50% by construction. Score spread is descriptive and does not establish calibrated material values or universal balance.',
      'The observed spread narrows at 40k and widens again at 80k; increased computation does not produce monotone convergence in this sample.',
      'Each ordinary-army cell contains only sixteen games. Nightrider and Wraith lose some games at every budget but beat the ordinary army overall at every budget.',
      'Search sensitivity uses the same eight opening cases across budgets. Conditional ranges omit broader opening ancestry, search-prior bias and selection after inspecting forty-five head-to-head matchups.',
      'Retain these unchanged records and use new matched cases to evaluate a chosen buff. Alternative names are presentation aliases; original report labels and stable design IDs remain exact.' ] };
}

function renderPanelAudit(audit) {
  const lines = ['# Level-three panel: first eight openings', '',
    'All 2,640 uploaded games completed on attempt 1, forming 1,320 complete color pairs. There are no errors, retries or truncations. Each node budget contains 880 games. This is the first eight-case snapshot of a campaign requesting 32 openings; 7,920 planned games remain outside this upload. The original report reproduces byte-for-byte.', '',
    '| Design | Betza | 20k overall | 40k overall | 80k overall |', '| --- | --- | ---: | ---: | ---: |',
    ...audit.roster.map(row => `| ${row.name} | \`${row.movement}\` | ${audit.budgets.map(budget => percent(budget.rows.find(other => other.id === row.id).overall.score)).join(' | ')} |`), '',
    'Each overall row contains 144 head-to-head games: nine opponents, eight openings and both colors. Ordinary-army anchors are excluded from those means.', '',
    '| Design | 20k ordinary W / D / L (score) | 40k | 80k |', '| --- | :--- | :--- | :--- |',
    ...audit.roster.map(row => `| ${row.name} | ${audit.budgets.map(budget => { const value = budget.rows.find(other => other.id === row.id).ordinary; return `${value.wins} / ${value.draws} / ${value.losses} (${percent(value.score)})`; }).join(' | ')} |`), '',
    'Nightrider and Wraith are the only designs to lose at least one ordinary-army game at all three budgets. They still beat the ordinary army overall at each budget. Sixteen games per anchor are too few for a precise exchange value or a firm search-strength trend.', '',
    '| Nodes | Roster mean | Overall min–max | Population SD (pp) | Mean distance from 50% (pp) |', '| ---: | ---: | :--- | ---: | ---: |',
    ...audit.budgets.map(budget => `| ${budget.nodes} | ${percent(budget.spread.mean)} | ${percent(budget.spread.minimum)}–${percent(budget.spread.maximum)} | ${points(budget.spread.populationStandardDeviation)} | ${points(budget.spread.meanAbsoluteDistanceFromHalf)} |`), '',
    'The mean is exactly 50% by round-robin construction. Scores narrow at 40k, then spread out again at 80k; this is not monotone convergence. Cataphract rises from 59.38% to 54.86% to 66.32%, while Unicorn rises from 46.18% to 47.92% to 56.25%. Pawns, bishops and Amazon are not the only search-sensitive rows. The JSON retains all 45 matched-budget contrasts and their conditional ranges.', '',
    'The two weakest overall rows remain Nightrider and Wraith. This supports a focused design discussion, while the small opening sample and selection after inspecting the table argue for fresh matched cases before accepting a buff. No scored games or engine searches were started during this audit.', '',
    '## Provenance and reproduction', '', ...audit.limitations.map(note => `- ${note}`), '',
    'Exact uploads are preserved as deterministic gzip with archive and original-byte SHA-256. Every stage envelope, config hash, recorded run ID, game identity, starting army, opening prefix, search policy, value profile and move-count/result shape is checked against the reconstructed declaration. These checks do not independently replay legal moves or attest original process identity.', '',
    'Verify with `node scripts/balance/v17-level3-panel-evidence.js`; `--write` regenerates only the derived artifacts. Existing campaign plans, catalogs, bundles and original uploaded bytes stay unchanged.', ''];
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
  console.log('Level-three panel snapshot verified: 2,640 completed games, three node budgets and eight collected openings; no searches or games started.');
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { SOURCES, PROVENANCE, TARGET_OPENINGS, COLLECTED_OPENINGS, GAME_COUNT, analyzePanelEnvelopes,
  loadPanelEvidence, buildPanelAudit, renderPanelAudit, main };
