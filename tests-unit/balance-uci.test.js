const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { UciEngine } = require('../scripts/balance/uci');

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const VARIANT_FEN = FEN.replace('RNBQKBNR', 'RNBSKBNR');

function fakeEngine(t, config = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = { resume() { child.stderrDrained = true; } };
  child.stdin = new EventEmitter();
  child.stdin.writable = true;
  child.stdin.destroyed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.stdin.end = () => { child.stdin.writable = false; };
  const commands = [];
  const launches = [];
  const waiters = [];
  const emit = lines => queueMicrotask(() => child.stdout.emit('data', Buffer.from(lines.join('\r\n') + '\r\n')));
  const exit = (code = 0, signal = null) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.exitCode = code;
    child.signalCode = signal;
    queueMicrotask(() => { child.emit('exit', code, signal); child.emit('close', code, signal); });
  };
  child.kill = signal => { child.killed = signal; exit(null, signal); return true; };
  let loaded = false;
  child.stdin.write = text => {
    const command = text.trim();
    commands.push(command);
    for (const waiter of waiters) if (waiter.match(command)) waiter.resolve(command);
    if (config.onCommand?.(command, { emit, exit, child }) === false) return true;
    if (command === 'uci') {
      if (config.hold === 'uci') return true;
      const options = [
        'option name Threads type spin default 1 min 1 max 64',
        'option name Hash type spin default 16 min 1 max 1024',
        'option name Clear Hash type button',
        'option name Skill Level type spin default 20 min -20 max 20',
        'option name UCI_LimitStrength type check default false',
        'option name UCI_Elo type spin default 1350 min 500 max 2850',
        'option name VariantPath type string default <empty>',
        `option name UCI_Variant type combo default chess var chess${loaded && config.advertise !== false ? ' var levelup-v5' : ''}`,
      ].filter(line => !config.omitOption?.(line));
      emit(['id name Test engine', 'id author Test author', ...options, 'uciok']);
    } else if (command.startsWith('setoption name VariantPath value ')) loaded = true;
    else if (command.startsWith('setoption name UCI_Variant value ') && config.confirm !== false) {
      emit([`info string variant ${command.split(' ').at(-1)} files 8 ranks 8`]);
    } else if (command === 'isready') {
      if (config.hold !== 'ready') emit(['readyok']);
    } else if (command === 'go perft 1') {
      if (config.hold !== 'perft') {
        const reply = () => emit(['h2h4: 1', 'a2a3: 1', 'a2a3: 1', 'Nodes searched: 2']);
        if (config.readyBeforePerft) setImmediate(reply);
        else reply();
      }
    } else if (command.startsWith('go ')) {
      if (config.hold !== 'search') emit([
        'info depth 8 score cp 19 nodes 19998 time 42 pv e2e4 e7e5',
        'info depth 8 multipv 2 score cp 12 nodes 19999 pv d2d4 d7d5',
        `bestmove ${config.move || 'e2e4'} ponder e7e5`,
      ]);
    } else if (command === 'quit') exit();
    return true;
  };
  t.mock.method(childProcess, 'spawn', (...args) => { launches.push(args); return child; });
  return {
    child, commands, launches, emit, exit,
    waitFor(match) {
      const existing = commands.find(match);
      if (existing) return Promise.resolve(existing);
      return new Promise(resolve => waiters.push({ match, resolve }));
    },
  };
}

function client(options = {}) {
  return new UciEngine({ path: '/a path with spaces/fairy-stockfish.exe', variantPath: '/rules with spaces/levelup.ini', variant: 'levelup-v5', ...options });
}

test('loads custom rules before re-reading supported variants and configures reproducible resources', async t => {
  const fake = fakeEngine(t);
  const engine = client();
  t.after(() => engine.close());
  const metadata = await engine.start();
  assert.equal(metadata.idname, 'Test engine');
  assert.equal(metadata.idauthor, 'Test author');
  assert.deepEqual(metadata.options.UCI_Elo, { type: 'spin', default: 1350, min: 500, max: 2850 });
  assert.deepEqual(metadata.options.UCI_Variant.vars, ['chess', 'levelup-v5']);
  assert.deepEqual(fake.launches[0], ['/a path with spaces/fairy-stockfish.exe', [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }]);
  assert.deepEqual(fake.commands, [
    'uci', 'setoption name VariantPath value /rules with spaces/levelup.ini', 'uci',
    'setoption name Threads value 1', 'setoption name Hash value 32',
    'setoption name UCI_Variant value levelup-v5', 'setoption name UCI_LimitStrength value false',
    'setoption name Skill Level value 20', 'isready',
  ]);
  assert.equal(fake.child.stderrDrained, true);
  await engine.newGame();
  assert.deepEqual(fake.commands.slice(-3), ['setoption name Clear Hash', 'ucinewgame', 'isready']);
});

