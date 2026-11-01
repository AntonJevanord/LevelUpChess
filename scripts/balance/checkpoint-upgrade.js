'use strict';

// A narrowly reviewed storage-only runtime can continue a frozen experiment.
// Original manifests still describe the experiment's original identity. A
// separate receipt records the actual runtime; neither identity is invented.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');

const APPROVAL_FILE = path.join(__dirname, 'resume-approvals/v17-game-checkpoints.json');
const RECEIPT_FILE = 'checkpoint-runtime-upgrade.json';
const FORMAT = 'levelup-game-checkpoint-runtime-approval';
const IDENTITY_FIELDS = ['rulesBundleSha256', 'engineSha256', 'runnerSources', 'runnerSha256'];
const sha = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => sha(JSON.stringify(value));
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identity = value => Object.fromEntries(IDENTITY_FIELDS.map(field => [field, value?.[field]]));
function fail(reason) { throw new Error(`Cannot apply the game-checkpoint storage upgrade: ${reason}. Use the original branch or checkout for this run, or start a new run.`); }

function inventory(value, label) {
  if (!value || !digest(value.runnerSha256) || !Array.isArray(value.runnerSources) || !value.runnerSources.length
    || value.runnerSha256 !== fingerprint(value.runnerSources)
    || value.runnerSources.some(row => typeof row?.file !== 'string' || !row.file || !digest(row.sha256))
    || new Set(value.runnerSources.map(row => row.file)).size !== value.runnerSources.length) fail(`${label} source inventory is inconsistent`);
}
function validateApproval(value) {
  if (value?.schemaVersion !== 1 || value.format !== FORMAT || typeof value.name !== 'string' || !value.name
    || value.fromCommit !== '4eff71ac69bf3639069d856a393a9711c5baa550') fail('the reviewed approval declaration is missing or changed');
  for (const [label, side] of [['old', value.from], ['new', value.to]]) {
    inventory(side, label);
    if (!Array.isArray(side.parallelSources) || side.parallelSources.length !== 3
      || side.parallelSources.some(row => typeof row?.file !== 'string' || !digest(row.sha256))) fail(`${label} coordinator source inventory is inconsistent`);
  }
  const old = new Map(value.from.runnerSources.map(row => [row.file, row.sha256]));
  const current = new Map(value.to.runnerSources.map(row => [row.file, row.sha256]));
  if (!old.has('run.js') || old.has('checkpoint-upgrade.js') || !current.has('checkpoint-upgrade.js')
    || current.size !== old.size + 1 || [...old].some(([file, hash]) => !current.has(file) || file !== 'run.js' && current.get(file) !== hash)
    || current.get('run.js') === old.get('run.js')) fail('the approval changes more than the reviewed checkpoint runner and helper');
  const coordinatorFiles = ['scripts/balance/parallel.js', 'scripts/balance/parallel-worker.js', 'scripts/parallel-balance.js'];
  if (value.from.parallelSources.some((row, index) => row.file !== coordinatorFiles[index])
    || value.to.parallelSources.some((row, index) => row.file !== coordinatorFiles[index]
      || index > 0 && row.sha256 !== value.from.parallelSources[index].sha256)
    || value.from.parallelSources[0].sha256 === value.to.parallelSources[0].sha256) fail('the approval changes more than the reviewed coordinator');
  return value;
}
function loadApproval() {
  const bytes = fs.readFileSync(APPROVAL_FILE, 'utf8').replace(/\r\n/g, '\n');
  return { approval: validateApproval(JSON.parse(bytes)), sha256: sha(bytes) };
}

function chooseRuntimeIdentity({ actual, frozen, approval: supplied } = {}) {
  inventory(actual, 'actual runtime');
  if (!digest(actual.rulesBundleSha256) || !digest(actual.engineSha256)) fail('the actual engine or rules-bundle identity is missing');
  if (!frozen) return { identity: identity(actual), receipt: null };
  inventory(frozen, 'frozen experiment');
  for (const field of ['engineSha256', 'rulesBundleSha256']) if (actual[field] !== frozen[field]) fail(`${field} changed`);
  if (isDeepStrictEqual(identity(actual), identity(frozen))) return { identity: identity(actual), receipt: null };
  const loaded = supplied ? { approval: validateApproval(supplied), sha256: fingerprint(supplied) } : loadApproval();
  const { approval } = loaded;
  if (frozen.runnerSha256 !== approval.from.runnerSha256 || actual.runnerSha256 !== approval.to.runnerSha256
    || !isDeepStrictEqual(frozen.runnerSources, approval.from.runnerSources)
    || !isDeepStrictEqual(actual.runnerSources, approval.to.runnerSources)) fail('this runtime transition is not the exact reviewed I/O-only change');
  return { identity: identity(frozen), receipt: {
    schemaVersion: 1, format: 'levelup-game-checkpoint-runtime-receipt', approval: approval.name,
    approvalSha256: loaded.sha256, checkpointPolicy: 'game-boundary; graceful stops and errors flush once',
    frozenExperimentIdentity: identity(frozen), actualRuntimeIdentity: identity(actual),
  } };
}

/** Project only a reviewed runtime difference. All scientific fields remain
 * equal before the original frozen source identities are retained. */
