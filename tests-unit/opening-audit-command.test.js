'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { EventEmitter } = require('node:events');
const command = require('../scripts/opening-audit');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let archived;
test.before(() => { archived = command.loadArchive('v18-queen32-001'); });
function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-opening-command-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value) + '\n'); }
function compactManifest(source = archived.sources[0]) {
  const manifest = structuredClone(source.manifest), profile = manifest.designProfile;
  manifest.designProfile = Object.fromEntries(['variant', 'config', 'hash', 'registryHash'].map(key => [key, profile[key]]));
  return manifest;
}
function writeRun(root, source = archived.sources[0]) {
  writeJson(path.join(root, 'run.json'), compactManifest(source));
  fs.writeFileSync(path.join(root, 'games.jsonl'), source.records.map(row => JSON.stringify(row)).join('\n') + '\n');
}
function baseAudit() { return { counts: { inputAttempts: 1, eligibleGames: 1 }, positions: [] }; }

test('explicit source, fresh output and opt-in native budget reject ambiguous or ignored flags', () => {
  assert.deepEqual(command.parseArgs(['--run', 'a', '--out', 'b']), { run: 'a', out: 'b', nodes: 10000 });
  assert.deepEqual(command.parseArgs(['--archive', 'v18-queen32-001', '--out', 'b', '--evaluate', '--engine', 'engine.exe', '--nodes', '20000']),
    { archive: 'v18-queen32-001', out: 'b', evaluate: true, engine: 'engine.exe', nodes: 20000 });
  assert.deepEqual(command.parseArgs(['--help']), { help: true });
  for (const args of [[], ['--run', 'a'], ['--run', 'a', '--archive', 'x', '--out', 'b'], ['--archive', '../x', '--out', 'b'],
    ['--run', 'a', '--out', 'b', '--nodes', '1'], ['--run', 'a', '--out', 'b', '--engine', 'x'],
    ['--run', 'a', '--out', 'b', '--evaluate', '--nodes', '0'], ['--run', 'a', '--out', 'b', '--evaluate', '--nodes', '1.5'],
    ['--run', 'a', '--out', 'b', '--evaluate', '--nodes', 'Infinity'], ['--run', 'a', '--out', 'b', '--out', 'c'], ['--run', 'a', '--out', 'b', '--select', '8']]) assert.throws(() => command.parseArgs(args));
});

test('compact recorded profiles hydrate without resolving research IDs in the live catalog', () => {
  const source = archived.sources[0], compact = compactManifest(source), before = JSON.stringify(compact);
  const hydrated = command.sourceManifest(compact);
  assert.equal(JSON.stringify(compact), before);
  for (const key of ['config', 'hash', 'registryHash', 'roles', 'definitionsByLetter']) assert.deepEqual(hydrated.designProfile[key], source.manifest.designProfile[key]);
  const mismatches = [
    value => { value.designProfile.hash = '0'.repeat(64); },
    value => { value.designRegistry.hash = '0'.repeat(64); },
    value => { value.designProfile.config += '\n# unrelated edit\n'; },
    value => { value.designProfile.registryHash = '0'.repeat(64); },
  ];
  for (const mutate of mismatches) { const value = structuredClone(compact); mutate(value); assert.throws(() => command.sourceManifest(value)); }
  const full = structuredClone(source.manifest); full.designProfile.roles.royalTypes = ['a'];
  assert.throws(() => command.sourceManifest(full), /roles differ/);
});

test('profile hydration rejects duplicate semantic allocations even with valid content hashes', () => {
  const manifest = compactManifest(), registry = manifest.designRegistry;
  registry.allocations[1].id = registry.allocations[0].id;
  registry.hash = sha(JSON.stringify({ schemaVersion: registry.schemaVersion, definitions: registry.definitions, allocations: registry.allocations }));
  manifest.designProfile.registryHash = registry.hash;
  manifest.designProfile.hash = sha(JSON.stringify({ config: manifest.designProfile.config, registry }));
  assert.throws(() => command.sourceManifest(manifest), /invalid recorded custom-piece allocation/);
});

test('parent screens read canonical aggregate journals once and skip unstarted future stages', t => {
  const root = temp(t), input = path.join(root, 'screen'); fs.mkdirSync(input);
  writeJson(path.join(input, 'screen.json'), { stages: [{ directory: 'batch-01' }, { directory: 'batch-02' }, { directory: 'batch-03' }] });
  writeRun(path.join(input, 'batch-01'), archived.sources[0]); writeRun(path.join(input, 'batch-02'), archived.sources[1]);
  writeRun(path.join(input, 'batch-01/workers/worker-01'), archived.sources[0]);
  const loaded = command.loadRun(input);
  assert.equal(loaded.sources.length, 2); assert.equal(loaded.sources.reduce((n, source) => n + source.records.length, 0), 192);
  assert.deepEqual(loaded.inputDirectories, [input]);
  assert.equal(loaded.provenance.stages.length, 2);
  writeJson(path.join(input, 'screen.json'), { stages: [{ directory: '../other' }] });
  assert.throws(() => command.loadRun(input), /stage directory/);
});

