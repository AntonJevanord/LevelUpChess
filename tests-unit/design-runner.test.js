const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const originalDesignIds = [
  'knight.blue@1', 'knight.orange@1', 'knight.purple@1',
  'bishop.blue@1', 'bishop.orange@1', 'bishop.purple@1',
  'queen.blue@1', 'queen.orange@1', 'queen.purple@1',
  'pawn.blue@1', 'pawn.orange@1', 'pawn.purple@1', 'pawn.purple@2',
  'rook.blue@1', 'rook.orange@1', 'rook.purple@1', 'rook.purple@2',
];

function simple() {
  return {
    schemaVersion: 2, name: 'Dynamic design workflow; not balance evidence',
    engine: { nodes: 500, maxPlies: 4 },
    comparisons: [{ id: 'two-revisions', armyA: { upgrades: { a2: 'pawn.purple@1', a1: 'rook.purple@1' } }, armyB: { upgrades: { a2: 'pawn.purple@2', a1: 'rook.purple@2' } } }],
  };
}

function originalLibrary() {
  const config = simple();
  config.comparisons = [{
    id: 'all-active',
    armyA: { upgrades: { c2: 'pawn.purple@1', d2: 'pawn.purple@2' } },
    armyB: { upgrades: { a1: 'rook.purple@1', h1: 'rook.purple@2' } },
  }, {
    id: 'other-families-a',
    armyA: { upgrades: { a2: 'pawn.blue@1', b2: 'pawn.orange@1', c1: 'bishop.purple@1' } },
    armyB: { upgrades: { b1: 'knight.blue@1', g1: 'knight.orange@1', d1: 'queen.purple@1' } },
  }, {
    id: 'other-families-b',
    armyA: { upgrades: { b1: 'knight.purple@1', c1: 'bishop.blue@1', d1: 'queen.orange@1' } },
    armyB: { upgrades: { c1: 'bishop.orange@1', a1: 'rook.blue@1', h1: 'rook.orange@1' } },
  }, { id: 'last-queen', armyA: { upgrades: { d1: 'queen.blue@1' } }, armyB: {} }];
  return config;
}

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-design-runner-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function read(dir, name) { return fs.readFileSync(path.join(dir, name), 'utf8'); }
function json(dir, name) { return JSON.parse(read(dir, name)); }
function records(dir) { return read(dir, 'games.jsonl').trim().split('\n').filter(Boolean).map(JSON.parse); }
function run(config, outDir, options = {}) {
  return require('../scripts/balance/run').runMatches({ config, schedule: makeSchedule(config), enginePath: process.env.FAIRY_STOCKFISH_PATH, outDir, ...options });
}
function at(fen, square) {
  const rank = fen.split(' ')[0].split('/')[8 - Number(square[1])];
  const expanded = [...rank].flatMap(c => /[1-8]/.test(c) ? Array(Number(c)).fill(null) : [c]);
  return expanded[square.charCodeAt(0) - 97];
}

const native = { skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 60000 };

test('schema 2 normalizes stable IDs and preserves the schema 1 numeric shape', () => {
  const input = simple();
  const before = structuredClone(input);
  const normalized = normalizeConfig(input);
  assert.deepEqual(input, before);
  assert.equal(normalized.schemaVersion, 2);
  assert.deepEqual(normalized.comparisons[0].armyA, { upgrades: { a1: 'rook.purple@1', a2: 'pawn.purple@1' }, remove: [] });
  assert.deepEqual(normalizeConfig(normalized), normalized);
  const legacy = normalizeConfig({ schemaVersion: 1, name: 'Legacy', comparisons: [{ id: 'old', armyA: { upgrades: { b1: 1, a2: 0 } }, armyB: { upgrades: { e1: 3 } } }] });
  assert.equal(legacy.schemaVersion, 1);
  assert.deepEqual(legacy.comparisons[0].armyA, { upgrades: { b1: 1 }, remove: [] });
  assert.deepEqual(legacy.comparisons[0].armyB, { upgrades: { e1: 3 }, remove: [] });
});

