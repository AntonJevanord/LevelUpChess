'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runHeadCollection, readHeadManifest, invocationPrefix } = require('../scripts/balance/head-collection');
const { openStore } = require('../scripts/balance/storage');

const ROOT = path.resolve(__dirname, '..');
const MOVES = ['a2a3', 'a7a6', 'a3a4'];
const copy = value => structuredClone(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function validatePlan(plan, { maxPlies = 400 } = {}) {
  assert.equal(plan.id, 'fixture-head');
  assert.deepEqual(plan.settings, { nodes: 20000, threads: 1, hashMb: 32, maxPlies, skill: 20 });
  assert.equal(plan.profile.registry.hash, plan.registry.hash);
}

function fixture(t, options = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-head-core-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const registry = { hash: 'registry', definitions: Array.from({ length: 10 }, (_, index) => ({ id: `type-${index}` })), allocations: [] };
  const plan = { id: 'fixture-head', schemaVersion: 1,
    settings: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: options.maxPlies ?? 400, skill: 20 },
    profile: { hash: 'profile', variant: 'fixture-head', config: '[fixture-head:chess]\n', registry }, registry,
    roster: [{ id: 'a', label: 'Army A' }, { id: 'b', label: 'Army B' }],
    study: { checkpoints: [4, 8] }, schedule: [], units: [] };
  if (options.evaluation) plan.profile.evaluation = copy(options.evaluation);
  for (let pair = 1; pair <= 4; pair++) {
    const unitId = `pair-${pair}`, gameIds = [];
    for (const aColor of ['w', 'b']) {
      const id = `${unitId}-${aColor}`;
      gameIds.push(id);
      plan.schedule.push({ id, unitId, pairId: unitId, kind: 'head', comparisonId: `comparison-${pair}`,
        openingId: 'shared-opening', aColor, designA: 'a', designB: 'b',
        whiteDesign: aColor === 'w' ? 'a' : 'b', blackDesign: aColor === 'w' ? 'b' : 'a', startFen: `start-${pair}-${aColor}` });
    }
    plan.units.push({ id: unitId, gameIds });
  }
  const outDir = path.join(temporary, 'run');
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
  const native = { engineName: 'fixture', searchesStarted: 0, diagnostics: { passed: true } };
  return { temporary, plan, outDir, calls, identity, rulesFactory, native,
    services: { plan, outDir, enginePath: process.execPath, rulesFactory, engineFactory,
      validatePlan: candidate => validatePlan(candidate, { maxPlies: options.maxPlies ?? 400 }),
      getIdentity: () => copy(identity),
      preflight: async () => { calls.preflights++; return copy(native); } } };
}

