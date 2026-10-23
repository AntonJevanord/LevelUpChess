const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { normalizeEvaluation, rookPoints, requireManualValues } = require('../scripts/balance/evaluation');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { UciEngine } = require('../scripts/balance/uci');
const { createMatchRules } = require('../dist/balance-rules.cjs');

const IDS = ['rook.purple@3', 'rook.purple@4', 'rook.purple@5'];
const VALUES = { mg: 2042, eg: 2208 };
const clone = value => structuredClone(value);
function configuration(evaluation) {
  return normalizeConfig({ schemaVersion: 2, name: 'Manual value workflow, not balance evidence', seed: 42,
    engine: { nodes: 500, maxPlies: 4 }, openings: [{ id: 'start', moves: [] }],
    comparisons: IDS.map((id, index) => ({ id: `blink-${index}-v-amazon`, armyA: { upgrades: { a1: id } }, armyB: { upgrades: { d1: 'queen.purple@1' } } })),
    ...(evaluation === undefined ? {} : { evaluation }),
  });
}
const policy = () => ({ pieceValues: Object.fromEntries(IDS.map(id => [id, { ...VALUES }])) });
const compiled = config => compileDesignProfile(createDesignRegistry(config), config.evaluation);
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-evaluation-policy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function diagnostic(profile) {
  const pieces = {};
  for (const allocation of profile.registry.allocations) {
    const expected = profile.evaluation?.pieceValues[allocation.id];
    if (!expected) continue;
    for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
      pieces[letter] = { rawMg: expected.mg, rawEg: expected.eg, captureMg: expected.mg, captureEg: expected.eg, evalMg: expected.mg, evalEg: expected.eg };
    }
  }
  return { version: 1, pieces };
}
function journalRecord(config, manifest, game) {
  return { id: game.id, pairId: game.pairId, comparisonId: game.comparisonId, openingId: game.openingId,
    aColor: game.aColor, attempt: 1, status: 'aborted', result: '*', engine: config.engine,
    whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
    blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB,
    profileHash: manifest.designProfile.hash, registryHash: manifest.designRegistry.hash,
    registryReference: 'run.json#designRegistry', variant: manifest.designProfile.variant, evaluation: clone(config.evaluation) };
}
function snapshot(directory) {
  const entries = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else entries.push([path.relative(directory, filename), fs.readFileSync(filename, 'utf8')]);
    }
  }
  visit(directory);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}
async function rejectsBeforeWrites(t, directory, action, expected) {
  const before = snapshot(directory), originalOpen = fs.openSync;
  const open = t.mock.method(fs, 'openSync', (filename, flags, ...args) => {
    if (typeof flags === 'string' && /[wa+]/.test(flags)) throw new Error('Unexpected write before policy validation.');
    return originalOpen(filename, flags, ...args);
  });
  const write = t.mock.method(fs, 'writeFileSync', () => { throw new Error('Unexpected write before policy validation.'); });
  try { await assert.rejects(action, expected); }
  finally { write.mock.restore(); open.mock.restore(); }
  assert.deepEqual(snapshot(directory), before);
}

test('eight total rook points use the ordinary-rook-equals-five scale separately in both phases', () => {
  assert.deepEqual(rookPoints(5), { mg: 1276, eg: 1380 });
  assert.deepEqual(rookPoints(8), VALUES);
  assert.deepEqual(rookPoints(7.5), { mg: 1914, eg: 2070 });
  assert.ok(Object.isFrozen(rookPoints(8)));
  for (const input of [0, -1, NaN, Infinity, '8', null, 100]) assert.throws(() => rookPoints(input));
});

test('manual evaluation is optional, canonical, immutable, and idempotent without mutating input', () => {
  const original = policy(), before = clone(original);
  const normalized = normalizeEvaluation(original, IDS);
  assert.deepEqual(original, before);
  assert.deepEqual(normalizeEvaluation(normalized, IDS), normalized);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.pieceValues));
  assert.ok(Object.isFrozen(normalized.pieceValues[IDS[0]]));
  assert.equal(normalizeEvaluation(undefined, IDS), undefined);
  const config = configuration(original);
  assert.deepEqual(normalizeConfig(config), config);
  assert.ok(!Object.hasOwn(configuration(), 'evaluation'));
});

