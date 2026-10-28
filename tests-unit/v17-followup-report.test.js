const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { parseArgs, createReview, renderReview, writeReview, checkedInput, main } = require('../scripts/version17-followup-report');

function fixture(experiment) {
  const declaration = loadExperiment(experiment), { config } = declaration;
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation), schedule = makeSchedule(config);
  // Synthetic outcome records only. These are never saved as real matches or
  // presented as native-engine proofs.
  const manifest = { runId: `synthetic-${experiment}`, config, schedule, designRegistry: registry,
    designProfile: { hash: profile.hash, registryHash: registry.hash, variant: profile.variant },
    engineSha256: 'synthetic-only-no-native-proof', configHash: 'synthetic-only' };
  const records = schedule.map(game => ({ id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
    openingId: game.openingId, openingMoves: game.openingMoves, aColor: game.aColor, attempt: 1,
    status: 'completed', result: '1-0', reason: 'synthetic-fixture-only',
    profileHash: profile.hash, registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: config.engine,
    whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
    blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB }));
  return { declaration, manifest, records, root: `/synthetic-only/${experiment}`, source: { completePrefixSha256: 'synthetic-only' } };
}
function archive(value = fixture('level3')) {
  return () => ({ ...value.declaration, records: value.records,
    source: { journal: { sha256: 'synthetic-archive-only' } },
    provenance: { originalManifestSupplied: false, nativePreflightSupplied: false, engineSha256: null } });
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v17-review-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('review accepts any follow-up subset, requires an output and never accepts runner options', () => {
  assert.deepEqual(parseArgs(['--confirm', 'one', '--out', 'review']), { confirm: 'one', out: 'review' });
  assert.deepEqual(parseArgs(['--pawn-grants', 'three', '--revisions', 'two', '--out', 'review']), { 'pawn-grants': 'three', revisions: 'two', out: 'review' });
  assert.deepEqual(parseArgs(['--help']), { help: true });
  for (const args of [[], ['--out', 'x'], ['--confirm', 'x'], ['--confirm'], ['--confirm', 'x', '--jobs', '4', '--out', 'r'], ['--confirm', 'x', '--confirm', 'y', '--out', 'r']]) assert.throws(() => parseArgs(args));
});

test('unchanged panels reuse exactly nine historical candidates and eight distinct new cases without replay', () => {
  const input = fixture('level3-confirm'), before = JSON.stringify(input.records);
  const review = createReview({ confirm: input }, { loadArchive: archive() });
  const { cohorts } = review.sections[0];
  assert.equal(cohorts.length, 3);
  assert.equal(cohorts[0].report.progress.completedGames, 1152);
  assert.equal(cohorts[1].report.progress.completedGames, 576);
  assert.equal(cohorts[2].report.progress.completedGames, 576);
  assert.equal(cohorts[0].report.matrix.rows.length, 9);
  assert.equal(cohorts[0].report.matrix.columns.length, 4);
  assert.ok(cohorts[0].report.comparisons.every(row => row.completePairs === 16 && row.expectedPairs === 16 && row.openings === 16));
  assert.ok(cohorts.every(cohort => cohort.pooled.every(row => row.score === 0.5 && row.complete && row.decision === 'within pooled target')));
  assert.ok(!cohorts[0].report.comparisons.some(row => /pawn-purple-11|bishop-purple-14|bishop-purple-15|rook-purple-13/.test(row.id)));
  assert.equal(JSON.stringify(input.records), before, 'source records are untouched');
  assert.equal(review.sources[1].provenance.originalManifestSupplied, false);
  assert.match(renderReview(review), /original run manifests or native preflight proofs/);
});

test('a missing or truncated color partner never becomes a draw or a complete pooled panel', () => {
  const input = fixture('level3-confirm'), missing = input.records[0];
  input.records[0] = { ...missing, status: 'truncated', result: '*' };
  const review = createReview({ confirm: input }, { loadArchive: archive() });
  const combined = review.sections[0].cohorts[0];
  const affected = combined.report.comparisons.find(row => row.id === missing.comparisonId);
  assert.equal(affected.completePairs, 15);
  assert.equal(affected.pairedGames, 30);
  assert.equal(affected.statusCounts.truncated, 1);
  assert.equal(combined.pooled.filter(row => row.score === null).length, 1);
  assert.equal(combined.pooled.find(row => row.score === null).decision, 'pending complete panel');
  assert.match(renderReview(review), /pending/);
});

test('new revisions keep their own sixteen-case panels and do not import old-design games', () => {
  const inputs = { revisions: fixture('level3-revisions'), 'pawn-grants': fixture('pawn-grants-revisions') };
  const review = createReview(inputs, { loadArchive: () => assert.fail('revisions must not use historical outcomes') });
  assert.deepEqual(review.sections.map(section => section.cohorts.map(cohort => cohort.report.progress.completedGames)), [[640, 320, 320], [384, 192, 192]]);
  for (const section of review.sections) {
    assert.equal(section.cohorts[0].report.comparisons[0].expectedPairs, 16);
    assert.equal(section.cohorts[1].report.comparisons[0].expectedPairs, 8);
    assert.equal(section.cohorts[2].report.comparisons[0].expectedPairs, 8);
  }
});

test('pooling rejects changed armies, engine settings, overlapping starts and wrong native-profile identities', () => {
  const input = fixture('level3-confirm');
  const changedArmy = JSON.parse(JSON.stringify(fixture('level3')));
  const id = input.declaration.config.comparisons[0].id;
  changedArmy.declaration.config.comparisons.find(row => row.id === id).armyA.upgrades = { d2: 'pawn.purple@11' };
  assert.throws(() => createReview({ confirm: input }, { loadArchive: archive(changedArmy) }), /changed design/);
  const changedSearch = JSON.parse(JSON.stringify(fixture('level3')));
  changedSearch.declaration.config.engine.nodes = 100000;
  assert.throws(() => createReview({ confirm: input }, { loadArchive: archive(changedSearch) }), /search or evaluation/);
  const overlapping = JSON.parse(JSON.stringify(fixture('level3')));
  overlapping.declaration.config.openings[0] = input.declaration.config.openings[0];
  assert.throws(() => createReview({ confirm: input }, { loadArchive: archive(overlapping) }), /overlap/);
  const badProfile = fixture('level3-confirm');
  badProfile.records[0].profileHash = 'wrong';
  assert.throws(() => createReview({ confirm: badProfile }, { loadArchive: archive() }), /frozen rules profile/);
  const badPrefix = fixture('level3-confirm');
  badPrefix.records[0].openingMoves = [];
  assert.throws(() => checkedInput('/ignored', 'level3-confirm', () => badPrefix), /opening context changed/);
});

test('empty new journals leave the original cohort visible and combined scores pending', () => {
  const input = fixture('level3-confirm'); input.records = [];
  const review = createReview({ confirm: input }, { loadArchive: archive() });
  assert.ok(review.sections[0].cohorts[0].pooled.every(row => row.score === null));
  assert.ok(review.sections[0].cohorts[1].pooled.every(row => row.score === 0.5));
  assert.equal(review.sections[0].cohorts[2].report.progress.completedGames, 0);
});

test('the actual archived initial screen supplies historical outcomes without inventing a native proof', () => {
  const input = fixture('level3-confirm'); input.records = [];
  const review = createReview({ confirm: input });
  const original = review.sections[0].cohorts.find(cohort => cohort.id === 'original-eight');
  assert.equal(original.report.progress.completedGames, 576);
  assert.equal(original.pooled.find(row => row.label === 'Queen pawn').score, 0.546875);
  assert.equal(original.pooled.find(row => row.label === 'Nightrider').score, 0.4921875);
  assert.equal(original.pooled.find(row => row.label === 'Princess knight').score, 0.6015625);
  const evidence = review.sources.find(source => source.kind === 'archived-level3');
  assert.equal(evidence.provenance.engineSha256, null);
  assert.equal(evidence.provenance.nativePreflightSupplied, false);
  assert.match(evidence.source.journal.sha256, /^[a-f0-9]{64}$/);
});

test('an identical durable journal copy is ignored while conflicting copies fail validation', () => {
  const input = fixture('level3-confirm');
  input.records.push({ ...input.records[0] });
  const review = createReview({ confirm: input }, { loadArchive: archive() });
  const combined = review.sections[0].cohorts[0].report;
  assert.equal(combined.progress.completedGames, 1152);
  assert.equal(combined.progress.duplicateCopiesIgnored, 1);
  input.records[input.records.length - 1].result = '0-1';
  assert.throws(() => createReview({ confirm: input }, { loadArchive: archive() }), /conflicting duplicate/);
});

test('output ownership protects source folders and permits extending a review with a second declared run', t => {
  const root = temporary(t), out = path.join(root, 'review'), inputs = { confirm: fixture('level3-confirm') };
  const first = createReview(inputs, { loadArchive: archive() });
  const files = writeReview(out, first);
  assert.match(fs.readFileSync(files.markdown, 'utf8'), /Unchanged level-three pieces/);
  assert.equal(fs.existsSync(path.join(out, '.v17-review.lock')), false);
  const second = createReview({ ...inputs, revisions: fixture('level3-revisions') }, { loadArchive: archive() });
  writeReview(out, second);
  assert.equal(JSON.parse(fs.readFileSync(files.json, 'utf8')).sections.length, 2);
  assert.throws(() => writeReview(out, first), /another source run/);
  const changed = JSON.parse(JSON.stringify(second)); changed.ownership.confirm.runId = 'different-run';
  assert.throws(() => writeReview(out, changed), /another source run/);
  const foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'games.jsonl'), 'untouched');
  assert.throws(() => writeReview(foreign, first), /empty directory/);
  assert.equal(fs.readFileSync(path.join(foreign, 'games.jsonl'), 'utf8'), 'untouched');
  const unowned = path.join(root, 'unowned'); fs.mkdirSync(unowned); fs.writeFileSync(path.join(unowned, 'v17-review.md'), 'untouched');
  assert.throws(() => writeReview(unowned, first), /unowned/);
});

test('offline main validates each provided folder before writing and does not need an engine', t => {
  const root = temporary(t), input = fixture('level3-confirm'), logs = [];
  let reads = 0;
  const output = main(['--confirm', '/synthetic-only/level3-confirm', '--out', path.join(root, 'review')], {
    read: (directory, declaration) => { reads++; assert.equal(directory, input.root); assert.equal(declaration.experiment, 'level3-confirm'); return input; },
    loadArchive: archive(), log: message => logs.push(message),
  });
  assert.equal(reads, 1); assert.equal(output.review.sections.length, 1);
  assert.match(logs[0], /No games started/);
  const absent = path.join(root, 'should-not-exist');
  assert.throws(() => main(['--confirm', 'bad', '--out', absent], { read: () => { throw new Error('bad native proof'); } }), /bad native proof/);
  assert.equal(fs.existsSync(absent), false);
});