const records = directory => fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const stoppedRun = async f => {
  let stop = null;
  return runHeadCollection({ ...f.services, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished ')) stop = 'game'; } });
};

function evidence(f, name = 'source.bin', relative = false) {
  const file = path.join(f.temporary, name);
  const bytes = Buffer.from([0, 13, 10, 255, 101, 118, 105, 100, 101, 110, 99, 101]);
  fs.writeFileSync(file, bytes);
  const item = { name, file: relative ? path.relative(ROOT, file) : file, sha256: hash(bytes) };
  (f.plan.evidence ||= []).push(item);
  return { item, file, bytes, snapshot: path.join(f.outDir, 'evidence', name) };
}

test('policy callbacks are explicit and a rejected preflight creates no run', async t => {
  const f = fixture(t);
  for (const field of ['validatePlan', 'getIdentity', 'preflight']) {
    await assert.rejects(runHeadCollection({ ...f.services, [field]: undefined }), /explicit|Explicit/);
    assert.equal(fs.existsSync(f.outDir), false);
  }
  await assert.rejects(runHeadCollection({ ...f.services, validatePlan() { throw new Error('invalid fixture'); } }), /invalid fixture/);
  await assert.rejects(runHeadCollection({ ...f.services, preflight: async () => { throw new Error('native rejected'); } }), /native rejected/);
  await assert.rejects(runHeadCollection({ ...f.services, preflight: async () => undefined }), /diagnostic object/);
  assert.equal(fs.existsSync(f.outDir), false);
  assert.equal(f.calls.starts, 0);
});

test('prefixes require declared whole units, allow partial opening blocks and enforce four workers', async t => {
  const f = fixture(t);
  for (const untilGames of [0, 1, 3, 7, 9, 4.5]) {
    await assert.rejects(runHeadCollection({ ...f.services, untilGames }), /declared game checkpoints|bounded scheduled prefix/);
    assert.equal(fs.existsSync(f.outDir), false);
  }
  for (const jobs of [1, 3, 8, '4']) await assert.rejects(runHeadCollection({ ...f.services, jobs }), /four workers/);
  assert.equal(invocationPrefix(f.plan, 4).units.length, 2);
  const split = copy(f.plan); split.study.checkpoints.push(3);
  assert.throws(() => invocationPrefix(split, 3), /split a collection unit/);
  const empty = copy(f.plan); empty.schedule = []; empty.units = [];
  await assert.rejects(runHeadCollection({ ...f.services, plan: empty }), /nonempty/);
  assert.equal(f.calls.preflights, 0);
});

test('an already requested stop saves the frozen manifest without starting a game', async t => {
  const f = fixture(t);
  const result = await runHeadCollection({ ...f.services, shouldStop: () => 'pair' });
  assert.equal(result.manifest.jobs, 4);
  assert.equal(result.manifest.format, 'levelup-head-collection');
  assert.equal(result.finishedGames, 0);
  assert.equal(result.checkpointReached, false);
  assert.equal(f.calls.starts, 0);
  assert.equal(f.calls.preflights, 1);
  assert.equal(fs.existsSync(path.join(f.outDir, 'run.lock')), false);
  assert.deepEqual(readHeadManifest(f.outDir, validatePlan), result.manifest);
  assert.throws(() => readHeadManifest(f.outDir), /validatePlan callback/);
  assert.equal(fs.existsSync(path.join(f.outDir, 'games.pgn')), false);
  assert.equal(fs.existsSync(path.join(f.outDir, 'positions.epd')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.outDir, 'summary.json'))), {
    schemaVersion: 1, runId: result.manifest.runId, scheduledGames: 8, finishedGames: 0,
    statusCounts: { completed: 0, truncated: 0, aborted: 0, error: 0 } });
});

test('game stops finish active games on four workers with exact metadata and fresh engines', async t => {
  const f = fixture(t), messages = [];
  let stop = null;
  const result = await runHeadCollection({ ...f.services, shouldStop: () => stop,
    onProgress(message) { messages.push(message); if (message.startsWith('Finished ')) stop = 'game'; } });
  assert.equal(result.finishedGames, 4);
  assert.equal(f.calls.starts, result.finishedGames * 2);
  assert.equal(f.calls.starts, f.calls.closes);
  assert.equal(f.calls.starts, f.calls.newGames);
  assert.ok(messages.some(message => message.includes('(White) vs') && message.includes('(Black)')));
  assert.ok(messages.some(message => message.includes('(White) wins.')));
  assert.ok(messages.some(message => message.includes('scored games; partial pairs included')));
  assert.ok(messages.some(message => message.includes('W/D/L')));
  for (const row of result.records) {
    const game = f.plan.schedule.find(game => game.id === row.id);
    for (const key of ['unitId', 'pairId', 'kind', 'aColor', 'openingId', 'comparisonId', 'startFen', 'designA', 'designB', 'whiteDesign', 'blackDesign']) assert.equal(row[key], game[key]);
    assert.equal(row.status, 'completed'); assert.equal(row.attempt, 1);
    assert.equal(Object.hasOwn(row, 'evaluation'), false);
    assert.equal(row.profileHash, f.plan.profile.hash);
    assert.equal(row.registryHash, f.plan.registry.hash);
    assert.equal(row.registryReference, 'collection.json#plan.registry');
  }
  assert.ok(f.calls.parameters.every(parameters => parameters.options.skill === 20 && parameters.options.threads === 1 && parameters.options.hash === 32));
});

