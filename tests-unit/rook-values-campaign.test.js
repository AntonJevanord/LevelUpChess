const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { POLICIES, DIRECTORIES, MANIFEST, getCampaign, createCampaignManifest, verifyCurrentIdentity,
  verifyPolicyManifest, makeRookValuesReport, readCampaignDirectory, writeRookValuesReport, exchangePatterns } = require('../scripts/balance/rook-values-report');
const { parseArgs, main, checkCampaign } = require('../scripts/rook-values-balance');
const { partitionSchedule } = require('../scripts/balance/parallel');

const clone = value => structuredClone(value);
const identity = () => ({ engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64),
  runnerSha256: 'c'.repeat(64), runnerSources: [{ file: 'run.js', sha256: 'd'.repeat(64) }] });
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-rook-values-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function fixture() {
  const source = getCampaign(), campaign = createCampaignManifest(3, identity());
  function run(policy) {
    const value = source.policies[policy];
    return { schemaVersion: 1, runId: `synthetic-${policy}`, ...identity(), config: value.config,
      schedule: value.schedule, designRegistry: value.registry,
      designProfile: { variant: value.profile.variant, config: value.profile.config, hash: value.profile.hash, registryHash: value.profile.registryHash },
      parallel: { schemaVersion: 1, jobs: campaign.jobs, sources: campaign.coordinatorSources.slice(0, 3),
        shards: partitionSchedule(value.schedule, campaign.jobs).map((games, index) => ({ worker: index + 1,
          directory: `workers/worker-${String(index + 1).padStart(2, '0')}`, scheduleIds: games.map(game => game.id) })) } };
  }
  function record(policy, game, score = 0.5, extra = {}) {
    const { config, profile } = source.policies[policy];
    return { schemaVersion: 1, id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
      openingId: game.openingId, aColor: game.aColor, attempt: 1, status: 'completed',
      result: score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
      reason: 'synthetic fixture', variant: profile.variant, profileHash: profile.hash, registryHash: profile.registryHash,
      registryReference: 'run.json#designRegistry', engine: config.engine,
      whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
      blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB,
      startedAt: '2026-10-23T12:00:00.000Z', finishedAt: '2026-10-23T12:00:10.000Z',
      ...(config.evaluation ? { evaluation: config.evaluation } : {}), ...extra };
  }
  const all = (policy, score = 0.5) => source.policies[policy].schedule.map(game => record(policy, game, score));
  return { ...source, campaign, run, record, all };
}
function writeRoot(directory, campaign) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, MANIFEST), JSON.stringify(campaign));
}
function writeRun(directory, manifest, records, tail = '') {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join('') + tail);
}
function services(launch = async () => ({ stopped: true })) {
  return { enginePath: process.execPath, getIdentity: identity, ensureManualSupport: async () => {}, launch };
}

test('400-game declaration isolates valuation across the same three Blink revisions, openings and color pairs', () => {
  const { roster, policies } = getCampaign();
  assert.equal(roster.maxGames, 400); assert.equal(roster.gamesPerPolicy, 200);
  assert.equal(roster.fixedTotalPoints, 8);
  assert.deepEqual(roster.candidates.map(row => row.id), ['rook.purple@3', 'rook.purple@4', 'rook.purple@5', 'queen.purple@1']);
  assert.deepEqual(policies.auto.registry, policies.eight.registry);
  assert.deepEqual(policies.auto.profile.capabilityProbes, policies.eight.profile.capabilityProbes);
  assert.notEqual(policies.auto.profile.hash, policies.eight.profile.hash);
  assert.equal(policies.auto.config.evaluation, undefined);
  assert.deepEqual(policies.eight.config.evaluation.pieceValues, Object.fromEntries(['rook.purple@3', 'rook.purple@4', 'rook.purple@5'].map(id => [id, { mg: 2042, eg: 2208 }])));
  for (const [phase, value] of [['Mg', 2042], ['Eg', 2208]]) {
    const entries = policies.eight.profile.config.match(new RegExp(`^pieceValue${phase} = (.+)$`, 'm'))[1].split(' ');
    assert.deepEqual(new Set(entries), new Set(policies.eight.registry.allocations.filter(row => row.id.startsWith('rook.')).map(row => `${row.letter}:${value}`)));
    assert.doesNotMatch(policies.auto.profile.config, new RegExp(`^pieceValue${phase}`, 'm'));
  }
  for (const policy of POLICIES) {
    const { config, schedule } = policies[policy];
    assert.equal(schedule.length, 200); assert.equal(config.openings.length, 20);
    assert.deepEqual(config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 });
    assert.equal(config.comparisons.length, 5);
    for (const comparison of config.comparisons) {
      assert.equal(schedule.filter(game => game.comparisonId === comparison.id).length, 40);
      assert.deepEqual(comparison.strengthA, { skill: 20 }); assert.deepEqual(comparison.strengthB, { skill: 20 });
      if (!comparison.id.endsWith('-control')) assert.deepEqual(comparison.armyB, { upgrades: { d1: 'queen.purple@1' }, remove: [] });
    }
    for (let i = 0; i < schedule.length; i += 2) {
      assert.equal(schedule[i].pairId, schedule[i + 1].pairId);
      assert.notEqual(schedule[i].aColor, schedule[i + 1].aColor);
    }
  }
  assert.deepEqual(policies.auto.schedule, policies.eight.schedule);
});

