'use strict';

// Benchmark-only changes are made in a new verified source snapshot. The
// running panel's runner, catalog and rules bundle are never edited.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { ensureResearchOverlay, openResearchOverlay, RECEIPT } = require('./research-overlay');

const ROOT = path.resolve(__dirname, '../..');
const BASE = Object.freeze({ name: 'engine-benchmark-base-v18', entryFile: 'scripts/benchmark-engine-sharing.js', definitionFile: 'src/balance-designs-engine-benchmark.js' });
const NAME = 'engine-sharing-benchmark-v18';
const RUNNER = 'scripts/balance/run.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const PATCHES = Object.freeze([
  {
    anchor: "  if (!config || !Array.isArray(schedule) || !schedule.length) throw new Error('A normalized config and nonempty schedule are required.');",
    addition: `
  const engineMode = process.env.LEVELUP_BENCH_ENGINE_MODE;
  if (!['shared', 'separate'].includes(engineMode)) throw new Error('Benchmark runner requires an explicit shared or separate engine mode.');
  if (config.engine.threads !== 1 || config.engine.movetimeMs !== undefined) throw new Error('Engine benchmark requires one search thread and fixed node budgets.');
  for (const comparison of config.comparisons) {
    if (!isDeepStrictEqual(comparison.strengthA, comparison.strengthB)) throw new Error('Engine benchmark requires identical White/Black strength settings.');
  }`,
  },
  {
    anchor: "  const original = resume ? JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8')) : null;",
    addition: `
  if (original && (original.benchmarkOnly !== true || original.engineMode !== engineMode)) throw new Error('Cannot resume an engine benchmark under another engine mode.');`,
  },
  {
    anchor: '      schemaVersion: 1, runId: randomUUID(), createdAt: new Date().toISOString(), configHash, rulesHash, engineSha256,',
    addition: '\n      benchmarkOnly: true, engineMode,',
  },
  {
    anchor: '      const startedAt = new Date().toISOString();',
    addition: `
      const benchmarkStarted = process.hrtime.bigint();
      const benchmarkTiming = { startPly: moves.length, prepareMs: 0, searchMs: 0, searchCalls: 0, reportedNodes: 0,
        missingNodeReports: 0, physicalEngines: 0, nativePids: [] };`,
  },
  {
    anchor: '        engineNames: names, lastInfo, engine: config.engine,',
    addition: `
        benchmarkOnly: true, engineMode,
        benchmarkTiming: { ...benchmarkTiming, nativePids: [...benchmarkTiming.nativePids],
          elapsedBeforePersistMs: Number(process.hrtime.bigint() - benchmarkStarted) / 1e6 },`,
  },
  {
    anchor: "          for (const [color, side] of [['w', sides.white], ['b', sides.black]]) {",
    replacement: "          for (const [color, side] of (engineMode === 'shared' ? [['w', sides.white]] : [['w', sides.white], ['b', sides.black]])) {",
  },
  {
    anchor: '            names[color] = metadata.idname;',
    addition: `
            benchmarkTiming.physicalEngines = engines.length;
            if (Number.isSafeInteger(engine.child?.pid)) benchmarkTiming.nativePids.push(engine.child.pid);`,
  },
  {
    anchor: '        while (!outcome && moves.length < config.engine.maxPlies) {',
    replacement: `        if (engineMode === 'shared' && names.w) names.b = names.w;
        benchmarkTiming.prepareMs = Number(process.hrtime.bigint() - benchmarkStarted) / 1e6;
        while (!outcome && moves.length < config.engine.maxPlies) {`,
  },
  {
    anchor: "          const engine = engines[color === 'w' ? 0 : 1];",
    replacement: "          const engine = engines[engineMode === 'shared' || color === 'w' ? 0 : 1];\n          const benchmarkSearchStarted = process.hrtime.bigint();",
  },
  {
    anchor: '          const search = await engine.search({ fen: startFen, moves, nodes: config.engine.nodes, movetimeMs: config.engine.movetimeMs, signal });',
    addition: `
          benchmarkTiming.searchMs += Number(process.hrtime.bigint() - benchmarkSearchStarted) / 1e6;
          benchmarkTiming.searchCalls++;
          if (Number.isSafeInteger(search.info?.nodes) && search.info.nodes >= 0) benchmarkTiming.reportedNodes += search.info.nodes;
          else benchmarkTiming.missingNodeReports++;`,
  },
].map(Object.freeze));

