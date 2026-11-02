'use strict';

// Snapshot and module-isolation tests only. No engine, search or game starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay, openResearchOverlay, RECEIPT, ANCHOR } = require('../scripts/balance/research-overlay');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('a pinned chess runtime travels with snapshots stored outside the project', t => {
  const root = fixture(t), target = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-external-snapshot-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))); pkg.dependencies = { 'chess.js': '1.4.0' };
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  const files = { 'package.json': '{"name":"chess.js","version":"1.4.0","main":"dist/cjs/chess.js"}', 'dist/cjs/chess.js': 'module.exports = "pinned runtime";', LICENSE: 'fixture license' };
  for (const [file, bytes] of Object.entries(files)) { const absolute = path.join(root, 'node_modules/chess.js', file); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, bytes); }
  const prepared = ensureResearchOverlay({ root, cacheDirectory: target });
  assert.equal(require(path.join(prepared.directory, 'node_modules/chess.js')), 'pinned runtime');
  assert.equal(prepared.manifest.files.filter(row => row.file.startsWith('node_modules/chess.js/')).length, 3);
  fs.writeFileSync(path.join(root, 'node_modules/chess.js/dist/cjs/chess.js'), 'module.exports = "changed project dependency";');
  assert.equal(openResearchOverlay({ directory: prepared.directory }).manifestSha256, prepared.manifestSha256);
});

function fixture(t, { crlf = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-research-overlay-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'package.json': '{"name":"overlay-fixture","private":true}\n',
    'src/design-catalog.js': `'use strict';\nconst definitions = [\n${ANCHOR}\n];\nmodule.exports = definitions;\n`,
    'src/balance-designs-v17-mixed.js': "module.exports = { NEW_DEFINITIONS: [{ id: 'original@1' }] };\n",
    'src/balance-designs-nightrider-focus.js': "module.exports = { NEW_DEFINITIONS: [{ id: 'new@1' }] };\n",
    'src/presentation.js': 'module.exports = "old display";\n',
    'scripts/nightrider-balance.js': "module.exports = { definitions: require('../src/design-catalog'), dependency: require('overlay-test-dependency') };\n",
    'scripts/balance/example.js': 'module.exports = 1;\n',
    'variants/example.ini': '[example:chess]\n',
    'experiments/designs/prior.json': '{"value":1}\n',
    'experiments/balance/book.json': '[]\n',
    'experiments/balance/results/large.json': '{"shouldNotCopy":true}\n',
    'stockfish/do-not-copy.exe': 'binary-not-for-snapshot',
    'node_modules/overlay-test-dependency/index.js': 'module.exports = "resolved outside snapshot";\n',
    'balance-results/live/games.jsonl': 'do not read live research\n',
  };
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, crlf ? contents.replace(/\n/g, '\r\n') : contents);
  }
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist/balance-rules.cjs'), Buffer.from([0, 10, 13, 255, 42]));
  return root;
}

test('new snapshot extends only its owned catalog and preserves root and active bundle bytes', t => {
  const root = fixture(t), catalog = fs.readFileSync(path.join(root, 'src/design-catalog.js'));
  const bundle = fs.readFileSync(path.join(root, 'dist/balance-rules.cjs'));
  const prepared = ensureResearchOverlay({ root });
  assert.equal(prepared.reused, false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'src/design-catalog.js')), catalog);
  assert.deepEqual(fs.readFileSync(path.join(prepared.directory, 'dist/balance-rules.cjs')), bundle);
  assert.match(fs.readFileSync(path.join(prepared.directory, 'src/design-catalog.js'), 'utf8'), /balance-designs-nightrider-focus/);
  assert.deepEqual(require(prepared.entry).definitions.map(row => row.id), ['original@1', 'new@1']);
  assert.equal(require(prepared.entry).dependency, 'resolved outside snapshot');
  assert.equal(require(path.join(root, 'src/design-catalog.js')).length, 1);
  assert.ok(!prepared.manifest.files.some(row => /^(stockfish|node_modules|balance-results)\//.test(row.file)));
  assert.ok(!prepared.manifest.files.some(row => row.file.includes('/results/')));
  assert.ok(prepared.manifest.files.some(row => row.file === 'experiments/designs/prior.json'));
  assert.equal(prepared.manifestSha256, sha(fs.readFileSync(path.join(prepared.directory, RECEIPT))));
});

test('identical inputs reuse a verified snapshot and custom persistent cache directories work', t => {
  const root = fixture(t), cacheDirectory = path.join(root, 'balance-results/focus/runtime');
  const first = ensureResearchOverlay({ root, cacheDirectory });
  const second = ensureResearchOverlay({ root, cacheDirectory });
  assert.equal(second.directory, first.directory); assert.equal(second.reused, true);
  assert.equal(path.dirname(second.directory), cacheDirectory);
  assert.equal(openResearchOverlay({ directory: second.directory, manifestSha256: first.manifestSha256 }).entry, second.entry);
});