test('Windows JSON line endings preserve the frozen campaign while actual edits are rejected', t => {
  const original = fs.readFileSync;
  let modify = source => source.replace(/\n/g, '\r\n');
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    const value = original(file, ...args);
    return /rook-values-(auto|eight|roster)\.json$/.test(String(file)) ? modify(String(value)) : value;
  });
  assert.equal(getCampaign().policies.eight.schedule.length, 200);
  modify = source => source.replace('100000', '99999');
  assert.throws(getCampaign, /frozen/);
});

test('CLI arguments enforce explicit stages, fixed worker count and one mode', () => {
  assert.deepEqual(parseArgs(['--check']), { check: true });
  assert.deepEqual(parseArgs(['--out', 'r', '--policy', 'auto', '--jobs', '3']), { out: 'r', policy: 'auto', jobs: 3 });
  assert.deepEqual(parseArgs(['--out', 'r', '--policy', 'eight']), { out: 'r', policy: 'eight' });
  assert.deepEqual(parseArgs(['--resume', 'r']), { resume: 'r' });
  for (const args of [[], ['--out', 'r'], ['--out', 'r', '--policy', 'other'], ['--out', 'r', '--policy', 'eight', '--jobs', '2'],
    ['--out', 'r', '--policy', 'auto', '--jobs', '17'], ['--resume', 'r', '--jobs', '2'], ['--out', 'r', '--policy', 'auto', '--resume', 'r'],
    ['--report', 'r', '--policy', 'auto'], ['--report', 'r', '--log', 'games'], ['--out', 'r', '--policy', 'auto', '--limit-pairs', '1']]) assert.throws(() => parseArgs(args));
});

test('the initial automatic launch checks manual support before creating any campaign files', async t => {
  const root = path.join(temporary(t), 'new'), calls = [];
  const dependencies = services(async args => { calls.push(args); });
  dependencies.ensureManualSupport = async () => { throw new Error('old engine ignores raw overrides'); };
  await assert.rejects(main(['--out', root, '--policy', 'auto'], dependencies), /old engine/);
  assert.equal(fs.existsSync(root), false); assert.equal(calls.length, 0);
  dependencies.ensureManualSupport = async () => { assert.equal(fs.existsSync(root), false); };
  await main(['--out', root, '--policy', 'auto', '--jobs', '3', '--log', 'plies'], dependencies);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['--config', getCampaign().policies.auto.configFile, '--out', path.join(root, 'automatic'), '--jobs', '3', '--log', 'plies']);
  assert.equal(readCampaignDirectory(root).campaign.jobs, 3);
  assert.equal(fs.existsSync(path.join(root, 'eight-point')), false);
});

