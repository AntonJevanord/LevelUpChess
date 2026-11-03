'use strict';

// Synthetic outcome/controller fixtures only. No engines, game play or fits.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const command = require('../scripts/panel-insights');
const panel = require('../scripts/level3-panel');
const plan = require('../scripts/balance/level3-panel-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-panel-insights-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
}
function tree(directory) {
  const files = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) for (const [key, value] of Object.entries(tree(file))) files[path.join(entry.name, key)] = value;
    else files[entry.name] = { sha256: sha(fs.readFileSync(file)), mtime: fs.statSync(file).mtimeMs };
  }
  return files;
}
const roster = [
  { key: 'xray-queen', id: 'queen.xray@1', label: 'Wraith', sourceLabel: 'X-ray queen' },
  { key: 'ranged-rook', id: 'rook.ranged@1', label: 'Cataphract', sourceLabel: 'Ranged rook' },
  { key: 'nightrider', id: 'knight.nightrider@1', label: 'Nightrider' },
  { key: 'amazon', id: 'queen.amazon@1', label: 'Amazon' },
];
function compact() {
  const openingIds = Array.from({ length: 8 }, (_, index) => `o${index}`);
  const cohorts = plan.NODE_BUDGETS.map(nodes => ({ nodes, openingIds,
    pairs: roster.flatMap((a, index) => roster.slice(index + 1).flatMap(b => openingIds.map(openingId => {
      const key = `${nodes}-${a.key}-${b.key}-${openingId}`;
      return { nodes, stageKey: `stage-${nodes}`, comparisonId: `${a.key}-v-${b.key}`, kind: 'head',
        openingId, aKey: a.key, bKey: b.key, aId: a.id, bId: b.id, aWhite: 1, aBlack: 0,
        whiteGameId: `${key}-w`, blackGameId: `${key}-b` };
    }))) }));
  return command.seal({ schemaVersion: 1, format: command.FORMAT,
    source: { basis: 'Synthetic outcome fixture', sourceRunId: 'synthetic-compact', selectedOpenings: 8,
      sourceTargetOpeningsAtRead: 64, sourceDirectory: '/nonexistent-original-machine/panel',
      manifestSha256: '0'.repeat(64), collectedAt: '2026-11-03T12:00:00.000Z', stages: [] },
    roster: structuredClone(roster), cohorts });
}
function reseal(value, mutate) {
  const { payloadSha256, ...payload } = structuredClone(value); mutate(payload); return command.seal(payload);
}

const base = plan.buildCampaignPlan();
const build = ({ jobs }) => ({ ...base, jobs });
const identity = { engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64), runnerSha256: 'c'.repeat(64),
  runnerSources: [], controllerSources: panel.controllerSources() };
const contexts = new Map();
function context(descriptor) {
  if (contexts.has(descriptor.id)) return contexts.get(descriptor.id);
  const declared = plan.getBatchDeclaration(descriptor.batchIndex, descriptor.nodes), config = declared.config;
  const designRegistry = createDesignRegistry(config), designProfile = compileDesignProfile(designRegistry, config.evaluation), schedule = makeSchedule(config);
  const manifest = { runId: `synthetic-${descriptor.id}`, config, schedule, designRegistry, designProfile,
    ...identity, parallel: { jobs: 4 }, rulesProfiles: [{ file: 'rules/fixture.ini' }] };
  const records = schedule.map(game => ({ id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
    openingId: game.openingId, aColor: game.aColor, repetition: 1, attempt: 1, status: 'completed', result: '1/2-1/2',
    variant: designProfile.variant, profileHash: designProfile.hash, registryHash: designRegistry.hash,
    registryReference: 'run.json#designRegistry', engine: config.engine, evaluation: config.evaluation,
    whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, openingMoves: game.openingMoves }));
  const result = { declared, manifest, records }; contexts.set(descriptor.id, result); return result;
}
function campaign(t, { savedTarget = 64 } = {}) {
  const temporaryDirectory = temporary(t), root = path.join(temporaryDirectory, 'run'); fs.mkdirSync(root);
  const declared = build({ jobs: 4 }), manifest = { ...declared, runId: 'synthetic-panel', createdAt: '2026-11-03',
    initialOpenings: 8, runtimeIdentity: identity, planSha256: sha(JSON.stringify(declared)) };
  write(path.join(root, panel.MANIFEST), JSON.stringify(manifest) + '\n');
  write(path.join(root, panel.STATE), JSON.stringify({ runId: manifest.runId, targetOpenings: savedTarget }) + '\n');
  write(path.join(root, panel.LOCK), JSON.stringify({ pid: process.pid, token: 'active-later-target' }) + '\n');
  const entries = new Map();
  for (const descriptor of plan.selectedStages(8, manifest)) {
    const original = context(descriptor), directory = path.join(root, descriptor.directory);
    const journal = JSON.stringify({ syntheticJournalFixture: descriptor.id }) + '\n';
    const preflight = JSON.stringify({ syntheticNativeProofFixture: descriptor.id }) + '\n';
    write(path.join(directory, 'run.json'), JSON.stringify(original.manifest) + '\n');
    write(path.join(directory, 'games.jsonl'), journal);
    write(path.join(directory, 'v17-preflight.json'), preflight);
    write(path.join(directory, 'rules/fixture.ini'), original.manifest.designProfile.config);
    entries.set(directory, { manifest: original.manifest, records: [...original.records],
      source: { observedBytes: Buffer.byteLength(journal), completePrefixSha256: sha(journal), tornTailIgnored: false,
        nativePreflight: { file: 'v17-preflight.json', sha256: sha(preflight), engineSha256: identity.engineSha256 } } });
  }
  write(path.join(root, 'batch-08-n80000/run.lock'), JSON.stringify({ pid: process.pid, token: 'later-stage' }));
  return { root, manifest, entries, dependencies: { build, readInput(directory) {
    const input = entries.get(directory); assert.ok(input, `Unexpected stage read: ${directory}`); return input;
  } } };
}

