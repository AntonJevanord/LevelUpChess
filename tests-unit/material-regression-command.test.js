'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, readPilotArchive, formatReport, main, OPENING_GROUPS } = require('../scripts/material-regression');

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-offline-material-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fixture() {
  const sample = { x: [1], y: 0.5, weight: 1, gameId: 'g', pairId: 'p', groupId: 'knights', phase: 'middlegame' };
  const dataset = { schemaVersion: 1, featureNames: ['pawn'], samples: [sample],
    games: [{ gameId: 'g', pairId: 'p', groupId: 'knights', result: '1/2-1/2', samples: 1 }],
    sampling: { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 }, limitations: ['Selected data, not universal material prices.'] };
  const analysis = { coverage: { groups: 1, features: [{ name: 'pawn', nonzeroGames: 1, groupsWithNonzero: 1 }] },
    rank: { rank: 1, columns: 2, fullRank: false },
    fit: { converged: true, iterations: 1, coefficients: { pawn: 0 }, intercept: 0, metrics: { brier: 0, logLoss: Math.log(2) } },
    validation: { available: false, reason: 'one-family' },
    bootstrap: { available: false, reason: 'insufficient-groups', requested: 0, completed: 0 },
    normalized: { available: false, reason: 'rank-deficient', values: null }, warnings: ['Rank deficient.'] };
  return { dataset, analysis, source: { sources: [], profile: { hash: 'profile', registryHash: 'registry' },
    inputs: [{ file: 'archive.games.jsonl', sha256: 'a'.repeat(64), bytes: 10 }], openingGroups: OPENING_GROUPS } };
}

test('offline command accepts only bounded analysis options and requires an explicit output', () => {
  assert.deepEqual(parseArgs(['--help']), { bootstrap: 200, seed: 42, help: true });
  assert.deepEqual(parseArgs(['--out', 'r', '--bootstrap', '0', '--seed', '7']), { out: 'r', bootstrap: 0, seed: 7 });
  assert.deepEqual(parseArgs(['--out', 'r', '--dataset', 'controls']), { out: 'r', dataset: 'controls', bootstrap: 200, seed: 42 });
  for (const args of [[], ['--out'], ['--out', 'r', '--bootstrap', '-1'], ['--out', 'r', '--bootstrap', '1001'],
    ['--out', 'r', '--seed', '1.2'], ['--out', 'r', '--seed', '4294967296'], ['--help', '--out', 'r'],
    ['--out', 'r', '--out', 'q'], ['--out', 'r', '--engine', 'stockfish'], ['--out', 'r', '--jobs', '3'],
    ['--out', 'r', '--dataset', 'both'], ['--out', 'r', '--dataset', 'controls', '--dataset', 'pilot']]) {
    assert.throws(() => parseArgs(args), args.join(' '));
  }
});

test('control mode selects its adapter, preserves audit records and dispatches the deduplicated analysis', async t => {
  const directory = path.join(temporary(t), 'controls'), data = fixture();
  data.source.selection = { sourceRecords: 200, selectedRecords: 80, uniqueHistories: 40, historyKeys: { g: 'hash' } };
  const summary = { selection: { uniqueHistories: 40, duplicateRecords: 40 },
    analyses: { ordinary: { analysis: data.analysis, ordinaryRatios: { available: false, reason: 'unsupported' } },
      combined: { analysis: data.analysis, amazonBonus: { available: false, reason: 'unidentifiable-zero-upgrade-imbalance' } } },
    warnings: ['No Amazon imbalance.'] };
  const result = await main(['--dataset', 'controls', '--out', directory, '--bootstrap', '0'], {
    readPilotArchive() { throw new Error('must not load handicap pilot'); },
    readControlArchive: () => data.source,
    exportDataset: async () => data.dataset,
    analyzeControls: (dataset, options) => {
      assert.equal(dataset, data.dataset); assert.deepEqual(options.historyKeys, { g: 'hash' });
      assert.equal(options.bootstrap, 0); return summary;
    }, log() {},
  });
  assert.equal(result.report.format, 'levelup-material-control-diagnostic');
  assert.equal(result.manifest.dataset, 'controls');
  const text = fs.readFileSync(path.join(directory, 'regression-report.md'), 'utf8');
  assert.match(text, /Distinct physical histories: 40/);
  assert.match(text, /unidentifiable-zero-upgrade-imbalance/);
  assert.match(text, /missing information, not a zero-value upgrade/);
  assert.match(text, /held-out|Held-out/);
});

