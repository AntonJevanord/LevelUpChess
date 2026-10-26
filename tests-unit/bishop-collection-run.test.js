'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getPlan } = require('./bishop-fixture');
const { runBishopCollection, checkBishopCollection, readBishopManifest, validateValues, invocationPrefix } = require('../scripts/balance/bishop-collection-run');
const { createHash } = require('node:crypto');
const { openStore } = require('../scripts/balance/storage');
const MOVES = ['a2a3', 'a7a6', 'a3a4'];
const copy = value => structuredClone(value);

async function fixture(t, options = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-bishop-core-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const plan = await getPlan(), outDir = path.join(temporary, 'run');
  const calls = { searches: [], starts: 0, closes: 0, newGames: 0, preflights: 0, parameters: [] };
  const identity = { engineSha256: 'engine', rulesBundleSha256: 'rules', collectorSha256: 'source' };
  const rulesFactory = async () => ({ createBoard(fen) {
    const history = [], terminalAt = options.terminalAt === undefined ? 3 : options.terminalAt;
    return { fen: () => fen + (history.length ? `|${history.join(',')}` : ''),
      turn: () => history.length % 2 ? 'b' : 'w',
      moves: () => terminalAt !== null && history.length >= terminalAt ? [] : [MOVES[history.length % 3]],
      san(move) { assert.equal(move, MOVES[history.length % 3]); return `m${history.length + 1}`; },
      push(move) { if (move !== MOVES[history.length % 3]) return false; history.push(move); return true; },
      outcome: () => terminalAt !== null && history.length >= terminalAt ? { result: options.result || '1-0', reason: 'checkmate' } : null,
      dispose() {} };
  } });
  const engineFactory = parameters => ({ metadata: { idname: 'fixture' },
    async start() { calls.parameters.push(parameters); calls.starts++; return this.metadata; },
    async newGame() { calls.newGames++; },
    async search(request) {
      calls.searches.push({ fen: request.fen, moves: [...request.moves] });
      await options.onSearch?.(request);
      if (request.signal.aborted) { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }
      return { move: options.badMove ? 'h1h8' : MOVES[request.moves.length % 3], info: null };
    }, async close() { calls.closes++; } });
  const native = { engineName: 'fixture', searchesStarted: 0, parentCompatibility: { passed: true } };
  return { plan, outDir, calls, identity, rulesFactory, native,
    services: { plan, outDir, enginePath: process.execPath, rulesFactory, engineFactory,
      getIdentity: () => copy(identity),
      preflight: async () => { calls.preflights++; return copy(native); } } };
}
const records = directory => fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const stoppedRun = async (f, stopOn = 'Finished ') => {
  let stop = null;
  return runBishopCollection({ ...f.services, untilGames: 320, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith(stopOn)) stop = 'game'; } });
};

function valuesFor(profile) {
  const values = { version: 1, pieces: {} };
  const defaults = [['p', 126, 208], ['n', 781, 854], ['b', 825, 915], ['r', 1276, 1380], ['q', 2538, 2682], ['k', 0, 0],
    ...profile.registry.allocations.map(item => [item.letter, item.id === 'queen.purple@1' ? 3738 : item.id === 'knight.purple@3' ? 1663 : item.id === 'bishop.purple@4' ? 1858 : item.id === 'rook.purple@2' ? 1904 : item.id === 'rook.purple@9' ? 2538 : 1500, item.id === 'queen.purple@1' ? 3875 : item.id === 'knight.purple@3' ? 1877 : item.id === 'bishop.purple@4' ? 1903 : item.id === 'rook.purple@2' ? 1959 : item.id === 'rook.purple@9' ? 2682 : 1700])];
  for (const [letter, mg, eg] of defaults) for (const piece of [letter, letter.toUpperCase()]) {
    values.pieces[piece] = Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'].map(field => [field, field.endsWith('Mg') ? mg : eg]));
  }
  return values;
}

test('prefixes enforce declared complete ten-game position barriers and exactly four workers', async t => {
  const f = await fixture(t);
  for (const untilGames of [0, 1, 24, 319, 321, 1281, 320.5]) {
    await assert.rejects(runBishopCollection({ ...f.services, untilGames }), /declared game checkpoints|bounded scheduled prefix/);
    assert.equal(fs.existsSync(f.outDir), false);
  }
  for (const jobs of [1, 3, 8, '4']) await assert.rejects(runBishopCollection({ ...f.services, jobs }), /four workers/);
  assert.equal(invocationPrefix(f.plan, 320).units.length, 32 * 5);
  assert.equal(invocationPrefix(f.plan, 640).units.length, 64 * 5);
  assert.equal(f.calls.searches.length, 0);
});

