const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { checkDecisionCampaign, runDecisionCampaign, readDecisionManifest,
  writeDecisionCampaignReport, printDecisionScores } = require('../scripts/balance/bishop-decision-run');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(t, { emptyRestore = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-decision-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outDir = path.join(root, 'campaign'), source = path.join(root, 'source.games.jsonl');
  const bytes = Buffer.from('{"retained":"exact bytes"}\n'); fs.writeFileSync(source, bytes);
  const stage = (key, count, checkpoints) => ({ key, plan: { key, schemaVersion: 1,
    schedule: Array.from({ length: count }, (_, index) => ({ id: `${key}-${index}` })), study: { checkpoints } } });
  const plan = { id: 'bishop-decision-v16-001', schemaVersion: 1,
    stages: [stage('restore', emptyRestore ? 0 : 2, emptyRestore ? [] : [2]), stage('compare', 8, [2, 4, 8])],
    sourceEvidence: [{ name: 'source.games.jsonl', file: source, sha256: sha(bytes) }],
    restoredRecords: [{ id: 'inherited-revision' }], inheritedBishopRecords: [{ id: 'inherited-bishop' }],
    totalGames: emptyRestore ? 8 : 10 };
  const identity = { engineSha256: 'engine', rulesBundleSha256: 'rules', collectorSha256: 'collector' };
  const calls = [], native = { restore: { searchesStarted: 0, probe: 'old' }, compare: { searchesStarted: 0, probe: 'new' } };
  const proof = { sources: ['revisions', 'bishops'], searchesStarted: 0 };
  const options = { plan, outDir, enginePath: process.execPath, validatePlan() {}, validateStage() {},
    getIdentity: () => identity,
    validateEvidence() { calls.push(['evidence']); },
    validateSourceHistories: async () => { calls.push(['source']); return proof; },
    preflight: async ({ plan: selected }) => {
      calls.push(['native', selected.key]);
      assert.equal(fs.existsSync(outDir), false, 'new output must wait until all native checks finish');
      return native[selected.key];
    },
    readStageManifest: directory => JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8')),
    runCollectionService: async request => {
      calls.push(['run', request]);
      const stageIdentity = await request.getIdentity(), stageNative = await request.preflight();
      fs.mkdirSync(request.outDir, { recursive: true });
      const manifest = { plan: request.plan, identity: stageIdentity, native: stageNative };
      fs.writeFileSync(path.join(request.outDir, 'run.json'), JSON.stringify(manifest));
      return { manifest, finishedGames: request.untilGames, checkpointReached: true };
    },
    reportService: async (directory, request) => {
      calls.push(['report', request]);
      return { report: { matchups: [] }, files: { markdown: path.join(directory, 'report.md') } };
    },
  };
  const resumeOptions = () => ({ ...options, resume: true, preflight: async ({ plan: selected }) => {
    calls.push(['native', selected.key]); return native[selected.key];
  } });
  return { root, outDir, source, bytes, plan, identity, proof, calls, native, options, resumeOptions };
}

test('check validates inherited histories and every nonempty stage without output or games', async t => {
  const f = fixture(t), result = await checkDecisionCampaign(f.options);
  assert.equal(result.searchesStarted, 0); assert.deepEqual(result.sourceReplay, f.proof);
  assert.deepEqual(f.calls.map(call => call.slice(0, 2)), [['evidence'], ['source'], ['native', 'restore'], ['native', 'compare']]);
  assert.equal(fs.existsSync(f.outDir), false);
});

test('any source or native preflight failure leaves the new output absent', async t => {
  const f = fixture(t);
  await assert.rejects(runDecisionCampaign({ ...f.options, validateSourceHistories: async () => { throw new Error('illegal inherited move'); } }), /illegal inherited move/);
  assert.equal(fs.existsSync(f.outDir), false);
  await assert.rejects(runDecisionCampaign({ ...f.options, preflight: async ({ plan }) => {
    if (plan.key === 'compare') throw new Error('unsupported lame knight'); return f.native.restore;
  } }), /unsupported lame knight/);
  assert.equal(fs.existsSync(f.outDir), false);
  await assert.rejects(checkDecisionCampaign({ ...f.options, preflight: async () => ({ searchesStarted: 1 }) }), /zero searches/);
});

test('campaign freezes source bytes and proof, reports each barrier, and closes at the cap', async t => {
  const f = fixture(t), result = await runDecisionCampaign(f.options);
  assert.equal(result.finishedGames, 10); assert.equal(result.stopped, false);
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'evidence', 'source.games.jsonl')), f.bytes);
  assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  const saved = readDecisionManifest(f.outDir, { validatePlan() {} });
  assert.deepEqual(saved.sourceReplay, f.proof); assert.deepEqual(saved.identity, f.identity);
  const runs = f.calls.filter(call => call[0] === 'run').map(call => call[1]);
  assert.deepEqual(runs.map(request => [request.plan.key, request.untilGames, request.resume]),
    [['restore', 2, false], ['compare', 2, false], ['compare', 4, true], ['compare', 8, true]]);
  assert.deepEqual(f.calls.filter(call => call[0] === 'report').map(call => call[1].checkpoint),
    [{ stage: 'restore', count: 2 }, { stage: 'compare', count: 2 }, { stage: 'compare', count: 4 }, { stage: 'compare', count: 8 }]);
  assert.equal(f.calls.findIndex(call => call[0] === 'run'), 4);
});

