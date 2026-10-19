const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { storageCompatibleManifest } = require('../scripts/balance/resume-compatibility');

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture() {
  const profiles = [{ variant: 'levelup-balance-0-0', config: '[levelup-balance-0-0:chess]\nking = k:K\n' }];
  const manifest = version => {
    const runnerSources = [{ file: 'run.js', sha256: `run-${version}` }, { file: 'storage.js', sha256: `storage-${version}` }];
    const runnerSha256 = fingerprint(runnerSources);
    const rulesBundleSha256 = 'unchanged-bundle';
    return {
      runId: version, configHash: 'unchanged-config', engineSha256: 'unchanged-engine',
      rulesBundleSha256, runnerSha256, runnerSources,
      rulesHash: fingerprint({ bundleHash: rulesBundleSha256, runnerSha256, profiles }),
    };
  };
  const original = manifest('original');
  const requested = manifest('storage-fix');
  return {
    original, requested, profiles,
    approvals: [{ fromRunnerSha256: original.runnerSha256, toRunnerSha256: requested.runnerSha256 }],
  };
}

test('an unchanged rules identity returns the requested manifest unchanged', () => {
  const { original } = fixture();
  const requested = { ...original, runId: 'new-invocation' };
  assert.equal(storageCompatibleManifest({ original, requested }), requested);
});

test('an approved storage patch preserves original rules identity without mutating either manifest', () => {
  const input = fixture();
  const before = structuredClone(input);
  const compatible = storageCompatibleManifest(input);
  assert.deepEqual(compatible, { ...input.requested, rulesHash: input.original.rulesHash });
  assert.notEqual(compatible, input.requested);
  assert.deepEqual(input, before);
});

for (const field of ['engineSha256', 'configHash', 'rulesBundleSha256']) {
  test(`a storage migration cannot change ${field}`, () => {
    const input = fixture();
    input.requested[field] = 'changed';
    assert.throws(() => storageCompatibleManifest(input), new RegExp(`${field} differs`));
  });
}

test('unapproved runner changes, including a later code version, are rejected', () => {
  for (const change of ['missing', 'wrong-source', 'wrong-target']) {
    const input = fixture();
    if (change === 'missing') input.approvals = [];
    else input.approvals[0][change === 'wrong-source' ? 'fromRunnerSha256' : 'toRunnerSha256'] = 'different-runner';
    assert.throws(() => storageCompatibleManifest(input), /not an approved storage-only migration/);
  }
});

test('both runner source arrays must reproduce their recorded fingerprints', () => {
  for (const name of ['original', 'requested']) {
    const input = fixture();
    input[name].runnerSources[0].sha256 = 'tampered';
    assert.throws(() => storageCompatibleManifest(input), /runner source fingerprints are inconsistent/);
  }
});

test('a changed movement profile cannot hide behind an approved I/O patch', () => {
  const input = fixture();
  input.profiles[0].config += 'king = k:KmN\n';
  assert.throws(() => storageCompatibleManifest(input), /original rulesHash does not match/);
});

test('both original and requested combined rules hashes are verified', () => {
  for (const name of ['original', 'requested']) {
    const input = fixture();
    input[name].rulesHash = 'incorrect';
    assert.throws(() => storageCompatibleManifest(input), /rulesHash does not match/);
  }
});

test('missing identities and profiles produce an actionable refusal', () => {
  assert.throws(() => storageCompatibleManifest(), /Keep the original run directory/);
  const input = fixture();
  input.profiles = [];
  assert.throws(() => storageCompatibleManifest(input), /movement profiles are missing/);
});
