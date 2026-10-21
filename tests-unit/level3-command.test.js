const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { parseArgs, confirmationSelection, verifyCampaignManifest, reserveConfirmation, CLAIM_FILE } = require('../scripts/level3-balance');
const screen = require('../experiments/balance/level3-round-robin.json');
const holdout = require('../experiments/balance/level3-holdout.json');
const mandatory = ['camel-knight-v-amazon', 'standard-control'];

function manifest(input = screen, schedule) {
  const config = normalizeConfig(input), registry = createDesignRegistry(config), profile = compileDesignProfile(registry);
  return { schemaVersion: 1, runId: 'synthetic-screen', configHash: 'fixed-config-hash', config,
    schedule: schedule || makeSchedule(config), designRegistry: registry,
    designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: registry.hash } };
}
function journal(run) {
  return run.schedule.map(game => ({
    id: game.id, pairId: game.pairId, comparisonId: game.comparisonId, openingId: game.openingId,
    aColor: game.aColor, status: 'completed', result: '1/2-1/2', variant: run.designProfile.variant,
    profileHash: run.designProfile.hash, registryHash: run.designRegistry.hash, registryReference: 'run.json#designRegistry',
    engine: run.config.engine, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 },
  }));
}
function temporary(t, run, records) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-level3-command-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'screen'); fs.mkdirSync(source);
  const enginePath = path.join(directory, 'synthetic-engine');
  fs.writeFileSync(enginePath, 'Synthetic identity fixture; never executed.');
  Object.assign(run, require('../scripts/balance/run').getRunIdentity(enginePath));
  fs.writeFileSync(path.join(source, 'run.json'), JSON.stringify(run));
  fs.writeFileSync(path.join(source, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join(''));
  return { source, output: path.join(directory, 'confirmation'), enginePath };
}

test('campaign commands reject ambiguous modes, reduced screens, and incomplete confirmations', async t => {
  assert.deepEqual(parseArgs(['--check']), { check: true });
  assert.deepEqual(parseArgs(['--stage', 'screen', '--out', 'run']), { stage: 'screen', out: 'run' });
  assert.deepEqual(parseArgs(['--resume', 'run']), { resume: 'run' });
  assert.deepEqual(parseArgs(['--report', 'run']), { report: 'run' });
  for (const args of [[], ['--check', '--out', 'run'], ['--stage', 'screen'], ['--stage', 'other', '--out', 'run'],
    ['--stage', 'screen', '--out', 'run', '--comparisons', 'standard-control'], ['--stage', 'confirm', '--out', 'run'],
    ['--resume', 'run', '--out', 'other'], ['--report', 'run', '--stage', 'screen'], ['--out', 'a', '--out', 'b'], ['--limit-pairs', '1']]) assert.throws(() => parseArgs(args));
  const calls = [];
  t.mock.method(require('../scripts/balance'), 'main', async args => { calls.push(args); });
  const { main } = require('../scripts/level3-balance');
  await main(['--stage', 'screen', '--out', 'declared-screen']);
  assert.deepEqual(calls[0], ['--config', path.resolve(__dirname, '../experiments/balance/level3-round-robin.json'), '--out', 'declared-screen']);
  const roster = require('../experiments/balance/level3-roster.json'), cap = roster.maxGames;
  try {
    roster.maxGames = 2001;
    await assert.rejects(main(['--stage', 'screen', '--out', 'over-budget']), /fixed 2000-game/);
    assert.equal(calls.length, 1, 'an edited cap cannot launch the runner');
  } finally { roster.maxGames = cap; }
});

test('confirmation is one explicit 40–140 game selection, keeping both mandatory comparisons', () => {
  assert.equal(confirmationSelection(mandatory).schedule.length, 40);
  const additional = holdout.comparisons.map(item => item.id).filter(id => !mandatory.includes(id)).slice(0, 5);
  const selected = confirmationSelection([...mandatory, ...additional]);
  assert.equal(selected.schedule.length, 140);
  assert.equal(selected.config.comparisons.length, 93, 'filtering never changes the declared design allocation');
  assert.deepEqual(createDesignRegistry(selected.config), createDesignRegistry(normalizeConfig(screen)));
  for (const ids of [[], ['standard-control'], [...mandatory, mandatory[0]], [...mandatory, 'unknown'], [...mandatory, ...additional, 'amazon-control']]) assert.throws(() => confirmationSelection(ids));
});

