const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getCampaign } = require('../scripts/balance/material-plan');
const { partitionSchedule } = require('../scripts/balance/parallel');
const { MANIFEST, createCampaignManifest, verifyCurrentIdentity, validateReferenceValues,
  makeMaterialReport, readCampaignDirectory, writeMaterialReport, fingerprint } = require('../scripts/balance/material-report');
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = () => ({ engineSha256: 'a'.repeat(64), rulesBundleSha256: 'b'.repeat(64),
  runnerSha256: 'c'.repeat(64), runnerSources: [{ file: 'run.js', sha256: 'd'.repeat(64) }] });
function references() {
  const amazon = getCampaign().registry.allocations.find(item => item.id === 'queen.purple@1').letter;
  return { version: 1, pieces: Object.fromEntries([['r', 1276, 1380], ['q', 2538, 2682], [amazon, 3738, 3875]].flatMap(([letter, mg, eg]) =>
    [letter, letter.toUpperCase()].map(piece => [piece, { rawMg: mg, rawEg: eg, captureMg: mg, captureEg: eg, evalMg: mg, evalEg: eg }]))) };
}
function fixture() {
  const source = getCampaign(), parent = createCampaignManifest(3, identity(), references());
  const manifest = stage => ({ schemaVersion: 1, runId: `synthetic-${stage.id}`, ...identity(),
    config: source.config, schedule: stage.schedule, configHash: fingerprint({ config: source.config, schedule: stage.schedule }),
    rulesHash: fingerprint({ bundleHash: parent.engineIdentity.rulesBundleSha256, runnerSha256: parent.engineIdentity.runnerSha256,
      profiles: [{ variant: source.profile.variant, config: source.profile.config }] }),
    designRegistry: source.registry, designProfile: { variant: source.profile.variant, config: source.profile.config,
      hash: source.profile.hash, registryHash: source.profile.registryHash },
    rulesProfiles: [{ variant: source.profile.variant, whiteKing: 0, blackKing: 0, configSha256: hash(source.profile.config),
      file: `rules/${source.profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null,
      profileHash: source.profile.hash, registryHash: source.registry.hash }],
    parallel: { schemaVersion: 1, jobs: 3, sources: parent.coordinatorSources.slice(0, 3),
      shards: partitionSchedule(stage.schedule, 3).map((games, index) => ({ worker: index + 1,
        directory: `workers/worker-${String(index + 1).padStart(2, '0')}`, scheduleIds: games.map(game => game.id) })) } });
  const record = game => {
    const dose = source.metadata.find(item => item.comparisonId === game.comparisonId).compensationCp;
    const score = dose < 400 ? 1 : dose === 400 ? 0.5 : 0;
    return { id: game.id, pairId: game.pairId, comparisonId: game.comparisonId, openingId: game.openingId,
      aColor: game.aColor, attempt: 1, status: 'completed', result: score === 0.5 ? '1/2-1/2' : (score === 1) === (game.aColor === 'w') ? '1-0' : '0-1',
      reason: 'synthetic fixture', profileHash: source.profile.hash, registryHash: source.registry.hash,
      registryReference: 'run.json#designRegistry', variant: source.profile.variant, engine: source.config.engine,
      whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
      blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB,
      royalMode: 'king', evaluationCaveat: null };
  };
  const run = index => ({ manifest: manifest(source.stages[index]), records: source.stages[index].schedule.map(record) });
  return { source, parent, run };
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-material-report-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function writeRoot(directory, parent) { fs.writeFileSync(path.join(directory, MANIFEST), JSON.stringify(parent)); }
function writeRun(directory, source, stageId, run, tail = '') {
  const child = path.join(directory, source.stages.find(stage => stage.id === stageId).directory);
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(child, 'run.json'), JSON.stringify(run.manifest));
  fs.writeFileSync(path.join(child, 'games.jsonl'), run.records.map(record => JSON.stringify(record) + '\n').join('') + tail);
}

test('material references verify all six table values for R/Q/Amazon and both colors', () => {
  assert.deepEqual(validateReferenceValues(references()), references());
  for (const [piece, fields] of Object.entries(references().pieces)) for (const field of Object.keys(fields)) {
    const changed = references(); changed.pieces[piece][field]++;
    assert.throws(() => validateReferenceValues(changed), /reference.*changed/);
  }
  assert.throws(() => validateReferenceValues({ version: 0, pieces: {} }), /diagnostic/);
});

test('parent freezes estimator, controls, search and worker identities', () => {
  const { parent } = fixture();
  verifyCurrentIdentity(parent, identity());
  assert.throws(() => verifyCurrentIdentity(parent, { ...identity(), engineSha256: 'f'.repeat(64) }), /engine, rules or runner/);
  const edited = clone(parent); edited.coordinatorSources[4].sha256 = 'e'.repeat(64);
  assert.throws(() => makeMaterialReport(edited, {}), /estimator or coordinator/);
  const protocol = clone(parent); protocol.protocol.stages[1].games++;
  assert.throws(() => makeMaterialReport(protocol, {}), /protocol changed/);
});

test('unstarted campaigns contain no material estimate or snapshots', () => {
  const { parent } = fixture(), report = makeMaterialReport(parent, {});
  assert.equal(report.finishedGames, 0); assert.equal(report.finished, false);
  assert.equal(report.amazon.estimate.estimate.status, 'no-data');
  assert.equal(report.control.estimate.estimate.status, 'no-data');
  assert.deepEqual(report.snapshots, []);
});

test('cumulative checkpoints keep balanced 64/128/256 samples without duplicating prior games', () => {
  const { parent, run } = fixture();
  const report = makeMaterialReport(parent, { control: run(0), 'amazon-1': run(1), 'amazon-2': run(2), 'amazon-3': run(3) });
  assert.equal(report.finished, true); assert.equal(report.finishedGames, 512);
  assert.equal(report.control.estimate.estimate.pointCp, 400);
  assert.equal(report.control.reference.conventionalReferenceInsideBracket, true);
  const snapshots = report.snapshots.filter(item => item.estimate.phase === 'amazon');
  assert.deepEqual(snapshots.map(item => item.estimate.plannedGames), [64, 128, 256]);
  assert.deepEqual(snapshots.map(item => item.estimate.coverage.eligibleOpeningBlocks), [4, 8, 16]);
  assert.deepEqual(snapshots.map(item => item.estimate.coverage.matchedGames), [64, 128, 256]);
  assert.equal(snapshots[0].estimate.estimate.bootstrap.available, false);
  assert.equal(snapshots[1].estimate.estimate.bootstrap.available, true);
  assert.equal(snapshots[2].estimate.estimate.estimate.pointCp, 400);
});

test('truncated color partners remove entire dose/layout/opening blocks from the estimate', () => {
  const { parent, run } = fixture(), first = run(1);
  first.records[0] = { ...first.records[0], status: 'truncated', result: '*', reason: 'max-plies' };
  const report = makeMaterialReport(parent, { control: run(0), 'amazon-1': first });
  assert.equal(report.stages['amazon-1'].finished, true);
  assert.equal(report.amazon.plannedGames, 64);
  assert.equal(report.amazon.coverage.eligibleOpeningBlocks, 3);
  assert.equal(report.amazon.coverage.scoredPairedGames, 62);
  assert.equal(report.amazon.coverage.matchedGames, 48);
  assert.equal(report.amazon.coverage.excludedScoredPairedGames, 14);
});

test('stages cannot be skipped and foreign profiles, schedules or annotations are rejected', () => {
  const { parent, run } = fixture();
  assert.throws(() => makeMaterialReport(parent, { 'amazon-1': run(1) }), /prerequisite/);
  assert.throws(() => makeMaterialReport(parent, { control: run(0), 'amazon-2': run(2) }), /prerequisite/);
  for (const change of [r => { r.records[0].profileHash = 'foreign'; },
    r => { r.records[0].evaluation = { pieceValues: {} }; },
    r => { r.records[0].engine.nodes++; }, r => { r.records.push(clone(r.records[0])); },
    r => { r.manifest.schedule = r.manifest.schedule.slice(2); },
    r => { r.manifest.rulesHash = 'foreign'; }]) {
    const edited = clone(run(0)); change(edited);
    assert.throws(() => makeMaterialReport(parent, { control: edited }));
  }
});

test('checkpoint files remain byte-identical when later stages and reports arrive', t => {
  const { source, parent, run } = fixture(), directory = temporary(t);
  writeRoot(directory, parent); writeRun(directory, source, 'control', run(0)); writeRun(directory, source, 'amazon-1', run(1));
  writeMaterialReport(directory);
  const first = path.join(directory, 'estimates/amazon-64.json'), before = fs.readFileSync(first, 'utf8');
  writeRun(directory, source, 'amazon-2', run(2));
  writeMaterialReport(directory);
  assert.equal(fs.readFileSync(first, 'utf8'), before);
  assert.ok(fs.existsSync(path.join(directory, 'estimates/amazon-128.json')));
  const live = fs.readFileSync(path.join(directory, 'material-report.json'), 'utf8');
  fs.writeFileSync(first, '{}');
  assert.throws(() => writeMaterialReport(directory), /stored material checkpoint differs/);
  assert.equal(fs.readFileSync(path.join(directory, 'material-report.json'), 'utf8'), live);
});

test('live reports ignore torn journal tails and preserve source evidence', t => {
  const { source, parent, run } = fixture(), directory = temporary(t), control = run(0);
  control.records = control.records.slice(0, 2);
  writeRoot(directory, parent); writeRun(directory, source, 'control', control, '{"id":"partial');
  const filename = path.join(directory, 'control/games.jsonl'), before = fs.readFileSync(filename, 'utf8');
  assert.equal(readCampaignDirectory(directory).runs.control.records.length, 2);
  const result = writeMaterialReport(directory);
  assert.equal(result.report.finished, false);
  assert.equal(fs.readFileSync(filename, 'utf8'), before);
  assert.match(fs.readFileSync(result.files.markdown, 'utf8'), /No complete matched opening blocks/);
});

test('a shortened completed journal cannot silently abandon its stored checkpoint', t => {
  const { source, parent, run } = fixture(), directory = temporary(t), first = run(1);
  writeRoot(directory, parent); writeRun(directory, source, 'control', run(0));
  writeRun(directory, source, 'amazon-1', first); writeMaterialReport(directory);
  const checkpoint = fs.readFileSync(path.join(directory, 'estimates/amazon-64.json'), 'utf8');
  const report = fs.readFileSync(path.join(directory, 'material-report.json'), 'utf8');
  first.records.pop(); writeRun(directory, source, 'amazon-1', first);
  assert.throws(() => writeMaterialReport(directory), /checkpoint no longer has its completed stage/);
  assert.equal(fs.readFileSync(path.join(directory, 'estimates/amazon-64.json'), 'utf8'), checkpoint);
  assert.equal(fs.readFileSync(path.join(directory, 'material-report.json'), 'utf8'), report);
});