test('text normalizes CRLF while the raw bundle and portable snapshot key remain exact', t => {
  const unix = ensureResearchOverlay({ root: fixture(t) });
  const windows = ensureResearchOverlay({ root: fixture(t, { crlf: true }) });
  assert.equal(unix.manifest.key, windows.manifest.key);
  assert.equal(unix.manifestSha256, windows.manifestSha256);
  assert.ok(!fs.readFileSync(path.join(windows.directory, 'scripts/nightrider-balance.js'), 'utf8').includes('\r'));
  assert.equal(windows.manifest.files.find(row => row.file === 'dist/balance-rules.cjs').kind, 'raw');
});

test('resuming a stored snapshot does not consult later project edits', t => {
  const root = fixture(t), original = ensureResearchOverlay({ root });
  fs.writeFileSync(path.join(root, 'src/presentation.js'), 'module.exports = "new name";\n');
  const existing = openResearchOverlay({ directory: original.directory, manifestSha256: original.manifestSha256 });
  assert.equal(existing.manifest.key, original.manifest.key);
  assert.equal(require(path.join(existing.directory, 'src/presentation.js')), 'old display');
  const next = ensureResearchOverlay({ root });
  assert.notEqual(next.directory, original.directory);
});

test('changed snapshot bytes or receipt hashes fail visibly instead of being silently rebuilt', t => {
  const root = fixture(t), prepared = ensureResearchOverlay({ root });
  assert.throws(() => openResearchOverlay({ directory: prepared.directory, manifestSha256: '0'.repeat(64) }), /receipt differs/);
  fs.appendFileSync(path.join(prepared.directory, 'src/design-catalog.js'), '// changed\n');
  assert.throws(() => openResearchOverlay({ directory: prepared.directory }), /file changed/);
  assert.throws(() => ensureResearchOverlay({ root }), /file changed/);
  assert.match(fs.readFileSync(path.join(prepared.directory, 'src/design-catalog.js'), 'utf8'), /changed/);
});

test('foreign files, empty directories, missing files and partial caches are refused', t => {
  for (const kind of ['file', 'empty-directory', 'missing', 'partial']) {
    const root = fixture(t), prepared = ensureResearchOverlay({ root });
    if (kind === 'file') fs.writeFileSync(path.join(prepared.directory, 'unowned.txt'), 'foreign');
    if (kind === 'empty-directory') fs.mkdirSync(path.join(prepared.directory, 'unowned'));
    if (kind === 'missing') fs.unlinkSync(path.join(prepared.directory, 'src/presentation.js'));
    if (kind === 'partial') fs.unlinkSync(path.join(prepared.directory, RECEIPT));
    assert.throws(() => ensureResearchOverlay({ root }), /Research overlay|ENOENT/);
  }
});

test('source and cached symbolic links cannot substitute code or rules', t => {
  const source = fixture(t);
  fs.symlinkSync(path.join(source, 'src/presentation.js'), path.join(source, 'src/linked.js'));
  assert.throws(() => ensureResearchOverlay({ root: source }), /source links/);
  const root = fixture(t), prepared = ensureResearchOverlay({ root });
  const target = path.join(prepared.directory, 'src/presentation.js');
  fs.unlinkSync(target); fs.symlinkSync(path.join(root, 'src/presentation.js'), target);
  assert.throws(() => openResearchOverlay({ directory: prepared.directory }), /symbolic link/);
});

test('unsafe paths, names, missing inputs and unexpected catalog anchors fail before snapshot creation', t => {
  for (const options of [{ entryFile: '../escape.js' }, { definitionFile: '/escape.js' }, { name: '../escape' }, { entryFile: 'scripts\\entry.js' }, { definitionFile: 'src/no-such-file.js' }]) {
    assert.throws(() => ensureResearchOverlay({ root: fixture(t), ...options }));
  }
  const root = fixture(t);
  fs.appendFileSync(path.join(root, 'src/design-catalog.js'), '\n' + ANCHOR);
  assert.throws(() => ensureResearchOverlay({ root }), /anchor is missing or repeated/);
  assert.ok(!fs.existsSync(path.join(root, 'node_modules/.cache/levelup-research')));
});

test('cache paths cannot recursively snapshot the snapshot itself', t => {
  const root = fixture(t);
  for (const cacheDirectory of [root, path.join(root, 'scripts/cache'), path.join(root, 'experiments/runtime')]) {
    assert.throws(() => ensureResearchOverlay({ root, cacheDirectory }), /outside the source trees/);
  }
});
