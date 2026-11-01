'use strict';

// Storage/runner protocol fixtures use actual WASM rules and a deterministic
// fake engine. They are not native-search evidence or scored balance games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { UciEngine } = require('../scripts/balance/uci');
const { runMatches } = require('../scripts/balance/run');

const ROOT = path.resolve(__dirname, '..');
let rules;
test.before(async () => { rules = await require('../dist/balance-rules.cjs').createMatchRules({ whiteKing: 0, blackKing: 0 }); });

function config() {
  return normalizeConfig({ schemaVersion: 1, name: 'Synthetic checkpoint protocol; not balance evidence',
    seed: 42, engine: { nodes: 20, maxPlies: 4 },
    comparisons: [{ id: 'checkpoint-fixture', armyA: {}, armyB: {} }] });
}
function temporary(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-game-checkpoints-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; }
function read(directory, name) { return fs.readFileSync(path.join(directory, name), 'utf8'); }
function json(directory, name) { return JSON.parse(read(directory, name)); }
function records(directory) { return read(directory, 'games.jsonl').split('\n').filter(Boolean).map(JSON.parse); }
function run(directory, options = {}) { const declaration = config(); return runMatches({ config: declaration, schedule: makeSchedule(declaration), outDir: directory, enginePath: process.execPath, ...options }); }

// The child-crash fixtures reuse this exact fake without spawning any native
// subprocesses, so an abrupt child exit cannot leave an engine orphaned.
function installEngine(Engine, rules, mock, failure = () => false) {
  const method = (name, fn) => mock ? mock.method(Engine.prototype, name, fn) : Engine.prototype[name] = fn;
  let searches = 0;
  method('start', async () => ({ idname: 'Synthetic checkpoint protocol engine' }));
  method('newGame', async () => {});
  method('close', async () => {});
  method('perft', async ({ fen }) => {
    const board = rules.createBoard(fen);
    try { return [...board.moves()].sort(); } finally { board.dispose(); }
  });
  method('search', async ({ fen, moves }) => {
    searches++;
    if (failure(searches, moves)) throw new Error('Synthetic search interruption');
    const board = rules.createBoard(fen);
    try {
      for (const move of moves) if (!board.push(move)) throw new Error('Bad synthetic fixture history');
      return { move: [...board.moves()].sort()[0], info: { nodes: 20, depth: 1 } };
    } finally { board.dispose(); }
  });
  return () => searches;
}

test('ordinary plies perform no checkpoint replacement; game boundaries and journals remain durable', async t => {
  installEngine(UciEngine, rules, t.mock);
  const directory = temporary(t), originalRename = fs.renameSync, originalOpen = fs.openSync, originalClose = fs.closeSync, originalSync = fs.fsyncSync;
  const handles = new Map();
  let checkpoints = 0, journalSyncs = 0, plies = 0, finished = 0, boundary = null;
  t.mock.method(fs, 'openSync', (file, ...args) => { const fd = originalOpen(file, ...args); if (typeof file === 'string') handles.set(fd, path.resolve(file)); return fd; });
  t.mock.method(fs, 'closeSync', fd => { const result = originalClose(fd); handles.delete(fd); return result; });
  t.mock.method(fs, 'fsyncSync', fd => { if (handles.get(fd) === path.join(directory, 'games.jsonl')) journalSyncs++; return originalSync(fd); });
  t.mock.method(fs, 'renameSync', (from, to) => { if (to === path.join(directory, 'checkpoint.json')) checkpoints++; return originalRename(from, to); });
  const result = await run(directory, { onProgress(message) {
    if (message.startsWith('Game ') && message.includes(': ply ')) {
      plies++;
      assert.equal(checkpoints, finished, 'a ply must not create a checkpoint');
      if (!finished) assert.equal(fs.existsSync(path.join(directory, 'checkpoint.json')), false);
      else assert.equal(read(directory, 'checkpoint.json'), boundary, 'the prior durable game boundary stays unchanged');
    }
    if (message.startsWith('Finished ')) {
      finished++;
      assert.equal(journalSyncs, finished, 'result must be fsynced before completion is announced');
      assert.equal(records(directory).length, finished);
      assert.deepEqual(json(directory, 'checkpoint.json'), { schemaVersion: 1, nextIndex: finished, current: null });
      boundary = read(directory, 'checkpoint.json');
    }
  } });
  assert.equal(result.nextIndex, 2);
  assert.equal(plies, 8);
  assert.equal(checkpoints, 2);
  assert.equal(journalSyncs, 2);
  assert.ok(records(directory).every(record => record.status === 'truncated' && record.result === '*'));
  const before = read(directory, 'games.jsonl'), manifest = read(directory, 'run.json');
  await run(directory, { resume: true, onProgress(message) { assert.ok(!message.startsWith('Starting game ')); } });
  assert.equal(read(directory, 'games.jsonl'), before);
  assert.equal(read(directory, 'run.json'), manifest);
});

