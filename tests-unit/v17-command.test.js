const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { parseArgs, validateManifest, validatePreflight, writePreflight, readReportInput, writeReports, main } = require('../scripts/version17-balance');
const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v17-command-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function context(experiment = 'level3') {
  const declaration = loadExperiment(experiment), { config } = declaration, schedule = makeSchedule(config);
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const runnerSources = [{ file: 'synthetic-fixture-only.js', sha256: '1'.repeat(64) }];
  const runnerSha256 = sha(JSON.stringify(runnerSources)), rulesBundleSha256 = '2'.repeat(64), engineSha256 = '3'.repeat(64);
  const manifest = { schemaVersion: 1, runId: `synthetic-${experiment}`, config, schedule,
    configHash: sha(JSON.stringify({ config, schedule })), runnerSources, runnerSha256, rulesBundleSha256, engineSha256,
    rulesHash: sha(JSON.stringify({ bundleHash: rulesBundleSha256, runnerSha256, profiles: [{ variant: profile.variant, config: profile.config }] })),
    designRegistry: registry, designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash },
    rulesProfiles: [{ variant: profile.variant, whiteKing: 0, blackKing: 0, configSha256: sha(profile.config),
      file: `rules/${profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null, profileHash: profile.hash, registryHash: registry.hash }],
  };
  const pieces = {};
  for (const reference of getOfficialReferences().roster) {
    const letter = registry.allocations.find(allocation => allocation.id === reference.id).letter;
    const values = Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'].map(field => [field, reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg']]));
    pieces[letter] = values; pieces[letter.toUpperCase()] = values;
  }
  const validation = { games: schedule.length, validatedOpenings: schedule.length, native: true,
    profileHash: profile.hash, registryHash: registry.hash, engineSha256, configSha256: sha(JSON.stringify(config)), referenceValues: { version: 1, pieces } };
  return { declaration, manifest, validation };
}
function installRun(directory, value, records = [], tail = '') {
  writePreflight(directory, value.declaration, value.validation);
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(value.manifest));
  fs.mkdirSync(path.join(directory, 'rules'));
  fs.writeFileSync(path.join(directory, value.manifest.rulesProfiles[0].file), value.manifest.designProfile.config);
  fs.writeFileSync(path.join(directory, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join('') + tail);
}
function record(value, game, result) {
  const whiteStrength = game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB;
  const blackStrength = game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB;
  return { id: game.id, comparisonId: game.comparisonId, pairId: game.pairId, openingId: game.openingId, openingMoves: game.openingMoves,
    aColor: game.aColor, attempt: 1, status: 'completed', result, reason: 'synthetic-report-fixture',
    profileHash: value.manifest.designProfile.hash, registryHash: value.manifest.designProfile.registryHash,
    registryReference: 'run.json#designRegistry', variant: value.manifest.designProfile.variant,
    engine: value.declaration.config.engine, whiteStrength, blackStrength };
}

test('command modes are explicit, one experiment runs at a time, and frozen resumes cannot change jobs', () => {
  assert.deepEqual(parseArgs(['--experiment', 'level3', '--check', '--rules-only']), { experiment: 'level3', check: true, 'rules-only': true });
  assert.equal(parseArgs(['--experiment', 'reference-2v2', '--out', 'results', '--jobs', '4']).jobs, 4);
  for (const args of [[], ['--experiment', 'all', '--check'], ['--experiment', 'level3'], ['--experiment', 'level3', '--check', '--out', 'x'],
    ['--experiment', 'pawn-grants', '--resume', 'x', '--jobs', '4'], ['--experiment', 'level3', '--out', 'x', '--rules-only'],
    ['--experiment', 'level3', '--report', 'x', '--log', 'plies'], ['--experiment', 'level3', '--out', 'x', '--jobs', '0'],
    ['--experiment', 'level3', '--check', '--check']]) assert.throws(() => parseArgs(args));
});

test('check-only never launches a run, persists results, or needs an engine for rules-only validation', async () => {
  let calls = 0;
  const proof = await main(['--experiment', 'pawn-grants', '--check', '--rules-only'], {
    check: async (declaration, options) => { calls++; assert.equal(declaration.config.schemaVersion, 3); assert.equal(options.enginePath, undefined); return { native: false }; },
    run: () => assert.fail('check must never play'), persist: () => assert.fail('check must never write results'), log: () => {},
  });
  assert.equal(calls, 1); assert.equal(proof.native, false);
});

test('failed or cancelled native preflight leaves a new output absent and never starts workers', async t => {
  const directory = path.join(temporary(t), 'new-run');
  for (const check of [async () => { throw new Error('incompatible native movement'); }, async () => { process.emit('SIGINT'); return {}; }]) {
    await assert.rejects(main(['--experiment', 'level3', '--out', directory], { check, enginePath: '/unused/fake-engine',
      run: () => assert.fail('failed check must not launch'), persist: () => assert.fail('failed check must not write'), log: () => {} }), /incompatible|cancelled/);
    assert.equal(fs.existsSync(directory), false);
  }
});

test('a successful launch delegates one frozen config and human-readable comparison names to the existing runner', async t => {
  const value = context(), directory = path.join(temporary(t), 'run');
  let calls = 0, persisted = 0;
  await main(['--experiment', 'level3', '--out', directory], { enginePath: '/unused/fake-engine', check: async () => value.validation,
    persist: (out, declaration, validation, options) => { persisted++; assert.equal(out, directory); assert.equal(declaration.experiment, 'level3'); assert.deepEqual(validation, value.validation); assert.equal(options.resume, false); },
    run: async (args, options) => { calls++; assert.equal(persisted, 1); assert.deepEqual(args.slice(-2), ['--jobs', '4']);
      assert.equal(args[0], '--config'); assert.match(args[1], /v17-level3-screen\.json$/); assert.equal(Object.keys(options.comparisonNames).length, 52);
      assert.ok(Object.values(options.comparisonNames).some(item => item.b === 'Unicorn')); return { stopped: true }; },
    report: () => ({ report: {}, files: { markdown: 'synthetic-report.md' } }), log: () => {},
  });
  assert.equal(calls, 1);
});

test('preflight proof is durable, preserves its first bytes, and refuses foreign output or changed context', t => {
  const root = temporary(t), value = context(), directory = path.join(root, 'own');
  writePreflight(directory, value.declaration, value.validation);
  const file = path.join(directory, 'v17-preflight.json'), before = fs.readFileSync(file);
  writePreflight(directory, value.declaration, value.validation);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(fs.readdirSync(directory), ['v17-preflight.json']);
  const foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'notes.txt'), 'preserve');
  assert.throws(() => writePreflight(foreign, value.declaration, value.validation), /empty output/);
  assert.deepEqual(fs.readdirSync(foreign), ['notes.txt']);
  for (const changed of [{ ...value.validation, engineSha256: '4'.repeat(64) }, { ...value.validation, native: false }, { ...value.validation, profileHash: '5'.repeat(64) }]) {
    assert.throws(() => writePreflight(directory, value.declaration, changed), /preflight proof/);
    assert.deepEqual(fs.readFileSync(file), before);
  }
});

test('resume binds native proof to the exact manifest and preserves the original proof without changing workers', async t => {
  const directory = path.join(temporary(t), 'run'), value = context('reference-2v2');
  installRun(directory, value);
  const before = fs.readFileSync(path.join(directory, 'v17-preflight.json'));
  let calls = 0;
  await main(['--experiment', 'reference-2v2', '--resume', directory], { enginePath: '/unused/fake-engine', check: async () => value.validation,
    run: async args => { calls++; assert.deepEqual(args, ['--resume', directory]); return { stopped: true }; },
    report: () => ({ report: {}, files: { markdown: 'synthetic-report.md' } }), log: () => {},
  });
  assert.equal(calls, 1); assert.deepEqual(fs.readFileSync(path.join(directory, 'v17-preflight.json')), before);
  const changed = { ...value.validation, engineSha256: '6'.repeat(64) };
  assert.throws(() => writePreflight(directory, value.declaration, changed, { resume: true }), /preflight proof/);
  assert.equal(calls, 1);
});

test('offline report verifies archived context, ignores torn tails and never needs an executable or changes source evidence', async t => {
  const directory = path.join(temporary(t), 'run'), value = context('reference-2v2');
  const [a, b] = value.manifest.schedule;
  const resultForA = game => game.aColor === 'w' ? '1-0' : '0-1';
  installRun(directory, value, [record(value, a, resultForA(a)), record(value, b, '1/2-1/2')], '{"torn":');
  const before = ['run.json', 'games.jsonl', 'v17-preflight.json'].map(name => fs.readFileSync(path.join(directory, name)));
  const output = await main(['--experiment', 'reference-2v2', '--report', directory], {
    check: () => assert.fail('offline reports must not validate with a native engine'), run: () => assert.fail('offline reports must not run games'), log: () => {},
  });
  assert.equal(output.report.progress.completePairs, 1);
  assert.equal(output.report.comparisons.find(item => item.id === a.comparisonId).score, 0.75);
  assert.equal(output.report.source.tornTailIgnored, true);
  assert.match(fs.readFileSync(output.files.markdown, 'utf8'), /75\.00%/);
  assert.match(fs.readFileSync(output.files.csv, 'utf8'), /0\.75/);
  assert.equal(read(output.files.json).source.nativePreflight.file, 'v17-preflight.json');
  for (const [index, name] of ['run.json', 'games.jsonl', 'v17-preflight.json'].entries()) assert.deepEqual(fs.readFileSync(path.join(directory, name)), before[index]);
  assert.equal(fs.existsSync(path.join(directory, '.v17-report.lock')), false);
});

test('foreign reports, changed rule files, altered proof tables and changed manifests fail before deriving scores', t => {
  for (const change of [
    (directory, value) => fs.appendFileSync(path.join(directory, value.manifest.rulesProfiles[0].file), '\n# changed'),
    (directory, value) => { const file = path.join(directory, 'v17-preflight.json'), proof = read(file); const type = Object.keys(proof.validation.referenceValues.pieces)[0]; proof.validation.referenceValues.pieces[type].evalMg++; fs.writeFileSync(file, JSON.stringify(proof)); },
    directory => { const file = path.join(directory, 'run.json'), manifest = read(file); manifest.config.name += ' changed'; fs.writeFileSync(file, JSON.stringify(manifest)); },
    directory => fs.writeFileSync(path.join(directory, 'v17-report.md'), 'handwritten document'),
  ]) {
    const directory = path.join(temporary(t), 'run'), value = context(); installRun(directory, value); change(directory, value);
    assert.throws(() => writeReports(directory, value.declaration));
    assert.equal(fs.existsSync(path.join(directory, '.v17-report.lock')), false);
    assert.equal(fs.existsSync(path.join(directory, 'v17-report.json')), false);
  }
});
