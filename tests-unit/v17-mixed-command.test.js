'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs, main, writeReports } = require('../scripts/mixed-reference-balance');
const { loadExperiment } = require('../scripts/balance/v17-mixed-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { writePreflight } = require('../scripts/version17-balance');
const sha = value => createHash('sha256').update(value).digest('hex');

// Synthetic proof wiring only: this temporary fixture is never engine or
// scientific evidence. It tests the strict reader and derived-file ownership.
function reportFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mixed-reference-report-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const declaration = loadExperiment(), { config } = declaration, schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const runnerSources = [{ file: 'synthetic-fixture-only.js', sha256: '1'.repeat(64) }];
  const runnerSha256 = sha(JSON.stringify(runnerSources)), rulesBundleSha256 = '2'.repeat(64), engineSha256 = '3'.repeat(64);
  const manifest = { schemaVersion: 1, runId: 'synthetic-mixed-reference-report-fixture', config, schedule, runnerSources, runnerSha256, rulesBundleSha256, engineSha256,
    configHash: sha(JSON.stringify({ config, schedule })),
    rulesHash: sha(JSON.stringify({ bundleHash: rulesBundleSha256, runnerSha256, profiles: [{ variant: profile.variant, config: profile.config }] })),
    designRegistry: registry, designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash },
    rulesProfiles: [{ variant: profile.variant, whiteKing: 0, blackKing: 0, configSha256: sha(profile.config),
      file: `rules/${profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null, profileHash: profile.hash, registryHash: registry.hash }] };
  const diagnostic = profile;
  const inventory = (allocations, values) => ({ version: 1, pieces: Object.fromEntries(allocations.flatMap(allocation => {
    const expected = values[allocation.id], tables = Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']
      .map(field => [field, expected[field.endsWith('Mg') ? 'mg' : 'eg']]));
    return [[allocation.letter, tables], [allocation.letter.toUpperCase(), tables]];
  })) });
  const validation = { games: 1824, validatedOpenings: 1824, native: true, profileHash: profile.hash, registryHash: registry.hash,
    configSha256: sha(JSON.stringify(config)), engineSha256, bracketValueReceipt: declaration.metadata.evaluationAudit,
    referenceValues: inventory(diagnostic.registry.allocations, config.evaluation.pieceValues),
    manualValues: inventory(registry.allocations, config.evaluation.pieceValues) };
  writePreflight(root, declaration, validation);
  fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify(manifest)); fs.mkdirSync(path.join(root, 'rules'));
  fs.writeFileSync(path.join(root, manifest.rulesProfiles[0].file), profile.config);
  fs.writeFileSync(path.join(root, 'games.jsonl'), '{"torn');
  return { root, declaration, manifest };
}

test('mixed-reference modes are explicit, jobs stay frozen on resume, and native engine selection is unambiguous', () => {
  assert.deepEqual(parseArgs(['--check', '--rules-only']), { check: true, 'rules-only': true });
  assert.deepEqual(parseArgs(['--out', 'new', '--jobs', '4', '--engine', 'engine.exe']), { out: 'new', jobs: 4, engine: 'engine.exe' });
  assert.deepEqual(parseArgs(['--resume', 'old', '--log', 'games']), { resume: 'old', log: 'games' });
  for (const args of [[], ['--check', '--out', 'x'], ['--resume', 'x', '--jobs', '4'], ['--out', 'x', '--jobs', '0'],
    ['--out', 'x', '--jobs', '1.5'], ['--out', 'x', '--rules-only'], ['--check', '--rules-only', '--engine', 'x'],
    ['--report', 'x', '--engine', 'x'], ['--out', 'x', '--log', 'quiet'], ['--check', '--check']]) assert.throws(() => parseArgs(args));
});

test('rules-only mode validates exactly the mixed-package declaration and cannot write or play', async () => {
  let checks = 0;
  const proof = await main(['--check', '--rules-only'], { check: async (declaration, options) => {
    checks++; assert.equal(declaration.metadata.scheduledGames, 1824); assert.equal(options.enginePath, undefined); return { native: false };
  }, persist: () => assert.fail('no files'), run: () => assert.fail('no games'), report: () => assert.fail('no reports'), log: () => {} });
  assert.equal(checks, 1); assert.equal(proof.native, false);
});

test('failed and cancelled preflight leave the requested output untouched and release signal handlers', async t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mixed-reference-command-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const directory = path.join(scratch, 'absent'), originalListeners = process.listenerCount('SIGINT');
  for (const check of [async () => { throw Error('invalid native movement'); }, async () => { process.emit('SIGINT'); return {}; }]) {
    await assert.rejects(main(['--out', directory], { enginePath: '/unused/fixture', check,
      persist: () => assert.fail('no files'), run: () => assert.fail('no games'), log: () => {} }), /invalid|cancelled/);
    assert.equal(fs.existsSync(directory), false); assert.equal(process.listenerCount('SIGINT'), originalListeners);
  }
});

test('new launches use the unchanged parallel command, four workers and the exact preflight engine', async () => {
  let persisted = false, runs = 0;
  const previous = process.env.FAIRY_STOCKFISH_PATH;
  await main(['--out', 'synthetic-only', '--engine', './fixture.exe', '--log', 'games'], {
    check: async (declaration, options) => { assert.equal(options.enginePath, path.resolve('./fixture.exe')); return { synthetic: true }; },
    persist: (directory, declaration, proof, options) => { assert.equal(directory, 'synthetic-only'); assert.equal(options.resume, false); persisted = true; },
    run: async (args, options) => {
      runs++; assert.equal(persisted, true); assert.equal(process.env.FAIRY_STOCKFISH_PATH, path.resolve('./fixture.exe'));
      assert.match(args[1], /v17-mixed-packages\.json$/); assert.deepEqual(args.slice(-4), ['--jobs', '4', '--log', 'games']);
      assert.equal(Object.keys(options.comparisonNames).length, 76); return { stopped: true };
    }, report: () => ({ report: {}, files: { markdown: 'synthetic.md' } }), log: () => {},
  });
  assert.equal(runs, 1); assert.equal(process.env.FAIRY_STOCKFISH_PATH, previous);
});

test('engine selectors are restored after a runner failure and offline reports never resolve an engine', async () => {
  const previous = process.env.FAIRY_STOCKFISH_PATH;
  await assert.rejects(main(['--out', 'synthetic-only'], { enginePath: '/unused/fixture', check: async () => ({}),
    persist: () => {}, run: async () => { throw Error('synthetic runner failure'); }, log: () => {} }), /runner failure/);
  assert.equal(process.env.FAIRY_STOCKFISH_PATH, previous);
  let reports = 0;
  await main(['--report', 'synthetic-only'], { report: directory => { reports++; assert.equal(directory, 'synthetic-only'); return { files: { markdown: 'synthetic.md' } }; },
    check: () => assert.fail('offline'), run: () => assert.fail('offline'), persist: () => assert.fail('offline'), log: () => {} });
  assert.equal(reports, 1);
});

test('offline file reports verify original proof and rules, ignore a torn tail and preserve source bytes', t => {
  const f = reportFixture(t), pinned = ['run.json', 'games.jsonl', 'v17-preflight.json', f.manifest.rulesProfiles[0].file];
  const before = pinned.map(file => fs.readFileSync(path.join(f.root, file)));
  const result = writeReports(f.root, f.declaration);
  assert.equal(result.report.source.tornTailIgnored, true); assert.equal(result.report.progress.finalizedGames, 0);
  assert.equal(result.report.mixed.rows.length, 9); assert.equal(result.report.grants.rows.length, 2); assert.equal(result.report.cohorts.length, 2);
  assert.match(fs.readFileSync(result.files.markdown, 'utf8'), /mixed/i);
  assert.match(fs.readFileSync(result.files.markdown, 'utf8'), /White score.*Black score/);
  assert.equal(fs.readFileSync(result.files.csv, 'utf8').trim().split('\n').length, 77);
  assert.ok(result.report.source.nativePreflight.sha256);
  assert.deepEqual(pinned.map(file => fs.readFileSync(path.join(f.root, file))), before);
  assert.deepEqual(writeReports(f.root, f.declaration).report, result.report);
  const proof = JSON.parse(before[2]); proof.engineSha256 = '4'.repeat(64);
  fs.writeFileSync(path.join(f.root, 'v17-preflight.json'), JSON.stringify(proof));
  const reportBefore = fs.readFileSync(result.files.json);
  assert.throws(() => writeReports(f.root, f.declaration), /preflight proof/);
  assert.deepEqual(fs.readFileSync(result.files.json), reportBefore);
});

test('offline reporting cannot replace a foreign or unowned report file and releases the report lease', t => {
  const f = reportFixture(t), foreign = path.join(f.root, 'v17-report.md');
  fs.writeFileSync(foreign, 'preserve unowned notes');
  assert.throws(() => writeReports(f.root, f.declaration), /unowned/);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'preserve unowned notes');
  assert.equal(fs.existsSync(path.join(f.root, '.v17-report.lock')), false);
});