test('manual policies reject unsupported, unknown, unselected, empty, unsafe and legacy-schema settings', () => {
  for (const input of [null, [], new Date(), {}, { pieceValues: {} }, { pieceValues: [] },
    { pieceValues: { unknown: VALUES } }, { pieceValues: { 'queen.purple@1': VALUES } },
    { pieceValues: { [IDS[0]]: { mg: 0, eg: 2208 } } },
    { pieceValues: { [IDS[0]]: { mg: 2042.5, eg: 2208 } } },
    { pieceValues: { [IDS[0]]: { mg: 2042, eg: -1 } } },
    { pieceValues: { [IDS[0]]: { mg: 2042, eg: 10001 } } },
    { pieceValues: { [IDS[0]]: { mg: '2042', eg: 2208 } } },
    { pieceValues: { [IDS[0]]: { mg: 2042 } } },
    { pieceValues: { [IDS[0]]: { mg: 2042, eg: 2208, points: 8 } } },
    { pieceValues: { [IDS[0]]: VALUES }, other: true },
  ]) assert.throws(() => normalizeEvaluation(input, IDS));
  assert.throws(() => normalizeConfig({ schemaVersion: 1, name: 'Legacy', comparisons: [{ id: 'ordinary', armyA: {}, armyB: {} }], evaluation: policy() }), /schemaVersion 2/);
  const config = configuration();
  assert.throws(() => normalizeConfig({ ...config, evaluation: { pieceValues: { 'pawn.blue@1': VALUES } } }), /selected/);
});

test('automatic profiles retain the exact previously bundled shape and hashes', () => {
  const { getPlayableProfiles } = require('../scripts/playable-profile');
  const artifacts = ['playable-profile', 'playable-reference-profile', 'playable-alternatives-profile'];
  for (const name of artifacts) {
    const saved = require(`../src/${name}.json`);
    assert.deepEqual(getPlayableProfiles().find(profile => profile.variant === saved.variant), saved, name);
  }
  const profile = compiled(configuration());
  assert.ok(!Object.hasOwn(profile, 'evaluation'));
  assert.doesNotMatch(profile.config, /^pieceValue(?:Mg|Eg)/m);
});

test('overrides change profile identity while preserving every movement, role and allocated letter', () => {
  const automatic = compiled(configuration()), manual = compiled(configuration(policy()));
  assert.equal(manual.registryHash, automatic.registryHash);
  assert.deepEqual(manual.registry, automatic.registry);
  assert.deepEqual(manual.roles, automatic.roles);
  assert.deepEqual(manual.definitionsByLetter, automatic.definitionsByLetter);
  assert.deepEqual(manual.capabilityProbes, automatic.capabilityProbes);
  assert.notEqual(manual.hash, automatic.hash);
  assert.notEqual(manual.variant, automatic.variant);
  for (const id of IDS) {
    const { letter } = manual.registry.allocations.find(allocation => allocation.id === id);
    assert.match(manual.config, new RegExp(`^pieceValueMg = .*\\b${letter}:2042\\b`, 'm'));
    assert.match(manual.config, new RegExp(`^pieceValueEg = .*\\b${letter}:2208\\b`, 'm'));
  }
  const changed = policy(); changed.pieceValues[IDS[1]].eg++;
  assert.notEqual(compiled(configuration(changed)).hash, manual.hash);
  assert.throws(() => compileDesignProfile(automatic.registry, { pieceValues: { 'pawn.blue@1': VALUES } }), /selected/);
});

test('automatic runs make no diagnostic request; manual runs verify every phase and table for both colors', async () => {
  const automatic = compiled(configuration());
  assert.equal(await requireManualValues({ pieceValues() { throw new Error('Unexpected diagnostic'); } }, automatic), undefined);
  assert.equal(await requireManualValues({}, null), undefined);
  const manual = compiled(configuration(policy()));
  const report = diagnostic(manual), calls = [];
  const signal = new AbortController().signal;
  assert.equal(await requireManualValues({ async pieceValues(options) { calls.push(options); return report; } }, manual, { signal }), report);
  assert.deepEqual(calls, [{ signal }]);
});