test('new studies default to four jobs and preserve exact metadata without starting after a stop', async t => {
  const f = await fixture(t);
  const result = await runBishopCollection({ ...f.services, untilGames: 320, shouldStop: () => 'pair' });
  assert.equal(result.manifest.jobs, 4); assert.equal(result.manifest.format, 'levelup-bishop-collection');
  assert.equal(result.finishedGames, 0); assert.equal(result.checkpointReached, false);
  assert.equal(f.calls.starts, 0); assert.equal(fs.existsSync(path.join(f.outDir, 'run.lock')), false);
  assert.deepEqual(readBishopManifest(f.outDir), result.manifest);
});

test('four workers stop after active games with fresh engine processes and readable color/winner scores', async t => {
  const f = await fixture(t), messages = [];
  let stop = null;
  const result = await runBishopCollection({ ...f.services, untilGames: 320, shouldStop: () => stop,
    onProgress(message) { messages.push(message); if (message.startsWith('Finished ')) stop = 'game'; } });
  assert.ok(result.finishedGames >= 1 && result.finishedGames <= 4);
  assert.equal(f.calls.starts, result.finishedGames * 2); assert.equal(f.calls.starts, f.calls.closes);
  assert.equal(f.calls.starts, f.calls.newGames);
  assert.ok(messages.some(message => message.includes('(White) vs') && message.includes('(Black)')));
  assert.ok(messages.some(message => message.includes('(White) wins.')));
  assert.ok(messages.some(message => message.includes('scored games; partial pairs included')));
  for (const row of result.records) {
    const game = f.plan.schedule.find(game => game.id === row.id);
    for (const key of ['unitId', 'pairId', 'kind', 'aColor', 'openingId', 'comparisonId', 'startFen', 'designA', 'designB', 'whiteDesign', 'blackDesign']) assert.equal(row[key], game[key]);
    assert.equal(row.status, 'completed'); assert.equal(row.attempt, 1);
    assert.deepEqual(row.evaluation, f.plan.profile.evaluation);
  }
  assert.ok(f.calls.parameters.every(parameters => parameters.options.threads === 1 && parameters.options.hash === 32));
});

test('pair stop finishes both color games in each claimed pair and does not claim another unit', async t => {
  const f = await fixture(t); let stop = null;
  const result = await runBishopCollection({ ...f.services, untilGames: 320, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished ')) stop = 'pair'; } });
  const units = new Map();
  for (const row of result.records) { const group = units.get(row.unitId) || []; group.push(row); units.set(row.unitId, group); }
  assert.equal(units.size, 4);
  for (const rows of units.values()) assert.equal(rows.length, rows[0].kind === 'ordinary' ? 1 : 2);
  assert.equal(result.finishedGames, 8);
});

test('running points follow the upgraded army when it changes color, and draws count half', async t => {
  for (const result of ['0-1', '1/2-1/2']) {
    const f = await fixture(t, { result }), messages = [];
    let stop = null;
    await runBishopCollection({ ...f.services, untilGames: 320, shouldStop: () => stop,
      onProgress(message) { messages.push(message); if (message.startsWith('Finished ')) stop = 'pair'; } });
    const firstHead = f.plan.schedule.find(game => game.kind === 'head');
    const subjectLabel = f.plan.roster.find(item => item.id === firstHead.designA).label;
    const opponentLabel = f.plan.roster.find(item => item.id === firstHead.designB).label;
    const subject = messages.filter(message => message.startsWith('Finished ') && message.includes(subjectLabel));
    assert.equal(subject.length, 2);
    assert.ok(subject.at(-1).includes(`${subjectLabel} 1–1 ${opponentLabel} (2 scored games; partial pairs included)`));
    assert.ok(subject.every(message => message.includes(result === '0-1' ? '(Black) wins.' : '; draw.')));
  }
});

test('immediate cancellation preserves active prefixes for later attempts under one frozen manifest', async t => {
  const controller = new AbortController();
  const f = await fixture(t, { onSearch(request) { if (request.moves.length === 1) controller.abort(); } });
  const first = await runBishopCollection({ ...f.services, untilGames: 320, signal: controller.signal });
  const interrupted = first.records.filter(row => row.status === 'aborted');
  assert.ok(interrupted.some(row => row.moves.length === 1));
  const before = fs.readFileSync(path.join(f.outDir, 'collection.json'));
  let stop = null;
  const result = await runBishopCollection({ ...f.services, untilGames: 320, resume: true, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished ')) stop = 'pair'; } });
  for (const row of interrupted) {
    const completed = result.records.find(record => record.id === row.id && record.status === 'completed');
    assert.ok(completed); assert.ok(completed.attempt > row.attempt);
    assert.deepEqual(completed.moves.slice(0, row.moves.length), row.moves);
  }
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), before);
  assert.equal(fs.existsSync(path.join(f.outDir, 'run.lock')), false);
});

test('complete-prefix resume crosses stages without repeated terminal games or manifest changes', async t => {
  const f = await fixture(t);
  const first = await runBishopCollection({ ...f.services, untilGames: 320 });
  assert.equal(first.finishedGames, 320); assert.equal(first.checkpointReached, true);
  const before = fs.readFileSync(path.join(f.outDir, 'collection.json'));
  const second = await runBishopCollection({ ...f.services, resume: true, untilGames: 640 });
  assert.equal(second.finishedGames, 640); assert.equal(second.checkpointReached, true);
  assert.equal(second.records.length, 640);
  assert.equal(new Set(second.records.map(row => row.id)).size, 640);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), before);
  assert.ok(second.records.every(row => Number(row.openingId.match(/\d+$/)[0]) <= 64));
  assert.equal(f.calls.starts, f.calls.closes);
});

