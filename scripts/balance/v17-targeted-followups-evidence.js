'use strict';

// Uploaded outcomes and their exact reports remain distinct from original
// execution provenance. Only a verified analysis snapshot resolves trial IDs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('./research-overlay');
const { OVERLAY } = require('../targeted-followups');
const { declaredStartFen } = require('./reference-panel-evidence');
const { readPinnedSource } = require('./v17-acceptance-evidence');

const PROJECT = path.resolve(__dirname, '../..');
const ROOT = path.join(PROJECT, 'experiments/balance/results');
const PREFIX = 'v17-targeted-followups-001';
const STUDIES = Object.freeze({
  'knight-pawn': Object.freeze({ module: 'knight-pawn-followup-plan', nodes: Object.freeze([20000]), games: 2304 }),
  nightrider: Object.freeze({ module: 'nightrider-confirm-plan', nodes: Object.freeze([40000, 80000]), games: 512 }),
  cataphract: Object.freeze({ module: 'cataphract-followup-plan', nodes: Object.freeze([40000, 80000]), games: 512 }),
});
const SOURCES = {
  "knight-pawn": {
    "journals": {
      "20000": {
        "archiveFile": "v17-targeted-followups-001.knight-pawn.n20000.games.jsonl.gz",
        "archivedSha256": "4dd986587394cb9cc96428432709cf09caa4ce1fdf8b2e2fc29386cf0f915849",
        "originalName": "games.jsonl",
        "sha256": "c27d80d68dd943e21bd663002cc75494edb08ac7de8ac9c8864bb4eca932d1ec",
        "bytes": 8932546
      }
    },
    "uploadedReport": {
      "archiveFile": "v17-targeted-followups-001.knight-pawn.uploaded-report.md.gz",
      "archivedSha256": "056e3e2cdfde1edbf55dbe9212b36c0eaeb5c58e4a8a888206a6e6818e85578a",
      "originalName": "followup-report.md",
      "sha256": "0476897d287812a58265c24d264d0036e37c161b5447695e764bb5e428be4cd9",
      "bytes": 17982
    }
  },
  "nightrider": {
    "journals": {
      "40000": {
        "archiveFile": "v17-targeted-followups-001.nightrider.n40000.games.jsonl.gz",
        "archivedSha256": "7a391ebc65038737b2c8dd03141ee2d1c23268b4b3c3bb2eb379d2d4b909a32a",
        "originalName": "games.jsonl",
        "sha256": "1714f7e5eb46aafd75c6d6a50f2cbbde2b22f0520d9cd70a1a60e57071bb0457",
        "bytes": 947689
      },
      "80000": {
        "archiveFile": "v17-targeted-followups-001.nightrider.n80000.games.jsonl.gz",
        "archivedSha256": "a58299906798584be1afa3d04899448d67f76b2ce6e8bfd613671d8ae400e088",
        "originalName": "games.jsonl",
        "sha256": "1db0845152a0854fae88948aebf1461b648401a5aabbb91896b77bb3e809c5d7",
        "bytes": 947397
      }
    },
    "uploadedReport": {
      "archiveFile": "v17-targeted-followups-001.nightrider.uploaded-report.md.gz",
      "archivedSha256": "e4462b0c57addfe9a29623c91b434a8215d1084b8174fbabbfa8c16053d69b9b",
      "originalName": "followup-report.md",
      "sha256": "031c3a9c7cad333c06a8c11a00d473d95c4c6cd663909a463095ab1ee3d38967",
      "bytes": 7229
    }
  },
  "cataphract": {
    "journals": {
      "40000": {
        "archiveFile": "v17-targeted-followups-001.cataphract.n40000.games.jsonl.gz",
        "archivedSha256": "a1cf7e5589ecd6a012d51d29e12564eef5bfe81c3b38e6fe500d363357bea310",
        "originalName": "games.jsonl",
        "sha256": "ab7469818187351fb775db4cd38da33e7cf808ca5e4e5128b45e753b02d95233",
        "bytes": 941538
      },
      "80000": {
        "archiveFile": "v17-targeted-followups-001.cataphract.n80000.games.jsonl.gz",
        "archivedSha256": "9593da18480260a84002557593d4442628f44d03c94071aae7e57287685b5e3d",
        "originalName": "games.jsonl",
        "sha256": "3ab0f37b70977da9b6a08ee758baf52a7a3a5bd5f34d67f84c05430c922643b2",
        "bytes": 964176
      }
    },
    "uploadedReport": {
      "archiveFile": "v17-targeted-followups-001.cataphract.uploaded-report.md.gz",
      "archivedSha256": "a674569544a12a57f89fdde80fbf40f33ffd6921acf9cf6f78019ef18dd31bcf",
      "originalName": "followup-report.md",
      "sha256": "2154dfe4ae576197dfdfd5324cf08325a53def1a6f080513ded688ab2f48d4ce",
      "bytes": 6957
    }
  }
};
for (const source of Object.values(SOURCES)) {
  Object.values(source.journals).forEach(Object.freeze); Object.freeze(source.journals);
  Object.freeze(source.uploadedReport); Object.freeze(source);
}
Object.freeze(SOURCES);
const PROVENANCE = Object.freeze({
  originalCampaignManifestsSupplied: false, originalStageManifestsSupplied: false,
  originalRuntimeReceiptsSupplied: false, nativePreflightSupplied: false,
  uploadedReportsSupplied: true, engineSha256: null, legalMovesIndependentlyReplayed: false,
  descriptorKind: 'derived declaration compatibility descriptor',
  limitations: Object.freeze([
    'Original followup.json and stage run.json files, archived INI files, runtime ownership/receipts and native-preflight proofs were not supplied. Derived descriptors check declaration compatibility rather than original execution provenance.',
    'The current verified research overlay resolves immutable trial IDs for compatibility analysis. It is not asserted to be the original runtime snapshot.',
    'Recorded starts, profiles, search and evaluation policies, opening prefixes, move counts and outcome shapes match the declarations. Recorded engine names and profile hashes do not attest the executable or its native value tables.',
    'Moves and terminal outcomes were not independently replayed. No searches, new games, fitted material prices, piece Elo or population confidence intervals were produced.',
  ]),
});
const RECORD_FIELDS = Object.freeze(['aColor', 'attempt', 'blackStrength', 'comparisonId', 'comparisonLabel', 'engine', 'engineNames', 'evaluation', 'evaluationCaveat',
  'finalFen', 'finishedAt', 'id', 'lastInfo', 'moves', 'openingId', 'openingMoves', 'openingPlies', 'pairId', 'playedPlies', 'profileHash', 'reason', 'registryHash',
  'registryReference', 'repetition', 'result', 'royalMode', 'sans', 'scheduleIndex', 'schemaVersion', 'startFen', 'startedAt', 'status', 'totalPlies', 'variant', 'whiteStrength']);