test('pair stops finish both colors in each claimed unit', async t => {
  const f = fixture(t); let stop = null;
  const result = await runHeadCollection({ ...f.services, shouldStop: () => stop,
    onProgress(message) { if (message.startsWith('Finished ')) stop = 'pair'; } });
  assert.equal(result.finishedGames, 8);
  for (const unit of f.plan.units) assert.equal(result.records.filter(row => row.unitId === unit.id).length, 2);
});

test('points and WDL follow army A across both colors and score draws as half', async t => {
  for (const outcome of ['0-1', '1/2-1/2']) {
    const f = fixture(t, { result: outcome }), messages = [];
    await runHeadCollection({ ...f.services, onProgress: message => messages.push(message) });
    const pair = messages.filter(message => message.startsWith('Finished pair-1-'));
    assert.equal(pair.length, 2);
    assert.ok(pair.at(-1).includes('Army A 1–1 Army B (2 scored games; partial pairs included)'));
    assert.ok(pair.at(-1).includes(outcome === '0-1' ? 'W/D/L 1/0/1' : 'W/D/L 0/2/0'));
    assert.ok(pair.every(message => message.includes(outcome === '0-1' ? '(Black) wins.' : '; draw.')));
  }
});

test('immediate cancellation preserves saved prefixes and resumes them under the same manifest', async t => {
  const controller = new AbortController();
  const f = fixture(t, { onSearch(request) { if (request.moves.length === 1) controller.abort(); } });
  const first = await runHeadCollection({ ...f.services, signal: controller.signal });
  const interrupted = first.records.filter(row => row.status === 'aborted');
  assert.equal(interrupted.length, 4);
  assert.ok(interrupted.some(row => row.moves.length === 1));
  const before = fs.readFileSync(path.join(f.outDir, 'collection.json'));
  const result = await runHeadCollection({ ...f.services, resume: true });
  for (const row of interrupted) {
    const completed = result.records.find(record => record.id === row.id && record.status === 'completed');
    assert.ok(completed);
    assert.equal(completed.attempt, row.attempt + 1);
    assert.deepEqual(completed.moves.slice(0, row.moves.length), row.moves);
  }
  assert.equal(result.finishedGames, 8);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), before);
  assert.equal(fs.existsSync(path.join(f.outDir, 'run.lock')), false);
});

test('completed checkpoint prefixes extend without repeated games and complete resumes skip native checks', async t => {
  const f = fixture(t);
  const first = await runHeadCollection({ ...f.services, untilGames: 4 });
  assert.equal(first.finishedGames, 4); assert.equal(first.checkpointReached, true);
  const before = fs.readFileSync(path.join(f.outDir, 'collection.json'));
  const second = await runHeadCollection({ ...f.services, resume: true, untilGames: 8 });
  assert.equal(second.finishedGames, 8); assert.equal(second.checkpointReached, true);
  assert.equal(second.records.length, 8);
  assert.equal(new Set(second.records.map(row => row.id)).size, 8);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'collection.json')), before);
  const searches = f.calls.searches.length;
  await runHeadCollection({ ...f.services, resume: true, preflight: async () => { throw new Error('must be skipped'); } });
  assert.equal(f.calls.searches.length, searches);
  assert.equal(f.calls.preflights, 2);
});

test('identity, native diagnostics and corrupt journal metadata reject before resume writes', async t => {
  const f = fixture(t); await stoppedRun(f);
  const file = path.join(f.outDir, 'games.jsonl'), before = fs.readFileSync(file);
  await assert.rejects(runHeadCollection({ ...f.services, resume: true,
    getIdentity: () => ({ ...f.identity, engineSha256: 'changed' }) }), /Cannot resume/);
  await assert.rejects(runHeadCollection({ ...f.services, resume: true,
    preflight: async () => ({ ...f.native, diagnostics: 'changed' }) }), /native diagnostic/);
  assert.deepEqual(fs.readFileSync(file), before);
  const corrupt = records(f.outDir); corrupt[0].designA = 'changed';
  fs.writeFileSync(file, corrupt.map(row => JSON.stringify(row)).join('\n') + '\n');
  const changed = fs.readFileSync(file);
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /journal/);
  assert.deepEqual(fs.readFileSync(file), changed);
});

