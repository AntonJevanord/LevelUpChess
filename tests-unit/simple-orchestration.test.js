const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSimpleStudy, printEstimate } = require('../scripts/balance/simple-run');
const { validateSimplePlan } = require('../scripts/balance/simple-plan');
const { getPlan } = require('./simple-fixture');
let frozenPlan;
test.before(async () => { frozenPlan = await getPlan(); });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-simple-orchestrate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plan = structuredClone(frozenPlan);
  const calls = [], outDir = path.join(root, 'run'), native = { searchesStarted: 0 };
  const manifest = { plan, native };
  const services = { plan, outDir, enginePath: process.execPath, onProgress() {},
    runCollectionService: async options => {
      calls.push(['run', options]); fs.mkdirSync(outDir, { recursive: true });
      return { manifest, checkpointReached: true, finishedGames: options.untilGames, scheduledGames: 3072, records: [] };
    },
    reportService: async (directory, options) => { calls.push(['report', options]); return {
      report: { analysis: { primary: { combined: { normalized: { values: { rook: 4, knight: 3, bishop: 3, 'bonus:queen.purple@1': 3 } } } } } },
      files: { markdown: 'report.md' } }; },
  };
  return { root, outDir, plan, services, calls, native };
}
const leases = root => fs.readdirSync(root).filter(file => file.endsWith('.lock'));

test('study barriers use one full plan, four jobs and one native preflight per invocation', async t => {
  const f = fixture(t); validateSimplePlan(f.plan);
  const result = await runSimpleStudy(f.services);
  assert.equal(result.finishedGames, 3072); assert.equal(result.stopped, false);
  assert.deepEqual(f.calls.map(call => call[0]), ['run', 'report', 'run', 'report', 'run', 'report']);
  const runs = f.calls.filter(call => call[0] === 'run').map(call => call[1]);
  assert.deepEqual(runs.map(options => options.untilGames), [768, 1536, 3072]);
  assert.deepEqual(runs.map(options => options.resume), [false, true, true]);
  assert.ok(runs.every(options => options.plan === f.plan && options.jobs === 4));
  assert.equal(runs[0].preflight, undefined); assert.equal(await runs[1].preflight(), f.native);
  assert.deepEqual(leases(f.root), []);
});

test('a game stop writes a provisional report without starting the next checkpoint', async t => {
  const f = fixture(t);
  f.services.runCollectionService = async options => { f.calls.push(['run', options]); return {
    manifest: { native: f.native }, checkpointReached: false, finishedGames: 27, records: [] }; };
  const result = await runSimpleStudy(f.services);
  assert.equal(result.stopped, true); assert.equal(result.finishedGames, 27);
  assert.deepEqual(f.calls.map(call => call[0]), ['run', 'report']);
  assert.equal(f.calls[1][1].checkpoint, undefined); assert.deepEqual(leases(f.root), []);
});

test('a stop requested during checkpoint analysis never starts later games', async t => {
  const f = fixture(t); let stop = null;
  f.services.shouldStop = () => stop;
  const report = f.services.reportService;
  f.services.reportService = async (...args) => { stop = 'game'; return report(...args); };
  const result = await runSimpleStudy(f.services);
  assert.equal(result.finishedGames, 768); assert.equal(result.stopped, true);
  assert.equal(f.calls.filter(call => call[0] === 'run').length, 1);
  assert.deepEqual(f.calls.filter(call => call[0] === 'report').map(call => call[1].checkpoint), [768]);
  assert.deepEqual(leases(f.root), []);
});

test('resume retains frozen workers while source/game failures release the study lease', async t => {
  const f = fixture(t);
  await runSimpleStudy({ ...f.services, resume: true });
  assert.equal(f.calls.find(call => call[0] === 'run')[1].resume, true);
  await assert.rejects(runSimpleStudy({ ...f.services, runCollectionService: async () => { throw new Error('changed identity'); } }), /changed identity/);
  assert.deepEqual(leases(f.root), []);
  assert.equal(f.calls.filter(call => call[0] === 'report').length, 3, 'fatal failures do not rewrite reports');
});