const sha = value => createHash('sha256').update(value).digest('hex');
const percent = value => value === null ? 'pending' : `${(100 * value).toFixed(2)}%`;
let tools;
function context() {
  if (!tools) {
    const overlay = ensureResearchOverlay({ ...OVERLAY, root: PROJECT });
    const from = file => require(path.join(overlay.directory, `scripts/balance/${file}`));
    tools = { plans: Object.fromEntries(Object.entries(STUDIES).map(([key, value]) => [key, from(value.module)])),
      makeSchedule: from('plan').makeSchedule, createDesignRegistry: from('design-registry').createDesignRegistry,
      compileDesignProfile: from('design-profile').compileDesignProfile };
  }
  return tools;
}

function validateRecord(record, planned, config, profile, scheduledGames) {
  assert.ok(record && planned, 'Unknown scheduled follow-up game.');
  assert.deepEqual(Object.keys(record).sort(), RECORD_FIELDS, 'The exact uploaded record schema changed.');
  assert.equal(record.schemaVersion, 1, 'Unexpected recorded schema.');
  assert.equal(record.attempt, 1, 'The uploads contain first-attempt games only.');
  assert.equal(record.status, 'completed', 'The uploads contain completed games only.');
  assert.equal(record.repetition, planned.repetition, 'Recorded repetition changed.');
  assert.equal(record.comparisonLabel, planned.comparison.label, 'Recorded comparison label changed.');
  assert.ok(Number.isSafeInteger(record.scheduleIndex) && record.scheduleIndex >= 0 && record.scheduleIndex < scheduledGames, 'Invalid worker-local schedule index.');
  const white = record.aColor === 'w' ? planned.comparison.armyA : planned.comparison.armyB;
  const black = record.aColor === 'b' ? planned.comparison.armyA : planned.comparison.armyB;
  assert.equal(record.startFen, declaredStartFen(profile, white, black), 'Recorded starting army changed.');
  assert.equal(record.royalMode, 'king', 'Follow-up games require ordinary royal kings.');
  assert.equal(record.evaluationCaveat, null, 'Unexpected king-evaluation caveat.');
  assert.deepEqual(record.engineNames, { w: 'Fairy-Stockfish 230826', b: 'Fairy-Stockfish 230826' }, 'Recorded engine names changed.');
  assert.ok(Array.isArray(record.moves) && record.moves.every(move => typeof move === 'string'), 'Moves must be strings.');
  assert.ok(Array.isArray(record.sans) && record.sans.length === record.moves.length, 'SAN and UCI counts differ.');
  assert.ok(Array.isArray(record.openingMoves), 'Recorded opening moves must be an array.');
  assert.equal(record.totalPlies, record.moves.length, 'Recorded total ply count changed.');
  assert.equal(record.openingPlies, record.openingMoves.length, 'Recorded opening ply count changed.');
  assert.equal(record.playedPlies + record.openingPlies, record.totalPlies, 'Recorded played/opening counts differ.');
  assert.deepEqual(record.moves.slice(0, record.openingPlies), record.openingMoves, 'Recorded history does not begin with its prefix.');
  assert.ok(record.totalPlies <= config.engine.maxPlies, 'A game exceeds the move limit.');
  assert.ok(['checkmate', 'insufficient-material', 'threefold-repetition', 'fifty-move-rule', 'stalemate'].includes(record.reason), 'Unexpected terminal reason.');
  assert.ok(['1-0', '0-1', '1/2-1/2'].includes(record.result), 'A completed game lacks a scored result.');
  assert.equal(record.result === '1/2-1/2', record.reason !== 'checkmate', 'Recorded result and terminal reason disagree.');
  assert.equal(typeof record.finalFen, 'string', 'Recorded final FEN is missing.');
  const final = record.finalFen.split(' ');
  assert.equal(final.length, 6, 'Final FEN has an unexpected shape.');
  assert.equal(final[1], record.totalPlies % 2 ? 'b' : 'w', 'Final turn disagrees with ply count.');
  assert.equal(Number(final[5]), Math.floor(record.totalPlies / 2) + 1, 'Final fullmove count disagrees with ply count.');
  if (record.reason === 'checkmate') assert.equal(record.result, final[1] === 'w' ? '0-1' : '1-0', 'Recorded mate winner disagrees with final turn.');
  const started = Date.parse(record.startedAt), finished = Date.parse(record.finishedAt);
  assert.ok(Number.isFinite(started) && Number.isFinite(finished) && finished >= started, 'Invalid recorded game timestamps.');
  assert.ok(record.lastInfo && typeof record.lastInfo === 'object' && !Array.isArray(record.lastInfo), 'Recorded search info is missing.');
}

