'use strict';

// Exercise actual archived stage serialization and four completed histories.
// Runtime/preflight provenance is synthetic test wiring, never balance evidence.
// The producer is stopped before it can launch a worker or an engine process.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const command = require('../scripts/v19-panel-material');
const fixture = require('./fixtures/v19-material-populated-pairs.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function sourceFiles(root) {
  const files = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else files[path.relative(root, file)] = hash(fs.readFileSync(file));
    }
  }
  walk(root); return files;
}
function inventory(allocations, values) {
  return { version: 1, pieces: Object.fromEntries(allocations.flatMap(allocation => {
    const expected = values[allocation.id];
    const tables = Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']
      .map(field => [field, expected[field.endsWith('Mg') ? 'mg' : 'eg']]));
    return [[allocation.letter, tables], [allocation.letter.toUpperCase(), tables]];
  })) };
}

let root, source, overlay, plan, fullProfile, stageFiles, originalFiles;
test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-material-populated-'));
  source = path.join(root, 'panel'); fs.mkdirSync(source);
  overlay = ensureResearchOverlay({ name: 'tier-panels-v19', entryFile: 'scripts/v19-panels.js',
    definitionFile: 'src/balance-designs-v19-panels.js', cacheDirectory: path.join(source, 'runtime') });
  const owned = name => require(path.join(overlay.directory, 'scripts', name));
  plan = owned('balance/v19-panel-current-plan');
  const parallel = owned('balance/parallel'), scheduleFor = owned('balance/plan').makeSchedule;
  const identity = owned('balance/run').getRunIdentity(process.execPath);
  const createRegistry = owned('balance/design-registry').createDesignRegistry;
  const compileProfile = owned('balance/design-profile').compileDesignProfile;
  const { writePreflight } = owned('version17-balance');
  const references = owned('balance/official-references').getOfficialReferences();
  const officialValues = Object.fromEntries(references.roster.map(row => [row.id, row.engineValue]));
  const declaration = { ...plan.buildCampaignPlan({ study: 'level1', jobs: 4 }), study: 'level1' };
  const manifest = { ...declaration, planSha256: hash(JSON.stringify(declaration)), runId: 'populated-material-regression-only',
    createdAt: '2026-11-18T00:00:00.000Z', initialOpenings: 16, overlaySha256: overlay.manifestSha256, identity };
  const owner = { schemaVersion: 1, format: 'levelup-v19-panel-runtime-owner', study: 'level1', jobs: 4, initialOpenings: 16,
    directory: path.relative(source, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 };
  for (const [file, content] of [['panel-runtime.json', owner], ['screen.json', manifest],
    ['panel-state.json', { runId: manifest.runId, targetOpenings: 16 }]]) {
    fs.writeFileSync(path.join(source, file), JSON.stringify(content));
  }
  stageFiles = [];
  for (const input of fixture.stages) {
    const descriptor = manifest.stages[input.batchIndex], stageRoot = path.join(source, descriptor.directory);
    const experiment = plan.getBatchDeclaration('level1', input.batchIndex), { config } = experiment;
    const registry = createRegistry(config), profile = compileProfile(registry, config.evaluation);
    fullProfile ||= profile;
    assert.deepEqual(profile, fullProfile, 'both batches retain one actual profile');
    const validation = { native: true, games: experiment.metadata.scheduledGames,
      validatedOpenings: experiment.metadata.scheduledGames, configSha256: hash(JSON.stringify(config)),
      profileHash: profile.hash, registryHash: registry.hash, engineSha256: identity.engineSha256,
      bracketValueReceipt: experiment.metadata.evaluationAudit,
      referenceValueProfile: { variant: references.profile.variant, hash: references.profile.hash, registryHash: references.profile.registryHash },
      referenceValues: inventory(references.profile.registry.allocations, officialValues),
      manualValues: inventory(registry.allocations, config.evaluation.pieceValues) };
    writePreflight(stageRoot, experiment, validation);
    const stopped = await parallel.runParallel({ config, schedule: scheduleFor(config), outDir: stageRoot,
      jobs: 4, enginePath: process.execPath, shouldStop: () => 'now', onProgress() {} });
    assert.equal(stopped.stopped, true);
    assert.equal(stopped.nextIndex, 0);
    assert.equal(fs.existsSync(path.join(stageRoot, 'workers')), false, 'no worker or engine was launched');
    const runFile = path.join(stageRoot, 'run.json'), archived = read(runFile);
    assert.deepEqual(Object.keys(archived.designProfile).sort(), ['config', 'hash', 'registryHash', 'variant']);
    assert.equal(archived.designProfile.registry, undefined, 'use the real compact producer schema, never a full-profile mock');
    assert.deepEqual(archived.designRegistry, registry);
    fs.writeFileSync(path.join(stageRoot, 'games.jsonl'), input.records.map(row => JSON.stringify(row)).join('\n') + '\n');
    stageFiles.push({ root: stageRoot, runFile, bytes: fs.readFileSync(runFile) });
  }
  originalFiles = sourceFiles(source);
});
test.after(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

test('populated serialized batches restore the complete actual profile without rewriting either archived descriptor', () => {
  const loaded = command.loadPanel(source);
  assert.equal(loaded.stages.length, 2); assert.equal(loaded.stages.reduce((sum, stage) => sum + stage.records.length, 0), 4);
  assert.deepEqual(loaded.profile, fullProfile);
  for (const stage of loaded.stages) assert.deepEqual(stage.profile, fullProfile);
  for (const stage of stageFiles) {
    assert.deepEqual(fs.readFileSync(stage.runFile), stage.bytes);
    assert.equal(read(stage.runFile).designProfile.registry, undefined);
  }
  assert.deepEqual(sourceFiles(source), originalFiles);
});

test('the public offline CLI actually replays populated pairs and exports samples into a separate folder', async () => {
  const out = path.join(root, 'material');
  const result = await command.main(['--run', source, '--out', out, '--bootstrap', '0'], { log() {} });
  assert.equal(result.report.status, 'unsupported-estimates', 'a deliberately tiny pipeline fixture cannot establish material prices');
  assert.equal(result.report.coverage.completedGames, 4);
  assert.ok(result.report.coverage.accepted > 0);
  assert.equal(result.report.exclusions.grantGames, 0);
  assert.equal(result.manifest.newGames, 0); assert.equal(result.manifest.engineSearches, 0);
  assert.deepEqual(result.manifest.actualProfile, fullProfile);
  assert.equal(result.dataset.profile.hash, fullProfile.hash);
  assert.ok(result.dataset.samples.length > 0);
  for (const file of ['material-report.md', 'material-report.json', 'analysis-manifest.json', 'dataset.json', 'samples.jsonl']) {
    assert.ok(fs.statSync(path.join(out, file)).size > 0, file);
  }
  assert.deepEqual(sourceFiles(source), originalFiles, 'both archived source batches and owned runtime remain byte-identical');
});

test('a changed registry or compact profile is rejected before output and restoring the original permits a retry', async () => {
  const stage = stageFiles[1];
  for (const mutate of [
    manifest => { manifest.designRegistry.definitions[0].movement += 'W'; },
    manifest => { manifest.designProfile.registryHash = 'f'.repeat(64); },
  ]) {
    const changed = JSON.parse(stage.bytes); mutate(changed); fs.writeFileSync(stage.runFile, JSON.stringify(changed));
    const out = path.join(root, 'rejected-output');
    try {
      await assert.rejects(command.main(['--run', source, '--out', out, '--bootstrap', '0'], { log() {} }), /frozen.*experiment|design profile|does not match/i);
      assert.equal(fs.existsSync(out), false, 'rejection writes no partial analysis');
      assert.deepEqual(fs.readFileSync(stageFiles[0].runFile), stageFiles[0].bytes);
    } finally { fs.writeFileSync(stage.runFile, stage.bytes); }
  }
  const out = path.join(root, 'retry-material');
  const result = await command.main(['--run', source, '--out', out, '--bootstrap', '0'], { log() {} });
  assert.equal(result.report.coverage.completedGames, 4);
  assert.deepEqual(sourceFiles(source), originalFiles);
});
