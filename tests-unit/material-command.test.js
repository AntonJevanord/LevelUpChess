const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { isDeepStrictEqual } = require('node:util');
const { parseArgs, main, installControls, checkReferenceValues, checkCampaign, printLiveEstimate } = require('../scripts/material-balance');
const { getCampaign } = require('../scripts/balance/material-plan');
const { UciEngine } = require('../scripts/balance/uci');

const clone = value => structuredClone(value);
const identity = () => ({ engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64),
  runnerSha256: 'c'.repeat(64), runnerSources: [{ file: 'run.js', sha256: 'd'.repeat(64) }] });
const references = () => ({ version: 1, pieces: { R: { rawMg: 1276, rawEg: 1380 } } });
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-material-command-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function fixture(t) {
  const base = temporary(t), root = path.join(base, 'run'), source = getCampaign();
  const calls = [], reportWrites = [], referenceCalls = [], closed = [];
  const file = (directory, filename) => path.join(directory, filename);
  const read = (directory, filename) => JSON.parse(fs.readFileSync(file(directory, filename), 'utf8'));
  const api = {
    MANIFEST: 'material-campaign.json',
    createCampaignManifest(jobs, current, referenceValues) { return { jobs, identity: current, referenceValues }; },
    readCampaignDirectory(directory) {
      const campaign = read(directory, api.MANIFEST), runs = {};
      for (const stage of source.stages) {
        const filename = file(path.join(directory, stage.directory), 'run.json');
        if (fs.existsSync(filename)) runs[stage.id] = { manifest: JSON.parse(fs.readFileSync(filename, 'utf8')), records: [] };
      }
      return { root: directory, campaign, runs };
    },
    verifyCurrentIdentity(campaign, current) {
      if (!isDeepStrictEqual(campaign.identity, current)) throw new Error('Frozen engine or source identity changed.');
    },
    makeMaterialReport(campaign, runs) {
      return { stages: Object.fromEntries(source.stages.map(stage => [stage.id, { finished: Boolean(runs[stage.id]?.manifest.finished) }])) };
    },
    writeMaterialReport(directory) {
      reportWrites.push(directory);
      const { campaign, runs } = api.readCampaignDirectory(directory);
      return { report: api.makeMaterialReport(campaign, runs), files: { markdown: path.join(directory, 'material-report.md') } };
    },
  };
  const services = {
    enginePath: process.execPath, getIdentity: identity, getCampaign: () => source, report: api,
    checkReferenceValues: async executable => {
      referenceCalls.push(executable);
      assert.equal(fs.existsSync(path.join(root, api.MANIFEST)), false, 'reference tables checked before parent declaration');
      return references();
    },
    installControls(controller) {
      const item = { controller, closed: false, stop: null };
      closed.push(item);
      return { shouldStop: () => item.stop, close() { item.closed = true; } };
    },
    runParallel: async options => {
      calls.push(options);
      fs.mkdirSync(options.outDir, { recursive: true });
      const filename = file(options.outDir, 'run.json');
      if (!options.resume) fs.writeFileSync(filename, JSON.stringify({ finished: false, fixture: true }) + '\n');
      return { stopped: true, nextIndex: 0, scheduledGames: options.schedule.length };
    },
  };
  const finish = id => {
    const stage = source.stages.find(stage => stage.id === id), directory = path.join(root, stage.directory);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file(directory, 'run.json'), JSON.stringify({ finished: true, fixture: true }) + '\n');
  };
  return { root, base, source, calls, closed, reportWrites, referenceCalls, services, api, finish, read };
}

test('material CLI requires explicit valid stages and freezes jobs after initial control', () => {
  assert.deepEqual(parseArgs(['--check']), { check: true });
  assert.deepEqual(parseArgs(['--out', 'r', '--stage', 'control', '--jobs', '3']), { out: 'r', stage: 'control', jobs: 3 });
  assert.deepEqual(parseArgs(['--out', 'r', '--stage', '2', '--log', 'plies']), { out: 'r', stage: '2', log: 'plies' });
  assert.deepEqual(parseArgs(['--resume', 'r']), { resume: 'r' });
  assert.deepEqual(parseArgs(['--resume', 'r', '--stage', 'control']), { resume: 'r', stage: 'control' });
  for (const args of [[], ['--out', 'r'], ['--stage', '1'], ['--out', 'r', '--stage', '0'],
    ['--out', 'r', '--stage', '4'], ['--out', 'r', '--stage', '1', '--jobs', '3'],
    ['--out', 'r', '--stage', 'control', '--jobs', '17'], ['--out', 'r', '--stage', 'control', '--jobs', '2.5'],
    ['--resume', 'r', '--jobs', '3'], ['--report', 'r', '--stage', '1'], ['--report', 'r', '--log', 'games'],
    ['--resume', 'r', '--out', 'r'], ['--check', '--jobs', '3'], ['--out', 'r', '--stage', 'control', '--limit-pairs', '1'],
    ['--out', 'r', '--out', 'x', '--stage', 'control']]) assert.throws(() => parseArgs(args), args.join(' '));
});

