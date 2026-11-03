'use strict';

// Synthetic controller/report fixtures only. No native executable or game runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const command = require('../scripts/level3-panel-snapshot');
const panel = require('../scripts/level3-panel');
const plan = require('../scripts/balance/level3-panel-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const base = plan.buildCampaignPlan();
const build = ({ jobs }) => ({ ...base, jobs });
const identity = { engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64), runnerSha256: 'c'.repeat(64), runnerSources: [], controllerSources: panel.controllerSources() };
const contexts = new Map();
function context(descriptor) {
  if (contexts.has(descriptor.id)) return contexts.get(descriptor.id);
  const declared = plan.getBatchDeclaration(descriptor.batchIndex, descriptor.nodes), config = declared.config;
  const designRegistry = createDesignRegistry(config), designProfile = compileDesignProfile(designRegistry, config.evaluation), schedule = makeSchedule(config);
  const manifest = { runId: `synthetic-${descriptor.id}`, config, schedule, designRegistry, designProfile,
    ...identity, parallel: { jobs: 4 }, rulesProfiles: [{ file: 'rules/fixture.ini' }] };
  const records = schedule.map(game => ({ id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
    openingId: game.openingId, aColor: game.aColor, repetition: 1, attempt: 1, status: 'completed', result: '1/2-1/2',
    variant: designProfile.variant, profileHash: designProfile.hash, registryHash: designRegistry.hash,
    registryReference: 'run.json#designRegistry', engine: config.engine, evaluation: config.evaluation,
    whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, openingMoves: game.openingMoves }));
  const result = { declared, manifest, records }; contexts.set(descriptor.id, result); return result;
}
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
function fixture(t, { savedTarget = 64, completedOpenings = 8, truncate = false } = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-panel-subset-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'run'), output = path.join(temporary, 'snapshot'); fs.mkdirSync(root);
  const declared = build({ jobs: 4 }), manifest = { ...declared, runId: 'synthetic-panel', createdAt: '2026-11-03', initialOpenings: 8, runtimeIdentity: identity, planSha256: sha(JSON.stringify(declared)) };
  write(path.join(root, panel.MANIFEST), JSON.stringify(manifest) + '\n');
  write(path.join(root, panel.STATE), JSON.stringify({ runId: manifest.runId, targetOpenings: savedTarget }) + '\n');
  write(path.join(root, panel.LOCK), JSON.stringify({ pid: process.pid, token: 'live-later-target' }) + '\n');
  const entries = new Map();
  for (const descriptor of plan.selectedStages(completedOpenings, manifest)) {
    const original = context(descriptor), directory = path.join(root, descriptor.directory);
    const records = [...original.records];
    if (truncate && descriptor.nodes === 40000 && descriptor.batchIndex === 0) records[0] = { ...records[0], status: 'truncated', result: '*' };
    const journal = JSON.stringify({ syntheticJournalFixture: descriptor.id }) + '\n';
    const preflight = JSON.stringify({ syntheticNativeProofFixture: descriptor.id }) + '\n';
    write(path.join(directory, 'run.json'), JSON.stringify(original.manifest) + '\n');
    write(path.join(directory, 'games.jsonl'), journal);
    write(path.join(directory, 'v17-preflight.json'), preflight);
    write(path.join(directory, 'rules/fixture.ini'), original.manifest.designProfile.config);
    entries.set(directory, { manifest: original.manifest, records,
      source: { observedBytes: Buffer.byteLength(journal), completePrefixSha256: sha(journal), tornTailIgnored: false,
        nativePreflight: { file: 'v17-preflight.json', sha256: sha(preflight), engineSha256: identity.engineSha256 } } });
  }
  // A later stage may actively write while the selected completed prefix is read.
  write(path.join(root, 'batch-08-n80000/run.lock'), JSON.stringify({ pid: process.pid, token: 'still-running' }));
  const readInput = directory => {
    const entry = entries.get(directory); assert.ok(entry, `Unexpected stage read: ${directory}`); return entry;
  };
  return { root, output, entries, manifest, dependencies: { build, readInput, log() {} }, args(openings = 8) { return ['--run', root, '--openings', String(openings), '--out', output]; } };
}
function snapshot(root) {
  const files = {};
  function visit(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) visit(absolute);
      else files[path.relative(root, absolute)] = { hash: sha(fs.readFileSync(absolute)), mtime: fs.statSync(absolute).mtimeMs };
    }
  }
  visit(root); return files;
}

test('snapshot CLI requires an explicit supported prefix and separate output', () => {
  assert.deepEqual(command.parseArgs(['--run', 'x', '--openings', '32', '--out', 'y']), { run: 'x', openings: 32, out: 'y' });
  assert.deepEqual(command.parseArgs(['--help']), { help: true });
  for (const args of [[], ['--run', 'x'], ['--run', 'x', '--openings', '24', '--out', 'y'], ['--run', 'x', '--openings', '32', '--out', 'y', '--engine', 'z'], ['--run', 'x', '--run', 'x', '--openings', '32', '--out', 'y']]) assert.throws(() => command.parseArgs(args));
});