test('resume accepts only the full screen or declared complete confirmation pairs', () => {
  const original = manifest();
  assert.equal(verifyCampaignManifest(original).stage, 'screen');
  const selected = confirmationSelection(mandatory);
  assert.equal(verifyCampaignManifest(manifest(holdout, selected.schedule)).stage, 'confirm');
  const reduced = structuredClone(original); reduced.schedule = reduced.schedule.slice(0, 2);
  assert.throws(() => verifyCampaignManifest(reduced), /schedule/);
  const changed = structuredClone(original); changed.config.engine.nodes = 1000;
  assert.throws(() => verifyCampaignManifest(changed), /frozen/);
  const partial = manifest(holdout, selected.schedule.slice(1));
  assert.throws(() => verifyCampaignManifest(partial), /schedule/);
});

test('a completed screen reserves only one confirmation destination and fixed selection', t => {
  const run = manifest(), { source, output, enginePath } = temporary(t, run, journal(run));
  const selected = reserveConfirmation(source, output, mandatory, { enginePath });
  assert.equal(selected.schedule.length, 40);
  assert.equal(fs.existsSync(output), false, 'reservation never starts engines or creates the result directory');
  const claim = fs.readFileSync(path.join(source, CLAIM_FILE), 'utf8');
  assert.deepEqual(reserveConfirmation(source, output, [...mandatory].reverse(), { enginePath }).ids, selected.ids);
  assert.equal(fs.readFileSync(path.join(source, CLAIM_FILE), 'utf8'), claim);
  assert.throws(() => reserveConfirmation(source, output + '-second', mandatory, { enginePath }), /already reserved/);
  assert.throws(() => reserveConfirmation(source, output, [...mandatory, 'amazon-control'], { enginePath }), /already reserved/);
  assert.throws(() => reserveConfirmation(source, source, mandatory, { enginePath }), /new output/);
});

test('incomplete, unscored selected pairs or mismatched journals cannot spend the reserve', t => {
  const run = manifest(), records = journal(run), { source, output, enginePath } = temporary(t, run, records.slice(1));
  assert.throws(() => reserveConfirmation(source, output, mandatory, { enginePath }), /Finish or resume/);
  assert.equal(fs.existsSync(path.join(source, CLAIM_FILE)), false);
  const selected = records.find(record => record.comparisonId === mandatory[0]);
  selected.status = 'truncated'; selected.result = '*';
  fs.writeFileSync(path.join(source, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join(''));
  assert.throws(() => reserveConfirmation(source, output, mandatory, { enginePath }), /ten complete/);
  assert.equal(fs.existsSync(path.join(source, CLAIM_FILE)), false);
  selected.status = 'completed'; selected.result = '1/2-1/2'; selected.registryHash = 'altered';
  fs.writeFileSync(path.join(source, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join(''));
  assert.throws(() => reserveConfirmation(source, output, mandatory, { enginePath }), /different definitions/);
  assert.equal(fs.existsSync(path.join(source, CLAIM_FILE)), false);
});

test('different executable, runner or built rules cannot start confirmation or reserve its budget', t => {
  const run = manifest(), { source, output, enginePath } = temporary(t, run, journal(run));
  for (const field of ['engineSha256', 'runnerSha256', 'rulesBundleSha256']) {
    const changed = { ...run, [field]: 'changed' };
    fs.writeFileSync(path.join(source, 'run.json'), JSON.stringify(changed));
    assert.throws(() => reserveConfirmation(source, output, mandatory, { enginePath }), new RegExp(field));
    assert.equal(fs.existsSync(path.join(source, CLAIM_FILE)), false);
  }
  fs.writeFileSync(path.join(source, 'run.json'), JSON.stringify(run));
  fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'existing'), 'Keep this file.');
  assert.throws(() => reserveConfirmation(source, output, mandatory, { enginePath }), /already exists/);
  assert.equal(fs.existsSync(path.join(source, CLAIM_FILE)), false);
});