function analyzeStudy(study, inputs, uploadedReport, { requireComplete = true } = {}) {
  assert.ok(Object.hasOwn(STUDIES, study), 'Choose knight-pawn, nightrider or cataphract.');
  assert.ok(Array.isArray(inputs) && inputs.length, 'Declare the original follow-up journals.');
  assert.equal(new Set(inputs.map(row => row.nodes)).size, inputs.length, 'Duplicate node-budget source.');
  if (requireComplete) assert.deepEqual(inputs.map(row => row.nodes).sort((a, b) => a - b), STUDIES[study].nodes, 'All declared follow-up budgets are required.');
  const { plans, makeSchedule, createDesignRegistry, compileDesignProfile } = context(), plan = plans[study];
  const stages = inputs.map(input => {
    assert.ok(STUDIES[study].nodes.includes(input.nodes) && Array.isArray(input.records), 'Unknown budget or missing journal.');
    const declaration = plan.loadExperiment(input.nodes), { config } = declaration, schedule = makeSchedule(config);
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
    assert.equal(schedule.length, STUDIES[study].games / STUDIES[study].nodes.length, 'Declared stage game count changed.');
    if (requireComplete) assert.equal(input.records.length, schedule.length, 'A follow-up budget is incomplete.');
    assert.equal(new Set(input.records.map(row => row.id)).size, input.records.length, 'Duplicate follow-up game identity.');
    const byId = new Map(schedule.map(row => [row.id, row]));
    for (const record of input.records) validateRecord(record, byId.get(record.id), config, profile, schedule.length);
    // This descriptor is reconstructed now. It is not an original run.json.
    const manifest = { config, schedule, designRegistry: registry, designProfile: profile };
    return { nodes: input.nodes, config, metadata: declaration.metadata, records: input.records, registry, profile, manifest,
      declaration: { configSha256: sha(JSON.stringify(config)), metadataSha256: sha(JSON.stringify(declaration.metadata)), scheduleSha256: sha(JSON.stringify(schedule)),
        registryHash: registry.hash, profileHash: profile.hash, scheduledGames: schedule.length, descriptorKind: PROVENANCE.descriptorKind } };
  }).sort((a, b) => a.nodes - b.nodes);
  const report = plan.reportStudy({ runId: null }, stages);
  for (const entry of report.reports) {
    const expected = STUDIES[study].games / STUDIES[study].nodes.length;
    if (requireComplete) {
      assert.equal(entry.report.progress.completedGames, expected);
      assert.equal(entry.report.progress.pairedGames, expected);
      assert.equal(entry.report.progress.completePairs, expected / 2);
    }
    assert.equal(entry.report.progress.duplicateCopiesIgnored, 0);
  }
  assert.equal(new Set(stages.map(stage => stage.profile.hash)).size, 1, 'The study changed movement/value profiles between budgets.');
  if (uploadedReport !== undefined) assert.equal(plan.renderReport(report), uploadedReport, 'Reconstructed follow-up report differs from the exact upload.');
  return { study, stages, report, provenance: PROVENANCE,
    declaration: { reportReproducedExactly: uploadedReport !== undefined, descriptorKind: PROVENANCE.descriptorKind } };
}

