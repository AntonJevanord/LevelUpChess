'use strict';

// A research-only catalog extension lives in an owned source snapshot. The
// project's active catalog, runner and rule bundle are never rewritten.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const ROOT = path.resolve(__dirname, '../..');
const FORMAT = 'levelup-isolated-research-overlay';
const RECEIPT = '.research-overlay.json';
const ANCHOR = "  ...require('./balance-designs-v17-mixed').NEW_DEFINITIONS,";
const NAME = 'nightrider-focus-v17';
const ENTRY = 'scripts/nightrider-balance.js';
const DEFINITIONS = 'src/balance-designs-nightrider-focus.js';
const sha = input => createHash('sha256').update(input).digest('hex');
const fail = message => { throw new Error(`Research overlay: ${message}`); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function relativeFile(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || path.posix.isAbsolute(file)
    || file.split('/').some(part => !part || ['.', '..'].includes(part))) fail('source paths must be simple project-relative paths.');
  return file;
}
function directory(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('source and snapshot directories cannot be symbolic links.');
}
function readBytes(root, file) {
  const absolute = path.join(root, relativeFile(file));
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`expected an ordinary source file: ${file}.`);
  const kind = file === 'dist/balance-rules.cjs' ? 'raw' : 'normalized-utf8';
  const bytes = fs.readFileSync(absolute);
  return { file, kind, bytes: kind === 'raw' ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) };
}
function inventory(rows) {
  return rows.map(row => ({ file: row.file, kind: row.kind, bytes: row.bytes.length, sha256: sha(row.bytes) }));
}
function sourceFiles(root, entryFile, definitionFile) {
  const names = new Set(['package.json', 'dist/balance-rules.cjs', entryFile, definitionFile]);
  // The runner's only external runtime library is small. Pin its CommonJS
  // entry and license so snapshots also work outside the project directory
  // and cannot silently pick up a later dependency version on resume.
  const requested = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies?.['chess.js'];
  if (requested) {
    const packageFile = 'node_modules/chess.js/package.json';
    const installed = JSON.parse(readBytes(root, packageFile).bytes.toString('utf8'));
    if (installed.version !== requested || installed.main !== 'dist/cjs/chess.js') fail('install the exact declared chess.js runtime before creating a snapshot.');
    for (const file of [packageFile, 'node_modules/chess.js/dist/cjs/chess.js', 'node_modules/chess.js/LICENSE']) names.add(file);
  }
  const extensions = new Set(['.js', '.cjs', '.json', '.ini']);
  function walk(relative) {
    const absolute = path.join(root, relative);
    directory(absolute);
    for (const name of fs.readdirSync(absolute).sort()) {
      const file = `${relative}/${name}`, stat = fs.lstatSync(path.join(root, file));
      if (stat.isSymbolicLink()) fail(`source links are unsupported: ${file}.`);
      if (stat.isDirectory()) {
        if (relative.startsWith('experiments/') && name === 'results') continue;
        walk(file);
      } else if (stat.isFile() && extensions.has(path.extname(name))) names.add(file);
    }
  }
  for (const name of ['scripts', 'src', 'variants', 'experiments']) walk(name);
  return [...names].sort().map(file => readBytes(root, file));
}
function declaration(root, { name, entryFile, definitionFile }) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) fail('use a lowercase snapshot name.');
  entryFile = relativeFile(entryFile); definitionFile = relativeFile(definitionFile);
  if (!entryFile.startsWith('scripts/') || !entryFile.endsWith('.js')
    || !definitionFile.startsWith('src/') || !definitionFile.endsWith('.js')) fail('entry and definition files must be JavaScript within scripts/ and src/.');
  const rows = sourceFiles(root, entryFile, definitionFile), baseInventory = inventory(rows);
  const catalog = rows.find(row => row.file === 'src/design-catalog.js');
  if (!catalog || catalog.bytes.toString('utf8').split(ANCHOR).length !== 2) fail('the expected unmodified catalog extension anchor is missing or repeated.');
  const moduleName = './' + path.posix.basename(definitionFile, '.js');
  const addition = `\n  ...require('${moduleName}').NEW_DEFINITIONS,`;
  if (catalog.bytes.toString('utf8').includes(addition)) fail('the base catalog already contains the requested extension.');
  catalog.bytes = Buffer.from(catalog.bytes.toString('utf8').replace(ANCHOR, ANCHOR + addition));
  const payload = { schemaVersion: 1, format: FORMAT, name, entryFile, definitionFile,
    hashFormat: 'Text snapshots use UTF-8 with CRLF normalized to LF; the existing balance bundle is hashed as raw bytes.',
    baseInventory, patches: [{ file: catalog.file, anchor: ANCHOR, addition }], files: inventory(rows) };
  const key = sha(JSON.stringify(payload));
  return { rows, manifest: { ...payload, key } };
}

