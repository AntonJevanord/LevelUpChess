'use strict';

// Exact uploaded journals, checked against derived declaration descriptors.
// This offline audit starts no engines or games and changes no scored outcome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { declaredStartFen } = require('./reference-panel-evidence');
const { ensureResearchOverlay } = require('./research-overlay');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v19-focused-trials-001';
const SOURCES_SHA256 = '6bae132f1ed67e7778852f432bef353b88d904940c5457b20342803bc29882e7';
const ENGINE_SHA256 = '848ad74c3fbc2684e57b42c581ee94e93e5ed832fb536846a37f9dddebbb8b16';
const STUDIES = Object.freeze(['level2', 'level3']);
const EXCLUDED_OPENINGS = Object.freeze(['v19-book-02', 'v19-book-26']);
const PROVENANCE = Object.freeze({ originalCampaignManifestsSupplied: false, originalStageManifestsSupplied: false,
  originalRuntimeSnapshotsSupplied: false, nativePreflightSupplied: false, originalExecutableIndependentlyVerified: false,
  queenOwnerReceiptSupplied: true, queenRuntimeSnapshotPresentInReceipt: false,
  descriptorKind: 'Derived v0.19.1 declaration compatibility descriptors; not original execution manifests.',
  recordedEngineSha256: ENGINE_SHA256, fullGameMovesIndependentlyReplayed: false,
  limitations: [
    'Original campaign/stage manifests, archived INI files, owned runtime snapshots and native-preflight proofs were not supplied. Derived descriptors verify declaration compatibility, not original runtime provenance.',
    'Opening observations report an executable hash and Fairy-Stockfish 230826; this audit has not inspected that executable or attested its native piece-value tables.',
    'All forced prefixes and their stored opening FENs are replayed with the frozen browser rules. Only the eight recorded mate-in-one continuations are independently replayed to a terminal result; other full game moves and outcomes are not replayed.',
    'The thirty-two related fixed opening cases, chosen search priors and forced-prefix protocol limit generalization. Conditional opening-block ranges exclude engine and protocol bias.',
    'The two-opening omission is a labeled sensitivity analysis across both colors and all reference cells. It neither replaces official scores nor selects a revised matchup-specific opening book.',
    'No scored matches, engine searches, new material-value fits, individual-piece Elo or automatic playable promotions were produced.',
  ] });
const sha = value => createHash('sha256').update(value).digest('hex');
const normalized = text => text.replace(/\r\n/g, '\n');
const pct = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
const tables = text => normalized(text).split('\n').filter(line => line.startsWith('| '));