test('control startup inventories reference tables before files and launches only its frozen subset', async t => {
  const data = fixture(t);
  const result = await main(['--out', data.root, '--stage', 'control', '--jobs', '3'], data.services);
  assert.equal(result.stopped, true); assert.equal(result.stage, 'control');
  assert.deepEqual(data.referenceCalls, [process.execPath]); assert.equal(data.calls.length, 1);
  const call = data.calls[0];
  assert.deepEqual(call.config, data.source.config);
  assert.deepEqual(call.schedule, data.source.stages[0].schedule); assert.equal(call.schedule.length, 256);
  assert.equal(call.outDir, path.join(data.root, 'control')); assert.equal(call.jobs, 3); assert.equal(call.resume, false);
  assert.equal(call.log, 'games'); assert.equal(call.shouldStop(), null);
  assert.equal(data.read(data.root, data.api.MANIFEST).jobs, 3);
  assert.deepEqual(data.read(data.root, data.api.MANIFEST).referenceValues, references());
  assert.ok(data.closed.every(item => item.closed)); assert.equal(data.reportWrites.length, 1);
  assert.equal(fs.existsSync(path.join(data.root, 'amazon-stage-1')), false);
});

test('old or inconsistent engine rejection and nonempty directories cannot spend games or create declarations', async t => {
  const data = fixture(t);
  data.services.checkReferenceValues = async () => { throw new Error('Reference-value preflight failed.'); };
  await assert.rejects(main(['--out', data.root, '--stage', 'control'], data.services), /Reference-value/);
  assert.equal(fs.existsSync(data.root), false); assert.equal(data.calls.length, 0);
  fs.mkdirSync(data.root); fs.writeFileSync(path.join(data.root, 'unrelated.txt'), 'keep');
  await assert.rejects(main(['--out', data.root, '--stage', 'control'], data.services), /new empty directory/);
  assert.deepEqual(fs.readdirSync(data.root), ['unrelated.txt']);
  await assert.rejects(main(['--out', path.join(data.base, 'other'), '--stage', '1'], data.services), /Start the control/);
});

test('unfinished or unstarted predecessors block later stages and resume never creates a stage', async t => {
  const data = fixture(t);
  await main(['--out', data.root, '--stage', 'control'], data.services);
  await assert.rejects(main(['--out', data.root, '--stage', '1'], data.services), /preceding stage/);
  await assert.rejects(main(['--out', data.root, '--stage', '3'], data.services), /preceding stage/);
  await assert.rejects(main(['--resume', data.root, '--stage', '1'], data.services), /has not started/);
  assert.equal(data.calls.length, 1);
  assert.equal(fs.existsSync(path.join(data.root, 'amazon-stage-1')), false);
  data.finish('control');
  await assert.rejects(main(['--resume', data.root], data.services), /explicitly launch|Explicitly launch/);
  assert.equal(data.calls.length, 1);
});

test('Amazon stages are explicit balanced increments with inherited jobs and checkpoint requests before progression', async t => {
  const data = fixture(t);
  await main(['--out', data.root, '--stage', 'control', '--jobs', '3'], data.services);
  data.finish('control');
  for (const number of [1, 2, 3]) {
    const before = data.reportWrites.length;
    const result = await main(['--out', data.root, '--stage', String(number)], data.services);
    assert.equal(result.stage, `amazon-${number}`);
    const call = data.calls.at(-1), stage = data.source.stages[number];
    assert.deepEqual(call.config, data.source.config);
    assert.deepEqual(call.schedule, stage.schedule);
    assert.equal(call.schedule.length, number === 3 ? 128 : 64);
    assert.equal(call.jobs, 3); assert.equal(call.outDir, path.join(data.root, stage.directory));
    assert.equal(data.reportWrites.length, before + 2, 'save prior checkpoint before next launch and current estimate after stop');
    assert.equal(data.calls.length, number + 1, 'one requested stage per invocation');
    data.finish(stage.id);
  }
  assert.equal(data.referenceCalls.length, 1, 'reference inventory is frozen rather than rerun each stage');
  assert.equal(data.calls.reduce((sum, call) => sum + call.schedule.length, 0), 512);
});