test('unstarted or unfinished stages cannot be skipped and stopped launches never start another policy', async t => {
  const root = path.join(temporary(t), 'run'), calls = [], data = fixture();
  await assert.rejects(main(['--out', root, '--policy', 'eight'], services()), /automatic policy/);
  writeRoot(root, data.campaign);
  await assert.rejects(main(['--resume', root], services()), /unstarted auto/);
  await assert.rejects(main(['--resume', root, '--policy', 'auto'], services()), /--policy auto/);
  writeRun(path.join(root, 'automatic'), data.run('auto'), []);
  const deps = services(async args => { calls.push(args); return { stopped: true }; });
  await assert.rejects(main(['--out', root, '--policy', 'eight'], deps), /Finish the automatic/);
  await main(['--resume', root], deps);
  assert.deepEqual(calls, [['--resume', path.join(root, 'automatic')]]);
  assert.equal(fs.existsSync(path.join(root, 'eight-point')), false);
  await assert.rejects(main(['--resume', root, '--policy', 'eight'], deps), /has not started/);
});

test('an explicit second launch inherits jobs only after automatic completion, including finalized truncations', async t => {
  const root = temporary(t), data = fixture(), calls = [];
  writeRoot(root, data.campaign);
  const final = data.all('auto').map(record => ({ ...record, status: 'truncated', result: '*', reason: 'max-plies' }));
  writeRun(path.join(root, 'automatic'), data.run('auto'), final);
  await main(['--out', root, '--policy', 'eight'], services(async args => { calls.push(args); }));
  assert.deepEqual(calls, [['--config', data.policies.eight.configFile, '--out', path.join(root, 'eight-point'), '--jobs', '3']]);
  assert.equal(makeRookValuesReport(data.campaign, { auto: { manifest: data.run('auto'), records: final } }).policies.auto.finished, true);
  await main(['--resume', root, '--policy', 'auto'], services(async () => { throw new Error('finished policy relaunched'); }));
});

test('a changed engine, rule identity or worker count is rejected between policies and on resume', async t => {
  const root = temporary(t), data = fixture();
  writeRoot(root, data.campaign); writeRun(path.join(root, 'automatic'), data.run('auto'), data.all('auto'));
  const dependencies = services(); dependencies.getIdentity = () => ({ ...identity(), engineSha256: 'e'.repeat(64) });
  await assert.rejects(main(['--out', root, '--policy', 'eight'], dependencies), /engine, rules, runner or coordinator changed/);
  dependencies.getIdentity = () => ({ ...identity(), rulesBundleSha256: 'e'.repeat(64) });
  await assert.rejects(main(['--resume', root, '--policy', 'auto'], dependencies), /engine, rules, runner or coordinator changed/);
  assert.throws(() => verifyCurrentIdentity(data.campaign, { ...identity(), runnerSha256: 'f'.repeat(64) }), /changed/);
  const coordinator = clone(data.campaign); coordinator.coordinatorSources[4].sha256 = 'e'.repeat(64);
  assert.throws(() => verifyCurrentIdentity(coordinator, identity()), /coordinator changed/);
  const changed = clone(data.run('auto')); changed.parallel.jobs = 2;
  assert.throws(() => verifyPolicyManifest(changed, 'auto', data.campaign), /worker count/);
  const different = clone(data.run('eight')); different.designProfile.hash = 'changed';
  assert.throws(() => makeRookValuesReport(data.campaign, { eight: { manifest: different, records: [] } }), /identity/);
});

test('reports compare only shared fully scored color pairs and preserve policy-specific coverage', () => {
  const data = fixture(), auto = data.policies.auto.schedule, eight = data.policies.eight.schedule;
  const comparison = 'quiet-blink-v-amazon';
  const games = auto.filter(game => game.comparisonId === comparison);
  const openingA = games[0].openingId, openingB = games[2].openingId;
  const rowsA = games.filter(game => [openingA, openingB].includes(game.openingId)).map(game => data.record('auto', game, game.openingId === openingA ? 1 : 0));
  const rowsB = eight.filter(game => game.comparisonId === comparison && game.openingId === openingA).map(game => data.record('eight', game, 0.5));
  // An unpaired eight-point result cannot supply evidence for openingB.
  rowsB.push(data.record('eight', eight.find(game => game.comparisonId === comparison && game.openingId === openingB), 1));
  const report = makeRookValuesReport(data.campaign, { auto: { manifest: data.run('auto'), records: rowsA }, eight: { manifest: data.run('eight'), records: rowsB } });
  const row = report.comparisons.find(row => row.id === 'rook.purple@3');
  assert.equal(report.policies.auto.candidates[0].score, 0.5);
  assert.equal(report.policies.auto.candidates[0].completePairs, 2);
  assert.equal(row.sharedOpenings, 1); assert.equal(row.automaticScore, 1); assert.equal(row.eightPointScore, 0.5);
  assert.equal(row.scoreDifference, -0.5); assert.equal(row.assessment, 'provisional-comparison');
  assert.equal(report.policies.eight.candidates[0].completePairs, 1);
});