test('a clean immediate stop flushes its current history once and resumes that prefix', async t => {
  installEngine(UciEngine, rules, t.mock);
  const directory = temporary(t), controller = new AbortController();
  await run(directory, { signal: controller.signal, onProgress(message) { if (message.startsWith('Game ') && message.includes(': ply 1,')) controller.abort(); } });
  const aborted = records(directory)[0];
  assert.equal(aborted.status, 'aborted');
  assert.equal(aborted.moves.length, 1);
  assert.deepEqual(json(directory, 'checkpoint.json').current.moves, aborted.moves);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
  await run(directory, { resume: true });
  const retried = records(directory).find(record => record.id === aborted.id && record.attempt === 2);
  assert.ok(retried);
  assert.deepEqual(retried.moves.slice(0, 1), aborted.moves);
  assert.equal(retried.status, 'truncated');
  assert.equal(records(directory).filter(record => record.status === 'truncated').length, 2);
});

test('an engine error retains recoverable history without per-move checkpoints', async t => {
  let fail = true;
  installEngine(UciEngine, rules, t.mock, (searches, moves) => fail && moves.length === 1);
  const directory = temporary(t);
  await assert.rejects(run(directory), /Synthetic search interruption/);
  const error = records(directory)[0];
  assert.equal(error.status, 'error');
  assert.equal(error.moves.length, 1);
  fail = false;
  await run(directory, { resume: true });
  assert.equal(records(directory).filter(record => record.id === error.id && record.status === 'truncated').length, 1);
  assert.deepEqual(records(directory).find(record => record.id === error.id && record.attempt === 2).moves.slice(0, 1), error.moves);
});

