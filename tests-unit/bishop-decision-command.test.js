const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, parseArgs } = require('../scripts/bishop-decision');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-decision-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const out = path.join(root, 'campaign'), revisions = path.join(root, 'old', 'games.jsonl');
  const plan = { id: 'bishop-decision-v16-001', totalGames: 1472 };
  const calls = []; let closed = 0;
  const services = { enginePath: process.execPath, log() {},
    createDecisionPlan: async options => { calls.push(['plan', options]); return plan; },
    installControls(controller) {
      calls.push(['controls', controller]);
      return { shouldStop: () => null, close() { closed++; } };
    },
    checkDecisionCampaign: async options => { calls.push(['check', options]); return { searchesStarted: 0 }; },
    runDecisionCampaign: async options => { calls.push(['run', options]); return { finishedGames: 1472 }; },
    readDecisionManifest: directory => { calls.push(['manifest', directory]); return { plan }; },
    writeDecisionCampaignReport: async directory => { calls.push(['report', directory]); return { files: { markdown: 'report.md' } }; },
  };
  return { out, revisions, plan, services, calls, closed: () => closed };
}

test('decision command accepts only bounded effort and frozen resume/report inputs', () => {
  assert.deepEqual(parseArgs(['--out', 'r', '--jobs', '4', '--revisions', 'old']), { out: 'r', jobs: 4, revisions: 'old' });
  assert.deepEqual(parseArgs(['--check', '--revisions', 'old']), { check: true, revisions: 'old' });
  assert.deepEqual(parseArgs(['--resume', 'r']), { resume: 'r' });
  for (const args of [[], ['--out', 'r', '--jobs', '3'], ['--check', '--jobs', '4'],
    ['--resume', 'r', '--jobs', '4'], ['--resume', 'r', '--revisions', 'old'],
    ['--report', 'r', '--revisions', 'old'], ['--out', 'r', '--nodes', '1'],
    ['--out', 'r', '--out', 's'], ['--check', '--out', 'r'], ['--check', '--book', 'b'],
    ['--out'], ['--help', '--check']]) assert.throws(() => parseArgs(args));
});

test('decision check supplies optional revisions and never starts collection or writes output', async t => {
  const f = fixture(t), result = await main(['--check', '--revisions', f.revisions], f.services);
  assert.equal(result.checked, true); assert.equal(result.searchesStarted, 0);
  assert.deepEqual(f.calls.map(call => call[0]), ['controls', 'plan', 'check']);
  assert.equal(f.calls[1][1].revisions, f.revisions);
  assert.equal(f.calls[2][1].plan, f.plan);
  assert.equal(fs.existsSync(f.out), false); assert.equal(f.closed(), 1);
});

test('decision command delegates the full campaign and four jobs', async t => {
  const f = fixture(t); await main(['--out', f.out, '--jobs', '4'], f.services);
  const request = f.calls.at(-1)[1];
  assert.equal(request.plan, f.plan); assert.equal(request.outDir, f.out);
  assert.equal(request.jobs, 4); assert.equal(request.resume, false); assert.equal(f.closed(), 1);
});

test('decision resume reads the frozen campaign without rereading an import', async t => {
  const f = fixture(t); await main(['--resume', f.out], f.services);
  assert.deepEqual(f.calls.map(call => call[0]), ['controls', 'manifest', 'run']);
  assert.equal(f.calls.at(-1)[1].resume, true); assert.equal(f.closed(), 1);
});

test('offline decision reporting and help never select engines or attach controls', async t => {
  const f = fixture(t);
  const forbidden = () => { throw new Error('offline path selected a native engine or controls'); };
  await main(['--report', f.out], { log() {}, selectedEnginePath: forbidden, installControls: forbidden,
    writeDecisionCampaignReport: f.services.writeDecisionCampaignReport });
  assert.deepEqual(f.calls.map(call => call[0]), ['report']);
  assert.deepEqual(await main(['--help'], { log() {}, selectedEnginePath: forbidden, installControls: forbidden }), { help: true });
});

test('decision failures and cancellation always close terminal controls', async t => {
  const f = fixture(t);
  f.services.runDecisionCampaign = async () => { throw new Error('source mismatch'); };
  await assert.rejects(main(['--out', f.out], f.services), /source mismatch/);
  assert.equal(f.closed(), 1);
  f.services.installControls = () => ({ shouldStop: () => null, close() { f.calls.push(['closed']); } });
  f.services.checkDecisionCampaign = async () => {
    const error = new Error('cancelled'); error.name = 'AbortError'; throw error;
  };
  // An unrelated AbortError must remain visible; only requested cancellation is handled.
  await assert.rejects(main(['--check'], f.services), /cancelled/);
  assert.equal(f.calls.at(-1)[0], 'closed');
});

test('decision requested cancellation returns stopped and releases controls', async t => {
  const f = fixture(t); let controller;
  f.services.installControls = value => { controller = value; return { shouldStop: () => null, close() { f.calls.push(['closed']); } }; };
  f.services.checkDecisionCampaign = async ({ signal }) => {
    assert.equal(signal, controller.signal); controller.abort();
    const error = new Error('cancelled'); error.name = 'AbortError'; throw error;
  };
  assert.deepEqual(await main(['--check'], f.services), { stopped: true });
  assert.equal(f.calls.at(-1)[0], 'closed');
});
