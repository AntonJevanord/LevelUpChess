'use strict';

// The version-18 catalog deliberately changes the live runner fingerprint.
// Verify the historical source tree, then constrain the live differences.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { getRunIdentity } = require('../../scripts/balance/run');

const ROOT = path.resolve(__dirname, '../..');
const CLOSEOUT = 'v0.17.23';
const CATALOG = '../../src/design-catalog.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function archived(file) {
  return execFileSync('git', ['show', `${CLOSEOUT}:${file}`], {
    cwd: ROOT, maxBuffer: 16 * 1024 * 1024,
  });
}

function assertV17CloseoutIdentity(enginePath, baseline) {
  const current = getRunIdentity(enginePath);
  const historicalSources = baseline.runnerSources.map(({ file }) => ({ file,
    sha256: sha(archived(path.posix.normalize(path.posix.join('scripts/balance', file)))
      .toString('utf8').replace(/\r\n/g, '\n')),
  }));
  assert.deepEqual(historicalSources, baseline.runnerSources,
    'The version-17 closeout tag must retain every pre-panel source checksum.');
  assert.equal(sha(JSON.stringify(historicalSources)), baseline.runnerSha256,
    'The archived complete runner identity must match the pre-panel receipt.');
  assert.equal(sha(archived('dist/balance-rules.cjs')), baseline.rulesBundleSha256,
    'The archived version-17 balance bundle must remain byte-identical.');
  assert.equal(current.rulesBundleSha256, baseline.rulesBundleSha256,
    'Version 18 must not rebuild the historical balance bundle.');
  assert.equal(current.engineSha256, baseline.engineSha256,
    'The selected native executable must remain unchanged.');
  assert.deepEqual(current.runnerSources.map(row => row.file), baseline.runnerSources.map(row => row.file),
    'The current runner inventory must retain its declared sources.');
  const changed = current.runnerSources.filter((row, index) => row.sha256 !== baseline.runnerSources[index].sha256);
  assert.deepEqual(changed.map(row => row.file), [CATALOG],
    'Only the explicitly activated version-18 catalog may differ from version 17.');
  assert.notEqual(current.runnerSha256, baseline.runnerSha256,
    'The live version-18 runner must not claim the original version-17 identity.');
  return current;
}

module.exports = { assertV17CloseoutIdentity };