test('an empty restoration creates no restoration folder and starts no historical engine', async t => {
  const f = fixture(t, { emptyRestore: true }), result = await runDecisionCampaign(f.options);
  assert.equal(result.finishedGames, 8); assert.equal(fs.existsSync(path.join(f.outDir, 'restore')), false);
  assert.deepEqual(f.calls.filter(call => call[0] === 'native').map(call => call[1]), ['compare']);
});

for (const stop of ['game', 'pair']) test(`${stop} stop writes a provisional report and never advances stages`, async t => {
  const f = fixture(t); let requested = null;
  const run = f.options.runCollectionService;
  const result = await runDecisionCampaign({ ...f.options, shouldStop: () => requested,
    runCollectionService: async request => { const result = await run(request); requested = stop; return result; } });
  assert.equal(result.stopped, true); assert.equal(result.finishedGames, 2);
  assert.equal(f.calls.filter(call => call[0] === 'run').length, 1);
  assert.equal(f.calls.find(call => call[0] === 'report')[1].checkpoint, undefined);
  assert.equal(fs.existsSync(path.join(f.outDir, 'compare')), false);
});

test('a stop received during checkpoint reporting saves the provisional view before returning', async t => {
  const f = fixture(t), report = f.options.reportService; let requested = null;
  const result = await runDecisionCampaign({ ...f.options, shouldStop: () => requested,
    reportService: async (directory, options) => {
      const value = await report(directory, options); requested = 'pair'; return value;
    } });
  assert.equal(result.finishedGames, 2); assert.equal(result.stopped, true);
  assert.deepEqual(f.calls.filter(call => call[0] === 'report').map(call => call[1].checkpoint),
    [{ stage: 'restore', count: 2 }, undefined]);
  assert.equal(fs.existsSync(path.join(f.outDir, 'compare')), false);
});

test('immediate stop preserves the collection result without starting a report or next stage', async t => {
  const f = fixture(t), controller = new AbortController(), run = f.options.runCollectionService;
  const result = await runDecisionCampaign({ ...f.options, signal: controller.signal,
    runCollectionService: async request => { const result = await run(request); controller.abort(); return result; } });
  assert.equal(result.stopped, true); assert.equal(result.finishedGames, 2);
  assert.equal(f.calls.filter(call => call[0] === 'run').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'report').length, 0);
});

test('cancellation before a collection response counts finalized durable rows and ignores a torn tail', async t => {
  const f = fixture(t), controller = new AbortController(), run = f.options.runCollectionService;
  const result = await runDecisionCampaign({ ...f.options, signal: controller.signal,
    runCollectionService: async request => {
      await run(request);
      fs.writeFileSync(path.join(request.outDir, 'games.jsonl'),
        '{"id":"restore-0","status":"aborted"}\n{"id":"restore-0","status":"completed"}\n{"id":"restore-1","status":"truncated"}\n{"id":');
      controller.abort(); const error = new Error('cancelled'); error.name = 'AbortError'; throw error;
    } });
  assert.equal(result.stopped, true); assert.equal(result.finishedGames, 2);
  assert.equal(f.calls.filter(call => call[0] === 'report').length, 0);
});