test('CLI selects original campaign or portable export and rejects incomplete, repeated or ambiguous options', () => {
  assert.deepEqual(command.parseArgs(['--run', 'run', '--out', 'out']), { run: 'run', out: 'out', exclude: [] });
  assert.deepEqual(command.parseArgs(['--run', 'run', '--openings', '32', '--out', 'out', '--exclude', 'Wraith, Cataphract']),
    { run: 'run', openings: 32, out: 'out', exclude: ['Wraith', 'Cataphract'] });
  assert.equal(command.parseArgs(['--input', 'paired-outcomes.json', '--out', 'out']).input, 'paired-outcomes.json');
  assert.deepEqual(command.parseArgs(['--help']), { help: true });
  for (const args of [[], ['--run', 'r'], ['--run', 'r', '--input', 'i', '--out', 'o'],
    ['--input', 'i', '--out', 'o', '--openings', '8'], ['--run', 'r', '--out', 'o', '--openings', '24'],
    ['--run', 'r', '--out', 'o', '--engine', 'e'], ['--run', 'r', '--run', 'r', '--out', 'o'],
    ['--run', 'r', '--out', 'o', '--exclude', 'Wraith,']]) assert.throws(() => command.parseArgs(args));
});

test('piece exclusions resolve current names, archived labels, keys and IDs without ambiguous or repeated removals', () => {
  for (const alias of ['Wraith', 'x-ray queen', 'xray-queen', 'queen.xray@1']) assert.deepEqual(command.resolveExclusions(roster, [alias]), ['xray-queen']);
  assert.deepEqual(command.resolveExclusions(roster, ['RANGED_ROOK', 'AMAZON']), ['ranged-rook', 'amazon']);
  assert.throws(() => command.resolveExclusions(roster, ['ghost']), /Unknown roster/);
  assert.throws(() => command.resolveExclusions(roster, ['Wraith', 'queen.xray@1']), /more than once/);
  assert.throws(() => command.resolveExclusions(roster, ['Wraith', 'Cataphract', 'Amazon']), /at least two/);
  assert.throws(() => command.resolveExclusions([...roster, { key: 'other', id: 'other@1', label: 'Wraith' }], []), /Ambiguous/);
});

test('portable export integrity includes outcomes and structural validation rejects duplicated pairs, identities and budgets', () => {
  const payload = compact(); assert.equal(command.validateCompact(payload), payload);
  const changed = structuredClone(payload); changed.cohorts[0].pairs[0].aWhite = 0;
  assert.throws(() => command.validateCompact(changed), /intact/);
  for (const mutate of [
    value => { value.schemaVersion = 2; },
    value => { value.source.sourceRunId = ''; },
    value => { value.source.selectedOpenings = 4; },
    value => { value.cohorts.pop(); },
    value => { value.cohorts.reverse(); },
    value => { value.cohorts[1].openingIds = [...value.cohorts[1].openingIds].reverse(); },
    value => { value.cohorts[0].openingIds = value.cohorts[0].openingIds.slice(1); },
    value => { value.cohorts[0].pairs.push(structuredClone(value.cohorts[0].pairs[0])); },
    value => { value.cohorts[0].openingIds.push(value.cohorts[0].openingIds[0]); },
    value => { value.cohorts[0].pairs[0].aId = 'foreign@1'; },
    value => { value.cohorts[0].pairs[0].nodes = 80000; },
    value => { value.cohorts[0].pairs[0].kind = 'baseline'; },
    value => { value.roster[1].id = value.roster[0].id; },
  ]) assert.throws(() => command.validateCompact(reseal(payload, mutate)));
});