test('a live 64-case campaign yields an exact first32 matchup snapshot without source changes', t => {
  const f = fixture(t, { completedOpenings: 32, truncate: true }), before = snapshot(f.root);
  const result = command.main(f.args(32), f.dependencies);
  assert.equal(result.report.progress.finalizedGames, 10560);
  assert.equal(result.report.progress.pairedGames, 10558);
  assert.equal(result.snapshot.selectedOpenings, 32); assert.equal(result.snapshot.sourceTargetOpeningsAtRead, 64);
  assert.equal(result.snapshot.stages.length, 12);
  assert.ok(result.report.nodes.every(row => row.targetOpenings === 32 && row.declaredOpenings === 32));
  assert.equal(result.report.nodes[1].progress.finalizedGames, 3520);
  assert.equal(result.report.nodes[1].progress.pairedGames, 3518);
  assert.deepEqual(snapshot(f.root), before);
  assert.deepEqual(fs.readdirSync(f.output).sort(), ['panel-report.json', 'panel-report.md', 'snapshot.json']);
  assert.match(fs.readFileSync(path.join(f.output, 'panel-report.md'), 'utf8'), /Finalized games: 10560\/10560; scored paired games: 10558/);
  assert.match(result.snapshot.scope, /no material fit/);
});

test('incomplete or still-active selected stages refuse before writing output', t => {
  const incomplete = fixture(t), first = [...incomplete.entries.keys()][0];
  incomplete.entries.get(first).records = incomplete.entries.get(first).records.slice(1);
  assert.throws(() => command.main(incomplete.args(), incomplete.dependencies), /incomplete/);
  assert.equal(fs.existsSync(incomplete.output), false);
  const active = fixture(t);
  write(path.join([...active.entries.keys()][0], 'run.lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => command.main(active.args(), active.dependencies), /still active/);
  assert.equal(fs.existsSync(active.output), false);
});

test('changed runtime identities and unfinished journal tails cannot produce a snapshot', t => {
  for (const field of ['engineSha256', 'rulesBundleSha256', 'runnerSha256', 'runnerSources']) {
    const f = fixture(t), first = [...f.entries.keys()][0], input = f.entries.get(first);
    input.manifest = { ...input.manifest, [field]: field === 'runnerSources' ? [{ file: 'foreign' }] : 'd'.repeat(64) };
    assert.throws(() => command.main(f.args(), f.dependencies), /campaign .* identity/);
    assert.equal(fs.existsSync(f.output), false);
  }
  const f = fixture(t); f.entries.get([...f.entries.keys()][0]).source = { ...f.entries.get([...f.entries.keys()][0]).source, tornTailIgnored: true };
  assert.throws(() => command.main(f.args(), f.dependencies), /unfinished journal tail/);
});

test('outputs cannot overlap the run through ordinary or linked paths, or overwrite reports', t => {
  const f = fixture(t), parent = path.dirname(f.root);
  for (const output of [f.root, path.join(f.root, 'reports/custom32'), parent]) assert.throws(() => command.validateOutput(f.root, output), /outside the campaign/);
  const link = path.join(parent, 'alias'); fs.symlinkSync(f.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => command.validateOutput(f.root, path.join(link, 'hidden-snapshot')), /outside the campaign/);
  fs.mkdirSync(f.output); write(path.join(f.output, 'existing.md'), 'keep');
  assert.throws(() => command.main(f.args(), f.dependencies), /new or empty/);
  assert.equal(fs.readFileSync(path.join(f.output, 'existing.md'), 'utf8'), 'keep');
});

test('a snapshot target cannot exceed the saved target, and existing successful output is immutable', t => {
  const f = fixture(t, { savedTarget: 8 });
  assert.throws(() => command.main(f.args(16), f.dependencies), /outside the saved campaign target/);
  const result = command.main(f.args(), f.dependencies), before = snapshot(f.output);
  assert.equal(result.report.progress.finalizedGames, 2640);
  assert.throws(() => command.main(f.args(), f.dependencies), /new or empty/);
  assert.deepEqual(snapshot(f.output), before);
});

test('source changes discovered after the reader returns fail closed without repairing data', t => {
  const f = fixture(t), original = f.dependencies.readInput;
  f.dependencies.readInput = (directory, declared) => {
    const input = original(directory, declared);
    write(path.join(directory, 'games.jsonl'), 'changed\n'); return input;
  };
  assert.throws(() => command.main(f.args(), f.dependencies), /journal changed/);
  assert.equal(fs.existsSync(f.output), false);
});