test('one campaign owner is held across checkpoint analysis and standalone reporting', async t => {
  const f = fixture(t), report = f.options.reportService;
  let inspected = false;
  await runDecisionCampaign({ ...f.options, reportService: async (directory, options) => {
    if (!inspected) {
      inspected = true;
      await assert.rejects(runDecisionCampaign(f.resumeOptions()), /locked by process/);
      await assert.rejects(writeDecisionCampaignReport(directory, { validatePlan() {}, validateEvidence() {}, reportService: report }), /locked by process/);
    }
    return report(directory, options);
  } });
  assert.equal(inspected, true);
  await writeDecisionCampaignReport(f.outDir, { validatePlan() {}, validateEvidence() {}, reportService: report });
});

test('resume retains the original campaign and stage identities and needs only frozen source snapshots', async t => {
  const f = fixture(t); await runDecisionCampaign(f.options);
  const campaign = fs.readFileSync(path.join(f.outDir, 'campaign.json'));
  fs.unlinkSync(f.source); f.calls.length = 0;
  await runDecisionCampaign(f.resumeOptions());
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, 'campaign.json')), campaign);
  assert.deepEqual(f.calls.filter(call => call[0] === 'native').map(call => call[1]), ['restore', 'compare']);
  assert.ok(f.calls.filter(call => call[0] === 'run').every(call => call[1].resume));
});

test('resume rejects changed campaign, source snapshots, native proof and stage identities before games', async t => {
  const f = fixture(t); await runDecisionCampaign(f.options);
  f.calls.length = 0;
  await assert.rejects(runDecisionCampaign({ ...f.resumeOptions(), getIdentity: () => ({ ...f.identity, engineSha256: 'changed' }) }), /sources, rules or executable changed/);
  await assert.rejects(runDecisionCampaign({ ...f.resumeOptions(), preflight: async () => ({ searchesStarted: 0, changed: true }) }), /native decision diagnostics changed/);
  await assert.rejects(runDecisionCampaign({ ...f.resumeOptions(), validateSourceHistories: async () => ({ changed: true }) }), /source replay proof changed/);
  const file = path.join(f.outDir, 'restore', 'run.json'), saved = JSON.parse(fs.readFileSync(file));
  fs.writeFileSync(file, JSON.stringify({ ...saved, identity: { changed: true } }));
  await assert.rejects(runDecisionCampaign(f.resumeOptions()), /restore stage identity differs/);
  fs.writeFileSync(file, JSON.stringify(saved));
  fs.writeFileSync(path.join(f.outDir, 'evidence', 'source.games.jsonl'), 'changed');
  await assert.rejects(runDecisionCampaign(f.resumeOptions()), /evidence checksum differs/);
  assert.equal(f.calls.filter(call => call[0] === 'run').length, 0);
});

test('a source identity change between checkpoints prevents later engine games', async t => {
  const f = fixture(t), report = f.options.reportService;
  await assert.rejects(runDecisionCampaign({ ...f.options, reportService: async (directory, options) => {
    const value = await report(directory, options); f.identity.collectorSha256 = 'changed'; return value;
  } }), /changed between checkpoints/);
  assert.equal(f.calls.filter(call => call[0] === 'run').length, 2);
});

test('score output leads with all candidate/reference point scores and omits histories', () => {
  const lines = [];
  printDecisionScores({ matchups: [{ designA: 'bishop', label: 'Short side', movement: 'BsWsN',
    reference: 'RfB', score: 0.625, games: 256, moves: ['secret'] }] }, line => lines.push(line));
  assert.match(lines[0], /Short side.*RfB 62\.50%.*256\/256 paired games/);
  assert.doesNotMatch(lines[0], /secret|moves|plies/);
});
