const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');

const nativeOptions = { skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 30000 };

test('recovery uses newer durable history while keeping attempts and branches separate', () => {
  const { recoverHistory } = require('../scripts/balance/run');
  const game = { id: 'recover-me' };
  const checkpoint = { id: game.id, startFen: 'initial', attempt: 1, moves: ['e2e4'] };
  const journal = { ...checkpoint, status: 'error', moves: ['e2e4', 'e7e5'] };
  assert.equal(recoverHistory(game, 'initial', checkpoint, [journal]), journal);
  assert.equal(recoverHistory(game, 'initial', null, [journal]), journal);
  const newerAttempt = { ...checkpoint, attempt: 2, moves: ['d2d4'] };
  assert.equal(recoverHistory(game, 'initial', newerAttempt, [journal]), newerAttempt);
  assert.throws(() => recoverHistory(game, 'initial', { ...checkpoint, moves: ['d2d4'] }, [journal]), /conflicting histories/);
  assert.throws(() => recoverHistory(game, 'different-position', checkpoint, [journal]), /does not match/);
  assert.throws(() => recoverHistory(game, 'initial', { ...checkpoint, attempt: 0 }, []), /does not match/);
  assert.equal(recoverHistory(game, 'initial', null, [{ ...journal, id: 'other-game' }]), null);
});

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-balance-runner-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function configuration({ engine = {}, repetitions = 1, opening = [] } = {}) {
  return normalizeConfig({
    schemaVersion: 1,
    name: 'Runner integration; not balance evidence',
    seed: 42,
    repetitions,
    engine: { ...(engine.movetimeMs === undefined ? { nodes: 500 } : {}), maxPlies: 2, ...engine },
    openings: [{ id: 'fixture', moves: opening }],
    comparisons: [{ id: 'standard-control', armyA: {}, armyB: {} }],
  });
}