function adaptParallelManifest(original, generated, { approval } = {}) {
  if (!original) return { manifest: generated.manifest, receipt: null };
  const requested = generated.manifest;
  const selected = chooseRuntimeIdentity({ actual: requested, frozen: original, approval });
  if (!selected.receipt) return { manifest: requested, receipt: null };
  for (const field of ['schemaVersion', 'config', 'schedule', 'configHash', 'engineSha256', 'rulesBundleSha256',
    'designRegistry', 'designProfile', 'rulesProfiles', 'plyLimitBasis']) {
    if (!isDeepStrictEqual(original[field], requested[field])) fail(`parallel ${field} changed`);
  }
  const loaded = approval ? { approval: validateApproval(approval) } : loadApproval();
  if (!isDeepStrictEqual(original.parallel?.sources, loaded.approval.from.parallelSources)
    || !isDeepStrictEqual(requested.parallel?.sources, loaded.approval.to.parallelSources)) fail('the coordinator change is not the exact reviewed transition');
  const originalParallel = { ...original.parallel }; delete originalParallel.sources;
  const requestedParallel = { ...requested.parallel }; delete requestedParallel.sources;
  if (!isDeepStrictEqual(originalParallel, requestedParallel)) fail('worker jobs or shard assignments changed');
  const profiles = [{ variant: generated.profile.variant, config: generated.profile.config }];
  for (const [label, manifest] of [['frozen', original], ['actual', requested]]) {
    if (manifest.rulesHash !== fingerprint({ bundleHash: manifest.rulesBundleSha256, runnerSha256: manifest.runnerSha256, profiles })) fail(`${label} rulesHash changed`);
  }
  return { manifest: { ...requested, ...selected.identity, rulesHash: original.rulesHash,
    parallel: { ...requested.parallel, sources: original.parallel.sources } },
    receipt: { ...selected.receipt, frozenCoordinatorSources: original.parallel.sources, actualCoordinatorSources: requested.parallel.sources } };
}

/** A new worker in an old parent must use that parent's verified experiment
 * identity. Resolve the actual parent on disk, not an arbitrary identity sent
 * over IPC, and bind the child to its original config and exact shard. */
function verifyCheckpointParent({ directory, checkpointParent, config, schedule, actual, approval } = {}) {
  if (!checkpointParent || typeof checkpointParent.directory !== 'string' || !Number.isSafeInteger(checkpointParent.worker)
    || typeof checkpointParent.runId !== 'string') fail('a worker inheritance request is malformed');
  const parentDirectory = path.resolve(checkpointParent.directory), workerDirectory = path.resolve(directory);
  const parent = JSON.parse(fs.readFileSync(path.join(parentDirectory, 'run.json'), 'utf8'));
  if (parent.runId !== checkpointParent.runId || !parent.parallel || parent.parallel.schemaVersion !== 1) fail('worker parent ownership changed');
  const shard = parent.parallel.shards?.find(value => value.worker === checkpointParent.worker);
  if (!shard || !Array.isArray(shard.scheduleIds) || !/^workers\/worker-\d{2}$/.test(shard.directory)
    || path.resolve(parentDirectory, shard.directory) !== workerDirectory
    || path.dirname(path.dirname(workerDirectory)) !== parentDirectory) fail('the worker does not belong to the recorded parent shard');
  const canonicalConfig = normalizeConfig(config), canonicalSchedule = makeSchedule(canonicalConfig);
  if (!isDeepStrictEqual(parent.config, canonicalConfig) || !isDeepStrictEqual(parent.schedule, canonicalSchedule)
    || parent.configHash !== fingerprint({ config: canonicalConfig, schedule: canonicalSchedule })) fail('the parent experiment settings or schedule changed');
  const byId = new Map(parent.schedule.map(game => [game.id, game]));
  const expected = shard.scheduleIds.map(id => byId.get(id));
  if (expected.some(game => !game) || new Set(shard.scheduleIds).size !== shard.scheduleIds.length
    || !isDeepStrictEqual(expected, schedule)) fail('the worker schedule differs from its frozen shard');
  const selected = chooseRuntimeIdentity({ actual, frozen: parent, approval });
  if (!selected.receipt) fail('worker identity inheritance is only allowed for the reviewed upgrade');
  const loaded = approval ? { approval: validateApproval(approval) } : loadApproval();
  if (!isDeepStrictEqual(parent.parallel.sources, loaded.approval.from.parallelSources)) fail('the frozen parent coordinator is not approved');
  return parent;
}

function writeUpgradeReceipt(directory, receipt, { runId } = {}) {
  if (!receipt) return;
  if (typeof runId !== 'string' || !runId) fail('the receipt has no run owner');
  const value = { ...receipt, runId }, file = path.join(directory, RECEIPT_FILE);
  if (fs.existsSync(file)) {
    if (!isDeepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), value)) fail('an existing runtime receipt differs; it was not replaced');
    return;
  }
  const temporary = path.join(directory, `.checkpoint-runtime-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    if (fs.existsSync(file)) fail('another runtime receipt appeared');
    renameWithRetrySync(temporary, file);
    let directoryFd;
    try { directoryFd = fs.openSync(directory, 'r'); fs.fsyncSync(directoryFd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
    finally { if (directoryFd !== undefined) fs.closeSync(directoryFd); }
  } finally { if (fd !== undefined) fs.closeSync(fd); unlinkWithRetrySync(temporary); }
}

module.exports = { APPROVAL_FILE, RECEIPT_FILE, FORMAT, identity, validateApproval, loadApproval,
  chooseRuntimeIdentity, adaptParallelManifest, verifyCheckpointParent, writeUpgradeReceipt };