test('one study owner holds its lease through analysis and concurrent starts fail safely', async t => {
  const f = fixture(t); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = runSimpleStudy({ ...f.services, reportService: async () => {
    entered(); await gate; throw new Error('fixture report stopped');
  } });
  await waiting;
  await assert.rejects(runSimpleStudy(f.services), /locked by process/);
  release(); await assert.rejects(first, /fixture report stopped/);
  assert.deepEqual(leases(f.root), []);
});

test('changed study settings fail before directories or leases are written', async t => {
  const f = fixture(t); f.plan.study.jobs = 3;
  await assert.rejects(runSimpleStudy(f.services), /four|frozen|protocol|metadata|settings|plan|study/);
  assert.equal(fs.existsSync(f.outDir), false); assert.deepEqual(leases(f.root), []);
});


test('immediate stop preserves histories and skips heavy reporting', async t => {
  const f = fixture(t), controller = new AbortController();
  f.services.signal = controller.signal;
  f.services.runCollectionService = async options => {
    f.calls.push(['run', options]); controller.abort();
    return { manifest: { native: f.native }, finishedGames: 11, checkpointReached: false };
  };
  const result = await runSimpleStudy(f.services);
  assert.equal(result.stopped, true); assert.equal(result.finishedGames, 11);
  assert.deepEqual(f.calls.map(call => call[0]), ['run']);
  assert.deepEqual(leases(f.root), []);
});

test('Ctrl+C during analysis releases ownership without starting further games', async t => {
  const f = fixture(t), controller = new AbortController();
  f.services.signal = controller.signal;
  f.services.reportService = async (directory, options) => {
    assert.equal(options.signal, controller.signal); controller.abort();
    const error = new Error('Analysis stopped'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error;
  };
  const result = await runSimpleStudy(f.services);
  assert.equal(result.finishedGames, 768); assert.equal(result.stopped, true);
  assert.equal(f.calls.filter(call => call[0] === 'run').length, 1);
  assert.deepEqual(leases(f.root), []);
});

test('checkpoint console prints ordinary estimates, assumed anchors and queen-minus-rook range', () => {
  const lines = [];
  printEstimate({ currentEstimate: {
    pawn: { value: 1, assumed: true }, knight: { value: 3.12, supported: true },
    bishop: { value: 3.25, supported: true }, rook: { value: 4.78, supported: true },
    queen: { value: 9, assumed: true }, 'bonus:rook.purple@9': { value: 4.2, supported: true },
  }, currentQueenRookGap: { value: 4.22, supported: true, interval: { lower: 3.8, upper: 4.6 } } },
  { roster: [{ id: 'rook.purple@9', label: 'Queen-movement rook', role: 'candidate' }] }, line => lines.push(line));
  assert.match(lines[0], /Pawn 1\.00 \(assumed\).*Knight 3\.12.*Bishop 3\.25.*Rook 4\.78.*Queen 9\.00 \(assumed\)/);
  assert.match(lines[1], /Queen minus rook: 4\.22; conditional 95% range 3\.80–4\.60/);
  assert.match(lines[1], /Royal king has no material estimate/);
  assert.match(lines[2], /Queen-movement rook 4\.20/);
});

test('console keeps unsupported ordinary values and upgrade bonuses unavailable', () => {
  const lines = [];
  printEstimate({ currentEstimate: { pawn: { value: 1, assumed: true }, queen: { value: 9, assumed: true },
    rook: { value: null, supported: false } }, currentQueenRookGap: { value: null, supported: false } },
  { roster: [{ id: 'bishop.purple@10', label: 'Rank bishop', role: 'candidate' }] }, line => lines.push(line));
  assert.match(lines[0], /Knight unavailable.*Bishop unavailable.*Rook unavailable/);
  assert.match(lines[1], /Queen minus rook: unavailable/);
  assert.match(lines[2], /Rank bishop unavailable/);
  assert.ok(lines.every(line => !/NaN|undefined|Royal king 0/.test(line)));
});
