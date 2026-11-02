'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const eta = require('../scripts/level3-panel-eta');

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value) + '\n'); };
const journal = (file, records, tail = '') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, records.map(record => JSON.stringify(record) + '\n').join('') + tail); };

function fixture(t, { jobs = 4, target = 8 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-panel-eta-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stages = [], saved = new Map();
  for (let batchIndex = 0; batchIndex < 8; batchIndex++) for (const nodes of [20000, 40000, 80000]) {
    const id = `batch-${String(batchIndex + 1).padStart(2, '0')}-n${nodes}`;
    const config = { name: id, nodes };
    const schedule = Array.from({ length: 880 }, (_, index) => ({ id: `${id}-g${index}` }));
    const shards = Array.from({ length: jobs }, (_, index) => ({ worker: index + 1, directory: `workers/worker-${String(index + 1).padStart(2, '0')}`,
      scheduleIds: schedule.filter((_, game) => Math.floor(game / 2) % jobs === index).map(game => game.id) }));
    stages.push({ id, directory: id, batchIndex, nodes, games: 880, configSha256: sha(config), scheduleSha256: sha(schedule) });
    saved.set(id, { config, schedule, parallel: { jobs, shards } });
  }
  const plan = { schemaVersion: 1, format: 'levelup-v17-level3-progressive-panel', jobs, stages };
  const manifest = { ...plan, runId: 'eta-fixture', createdAt: '2026-11-02T12:00:00Z', initialOpenings: 8, runtimeIdentity: {}, planSha256: sha(plan) };
  writeJson(path.join(root, 'panel.json'), manifest);
  writeJson(path.join(root, 'panel-state.json'), { runId: manifest.runId, targetOpenings: target });
  return { root, manifest, saved, stage(index = 0) {
    const descriptor = stages[index], run = saved.get(descriptor.id), directory = path.join(root, descriptor.directory);
    writeJson(path.join(directory, 'run.json'), run);
    return { descriptor, run, directory };
  } };
}

function record(id, { attempt = 1, status = 'completed', seconds = 10, ...extra } = {}) {
  return { id, attempt, status, startedAt: '2026-11-02T12:00:00.000Z', finishedAt: new Date(Date.UTC(2026, 10, 2, 12, 0, seconds)).toISOString(), ...extra };
}

function snapshot(root) {
  const result = {};
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else result[path.relative(root, file)] = { bytes: fs.readFileSync(file).toString('base64'), modified: fs.statSync(file).mtimeMs };
    }
  };
  visit(root); return result;
}

function stage(nodes, { games = 8, finalized = 0, durations = [], queues = null } = {}) {
  return { id: `fixture-${nodes}`, nodes, games, finalIds: new Set(Array.from({ length: finalized }, (_, i) => `g${i}`)), durations,
    remainingByWorker: queues, retries: 0, invalidTimings: 0 };
}

test('ETA CLI accepts only an existing run selector and optional JSON output', () => {
  assert.deepEqual(eta.parseArgs(['--run', 'some path', '--json']), { run: 'some path', json: true });
  assert.deepEqual(eta.parseArgs(['--json', '--run', 'x']), { json: true, run: 'x' });
  assert.deepEqual(eta.parseArgs(['--help']), { help: true });
  for (const args of [[], ['--json'], ['--run'], ['--run', 'x', '--run', 'y'], ['--run', 'x', '--json', '--json'], ['--out', 'x'], ['--run', '--json'], ['--run', 'x', '--help']]) assert.throws(() => eta.parseArgs(args));
});

test('journal snapshots ignore an unfinished tail without repairing it, but reject malformed complete lines', async t => {
  const { root } = fixture(t), file = path.join(root, 'journal.jsonl');
  journal(file, [{ id: 'one' }], '{"id":"unfinished"}');
  const before = fs.readFileSync(file), rows = [];
  await eta.readJournal(file, row => rows.push(row));
  assert.deepEqual(rows, [{ id: 'one' }]); assert.deepEqual(fs.readFileSync(file), before);
  journal(file, [], '{bad}\n');
  await assert.rejects(eta.readJournal(file, () => {}), SyntaxError);
  await eta.readJournal(path.join(root, 'missing.jsonl'), () => assert.fail('missing journal has no rows'));
});

test('live status merges worker-ahead copies once, excludes resumed timing, and leaves every file unchanged', async t => {
  const f = fixture(t), { run, directory } = f.stage();
  const ids = run.schedule.map(game => game.id);
  const completed = record(ids[0]);
  journal(path.join(directory, 'games.jsonl'), [completed, record(ids[2], { status: 'error' })]);
  journal(path.join(directory, run.parallel.shards[0].directory, 'games.jsonl'), [completed, record(ids[8], { status: 'aborted' })], '{"id":');
  journal(path.join(directory, run.parallel.shards[1].directory, 'games.jsonl'), [record(ids[2], { attempt: 2, seconds: 1 })]);
  journal(path.join(directory, run.parallel.shards[2].directory, 'games.jsonl'), [record(ids[4], { status: 'truncated', seconds: 20 })]);
  journal(path.join(directory, run.parallel.shards[3].directory, 'games.jsonl'), [record(ids[6], { finishedAt: 'not-a-timestamp' })]);
  writeJson(path.join(f.root, '.panel.lock'), { pid: process.pid, token: 'fixture-lock' });
  const before = snapshot(f.root), status = await eta.readStatus(f.root);
  assert.match(status.state, /^running/);
  assert.equal(status.scheduledGames, 2640); assert.equal(status.finalizedGames, 4); assert.equal(status.remainingGames, 2636);
  assert.equal(status.timings[0].sampleGames, 2); assert.equal(status.timings[0].meanGameSeconds, 15);
  assert.equal(status.timings[0].excludedRetryGames, 1); assert.equal(status.timings[0].invalidTimings, 1);
  assert.deepEqual(status.budgetsWithoutTimings, [40000, 80000]); assert.equal(status.estimatedRemainingSeconds, null);
  assert.deepEqual(snapshot(f.root), before);
  const text = eta.render(status);
  assert.match(text, /Rough remaining game time: unavailable/); assert.match(text, /40k, 80k/);
});