function sources() {
  const text = normalized(fs.readFileSync(path.join(ROOT, `${PREFIX}.sources.json`), 'utf8'));
  assert.equal(sha(text), SOURCES_SHA256, 'Focused-trial source pins changed.');
  const pins = JSON.parse(text);
  assert.equal(pins.format, 'levelup-v19-focused-trial-source-pins');
  assert.equal(pins.targetOpenings, 32);
  return pins;
}
function readPinned(pin, readArchive = file => fs.readFileSync(file)) {
  const archived = readArchive(path.join(ROOT, pin.archiveFile));
  assert.equal(sha(archived), pin.archivedSha256, `Archive changed: ${pin.archiveFile}.`);
  const bytes = gunzipSync(archived);
  assert.equal(bytes.length, pin.bytes, `Original byte count changed: ${pin.archiveFile}.`);
  assert.equal(sha(bytes), pin.sha256, `Original upload changed: ${pin.archiveFile}.`);
  return bytes;
}
function parseJournal(bytes) {
  assert.equal(bytes.at(-1), 10, 'An uploaded journal must end with a complete newline.');
  return bytes.toString('utf8').slice(0, -1).split('\n').map(JSON.parse);
}
function planTools() {
  const overlay = ensureResearchOverlay({ name: 'v19-focused-evidence-reader', entryFile: 'scripts/balance/v19-trial-evidence.js',
    definitionFile: 'src/balance-designs-v19-trials.js' });
  return require(path.join(overlay.directory, 'scripts/balance/v19-trial-plan'));
}
function validateRecord(record, planned, descriptor) {
  assert.ok(planned, 'Unknown scheduled uploaded game.');
  assert.equal(record.schemaVersion, 1); assert.equal(record.attempt, 1, 'Unexpected retry in this upload.');
  for (const field of ['id', 'pairId', 'comparisonId', 'openingId', 'repetition', 'aColor', 'openingMoves']) assert.deepEqual(record[field], planned[field], `Recorded ${field} changed.`);
  const { config } = descriptor.declaration, profile = descriptor.compatibility.designProfile;
  const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
  const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
  assert.equal(record.comparisonLabel, planned.comparison.label);
  assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
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
  if (record.status === 'truncated') {
    assert.equal(record.result, '*'); assert.equal(record.reason, 'max-plies'); assert.equal(record.totalPlies, config.engine.maxPlies);
  } else {
    assert.equal(record.status, 'completed'); assert.ok(['1-0', '0-1', '1/2-1/2'].includes(record.result));
    assert.ok(['checkmate', 'stalemate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule'].includes(record.reason));
    assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate');
    if (record.reason === 'checkmate') assert.equal(record.result, fields[1] === 'w' ? '0-1' : '1-0');
  }
  assert.ok(Number.isFinite(Date.parse(record.startedAt)) && Date.parse(record.finishedAt) >= Date.parse(record.startedAt));
}
async function replayOpenings(stages) {
  let prefixes = 0; const mates = [];
  for (const stage of stages) {
    const rules = await require('../../dist/balance-rules.cjs').createMatchRules({ profile: stage.manifest.designProfile });
    for (const record of stage.records) {
      const board = rules.createBoard(record.startFen);
      try {
        for (const move of record.openingMoves) assert.ok(board.push(move), `Illegal uploaded prefix: ${record.id}.`);
        assert.equal(board.fen(), record.openingEvaluation.fen, 'Stored opening position differs from replay.');
        assert.equal(board.outcome(), null, 'Forced prefix is already terminal.'); prefixes++;
        if (record.openingEvaluation.score?.type === 'mate') {
          assert.equal(record.openingEvaluation.score.value, 1); assert.equal(record.aColor, 'w');
          assert.equal(record.comparisonId.startsWith('wraith-side-rays-v-'), true);
          assert.equal(record.totalPlies, record.openingPlies + 1); assert.equal(record.moves.at(-1), 'd1a4');
          assert.equal(record.openingEvaluation.info.pv[0], 'd1a4'); assert.equal(board.san('d1a4'), record.sans.at(-1));
          assert.ok(board.push('d1a4')); assert.deepEqual(board.outcome(), { result: record.result, reason: record.reason });
          assert.equal(board.fen(), record.finalFen);
          mates.push({ id: record.id, comparisonId: record.comparisonId, openingId: record.openingId, aColor: record.aColor,
            openingMoves: record.openingMoves, openingFen: record.openingEvaluation.fen, score: record.openingEvaluation.score,
            move: 'd1a4', recordedSan: record.sans.at(-1), result: record.result, reason: record.reason, totalPlies: record.totalPlies,
            terminalResultIndependentlyReplayed: true });
        }
      } finally { board.dispose(); }
    }
  }
  return { prefixesIndependentlyReplayed: prefixes, mateContinuationsIndependentlyReplayed: mates.length, mates };
}
async function analyzeStudy(study, inputs, descriptors, uploadedReport, plan = planTools()) {
  assert.ok(STUDIES.includes(study)); assert.equal(inputs.length, 4);
  const seen = new Set(), stages = inputs.map(input => {
    assert.ok(!seen.has(input.batchIndex), 'Duplicate uploaded batch.'); seen.add(input.batchIndex);
    const descriptor = descriptors.stages.find(row => row.study === study && row.batchIndex === input.batchIndex);
    assert.ok(descriptor, 'Unexpected uploaded batch.'); assert.equal(input.nodes, 40000);
    assert.deepEqual(descriptor.declaration, plan.getBatchDeclaration(study, input.batchIndex));
    const planned = new Map(descriptor.compatibility.schedule.map(row => [row.id, row])), ids = new Set();
    for (const record of input.records) {
      assert.ok(!ids.has(record.id), 'Duplicate uploaded game/attempt.'); ids.add(record.id);
      validateRecord(record, planned.get(record.id), descriptor);
    }
    assert.equal(ids.size, planned.size, 'An uploaded batch is incomplete.');
    return { ...input, descriptor, manifest: { runId: null, config: descriptor.declaration.config, ...descriptor.compatibility } };
  }).sort((a, b) => a.batchIndex - b.batchIndex);
  const manifest = { study, targetOpenings: 32, identity: { engineSha256: ENGINE_SHA256 } };
  const report = plan.reportStudy(manifest, stages);
  assert.equal(report.openingEvaluations.counts.invalid, 0, 'Invalid first-search observation.');
  assert.equal(report.openingEvaluations.counts.missing, 0); assert.equal(report.openingEvaluations.counts.unavailable, 0);
  assert.deepEqual(tables(plan.renderReport(report)), tables(uploadedReport), 'Uploaded report numeric tables differ.');
  assert.ok(uploadedReport.includes(`${report.scheduledGames} scheduled games; ${report.progress.finalizedGames} finalized; ${report.progress.completePairs} scored color pairs.`));
  const replay = await replayOpenings(stages), records = stages.flatMap(stage => stage.records);
  const sensitivity = plan.reportStudy(manifest, stages.map(stage => ({ ...stage,
    records: stage.records.filter(record => !EXCLUDED_OPENINGS.includes(record.openingId)) })));
  return { study, stages, report, uploadedNumericTablesReproducedExactly: true, replay,
    counts: { attempts: records.length, finalizedGames: records.length, completedGames: records.filter(row => row.status === 'completed').length,
      truncatedGames: records.filter(row => row.status === 'truncated').length, errors: 0, retries: 0,
      completePairs: report.progress.completePairs, pairedGames: report.progress.completePairs * 2 },
    sensitivity: { diagnosticOnly: true, excludedOpeningIds: EXCLUDED_OPENINGS, bothColorsAndAllReferenceCells: true,
      targetSharedCases: 30, rows: sensitivity.rows.map(({ key, label, games, wins, draws, losses, score, openingCoverage, physicalColors, cells }) =>
        ({ key, label, games, wins, draws, losses, score, openingCoverage, physicalColors, cells })) } };
}
async function loadEvidence({ readArchive } = {}) {
  const pins = sources(), descriptors = JSON.parse(readPinned(pins.declarations, readArchive));
  assert.equal(descriptors.format, 'levelup-v19-focused-derived-declarations'); assert.equal(descriptors.baseTag, 'v0.19.1');
  assert.equal(descriptors.targetOpenings, 32); assert.equal(descriptors.stages.length, 8);
  const queenRuntime = JSON.parse(readPinned(pins.queenRuntime, readArchive));
  assert.deepEqual(queenRuntime, { schemaVersion: 1, format: 'levelup-v19-panel-runtime-owner', study: 'level1', directory: null, jobs: 4, initialOpenings: 32 });
  const plan = planTools(), studies = [];
  for (const study of STUDIES) {
    const source = pins.studies[study], inputs = source.journals.map(pin => ({ batchIndex: pin.batchIndex, nodes: pin.nodes, records: parseJournal(readPinned(pin, readArchive)) }));
    studies.push(await analyzeStudy(study, inputs, descriptors, readPinned(source.uploadedReport, readArchive).toString('utf8'), plan));
  }
  return { pins, descriptors, queenRuntime, studies };
}
async function buildAudit(input) {
  input ||= await loadEvidence();
  const fields = Object.keys(input.studies[0].counts);
  return { schemaVersion: 1, format: 'levelup-v19-focused-trial-upload-evidence', recordedDate: '2026-11-18',
    sources: input.pins, provenance: PROVENANCE,
    counts: { ...Object.fromEntries(fields.map(field => [field, input.studies.reduce((sum, row) => sum + row.counts[field], 0)])), engineSearches: 0, newMatchGames: 0 },
    queenRuntime: input.queenRuntime, studies: input.studies.map(study => ({ study: study.study, counts: study.counts,
      uploadedNumericTablesReproducedExactly: study.uploadedNumericTablesReproducedExactly, report: study.report, replay: study.replay,
      sensitivity: study.sensitivity, stages: study.stages.map(stage => ({ batchIndex: stage.batchIndex, nodes: stage.nodes,
        attempts: stage.records.length, configSha256: sha(JSON.stringify(stage.descriptor.declaration.config)),
        scheduleSha256: sha(JSON.stringify(stage.descriptor.compatibility.schedule)), profileHash: stage.manifest.designProfile.hash,
        registryHash: stage.manifest.designRegistry.hash })) })) };
}
function renderAudit(audit) {
  const l2 = audit.studies.find(row => row.study === 'level2'), l3 = audit.studies.find(row => row.study === 'level3');
  const table = (study, title) => [title, '', '| Body | Overall | White | Black | Shared cases | W / D / L |',
    '| --- | ---: | ---: | ---: | ---: | :--- |', ...study.report.rows.map(row => `| ${row.label} | ${pct(row.score)} | ${row.physicalColors.map(color => pct(color.score)).join(' | ')} | ${row.openingCoverage.shared}/32 | ${row.wins} / ${row.draws} / ${row.losses} |`), ''];
  return ['# Version 19 focused pawn/queen trials: thirty-two-case review', '',
    'The exact uploads contain 1,664 first-attempt games: 1,663 completed results and one 400-ply truncation. There are 831 complete color pairs (1,662 scored games); the completed partner of the truncation stays archived and unscored. All uploaded numeric tables, colors, conditional ranges, first-search coverage and search priors reproduce offline.', '',
    'The files are four eight-case batch journals per study, not four independent worker studies. Both completed studies use 40,000 nodes, Skill 20, one thread and 32 MiB hash on the same thirty-two related fixed opening cases. Draws count half a point.', '',
    ...table(l2, '## Level two'),
    'Both trial pawns lean strong against the unchanged reference basket: B2vR2 reaches 60.94% (conditional 95% range 55.99%–66.15%), while fQ2mbQ2 reaches 67.20% (60.75%–73.39%). This supports a bounded nerf test rather than promoting either as a balanced reference.', '',
    'The fQ2mbQ2/Rank-pawn game as White on case 26 hit 400 plies. Its overall row therefore uses 31 shared cases across all three references (186 games); individual matchup cells retain their own complete pairs (64/62/64 games). A naive pool of all remaining completed pairs has a different denominator and is not the official overall score.', '',
    ...table(l3, '## Level three'),
    'The six-jump pawn is a promising three-point design: 51.37% overall, with a 45.70%–56.45% conditional range. Its reference scores are 64.84% against Unicorn, 47.66% against Crusader, 46.88% against Vanguard and 46.09% against Amazon. The three non-Unicorn references together score 46.88%; the overall is not proof of equal strength in every matchup. The full-knight pawn is high at 58.20%; four-forward-jump pawn is low at 43.55%. Herald control stays near even at 49.22%.', '',
    'QgsQ0 Wraith is also promising by the declared score, 52.54% (46.67%–58.40%), with 50.78% / 57.81% / 48.44% / 53.13% against Unicorn / Crusader / Vanguard / Amazon. Its White/Black split is 61.33% / 43.75%. Human counterplay and the opening warning still need review before promotion.', '',
    '## Opening diagnostic and sensitivity', '',
    'All 1,664 post-prefix positions reproduce from their stored starting armies and forced moves. Level two stores 329 exact-cp and 55 bounded-cp observations. Level three stores 1,025 exact-cp, 247 bounded-cp and eight mate observations. No observation is missing, unavailable or invalid; these are engine estimates under declared priors, not fitted material values.', '',
    'All eight mate observations are Wraith as White on cases 02 and 26, once against each reference. The first freely chosen move is d1a4 (Qa4#, archived as Ia4#), and every game actually ends immediately after that ninth ply. The forced prefix and this final move were independently replayed with the frozen browser rules to verify checkmate. The complete opening FENs, prefixes, observations and results are retained in the audit JSON.', '',
    '| Opening | Wraith games | W / D / L | Score | Immediate White mates |', '| --- | ---: | :--- | ---: | ---: |',
    '| v19-book-02 | 8 | 6 / 1 / 1 | 81.25% | 4 |', '| v19-book-26 | 8 | 4 / 2 / 2 | 62.50% | 4 |', '',
    'For sensitivity only, omitting both complete opening cases, both physical colors and all reference cells gives Wraith **51.25%** (87 / 72 / 81 across 240 games). The near-even score is not explained away by those eight mates, but the forced positions expose an opening-book failure for this piece. The declared **52.54% remains unchanged**; this omission neither corrects scores nor selects a special favorable book for Wraith.', '',
    '| Design | Declared 32-case score | Diagnostic 30-case score |', '| --- | ---: | ---: |',
    ...audit.studies.flatMap(study => study.report.rows.map(row => `| ${row.label} | ${pct(row.score)} | ${pct(study.sensitivity.rows.find(other => other.key === row.key).score)} |`)), '',
    'The first-search capture successfully exposed this issue without an extra engine search. A future protocol revision should validate the common book across the accepted roster; do not silently delete these games or retrospectively choose near-zero evaluations per matchup.', '',
    '## Missing queen trial', '',
    'Only the queen panel-runtime.json owner receipt was uploaded. It declares level1, four jobs and 32 initial openings, but directory is null. This is not evidence of completed queen games or a usable owned runtime. No queen score is inferred, and no original runtime snapshot or execution manifest has been reconstructed as if supplied.', '',
    '## Provenance and limits', '', ...PROVENANCE.limitations.map(note => `- ${note}`), '',
    'Exact original bytes are retained in deterministic gzip archives with original/archive SHA-256 pins. Derived v0.19.1 descriptors are explicitly compatibility evidence. Run `node scripts/balance/v19-trial-evidence.js` to verify offline; `--write` regenerates only this review and the derived audit.', ''].join('\n');
}
async function main(args = process.argv.slice(2), { log = console.log } = {}) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const audit = await buildAudit();
  for (const [file, content] of [[path.join(ROOT, `${PREFIX}.audit.json`), JSON.stringify(audit) + '\n'],
    [path.resolve(__dirname, '../../docs/v19-focused-trials-review.md'), renderAudit(audit)]]) {
    if (args.length) fs.writeFileSync(file, content); else assert.equal(normalized(fs.readFileSync(file, 'utf8')), content, `Derived artifact changed: ${path.basename(file)}.`);
  }
  log(`V19 focused trials verified: ${audit.counts.finalizedGames} finalized games, ${audit.counts.completePairs} scored pairs; no engines or new games.`);
  return audit;
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { ROOT, PREFIX, SOURCES_SHA256, ENGINE_SHA256, STUDIES, EXCLUDED_OPENINGS, PROVENANCE,
  sources, readPinned, parseJournal, analyzeStudy, loadEvidence, buildAudit, renderAudit, main };