test('standalone loads reject torn journals, absent profiles and symbolic input paths', t => {
  const root = temp(t), input = path.join(root, 'run'); writeRun(input);
  assert.equal(command.loadRun(input).sources[0].records.length, 96);
  fs.appendFileSync(path.join(input, 'games.jsonl'), '{"partial":');
  assert.throws(() => command.loadRun(input), /incomplete final line/);
  writeRun(input); const manifest = compactManifest(); delete manifest.designRegistry; writeJson(path.join(input, 'run.json'), manifest);
  assert.throws(() => command.loadRun(input), /dynamic design profile/);
  const target = path.join(root, 'link'); fs.symlinkSync(input, target, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => command.loadRun(target), /symbolic/);
});

test('archive loading verifies exact compressed and original bytes, not a supplied report summary', t => {
  assert.equal(archived.sources.length, 4);
  assert.equal(archived.sources.reduce((n, source) => n + source.records.length, 0), 384);
  assert.equal(archived.provenance.originalManifestsSupplied, false);
  const root = temp(t), originalRoot = path.join(command.ROOT, 'experiments/balance/results');
  const pins = JSON.parse(fs.readFileSync(path.join(originalRoot, 'v18-queen32-001.sources.json'), 'utf8'));
  const needed = [pins.declarations.archiveFile, ...Object.values(pins.studies).flatMap(study => study.journals.map(pin => pin.archiveFile))];
  for (const name of needed) fs.copyFileSync(path.join(originalRoot, name), path.join(root, name));
  writeJson(path.join(root, 'test.sources.json'), pins);
  assert.equal(command.loadArchive('test', root).sources.length, 4);
  const file = path.join(root, needed.at(-1)), bytes = fs.readFileSync(file); bytes[30] ^= 1; fs.writeFileSync(file, bytes);
  assert.throws(() => command.loadArchive('test', root), /archive hash changed/);
  const raw = Buffer.from('{"broken":"identity"}\n'), packed = gzipSync(raw), pin = pins.studies['prepanel-level1'].journals.at(-1);
  fs.writeFileSync(file, packed); pin.archivedSha256 = sha(packed); writeJson(path.join(root, 'test.sources.json'), pins);
  assert.throws(() => command.loadArchive('test', root), /original upload changed/);
});

test('fresh output cannot pollute a resumable run or overwrite foreign reports', t => {
  const root = temp(t), input = path.join(root, 'input'); fs.mkdirSync(input);
  assert.throws(() => command.prepareOutput(path.join(input, 'audit'), [input]), /outside/);
  assert.throws(() => command.prepareOutput(root, [input]), /outside/);
  const foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'keep.txt'), 'user data');
  assert.throws(() => command.prepareOutput(foreign, [input]), /new or empty/);
  const out = path.join(root, 'out'); assert.equal(command.prepareOutput(out, [input]), out);
  assert.equal(fs.existsSync(out), false);
});

test('default command replays and inspects without native evaluation or source mutations', async t => {
  const root = temp(t), input = path.join(root, 'run'), out = path.join(root, 'out'); writeRun(input);
  const before = fs.readFileSync(path.join(input, 'games.jsonl')), signals = new EventEmitter();
  let inspected = 0, closed = 0, native = 0;
  const report = await command.main(['--run', input, '--out', out], { signals, log() {},
    createEvaluator() { native++; throw new Error('native must not start'); },
    createInspector: async () => ({ inspect() { inspected++; return { inCheck: false, pieces: [], upgradedPieces: [] }; }, close() { closed++; } }),
    auditGames: async (sources, options) => {
      assert.equal(sources[0].records.length, 96); assert.equal(options.evaluate, undefined);
      await options.inspectPosition({ profile: sources[0].manifest.designProfile, fen: sources[0].records[0].startFen, signal: options.signal });
      return baseAudit();
    },
  });
  assert.equal(native, 0); assert.equal(inspected, 1); assert.equal(closed, 1);
  assert.equal(report.engine, null); assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.deepEqual(fs.readFileSync(path.join(input, 'games.jsonl')), before);
  assert.deepEqual(fs.readdirSync(out).sort(), ['opening-audit.json', 'opening-audit.md']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'opening-audit.json'), 'utf8')).format, command.FORMAT);
});