function read(directory, name) { return fs.readFileSync(path.join(directory, name), 'utf8'); }
function json(directory, name) { return JSON.parse(read(directory, name)); }
function records(directory) {
  return read(directory, 'games.jsonl').split('\n').filter(Boolean).map(line => JSON.parse(line));
}
function checkpoint(directory) {
  try { return json(directory, 'checkpoint.json'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function run(config, outDir, options = {}) {
  const { runMatches } = require('../scripts/balance/run');
  return runMatches({ config, schedule: makeSchedule(config), outDir, enginePath: process.env.FAIRY_STOCKFISH_PATH, ...options });
}

test('CLI selects one run/control mode and bounds a new run without changing resume settings', () => {
  const { parseArgs } = require('../scripts/balance');
  assert.deepEqual(parseArgs(['--help']), { help: true });
  assert.deepEqual(parseArgs(['-h']), { help: true });
  assert.deepEqual(parseArgs(['--config', 'plan with spaces.json', '--out', 'results here', '--limit-pairs', '2']), {
    config: 'plan with spaces.json', out: 'results here', 'limit-pairs': 2,
  });
  for (const mode of ['resume', 'status', 'stop-now', 'stop-after-game', 'stop-after-pair']) {
    assert.deepEqual(parseArgs([`--${mode}`, 'results']), { [mode]: 'results' });
  }
  for (const args of [
    [], ['--config'], ['--config', '--out', 'x'], ['--unknown', 'x'],
    ['--config', 'a', '--config', 'b'], ['--config', 'a', '--resume', 'b'],
    ['--resume', 'a', '--out', 'b'], ['--resume', 'a', '--limit-pairs', '1'],
    ['--config', 'a', '--limit-pairs', '0'], ['--config', 'a', '--limit-pairs', '-1'],
    ['--config', 'a', '--limit-pairs', '1.5'], ['--config', 'a', '--limit-pairs', '9007199254740992'],
  ]) assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
});

test('external stop requests carry the live run owner token and reject an inactive run', t => {
  const { requestStop } = require('../scripts/balance');
  const directory = temporary(t);
  t.mock.method(console, 'log', () => {});
  assert.throws(() => requestStop(directory, 'now'), /not active/);
  fs.writeFileSync(path.join(directory, 'run.lock'), JSON.stringify({ pid: process.pid, token: 'owner-token', runId: 'run-id' }));
  requestStop(directory, 'pair');
  const request = json(directory, 'control.json');
  assert.equal(request.action, 'pair');
  assert.equal(request.token, 'owner-token');
  assert.equal(request.runId, 'run-id');
  assert.ok(Number.isFinite(Date.parse(request.requestedAt)));
  assert.deepEqual(fs.readdirSync(directory).filter(name => name.endsWith('.tmp')), []);
  fs.writeFileSync(path.join(directory, 'run.lock'), JSON.stringify({ pid: -1, token: 'unknown', runId: 'old-run' }));
  assert.throws(() => requestStop(directory, 'now'), /no live owner/);
  assert.equal(json(directory, 'control.json').action, 'pair');
});

test('native runner finishes and scores a forced mate from a legal nonterminal opening', nativeOptions, async t => {
  const directory = temporary(t);
  const config = configuration({
    engine: { nodes: 5000, maxPlies: 6 },
    opening: ['f2f3', 'e7e5', 'g2g4'],
  });
  const result = await run(config, directory);
  const attempts = records(directory);
  assert.equal(result.stopped, false);
  assert.equal(result.nextIndex, 2);
  assert.equal(result.scheduledGames, 2);
  assert.equal(attempts.length, 2);
  for (const attempt of attempts) {
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.result, '0-1');
    assert.deepEqual(attempt.moves, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    assert.match(attempt.sans.at(-1), /Qh4#/);
    assert.match(attempt.reason, /mate/i);
  }
  assert.deepEqual(new Set(attempts.map(attempt => attempt.aColor)), new Set(['w', 'b']));
  assert.equal(result.summary.statusCounts.completed, 2);
  assert.equal(result.summary.comparisons[0].paired.completePairs, 1);
  assert.equal(result.summary.comparisons[0].overall.score, 0.5);
  assert.match(read(directory, 'games.pgn'), /Qh4#/);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
});

test('ply limits remain unscored and completed schedule entries are skipped on resume', nativeOptions, async t => {
  const directory = temporary(t);
  const config = configuration();
  const first = await run(config, directory);
  const attempts = records(directory);
  assert.equal(first.nextIndex, 2);
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every(attempt => attempt.status === 'truncated'));
  assert.ok(attempts.every(attempt => attempt.moves.length === 2));
  assert.equal(first.summary.statusCounts.truncated, 2);
  assert.equal(first.summary.comparisons[0].overall.games, 0);
  assert.equal(first.summary.comparisons[0].primaryEstimate.score, null);
  const originalLog = read(directory, 'games.jsonl');
  const originalManifest = read(directory, 'run.json');
  const resumed = await run(config, directory, { resume: true });
  assert.equal(resumed.nextIndex, 2);
  assert.equal(read(directory, 'games.jsonl'), originalLog);
  assert.equal(read(directory, 'run.json'), originalManifest);
  assert.equal(resumed.summary.totalAttempts, 2);
});

for (const [mode, expectedGames] of [['game', 1], ['pair', 2]]) {
  test(`graceful stop after a ${mode} finishes the requested boundary and resumes remaining games`, nativeOptions, async t => {
    const directory = temporary(t);
    const config = configuration({ repetitions: 2 });
    let requested = null;
    const result = await run(config, directory, {
      shouldStop: () => requested,
      onProgress() { if (checkpoint(directory)?.current) requested = mode; },
    });
    const attempts = records(directory);
    assert.equal(result.stopped, true);
    assert.equal(result.nextIndex, expectedGames);
    assert.equal(attempts.length, expectedGames);
    assert.ok(attempts.every(attempt => attempt.status === 'truncated'));
    if (mode === 'pair') {
      assert.equal(attempts[0].pairId, attempts[1].pairId);
      assert.notEqual(attempts[0].aColor, attempts[1].aColor);
    }
    const resumed = await run(config, directory, { resume: true });
    assert.equal(resumed.nextIndex, 4);
    assert.equal(records(directory).length, 4);
    assert.equal(new Set(records(directory).map(attempt => attempt.id)).size, 4);
  });
}

test('aborting after a saved move preserves its history and resumes as an unscored retry', nativeOptions, async t => {
  const directory = temporary(t);
  const config = configuration();
  const controller = new AbortController();
  let saved;
  const interrupted = await run(config, directory, {
    signal: controller.signal,
    onProgress() {
      const current = checkpoint(directory)?.current;
      if (current?.moves.length === 1 && !controller.signal.aborted) {
        saved = structuredClone(current);
        controller.abort();
      }
    },
  });
  assert.ok(saved, 'the progress callback must observe the first persisted move');
  assert.equal(interrupted.stopped, true);
  assert.equal(interrupted.nextIndex, 0);
  assert.equal(records(directory).length, 1);
  assert.equal(records(directory)[0].status, 'aborted');
  assert.equal(interrupted.summary.statusCounts.completed, 0);
  assert.deepEqual(checkpoint(directory).current.moves, saved.moves);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);

  const resumed = await run(config, directory, { resume: true });
  const attempts = records(directory);
  assert.equal(resumed.nextIndex, 2);
  assert.equal(attempts.length, 3);
  const retry = attempts.find(attempt => attempt.id === saved.id && attempt.status === 'truncated');
  assert.ok(retry);
  assert.equal(retry.attempt, 2);
  assert.deepEqual(retry.moves.slice(0, saved.moves.length), saved.moves);
  assert.equal(resumed.summary.comparisons[0].overall.games, 0);
});

test('immediate cancellation interrupts an active native search and retains a resumable checkpoint', nativeOptions, async t => {
  const directory = temporary(t);
  const config = configuration({ engine: { movetimeMs: 30000 } });
  const controller = new AbortController();
  const { UciEngine } = require('../scripts/balance/uci');
  const originalSearch = UciEngine.prototype.search;
  let activeSearch = false;
  let abortTimer;
  t.after(() => clearTimeout(abortTimer));
  t.mock.method(UciEngine.prototype, 'search', function(options) {
    const search = originalSearch.call(this, options);
    if (!activeSearch) {
      activeSearch = true;
      abortTimer = setTimeout(() => controller.abort(), 25);
    }
    return search;
  });
  const startedAt = Date.now();
  const result = await run(config, directory, { signal: controller.signal });
  assert.equal(activeSearch, true);
  assert.equal(result.stopped, true);
  assert.ok(Date.now() - startedAt < 10000, 'cancel should not wait for the 30-second search budget');
  assert.equal(records(directory).length, 1);
  assert.equal(records(directory)[0].status, 'aborted');
  assert.deepEqual(checkpoint(directory).current.moves, []);
  assert.equal(result.summary.statusCounts.completed, 0);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
});

test('version 08 rejects historical runners and still recovers its own interrupted journal history', nativeOptions, async t => {
  const directory = temporary(t);
  const config = configuration({ repetitions: 2 });
  const rename = fs.renameSync;
  t.mock.method(Atomics, 'wait', () => 'timed-out');
  const injected = t.mock.method(fs, 'renameSync', (from, to) => {
    if (path.basename(to) === 'checkpoint.json') {
      const saved = JSON.parse(fs.readFileSync(from, 'utf8'));
      if (saved.nextIndex === 2 && saved.current?.moves.length === 1) {
        const error = new Error('Simulated Windows sharing violation');
        error.code = 'EPERM';
        throw error;
      }
    }
    return rename(from, to);
  });
  await assert.rejects(run(config, directory), error => error.code === 'EPERM');
  injected.mock.restore();
  const attempts = records(directory);
  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts.map(attempt => attempt.status), ['truncated', 'truncated', 'error']);
  const saved = attempts[2];
  assert.equal(saved.moves.length, 1);
  assert.deepEqual(checkpoint(directory).current.moves, []);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);

  // Reconstruct the exact original source identity, as found in a pre-patch
  // run. Settings, native engine, movement profiles and played games stay put.
  const patch = require('../scripts/balance/storage-patch.json');
  const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const currentManifest = read(directory, 'run.json');
  const currentCheckpoint = read(directory, 'checkpoint.json');
  const currentJournal = read(directory, 'games.jsonl');
  const original = json(directory, 'run.json');
  original.runnerSources = patch.originalRunnerSources;
  original.runnerSha256 = fingerprint(original.runnerSources);
  const profiles = original.rulesProfiles.map(profile => ({ variant: profile.variant, config: read(directory, profile.file) }));
  original.rulesHash = fingerprint({ bundleHash: original.rulesBundleSha256, runnerSha256: original.runnerSha256, profiles });
  const manifestBytes = JSON.stringify(original, null, 2) + '\n';
  fs.writeFileSync(path.join(directory, 'run.json'), manifestBytes);
  assert.ok(patch.fromRunnerSha256.includes(original.runnerSha256));
  assert.ok(patch.fromRunnerSha256.includes('c6e4aea9c046842048ae0f7057bf3639937713638fb3846afe96fe0a23e55899'));

  await assert.rejects(run(config, directory, { resume: true }), /Use version_07/);
  assert.equal(read(directory, 'run.json'), manifestBytes);
  assert.equal(read(directory, 'games.jsonl'), currentJournal);
  assert.equal(read(directory, 'checkpoint.json'), currentCheckpoint);
  assert.equal(fs.existsSync(path.join(directory, 'run.lock')), false);
  fs.writeFileSync(path.join(directory, 'run.json'), currentManifest);

  const resumed = await run(config, directory, { resume: true });
  const recovered = records(directory);
  assert.equal(resumed.nextIndex, 4);
  assert.equal(recovered.length, 5);
  assert.deepEqual(recovered.slice(0, 3), attempts);
  const retry = recovered.find(attempt => attempt.id === saved.id && attempt.attempt === 2);
  assert.ok(retry);
  assert.deepEqual(retry.moves.slice(0, 1), saved.moves);
  assert.equal(retry.status, 'truncated');
  assert.equal(read(directory, 'run.json'), currentManifest);
  assert.equal(fs.existsSync(path.join(directory, 'storage-upgrade.json')), false);
});