function crashChild(directory, crash) {
  const code = `const fs=require('node:fs'),path=require('node:path');
    const root=process.argv[1],out=process.argv[2];
    const {normalizeConfig,makeSchedule}=require(path.join(root,'scripts/balance/plan'));
    const {UciEngine}=require(path.join(root,'scripts/balance/uci'));
    const {runMatches}=require(path.join(root,'scripts/balance/run'));
    const installEngine=${installEngine.toString()};
    (async()=>{
      const rules=await require(path.join(root,'dist/balance-rules.cjs')).createMatchRules({whiteKing:0,blackKing:0});
      installEngine(UciEngine,rules);
      const config=normalizeConfig(${JSON.stringify(config())});
      let completed=0;
      if(${JSON.stringify(crash)}==='after-journal'){
        const rename=fs.renameSync;
        fs.renameSync=(from,to)=>{if(path.basename(to)==='checkpoint.json')process.exit(73);return rename(from,to);};
      }
      await runMatches({config,schedule:makeSchedule(config),outDir:out,enginePath:process.execPath,onProgress(message){
        if(message.startsWith('Finished '))completed++;
        if(${JSON.stringify(crash)}==='mid-second'&&completed===1&&message.startsWith('Game ')&&message.includes(': ply 1,'))process.exit(73);
      }});
      process.exitCode=74;
    })().catch(error=>{console.error(error);process.exitCode=75;});`;
  const child = spawnSync(process.execPath, ['-e', code, ROOT, directory], { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 73, child.stderr || child.stdout);
}

for (const crash of ['mid-second', 'after-journal']) test(`abrupt ${crash} loss restarts only unfinished work and never replays a durable result`, async t => {
  installEngine(UciEngine, rules, t.mock);
  const directory = temporary(t);
  crashChild(directory, crash);
  const before = read(directory, 'games.jsonl'), manifest = read(directory, 'run.json');
  assert.equal(records(directory).length, 1);
  assert.equal(records(directory)[0].status, 'truncated');
  if (crash === 'mid-second') assert.deepEqual(json(directory, 'checkpoint.json'), { schemaVersion: 1, nextIndex: 1, current: null });
  else assert.equal(fs.existsSync(path.join(directory, 'checkpoint.json')), false, 'journal durability must precede the boundary checkpoint');
  const done = await run(directory, { resume: true });
  assert.equal(done.nextIndex, 2);
  assert.ok(read(directory, 'games.jsonl').startsWith(before));
  const final = records(directory);
  assert.equal(final.length, 2);
  assert.equal(new Set(final.map(record => record.id)).size, 2);
  assert.equal(read(directory, 'run.json'), manifest);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
});

test('legacy per-move checkpoint history remains usable when its attempt had no journal result', async t => {
  installEngine(UciEngine, rules, t.mock);
  const directory = temporary(t), controller = new AbortController();
  await run(directory, { signal: controller.signal, onProgress(message) { if (message.startsWith('Game ') && message.includes(': ply 1,')) controller.abort(); } });
  const old = json(directory, 'checkpoint.json').current;
  assert.equal(old.moves.length, 1);
  // Model a legacy hard crash: its per-move checkpoint was durable while an
  // aborted/error journal result had never been written.
  fs.writeFileSync(path.join(directory, 'games.jsonl'), '');
  const result = await run(directory, { resume: true });
  assert.equal(result.nextIndex, 2);
  const recovered = records(directory).find(record => record.id === old.id);
  assert.equal(recovered.attempt, 2);
  assert.deepEqual(recovered.moves.slice(0, 1), old.moves);
  assert.ok(records(directory).every(record => record.result === '*'));
});

test('storage benchmark measures real writes while retaining identical synthetic result bytes', t => {
  const { benchmark } = require('../scripts/benchmark-game-checkpoints');
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, 'unrelated.txt'), 'keep this file');
  const result = benchmark({ directory, games: 2, plies: 5, rounds: 2 });
  assert.equal(result.synthetic, true);
  assert.equal(result.summaries[0].checkpointReplacements, 14);
  assert.equal(result.summaries[1].checkpointReplacements, 2);
  assert.ok(result.summaries[0].fileSyncs > result.summaries[1].fileSyncs);
  assert.ok(result.summaries[0].bytesWritten > result.summaries[1].bytesWritten);
  assert.ok(result.measurements.every(row => Number.isFinite(row.elapsedMs) && row.elapsedMs > 0));
  assert.equal(new Set(result.measurements.map(row => row.resultSha256)).size, 1);
  assert.deepEqual(fs.readdirSync(directory), ['unrelated.txt']);
  assert.equal(read(directory, 'unrelated.txt'), 'keep this file');
});

test('benchmark bounds, failure cleanup and existing parent contents are protected', t => {
  const { parseArgs, benchmark } = require('../scripts/benchmark-game-checkpoints');
  for (const args of [['--games', '0'], ['--plies', '401'], ['--rounds', '11'], ['--directory'], ['--unknown'], ['--json', '--json']]) assert.throws(() => parseArgs(args));
  const directory = temporary(t);
  fs.writeFileSync(path.join(directory, 'unrelated.txt'), 'preserve');
  const sync = t.mock.method(fs, 'fsyncSync', () => { throw Object.assign(new Error('Synthetic disk failure'), { code: 'EIO' }); });
  assert.throws(() => benchmark({ directory, games: 1, plies: 1, rounds: 1 }), /Synthetic disk failure/);
  assert.equal(fs.fsyncSync, sync, 'instrumentation restores the caller\'s method even on failure');
  assert.deepEqual(fs.readdirSync(directory), ['unrelated.txt']);
  assert.equal(read(directory, 'unrelated.txt'), 'preserve');
});