test('preserves full move history and records only the main root variation', async t => {
  const fake = fakeEngine(t);
  const engine = client({ options: { skill: 8 } });
  t.after(() => engine.close());
  await engine.start();
  const result = await engine.search({ fen: FEN, moves: ['g1f3', 'g8f6', 'f3g1', 'f6g8'], nodes: 20000 });
  assert.equal(result.move, 'e2e4');
  assert.deepEqual(result.info.score, { type: 'cp', value: 19 });
  assert.deepEqual(result.info.pv, ['e2e4', 'e7e5']);
  assert.equal(result.info.nodes, 19998);
  assert.deepEqual(fake.commands.slice(-2), [`position fen ${FEN} moves g1f3 g8f6 f3g1 f6g8`, 'go nodes 20000']);
  assert.ok(fake.commands.includes('setoption name Skill Level value 8'));
  await engine.search({ fen: FEN, movetimeMs: 75 });
  assert.equal(fake.commands.at(-1), 'go movetime 75');
  assert.equal(fake.launches.length, 1, 'searches reuse one engine process');
});

test('perft waits for both readyok and the asynchronous move list', async t => {
  const fake = fakeEngine(t, { readyBeforePerft: true });
  const engine = client();
  t.after(() => engine.close());
  await engine.start();
  assert.deepEqual(await engine.perft({ fen: FEN }), ['a2a3', 'h2h4']);
  assert.equal(fake.commands.at(-1), 'isready');
});

test('Elo uses the advertised bounds and enables strength limiting', async t => {
  const fake = fakeEngine(t);
  const engine = client({ options: { elo: 1800 } });
  t.after(() => engine.close());
  await engine.start();
  assert.ok(fake.commands.includes('setoption name UCI_Elo value 1800'));
  assert.ok(fake.commands.includes('setoption name UCI_LimitStrength value true'));
  assert.equal(fake.commands.some(command => command.startsWith('setoption name Skill Level')), false);
});

for (const [name, config, options, expected] of [
  ['unadvertised variants', { advertise: false }, {}, /does not advertise variant/],
  ['unconfirmed variant selection', { confirm: false }, {}, /did not confirm selection/],
  ['Elo below the engine range', {}, { elo: 499 }, /UCI_Elo must be between 500 and 2850/],
  ['missing Elo support', { omitOption: line => line.startsWith('option name UCI_Elo ') }, { elo: 1800 }, /does not advertise a supported UCI_Elo/],
  ['missing strength limiting', { omitOption: line => line.startsWith('option name UCI_LimitStrength ') }, { elo: 1800 }, /Elo is unavailable/],
]) {
  test(`startup rejects ${name} instead of pretending to calibrate strength`, async t => {
    const fake = fakeEngine(t, config);
    const engine = client({ options });
    await assert.rejects(engine.start(), expected);
    await engine.close();
    assert.equal(fake.child.killed, 'SIGKILL');
  });
}

for (const phase of ['uci', 'ready', 'perft', 'search']) {
  test(`cancelling during ${phase} kills and drains the engine`, async t => {
    const fake = fakeEngine(t, { hold: phase });
    const engine = client();
    const controller = new AbortController();
    let operation;
    if (phase === 'uci' || phase === 'ready') operation = engine.start({ signal: controller.signal });
    else {
      await engine.start();
      operation = phase === 'perft'
        ? engine.perft({ fen: FEN, signal: controller.signal })
        : engine.search({ fen: FEN, signal: controller.signal });
    }
    const rejected = assert.rejects(operation, { name: 'AbortError', code: 'ABORT_ERR' });
    await fake.waitFor(command => phase === 'uci' ? command === 'uci' : phase === 'ready' ? command === 'isready' : phase === 'perft' ? command === 'go perft 1' : command.startsWith('go nodes '));
    controller.abort();
    await rejected;
    await engine.close();
    assert.equal(fake.child.killed, 'SIGKILL');
    assert.equal(engine.state, 'closed');
  });
}

test('timeouts are infrastructure errors and never produce a scored move', async t => {
  const fake = fakeEngine(t, { hold: 'uci' });
  const engine = client({ options: { timeoutMs: 10 } });
  await assert.rejects(engine.start(), /timed out; match was not scored/);
  await engine.close();
  assert.equal(fake.child.killed, 'SIGKILL');
});

test('an unexpected process exit rejects a search and preserves no fictitious result', async t => {
  const fake = fakeEngine(t, { hold: 'search' });
  const engine = client();
  await engine.start();
  const search = engine.search({ fen: FEN });
  const rejected = assert.rejects(search, /Engine exited/);
  fake.exit(3);
  await rejected;
  await engine.close();
});

