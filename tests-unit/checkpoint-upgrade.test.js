'use strict';

// Synthetic source inventories test authorization/context checks, never provide
// native proof, and never become engine-game or balance evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { FORMAT, RECEIPT_FILE, identity, validateApproval, chooseRuntimeIdentity, adaptParallelManifest,
  verifyCheckpointParent, writeUpgradeReceipt } = require('../scripts/balance/checkpoint-upgrade');
const sha = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => sha(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const sources = version => [{ file: 'run.js', sha256: sha(`run-${version}`) }, { file: 'plan.js', sha256: sha('unchanged-plan') },
    ...(version === 'new' ? [{ file: 'checkpoint-upgrade.js', sha256: sha('new-upgrade-helper') }] : [])];
  const coordinators = version => ['scripts/balance/parallel.js', 'scripts/balance/parallel-worker.js', 'scripts/parallel-balance.js']
    .map((file, index) => ({ file, sha256: sha(index ? file : `coordinator-${version}`) }));
  const identityFor = version => {
    const runnerSources = sources(version);
    return { engineSha256: sha('unchanged-engine'), rulesBundleSha256: sha('unchanged-bundle'), runnerSources, runnerSha256: fingerprint(runnerSources) };
  };
  const approval = { schemaVersion: 1, format: FORMAT, name: 'Synthetic reviewed I/O transition',
    fromCommit: '4eff71ac69bf3639069d856a393a9711c5baa550',
    from: { ...identityFor('old'), parallelSources: coordinators('old') },
    to: { ...identityFor('new'), parallelSources: coordinators('new') } };
  const config = normalizeConfig({ schemaVersion: 3, name: 'Upgrade context fixture; not game evidence', seed: 17,
    comparisons: [{ id: 'two-pawns', armyA: { upgrades: { c2: 'pawn.blue@5' } }, armyB: { upgrades: { c2: 'pawn.blue@7' } } }] });
  const schedule = makeSchedule(config), registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
  const profileSummary = { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash };
  const profiles = [{ variant: profile.variant, config: profile.config }];
  const manifest = version => {
    const values = identityFor(version);
    return { schemaVersion: 1, runId: version === 'old' ? 'frozen-parent' : 'new-runtime', createdAt: '2026-11-01T00:00:00Z',
      ...values, config, schedule, configHash: fingerprint({ config, schedule }),
      rulesHash: fingerprint({ bundleHash: values.rulesBundleSha256, runnerSha256: values.runnerSha256, profiles }),
      designRegistry: registry, designProfile: profileSummary, rulesProfiles: profiles, plyLimitBasis: 'total plies, including forced opening prefix',
      parallel: { schemaVersion: 1, jobs: 1, sources: coordinators(version),
        shards: [{ worker: 1, directory: 'workers/worker-01', scheduleIds: schedule.map(game => game.id) }] } };
  };
  return { actual: identityFor('new'), frozen: identityFor('old'), approval, config, schedule, original: manifest('old'), generated: { manifest: manifest('new'), profile } };
}
function temporary(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-checkpoint-upgrade-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; }

test('normal new/current-runtime runs need no migration or approval file', () => {
  const { actual } = fixture();
  assert.deepEqual(chooseRuntimeIdentity({ actual }), { identity: actual, receipt: null });
  assert.deepEqual(chooseRuntimeIdentity({ actual, frozen: actual }), { identity: actual, receipt: null });
});

test('only the exact reviewed source transition retains frozen experiment identity with an actual-runtime receipt', () => {
  const input = fixture(), before = clone(input);
  const selected = chooseRuntimeIdentity(input);
  assert.deepEqual(selected.identity, input.frozen);
  assert.deepEqual(selected.receipt.frozenExperimentIdentity, input.frozen);
  assert.deepEqual(selected.receipt.actualRuntimeIdentity, input.actual);
  assert.equal(selected.receipt.checkpointPolicy, 'game-boundary; graceful stops and errors flush once');
  assert.deepEqual(input, before);
});

test('changed engine, bundle and inconsistent runner fingerprints cannot be treated as storage-only', () => {
  for (const [name, mutate] of [
    ['engine', input => { input.actual.engineSha256 = sha('different-engine'); }],
    ['bundle', input => { input.actual.rulesBundleSha256 = sha('different-bundle'); }],
    ['old source', input => { input.frozen.runnerSources[0].sha256 = sha('tampered'); }],
    ['new source', input => { input.actual.runnerSources[0].sha256 = sha('tampered'); }],
  ]) {
    const input = fixture(); mutate(input); assert.throws(() => chooseRuntimeIdentity(input), /changed|inconsistent/, name);
  }
});

test('an internally consistent future runner still fails without an exact reviewed target', () => {
  const input = fixture(); input.actual.runnerSources[0].sha256 = sha('future-unreviewed');
  input.actual.runnerSha256 = fingerprint(input.actual.runnerSources);
  assert.throws(() => chooseRuntimeIdentity(input), /not the exact reviewed/);
  for (const field of ['format', 'fromCommit']) {
    const changed = fixture(); changed.approval[field] = 'different'; assert.throws(() => chooseRuntimeIdentity(changed), /approval declaration/);
  }
  const incomplete = fixture(); incomplete.approval.to.parallelSources.pop();
  assert.throws(() => validateApproval(incomplete.approval), /coordinator source/);
});

