'use strict';

// The real serializers run with synthetic metadata/results and stop before
// any worker or native engine can launch. These fixtures test provenance,
// never playing strength or native-search evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const { loadPuzzleSources } = require('../scripts/puzzles/sources');
const ROOT = path.resolve(__dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
let temporary, original, fresh, reused, originalHashes, freshHashes, reuseHashes;
function hashes(directory) {
  const result = {};
  function visit(root) { for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name); if (entry.isDirectory()) visit(file);
    else result[path.relative(directory, file)] = sha(fs.readFileSync(file));
  } }
  visit(directory); return result;
}
function values(allocations, entries) {
  return { version: 1, pieces: Object.fromEntries(allocations.flatMap(row => [row.letter, row.letter.toUpperCase()].map(letter => [letter,
    Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'].map(key => [key, entries[row.id][key.endsWith('Mg') ? 'mg' : 'eg']]))]))) };
}
async function stage(directory, runtime, manifest, plan) {
  const owned = file => require(path.join(runtime, file)), declaration = plan.getBatchDeclaration('level1', 0), { config } = declaration;
  const registry = owned('scripts/balance/design-registry.js').createDesignRegistry(config);
  const profile = owned('scripts/balance/design-profile.js').compileDesignProfile(registry, config.evaluation);
  const refs = owned('scripts/balance/official-references.js').getOfficialReferences();
  const validation = { native: true, games: declaration.metadata.scheduledGames, validatedOpenings: declaration.metadata.scheduledGames,
    configSha256: sha(JSON.stringify(config)), profileHash: profile.hash, registryHash: registry.hash,
    engineSha256: manifest.identity.engineSha256, bracketValueReceipt: declaration.metadata.evaluationAudit,
    referenceValueProfile: { variant: refs.profile.variant, hash: refs.profile.hash, registryHash: refs.profile.registryHash },
    referenceValues: values(refs.profile.registry.allocations, Object.fromEntries(refs.roster.map(row => [row.id, row.engineValue]))),
    manualValues: values(registry.allocations, config.evaluation.pieceValues) };
  const root = path.join(directory, manifest.stages[0].directory), schedule = owned('scripts/balance/plan.js').makeSchedule(config);
  owned('scripts/version17-balance.js').writePreflight(root, declaration, validation);
  assert.equal((await owned('scripts/balance/parallel.js').runParallel({ config, schedule, outDir: root,
    jobs: 1, enginePath: process.execPath, shouldStop: () => 'now', onProgress() {} })).stopped, true);
  assert.equal(fs.existsSync(path.join(root, 'workers')), false);
  const records = schedule.map(game => ({ ...game, attempt: 1, status: 'aborted', result: '*', reason: 'synthetic-source-test',
    profileHash: profile.hash, registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: config.engine, evaluation: config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  fs.writeFileSync(path.join(root, 'games.jsonl'), records.map(row => JSON.stringify(row)).join('\n') + '\n');
  return profile;
}
async function makeOriginal(directory) {
  fs.mkdirSync(directory);
  const overlay = ensureResearchOverlay({ root: ROOT, name: 'tier-panels-v19', entryFile: 'scripts/v19-panels.js',
    definitionFile: 'src/balance-designs-v19-panels.js', cacheDirectory: path.join(directory, 'runtime') });
  const owned = file => require(path.join(overlay.directory, file)), plan = owned('scripts/balance/v19-panel-current-plan.js');
  const declaration = { ...plan.buildCampaignPlan({ study: 'level1', jobs: 1 }), study: 'level1' };
  const manifest = { ...declaration, planSha256: sha(JSON.stringify(declaration)), runId: 'puzzle-test-original',
    createdAt: '2026-11-25T00:00:00.000Z', initialOpenings: 8, overlaySha256: overlay.manifestSha256,
    identity: owned('scripts/balance/run.js').getRunIdentity(process.execPath) };
  write(path.join(directory, 'panel-runtime.json'), { schemaVersion: 1, format: 'levelup-v19-panel-runtime-owner', study: 'level1', jobs: 1,
    initialOpenings: 8, directory: path.relative(directory, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 });
  write(path.join(directory, 'screen.json'), manifest);
  write(path.join(directory, 'panel-state.json'), { runId: manifest.runId, targetOpenings: 8 });
  await stage(directory, overlay.directory, manifest, plan);
}
async function makeExpanded(directory, source) {
  const command = require('../scripts/v19-expanded-panels.js'), panels = require('../scripts/v19-panels.js');
  await assert.rejects(command.main(['--tier', '1', ...(source ? ['--reuse', source] : ['--fresh']), '--out', directory,
    '--openings', '8', '--jobs', '1'], { enginePath: process.execPath, log() {},
    execute(args, settings) {
      const owner = read(path.join(directory, panels.OWNER));
      return require(path.join(directory, owner.directory, command.OVERLAY.entryFile)).runStudy(args,
        { ...settings, log() {}, check() { throw new Error('STOP-BEFORE-ENGINES'); }, run() { assert.fail('No collector may launch.'); } });
    } }), /STOP-BEFORE-ENGINES/);
  const owner = read(path.join(directory, panels.OWNER)), runtime = path.join(directory, owner.directory), manifest = read(path.join(directory, panels.MANIFEST));
  const owned = file => require(path.join(runtime, file));
  const copy = source ? owned('scripts/balance/v19-expanded-reuse.js').readReuse(path.join(directory, command.EVIDENCE)) : undefined;
  const plan = owned('scripts/balance/v19-panel-expanded-plan.js').createExpandedPlan(copy);
  await stage(directory, runtime, manifest, plan);
}
test.before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-puzzle-sources-'));
  original = path.join(temporary, 'original'); fresh = path.join(temporary, 'fresh'); reused = path.join(temporary, 'reuse');
  await makeOriginal(original); originalHashes = hashes(original);
  await makeExpanded(fresh); freshHashes = hashes(fresh);
  await makeExpanded(reused, original); reuseHashes = hashes(reused);
});
test.after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3 }); });

test('owned original and fresh expanded sources load frozen profiles and histories without changing files', async () => {
  for (const [directory, count, cohort, before] of [[original, 11, 'original-004', originalHashes], [fresh, 12, 'expanded-005', freshHashes]]) {
    const input = loadPuzzleSources(directory);
    assert.equal(input.contexts.length, 1); assert.equal(input.contexts[0].profile.registry.definitions.length, count);
    assert.equal(input.contexts[0].identity.cohort, cohort); assert.ok(input.contexts[0].records.length > 0);
    assert.equal(typeof input.contexts[0].rulesFactory, 'function'); assert.equal(input.verify(), true);
    assert.deepEqual(hashes(directory), before);
  }
});
test('expanded reuse preserves original and new rule contexts and survives the original folder moving', () => {
  const moved = `${original}-moved`; fs.renameSync(original, moved);
  try {
    const input = loadPuzzleSources(reused);
    assert.equal(input.contexts.length, 2);
    assert.deepEqual(input.contexts.map(row => row.identity.cohort), ['reused-004', 'expanded-005']);
    assert.deepEqual(input.contexts.map(row => row.profile.registry.definitions.length), [11, 12]);
    assert.notEqual(input.contexts[0].profile.hash, input.contexts[1].profile.hash);
    assert.equal(input.contexts[0].identity.runId, 'puzzle-test-original');
    assert.equal(input.contexts[0].records.length, 880); assert.equal(input.contexts[1].records.length, 176);
    assert.equal(input.verify(), true); assert.deepEqual(hashes(reused), reuseHashes); assert.deepEqual(hashes(moved), originalHashes);
  } finally { fs.renameSync(moved, original); }
});
test('active locks, changed journals and altered ownership are rejected without repairing source files', () => {
  const input = loadPuzzleSources(fresh), lock = path.join(fresh, '.v19-panel.lock');
  fs.writeFileSync(lock, 'synthetic lock');
  try { assert.throws(() => loadPuzzleSources(fresh), /Stop the source/); assert.throws(() => input.verify(), /Stop the source/); }
  finally { fs.unlinkSync(lock); }
  const journal = input.contexts[0].journal, bytes = fs.readFileSync(journal); fs.appendFileSync(journal, '\n');
  try { assert.throws(() => input.verify(), /Source files changed/); } finally { fs.writeFileSync(journal, bytes); }
  const ownerFile = path.join(fresh, 'panel-runtime.json'), owner = fs.readFileSync(ownerFile), altered = JSON.parse(owner); altered.study = 'level2'; write(ownerFile, altered);
  try { assert.throws(() => loadPuzzleSources(fresh), /ownership|study|target/); } finally { fs.writeFileSync(ownerFile, owner); }
  assert.deepEqual(hashes(fresh), freshHashes);
});

test('owned runtime corruption and linked source directories are rejected', () => {
  const input = loadPuzzleSources(original), owner = read(path.join(original, 'panel-runtime.json'));
  const script = path.join(original, owner.directory, 'scripts/v19-panels.js'), bytes = fs.readFileSync(script);
  fs.appendFileSync(script, '\n');
  try { assert.throws(() => input.verify(), /snapshot file changed/); } finally { fs.writeFileSync(script, bytes); }
  const runtime = path.join(original, 'runtime'), moved = `${runtime}-moved`;
  fs.renameSync(runtime, moved);
  try {
    fs.symlinkSync(moved, runtime, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => loadPuzzleSources(original), /ordinary directory/);
  } finally {
    if (fs.lstatSync(runtime, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(runtime);
    fs.renameSync(moved, runtime);
  }
  assert.deepEqual(hashes(original), originalHashes);
});
