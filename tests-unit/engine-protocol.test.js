const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const path = require('node:path');
const { Chess } = require('chess.js');
const { capabilityProbes } = require('../scripts/engine-capabilities');

const upgradedFen = 'rnbqkbnr/pppppppp/8/8/8/8/APPPPPPP/RNBQKBNO w KQkq - 0 1';
const allFeaturesFen = 'onbqkbnr/pppppppp/8/8/8/8/ACDPPPPP/LNBSKBNM w KQkq - 0 1';

// Exercise the real request state machine with deterministic UCI responses.
function fakeEngine(t, { omit, extra, hold = false, ignorePerft = false, readyBeforePerft = false, exitDuringProbe } = {}) {
  const probes = capabilityProbes(allFeaturesFen, 'levelup-v5');
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = { resume() {} };
  const commands = [];
  const spawned = [];
  let fen;
  let waitingOnProbe = false;
  let firstProbe;
  const probing = new Promise(resolve => { firstProbe = resolve; });
  const emit = lines => queueMicrotask(() => child.stdout.emit('data', Buffer.from(lines.join('\n') + '\n')));
  child.stdin = new EventEmitter();
  child.stdin.destroyed = false;
  child.stdin.write = text => {
    const command = text.trim();
    commands.push(command);
    if (command === 'uci') {
      emit(['id name Protocol test engine', 'option name UCI_Variant type combo default chess var chess var levelup-knight var levelup var levelup-v5', 'uciok']);
    } else if (command.startsWith('setoption name UCI_Variant value ')) {
      emit([`info string variant ${command.split(' ').at(-1)} files 8 ranks 8`]);
    } else if (command.startsWith('position fen ')) {
      fen = command.slice('position fen '.length);
    } else if (command === 'go perft 1') {
      waitingOnProbe = true;
      firstProbe();
      const probe = probes.find(candidate => candidate.fen === fen);
      assert.ok(probe, 'the bridge must use a fixed capability fixture');
      if (exitDuringProbe?.(probe)) {
        queueMicrotask(() => child.emit('exit', 1));
      } else if (!hold && !ignorePerft) {
        const moves = probe.required.filter(move => !omit?.(probe, move));
        moves.push(...(extra?.(probe) || []));
        const reply = () => emit([...moves.map(move => `${move}: 1`), `Nodes searched: ${moves.length}`]);
        if (readyBeforePerft) setImmediate(reply);
        else reply();
      }
    } else if (command === 'isready') {
      if (!hold || !waitingOnProbe) emit(['readyok']);
    } else if (command.startsWith('go movetime ')) {
      emit(['bestmove e2e4']);
    }
  };
  child.kill = () => { child.killed = true; };
  t.mock.method(childProcess, 'spawn', (...args) => { spawned.push(args); return child; });
  const engineFile = require.resolve('../scripts/engine');
  delete require.cache[engineFile];
  const { engineRequest } = require(engineFile);
  t.after(() => { delete require.cache[engineFile]; });
  return { engineRequest, commands, child, probing, spawned };
}

test('all required capabilities pass before the engine searches the actual game', async t => {
  const { engineRequest, commands, child } = fakeEngine(t);
  const result = await engineRequest({ fen: upgradedFen, variant: 'levelup-v5', difficulty: 'easy' });
  assert.equal(result.move, 'e2e4');
  assert.equal(commands.filter(command => command === 'go perft 1').length, 5);
  const search = commands.findIndex(command => command.startsWith('go movetime '));
  assert.equal(commands[search - 1], `position fen ${upgradedFen}`);
  assert.equal(commands.slice(search + 1).some(command => command === 'go perft 1'), false);
  assert.equal(child.killed, true);
});

test('readyok arriving before the asynchronous perft move list does not reject a capable engine', async t => {
  const { engineRequest, commands } = fakeEngine(t, { readyBeforePerft: true });
  assert.equal((await engineRequest({ fen: upgradedFen, variant: 'levelup-v5', difficulty: 'easy' })).move, 'e2e4');
  assert.equal(commands.filter(command => command === 'go perft 1').length, 5);
});

test('an engine that advertises the variant but misses custom castling is rejected before search', async t => {
  const { engineRequest, commands, child } = fakeEngine(t, { omit: (_, move) => move === 'e1g1' });
  await assert.rejects(engineRequest({ fen: upgradedFen, variant: 'levelup-v5' }), /does not support purple-rook castling/);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
  assert.equal(child.killed, true);
});

test('home-rank and screen-capture checks also finish before an army with every new piece is searched', async t => {
  const { engineRequest, commands } = fakeEngine(t);
  assert.equal((await engineRequest({ fen: allFeaturesFen, variant: 'levelup-v5', difficulty: 'easy' })).move, 'e2e4');
  assert.equal(commands.filter(command => command === 'go perft 1').length, 18);
  const search = commands.findIndex(command => command.startsWith('go movetime '));
  assert.equal(commands[search - 1], `position fen ${allFeaturesFen}`);
});