test('remaining runtime uses the longest fixed worker queue and sums sequential stages', () => {
  const result = eta.estimate([
    stage(20000, { finalized: 2, durations: [10, 30], queues: [1, 5] }),
    stage(20000),
    stage(40000, { finalized: 1, durations: [40], queues: [3, 4] }),
    stage(80000, { finalized: 2, durations: [80, 80], queues: [3, 3] }),
  ], 2);
  assert.equal(result.stages[0].estimatedRemainingSeconds, 100);
  assert.equal(result.stages[1].estimatedRemainingSeconds, 80);
  assert.equal(result.stages[2].estimatedRemainingSeconds, 160);
  assert.equal(result.stages[3].estimatedRemainingSeconds, 240);
  assert.equal(result.estimatedRemainingSeconds, 580);
  assert.equal(result.finalizedGames, 5); assert.equal(result.remainingGames, 27);
});

test('unsampled budgets stay unavailable while completed untimed stages need no estimate', () => {
  const result = eta.estimate([stage(20000, { finalized: 1, durations: [20], queues: [3, 4] }), stage(40000), stage(80000, { finalized: 8 })], 2);
  assert.deepEqual(result.budgetsWithoutTimings, [40000]); assert.equal(result.estimatedRemainingSeconds, null);
  assert.equal(result.estimatedKnownBudgetSeconds, 80); assert.equal(result.stages[2].estimatedRemainingSeconds, 0);
  assert.equal(result.timings[1].meanGameSeconds, null);
});

test('target selection includes all requested future stages but no later batches', async t => {
  for (const [target, count] of [[8, 3], [16, 6], [32, 12], [64, 24]]) {
    const f = fixture(t, { target }), status = await eta.readStatus(f.root);
    assert.equal(status.stages.length, count); assert.equal(status.scheduledGames, count * 880);
    assert.equal(status.finalizedGames, 0); assert.equal(status.estimatedRemainingSeconds, null);
  }
});

test('manifest and target mismatches refuse a misleading estimate', async t => {
  const f = fixture(t);
  writeJson(path.join(f.root, 'panel-state.json'), { runId: 'foreign', targetOpenings: 8 });
  await assert.rejects(eta.readStatus(f.root), /Invalid saved panel target/);
  fs.unlinkSync(path.join(f.root, 'panel-state.json'));
  assert.equal(eta.readPanel(f.root).target, 8);
  const changed = structuredClone(f.manifest); changed.jobs = 8;
  writeJson(path.join(f.root, 'panel.json'), changed);
  await assert.rejects(eta.readStatus(f.root), /valid saved/);
});

test('changed stage identity and unknown worker games cannot silently change progress', async t => {
  const f = fixture(t), { descriptor, run, directory } = f.stage();
  const changed = structuredClone(run); changed.config.nodes = 123;
  writeJson(path.join(directory, 'run.json'), changed);
  await assert.rejects(eta.readStage(f.root, descriptor, 4), /does not match/);
  writeJson(path.join(directory, 'run.json'), run);
  journal(path.join(directory, run.parallel.shards[0].directory, 'games.jsonl'), [record('foreign')]);
  await assert.rejects(eta.readStage(f.root, descriptor, 4), /Invalid game/);
});

test('live stage initialization tolerates a brief incomplete manifest without repairing it', async t => {
  const f = fixture(t), { descriptor, run, directory } = f.stage();
  const file = path.join(directory, 'run.json');
  fs.writeFileSync(file, '{"config":');
  const writer = setTimeout(() => writeJson(file, run), 10);
  t.after(() => clearTimeout(writer));
  assert.equal((await eta.readStage(f.root, descriptor, 4)).finalIds.size, 0);
  fs.writeFileSync(file, '{"still-incomplete":');
  await assert.rejects(eta.readStage(f.root, descriptor, 4), /retry the ETA command/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"still-incomplete":');
});

test('main prints parseable JSON and help without starting or changing a run', async t => {
  const f = fixture(t), before = snapshot(f.root), output = [];
  const status = await eta.main(['--run', f.root, '--json'], { log: line => output.push(line) });
  assert.deepEqual(JSON.parse(output[0]), status); assert.deepEqual(snapshot(f.root), before);
  const help = [];
  await eta.main(['--help'], { log: line => help.push(line) });
  assert.match(help[0], /Read-only runtime estimate/); assert.match(help[0], /never starts engines/);
});
