'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const command = require('../scripts/v19-trials');
const panels = require('../scripts/v19-panels');
const hash = 'a'.repeat(64);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-trial-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const out = path.join(root, 'run'), calls = [];
  const make = directory => ({ directory, entry: path.join(directory, command.OVERLAY.entryFile), manifestSha256: hash, manifest: command.OVERLAY });
  const ensure = options => { const directory = path.join(options.cacheDirectory || path.join(root, 'cache'), `${command.OVERLAY.name}-test`); fs.mkdirSync(directory, { recursive: true }); return make(directory); };
  return { root, out, calls, make, dependencies: { log() {}, enginePath: path.join(root, 'not-executed.exe'), ensure,
    open: options => make(options.directory), execute: async (args, options) => { calls.push({ args, options }); return {}; } } };
}

test('focused selectors default to eight openings and do not accept direct panel tier arguments', () => {
  for (const [selector, tier] of Object.entries(command.SELECTORS)) {
    const parsed = command.parseArgs(['--study', selector, '--out', 'x']);
    assert.equal(parsed.selector, selector); assert.equal(parsed.tier, tier); assert.equal(parsed.openings, 8);
    assert.equal(parsed.jobs, 4);
  }
  assert.equal(command.parseArgs(['--study', 'queens', '--resume', 'x']).openings, undefined);
  for (const args of [[], ['--tier', '1', '--out', 'x'], ['--study', '__proto__', '--out', 'x'],
    ['--study', 'queens', '--out', 'x', '--study', 'pawns2'], ['--study', 'pawns3', '--out', 'x', '--openings', '24'],
    ['--study', 'pawns2', '--report', 'x', '--engine', 'x']]) assert.throws(() => command.parseArgs(args));
});

test('trial ownership resumes its exact source snapshot and refuses an ordinary panel runtime', async t => {
  const f = fixture(t);
  await command.main(['--study', 'queens', '--out', f.out], f.dependencies);
  const ownerBytes = fs.readFileSync(path.join(f.out, panels.OWNER));
  assert.equal(f.calls[0].options.initialOpenings, 8);
  await command.main(['--study', 'queens', '--resume', f.out], { ...f.dependencies, ensure() { assert.fail('must use original snapshot'); } });
  assert.deepEqual(fs.readFileSync(path.join(f.out, panels.OWNER)), ownerBytes);
  assert.equal(f.calls.length, 2);
  await assert.rejects(command.main(['--study', 'queens', '--resume', f.out], { ...f.dependencies,
    open: options => ({ ...f.make(options.directory), manifest: panels.OVERLAY, entry: path.join(options.directory, panels.OVERLAY.entryFile) }) }), /different owned runtime/);
  await assert.rejects(command.main(['--study', 'pawns2', '--resume', f.out], f.dependencies), /runtime ownership/);
  assert.equal(fs.existsSync(path.join(f.out, panels.LOCK)), false);
  assert.equal(f.calls.length, 2);
});

test('offline trial reports resolve their archived runtime without asking for an engine', async t => {
  const f = fixture(t);
  await command.main(['--study', 'pawns3', '--out', f.out], f.dependencies);
  await command.main(['--study', 'pawns3', '--report', f.out], { ...f.dependencies, enginePath: undefined, ensure() { assert.fail('offline archive only'); } });
  assert.equal(f.calls.at(-1).options.enginePath, undefined);
  assert.equal(f.calls.at(-1).options.overlaySha256, hash);
});

test('rules-only checking owns the trial extension and creates no study output', async t => {
  const f = fixture(t);
  await command.main(['--study', 'pawns2', '--check', '--rules-only'], { ...f.dependencies, enginePath: undefined });
  assert.equal(fs.existsSync(f.out), false);
  assert.equal(f.calls[0].options.enginePath, undefined);
  assert.ok(f.calls[0].args.includes('--rules-only'));
});

test('an interrupted queen snapshot resumes its original target without replacing game evidence', async t => {
  const f = fixture(t), failure = Object.assign(new Error('fixture sharing violation'), { code: 'EPERM' });
  await assert.rejects(command.main(['--study', 'queens', '--out', f.out, '--openings', '32'], { ...f.dependencies,
    ensure(options) { fs.mkdirSync(options.cacheDirectory, { recursive: true }); throw failure; } }), error => {
    assert.match(error.message, /before any games started.*sharing violation.*--resume/s);
    assert.equal(error.cause, failure); return true;
  });
  const pending = JSON.parse(fs.readFileSync(path.join(f.out, panels.OWNER)));
  assert.equal(pending.directory, null);
  assert.equal(pending.initialOpenings, 32);
  assert.deepEqual(fs.readdirSync(path.join(f.out, 'runtime')), []);
  assert.equal(fs.existsSync(path.join(f.out, panels.LOCK)), false);
  await command.main(['--study', 'queens', '--resume', f.out], f.dependencies);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.initialJobs, 4);
  assert.equal(f.calls[0].options.initialOpenings, 32);
  assert.notEqual(JSON.parse(fs.readFileSync(path.join(f.out, panels.OWNER))).directory, null);
});

test('incomplete snapshot recovery refuses unknown root or runtime data without modifying it', async t => {
  for (const where of ['root', 'runtime']) {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.out, 'runtime'), { recursive: true });
    const owner = { schemaVersion: 1, format: 'levelup-v19-panel-runtime-owner', study: 'level1', directory: null, jobs: 4, initialOpenings: 32 };
    const ownerFile = path.join(f.out, panels.OWNER), foreign = path.join(f.out, where === 'root' ? '' : 'runtime', 'games.jsonl');
    fs.writeFileSync(ownerFile, JSON.stringify(owner)); fs.writeFileSync(foreign, 'preserve all evidence\n');
    const bytes = fs.readFileSync(ownerFile);
    await assert.rejects(command.main(['--study', 'queens', '--resume', f.out], { ...f.dependencies,
      ensure() { assert.fail('foreign data must be rejected before snapshot creation'); } }), /foreign data|unverified runtime/);
    assert.deepEqual(fs.readFileSync(ownerFile), bytes);
    assert.equal(fs.readFileSync(foreign, 'utf8'), 'preserve all evidence\n');
    assert.equal(fs.existsSync(path.join(f.out, panels.LOCK)), false);
    assert.equal(f.calls.length, 0);
  }
});

test('a real queen snapshot resolves its research catalog and can recover a pending ownership receipt', async t => {
  const f = fixture(t), dependencies = { log() {}, enginePath: process.execPath, execute: async () => {
    const owner = JSON.parse(fs.readFileSync(path.join(f.out, panels.OWNER)));
    const plan = require(path.join(f.out, owner.directory, 'scripts/balance/v19-trial-plan'));
    assert.equal(plan.getBatchDeclaration('level1', 0).metadata.comparisons.length, 12);
  } };
  await command.main(['--study', 'queens', '--out', f.out, '--openings', '32'], dependencies);
  const original = JSON.parse(fs.readFileSync(path.join(f.out, panels.OWNER)));
  fs.writeFileSync(path.join(f.out, panels.OWNER), JSON.stringify({ ...original, directory: null, manifestSha256: undefined }));
  await command.main(['--study', 'queens', '--resume', f.out], dependencies);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.out, panels.OWNER))), original);
  assert.equal(fs.existsSync(path.join(f.out, panels.MANIFEST)), false, 'this test never starts a study or game');
});
