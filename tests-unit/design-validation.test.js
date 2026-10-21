'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validateDesignConfig } = require('../scripts/balance/validate-designs');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { UciEngine } = require('../scripts/balance/uci');

function config() {
  return {
    schemaVersion: 2, name: 'Validate designs without collecting games', repetitions: 2,
    engine: { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 },
    openings: [{ id: 'start', moves: [] }, { id: 'e-pawns', moves: ['e2e4', 'e7e5'] }],
    comparisons: [
      { id: 'camel-v-short-queens', armyA: { upgrades: { b1: 'knight.purple@3' } }, armyB: { upgrades: { d1: 'queen.purple@2' } } },
      { id: 'companion-v-camel', armyA: { upgrades: { d1: 'queen.purple@3' } }, armyB: { upgrades: { b1: 'knight.purple@3' } } },
      { id: 'control', armyA: {}, armyB: {} },
    ],
  };
}

test('validates full color-swapped schedules and queen deployment without results files or engine searches', async t => {
  const input = config(), before = structuredClone(input);
  t.mock.method(fs, 'mkdtempSync', () => { throw new Error('WASM validation must not create a directory.'); });
  t.mock.method(UciEngine.prototype, 'search', () => { throw new Error('Validation must not search for a game move.'); });
  const messages = [];
  const result = await validateDesignConfig(input, { onProgress: message => messages.push(message) });
  assert.deepEqual(input, before);
  assert.equal(result.games, makeSchedule(input).length);
  assert.equal(result.games, 24);
  assert.equal(result.pairs, 12);
  assert.equal(result.comparisons, 3);
  assert.equal(result.definitions, 3);
  assert.equal(result.validatedOpenings, 12, 'repetitions reuse validation, but both colors are checked');
  assert.equal(result.startingPositions, 5);
  assert.equal(result.openingPositions, 10);
  assert.equal(result.native, false);
  assert.equal(result.movementChecks, 0);
  assert.equal(result.nativePositionChecks, 0);
  const profile = compileDesignProfile(createDesignRegistry(normalizeConfig(input)));
  assert.equal(result.profileHash, profile.hash);
  assert.equal(result.registryHash, profile.registryHash);
  assert.ok(messages.some(message => message.includes('12 army/color/opening combinations')));
});

test('illegal or terminal prefixes identify the comparison, opening and color', async () => {
  for (const [moves, pattern] of [
    [['e2e5'], /Illegal opening move: e2e5/],
    [['f2f3', 'e7e5', 'g2g4', 'd8h4'], /terminal position/],
  ]) {
    const input = config();
    input.comparisons = [{ id: 'ordinary-control', armyA: {}, armyB: {} }];
    input.openings = [{ id: 'bad-prefix', moves }];
    await assert.rejects(validateDesignConfig(input), error => /bad-prefix, A as (White|Black)/.test(error.message) && pattern.test(error.message));
  }
});

test('optional orthodox-source checks reject legal prefixes assigned to a newly inserted queen', async () => {
  const input = config();
  // Remove the d-pawn so the extra queen has a clear two-square line.
  input.comparisons = [{ id: 'short-queens-both', armyA: { upgrades: { d1: 'queen.purple@2' }, remove: ['d2'] }, armyB: { upgrades: { d1: 'queen.purple@2' }, remove: ['d2'] } }];
  input.openings = [{ id: 'repurposed-pawn', moves: ['d2d4'] }];
  const result = await validateDesignConfig(input);
  assert.equal(result.validatedOpenings, 2, 'custom-piece opening prefixes remain supported by default');
  await assert.rejects(validateDesignConfig(input, { standardOpeningSources: true }), /repurposes d2: expected a pawn, found queen/);
});

test('prefixes cannot consume the entire game-ply allowance', async () => {
  const input = config();
  input.engine.maxPlies = 2;
  input.openings = [{ id: 'at-limit', moves: ['e2e4', 'e7e5'] }];
  await assert.rejects(validateDesignConfig(input), /at-limit.*total-ply limit/);
});

test('rejects legacy configs and checks a pre-cancelled signal before touching files', async t => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(fs, 'mkdtempSync', () => { throw new Error('Unexpected temporary directory.'); });
  await assert.rejects(validateDesignConfig(config(), { signal: controller.signal, enginePath: 'unused' }), { name: 'AbortError', code: 'ABORT_ERR' });
  await assert.rejects(validateDesignConfig({ ...config(), schemaVersion: 1 }), /requires a schemaVersion 2/);
});

test('native startup failures and cancellation clean up their temporary rules directory', async t => {
  const original = fs.mkdtempSync;
  const created = [];
  t.mock.method(fs, 'mkdtempSync', function(...args) {
    const value = original.apply(this, args);
    created.push(value);
    return value;
  });
  let closed = 0;
  t.mock.method(UciEngine.prototype, 'start', async () => { throw new Error('Injected native startup failure'); });
  t.mock.method(UciEngine.prototype, 'close', async () => { closed++; });
  await assert.rejects(validateDesignConfig(config(), { enginePath: 'unused' }), /Injected native startup failure/);
  assert.equal(closed, 1);
  assert.equal(created.length, 1);
  assert.equal(fs.existsSync(created[0]), false);

  const controller = new AbortController();
  await assert.rejects(validateDesignConfig(config(), {
    enginePath: 'unused', signal: controller.signal,
    onProgress(message) { if (message.includes('checking native engine')) controller.abort(); },
  }), { name: 'AbortError', code: 'ABORT_ERR' });
  assert.equal(created.length, 2);
  assert.ok(created.every(directory => !fs.existsSync(directory)));
});

test('native validation checks capabilities and every distinct starting/opening position without playing', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 60000,
}, async t => {
  t.mock.method(UciEngine.prototype, 'search', () => { throw new Error('Validation must never request a game move.'); });
  const input = config();
  input.comparisons[0].strengthA = { skill: 8 };
  const result = await validateDesignConfig(input, { enginePath: process.env.FAIRY_STOCKFISH_PATH });
  assert.equal(result.native, true);
  assert.ok(result.movementChecks > 4);
  assert.equal(result.nativePositionChecks, 10);
  assert.equal(result.games, 24);
});