test('source changes, native diagnostic changes and corrupt design metadata reject before resume mutations', async t => {
  const f = await fixture(t); await stoppedRun(f);
  const file = path.join(f.outDir, 'games.jsonl'), before = fs.readFileSync(file);
  await assert.rejects(runBishopCollection({ ...f.services, resume: true, untilGames: 320,
    getIdentity: () => ({ ...f.identity, engineSha256: 'changed' }) }), /Cannot resume/);
  await assert.rejects(runBishopCollection({ ...f.services, resume: true, untilGames: 320,
    preflight: async () => ({ ...f.native, pieceValues: 'changed' }) }), /native diagnostic/);
  assert.deepEqual(fs.readFileSync(file), before);
  const corrupt = records(f.outDir); corrupt[0].designA = 'queen.purple@1';
  fs.writeFileSync(file, corrupt.map(row => JSON.stringify(row)).join('\n') + '\n');
  const changed = fs.readFileSync(file);
  await assert.rejects(runBishopCollection({ ...f.services, resume: true, untilGames: 320 }), /journal/);
  assert.deepEqual(fs.readFileSync(file), changed);
});

test('torn tails recover and uncertain journal writes stop other appends', async t => {
  const f = await fixture(t); await stoppedRun(f);
  fs.appendFileSync(path.join(f.outDir, 'games.jsonl'), '{"id":');
  let stop = null;
  await runBishopCollection({ ...f.services, resume: true, untilGames: 320, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished ')) stop = 'pair'; } });
  assert.equal(fs.readdirSync(f.outDir).filter(name => name.startsWith('games.jsonl.recovery-')).length, 1);
  const g = await fixture(t); let writes = 0;
  const storeFactory = options => {
    const store = openStore(options);
    return { ...store, get checkpoint() { return store.checkpoint; }, append(record) {
      writes++; store.append(record); throw new Error('injected fsync failure');
    } };
  };
  await assert.rejects(runBishopCollection({ ...g.services, untilGames: 320, storeFactory }), /injected fsync failure/);
  assert.equal(writes, 1);
  assert.equal(fs.existsSync(path.join(g.outDir, 'run.lock')), false);
});

test('illegal engine output and ply limits stay unscored rather than becoming losses', async t => {
  const f = await fixture(t, { badMove: true });
  await assert.rejects(runBishopCollection({ ...f.services, untilGames: 320 }), /Illegal or missing/);
  assert.ok(records(f.outDir).every(row => row.result === '*' && ['error', 'aborted'].includes(row.status)));
  const g = await fixture(t, { terminalAt: null });
  let stop = null;
  const result = await runBishopCollection({ ...g.services, untilGames: 320, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished ')) stop = 'game'; } });
  assert.ok(result.records.length > 0); assert.ok(result.records.every(row => row.status === 'truncated' && row.result === '*'));
});

test('preflight compares every starting position and standard-promotion probes without searches', async t => {
  const f = await fixture(t), values = valuesFor(f.plan.profile);
  let checked = 0, searches = 0, closed = 0;
  const result = await checkBishopCollection({ plan: f.plan, enginePath: process.execPath, rulesFactory: f.rulesFactory,
    compatibilityCheck: async () => ({ passed: true }),
    capabilityCheck: async () => ({ probes: 26 }), engineFactory: () => ({
      async start() { return { idname: 'fixture' }; }, async pieceValues() { return values; },
      async perft() { checked++; return [MOVES[0]]; }, async search() { searches++; }, async close() { closed++; } }) });
  assert.equal(checked, 1282); assert.equal(result.startingPositions, 1280);
  assert.equal(result.capabilityProbes, 28); assert.equal(result.roleProbes, 2);
  assert.equal(result.searchesStarted, 0); assert.equal(searches, 0); assert.equal(closed, 1);
});

test('native value checks require every type and queen-equivalent policy in all tables', async t => {
  const f = await fixture(t), good = valuesFor(f.plan.profile);
  validateValues(good, f.plan.profile);
  const custom = f.plan.registry.allocations.find(item => item.id === 'rook.purple@10').letter;
  const queenRook = f.plan.registry.allocations.find(item => item.id === 'rook.purple@9').letter;
  for (const mutate of [values => delete values.pieces[custom],
    values => { values.pieces[custom].evalMg++; }, values => { values.pieces[custom].rawMg = NaN; },
    values => { values.pieces.p.rawMg++; values.pieces.P.rawMg++; },
    values => { for (const piece of [queenRook, queenRook.toUpperCase()]) values.pieces[piece].rawEg = 2590; },
    values => { for (const piece of [queenRook, queenRook.toUpperCase()]) values.pieces[piece].captureMg = 2590; }]) {
    const values = copy(good); mutate(values); assert.throws(() => validateValues(values, f.plan.profile));
  }
  const profile = copy(f.plan.profile);
  profile.evaluation.pieceValues['rook.purple@10'] = { mg: 2538, eg: 2682 };
  assert.throws(() => validateValues(good, profile), /only the queen-equivalent override/);
});

test('saved evaluation policy changes are rejected before any resumed writes', async t => {
  const f = await fixture(t); await stoppedRun(f);
  const file = path.join(f.outDir, 'games.jsonl'), rows = records(f.outDir);
  rows[0].evaluation.pieceValues['rook.purple@9'].mg = 2590;
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const changed = fs.readFileSync(file);
  await assert.rejects(runBishopCollection({ ...f.services, untilGames: 320, resume: true }), /journal/);
  assert.deepEqual(fs.readFileSync(file), changed);
});


test('linked parent files are copied unchanged, never counted as new games and reject resume tampering', async t => {
  const f = await fixture(t);
  const result = await runBishopCollection({ ...f.services, untilGames: 320, shouldStop: () => 'pair' });
  assert.equal(result.finishedGames, 0); assert.equal(result.scheduledGames, 1280);
  assert.equal(result.records.length, 0);
  const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const manifest = path.join(f.outDir, 'parent', 'collection.json');
  const journal = path.join(f.outDir, 'parent', 'games.jsonl');
  assert.equal(hash(manifest), f.plan.parent.manifestSha256);
  assert.equal(hash(journal), f.plan.parent.journalSha256);
  fs.appendFileSync(journal, 'changed');
  const before = fs.readFileSync(path.join(f.outDir, 'collection.json'));
  await assert.rejects(runBishopCollection({ ...f.services, untilGames: 320, resume: true }), /parent snapshot changed/);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), before);
});

test('derived simple replay snapshots are distinct from historical manifests and reject tampering', async t => {
  const f = await fixture(t);
  const result = await stoppedRun(f);
  assert.ok(result.finishedGames > 0);
  const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const sourceDir = path.join(f.outDir, 'simple-source');
  const replaySource = path.join(sourceDir, 'replay-source.json');
  const sourceJournal = path.join(sourceDir, 'games.jsonl');
  assert.equal(fs.existsSync(path.join(sourceDir, 'collection.json')), false,
    'the derived source must never masquerade as the missing historical manifest');
  assert.equal(hash(replaySource), f.plan.simpleSource.manifestSha256);
  assert.equal(hash(sourceJournal), f.plan.simpleSource.journalSha256);
  const runManifest = fs.readFileSync(path.join(f.outDir, 'collection.json'));
  const newJournal = fs.readFileSync(path.join(f.outDir, 'games.jsonl'));
  fs.appendFileSync(replaySource, 'changed');
  await assert.rejects(runBishopCollection({ ...f.services, untilGames: 320, resume: true }), /simple replay snapshot changed/);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), runManifest);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'games.jsonl')), newJournal);
});

test('missing simple source snapshots cannot be silently rebuilt after games exist', async t => {
  const f = await fixture(t); await stoppedRun(f);
  fs.unlinkSync(path.join(f.outDir, 'simple-source', 'games.jsonl'));
  await assert.rejects(runBishopCollection({ ...f.services, untilGames: 320, resume: true }), /Missing frozen simple replay snapshot/);
});

test('failed parent compatibility refuses a new run before durable state is created', async t => {
  const f = await fixture(t);
  await assert.rejects(runBishopCollection({ ...f.services, untilGames: 320,
    preflight: async () => ({ ...f.native, parentCompatibility: { passed: false } }) }), /compatibility/);
  assert.equal(fs.existsSync(f.outDir), false);
});