test('schema 2 rejects unknown, numeric, wrong-family and royal choices before scheduling', () => {
  for (const upgrades of [
    { a2: 3 }, { a2: 'pawn.purple@99' }, { a2: 'rook.purple@2' },
    { d1: 'pawn.blue@1' }, { e1: 'king.blue@1' }, { a7: 'pawn.blue@1' },
  ]) {
    const config = simple();
    config.comparisons[0].armyA.upgrades = upgrades;
    assert.throws(() => normalizeConfig(config));
  }
  const config = simple();
  config.comparisons[0].armyA.remove = ['a2'];
  assert.throws(() => normalizeConfig(config), /both upgrade and remove/);
  const expensive = simple();
  expensive.comparisons[0].armyA.upgrades = { a2: 'pawn.purple@1', b2: 'pawn.purple@2', c2: 'pawn.blue@1' };
  assert.throws(() => normalizeConfig(expensive), /at most 6/);
  assert.throws(() => normalizeConfig({ ...simple(), schemaVersion: 3 }), /schemaVersion/);
});

test('limiting scheduled pairs preserves the full declared campaign registry and letters', native, async t => {
  const dir = temp(t);
  const config = normalizeConfig(originalLibrary());
  const { createDesignRegistry } = require('../scripts/balance/design-registry');
  const { compileDesignProfile } = require('../scripts/balance/design-profile');
  const expected = createDesignRegistry(config);
  const schedule = makeSchedule(config).filter(game => game.comparisonId === 'last-queen');
  await run(config, dir, { schedule, shouldStop: () => 'game' });
  const manifest = json(dir, 'run.json');
  assert.equal(manifest.schedule.length, 2);
  assert.equal(manifest.designRegistry.definitions.length, 17);
  assert.deepEqual(manifest.designRegistry, expected);
  assert.equal(manifest.designProfile.hash, compileDesignProfile(expected).hash);
});

// This scenario repeats full native preflight across cancellation and resume.
test('one frozen original-library allocation supports cancellation and replay across colors', { ...native, timeout: 120000 }, async t => {
  const dir = temp(t);
  const config = normalizeConfig(originalLibrary());
  const controller = new AbortController();
  let checked = 0;
  const interrupted = await run(config, dir, {
    signal: controller.signal,
    onProgress(message) {
      if (/passed \d+ movement checks/.test(message)) checked++;
      const checkpoint = fs.existsSync(path.join(dir, 'checkpoint.json')) ? json(dir, 'checkpoint.json') : null;
      if (checkpoint?.current?.moves.length === 1) controller.abort();
    },
  });
  assert.equal(interrupted.stopped, true);
  assert.equal(checked, 1, 'all comparisons share one fully preflighted profile');
  const manifest = json(dir, 'run.json');
  assert.equal(manifest.designRegistry.definitions.length, originalDesignIds.length);
  assert.deepEqual(new Set(manifest.designRegistry.definitions.map(d => d.id)), new Set(originalDesignIds));
  const letters = new Map(manifest.designRegistry.allocations.map(a => [a.id, a.letter]));
  assert.notEqual(letters.get('pawn.purple@1'), letters.get('pawn.purple@2'));
  assert.notEqual(letters.get('rook.purple@1'), letters.get('rook.purple@2'));
  const first = records(dir)[0];
  assert.equal(first.status, 'aborted');
  assert.equal(first.registryHash, manifest.designRegistry.hash);
  assert.equal(first.profileHash, manifest.designProfile.hash);
  const savedMoves = [...first.moves];
  const originalManifest = read(dir, 'run.json');
  const originalIni = read(dir, manifest.rulesProfiles[0].file);
  const stopped = await run(config, dir, { resume: true, shouldStop: () => 'game' });
  assert.equal(stopped.stopped, true);
  const retry = records(dir).find(r => r.id === first.id && r.attempt === 2);
  assert.ok(retry);
  assert.deepEqual(retry.moves.slice(0, savedMoves.length), savedMoves);
  const done = await run(config, dir, { resume: true });
  assert.equal(done.nextIndex, 8);
  assert.equal(read(dir, 'run.json'), originalManifest);
  assert.equal(read(dir, manifest.rulesProfiles[0].file), originalIni);
  for (const record of records(dir)) {
    assert.equal(record.profileHash, manifest.designProfile.hash);
    assert.equal(record.registryHash, manifest.designRegistry.hash);
    assert.equal(record.registryReference, 'run.json#designRegistry');
    assert.equal(record.result, '*', 'short workflow limits do not manufacture wins or draws');
    if (record.comparisonId === 'all-active') {
      const aRank = record.aColor === 'w' ? '2' : '7';
      const caseLetter = letter => record.aColor === 'w' ? letter.toUpperCase() : letter;
      assert.equal(at(record.startFen, `c${aRank}`), caseLetter(letters.get('pawn.purple@1')));
      assert.equal(at(record.startFen, `d${aRank}`), caseLetter(letters.get('pawn.purple@2')));
    }
  }
  assert.match(read(dir, 'games.pgn'), new RegExp(`\\[LevelUpProfileHash "${manifest.designProfile.hash}"\\]`));
  assert.match(read(dir, 'games.pgn'), /\[LevelUpRegistryRef "run.json#designRegistry"\]/);
});