test('torn tails recover and an uncertain journal write prevents every subsequent append', async t => {
  const f = fixture(t); await stoppedRun(f);
  fs.appendFileSync(path.join(f.outDir, 'games.jsonl'), '{"id":');
  await runHeadCollection({ ...f.services, resume: true });
  assert.equal(fs.readdirSync(f.outDir).filter(name => name.startsWith('games.jsonl.recovery-')).length, 1);
  assert.equal(records(f.outDir).length, 8);
  const g = fixture(t); let writes = 0;
  const storeFactory = options => {
    const store = openStore(options);
    return { ...store, get checkpoint() { return store.checkpoint; }, append(record) {
      writes++; store.append(record); throw new Error('injected fsync failure');
    } };
  };
  await assert.rejects(runHeadCollection({ ...g.services, storeFactory }), /injected fsync failure/);
  assert.equal(writes, 1);
  assert.equal(fs.existsSync(path.join(g.outDir, 'run.lock')), false);
  assert.equal(records(g.outDir).length, 1);
});

test('illegal moves and ply limits remain unscored', async t => {
  const f = fixture(t, { badMove: true });
  await assert.rejects(runHeadCollection({ ...f.services }), /Illegal or missing/);
  assert.ok(records(f.outDir).every(row => row.result === '*' && ['error', 'aborted'].includes(row.status)));
  const g = fixture(t, { terminalAt: null, maxPlies: 8 });
  const result = await stoppedRun(g);
  assert.equal(result.records.length, 4);
  assert.ok(result.records.every(row => row.status === 'truncated' && row.result === '*' && row.reason === 'max-plies' && row.moves.length === 8));
});

test('saved truncations require the exact nonterminal ply cap and declared stop reason', async t => {
  for (const variant of ['short', 'terminal', 'reason']) {
    const f = fixture(t, { terminalAt: variant === 'terminal' ? 8 : null, maxPlies: 8 });
    await stoppedRun(f);
    const file = path.join(f.outDir, 'games.jsonl'), rows = records(f.outDir), row = rows[0];
    row.status = 'truncated'; row.result = '*'; row.reason = variant === 'reason' ? 'unknown-stop' : 'max-plies';
    if (variant === 'short') {
      row.moves.pop(); row.sans.pop(); row.totalPlies = row.playedPlies = row.moves.length;
      row.finalFen = `${row.startFen}|${row.moves.join(',')}`;
    }
    fs.writeFileSync(file, rows.map(record => JSON.stringify(record)).join('\n') + '\n');
    const changed = fs.readFileSync(file), preflights = f.calls.preflights, searches = f.calls.searches.length;
    await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /Saved outcome does not match replayed history/);
    assert.equal(f.calls.preflights, preflights, variant);
    assert.equal(f.calls.searches.length, searches, variant);
    assert.deepEqual(fs.readFileSync(file), changed, variant);
  }
});

