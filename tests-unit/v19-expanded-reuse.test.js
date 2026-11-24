'use strict';

// Real serialization/owned-reader wiring with synthetic draw results. The
// producer stops before any worker or engine can be started. These fixtures
// establish pipeline behavior, never strength evidence or native provenance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const reuseTools = require('../scripts/balance/v19-expanded-reuse');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const material = require('../scripts/v19-panel-material');
const { buildOpeningEvaluationReport } = require('../scripts/balance/opening-evaluation-report');
const ROOT = path.resolve(__dirname, '..');
const sha = x => createHash('sha256').update(x).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
let root, source, evidence, oldPlan, oldProfile, engineSha, originalHashes, prepared, sourceRecords;
function hashes(directory) {
  const result = {};
  function visit(current) { for (const item of fs.readdirSync(current, { withFileTypes: true })) {
    const file = path.join(current, item.name); if (item.isDirectory()) visit(file); else result[path.relative(directory, file)] = sha(fs.readFileSync(file));
  } }
  visit(directory); return result;
}
function values(allocations, entries) {
  return { version: 1, pieces: Object.fromEntries(allocations.flatMap(row => [row.letter, row.letter.toUpperCase()].map(letter => [letter,
    Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'].map(key => [key, entries[row.id][key.endsWith('Mg') ? 'mg' : 'eg']]))]))) };
}
async function recordsFor(schedule, config, profile, factory) {
  const rules = await factory({ profile });
  return schedule.map(game => {
    const comparison = game.comparison, white = game.aColor === 'w' ? comparison.armyA : comparison.armyB,
      black = game.aColor === 'b' ? comparison.armyA : comparison.armyB;
    const startFen = rules.startingFen(white, black), board = rules.createBoard(startFen);
    try {
      const sans = []; for (const move of game.openingMoves) { sans.push(board.san(move)); assert.ok(board.push(move)); }
      return { ...game, attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'threefold-repetition',
        variant: profile.variant, startFen, finalFen: board.fen(), moves: [...game.openingMoves], sans,
        openingPlies: 8, totalPlies: 8, playedPlies: 0,
        profileHash: profile.hash, registryHash: profile.registryHash, registryReference: 'run.json#designRegistry',
        engine: config.engine, evaluation: config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 },
        openingEvaluation: { schemaVersion: 1, source: 'first-post-opening-search', available: true, perspective: 'white',
          fen: board.fen(), openingPlies: 8, capturedOnAttempt: 1, color: 'w', engineSha256: engineSha,
          strength: { skill: 20 }, limits: { nodes: 40000 }, score: { type: 'cp', value: 0 } } };
    } finally { board.dispose(); }
  });
}
test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-expanded-reuse-'));
  source = path.join(root, 'source-004'); fs.mkdirSync(source);
  const overlay = ensureResearchOverlay({ root: ROOT, name: 'tier-panels-v19', entryFile: 'scripts/v19-panels.js',
    definitionFile: 'src/balance-designs-v19-panels.js', cacheDirectory: path.join(source, 'runtime') });
  const owned = file => require(path.join(overlay.directory, file));
  oldPlan = owned('scripts/balance/v19-panel-current-plan');
  const identity = owned('scripts/balance/run').getRunIdentity(process.execPath); engineSha = identity.engineSha256;
  const declaration = { ...oldPlan.buildCampaignPlan({ study: 'level1', jobs: 1 }), study: 'level1' };
  const manifest = { ...declaration, planSha256: sha(JSON.stringify(declaration)), runId: 'synthetic-reuse-source-004',
    createdAt: '2026-11-24T00:00:00.000Z', initialOpenings: 8, overlaySha256: overlay.manifestSha256, identity };
  write(path.join(source, 'panel-runtime.json'), { schemaVersion: 1, format: 'levelup-v19-panel-runtime-owner', study: 'level1', jobs: 1,
    initialOpenings: 8, directory: path.relative(source, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 });
  write(path.join(source, 'screen.json'), manifest); write(path.join(source, 'panel-state.json'), { runId: manifest.runId, targetOpenings: 8 });
  const experiment = oldPlan.getBatchDeclaration('level1', 0), config = experiment.config;
  const registry = owned('scripts/balance/design-registry').createDesignRegistry(config);
  oldProfile = owned('scripts/balance/design-profile').compileDesignProfile(registry, config.evaluation);
  const refs = owned('scripts/balance/official-references').getOfficialReferences();
  const official = Object.fromEntries(refs.roster.map(row => [row.id, row.engineValue]));
  const validation = { native: true, games: experiment.metadata.scheduledGames, validatedOpenings: experiment.metadata.scheduledGames,
    configSha256: sha(JSON.stringify(config)), profileHash: oldProfile.hash, registryHash: registry.hash, engineSha256: engineSha,
    bracketValueReceipt: experiment.metadata.evaluationAudit,
    referenceValueProfile: { variant: refs.profile.variant, hash: refs.profile.hash, registryHash: refs.profile.registryHash },
    referenceValues: values(refs.profile.registry.allocations, official), manualValues: values(registry.allocations, config.evaluation.pieceValues) };
  const stageRoot = path.join(source, manifest.stages[0].directory);
  owned('scripts/version17-balance').writePreflight(stageRoot, experiment, validation);
  const schedule = owned('scripts/balance/plan').makeSchedule(config);
  const stopped = await owned('scripts/balance/parallel').runParallel({ config, schedule, outDir: stageRoot, jobs: 1,
    enginePath: process.execPath, shouldStop: () => 'now', onProgress() {} });
  assert.equal(stopped.stopped, true); assert.equal(fs.existsSync(path.join(stageRoot, 'workers')), false);
  sourceRecords = await recordsFor(schedule, config, oldProfile, owned('dist/balance-rules.cjs').createMatchRules);
  // Retain a real unscored hole, never replace it with an invented draw.
  Object.assign(sourceRecords[0], { status: 'truncated', result: '*', reason: 'max-plies' });
  fs.writeFileSync(path.join(stageRoot, 'games.jsonl'), sourceRecords.map(row => JSON.stringify(row)).join('\n') + '\n');
  originalHashes = hashes(source);
  evidence = path.join(root, 'new-output', 'runtime', 'reuse-source');
  prepared = await reuseTools.prepareReuse({ sourceRoot: source, evidenceRoot: evidence, study: 'level1', targetOpenings: 8, expectedEngineSha256: engineSha });
});
test.after(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

test('copies a verified owned roster-004 source and runtime without changing original bytes', () => {
  assert.deepEqual(hashes(source), originalHashes);
  assert.equal(prepared.availableOpenings, 8); assert.equal(prepared.oldIds.length, 11);
  assert.equal(prepared.receipt.source.profileHash, oldProfile.hash);
  assert.equal(prepared.receipt.replay.games, 880); assert.equal(prepared.receipt.replay.plies, 7040);
  assert.match(prepared.receipt.replay.scope, /no full-game/);
  const copied = material.loadPanel(path.join(evidence, 'source'));
  assert.equal(copied.manifest.runId, 'synthetic-reuse-source-004'); assert.deepEqual(copied.profile, oldProfile);
  const raw = path.join(copied.root, copied.manifest.stages[0].directory, 'games.jsonl');
  assert.equal(sha(fs.readFileSync(raw)), sha(fs.readFileSync(path.join(source, copied.manifest.stages[0].directory, 'games.jsonl'))));
});

test('frozen evidence resumes without the original source and rejects insufficient coverage, tier or engine changes', async () => {
  const again = await reuseTools.prepareReuse({ sourceRoot: path.join(root, 'missing-original'), evidenceRoot: evidence,
    study: 'level1', targetOpenings: 8, expectedEngineSha256: engineSha });
  assert.deepEqual(again.identity, prepared.identity);
  assert.throws(() => reuseTools.readReuse(evidence, { study: 'level1', targetOpenings: 16 }), /source covers 8/);
  assert.throws(() => reuseTools.readReuse(evidence, { study: 'level2', targetOpenings: 8 }), /tier differs/);
  assert.throws(() => reuseTools.readReuse(evidence, { expectedEngineSha256: 'f'.repeat(64) }), /executable differs/);
});

test('source locks and incomplete schedules are refused before creating evidence', async () => {
  const lock = path.join(source, '.v19-panel.lock'), out = path.join(root, 'rejected-evidence');
  fs.writeFileSync(lock, 'test lock');
  try { await assert.rejects(reuseTools.prepareReuse({ sourceRoot: source, evidenceRoot: out, study: 'level1', targetOpenings: 8 }), /Stop the source/); }
  finally { fs.unlinkSync(lock); }
  assert.equal(fs.existsSync(out), false);
  await assert.rejects(reuseTools.prepareReuse({ sourceRoot: source, evidenceRoot: out, study: 'level1', targetOpenings: 16 }), /source covers 8/);
  assert.equal(fs.existsSync(out), false); assert.deepEqual(hashes(source), originalHashes);
});

test('copied-file corruption, foreign files and changed receipts are rejected without source mutation', () => {
  const row = prepared.receipt.files.find(row => row.file.endsWith('games.jsonl')), file = path.join(evidence, row.file), bytes = fs.readFileSync(file);
  fs.appendFileSync(file, '\n');
  try { assert.throws(() => reuseTools.readReuse(evidence), /copied source file changed/); }
  finally { fs.writeFileSync(file, bytes); }
  const foreign = path.join(evidence, 'foreign.txt'); fs.writeFileSync(foreign, 'unowned');
  try { assert.throws(() => reuseTools.readReuse(evidence), /undeclared evidence/); } finally { fs.unlinkSync(foreign); }
  const receiptFile = path.join(evidence, reuseTools.RECEIPT), original = fs.readFileSync(receiptFile), changed = JSON.parse(original);
  changed.oldIds.pop(); write(receiptFile, changed);
  try { assert.throws(() => reuseTools.readReuse(evidence), /receipt changed/); }
  finally { fs.writeFileSync(receiptFile, original); }
  assert.deepEqual(hashes(source), originalHashes);
});

test('reuse requires the expanded search protocol and the original declared starting armies', async () => {
  const full = require('../scripts/balance/v19-panel-expanded-plan');
  assert.doesNotThrow(() => reuseTools.verifyProtocol(prepared, full));
  const badBudget = { ...prepared, input: { ...prepared.input,
    manifest: { ...prepared.input.manifest, nodes: [20000] } } };
  assert.throws(() => reuseTools.verifyProtocol(badBudget, full), /search budget/);
  for (const patch of [{ engine: { ...sourceRecords[1].engine, nodes: 80000 } },
    { whiteStrength: { skill: 10 } }, { openingMoves: ['e2e4'] }]) {
    const changed = { ...prepared, stages: [{ ...prepared.stages[0], records: [{ ...sourceRecords[1], ...patch }] }] };
    assert.throws(() => reuseTools.verifyProtocol(changed, full), /engine, strength or opening prefix/);
  }
  const movedStart = { ...sourceRecords[1], startFen: sourceRecords[1].finalFen };
  await assert.rejects(reuseTools.replayPrefixes({ ...prepared.input,
    stages: [{ ...prepared.stages[0], records: [movedStart] }] }), /starting position/);
  assert.deepEqual(hashes(source), originalHashes);
});

test('composite rows use preserved old pairs plus new-only cells, retain holes and keep delta progress separate', async () => {
  const full = require('../scripts/balance/v19-panel-expanded-plan');
  const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
  const original = full.getBatchDeclaration('level1', 0), old = new Set(prepared.oldIds);
  const chosen = new Set(original.metadata.comparisons.filter(row => !old.has(row.designA) || !old.has(row.designB)).map(row => row.id));
  const declaration = { ...original, config: normalizeConfig({ ...original.config, comparisons: original.config.comparisons.filter(row => chosen.has(row.id)) }),
    metadata: { ...original.metadata, comparisons: original.metadata.comparisons.filter(row => chosen.has(row.id)) } };
  const registry = require('../scripts/balance/design-registry').createDesignRegistry(declaration.config);
  const profile = require('../scripts/balance/design-profile').compileDesignProfile(registry, declaration.config.evaluation);
  const schedule = makeSchedule(declaration.config);
  const records = await recordsFor(schedule, declaration.config, profile, require('../dist/balance-rules.cjs').createMatchRules);
  const stageManifest = { config: declaration.config, schedule, designRegistry: registry, designProfile: profile };
  const checked = require('../scripts/balance/v17-report').createV17Report({ ...declaration, records, manifest: stageManifest });
  const report = { format: 'synthetic-delta-only', tier: 1, targetOpenings: 8, scheduledGames: schedule.length,
    progress: checked.progress, runId: 'synthetic-new-005', openingEvaluations: buildOpeningEvaluationReport(records, { engineSha256: engineSha }) };
  const stages = [{ batchIndex: 0, nodes: 40000, records, manifest: stageManifest }];
  const tools = { ...full, getBatchDeclaration: () => declaration };
  const relocated = structuredClone(full.candidates('level1'));
  relocated[0].army = { upgrades: { d2: relocated[0].id } };
  assert.throws(() => reuseTools.verifyBodies(prepared, relocated), /changed.*army/);
  const recosted = structuredClone(full.candidates('level1')); recosted[0].upgradePoints = 2;
  assert.throws(() => reuseTools.verifyBodies(prepared, recosted), /changed.*upgradePoints/);
  const manifest = { study: 'level1', runId: 'synthetic-new-005', identity: { engineSha256: engineSha,
    rulesBundleSha256: prepared.receipt.source.rulesBundleSha256 } };
  const result = reuseTools.buildCompositeReport({ report, reuse: prepared, planTools: tools, manifest, stages });
  assert.equal(result.format, reuseTools.COMPOSITE_FORMAT); assert.equal(result.scheduledGames, 176);
  assert.equal(result.progress.finalizedGames, 176); assert.equal(result.reusedProgress.finalizedGames, 880);
  assert.equal(result.reusedProgress.completePairs, 439); assert.equal(result.combinedProgress.completePairs, 527);
  assert.equal(result.combinedProgress.scheduledGames, 1056); assert.equal(result.combinedProgress.finalizedGames, 1056);
  assert.equal(result.rows.length, 12); assert.ok(result.rows.every(row => row.allOpponents.score === 0.5));
  assert.ok(result.rows.some(row => row.allOpponents.openingCoverage.shared === 7));
  assert.equal(result.reuse.materialFitEligible, false); assert.equal(result.reuse.originalRecordsPreserved, true);
  assert.equal(result.reuse.pairSources.filter(row => row.cohort === 'legacy-004').length, 439);
  assert.equal(result.reuse.pairSources.filter(row => row.cohort === 'new-005').length, 88);
  assert.throws(() => reuseTools.buildCompositeReport({ report, reuse: prepared, planTools: tools,
    manifest: { ...manifest, identity: { ...manifest.identity, rulesBundleSha256: 'f'.repeat(64) } }, stages }), /adjudication bundles differ/);
  assert.throws(() => reuseTools.buildCompositeReport({ report, reuse: prepared,
    planTools: { ...tools, OPENINGS_SHA256: 'f'.repeat(64) }, manifest, stages }), /opening books differ/);
  const markdown = reuseTools.renderCompositeReport(result);
  assert.match(markdown, /mixed-context/); assert.match(markdown, /not a uniform/); assert.match(markdown, /176\/176/);
  assert.match(markdown, /roster-004/); assert.match(markdown, /not eligible/);
  // Identical duplicate durable lines do not add score weight.
  const duplicate = { ...prepared, stages: prepared.stages.map((stage, index) => index ? stage : { ...stage, records: [...stage.records, stage.records[1]] }) };
  assert.equal(reuseTools.buildCompositeReport({ report, reuse: duplicate, planTools: tools, manifest, stages }).combinedProgress.completePairs, 527);
  const forged = structuredClone(stages); forged[0].records.push({ ...sourceRecords[1], comparisonId: prepared.stages[0].comparisons[0].id });
  const foreignTools = { ...tools, getBatchDeclaration: () => ({ ...declaration, metadata: { ...declaration.metadata,
    comparisons: [...declaration.metadata.comparisons, prepared.stages[0].comparisons[0]] } }) };
  assert.throws(() => reuseTools.buildCompositeReport({ report, reuse: prepared, planTools: foreignTools, manifest, stages: forged }), /repeats an old-versus-old/);
  assert.deepEqual(hashes(source), originalHashes);
});

test('public reuse run, offline report and completed resume preserve source evidence and collect only delta games', async () => {
  const command = require('../scripts/v19-expanded-panels'), panels = require('../scripts/v19-panels');
  const out = path.join(root, 'public-expanded-run'); let checkCalls = 0;
  const executeOwned = extra => async (args, settings) => {
    const owner = read(path.join(out, panels.OWNER));
    const entry = path.join(out, owner.directory, command.OVERLAY.entryFile);
    return require(entry).runStudy(args, { ...settings, log() {}, ...extra });
  };
  await assert.rejects(command.main(['--tier', '1', '--reuse', source, '--out', out,
    '--openings', '8', '--jobs', '1'], { enginePath: process.execPath, log() {},
    execute: executeOwned({ check() { checkCalls++; throw new Error('STOP-BEFORE-WORKERS'); },
      run() { assert.fail('the setup stop cannot launch a collector'); } }) }), /STOP-BEFORE-WORKERS/);
  assert.equal(checkCalls, 1);
  const manifest = read(path.join(out, panels.MANIFEST)), stateFile = path.join(out, panels.STATE);
  assert.equal(manifest.format, 'levelup-v19-tier-panels-005-reuse');
  assert.equal(manifest.stages[0].games, 176); assert.equal(manifest.reuseIdentity.sourceRunId, prepared.identity.sourceRunId);
  const request = read(path.join(out, command.REQUEST));
  assert.equal(request.mode, 'reuse'); assert.equal(request.sourceRoot, source);
  const initial = read(path.join(out, 'panel-report.json'));
  assert.equal(initial.progress.finalizedGames, 0); assert.equal(initial.reusedProgress.finalizedGames, 880);
  assert.equal(initial.reusedProgress.completePairs, 439); assert.equal(initial.scheduledGames, 176);
  assert.deepEqual(hashes(source), originalHashes);
  assert.ok(fs.statSync(path.join(out, command.EVIDENCE, reuseTools.RECEIPT)).isFile());

  // Produce the actual delta run.json/parallel metadata, stopping before a
  // worker can launch, then populate its authoritative journal synthetically.
  const owner = read(path.join(out, panels.OWNER)), runtime = path.join(out, owner.directory);
  const owned = file => require(path.join(runtime, file));
  const copied = owned('scripts/balance/v19-expanded-reuse').readReuse(path.join(out, command.EVIDENCE),
    { study: 'level1', targetOpenings: 8, expectedEngineSha256: engineSha });
  const plan = owned('scripts/balance/v19-panel-expanded-plan').createExpandedPlan(copied);
  const declaration = plan.getBatchDeclaration('level1', 0), config = declaration.config;
  const registry = owned('scripts/balance/design-registry').createDesignRegistry(config);
  const profile = owned('scripts/balance/design-profile').compileDesignProfile(registry, config.evaluation);
  const refs = owned('scripts/balance/official-references').getOfficialReferences();
  const official = Object.fromEntries(refs.roster.map(row => [row.id, row.engineValue]));
  const validation = { native: true, games: declaration.metadata.scheduledGames, validatedOpenings: declaration.metadata.scheduledGames,
    configSha256: sha(JSON.stringify(config)), profileHash: profile.hash, registryHash: registry.hash, engineSha256: engineSha,
    bracketValueReceipt: declaration.metadata.evaluationAudit,
    referenceValueProfile: { variant: refs.profile.variant, hash: refs.profile.hash, registryHash: refs.profile.registryHash },
    referenceValues: values(refs.profile.registry.allocations, official), manualValues: values(registry.allocations, config.evaluation.pieceValues) };
  const stageRoot = path.join(out, manifest.stages[0].directory);
  owned('scripts/version17-balance').writePreflight(stageRoot, declaration, validation);
  const schedule = owned('scripts/balance/plan').makeSchedule(config);
  assert.equal(schedule.length, 176);
  const stopped = await owned('scripts/balance/parallel').runParallel({ config, schedule, outDir: stageRoot,
    jobs: 1, enginePath: process.execPath, shouldStop: () => 'now', onProgress() {} });
  assert.equal(stopped.stopped, true); assert.equal(fs.existsSync(path.join(stageRoot, 'workers')), false);
  const records = await recordsFor(schedule, config, profile, owned('dist/balance-rules.cjs').createMatchRules);
  fs.writeFileSync(path.join(stageRoot, 'games.jsonl'), records.map(row => JSON.stringify(row)).join('\n') + '\n');
  const evidenceHashes = hashes(path.join(out, command.EVIDENCE)), stateBefore = fs.readFileSync(stateFile);
  const hiddenSource = `${source}-temporarily-moved`;
  fs.renameSync(source, hiddenSource);
  try {
    const result = await command.main(['--tier', '1', '--report', out], { log() {},
      ensure() { assert.fail('an offline report must use the original owned runtime'); },
      execute: executeOwned({ run() { assert.fail('an offline report cannot collect games'); },
        check() { assert.fail('an offline report cannot preflight engines'); } }) });
    assert.equal(result.report.format, reuseTools.COMPOSITE_FORMAT);
    assert.equal(result.report.progress.finalizedGames, 176); assert.equal(result.report.reusedProgress.finalizedGames, 880);
    assert.equal(result.report.combinedProgress.finalizedGames, 1056); assert.equal(result.report.combinedProgress.completePairs, 527);
    assert.equal(read(path.join(out, 'reports/openings-8/panel-report.json')).combinedProgress.completePairs, 527);
    const resumed = await command.main(['--tier', '1', '--resume', out], { enginePath: process.execPath, log() {},
      ensure() { assert.fail('resume must retain the owned runtime'); },
      execute: executeOwned({ check() { assert.fail('a completed stage must not be preflighted again'); },
        run() { assert.fail('a completed stage must not start workers'); } }) });
    assert.equal(resumed.report.progress.finalizedGames, 176); assert.deepEqual(resumed.completed, [manifest.stages[0].id]);
    assert.equal(fs.existsSync(path.join(stageRoot, 'workers')), false);
    await assert.rejects(command.main(['--tier', '1', '--resume', out, '--openings', '16'], {
      enginePath: process.execPath, log() {}, execute: executeOwned({
        check() { assert.fail('missing legacy coverage must fail before native checks'); },
        run() { assert.fail('missing legacy coverage must fail before collection'); } }) }), /source covers 8|only 8 openings/);
    assert.deepEqual(fs.readFileSync(stateFile), stateBefore, 'coverage rejection cannot advance the target');
    assert.deepEqual(hashes(path.join(out, command.EVIDENCE)), evidenceHashes);
    assert.deepEqual(hashes(hiddenSource), originalHashes);
  } finally { fs.renameSync(hiddenSource, source); }
  assert.equal(fs.existsSync(path.join(out, panels.LOCK)), false);
  assert.deepEqual(hashes(source), originalHashes);
});