test('partially honored overrides, missing colors and old engines fail before any search', async () => {
  const manual = compiled(configuration(policy()));
  const letter = manual.registry.allocations.find(allocation => allocation.id === IDS[0]).letter;
  for (const side of [letter, letter.toUpperCase()]) for (const field of ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']) {
    const report = diagnostic(manual); report.pieces[side][field]++;
    await assert.rejects(requireManualValues({ async pieceValues() { return report; } }, manual), new RegExp(`${field}.*expected`));
  }
  for (const report of [{ version: 0, pieces: {} }, { version: 1 }, diagnostic(manual)]) {
    if (report.pieces?.[letter]) delete report.pieces[letter];
    await assert.rejects(requireManualValues({ async pieceValues() { return report; } }, manual), /Manual piece-value preflight failed/);
  }
  await assert.rejects(requireManualValues({}, manual), /bundled version-16 engine/);
  const abort = Object.assign(new Error('Cancelled'), { name: 'AbortError' });
  await assert.rejects(requireManualValues({ async pieceValues() { throw abort; } }, manual), error => error === abort);
});

test('automatic and manual policies produce identical starting positions and both-color legal moves', async () => {
  const automaticProfile = compiled(configuration()), manualProfile = compiled(configuration(policy()));
  const automatic = await createMatchRules({ profile: automaticProfile }), manual = await createMatchRules({ profile: manualProfile });
  for (const id of IDS) for (const color of ['w', 'b']) {
    const a = { upgrades: { a1: id } }, b = { upgrades: { d1: 'queen.purple@1' } };
    const white = color === 'w' ? a : b, black = color === 'b' ? a : b;
    assert.equal(manual.startingFen(white, black), automatic.startingFen(white, black));
    const first = automatic.createBoard(automatic.startingFen(white, black));
    const second = manual.createBoard(manual.startingFen(white, black));
    try {
      for (const move of ['e2e4', 'e7e5', 'g1f3', 'g8f6']) {
        assert.deepEqual(first.moves().sort(), second.moves().sort());
        assert.equal(first.push(move), true); assert.equal(second.push(move), true);
        assert.equal(first.fen(), second.fen());
      }
    } finally { first.dispose(); second.dispose(); }
  }
});

test('a partial native override cannot start even the first search or create a scored game', async t => {
  const config = configuration(policy()), profile = compiled(config), report = diagnostic(profile);
  report.pieces[profile.registry.allocations.find(allocation => allocation.id === IDS[0]).letter].rawMg = 3536;
  const directory = temporary(t); let searches = 0, perfts = 0;
  t.mock.method(UciEngine.prototype, 'start', async () => ({ idname: 'Partial override engine' }));
  t.mock.method(UciEngine.prototype, 'pieceValues', async () => report);
  t.mock.method(UciEngine.prototype, 'search', async () => { searches++; throw new Error('Unexpected search'); });
  t.mock.method(UciEngine.prototype, 'perft', async () => { perfts++; throw new Error('Unexpected movement check'); });
  await assert.rejects(require('../scripts/balance/run').runMatches({ config, schedule: makeSchedule(config), outDir: directory, enginePath: process.execPath }), /Manual piece-value preflight failed/);
  assert.equal(searches, 0); assert.equal(perfts, 0);
  assert.equal(fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'), '');
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
});

test('a frozen manual run rejects changed or removed overrides before rewriting any artifact', async t => {
  const config = configuration(policy()), directory = temporary(t);
  const { runParallel } = require('../scripts/balance/parallel');
  await runParallel({ config, outDir: directory, enginePath: process.execPath, jobs: 2, shouldStop: () => 'game' });
  const files = fs.readdirSync(directory).filter(file => fs.statSync(path.join(directory, file)).isFile());
  const before = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(directory, file), 'utf8')]));
  const edited = clone(config); edited.evaluation.pieceValues[IDS[0]].mg++;
  for (const changed of [edited, configuration()]) {
    await assert.rejects(runParallel({ config: changed, outDir: directory, resume: true, enginePath: process.execPath, shouldStop: () => 'game' }), /Cannot resume/);
    for (const [file, content] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(directory, file), 'utf8'), content, file);
  }
});