test('resume continues one existing incomplete stage and preserves the frozen worker count', async t => {
  const data = fixture(t);
  await main(['--out', data.root, '--stage', 'control', '--jobs', '3'], data.services);
  const parent = fs.readFileSync(path.join(data.root, data.api.MANIFEST), 'utf8');
  await main(['--resume', data.root, '--log', 'plies'], data.services);
  const resumed = data.calls.at(-1);
  assert.equal(resumed.resume, true); assert.equal(resumed.jobs, undefined);
  assert.equal(resumed.log, 'plies'); assert.equal(resumed.outDir, path.join(data.root, 'control'));
  assert.deepEqual(resumed.schedule, data.source.stages[0].schedule);
  assert.equal(fs.readFileSync(path.join(data.root, data.api.MANIFEST), 'utf8'), parent);
  assert.equal(data.referenceCalls.length, 1);
  data.finish('control');
  const calls = data.calls.length;
  assert.equal((await main(['--resume', data.root, '--stage', 'control'], data.services)).finished, true);
  assert.equal(data.calls.length, calls, 'a completed requested stage is not relaunched');
});

test('completed campaign resume only refreshes reports and never launches another game', async t => {
  const data = fixture(t);
  await main(['--out', data.root, '--stage', 'control'], data.services);
  data.source.stages.forEach(stage => data.finish(stage.id));
  const before = data.calls.length;
  assert.equal((await main(['--resume', data.root], data.services)).finished, true);
  assert.equal(data.calls.length, before);
  await main(['--report', data.root], { report: data.api });
  assert.equal(data.calls.length, before, 'report needs no selected executable or engine launch');
});

test('changed source or engine and changed jobs reject before reports or new stage writes', async t => {
  const data = fixture(t);
  await main(['--out', data.root, '--stage', 'control', '--jobs', '3'], data.services);
  data.finish('control');
  const before = data.reportWrites.length, parent = fs.readFileSync(path.join(data.root, data.api.MANIFEST), 'utf8');
  data.services.getIdentity = () => ({ ...identity(), engineSha256: 'e'.repeat(64) });
  await assert.rejects(main(['--out', data.root, '--stage', '1'], data.services), /identity changed/);
  await assert.rejects(main(['--resume', data.root, '--stage', 'control'], data.services), /identity changed/);
  data.services.getIdentity = identity;
  await assert.rejects(main(['--out', data.root, '--stage', 'control', '--jobs', '2'], data.services), /worker count is frozen/);
  assert.equal(data.reportWrites.length, before); assert.equal(data.calls.length, 1);
  assert.equal(fs.readFileSync(path.join(data.root, data.api.MANIFEST), 'utf8'), parent);
  assert.equal(fs.existsSync(path.join(data.root, 'amazon-stage-1')), false);
});

test('failed or cancelled workers close controls, save a partial estimate and never advance', async t => {
  const data = fixture(t);
  const original = data.services.runParallel, failure = Object.assign(new Error('Cancelled fixture'), { name: 'AbortError' });
  data.services.runParallel = async options => { await original(options); throw failure; };
  await assert.rejects(main(['--out', data.root, '--stage', 'control'], data.services), error => error === failure);
  assert.ok(data.closed.every(item => item.closed)); assert.equal(data.reportWrites.length, 1);
  assert.equal(data.calls.length, 1); assert.equal(fs.existsSync(path.join(data.root, 'amazon-stage-1')), false);
});

test('keyboard and signal controls stop at requested boundary and restore listeners/raw mode', () => {
  const controller = new AbortController(), events = new EventEmitter(), input = new EventEmitter(), raw = [], messages = [];
  input.isTTY = true; input.isRaw = false;
  input.setRawMode = value => raw.push(value); input.resume = () => {}; input.pause = () => {};
  const controls = installControls(controller, { input, events, onMessage: message => messages.push(message) });
  input.emit('data', Buffer.from('g')); assert.equal(controls.shouldStop(), 'game'); assert.equal(controller.signal.aborted, false);
  input.emit('data', Buffer.from('p')); assert.equal(controls.shouldStop(), 'pair');
  input.emit('data', Buffer.from('q')); assert.equal(controls.shouldStop(), 'now'); assert.equal(controller.signal.aborted, true);
  input.emit('data', Buffer.from('g')); assert.equal(controls.shouldStop(), 'now');
  controls.close(); controls.close(); assert.deepEqual(raw, [true, false]);
  assert.equal(input.listenerCount('data'), 0); assert.equal(events.listenerCount('SIGINT'), 0); assert.equal(events.listenerCount('SIGTERM'), 0);
  assert.equal(messages.length, 3);
  const other = new AbortController(), signals = new EventEmitter();
  const signalControls = installControls(other, { input: new EventEmitter(), events: signals, onMessage() {} });
  signals.emit('SIGINT'); assert.equal(other.signal.aborted, true); assert.equal(signalControls.shouldStop(), 'now'); signalControls.close();
});