test('complete reports retain controls separately and reject altered manual policies or foreign records', () => {
  const data = fixture(), auto = data.all('auto'), eight = data.all('eight', 1);
  const report = makeRookValuesReport(data.campaign, { auto: { manifest: data.run('auto'), records: auto }, eight: { manifest: data.run('eight'), records: eight } });
  assert.equal(report.complete, true); assert.equal(report.finished, true);
  assert.ok(report.comparisons.every(row => row.sharedOpenings === 20 && row.scoreDifference === 0.5));
  assert.equal(report.policies.auto.controls.length, 2);
  assert.ok(report.policies.auto.controls.every(row => row.completePairs === 20 && row.physicalColors.draws === 40));
  assert.ok(report.policies.eight.controls.every(row => row.physicalColors.whiteWins === 20 && row.physicalColors.blackWins === 20));
  const bad = clone(eight[0]); delete bad.evaluation;
  assert.throws(() => makeRookValuesReport(data.campaign, { eight: { manifest: data.run('eight'), records: [bad] } }), /settings/);
  const unknown = clone(auto[0]); unknown.id = 'not-scheduled';
  assert.throws(() => makeRookValuesReport(data.campaign, { auto: { manifest: data.run('auto'), records: [unknown] } }), /frozen schedule/);
});

test('report writing tolerates torn live journals without modifying manifests or source evidence', t => {
  const root = temporary(t), data = fixture();
  writeRoot(root, data.campaign);
  const dir = path.join(root, 'automatic'), records = data.all('auto').slice(0, 2);
  writeRun(dir, data.run('auto'), records, '{"id":"torn');
  const files = [path.join(root, MANIFEST), path.join(dir, 'run.json'), path.join(dir, 'games.jsonl')];
  const before = files.map(file => fs.readFileSync(file, 'utf8'));
  const result = writeRookValuesReport(root);
  assert.equal(result.report.policies.eight, null); assert.equal(result.report.finished, false);
  assert.ok(result.report.comparisons.every(row => row.eightPointScore === null));
  assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), before);
  assert.match(fs.readFileSync(result.files.markdown, 'utf8'), /Not started|Exchange counts|No automatic/);
});

test('observable exchange tracking handles both colors, castling and original-piece removal', () => {
  const history = (moves, aColor = 'w') => ({ moves, aColor, totalPlies: moves.length });
  assert.deepEqual(exchangePatterns([history(['a1d5', 'd8d5', 'c1d5'])]).amazonTakesBlinkThenRecaptured, 1);
  assert.equal(exchangePatterns([history(['d1d5', 'a8d5', 'd5c4'], 'b')]).blinkCapturesAmazon, 1);
  assert.equal(exchangePatterns([history(['e1c1', 'd8d1', 'c2d1'])]).amazonTakesBlinkThenRecaptured, 1);
  assert.equal(exchangePatterns([history(['a1d5', 'd8d5', 'c1d5', 'd7d6', 'a2a1q', 'd6d5'])]).amazonTakesBlinkThenRecaptured, 1);
  assert.equal(exchangePatterns([{ moves: ['bad'], totalPlies: 1, aColor: 'w' }]).analyzedGames, 0);
});

test('check mode delegates both complete native profiles without launching games', async t => {
  const calls = [];
  t.mock.method(require('../scripts/balance/validate-designs'), 'validateDesignConfig', async (config, options) => { calls.push({ config, options }); return { games: 200 }; });
  const result = await checkCampaign('/temporary/native-engine');
  assert.deepEqual(Object.keys(result), ['auto', 'eight']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].config.evaluation, undefined);
  assert.equal(calls[1].config.evaluation.pieceValues['rook.purple@3'].mg, 2042);
  assert.ok(calls.every(call => call.options.standardOpeningSources && call.options.enginePath === '/temporary/native-engine'));
});