test('stdin closure fails cleanly', async t => {
  const fake = fakeEngine(t, { hold: 'search' });
  const engine = client();
  await engine.start();
  const rejected = assert.rejects(engine.search({ fen: FEN }), /Engine input connection closed/);
  fake.child.stdin.emit('error', new Error('EPIPE'));
  await rejected;
  await engine.close();
});

test('bounds an unterminated output line', async t => {
  const fake = fakeEngine(t, { hold: 'search' });
  const engine = client();
  await engine.start();
  const rejected = assert.rejects(engine.search({ fen: FEN }), /output line is too long/);
  fake.child.stdout.emit('data', Buffer.from('x'.repeat(65537)));
  await rejected;
  await engine.close();
});

test('rejects simultaneous operations while preserving the active operation', async t => {
  const fake = fakeEngine(t, { hold: 'search' });
  const engine = client();
  t.after(() => engine.close());
  await engine.start();
  const search = engine.search({ fen: FEN });
  await assert.rejects(engine.perft({ fen: FEN }), /already in progress/);
  fake.emit(['bestmove e2e4']);
  assert.equal((await search).move, 'e2e4');
});

test('close interrupts active work', async t => {
  const fake = fakeEngine(t, { hold: 'search', onCommand: command => command === 'quit' ? false : undefined });
  const engine = client();
  await engine.start();
  const rejected = assert.rejects(engine.search({ fen: FEN }), { name: 'AbortError' });
  await engine.close();
  await rejected;
  assert.equal(fake.child.killed, 'SIGKILL');
});

test('close terminates and drains an idle engine that ignores quit', async t => {
  const fake = fakeEngine(t, { onCommand: command => command === 'quit' ? false : undefined });
  const engine = client();
  await engine.start();
  await engine.close();
  assert.equal(fake.child.killed, 'SIGKILL');
});

test('a pre-aborted startup launches no process', async t => {
  const fake = fakeEngine(t);
  const engine = client();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(engine.start({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fake.launches.length, 0);
  await engine.close();
});

test('handles CRLF responses split across data chunks', async t => {
  fakeEngine(t, { onCommand(command, { child }) {
    if (!command.startsWith('go nodes ')) return;
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('info depth 4 score mate -2 nodes 500 pv e2e4\r'));
      child.stdout.emit('data', Buffer.from('\nbestmo'));
      child.stdout.emit('data', Buffer.from('ve e2e4\r\n'));
    });
    return false;
  } });
  const engine = client();
  t.after(() => engine.close());
  await engine.start();
  const result = await engine.search({ fen: FEN });
  assert.equal(result.move, 'e2e4');
  assert.deepEqual(result.info.score, { type: 'mate', value: -2 });
});

test('invalid input cannot inject protocol commands', async () => {
  assert.throws(() => client({ options: { skill: 1, elo: 1500 } }), /Choose skill or Elo/);
  assert.throws(() => client({ options: { skill: 21 } }), /Invalid skill level/);
  assert.throws(() => client({ variant: 'chess\nquit' }), /Invalid engine variant/);
  const engine = client();
  await assert.rejects(engine.search({ fen: `${FEN}\nquit` }), /Invalid position FEN/);
  await assert.rejects(engine.search({ fen: FEN, moves: ['e2e4\nquit'] }), /Invalid move history/);
  await engine.close();
});

const nativePath = process.env.BALANCE_NATIVE_TEST_PATH || path.resolve(__dirname, '../node_modules/.cache/levelup-native/stockfish');
test('real native engine loads upgrade rules, enumerates moves, searches twice, and closes', { skip: !fs.existsSync(nativePath) }, async t => {
  const engine = new UciEngine({ path: nativePath, variant: 'levelup-v5', variantPath: path.resolve(__dirname, '../variants/levelup-v5.ini') });
  t.after(() => engine.close());
  const metadata = await engine.start();
  assert.ok(metadata.idname.includes('Fairy-Stockfish'));
  await engine.newGame();
  const legal = await engine.perft({ fen: VARIANT_FEN });
  assert.equal(legal.length, 28);
  assert.ok(legal.includes('d1b4'));
  const first = await engine.search({ fen: VARIANT_FEN, nodes: 1000 });
  assert.ok(legal.includes(first.move));
  const second = await engine.search({ fen: VARIANT_FEN, moves: [first.move], nodes: 1000 });
  assert.match(second.move, /^[a-h][1-8][a-h][1-8][a-z]?$/);
  assert.ok(second.info.nodes >= 1000);
  await engine.close();
  assert.equal(engine.child.exitCode, 0);
});
