'use strict';

// Offline verification of the exact queen and restricted-pawn uploads. This
// starts no engines, changes no outcomes and does not rewrite earlier evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readPinned, parseJournal } = require('./v19-trial-evidence');
const { declaredStartFen } = require('./reference-panel-evidence');
const { ensureResearchOverlay } = require('./research-overlay');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v19-selection-001';
const SOURCES_SHA256 = 'f8cba66ef121038cce8914a40f723b161500c36b036b8aa7e974591911a40d69';
const ENGINE_SHA256 = '848ad74c3fbc2684e57b42c581ee94e93e5ed832fb536846a37f9dddebbb8b16';
const STUDIES = Object.freeze(['queens', 'pawns2']);
const PLANS = Object.freeze({
  queens: Object.freeze({ internalStudy: 'level1', entryFile: 'scripts/v19-trials.js',
    definitionFile: 'src/balance-designs-v19-trials.js', planModule: 'v19-trial-plan' }),
  pawns2: Object.freeze({ internalStudy: 'level2', entryFile: 'scripts/v19-pawn-followup.js',
    definitionFile: 'src/balance-designs-v19-pawn-followup.js', planModule: 'v19-pawn-followup-plan' }),
});
const PROVENANCE = Object.freeze({
  originalCampaignManifestsSupplied: false, originalStageManifestsSupplied: false,
  originalRuntimeSnapshotsSupplied: false, nativePreflightSupplied: false,
  originalExecutableIndependentlyVerified: false, fullGameMovesIndependentlyReplayed: false,
  recordedEngineSha256: ENGINE_SHA256,
  descriptorKind: 'Derived v0.19.2 declaration compatibility descriptors, not original execution manifests.',
  limitations: [
    'Original run manifests, owned runtimes, archived INI files and native-preflight proofs were not supplied. Reconstructed descriptors establish declaration compatibility, not original execution provenance.',
    'The journals report Fairy-Stockfish 230826 and its executable hash. This offline review does not independently inspect that executable or attest its native value tables.',
    'Every forced opening and stored opening FEN is independently replayed with the frozen browser rules. Full game continuations and their reported outcomes are not independently replayed.',
    'The thirty-two related fixed opening cases, forced-prefix protocol and fixed search priors limit generalization. Conditional ranges do not include engine or protocol bias; scores are not material values.',
    'The selected designs reflect the user\'s preference for movement identity and readability. The results do not establish exact balance or justify changing any recorded score.',
  ],
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = text => text.replace(/\r\n/g, '\n');
const tables = text => normalized(text).split('\n').filter(line => line.startsWith('| '));
const pct = value => `${(value * 100).toFixed(2)}%`;

function sources() {
  const text = normalized(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Selection source pins changed.');
  const pins = JSON.parse(text);
  assert.equal(pins.format, 'levelup-v19-selection-source-pins'); assert.equal(pins.targetOpenings, 32);
  return pins;
}
function planTools(study) {
  assert.ok(STUDIES.includes(study));
  const settings = PLANS[study];
  const overlay = ensureResearchOverlay({ name: `v19-selection-${study}-reader`, entryFile: settings.entryFile,
    definitionFile: settings.definitionFile });
  return require(path.join(overlay.directory, 'scripts/balance', settings.planModule));
}
function validateRecord(record, planned, descriptor) {
  assert.ok(planned, 'Unknown scheduled uploaded game.');
  assert.equal(record.schemaVersion, 1); assert.equal(record.attempt, 1, 'Unexpected uploaded retry.');
  for (const field of ['id', 'pairId', 'comparisonId', 'openingId', 'repetition', 'aColor', 'openingMoves']) assert.deepEqual(record[field], planned[field], `Recorded ${field} changed.`);
  const { config } = descriptor.declaration, profile = descriptor.compatibility.designProfile;
  const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
  const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
  assert.equal(record.comparisonLabel, planned.comparison.label);
  assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Starting army changed.');
  assert.equal(record.profileHash, profile.hash); assert.equal(record.registryHash, descriptor.compatibility.designRegistry.hash);
  assert.equal(record.variant, profile.variant); assert.equal(record.registryReference, 'run.json#designRegistry');
  assert.deepEqual(record.engine, config.engine, 'Recorded search budget changed.');
  assert.deepEqual(record.evaluation, config.evaluation, 'Recorded search priors changed.');
  assert.deepEqual(record.whiteStrength, { skill: 20 }); assert.deepEqual(record.blackStrength, { skill: 20 });
  assert.deepEqual(record.engineNames, { w: 'Fairy-Stockfish 230826', b: 'Fairy-Stockfish 230826' });
  assert.equal(record.royalMode, 'king'); assert.equal(record.evaluationCaveat, null);
  assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < descriptor.compatibility.schedule.length);
  assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'));
  assert.equal(record.totalPlies, record.moves.length); assert.equal(record.sans.length, record.totalPlies);
  assert.equal(record.openingPlies, record.openingMoves.length); assert.equal(record.playedPlies + record.openingPlies, record.totalPlies);
  assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded prefix changed.');
  assert.ok(record.totalPlies <= config.engine.maxPlies);
  const fields = record.finalFen.split(' ');
  assert.equal(fields.length, 6); assert.equal(fields[1], record.totalPlies % 2 ? 'b' : 'w');
  assert.equal(Number(fields[5]), Math.floor(record.totalPlies / 2) + 1);
  assert.equal(record.status, 'completed'); assert.ok(['1-0', '0-1', '1/2-1/2'].includes(record.result));
  assert.ok(['checkmate', 'stalemate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule'].includes(record.reason));
  assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate');
  if (record.reason === 'checkmate') assert.equal(record.result, fields[1] === 'w' ? '0-1' : '1-0');
  assert.ok(Number.isFinite(Date.parse(record.startedAt)) && Date.parse(record.finishedAt) >= Date.parse(record.startedAt));
}
async function replayOpenings(stages) {
  let prefixes = 0;
  for (const stage of stages) {
    const rules = await require('../../dist/balance-rules.cjs').createMatchRules({ profile: stage.manifest.designProfile });
    for (const record of stage.records) {
      const board = rules.createBoard(record.startFen);
      try {
        for (const move of record.openingMoves) assert.ok(board.push(move), `Illegal uploaded prefix: ${record.id}.`);
        assert.equal(board.fen(), record.openingEvaluation.fen, 'Stored opening position differs from replay.');
        assert.equal(board.outcome(), null, 'The forced prefix is already terminal.'); prefixes++;
      } finally { board.dispose(); }
    }
  }
  return { prefixesIndependentlyReplayed: prefixes, fullGameContinuationsIndependentlyReplayed: 0 };
}
async function analyzeStudy(study, inputs, descriptors, uploadedReport, plan = planTools(study)) {
  assert.ok(STUDIES.includes(study)); assert.equal(inputs.length, 4);
  const internalStudy = PLANS[study].internalStudy, seen = new Set();
  const stages = inputs.map(input => {
    assert.ok(!seen.has(input.batchIndex), 'Duplicate uploaded batch.'); seen.add(input.batchIndex);
    const descriptor = descriptors.stages.find(row => row.study === study && row.batchIndex === input.batchIndex);
    assert.ok(descriptor, 'Unexpected uploaded batch.'); assert.equal(input.nodes, 40000);
    assert.equal(descriptor.internalStudy, internalStudy);
    assert.deepEqual(descriptor.declaration, plan.getBatchDeclaration(internalStudy, input.batchIndex));
    const planned = new Map(descriptor.compatibility.schedule.map(row => [row.id, row])), ids = new Set();
    for (const record of input.records) {
      assert.ok(!ids.has(record.id), 'Duplicate uploaded game/attempt.'); ids.add(record.id);
      validateRecord(record, planned.get(record.id), descriptor);
    }
    assert.equal(ids.size, planned.size, 'An uploaded batch is incomplete.');
    return { ...input, descriptor, manifest: { runId: null, config: descriptor.declaration.config, ...descriptor.compatibility } };
  }).sort((a, b) => a.batchIndex - b.batchIndex);
  const report = plan.reportStudy({ study: internalStudy, targetOpenings: 32, identity: { engineSha256: ENGINE_SHA256 } }, stages);
  for (const category of ['invalid', 'missing', 'unavailable', 'mate']) assert.equal(report.openingEvaluations.counts[category], 0, `Unexpected ${category} opening observations.`);
  assert.deepEqual(tables(plan.renderReport(report)), tables(uploadedReport), 'Uploaded numeric report tables differ.');
  assert.ok(uploadedReport.includes(`${report.scheduledGames} scheduled games; ${report.progress.finalizedGames} finalized; ${report.progress.completePairs} scored color pairs.`));
  const records = stages.flatMap(stage => stage.records), replay = await replayOpenings(stages);
  return { study, internalStudy, stages, report, replay, uploadedNumericTablesReproducedExactly: true,
    counts: { attempts: records.length, finalizedGames: records.length, completedGames: records.length,
      truncatedGames: 0, errors: 0, retries: 0, completePairs: report.progress.completePairs, pairedGames: report.progress.completePairs * 2 } };
}
async function loadEvidence({ readArchive } = {}) {
  const pins = sources(), descriptors = JSON.parse(readPinned(pins.declarations, readArchive));
  assert.equal(descriptors.format, 'levelup-v19-selection-derived-declarations'); assert.equal(descriptors.baseTag, 'v0.19.2');
  assert.equal(descriptors.targetOpenings, 32); assert.equal(descriptors.stages.length, 8);
  const studies = [];
  for (const study of STUDIES) {
    const source = pins.studies[study]; assert.equal(source.internalStudy, PLANS[study].internalStudy);
    assert.equal(source.planModule, PLANS[study].planModule);
    const inputs = source.journals.map(pin => ({ batchIndex: pin.batchIndex, nodes: pin.nodes, records: parseJournal(readPinned(pin, readArchive)) }));
    studies.push(await analyzeStudy(study, inputs, descriptors, readPinned(source.uploadedReport, readArchive).toString('utf8')));
  }
  return { pins, descriptors, studies };
}
async function buildAudit(input) {
  input ||= await loadEvidence();
  return { schemaVersion: 1, format: 'levelup-v19-selection-upload-evidence', recordedDate: '2026-11-18',
    sources: input.pins, provenance: PROVENANCE,
    counts: { ...Object.fromEntries(Object.keys(input.studies[0].counts).map(field => [field, input.studies.reduce((sum, study) => sum + study.counts[field], 0)])),
      engineSearches: 0, newMatchGames: 0 },
    selections: [
      { id: 'queen.level1-wide-forward-knight@1', movement: 'QfsN', level: 1, reason: 'User selected the two wide-forward jumps for the second L1 queen\'s movement identity.' },
      { id: 'pawn.level2-forward-queen-only@1', movement: 'fQ2', level: 2, reason: 'User selected forward-only movement for the L2 range-two pawn.' },
    ],
    studies: input.studies.map(study => ({ study: study.study, internalStudy: study.internalStudy,
      counts: study.counts, report: study.report, replay: study.replay, uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly,
      stages: study.stages.map(stage => ({ batchIndex: stage.batchIndex, nodes: stage.nodes, attempts: stage.records.length,
        configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)), scheduleSha256: sha(JSON.stringify(stage.descriptor.compatibility.schedule)),
        profileHash: stage.manifest.designProfile.hash, registryHash: stage.manifest.designRegistry.hash })) })) };
}
function renderAudit(audit) {
  const queens = audit.studies.find(study => study.study === 'queens'), pawns = audit.studies.find(study => study.study === 'pawns2');
  const table = (study, title) => [title, '', '| Design | Score | White | Black | Conditional 95% range | W / D / L |',
    '| --- | ---: | ---: | ---: | --- | :--- |', ...study.report.rows.map(row => `| ${row.label} | ${pct(row.score)} | ${row.physicalColors.map(color => pct(color.score)).join(' | ')} | ${pct(row.conditionalRange.lower)}–${pct(row.conditionalRange.upper)} | ${row.wins} / ${row.draws} / ${row.losses} |`), ''];
  return ['# Version 19: selected queen and pawn trial review', '',
    'The uploads contain **1,152 completed first-attempt games**, 576 complete color pairs and no errors, retries or truncations. Each study has four eight-case batch journals and 32 shared openings. The original numeric report tables, colors, conditional ranges, opening diagnostics and declared search priors reproduce offline.', '',
    'The user selected **QfsN** as the second level-one queen and **fQ2** as the level-two range pawn for their movement identity and simplicity. These are playable roster choices; none of the recorded results or frozen reference definitions change.', '',
    ...table(queens, '## Level-one queens'),
    'QfsN gives two wide forward knight jumps in addition to ordinary queen movement (for White on d4: b5/f5). Its declared score is **42.19%**, with 51.56% against Two-step pawn, 33.59% against King-step pawn and 41.41% against Pawn grant. It is a weaker exploration choice in this reference basket, not a demonstrated 50% match. The retained QfN queen control scores 46.09%; QvN scores 60.68%. QAD scores 42.45%, almost the same overall as QfsN, so the selection rests on the preferred readable jump pattern.', '',
    ...table(pawns, '## Level-two pawns'),
    'fQ2 moves and captures up to two squares straight or diagonally forward, with no backward or sideways moves. It scores **56.51%**, versus 58.07% for mvQ2fceB2. Its per-reference scores are 60.94% against Quiet-tall Knight pawn, 58.59% against Rank pawn and 50.00% against Bishop grant. It remains mildly strong under this protocol; the conditional 51.82%–61.46% range does not establish exact parity. Its simpler forward-only identity is the design reason for selection.', '',
    'Both pawn trials use 536 MG / 592 EG; all queen trials and controls use 2771 / 2833. Fixed opponents retain their declared priors. These settings guide search and are not fitted material values. Range-two moves require a clear path, remain available away from the home rank and use mandatory ordinary Q/R/B/N promotion. The fQ2 quiet diagonal landing on an empty en-passant target leaves the bypassed pawn, matching the measured engine behavior.', '',
    '## Opening diagnostics', '',
    'All **1,152 forced prefixes and stored opening FENs** independently replay under the frozen browser rules. Queen games retain 631 exact-cp and 137 bounded-cp first-search observations; pawn games retain 333 exact-cp and 51 bounded-cp observations. Neither study has missing, unavailable, invalid or mate observations. No opening was omitted or reweighted.', '',
    'The completed queen journals now replace the earlier missing-data status for this study; the old null-runtime receipt remains preserved in the earlier archive as historical evidence. No previous archive is rewritten or pooled into this run.', '',
    '## Provenance and reproducibility', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact uploaded bytes and reconstructed compatibility descriptors are gzip archived with original/archive SHA-256 pins. Run `node scripts/balance/v19-selection-evidence.js` to verify this review and the audit offline; `--write` regenerates only those two derived artifacts. No engine searches, scored games or new material fits are run.', ''].join('\n');
}
async function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = await buildAudit();
  for (const [file, content] of [[path.join(ROOT, `${PREFIX}.audit.json`), JSON.stringify(audit) + '\n'],
    [path.resolve(__dirname, '../../docs/v19-selected-trials-review.md'), renderAudit(audit)]]) {
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalized(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${path.basename(file)}.`);
  }
  log(`V19 selection verified: ${audit.counts.completedGames} completed games, ${audit.counts.completePairs} scored pairs; no engines or new games.`);
  return audit;
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { ROOT, PREFIX, SOURCES_SHA256, ENGINE_SHA256, STUDIES, PLANS, PROVENANCE,
  sources, planTools, validateRecord, replayOpenings, analyzeStudy, loadEvidence, buildAudit, renderAudit, main };
