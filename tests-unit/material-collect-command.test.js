'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { parseArgs, installControls, main } = require('../scripts/material-collect');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-collection-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const book = path.join(root, 'book.epd'), out = path.join(root, 'run');
  fs.writeFileSync(book, 'book bytes');
  const plan = { openings: Array.from({ length: 32 }, (_, i) => ({ id: `o${i}` })),
    schedule: Array.from({ length: 96 }, (_, i) => ({ id: `g${i}` })), book: { sha256: 'a'.repeat(64) } };
  const calls = [], closed = [];
  const services = { enginePath: process.execPath, log() {},
    createCollectionPlan: async (bytes, options) => { calls.push(['plan', bytes.toString(), options]); return plan; },
    installControls(controller) {
      const item = { controller, closed: false }; closed.push(item);
      return { shouldStop: () => null, close() { item.closed = true; } };
    },
    readCollectionManifest: directory => JSON.parse(fs.readFileSync(path.join(directory, 'collection.json'), 'utf8')),
    checkCollection: async options => { calls.push(['check', options]); return { probes: 8 }; },
    runCollection: async options => {
      calls.push(['run', options]); fs.mkdirSync(options.outDir, { recursive: true });
      fs.writeFileSync(path.join(options.outDir, 'collection.json'), JSON.stringify({ plan }));
      return { stopped: false, finishedGames: 96, scheduledGames: 96 };
    },
    writeCollectionReport: async directory => { calls.push(['report', directory]); return { files: { markdown: path.join(directory, 'report.md') } }; },
  };
  return { root, book, out, plan, calls, closed, services };
}

test('collection CLI chooses one mode and freezes effort, book and workers on resume', () => {
  assert.deepEqual(parseArgs(['--check', '--book', 'b']), { check: true, book: 'b' });
  assert.deepEqual(parseArgs(['--out', 'r', '--book', 'b', '--jobs', '3']), { out: 'r', book: 'b', jobs: 3 });
  assert.deepEqual(parseArgs(['--resume', 'r']), { resume: 'r' });
  assert.deepEqual(parseArgs(['--report', 'r']), { report: 'r' });
  for (const args of [[], ['--check'], ['--out', 'r'], ['--check', '--book', 'b', '--jobs', '3'],
    ['--resume', 'r', '--book', 'b'], ['--resume', 'r', '--jobs', '2'], ['--report', 'r', '--jobs', '1'],
    ['--out', 'r', '--book', 'b', '--jobs', '0'], ['--out', 'r', '--book', 'b', '--jobs', '17'],
    ['--out', 'r', '--book', 'b', '--nodes', '100'], ['--out', 'r', '--book', 'b', '--out', 'x'],
    ['--out', 'r', '--resume', 'r', '--book', 'b']]) assert.throws(() => parseArgs(args), args.join(' '));
});

test('check builds the frozen plan and validates natively without starting games or writing a run', async t => {
  const data = fixture(t);
  const result = await main(['--check', '--book', data.book], data.services);
  assert.equal(result.checked, true); assert.equal(result.plan, data.plan);
  assert.deepEqual(data.calls.map(call => call[0]), ['plan', 'check']);
  assert.equal(fs.existsSync(data.out), false);
  assert.ok(data.closed.every(item => item.closed));
});

test('new collection uses one explicit cap, requested jobs and the shared final report', async t => {
  const data = fixture(t);
  const result = await main(['--out', data.out, '--book', data.book, '--jobs', '2'], data.services);
  assert.equal(result.finishedGames, 96);
  const options = data.calls.find(call => call[0] === 'run')[1];
  assert.equal(options.plan, data.plan); assert.equal(options.jobs, 2); assert.equal(options.resume, false);
  assert.equal(data.calls.filter(call => call[0] === 'run').length, 1);
  assert.ok(data.calls.some(call => call[0] === 'report'));
  assert.ok(data.closed.every(item => item.closed));
});

test('resume uses the saved book-position snapshot without rereading an external book', async t => {
  const data = fixture(t); fs.mkdirSync(data.out);
  fs.writeFileSync(path.join(data.out, 'collection.json'), JSON.stringify({ plan: data.plan })); fs.unlinkSync(data.book);
  data.services.createCollectionPlan = async () => { throw new Error('must not reselect positions'); };
  await main(['--resume', data.out], data.services);
  const options = data.calls.find(call => call[0] === 'run')[1];
  assert.deepEqual(options.plan, data.plan); assert.equal(options.jobs, undefined); assert.equal(options.resume, true);
});