test('approval declarations cannot expand the reviewed change into search or worker code', () => {
  const changedSearch = fixture();
  changedSearch.approval.to.runnerSources.find(row => row.file === 'plan.js').sha256 = sha('changed-search-policy');
  changedSearch.approval.to.runnerSha256 = fingerprint(changedSearch.approval.to.runnerSources);
  assert.throws(() => validateApproval(changedSearch.approval), /more than the reviewed checkpoint/);
  const changedWorker = fixture(); changedWorker.approval.to.parallelSources[1].sha256 = sha('changed-worker-code');
  assert.throws(() => validateApproval(changedWorker.approval), /more than the reviewed coordinator/);
});

test('parallel adaptation changes only frozen runtime labels and records actual coordinator sources', () => {
  const input = fixture(), before = clone(input);
  const adapted = adaptParallelManifest(input.original, input.generated, input);
  assert.deepEqual(adapted.manifest, { ...input.generated.manifest, ...input.frozen,
    rulesHash: input.original.rulesHash, parallel: { ...input.generated.manifest.parallel, sources: input.original.parallel.sources } });
  assert.deepEqual(adapted.receipt.actualCoordinatorSources, input.generated.manifest.parallel.sources);
  assert.deepEqual(adapted.receipt.frozenCoordinatorSources, input.original.parallel.sources);
  assert.deepEqual(input, before);
});

test('approved I/O code cannot hide changed search, profile, registry, schedule or shard policies', () => {
  for (const field of ['config', 'schedule', 'configHash', 'designRegistry', 'designProfile', 'rulesProfiles', 'plyLimitBasis']) {
    const input = fixture(); input.generated.manifest[field] = { changed: field };
    assert.throws(() => adaptParallelManifest(input.original, input.generated, input), /changed/, field);
  }
  for (const mutate of [
    input => { input.generated.manifest.parallel.jobs = 2; },
    input => { input.generated.manifest.parallel.shards[0].scheduleIds.reverse(); },
    input => { input.generated.manifest.parallel.sources[0].sha256 = sha('unreviewed-coordinator'); },
    input => { input.original.rulesHash = sha('wrong-old-rule'); },
    input => { input.generated.manifest.rulesHash = sha('wrong-new-rule'); },
  ]) {
    const input = clone(fixture()); mutate(input);
    assert.throws(() => adaptParallelManifest(input.original, input.generated, input), /changed|reviewed/);
  }
});

test('fresh old-parent workers inherit identity only from the actual matching parent and shard', t => {
  const input = fixture(), parentDirectory = temporary(t), directory = path.join(parentDirectory, 'workers/worker-01');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(parentDirectory, 'run.json'), JSON.stringify(input.original));
  const options = { directory, checkpointParent: { directory: parentDirectory, runId: input.original.runId, worker: 1 },
    config: input.config, schedule: input.schedule, actual: input.actual, approval: input.approval };
  assert.deepEqual(verifyCheckpointParent(options), input.original);
  for (const mutate of [
    value => { value.checkpointParent.runId = 'other-run'; },
    value => { value.checkpointParent.worker = 2; },
    value => { value.directory = path.join(parentDirectory, 'other/worker-01'); },
    value => { value.schedule.reverse(); },
    value => { value.config.engine.nodes++; },
  ]) {
    const changed = clone(options); mutate(changed); assert.throws(() => verifyCheckpointParent(changed), /changed|shard|settings/);
  }
  const changedParent = clone(input.original); changedParent.parallel.sources[0].sha256 = sha('other-coordinator');
  fs.writeFileSync(path.join(parentDirectory, 'run.json'), JSON.stringify(changedParent));
  assert.throws(() => verifyCheckpointParent(options), /coordinator/);
});

test('runtime receipts are durable, idempotent and never replace conflicting provenance', t => {
  const directory = temporary(t), input = fixture(), { receipt } = chooseRuntimeIdentity(input);
  const options = { runId: 'frozen-parent' };
  writeUpgradeReceipt(directory, receipt, options);
  const file = path.join(directory, RECEIPT_FILE), before = fs.readFileSync(file);
  writeUpgradeReceipt(directory, receipt, options);
  assert.deepEqual(fs.readFileSync(file), before);
  const changed = clone(receipt); changed.actualRuntimeIdentity.runnerSha256 = sha('unreviewed-later');
  assert.throws(() => writeUpgradeReceipt(directory, changed, options), /receipt differs/);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')).length, 0);
});

test('absence of an upgrade leaves no extra receipt files', t => {
  const directory = temporary(t);
  writeUpgradeReceipt(directory, null, { runId: 'new-run' });
  assert.deepEqual(fs.readdirSync(directory), []);
});
