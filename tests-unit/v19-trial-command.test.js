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
