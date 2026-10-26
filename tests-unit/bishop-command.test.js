const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, parseArgs } = require('../scripts/bishop-references');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-bishop-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const book = path.join(root, 'book.epd'); fs.writeFileSync(book, 'book bytes');
  const plan = { id: 'bishop-references-v16-001', study: { jobs: 4 }, openings: Array.from({ length: 128 }, () => ({})),
    schedule: Array.from({ length: 1280 }, () => ({})), parent: { scheduledGames: 2688 } };
  const calls = [], out = path.join(root, 'run'); let closed = 0;
  const services = { enginePath: process.execPath, log() {},
    createBishopPlan: async () => { calls.push(['plan']); return plan; },
    installControls() { return { shouldStop: () => null, close() { closed++; } }; },
    checkBishopCollection: async options => { calls.push(['check', options]); return { startingPositions: 1280, searchesStarted: 0 }; },
    runBishopStudy: async options => { calls.push(['run', options]); return { finishedGames: 1280 }; },
    readBishopManifest: directory => { calls.push(['manifest', directory]); return { plan }; },
    writeBishopReport: async (directory, options) => { calls.push(['report', directory, options]); return { files: { markdown: 'report.md' } }; },
  };
  return { root, book, out, plan, services, calls, closed: () => closed };
}

test('study command fixes four jobs and rejects changed effort or resume inputs', () => {
  assert.deepEqual(parseArgs(['--out', 'r', '--jobs', '4']), { out: 'r', jobs: 4 });
  assert.deepEqual(parseArgs(['--resume', 'r']), { resume: 'r' });
  for (const args of [[], ['--check', '--book', 'b'], ['--out', 'r', '--parent', 'b'], ['--out', 'r', '--jobs', '3'],
    ['--check', '--jobs', '4'], ['--resume', 'r', '--book', 'b'], ['--resume', 'r', '--jobs', '4'],
    ['--report', 'r', '--jobs', '4'], ['--out', 'r', '--nodes', '1'],
    ['--out', 'r', '--out', 'x'], ['--out', 'r', '--resume', 'r']]) assert.throws(() => parseArgs(args));
});

test('study preflight never runs a game or creates an output directory', async t => {
  const f = fixture(t); const result = await main(['--check'], f.services);
  assert.equal(result.checked, true); assert.equal(result.searchesStarted, 0);
  assert.deepEqual(f.calls.map(call => call[0]), ['plan', 'check']);
  assert.equal(fs.existsSync(f.out), false); assert.equal(f.closed(), 1);
});

test('new study delegates one full fixed plan and keeps staged orchestration in the runner', async t => {
  const f = fixture(t); await main(['--out', f.out, '--jobs', '4'], f.services);
  assert.deepEqual(f.calls.map(call => call[0]), ['plan', 'run']);
  const request = f.calls.at(-1)[1]; assert.equal(request.plan, f.plan);
  assert.equal(request.resume, false); assert.equal(request.outDir, f.out); assert.equal(f.closed(), 1);
});

test('study resume reads the frozen plan without an external book', async t => {
  const f = fixture(t); fs.unlinkSync(f.book);
  await main(['--resume', f.out], f.services);
  assert.deepEqual(f.calls.map(call => call[0]), ['manifest', 'run']);
  assert.equal(f.calls.at(-1)[1].resume, true); assert.equal(f.closed(), 1);
});

test('offline study report and help never require an engine', async t => {
  const f = fixture(t);
  await main(['--report', f.out], { log() {}, writeBishopReport: f.services.writeBishopReport, installControls: f.services.installControls });
  assert.deepEqual(f.calls.map(call => call[0]), ['report']);
  assert.deepEqual(await main(['--help'], { log() {} }), { help: true });
});

test('study errors release keyboard controls', async t => {
  const f = fixture(t); f.services.runBishopStudy = async () => { throw new Error('source mismatch'); };
  await assert.rejects(main(['--out', f.out], f.services), /source mismatch/);
  assert.equal(f.closed(), 1);
});

test('offline analysis cancellation closes controls and returns without an engine', async t => {
  const f = fixture(t); let controller;
  const services = { log() {},
    installControls(value) {
      controller = value;
      return f.services.installControls(value);
    },
    writeBishopReport: async (directory, options) => {
      assert.equal(options.signal, controller.signal);
      controller.abort();
      const error = new Error('Report cancelled'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
    },
  };
  assert.deepEqual(await main(['--report', f.out], services), { stopped: true });
  assert.equal(f.closed(), 1);
});
