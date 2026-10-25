const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runStudy, validateStudyPlan } = require('../scripts/balance/material-study-run');
const { getStudyProtocol } = require('../scripts/balance/material-study-plan');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-study-orchestrate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const library = structuredClone(getStudyProtocol()), schedule = [], units = [], openings = [];
  for (let i = 0; i < 384; i++) {
    const opening = `o${i}`; openings.push({ id: opening });
    for (const [kind, colors] of [['ordinary', ['w']], ['amazon', ['w', 'b']]]) {
      const unitId = `${opening}-${kind}`, gameIds = [];
      for (const aColor of colors) {
        const id = `${unitId}-${aColor}`; gameIds.push(id);
        schedule.push({ id, unitId, kind, aColor, openingId: opening, startFen: 'fixture', comparisonId: kind, openingMoves: [] });
      }
      units.push({ id: unitId, kind, gameIds });
    }
  }
  const plan = { ...library, id: library.protocol.id, totalGames: 1152, openings, schedule, units };
  const calls = [], outDir = path.join(root, 'run'), native = { searchesStarted: 0 };
  const manifest = { plan, native };
  const services = { plan, outDir, enginePath: process.execPath, onProgress() {},
    runCollectionService: async options => {
      calls.push(['run', options]); fs.mkdirSync(outDir, { recursive: true });
      return { manifest, checkpointReached: true, finishedGames: options.untilGames, scheduledGames: 1152, records: [] };
    },
    reportService: async (directory, options) => { calls.push(['report', options]); return {
      report: { analysis: { primary: { combined: { normalized: { values: { rook: 4, knight: 3, bishop: 3, 'bonus:queen.purple@1': 3 } } } } } },
      files: { markdown: 'report.md' } }; },
  };
  return { root, outDir, plan, services, calls, native };
}
const leases = root => fs.readdirSync(root).filter(file => file.endsWith('.lock'));

test('study barriers use one full plan, four jobs and one native preflight per invocation', async t => {
  const f = fixture(t); validateStudyPlan(f.plan);
  const result = await runStudy(f.services);
  assert.equal(result.finishedGames, 1152); assert.equal(result.stopped, false);
  assert.deepEqual(f.calls.map(call => call[0]), ['run', 'report', 'run', 'report', 'run', 'report']);
  const runs = f.calls.filter(call => call[0] === 'run').map(call => call[1]);
  assert.deepEqual(runs.map(options => options.untilGames), [384, 768, 1152]);
  assert.deepEqual(runs.map(options => options.resume), [false, true, true]);
  assert.ok(runs.every(options => options.plan === f.plan && options.jobs === 4));
  assert.equal(runs[0].preflight, undefined); assert.equal(await runs[1].preflight(), f.native);
  assert.deepEqual(leases(f.root), []);
});

test('a game stop writes a provisional report without starting the next checkpoint', async t => {
  const f = fixture(t);
  f.services.runCollectionService = async options => { f.calls.push(['run', options]); return {
    manifest: { native: f.native }, checkpointReached: false, finishedGames: 27, records: [] }; };
  const result = await runStudy(f.services);
  assert.equal(result.stopped, true); assert.equal(result.finishedGames, 27);
  assert.deepEqual(f.calls.map(call => call[0]), ['run', 'report']);
  assert.equal(f.calls[1][1].checkpoint, undefined); assert.deepEqual(leases(f.root), []);
});

test('a stop requested during checkpoint analysis never starts later games', async t => {
  const f = fixture(t); let stop = null;
  f.services.shouldStop = () => stop;
  const report = f.services.reportService;
  f.services.reportService = async (...args) => { stop = 'game'; return report(...args); };
  const result = await runStudy(f.services);
  assert.equal(result.finishedGames, 384); assert.equal(result.stopped, true);
  assert.equal(f.calls.filter(call => call[0] === 'run').length, 1);
  assert.deepEqual(f.calls.filter(call => call[0] === 'report').map(call => call[1].checkpoint), [384, undefined]);
  assert.deepEqual(leases(f.root), []);
});

test('resume retains frozen workers while source/game failures release the study lease', async t => {
  const f = fixture(t);
  await runStudy({ ...f.services, resume: true });
  assert.equal(f.calls.find(call => call[0] === 'run')[1].resume, true);
  await assert.rejects(runStudy({ ...f.services, runCollectionService: async () => { throw new Error('changed identity'); } }), /changed identity/);
  assert.deepEqual(leases(f.root), []);
  assert.equal(f.calls.filter(call => call[0] === 'report').length, 3, 'fatal failures do not rewrite reports');
});

test('one study owner holds its lease through analysis and concurrent starts fail safely', async t => {
  const f = fixture(t); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = runStudy({ ...f.services, reportService: async () => {
    entered(); await gate; throw new Error('fixture report stopped');
  } });
  await waiting;
  await assert.rejects(runStudy(f.services), /locked by process/);
  release(); await assert.rejects(first, /fixture report stopped/);
  assert.deepEqual(leases(f.root), []);
});

test('changed study settings fail before directories or leases are written', async t => {
  const f = fixture(t); f.plan.study.jobs = 3;
  await assert.rejects(runStudy(f.services), /four workers|fixed/);
  assert.equal(fs.existsSync(f.outDir), false); assert.deepEqual(leases(f.root), []);
});