test('offline report and help need neither book selection nor engine startup', async t => {
  const data = fixture(t);
  await main(['--report', data.out], { writeCollectionReport: data.services.writeCollectionReport, log() {} });
  assert.deepEqual(data.calls.map(call => call[0]), ['report']);
  assert.deepEqual(await main(['--help'], { log() {} }), { help: true });
});

test('failed and early-cancelled preflight always closes input controls', async t => {
  const data = fixture(t);
  data.services.checkCollection = async () => { throw new Error('native movement mismatch'); };
  await assert.rejects(main(['--check', '--book', data.book], data.services), /native movement mismatch/);
  assert.ok(data.closed.every(item => item.closed));
  assert.equal(fs.existsSync(data.out), false);
});

test('keyboard stop modes and SIGINT preserve raw mode and remove listeners', () => {
  const input = new EventEmitter(), events = new EventEmitter(), raw = [], controller = new AbortController();
  Object.assign(input, { isTTY: true, isRaw: false, isPaused: () => true,
    setRawMode: value => raw.push(value), resume() {}, pause() {} });
  const controls = installControls(controller, { input, events, log() {} });
  input.emit('data', 'p'); assert.equal(controls.shouldStop(), 'pair');
  input.emit('data', 'g'); assert.equal(controls.shouldStop(), 'game');
  events.emit('SIGINT'); assert.equal(controller.signal.aborted, true); assert.equal(controls.shouldStop(), 'now');
  input.emit('data', 'p'); assert.equal(controls.shouldStop(), 'now');
  controls.close(); assert.deepEqual(raw, [true, false]);
  assert.equal(events.listenerCount('SIGINT'), 0); assert.equal(input.listenerCount('data'), 0);
});

test('closing controls releases fresh or paused terminals and preserves existing consumers', () => {
  for (const initialFlow of [null, false, true]) {
    const input = new EventEmitter(), events = new EventEmitter(), raw = [];
    let pauses = 0;
    Object.assign(input, { isTTY: true, isRaw: true, readableFlowing: initialFlow,
      // Fresh stdin reports false here, although it has never been resumed.
      isPaused: () => input.readableFlowing === false,
      setRawMode(value) { input.isRaw = value; raw.push(value); },
      resume() { input.readableFlowing = true; },
      pause() { input.readableFlowing = false; pauses++; } });
    const existing = () => {};
    if (initialFlow === true) input.on('data', existing);
    const controls = installControls(new AbortController(), { input, events, log() {} });
    controls.close();
    assert.equal(pauses, initialFlow === true ? 0 : 1, `original flow ${initialFlow}`);
    assert.equal(input.readableFlowing, initialFlow === true);
    assert.deepEqual(raw, [true, true]);
    assert.equal(events.listenerCount('SIGINT'), 0);
    assert.deepEqual(input.listeners('data'), initialFlow === true ? [existing] : []);
  }
});

test('the command exits naturally after completion or failure while its input pipe stays open', async t => {
  const data = fixture(t);
  for (const fail of [false, true]) {
    const source = `
      const assert = require('node:assert/strict');
      const { main } = require(${JSON.stringify(require.resolve('../scripts/material-collect'))});
      assert.equal(process.stdin.readableFlowing, null);
      assert.equal(process.stdin.isPaused(), false);
      Object.defineProperty(process.stdin, 'isTTY', { value: true });
      process.stdin.setRawMode = () => {};
      main(['--out', ${JSON.stringify(data.out)}, '--book', ${JSON.stringify(data.book)}], {
        enginePath: process.execPath,
        createCollectionPlan: async () => ({ openings: [{}], schedule: [{}], book: { sha256: 'fixture' } }),
        runCollection: async () => {
          if (${fail}) throw new Error('fixture failure');
          return { finishedGames: 1, scheduledGames: 1 };
        },
        log() {},
      }).then(() => console.log('RETURNED'), error => {
        console.log('RETURNED'); console.error(error.message); process.exitCode = 1;
      });
    `;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', source], { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', errors = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
      const timer = setTimeout(() => {
        child.kill(); reject(new Error(`Command kept input active after returning: ${output} ${errors}`));
      }, 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        try {
          assert.equal(signal, null, errors);
          assert.equal(code, fail ? 1 : 0, errors);
          assert.match(output, /RETURNED/);
          resolve();
        } catch (error) { reject(error); }
      });
      // Keep the parent end open: EOF must not be what lets the child exit.
    });
  }
});