test('every saved status rejects replayable histories beyond the declared ply cap', async t => {
  for (const status of ['completed', 'truncated', 'aborted', 'error']) {
    const f = fixture(t, { terminalAt: status === 'completed' ? 9 : null, maxPlies: 8 });
    await stoppedRun(f);
    const file = path.join(f.outDir, 'games.jsonl'), rows = records(f.outDir), row = rows[0];
    row.moves.push(MOVES[row.moves.length % MOVES.length]); row.sans.push(`m${row.moves.length}`);
    row.totalPlies = row.playedPlies = row.moves.length; row.finalFen = `${row.startFen}|${row.moves.join(',')}`;
    row.status = status; row.result = status === 'completed' ? '1-0' : '*';
    row.reason = status === 'completed' ? 'checkmate' : status === 'truncated' ? 'max-plies' : 'cancelled';
    fs.writeFileSync(file, rows.map(record => JSON.stringify(record)).join('\n') + '\n');
    const changed = fs.readFileSync(file), preflights = f.calls.preflights, searches = f.calls.searches.length;
    await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /Saved journal does not match/);
    assert.equal(f.calls.preflights, preflights, status);
    assert.equal(f.calls.searches.length, searches, status);
    assert.deepEqual(fs.readFileSync(file), changed, status);
  }
});

test('arbitrary evaluation policies persist and changed saved policies cannot resume', async t => {
  const policy = { pieceValues: { 'type-7': { mg: 100, eg: 200 } } };
  const f = fixture(t, { evaluation: policy }); await stoppedRun(f);
  const file = path.join(f.outDir, 'games.jsonl'), rows = records(f.outDir);
  assert.deepEqual(rows[0].evaluation, policy);
  rows[0].evaluation.pieceValues['type-7'].mg++;
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const changed = fs.readFileSync(file);
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /journal/);
  assert.deepEqual(fs.readFileSync(file), changed);
});

test('absolute and repository-relative evidence is copied byte-for-byte and frozen on access', async t => {
  const f = fixture(t), a = evidence(f), b = evidence(f, 'relative.bin', true);
  const result = await stoppedRun(f);
  assert.equal(result.scheduledGames, 8);
  for (const source of [a, b]) assert.deepEqual(fs.readFileSync(source.snapshot), source.bytes);
  assert.deepEqual(readHeadManifest(f.outDir, validatePlan), result.manifest);
  fs.appendFileSync(a.snapshot, 'changed');
  const journal = fs.readFileSync(path.join(f.outDir, 'games.jsonl'));
  assert.throws(() => readHeadManifest(f.outDir, validatePlan), /evidence snapshot changed/);
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /evidence snapshot changed/);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'games.jsonl')), journal);
});

test('source hashes and safe, distinct evidence names are checked before creating a run', async t => {
  const f = fixture(t), source = evidence(f);
  fs.appendFileSync(source.file, 'changed');
  await assert.rejects(runHeadCollection({ ...f.services }), /evidence source hash changed/);
  assert.equal(fs.existsSync(f.outDir), false);
  for (const name of ['../escape', '/absolute', 'folder/file', 'folder\\file', '.', '..', 'NUL', 'trail.']) {
    f.plan.evidence = [{ ...source.item, name }];
    await assert.rejects(runHeadCollection({ ...f.services }), /relative basenames/);
  }
  f.plan.evidence = [source.item, { ...source.item, name: 'SOURCE.BIN' }];
  await assert.rejects(runHeadCollection({ ...f.services }), /relative basenames/);
  assert.equal(fs.existsSync(f.outDir), false);
  assert.equal(f.calls.preflights, 0);
});

test('changed original evidence rejects resume and missing snapshots only recover before games exist', async t => {
  const f = fixture(t), source = evidence(f); await stoppedRun(f);
  fs.appendFileSync(source.file, 'changed');
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /evidence source hash changed/);
  fs.writeFileSync(source.file, source.bytes);
  fs.unlinkSync(source.snapshot);
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /Missing frozen evidence snapshot/);
  const g = fixture(t), recoverable = evidence(g);
  await runHeadCollection({ ...g.services, shouldStop: () => 'pair' });
  fs.unlinkSync(recoverable.snapshot);
  await runHeadCollection({ ...g.services, resume: true, shouldStop: () => 'pair' });
  assert.deepEqual(fs.readFileSync(recoverable.snapshot), recoverable.bytes);
});