test('stage projection preserves physical color scores, ignores ordinary anchors and deduplicates retries and copied attempts', () => {
  const descriptor = base.stages[0], original = context(descriptor);
  const head = original.declared.metadata.comparisons.find(row => row.kind === 'head');
  const baseline = original.declared.metadata.comparisons.find(row => row.kind === 'baseline');
  const firstOpening = original.declared.config.openings[0].id;
  const recordsFor = comparison => original.records.filter(row => row.comparisonId === comparison.id && row.openingId === firstOpening);
  const pair = recordsFor(head), white = pair.find(row => row.aColor === 'w'), black = pair.find(row => row.aColor === 'b');
  const error = { ...white, status: 'error', result: '*' }, retry = { ...white, attempt: 2, result: '1-0' };
  const draw = { ...black, result: '1/2-1/2' };
  const records = [error, retry, structuredClone(retry), draw, ...recordsFor(baseline)];
  const stage = { key: descriptor.id, nodes: descriptor.nodes, ...original.declared, manifest: original.manifest, records };
  const projected = command.projectStage(stage);
  assert.equal(projected.pairs.length, 1); assert.equal(projected.coverage.ordinaryPairsExcluded, 1);
  assert.equal(projected.coverage.copiedAttemptsIgnored, 1); assert.equal(projected.coverage.finalizedGames, 4);
  const [outcome] = projected.pairs;
  assert.equal(outcome.aWhite, 1); assert.equal(outcome.aBlack, 0.5);
  assert.equal(outcome.whiteGameId, white.id); assert.equal(outcome.blackGameId, black.id);
  assert.equal(outcome.aId, head.designA); assert.equal(outcome.bId, head.designB);
  assert.equal(Object.hasOwn(outcome, 'moves'), false); assert.equal(Object.hasOwn(outcome, 'san'), false);
  assert.equal(command.projectStage({ ...stage, records: [retry] }).pairs.length, 0);
  assert.equal(command.projectStage({ ...stage, records: [retry, { ...draw, status: 'truncated', result: '*' }] }).pairs.length, 0);
  assert.throws(() => command.projectStage({ ...stage, records: [{ ...retry, profileHash: 'foreign' }, draw] }), /rules profile/);
});

test('original completed stage collection stays read-only while a later target runs and records exact omitted color pairs', t => {
  const fixture = campaign(t), before = tree(fixture.root);
  const second = [...fixture.entries.values()][1];
  const headIds = new Set(context(base.stages[1]).declared.metadata.comparisons.filter(row => row.kind === 'head').map(row => row.id));
  const index = second.records.findIndex(row => headIds.has(row.comparisonId));
  second.records[index] = { ...second.records[index], status: 'truncated', result: '*' };
  const payload = command.collectRun(fixture.root, 8, fixture.dependencies);
  assert.deepEqual(tree(fixture.root), before); assert.equal(payload.source.sourceTargetOpeningsAtRead, 64);
  assert.equal(payload.source.selectedOpenings, 8); assert.equal(payload.source.stages.length, 3);
  assert.deepEqual(payload.cohorts.map(row => row.pairs.length), [360, 359, 360]);
  assert.ok(payload.cohorts.every(row => row.openingIds.length === 8));
  assert.equal(payload.source.stages[1].coverage.finalizedRecordsOutsideScoredPairs, 2);
  assert.equal(payload.source.stages[1].coverage.ordinaryPairsExcluded, 80);
  assert.equal(payload.roster.find(row => row.key === 'xray-queen').label, 'Wraith');
  command.recheckSources(payload);
  const resumedStageLock = path.join(fixture.root, payload.source.stages[0].stageKey, 'run.lock');
  write(resumedStageLock, JSON.stringify({ pid: process.pid, token: 'resumed-after-read' }));
  assert.throws(() => command.recheckSources(payload), /still active/);
  fs.unlinkSync(resumedStageLock); command.recheckSources(payload);
  const file = payload.source.stages[0].files.find(row => row.file.endsWith('games.jsonl'));
  write(path.join(fixture.root, file.file), 'changed\n');
  assert.throws(() => command.recheckSources(payload), /stage data changed/);
});