test('optional native path records identity differences and cleans engines on audit failure', async t => {
  const root = temp(t), input = path.join(root, 'run'); writeRun(input);
  const manifest = JSON.parse(fs.readFileSync(path.join(input, 'run.json'), 'utf8')); manifest.engineSha256 = 'a'.repeat(64); writeJson(path.join(input, 'run.json'), manifest);
  const signals = new EventEmitter(), evaluated = [], profile = archived.sources[0].manifest.designProfile;
  let closed = 0;
  const dependencies = { signals, log() {}, createInspector: async () => ({ inspect: () => ({ inCheck: false, pieces: [], upgradedPieces: [] }), close() {} }),
    createEvaluator: async () => ({ identity: 'b'.repeat(64), metadata: { engineSha256: 'b'.repeat(64), nodes: 123 }, evaluate(request) { evaluated.push(request); return { info: { score: { type: 'cp', value: 22 } } }; }, close() { closed++; } }),
    auditGames: async (sources, options) => { await options.evaluate({ profile, fen: sources[0].records[0].startFen, nodes: options.nodes }); return baseAudit(); },
  };
  const report = await command.main(['--run', input, '--out', path.join(root, 'out'), '--evaluate', '--engine', 'not-executed', '--nodes', '123'], dependencies);
  assert.equal(evaluated[0].nodes, 123); assert.equal(report.engine.matchesRecordedEngine, false); assert.equal(closed, 1);
  await assert.rejects(command.main(['--run', input, '--out', path.join(root, 'failure'), '--evaluate', '--engine', 'not-executed'], { ...dependencies, auditGames() { throw new Error('context mismatch'); } }), /context mismatch/);
  assert.equal(closed, 2); assert.equal(signals.listenerCount('SIGINT'), 0); assert.equal(fs.existsSync(path.join(root, 'failure')), false);
});

function nativeTables(profile) {
  const pieces = {};
  for (const [id, pair] of Object.entries(profile.evaluation.pieceValues)) {
    const letter = profile.registry.allocations.find(row => row.id === id).letter;
    const fields = { rawMg: pair.mg, captureMg: pair.mg, evalMg: pair.mg, rawEg: pair.eg, captureEg: pair.eg, evalEg: pair.eg };
    pieces[letter] = fields; pieces[letter.toUpperCase()] = { ...fields };
  }
  return { version: 1, pieces };
}

test('native evaluator verifies every table and clears hash before each fresh search', async t => {
  const root = temp(t), engineFile = path.join(root, 'engine'); fs.writeFileSync(engineFile, 'fake native identity');
  const profile = archived.sources[0].manifest.designProfile, calls = [], files = [];
  class Engine {
    constructor(options) { files.push(options.variantPath); assert.equal(fs.readFileSync(options.variantPath, 'utf8'), profile.config); assert.equal(options.options.threads, 1); }
    async start() { calls.push('start'); return { idname: 'Mock Fairy' }; }
    async pieceValues() { calls.push('values'); return nativeTables(profile); }
    async newGame() { calls.push('clear'); }
    async search(request) { calls.push('search'); return { move: 'e2e4', info: { score: { type: 'cp', value: 10 }, nodes: request.nodes } }; }
    async close() { calls.push('close'); }
  }
  const evaluator = await command.createEvaluator(engineFile, { Engine });
  await evaluator.evaluate({ profile, fen: archived.sources[0].records[0].startFen, nodes: 100 });
  await evaluator.evaluate({ profile, fen: archived.sources[0].records[1].startFen, nodes: 100 });
  assert.deepEqual(calls, ['start', 'values', 'clear', 'search', 'clear', 'search']);
  assert.equal(evaluator.metadata.profiles.length, 1); assert.equal(evaluator.identity, sha(fs.readFileSync(engineFile)));
  await evaluator.close(); assert.equal(fs.existsSync(path.dirname(files[0])), false);
  class WrongEngine extends Engine { async pieceValues() { const value = nativeTables(profile); Object.values(value.pieces)[0].evalEg++; return value; } }
  const wrong = await command.createEvaluator(engineFile, { Engine: WrongEngine });
  await assert.rejects(wrong.evaluate({ profile, fen: archived.sources[0].records[0].startFen, nodes: 100 }), /native manual value mismatch/);
  await wrong.close();
});

test('Markdown distinguishes ordinary and upgraded threats, unavailable inspection and diagnostic scores', () => {
  const ordinary = { square: 'e5', letter: 'p', designId: null, royalShieldPin: { exposesCheck: true }, captureThreats: [{ move: 'f3e5', actualTurn: true, unrecapturedCandidate: true }] };
  const report = { audit: { counts: { inputAttempts: 2, eligibleGames: 2 }, positions: [
    { comparisonId: 'a-v-b', openingId: 'opening', aColor: 'w', events: {}, tactics: { after: { pieces: [ordinary], upgradedPieces: [] } }, evaluation: { before: { score: { type: 'cp', value: 10 } }, after: { score: { type: 'mate', value: -2, bound: 'upperbound' } }, deltaCpWhite: null } },
    { comparisonId: 'c-v-d', openingId: 'unknown', aColor: 'b', events: {} },
  ] }, engine: { nodes: 100, engineSha256: 'e'.repeat(64) } };
  const text = command.renderReport(report);
  for (const term of ['Royal-shield pin candidates, any piece | 1', 'Royal-shield pin candidates, upgrades only | 0', 'Positions without available tactical inspection | 1', 'p@e5', 'f3e5 [current turn]', 'mate -2 (upperbound)', 'not proof', 'does not choose']) assert.ok(text.includes(term), term);
});