function allSnapshotFiles(root, expected) {
  const files = [];
  const allowedDirectories = new Set(['']);
  for (const file of expected) {
    const parts = file.split('/'); parts.pop();
    for (let index = 1; index <= parts.length; index++) allowedDirectories.add(parts.slice(0, index).join('/'));
  }
  function walk(relative = '') {
    directory(path.join(root, relative));
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const file = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(path.join(root, file));
      if (stat.isSymbolicLink()) fail(`snapshot contains a symbolic link: ${file}.`);
      if (stat.isDirectory()) {
        if (!allowedDirectories.has(file)) fail(`snapshot contains an undeclared directory: ${file}.`);
        walk(file);
      } else if (stat.isFile()) files.push(file);
      else fail(`snapshot contains an unsupported entry: ${file}.`);
    }
  }
  walk(); return files.sort();
}

function openResearchOverlay({ directory: selected, manifestSha256 } = {}) {
  if (typeof selected !== 'string' || !selected) fail('select the original snapshot directory.');
  const root = path.resolve(selected); directory(root);
  const receiptFile = path.join(root, RECEIPT), stat = fs.lstatSync(receiptFile);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('snapshot ownership receipt is missing or linked.');
  const receipt = fs.readFileSync(receiptFile), receiptHash = sha(receipt);
  if (manifestSha256 !== undefined && (!digest(manifestSha256) || manifestSha256 !== receiptHash)) fail('the snapshot receipt differs from its recorded identity.');
  let manifest;
  try { manifest = JSON.parse(receipt.toString('utf8')); } catch { fail('snapshot receipt is invalid JSON.'); }
  const { key, ...payload } = manifest || {};
  if (payload.schemaVersion !== 1 || payload.format !== FORMAT || !digest(key)
    || key !== sha(JSON.stringify(payload)) || !Array.isArray(payload.files) || !payload.files.length
    || !Array.isArray(payload.baseInventory) || !Array.isArray(payload.patches)
    || !/^[a-z0-9][a-z0-9-]*$/.test(payload.name || '') || path.basename(root) !== `${payload.name}-${key}`) fail('snapshot receipt or directory identity changed.');
  relativeFile(payload.entryFile); relativeFile(payload.definitionFile);
  const names = new Set();
  for (const row of payload.files) {
    relativeFile(row?.file);
    if (names.has(row.file) || !['raw', 'normalized-utf8'].includes(row.kind) || !digest(row.sha256)
      || !Number.isSafeInteger(row.bytes) || row.bytes < 0) fail('snapshot file inventory is malformed.');
    names.add(row.file);
  }
  if (!names.has(payload.entryFile) || !names.has(payload.definitionFile)) fail('snapshot inventory is missing its entry or definitions.');
  const expected = [...names, RECEIPT].sort();
  if (!isDeepStrictEqual(allSnapshotFiles(root, expected), expected)) fail('snapshot contains missing or undeclared files.');
  for (const row of payload.files) {
    const bytes = fs.readFileSync(path.join(root, row.file));
    // Text was normalized when the snapshot was created. Its stored bytes are
    // immutable too: an editor changing line endings cannot alter a live run.
    if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) fail(`snapshot file changed: ${row.file}.`);
  }
  return { root, directory: root, entry: path.join(root, payload.entryFile), manifest, manifestSha256: receiptHash, reused: true };
}

function ensureResearchOverlay({ root: selected = ROOT, name = NAME, entryFile = ENTRY, definitionFile = DEFINITIONS, cacheDirectory } = {}) {
  const root = path.resolve(selected); directory(root);
  const cache = path.resolve(cacheDirectory || path.join(root, 'node_modules/.cache/levelup-research'));
  if (cache === root || ['scripts', 'src', 'variants', 'experiments'].some(name => {
    const source = path.join(root, name);
    return cache === source || cache.startsWith(source + path.sep);
  })) fail('the cache must be outside the source trees being snapshotted.');
  const { rows, manifest } = declaration(root, { name, entryFile, definitionFile });
  fs.mkdirSync(cache, { recursive: true }); directory(cache);
  const output = path.join(cache, `${manifest.name}-${manifest.key}`);
  if (fs.existsSync(output)) return openResearchOverlay({ directory: output });
  const temporary = path.join(cache, `.overlay-${randomUUID()}.tmp`);
  fs.mkdirSync(temporary);
  let moved = false;
  try {
    for (const row of rows) {
      const file = path.join(temporary, row.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, row.bytes, { flag: 'wx' });
    }
    const bytes = JSON.stringify(manifest, null, 2) + '\n';
    const fd = fs.openSync(path.join(temporary, RECEIPT), 'wx');
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    // A concurrent creator may have completed this same content-addressed
    // snapshot. It must validate; no existing directory is ever replaced.
    if (fs.existsSync(output)) return openResearchOverlay({ directory: output });
    try { fs.renameSync(temporary, output); moved = true; }
    catch (error) {
      if (!fs.existsSync(output)) throw error;
      return openResearchOverlay({ directory: output });
    }
    return { ...openResearchOverlay({ directory: output }), reused: false };
  } finally { if (!moved) fs.rmSync(temporary, { recursive: true, force: true }); }
}

module.exports = { FORMAT, RECEIPT, ANCHOR, ensureResearchOverlay, openResearchOverlay };