test('raw main writes all four reusable artifacts without changing campaign files or fitting material', t => {
  const fixture = campaign(t), before = tree(fixture.root), output = path.join(path.dirname(fixture.root), 'analysis');
  const result = command.main(['--run', fixture.root, '--openings', '8', '--out', output], {
    loadRun(directory, openings) { return command.collectRun(directory, openings, fixture.dependencies); }, log() {},
  });
  assert.deepEqual(tree(fixture.root), before);
  assert.deepEqual(fs.readdirSync(output).sort(), ['analysis.json', 'color-report.md', 'exclusion-report.md', 'paired-outcomes.json']);
  assert.equal(result.payload.cohorts.reduce((sum, row) => sum + row.pairs.length, 0), 1080);
  assert.ok(result.report.budgets.every(row => row.colors.global.observedScoredPairs === 360 && row.colors.global.whiteScore === 0.5));
  assert.deepEqual(command.readCompact(path.join(output, 'paired-outcomes.json')), result.payload);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'analysis.json'), 'utf8')), result.report);
  assert.match(fs.readFileSync(path.join(output, 'color-report.md'), 'utf8'), /20,000 nodes/);
  assert.match(fs.readFileSync(path.join(output, 'exclusion-report.md'), 'utf8'), /No games, engine searches or material models are rerun/);
});

test('raw collection refuses unfinished or active selected stages and targets outside the saved campaign', t => {
  const fixture = campaign(t, { savedTarget: 8 });
  assert.throws(() => command.collectRun(fixture.root, 16, fixture.dependencies), /saved campaign target/);
  const [directory, entry] = [...fixture.entries][0];
  entry.records = entry.records.slice(1);
  assert.throws(() => command.collectRun(fixture.root, 8, fixture.dependencies), /incomplete/);
  entry.records = [...context(base.stages[0]).records];
  write(path.join(directory, 'run.lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => command.collectRun(fixture.root, 8, fixture.dependencies), /still active/);
});

test('compact input reuses identical outcomes and never follows original source-machine paths', t => {
  const directory = temporary(t), inputDirectory = path.join(directory, 'input'), output = path.join(directory, 'report');
  const input = path.join(inputDirectory, 'paired-outcomes.json'), payload = compact();
  write(input, JSON.stringify(payload) + '\n'); const before = tree(inputDirectory);
  const result = command.main(['--input', input, '--exclude', 'Wraith,Cataphract', '--out', output], {
    loadRun() { throw new Error('Compact input must not load a campaign or start work.'); }, log() {},
  });
  assert.deepEqual(result.payload, payload); assert.deepEqual(tree(inputDirectory), before);
  assert.deepEqual(fs.readdirSync(output).sort(), ['analysis.json', 'color-report.md', 'exclusion-report.md', 'paired-outcomes.json']);
  assert.deepEqual(command.readCompact(path.join(output, 'paired-outcomes.json')), payload);
  assert.deepEqual(result.report.excludedKeys, ['xray-queen', 'ranged-rook']);
  assert.ok(result.report.budgets.every(row => row.colors.global.whiteScore === 1 && row.colors.global.observedScoredPairs === 48));
  assert.match(fs.readFileSync(path.join(output, 'color-report.md'), 'utf8'), /A as White/);
  assert.match(fs.readFileSync(path.join(output, 'exclusion-report.md'), 'utf8'), /No games|no games/);
  const secondOutput = path.join(directory, 'second-report');
  const second = command.main(['--input', path.join(output, 'paired-outcomes.json'), '--out', secondOutput], { log() {} });
  assert.deepEqual(second.report.budgets.map(row => row.colors), result.report.budgets.map(row => row.colors));
});

test('analysis outputs cannot overlap inputs through paths or links, overwrite reports or leave reports on invalid exclusions', t => {
  const directory = temporary(t), source = path.join(directory, 'input'), input = path.join(source, 'paired-outcomes.json');
  write(input, JSON.stringify(compact()));
  for (const output of [source, path.join(source, 'nested'), directory]) {
    assert.throws(() => command.main(['--input', input, '--out', output], { log() {} }), /outside the campaign/);
  }
  const link = path.join(directory, 'linked-input'); fs.symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => command.main(['--input', input, '--out', path.join(link, 'nested')], { log() {} }), /outside the campaign/);
  const output = path.join(directory, 'output'); write(path.join(output, 'existing.md'), 'retain');
  assert.throws(() => command.main(['--input', input, '--out', output], { log() {} }), /new or empty/);
  assert.equal(fs.readFileSync(path.join(output, 'existing.md'), 'utf8'), 'retain');
  const invalidOutput = path.join(directory, 'invalid');
  assert.throws(() => command.main(['--input', input, '--out', invalidOutput, '--exclude', 'unknown'], { log() {} }), /Unknown roster/);
  assert.equal(fs.existsSync(invalidOutput), false);
});