test('check mode validates reference tables and all 512 assignments without launching games', async () => {
  const calls = [], result = await checkCampaign('/fixture/native', {
    getCampaign,
    checkReferenceValues: async (executable, options) => { calls.push(['values', executable, options.signal]); return references(); },
    validateDesignConfig: async (config, options) => {
      calls.push(['validation', config, options]); return { games: 512, native: true };
    },
  });
  assert.deepEqual(result, { referenceValues: references(), validation: { games: 512, native: true } });
  assert.equal(calls.length, 2); assert.equal(calls[0][0], 'values'); assert.equal(calls[1][0], 'validation');
  assert.deepEqual(calls[1][1], getCampaign().config); assert.equal(calls[1][2].enginePath, '/fixture/native');
  assert.equal(calls[1][2].standardOpeningSources, true); assert.equal(calls[0][2], calls[1][2].signal);
});

test('reference inventory is read-only, validates actual tables and closes/removes temporary rules on failure', async t => {
  let searches = 0, closed = 0, ini, validation = 0;
  t.mock.method(UciEngine.prototype, 'start', async function () { ini = this.variantPath; assert.ok(fs.existsSync(ini)); });
  t.mock.method(UciEngine.prototype, 'pieceValues', async () => references());
  t.mock.method(UciEngine.prototype, 'search', async () => { searches++; throw new Error('Unexpected search'); });
  t.mock.method(UciEngine.prototype, 'close', async () => { closed++; });
  const result = await checkReferenceValues('/fixture/native', { getCampaign, validateReferenceValues(report) { validation++; assert.deepEqual(report, references()); } });
  assert.deepEqual(result, references()); assert.equal(searches, 0); assert.equal(validation, 1); assert.equal(closed, 1);
  assert.equal(fs.existsSync(path.dirname(ini)), false);
  await assert.rejects(checkReferenceValues('/fixture/native', { getCampaign, validateReferenceValues() { throw new Error('Wrong raw values'); } }), /Reference-value preflight failed.*Wrong raw values/);
  assert.equal(closed, 2); assert.equal(fs.existsSync(path.dirname(ini)), false); assert.equal(searches, 0);
  const abort = Object.assign(new Error('Cancelled'), { name: 'AbortError' });
  t.mock.method(UciEngine.prototype, 'pieceValues', async () => { throw abort; });
  await assert.rejects(checkReferenceValues('/fixture/native', { getCampaign, validateReferenceValues() {} }), error => error === abort);
  assert.equal(closed, 3); assert.equal(fs.existsSync(path.dirname(ini)), false);
});

test('live estimates explain missing blocks and show provisional compensation during play', () => {
  const messages = [], stage = { phase: 'amazon' };
  const phase = { plannedGames: 64, coverage: { finishedGames: 6, completePairs: 3, matchedGames: 0, eligibleOpeningBlocks: 0 },
    estimate: { estimate: { status: 'no-data' } } };
  printLiveEstimate({ amazon: phase }, stage, message => messages.push(message));
  assert.match(messages[0], /6\/64.*waiting for a complete opening block.*3 color pairs/);
  phase.coverage = { finishedGames: 20, completePairs: 10, matchedGames: 16, eligibleOpeningBlocks: 1 };
  phase.estimate.estimate = { status: 'bracketed', lowerCp: 300, upperCp: 400, pointCp: 350 };
  printLiveEstimate({ amazon: phase }, stage, message => messages.push(message));
  assert.match(messages[1], /300–400.*350.*16 matched games.*Provisional/);
});

test('finished-game callbacks refresh live reports before the stage returns', async t => {
  const data = fixture(t), original = data.services.runParallel;
  let liveWritesBeforeReturn = 0;
  data.services.runParallel = async options => {
    const result = await original(options);
    options.onProgress('[worker 1] Finished synthetic-game: * (max-plies).');
    await new Promise(resolve => setImmediate(resolve));
    liveWritesBeforeReturn = data.reportWrites.length;
    return result;
  };
  await main(['--out', data.root, '--stage', 'control'], data.services);
  assert.equal(liveWritesBeforeReturn, 1);
  assert.equal(data.reportWrites.length, 2);
});