function loadStudyEvidence(study, { readArchive } = {}) {
  assert.ok(Object.hasOwn(STUDIES, study), 'Choose knight-pawn, nightrider or cataphract.');
  const source = SOURCES[study];
  const inputs = STUDIES[study].nodes.map(nodes => {
    const bytes = readPinnedSource(source.journals[nodes], readArchive);
    assert.equal(bytes.at(-1), 10, 'Every exact follow-up journal must end in a complete newline.');
    return { nodes, records: bytes.toString('utf8').slice(0, -1).split('\n').map(JSON.parse) };
  });
  return { ...analyzeStudy(study, inputs, readPinnedSource(source.uploadedReport, readArchive).toString('utf8')), source };
}
function loadEvidence(options) { return { studies: Object.keys(STUDIES).map(study => loadStudyEvidence(study, options)), provenance: PROVENANCE }; }
function buildAudit(input = loadEvidence()) {
  return { schemaVersion: 1, format: 'levelup-v17-targeted-followups-upload-evidence', recordedDate: '2026-11-03',
    sources: SOURCES, provenance: PROVENANCE,
    counts: { uploadedGames: 3328, completedGames: 3328, pairedGames: 3328, completePairs: 1664, truncatedGames: 0, errors: 0, retries: 0, newMatchGames: 0, engineSearches: 0 },
    studies: input.studies.map(study => ({ study: study.study, declaration: study.declaration,
      counts: { completedGames: STUDIES[study.study].games, completePairs: STUDIES[study.study].games / 2 },
      stages: study.stages.map(stage => ({ nodes: stage.nodes, declaration: stage.declaration, engine: stage.config.engine, evaluation: stage.config.evaluation,
        evaluationAudit: stage.metadata.evaluationAudit, openings: stage.config.openings, definitions: stage.registry.definitions, recordedEngineNames: stage.records[0].engineNames,
        source: SOURCES[study.study].journals[stage.nodes] })), report: study.report })),
    limitations: [...PROVENANCE.limitations,
      'The same sixteen fixed cases are matched across colors, opponents, placements, partners and budgets. Physical game counts are not independent-opening counts, and reused cases across studies do not add opening diversity.',
      'Knight-pawn outcomes are three-point mixed armies, not isolated two-point piece prices. Original control and both revisions share MG/EG 536/592; the reported partner means keep fixed equal weights.',
      'Nightrider confirmation is separate from the earlier eight-case discovery. Cataphract compares two restrictions against references; original RC is not a fresh control in that study.',
      'The full ten-piece panel is still a separate ongoing study; none of its games or historical mixed results are added to these 3328 records.',
    ] };
}
function renderAudit(audit) {
  const pawn = audit.studies.find(row => row.study === 'knight-pawn').report.reports[0];
  const knight = audit.studies.find(row => row.study === 'nightrider').report;
  const rook = audit.studies.find(row => row.study === 'cataphract').report;
  const rows = report => report.reports.map(entry => `| ${entry.nodes} | ${entry.report.overall.rows.map(row => percent(row.score)).join(' | ')} |`);
  return ['# Targeted follow-up evidence', '',
    'All 3,328 scheduled games completed on attempt 1: 2,304 Knight-pawn games and 512 each for Nightrider and Cataphract. All three uploaded reports reproduce byte-for-byte; there are 1,664 complete color pairs and no retries, errors or truncations. No historical games are included.', '',
    '| Knight-pawn body | Score | W / D / L | First eight | Second eight |', '| --- | ---: | :--- | ---: | ---: |',
    ...pawn.bodies.map(body => `| ${body.label} | ${percent(body.score)} | ${body.wins} / ${body.draws} / ${body.losses} | ${pawn.cohorts.map(cohort => percent(cohort.bodies.find(row => row.key === body.key).score)).join(' | ')} |`), '',
    'Each pawn body has 768 games from sixteen opening blocks. The quiet-tall body has 327 wins, 113 draws and 328 losses: changing one loss to a draw would give exactly 50%; changing it to a win would give 50.07%. The percentage is an equal-partner/placement/reference army score, not a direct material value.', '',
    '| Nodes | N0 control | N0cF diagonal captures |', '| ---: | ---: | ---: |', ...rows(knight), '',
    'The diagonal capture version is strong at both budgets. Its 80k-minus-40k raw score change is negative in this new cohort, with conditional ranges crossing zero; the earlier high 80k discovery score does not reproduce as a clear positive depth trend.', '',
    '| Nodes | Cataphract RsCfC | Cataphract RfhC |', '| ---: | ---: | ---: |', ...rows(rook), '',
    'RsCfC keeps the backward-wide camel pair and removes only the two tall backward jumps. RfhC removes all backward camel jumps. Both retain rook movement/captures and castling; shared RC priors remain 2240/2413.', '',
    '## Provenance and interpretation', '', ...audit.limitations.map(note => `- ${note}`), '',
    'Exact journals and uploaded reports are retained as deterministic gzip with original and archive SHA-256 pins. The audit stores complete generated report data once per study, including opening-block contrasts and partner/placement diagnostics.', '',
    'Run `node scripts/balance/v17-targeted-followups-evidence.js` to verify offline; `--write` regenerates derived artifacts only. No engine or game is started.', ''].join('\n');
}
function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const input = loadEvidence(), audit = buildAudit(input), artifacts = [[`${PREFIX}.audit.json`, JSON.stringify(audit) + '\n'], [`${PREFIX}.report.md`, renderAudit(audit)]];
  for (const study of input.studies) artifacts.push([`${PREFIX}.${study.study}.original-report.md`, context().plans[study.study].renderReport(study.report)]);
  for (const [name, content] of artifacts) {
    const file = path.join(ROOT, name);
    if (args.length) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Derived artifact changed: ${name}.`);
  }
  console.log('Targeted uploads verified: 3328 completed games, 1664 scored pairs; three exact reports, no searches or new games.');
  return audit;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { PREFIX, STUDIES, SOURCES, PROVENANCE, analyzeStudy, loadStudyEvidence, loadEvidence, buildAudit, renderAudit, main };