test('control selection failures stop before output creation or fitting', async t => {
  const directory = path.join(temporary(t), 'invalid-controls');
  await assert.rejects(main(['--dataset', 'controls', '--out', directory], {
    readControlArchive() { throw new Error('Invalid original control archive'); },
    analyzeControls() { throw new Error('must not fit'); }, log() {},
  }), /Invalid original control archive/);
  assert.equal(fs.existsSync(directory), false);
});

test('archive loader keeps the two matched source contexts and groups related opening prefixes', () => {
  const archive = readPilotArchive();
  assert.deepEqual(archive.sources.map(source => source.records.length), [256, 64]);
  assert.deepEqual(archive.sources[0].identity, archive.sources[1].identity);
  assert.equal(archive.sources[0].identity.engineIdentityVerified, false);
  assert.equal(archive.openingGroups['ordinary-knights'], archive.openingGroups['four-knights-prefix']);
  assert.equal(archive.openingGroups['open-e-pawns'], archive.openingGroups['french-prefix']);
  assert.equal(new Set(Object.values(archive.openingGroups)).size, 5);
});

test('checksum mismatch rejects corrupted evidence before creating any output', async t => {
  const root = temporary(t), archive = path.join(root, 'archive'), output = path.join(root, 'output');
  fs.mkdirSync(archive);
  const source = path.resolve(__dirname, '../experiments/balance/results');
  for (const name of ['material-pilot-001.audit.json', 'material-pilot-001.control.games.jsonl']) fs.copyFileSync(path.join(source, name), path.join(archive, name));
  fs.appendFileSync(path.join(archive, 'material-pilot-001.control.games.jsonl'), ' ');
  await assert.rejects(main(['--out', output, '--archive', archive], { log() {} }), /checksum mismatch/);
  assert.equal(fs.existsSync(output), false);
});

test('report withholds material prices and surfaces grouped validation failures', () => {
  const data = fixture();
  const text = formatReport({ dataset: { ...data.dataset, sampleCount: 1 }, analysis: data.analysis });
  assert.match(text, /no calibrated material values/);
  assert.match(text, /Draws remain scored as 0.5/);
  assert.match(text, /Pawn-normalized estimates available: false \(rank-deficient\)/);
  assert.match(text, /Raw coefficients use the fitted logistic scale, not centipawns/);
  assert.doesNotMatch(text, /\| pawn \| Pawn units/);
});

test('successful offline analysis writes reproducible artifacts without modifying source data', async t => {
  const directory = path.join(temporary(t), 'result'), data = fixture(), messages = [];
  const original = structuredClone(data.dataset);
  const result = await main(['--out', directory, '--bootstrap', '0'], {
    readPilotArchive: () => data.source,
    exportDataset: async input => { assert.equal(input.profile.hash, 'profile'); return data.dataset; },
    analyzeDataset: (dataset, options) => { assert.equal(dataset, data.dataset); assert.equal(options.bootstrap, 0); return data.analysis; },
    log: message => messages.push(message),
  });
  assert.deepEqual(data.dataset, original);
  assert.equal(result.manifest.engineGamesStarted, 0);
  assert.equal(result.manifest.actualEngineAndSourceIdentityVerified, false);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['analysis-manifest.json', 'dataset.json', 'regression-report.json', 'regression-report.md', 'samples.jsonl']);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'dataset.json'), 'utf8'));
  assert.equal(metadata.sampleCount, 1); assert.equal(metadata.samples, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'samples.jsonl'), 'utf8')), original.samples[0]);
  assert.ok(messages.some(message => message.includes('unavailable (rank-deficient)')));
  const { createHash } = require('node:crypto');
  assert.equal(result.manifest.samplesSha256, createHash('sha256').update(fs.readFileSync(path.join(directory, 'samples.jsonl'))).digest('hex'));
  await assert.rejects(main(['--out', directory], { log() {} }), /new empty output/);
});

test('invalid data fails before outputs and help needs no archive or fit', async t => {
  const directory = path.join(temporary(t), 'r');
  await assert.rejects(main(['--out', directory], {
    readPilotArchive: () => fixture().source,
    exportDataset: async () => { throw new Error('Invalid legal replay'); }, log() {},
  }), /Invalid legal replay/);
  assert.equal(fs.existsSync(directory), false);
  assert.deepEqual(await main(['--help'], { log() {}, readPilotArchive() { throw new Error('must not read'); } }), { help: true });
});