test('an engine that keeps blue jumps active outside the home ranks is rejected', async t => {
  const { engineRequest, commands } = fakeEngine(t, {
    extra: probe => probe.name === 'blue-queen movement outside the home ranks' ? ['d4f5'] : [],
  });
  await assert.rejects(engineRequest({ fen: allFeaturesFen, variant: 'levelup-v5' }), /does not support blue-queen movement outside/);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
});

test('forbidden custom promotions are detected even when all standard promotions exist', async t => {
  const { engineRequest, commands } = fakeEngine(t, {
    extra: probe => probe.name.startsWith('mandatory') ? ['b7b8a'] : [],
  });
  await assert.rejects(engineRequest({ fen: upgradedFen, variant: 'levelup-v5' }), /does not support mandatory standard promotion/);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
});

test('an engine that permits en passant through check is rejected', async t => {
  const { engineRequest, commands } = fakeEngine(t, {
    extra: probe => probe.name === 'blue-pawn en passant king safety' ? ['e5d4'] : [],
  });
  await assert.rejects(engineRequest({ fen: upgradedFen, variant: 'levelup-v5' }), /does not support blue-pawn en passant king safety/);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
});

test('an engine that ignores the perft command cannot pass by replying ready', async t => {
  const { engineRequest, commands } = fakeEngine(t, { ignorePerft: true });
  await assert.rejects(engineRequest({ fen: upgradedFen, variant: 'levelup-v5' }), /does not support purple-rook/);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
});

test('cancelling during capability checks kills the process without requesting a game move', async t => {
  const { engineRequest, commands, child, probing } = fakeEngine(t, { hold: true });
  const controller = new AbortController();
  const request = engineRequest({ fen: upgradedFen, variant: 'levelup-v5', signal: controller.signal });
  const rejected = assert.rejects(request, /cancelled/);
  await probing;
  controller.abort();
  await rejected;
  assert.equal(child.killed, true);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
});

test('standard chess searches still work without newer-variant capability checks', async t => {
  const { engineRequest, commands } = fakeEngine(t);
  const result = await engineRequest({ fen: new Chess().fen(), difficulty: 'easy' });
  assert.equal(result.move, 'e2e4');
  assert.equal(commands.some(command => command === 'go perft 1'), false);
});

function engineEnvironment(t, value) {
  const previous = process.env.FAIRY_STOCKFISH_PATH;
  if (value === undefined) delete process.env.FAIRY_STOCKFISH_PATH;
  else process.env.FAIRY_STOCKFISH_PATH = value;
  t.after(() => {
    if (previous === undefined) delete process.env.FAIRY_STOCKFISH_PATH;
    else process.env.FAIRY_STOCKFISH_PATH = previous;
  });
}

test('the compatible bundled engine is launched by default', async t => {
  engineEnvironment(t);
  const { engineRequest, spawned } = fakeEngine(t);
  await engineRequest({ fen: new Chess().fen(), difficulty: 'easy' });
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0][0], path.resolve(__dirname, '../stockfish/fairy-stockfish-levelup_x86-64.exe'));
  assert.deepEqual(spawned[0][1], []);
});

test('an explicit engine path remains an override, including paths with spaces', async t => {
  const customPath = path.resolve(__dirname, '../custom engine/fairy-stockfish.exe');
  engineEnvironment(t, customPath);
  const { engineRequest, spawned } = fakeEngine(t);
  await engineRequest({ fen: new Chess().fen(), difficulty: 'easy' });
  assert.equal(spawned[0][0], customPath);
});

test('blue-queen games do not run unrelated rook or pawn capability probes', async t => {
  const { engineRequest, commands } = fakeEngine(t, {
    omit: probe => !probe.name.startsWith('blue-queen '),
  });
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBSKBNR w KQkq - 0 1';
  assert.equal((await engineRequest({ fen, variant: 'levelup-v5', difficulty: 'easy' })).move, 'e2e4');
  assert.equal(commands.filter(command => command === 'go perft 1').length, 2);
});

test('an exit during a blue-rook probe identifies the capability and stops before searching', async t => {
  const { engineRequest, commands, child } = fakeEngine(t, {
    exitDuringProbe: probe => probe.name === 'blue-rook castling',
  });
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNL w KQkq - 0 1';
  await assert.rejects(engineRequest({ fen, variant: 'levelup-v5' }), /exited while checking blue-rook castling.*bundled LevelUp engine.*FAIRY_STOCKFISH_PATH/);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
  assert.equal(child.killed, true);
});