test('crash-only checkpoint prefixes survive the first worker write and resume without replay searches', async t => {
  const f = fixture(t);
  await runHeadCollection({ ...f.services, shouldStop: () => 'pair' });
  const current = Object.fromEntries(f.plan.units.map(unit => {
    const game = f.plan.schedule.find(game => game.id === unit.gameIds[0]);
    return [game.id, { id: game.id, attempt: 1, workerId: 1, startFen: game.startFen,
      finalFen: `${game.startFen}|${MOVES[0]}`, moves: [MOVES[0]], sans: ['m1'],
      profileHash: f.plan.profile.hash, registryHash: f.plan.registry.hash }];
  }));
  fs.writeFileSync(path.join(f.outDir, 'checkpoint.json'), JSON.stringify({ schemaVersion: 1, current, finishedGames: 0 }));
  const checkpoints = [];
  const storeFactory = options => {
    const store = openStore(options);
    return { ...store, get checkpoint() { return store.checkpoint; }, saveCheckpoint(state) {
      checkpoints.push(copy(state)); store.saveCheckpoint(state);
    } };
  };
  const result = await runHeadCollection({ ...f.services, resume: true, storeFactory });
  assert.deepEqual(Object.keys(checkpoints[0].current).sort(), Object.keys(current).sort());
  for (const id of Object.keys(current)) {
    const row = result.records.find(row => row.id === id);
    assert.equal(row.attempt, 2);
    assert.equal(row.moves[0], MOVES[0]);
    const firstSearch = f.calls.searches.find(search => search.fen === row.startFen);
    assert.deepEqual(firstSearch.moves, [MOVES[0]]);
  }
});

test('evidence recovery uses journal state re-read under the store lock', async t => {
  const donor = fixture(t), donorResult = await stoppedRun(donor);
  const f = fixture(t), source = evidence(f);
  await runHeadCollection({ ...f.services, shouldStop: () => 'pair' });
  const storeFactory = options => {
    const store = openStore(options);
    // Model records and snapshots changing after the preflight's earlier read.
    store.append(donorResult.records[0]);
    fs.unlinkSync(source.snapshot);
    return store;
  };
  await assert.rejects(runHeadCollection({ ...f.services, resume: true, storeFactory }), /Missing frozen evidence snapshot/);
  assert.equal(fs.existsSync(source.snapshot), false);
  assert.equal(fs.existsSync(path.join(f.outDir, 'run.lock')), false);
  assert.equal(records(f.outDir).length, 1);
});

test('saved SAN, checkpoint conflicts, rules and manifest disagreements reject without journal writes', async t => {
  const controller = new AbortController();
  const f = fixture(t, { onSearch(request) { if (request.moves.length === 1) controller.abort(); } });
  await runHeadCollection({ ...f.services, signal: controller.signal });
  const file = path.join(f.outDir, 'games.jsonl'), original = fs.readFileSync(file);
  const rows = records(f.outDir); rows.find(row => row.moves.length).sans[0] = 'invalid';
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /replay saved collection history/);
  fs.writeFileSync(file, original);
  const checkpointFile = path.join(f.outDir, 'checkpoint.json'), checkpoint = JSON.parse(fs.readFileSync(checkpointFile));
  const checkpointBytes = fs.readFileSync(checkpointFile);
  const state = Object.values(checkpoint.current)[0]; state.profileHash = 'changed';
  fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint));
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /Checkpoint does not match/);
  fs.writeFileSync(checkpointFile, checkpointBytes);
  fs.writeFileSync(path.join(f.outDir, 'rules', `${f.plan.profile.variant}.ini`), 'changed');
  await assert.rejects(runHeadCollection({ ...f.services, resume: true }), /rules snapshot differs/);
  fs.writeFileSync(path.join(f.outDir, 'rules', `${f.plan.profile.variant}.ini`), f.plan.profile.config);
  const manifestFile = path.join(f.outDir, 'collection.json'), manifest = JSON.parse(fs.readFileSync(manifestFile));
  manifest.jobs = 3; fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.throws(() => readHeadManifest(f.outDir, validatePlan), /manifests disagree/);
  assert.deepEqual(fs.readFileSync(file), original);
});
