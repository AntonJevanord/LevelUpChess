const { createHash } = require('node:crypto');

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(reason) {
  throw new Error(`Cannot resume this run with the storage patch: ${reason}. Keep the original run directory and use its original code, or start a new run.`);
}

/** Accept only a specifically reviewed I/O patch; retain the original rules identity. */
function storageCompatibleManifest({ original, requested, profiles, approvals } = {}) {
  if (!original || !requested || typeof original.rulesHash !== 'string' || !original.rulesHash
    || typeof requested.rulesHash !== 'string' || !requested.rulesHash) fail('the run identities are missing');
  if (original.rulesHash === requested.rulesHash) return requested;

  for (const field of ['engineSha256', 'configHash', 'rulesBundleSha256']) {
    if (typeof original[field] !== 'string' || !original[field] || original[field] !== requested[field]) {
      fail(`${field} differs from the original experiment`);
    }
  }
  for (const [name, manifest] of [['original', original], ['current', requested]]) {
    if (!Array.isArray(manifest.runnerSources) || !manifest.runnerSources.length
      || typeof manifest.runnerSha256 !== 'string' || fingerprint(manifest.runnerSources) !== manifest.runnerSha256) {
      fail(`${name} runner source fingerprints are inconsistent`);
    }
  }
  if (!Array.isArray(approvals) || !approvals.some(approval => approval
    && approval.fromRunnerSha256 === original.runnerSha256
    && approval.toRunnerSha256 === requested.runnerSha256)) {
    fail('this runner change is not an approved storage-only migration');
  }
  if (!Array.isArray(profiles) || !profiles.length || profiles.some(profile => !profile
    || typeof profile.variant !== 'string' || !profile.variant || typeof profile.config !== 'string' || !profile.config)) {
    fail('the movement profiles are missing');
  }
  const movement = profiles.map(({ variant, config }) => ({ variant, config }));
  for (const [name, manifest] of [['original', original], ['current', requested]]) {
    const expected = fingerprint({
      bundleHash: requested.rulesBundleSha256,
      runnerSha256: manifest.runnerSha256,
      profiles: movement,
    });
    if (manifest.rulesHash !== expected) fail(`${name} rulesHash does not match the unchanged movement profiles`);
  }
  return { ...requested, rulesHash: original.rulesHash };
}

module.exports = { storageCompatibleManifest };