test('serial resume rejects changed or missing journal policy before writes while checkpoints use profile hashes', async t => {
  const config = configuration(policy()), directory = temporary(t), schedule = makeSchedule(config);
  const { runMatches } = require('../scripts/balance/run');
  const run = resume => runMatches({ config, schedule, outDir: directory, enginePath: process.execPath, resume });
  t.mock.method(UciEngine.prototype, 'start', async () => { throw new Error('Stopped before native preflight.'); });
  await assert.rejects(run(false), /Stopped before native preflight/);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'));
  const original = journalRecord(config, manifest, schedule[0]);
  const current = { id: original.id, profileHash: original.profileHash, registryHash: original.registryHash, registryReference: original.registryReference };
  const save = (record, checkpoint = current) => {
    fs.writeFileSync(path.join(directory, 'games.jsonl'), JSON.stringify(record) + '\n');
    fs.writeFileSync(path.join(directory, 'checkpoint.json'), JSON.stringify({ schemaVersion: 1, nextIndex: 0, current: checkpoint }) + '\n');
  };
  for (const missing of [false, true]) {
    const changed = clone(original);
    if (missing) delete changed.evaluation;
    else changed.evaluation.pieceValues[IDS[0]].mg++;
    save(changed);
    await rejectsBeforeWrites(t, directory, () => run(true), /journal record evaluation does not match/);
  }
  save(original, { ...current, profileHash: 'changed' });
  await rejectsBeforeWrites(t, directory, () => run(true), /checkpoint profileHash does not match/);
  save(original);
  assert.ok(!Object.hasOwn(current, 'evaluation'));
  await assert.rejects(run(true), /Stopped before native preflight/, 'a matching checkpoint needs no duplicate policy annotation');
});

test('parallel resume rejects altered policy in aggregate or uncollected worker journals before writes', async t => {
  const config = configuration(policy()), directory = temporary(t), { runParallel } = require('../scripts/balance/parallel');
  const run = resume => runParallel({ config, outDir: directory, enginePath: process.execPath, jobs: 2, resume, shouldStop: () => 'game' });
  await run(false);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'));
  const shard = manifest.parallel.shards[0], workerDirectory = path.join(directory, shard.directory);
  const workerSchedule = manifest.schedule.filter(game => shard.scheduleIds.includes(game.id));
  const worker = { ...manifest, schedule: workerSchedule,
    configHash: require('node:crypto').createHash('sha256').update(JSON.stringify({ config, schedule: workerSchedule })).digest('hex') };
  fs.mkdirSync(workerDirectory, { recursive: true });
  fs.writeFileSync(path.join(workerDirectory, 'run.json'), JSON.stringify(worker) + '\n');
  const original = journalRecord(config, manifest, workerSchedule[0]);
  for (const target of [directory, workerDirectory]) for (const missing of [false, true]) {
    const changed = clone(original);
    if (missing) delete changed.evaluation;
    else changed.evaluation.pieceValues[IDS[0]].eg++;
    fs.writeFileSync(path.join(directory, 'games.jsonl'), '');
    fs.writeFileSync(path.join(workerDirectory, 'games.jsonl'), '');
    fs.writeFileSync(path.join(target, 'games.jsonl'), JSON.stringify(changed) + '\n');
    await rejectsBeforeWrites(t, directory, () => run(true), /journal evaluation does not match the frozen policy/);
  }
});

const nativePath = process.env.LEVELUP_VALUE_ENGINE;
test('the patched native engine confirms all manual tables and replies legally for either army color', { skip: !nativePath, timeout: 60000 }, async t => {
  const config = configuration(policy()), profile = compiled(config), directory = temporary(t);
  const variantPath = path.join(directory, 'profile.ini'); fs.writeFileSync(variantPath, profile.config);
  const rules = await createMatchRules({ profile });
  const engine = new UciEngine({ path: nativePath, variantPath, variant: profile.variant, options: { threads: 1, hash: 16 } });
  try {
    await engine.start(); await engine.newGame();
    await requireManualValues(engine, profile);
    for (const id of IDS) for (const color of ['w', 'b']) {
      const a = { upgrades: { a1: id } }, b = { upgrades: { d1: 'queen.purple@1' } };
      const fen = rules.startingFen(color === 'w' ? a : b, color === 'b' ? a : b), board = rules.createBoard(fen);
      try {
        assert.deepEqual(await engine.perft({ fen }), board.moves().sort());
        const reply = await engine.search({ fen, nodes: 500 });
        assert.ok(board.moves().includes(reply.move));
      } finally { board.dispose(); }
    }
  } finally { await engine.close(); }
});