function patchRunner(source) {
  if (typeof source !== 'string' || source.includes('LEVELUP_BENCH_ENGINE_MODE')) throw new Error('Expected an unmodified benchmark source runner.');
  let text = source.replace(/\r\n/g, '\n');
  for (const patch of PATCHES) {
    if (text.split(patch.anchor).length !== 2) throw new Error('The frozen runner differs from the exact benchmark patch anchors.');
    text = text.replace(patch.anchor, patch.replacement || patch.anchor + patch.addition);
  }
  return text;
}

function ordinaryDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Benchmark snapshot directories must be ordinary directories.');
}

function openBenchmarkRuntime(options) {
  const overlay = openResearchOverlay(options);
  if (overlay.manifest.name !== NAME || overlay.manifest.benchmarkOnly !== true
    || overlay.manifest.benchmarkProtocol !== 'fresh-per-game-equal-strength-shared-or-separate-v1'
    || !/^[a-f0-9]{64}$/.test(overlay.manifest.baseOverlayReceiptSha256 || '')) throw new Error('Not an owned engine-sharing benchmark snapshot.');
  const patches = overlay.manifest.patches.filter(row => row.file === RUNNER);
  if (JSON.stringify(patches.map(({ file, ...patch }) => patch)) !== JSON.stringify(PATCHES)) throw new Error('Benchmark runner patch declaration changed.');
  return overlay;
}

function ensureBenchmarkRuntime({ root: sourceRoot = ROOT, cacheDirectory } = {}) {
  const root = path.resolve(sourceRoot);
  const cache = path.resolve(cacheDirectory || path.join(root, 'node_modules/.cache/levelup-engine-benchmark'));
  // The existing builder verifies dependencies and copies the unmodified base
  // sources. Its own empty catalog extension changes no piece definitions.
  const base = ensureResearchOverlay({ ...BASE, root, cacheDirectory: cache });
  const runner = patchRunner(fs.readFileSync(path.join(base.directory, RUNNER), 'utf8'));
  const { key: _key, ...original } = base.manifest;
  const payload = { ...original, name: NAME, benchmarkOnly: true,
    benchmarkProtocol: 'fresh-per-game-equal-strength-shared-or-separate-v1',
    baseOverlayReceiptSha256: base.manifestSha256,
    patches: [...original.patches, ...PATCHES.map(patch => ({ file: RUNNER, ...patch }))],
    files: original.files.map(row => row.file === RUNNER
      ? { ...row, bytes: Buffer.byteLength(runner), sha256: sha(runner) } : row) };
  const key = sha(JSON.stringify(payload)), manifest = { ...payload, key };
  const output = path.join(cache, `${NAME}-${key}`);
  if (fs.existsSync(output)) return openBenchmarkRuntime({ directory: output });
  const temporary = path.join(cache, `.benchmark-${randomUUID()}.tmp`);
  fs.mkdirSync(temporary); ordinaryDirectory(temporary);
  let moved = false;
  try {
    for (const row of manifest.files) {
      const file = path.join(temporary, row.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const bytes = row.file === RUNNER ? Buffer.from(runner) : fs.readFileSync(path.join(base.directory, row.file));
      if (bytes.length !== row.bytes || sha(bytes) !== row.sha256) throw new Error('The verified benchmark base changed while copying.');
      fs.writeFileSync(file, bytes, { flag: 'wx' });
    }
    const receipt = JSON.stringify(manifest, null, 2) + '\n';
    const fd = fs.openSync(path.join(temporary, RECEIPT), 'wx');
    try { fs.writeFileSync(fd, receipt); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(output)) return openBenchmarkRuntime({ directory: output });
    try { fs.renameSync(temporary, output); moved = true; }
    catch (error) { if (!fs.existsSync(output)) throw error; return openBenchmarkRuntime({ directory: output }); }
    return { ...openBenchmarkRuntime({ directory: output }), reused: false };
  } finally { if (!moved) fs.rmSync(temporary, { recursive: true, force: true }); }
}

module.exports = { BASE, NAME, RUNNER, PATCHES, patchRunner, ensureBenchmarkRuntime, openBenchmarkRuntime };