test('registry, allocation, profile and archived INI tampering is rejected before any store write', native, async t => {
  const dir = temp(t);
  const config = normalizeConfig(simple());
  await run(config, dir, { shouldStop: () => 'game' });
  const originalManifest = read(dir, 'run.json');
  const manifest = JSON.parse(originalManifest);
  const originalIni = read(dir, manifest.rulesProfiles[0].file);
  const journal = read(dir, 'games.jsonl');
  const checkpoint = read(dir, 'checkpoint.json');
  const changes = [
    m => { m.designRegistry.definitions[0].movement = 'Q'; },
    m => { m.designRegistry.allocations[0].letter = 'z'; },
    m => { m.designRegistry.hash = '0'.repeat(64); },
    m => { m.designProfile.config += '\n# changed'; },
    m => { m.designProfile.hash = '0'.repeat(64); },
    m => { m.rulesProfiles[0].configSha256 = '0'.repeat(64); },
    null,
  ];
  for (const change of changes) {
    const modified = JSON.parse(originalManifest);
    if (change) change(modified);
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(modified, null, 2) + '\n');
    fs.writeFileSync(path.join(dir, manifest.rulesProfiles[0].file), change ? originalIni : originalIni + '\n# changed');
    const open = fs.openSync;
    const write = t.mock.method(fs, 'openSync', (file, flags, ...args) => {
      if (typeof flags === 'string' && /[wa+]/.test(flags)) throw new Error('Unexpected store write before resume validation.');
      return open(file, flags, ...args);
    });
    await assert.rejects(run(config, dir, { resume: true }), error => !error.message.includes('Unexpected store write'));
    write.mock.restore();
    assert.equal(read(dir, 'games.jsonl'), journal);
    assert.equal(read(dir, 'checkpoint.json'), checkpoint);
    assert.equal(fs.existsSync(path.join(dir, 'run.lock')), false);
  }
});

test('resume rejects checkpoint and interrupted journal references to another profile before writing', native, async t => {
  const dir = temp(t);
  const config = normalizeConfig(simple());
  const controller = new AbortController();
  await run(config, dir, {
    signal: controller.signal,
    onProgress() {
      if (fs.existsSync(path.join(dir, 'checkpoint.json')) && json(dir, 'checkpoint.json').current?.moves.length === 1) controller.abort();
    },
  });
  const checkpoint = read(dir, 'checkpoint.json');
  const journal = read(dir, 'games.jsonl');
  assert.equal(records(dir)[0].status, 'aborted');
  for (const target of ['checkpoint', 'journal']) {
    for (const field of ['profileHash', 'registryHash', 'registryReference']) {
      fs.writeFileSync(path.join(dir, 'checkpoint.json'), checkpoint);
      fs.writeFileSync(path.join(dir, 'games.jsonl'), journal);
      if (target === 'checkpoint') {
        const changed = JSON.parse(checkpoint);
        changed.current[field] = 'tampered';
        fs.writeFileSync(path.join(dir, 'checkpoint.json'), JSON.stringify(changed) + '\n');
      } else {
        const changed = JSON.parse(journal.trim());
        changed[field] = 'tampered';
        fs.writeFileSync(path.join(dir, 'games.jsonl'), JSON.stringify(changed) + '\n');
      }
      const beforeCheckpoint = read(dir, 'checkpoint.json');
      const beforeJournal = read(dir, 'games.jsonl');
      const open = fs.openSync;
      const guard = t.mock.method(fs, 'openSync', (file, flags, ...args) => {
        if (typeof flags === 'string' && /[wa+]/.test(flags)) throw new Error('Unexpected store write before profile-reference validation.');
        return open(file, flags, ...args);
      });
      await assert.rejects(run(config, dir, { resume: true }), /does not match the frozen design profile/);
      guard.mock.restore();
      assert.equal(read(dir, 'checkpoint.json'), beforeCheckpoint);
      assert.equal(read(dir, 'games.jsonl'), beforeJournal);
      assert.equal(fs.existsSync(path.join(dir, 'run.lock')), false);
    }
  }
});
