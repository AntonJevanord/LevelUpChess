'use strict';

// Bounded rule fixtures and value diagnostics only: never searches or games.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--full-native') || new Set(args).size !== args.length) {
  console.error('Use: node prototypes/nightrider-hop/verify.cjs [--full-native]');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', path.resolve(__dirname, '../../tests-unit/v17-nightrider-hop.test.js')], {
    cwd: path.resolve(__dirname, '../..'), stdio: 'inherit',
    env: { ...process.env, ...(args.includes('--full-native') ? { NIGHTRIDER_FULL_NATIVE: '1' } : {}) },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
