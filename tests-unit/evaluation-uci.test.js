const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const { UciEngine } = require('../scripts/balance/uci');

const valueLines = (value = 2042) => [
  'levelupvalues version 1',
  `levelupvalue O ${value} 2208 ${value} 2208 ${value} 2208`,
  `levelupvalue o ${value} 2208 ${value} 2208 ${value} 2208`,
  'levelupvalue K 0 0 0 0 0 0',
  'levelupvalues done',
];
function fixture(t, { reply = valueLines(), hold = false, timeoutMs = 1000 } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = { resume() {} };
  child.stdin = new EventEmitter();
  child.stdin.writable = true;
  child.stdin.destroyed = false;
  child.stdin.end = () => { child.stdin.writable = false; };
  child.exitCode = null;
  child.signalCode = null;
  const commands = [];
  let diagnostic = false, reads = 0;
  const emit = lines => queueMicrotask(() => child.stdout.emit('data', Buffer.from(lines.join('\r\n') + '\r\n')));
  const exit = (code = 0, signal = null) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.exitCode = code; child.signalCode = signal;
    queueMicrotask(() => { child.emit('exit', code, signal); child.emit('close', code, signal); });
  };
  child.kill = signal => { child.killed = signal; exit(null, signal); return true; };
  child.stdin.write = text => {
    const command = text.trim(); commands.push(command);
    if (command === 'uci') emit([
      'id name Value diagnostic test',
      'option name Threads type spin default 1 min 1 max 64',
      'option name Hash type spin default 16 min 1 max 1024',
      'option name Skill Level type spin default 20 min 0 max 20',
      'uciok',
    ]);
    else if (command === 'levelupvalues') {
      diagnostic = true;
      if (!hold) emit(typeof reply === 'function' ? reply(reads++) : reply);
    } else if (command === 'isready') {
      if (!(diagnostic && hold)) { emit(['readyok']); diagnostic = false; }
    } else if (command === 'quit') exit();
    return true;
  };
  t.mock.method(childProcess, 'spawn', () => child);
  const engine = new UciEngine({ path: '/test/value-engine', options: { timeoutMs } });
  t.after(() => engine.close());
  return { engine, child, commands, emit };
}

function noSearch(commands) { assert.equal(commands.some(command => command.startsWith('go ')), false); }

test('piece-value diagnostic returns frozen raw, capture and evaluation tables for both colors without searching', async t => {
  const { engine, commands } = fixture(t);
  await engine.start();
  assert.equal(commands.includes('levelupvalues'), false, 'ordinary startup does not require the diagnostic');
  const result = await engine.pieceValues();
  assert.deepEqual(result, { version: 1, pieces: {
    O: { rawMg: 2042, rawEg: 2208, captureMg: 2042, captureEg: 2208, evalMg: 2042, evalEg: 2208 },
    o: { rawMg: 2042, rawEg: 2208, captureMg: 2042, captureEg: 2208, evalMg: 2042, evalEg: 2208 },
    K: { rawMg: 0, rawEg: 0, captureMg: 0, captureEg: 0, evalMg: 0, evalEg: 0 },
  } });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.pieces));
  assert.ok(Object.values(result.pieces).every(Object.isFrozen));
  assert.deepEqual(commands.slice(-2), ['levelupvalues', 'isready']);
  assert.equal(engine.state, 'ready');
  noSearch(commands);
});

test('each piece-value read is an independent immutable snapshot', async t => {
  const { engine } = fixture(t, { reply: count => valueLines(count ? 3000 : 2042) });
  await engine.start();
  const first = await engine.pieceValues();
  const second = await engine.pieceValues();
  assert.notEqual(first, second);
  assert.equal(first.pieces.O.rawMg, 2042);
  assert.equal(second.pieces.O.rawMg, 3000);
});

for (const [name, reply] of [
  ['unsupported old engine', ['Unknown command: levelupvalues']],
  ['unsupported version', ['levelupvalues version 2', ...valueLines().slice(1)]],
  ['missing version', valueLines().slice(1)],
  ['duplicated version', ['levelupvalues version 1', ...valueLines()]],
  ['duplicated letter', ['levelupvalues version 1', valueLines()[1], valueLines()[1], 'levelupvalues done']],
  ['negative value', ['levelupvalues version 1', 'levelupvalue O -1 2208 2042 2208 2042 2208', 'levelupvalues done']],
  ['fractional value', ['levelupvalues version 1', 'levelupvalue O 2042.5 2208 2042 2208 2042 2208', 'levelupvalues done']],
  ['unsafe value', ['levelupvalues version 1', 'levelupvalue O 99999999999999999 2208 2042 2208 2042 2208', 'levelupvalues done']],
  ['incomplete table', ['levelupvalues version 1', 'levelupvalues done']],
  ['missing completion', valueLines().slice(0, -1)],
  ['duplicated completion', [...valueLines(), 'levelupvalues done']],
  ['row after completion', [...valueLines(), 'levelupvalue Q 1 1 1 1 1 1']],
  ['unrelated unexpected reply', ['info string values are not supported']],
]) {
  test(`piece-value preflight rejects ${name} and kills the process before any search`, async t => {
    const { engine, child, commands } = fixture(t, { reply });
    await engine.start();
    await assert.rejects(engine.pieceValues(), /Cannot verify manual piece values:.*compatible LevelUp engine/);
    assert.equal(engine.state, 'closed');
    assert.equal(child.killed, 'SIGKILL');
    noSearch(commands);
  });
}

test('a missing diagnostic times out with an actionable error and cannot be scored as a game', async t => {
  const { engine, child, commands } = fixture(t, { hold: true, timeoutMs: 20 });
  await engine.start();
  await assert.rejects(engine.pieceValues(), /Cannot verify manual piece values:.*timed out.*compatible LevelUp engine/);
  assert.equal(child.killed, 'SIGKILL');
  noSearch(commands);
});

test('cancelling a piece-value read retains AbortError and drains the process without searching', async t => {
  const { engine, child, commands } = fixture(t, { hold: true });
  await engine.start();
  const controller = new AbortController();
  const reading = engine.pieceValues({ signal: controller.signal });
  const rejected = assert.rejects(reading, { name: 'AbortError', code: 'ABORT_ERR' });
  assert.ok(commands.includes('levelupvalues'));
  controller.abort();
  await rejected;
  assert.equal(child.killed, 'SIGKILL');
  noSearch(commands);
});

test('a pre-aborted diagnostic sends no command', async t => {
  const { engine, commands } = fixture(t);
  await engine.start();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(engine.pieceValues({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(commands.includes('levelupvalues'), false);
  noSearch(commands);
});

test('a simultaneous diagnostic does not interrupt the active read', async t => {
  const { engine, emit, commands } = fixture(t, { hold: true });
  await engine.start();
  const first = engine.pieceValues();
  await assert.rejects(engine.pieceValues(), /already in progress/);
  emit([...valueLines(), 'readyok']);
  assert.equal((await first).pieces.O.rawMg, 2042);
  assert.equal(engine.state, 'ready');
  assert.equal(commands.filter(command => command === 'levelupvalues').length, 1);
  noSearch(commands);
});
