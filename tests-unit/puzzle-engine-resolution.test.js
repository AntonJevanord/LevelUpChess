'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { resolveEngine, assertCompatibleEngineHash } = require('../scripts/generate-puzzles');
const ROOT = path.resolve(__dirname, '..');
const SUPPORTED = path.join(ROOT, 'stockfish/fairy-stockfish-levelup_x86-64.exe');
const LEGACY = path.join(ROOT, 'stockfish/fairy-stockfish-largeboard_x86-64.exe');
const LEGACY_SHA = '2fe12ff0fcad0295482cab7660e1fcc24259cebc4ef164839fb16c9f9cabfc99';
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let temporary, explicit, environment;
test.before(() => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-puzzle-engine-resolution-'));
  explicit = path.join(temporary, 'explicit-custom-engine.bin');
  environment = path.join(temporary, 'environment-custom-engine.bin');
  fs.writeFileSync(explicit, 'Synthetic unexecuted custom-engine selection fixture.');
  fs.writeFileSync(environment, 'Different synthetic unexecuted custom-engine selection fixture.');
});
test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));

test('Windows puzzle collection defaults to the supported levelup engine rather than the archived largeboard binary', () => {
  const selected = resolveEngine(undefined, { platform: 'win32', env: {}, root: ROOT });
  assert.equal(selected, SUPPORTED);
  assert.equal(sha(selected), '848ad74c3fbc2684e57b42c581ee94e93e5ed832fb536846a37f9dddebbb8b16');
  assert.notEqual(sha(selected), LEGACY_SHA);
  assert.equal(resolveEngine(undefined, { platform: 'win32', env: { FAIRY_STOCKFISH_PATH: '' }, root: ROOT }), SUPPORTED);
});

test('explicit puzzle engines take precedence over environment overrides, including a stale legacy override', () => {
  assert.equal(resolveEngine(explicit, { platform: 'win32', env: { FAIRY_STOCKFISH_PATH: environment }, root: ROOT }), explicit);
  assert.equal(resolveEngine(explicit, { platform: 'linux', env: { FAIRY_STOCKFISH_PATH: LEGACY }, root: ROOT }), explicit);
  assert.equal(resolveEngine(undefined, { platform: 'linux', env: { FAIRY_STOCKFISH_PATH: environment }, root: ROOT }), environment);
  assert.equal(resolveEngine('', { platform: 'win32', env: { FAIRY_STOCKFISH_PATH: environment }, root: ROOT }), environment);
});

test('relative explicit and environment paths resolve from the command working directory', () => {
  const relativeExplicit = path.relative(process.cwd(), explicit), relativeEnvironment = path.relative(process.cwd(), environment);
  assert.equal(resolveEngine(relativeExplicit, { platform: 'linux', env: {}, root: ROOT }), explicit);
  assert.equal(resolveEngine(undefined, { platform: 'linux', env: { FAIRY_STOCKFISH_PATH: relativeEnvironment }, root: ROOT }), environment);
});

test('non-Windows missing-engine requests and unavailable or non-file selections fail before mining', () => {
  assert.throws(() => resolveEngine(undefined, { platform: 'linux', env: {}, root: ROOT }), /FAIRY_STOCKFISH_PATH|--engine/);
  assert.throws(() => resolveEngine(undefined, { platform: 'darwin', env: { FAIRY_STOCKFISH_PATH: '' }, root: ROOT }), /FAIRY_STOCKFISH_PATH|--engine/);
  assert.throws(() => resolveEngine(path.join(temporary, 'does-not-exist'), { platform: 'win32', env: {}, root: ROOT }), /ENOENT|exist|file|executable/i);
  assert.throws(() => resolveEngine(temporary, { platform: 'linux', env: {}, root: ROOT }), /file|executable|EISDIR/i);
});

test('the known incompatible engine is refused by its bytes even after renaming, for both explicit and environment paths', () => {
  assert.equal(sha(LEGACY), LEGACY_SHA);
  const renamed = path.join(temporary, 'renamed-looking-current.exe'); fs.copyFileSync(LEGACY, renamed);
  for (const selected of [() => resolveEngine(renamed, { platform: 'linux', env: {}, root: ROOT }),
    () => resolveEngine(undefined, { platform: 'win32', env: { FAIRY_STOCKFISH_PATH: renamed }, root: ROOT })]) {
    assert.throws(selected, error => {
      assert.match(error.message, /--engine|FAIRY_STOCKFISH_PATH/);
      assert.match(error.message, /fairy-stockfish-levelup_x86-64\.exe/);
      return true;
    });
  }
});

test('direct collector hash guards reject the legacy build without forbidding supported or unknown custom engines', () => {
  assert.throws(() => assertCompatibleEngineHash(LEGACY_SHA), /fairy-stockfish-levelup_x86-64\.exe/);
  assert.doesNotThrow(() => assertCompatibleEngineHash(sha(SUPPORTED)));
  assert.doesNotThrow(() => assertCompatibleEngineHash(sha(explicit)));
});

test('uploaded failure evidence pins the legacy engine and contains no accepted puzzle work to transfer', () => {
  const root = path.join(ROOT, 'experiments/puzzles/results');
  const review = JSON.parse(fs.readFileSync(path.join(root, 'mining-engine-001.review.json')));
  const bytes = new Map();
  for (const source of review.sources) {
    const packed = fs.readFileSync(path.join(root, source.file)), original = gunzipSync(packed);
    assert.equal(createHash('sha256').update(packed).digest('hex'), source.gzipSha256);
    assert.equal(createHash('sha256').update(original).digest('hex'), source.rawSha256);
    bytes.set(source.uploadedName, original);
  }
  const owner = JSON.parse(bytes.get('mining.json')), { hash, ...payload } = owner;
  assert.equal(createHash('sha256').update(JSON.stringify(payload)).digest('hex'), hash);
  assert.equal(owner.identity.engineSha256, sha(LEGACY));
  assert.equal(review.supportedEngineSha256, sha(SUPPORTED));
  assert.throws(() => assertCompatibleEngineHash(owner.identity.engineSha256), /legacy largeboard/);
  const decisions = bytes.get('candidates.jsonl').toString('utf8').trim().split('\n').map(JSON.parse);
  assert.equal(decisions.length, 160); assert.equal(decisions.filter(row => row.status === 'verified').length, 0);
  assert.equal(review.reportedFailure.exactFenAvailable, false);
});
