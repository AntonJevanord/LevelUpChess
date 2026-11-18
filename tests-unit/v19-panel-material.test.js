'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { exportDataset, decodeMaterial } = require('../scripts/balance/material-dataset');
const material = require('../scripts/balance/v19-panel-material');
const command = require('../scripts/v19-panel-material');
const A = 'pawn.blue@5', B = 'pawn.blue@7', G = 'king.reserve-bishop@1';
const army = id => id === G ? { upgrades: {}, reserve: [{ id, count: 1 }] } : { upgrades: { c2: id } };
const config = { schemaVersion: 3, comparisons: [
  { id: 'board', armyA: army(A), armyB: army(B) }, { id: 'grant', armyA: army(G), armyB: army(A) },
] };
const profile = compileDesignProfile(createDesignRegistry(config));
const roster = profile.registry.definitions.map(row => ({ ...row, label: row.id }));
const identity = { profileHash: profile.hash, registryHash: profile.registryHash, engineIdentityVerified: false };
const letter = id => profile.registry.allocations.find(row => row.id === id).letter;
let records, rules;
test.before(async () => {
  rules = await createMatchRules({ profile }); records = [];
  for (const aColor of ['w', 'b']) {
    const startFen = rules.startingFen(army(aColor === 'w' ? A : B), army(aColor === 'b' ? A : B));
    const board = rules.createBoard(startFen), moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'], sans = [];
    try {
      for (const move of moves) { sans.push(board.san(move)); assert.ok(board.push(move)); }
      assert.deepEqual(board.outcome(), { result: '0-1', reason: 'checkmate' });
      records.push({ id: `board-${aColor}`, pairId: 'board-pair', comparisonId: 'board', openingId: 'start', aColor,
        attempt: 1, status: 'completed', result: '0-1', reason: 'checkmate', startFen, finalFen: board.fen(),
        moves, sans, openingMoves: [], openingPlies: 0, totalPlies: 4, playedPlies: 4,
        profileHash: profile.hash, registryHash: profile.registryHash, variant: profile.variant,
        royalMode: 'king', evaluationCaveat: null,
        engine: { nodes: 40000, threads: 1, hashMb: 32, maxPlies: 400 }, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } });
    } finally { board.dispose(); }
  }
});
const stage = selected => ({ key: 'batch-01', nodes: 40000, profile, identity, records: selected,
  comparisons: [{ id: 'board', kind: 'head', designA: A, designB: B }, { id: 'grant', kind: 'head', designA: G, designB: A }] });

test('compact stored profiles reconstruct their separate registry without changing archived bytes', () => {
  const manifest = { config, designRegistry: profile.registry,
    designProfile: { variant: profile.variant, config: profile.config, hash: profile.hash, registryHash: profile.registryHash } };
  assert.equal(manifest.designProfile.registry, undefined, 'this is the real saved-manifest shape');
  const before = JSON.stringify(manifest), calls = [];
  const restored = command.restorePanelProfile(manifest, (registry, evaluation) => {
    calls.push({ registry, evaluation }); return compileDesignProfile(registry, evaluation);
  });
  assert.deepEqual(restored, profile);
  assert.deepEqual(calls, [{ registry: manifest.designRegistry, evaluation: config.evaluation }]);
  assert.equal(JSON.stringify(manifest), before);
  for (const field of ['variant', 'config', 'hash', 'registryHash']) {
    const changed = structuredClone(manifest); changed.designProfile[field] += '-changed';
    assert.throws(() => command.restorePanelProfile(changed, compileDesignProfile), /differs from its archived/);
  }
  assert.throws(() => command.restorePanelProfile({ designProfile: manifest.designProfile }, compileDesignProfile), /archived design registry/);
});

test('legacy export still refuses reserve profiles unless board-only mode is explicitly requested', async () => {
  assert.throws(() => decodeMaterial(records[0].startFen, profile), /pocket-aware/);
  await assert.rejects(exportDataset({ sources: [{ id: 'fixture', records, identity }], profile }), /pocket-aware/);
  const data = await exportDataset({ sources: [{ id: 'fixture', records, identity }], profile, boardOnly: true,
    sampling: { minPly: 0, stride: 1, stableBefore: 0, stableAfter: 0 } });
  assert.equal(data.profile.hash, profile.hash); assert.deepEqual(data.profile.registry, profile.registry);
  assert.deepEqual(data.reservePolicy.excludedDesignIds, [G]); assert.equal(data.reservePolicy.profileUnchanged, true);
  assert.equal(data.featureNames.includes(`bonus:${G}`), false); assert.equal(data.coverage.completedGames, 2);
  assert.equal(data.coverage.accepted, 8);
  assert.ok(data.samples.every(row => !row.fen.includes(`[${letter(G)}`)));
});

test('explicit board-only decoding rejects occupied pockets, reserve pieces on board and drops', async () => {
  const empty = '4k3/8/8/8/8/8/8/4K3[] w - - 0 1';
  assert.equal(decodeMaterial(empty, profile, { boardOnly: true }).totalPieces, 2);
  assert.throws(() => decodeMaterial(empty.replace('[]', `[${letter(G).toUpperCase()}]`), profile, { boardOnly: true }), /reserve pockets/);
  assert.throws(() => decodeMaterial(empty.replace('4K3[]', `3${letter(G).toUpperCase()}K3[]`), profile, { boardOnly: true }), /Unknown material piece/);
  const changed = structuredClone(records); changed[0].moves[0] = `${letter(G).toUpperCase()}@e4`;
  await assert.rejects(exportDataset({ sources: [{ id: 'fixture', records: changed, identity }], profile, boardOnly: true }), /reserve drops/);
  await assert.rejects(exportDataset({ sources: [{ id: 'fixture', records, identity }], profile, boardOnly: 'yes' }), /boolean/);
});

test('selection excludes complete grant cells, retains their IDs and never counts truncated partners', () => {
  const grant = records.map(row => ({ ...structuredClone(row), id: `grant-${row.aColor}`, pairId: 'grant-pair', comparisonId: 'grant' }));
  const inputs = [...records, ...grant];
  const selected = material.selectBoardPairs([stage(inputs)], profile);
  assert.equal(selected.sources[0].records.length, 2); assert.equal(selected.excluded.grantGames, 2);
  assert.equal(selected.excluded.grantPairs, 1); assert.equal(selected.excluded.grantGameIds.length, 2);
  assert.equal(inputs.length, 4, 'source attempts are not rewritten or removed');
  const truncated = structuredClone(records); truncated[0].status = 'truncated'; truncated[0].result = '*';
  const partial = material.selectBoardPairs([stage(truncated)], profile);
  assert.equal(partial.sources.length, 0); assert.equal(partial.excluded.truncatedGames, 1); assert.equal(partial.excluded.unpairedGames, 1);
});

test('whole-piece feature conversion subtracts custom counts from ordinary families without remapping semantic IDs', () => {
  const names = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'tempo', `bonus:${A}`, `bonus:${B}`];
  const data = { featureNames: names, samples: [{ x: [2, 0, 0, 0, 0, 1, 1, -1] }], profile: { hash: profile.hash },
    limitations: ['Ordinary family counts plus upgrade bonuses are model features, not intrinsic exchange prices or engine MG/EG parameters.'] };
  const converted = material.wholePieceDataset(data, profile);
  assert.deepEqual(converted.featureNames.slice(-2), [`piece:${A}`, `piece:${B}`]);
  assert.deepEqual(converted.samples[0].x, [2, 0, 0, 0, 0, 1, 1, -1]);
  const one = material.wholePieceDataset({ ...data, samples: [{ x: [2, 0, 0, 0, 0, 1, 1, 0] }] }, profile);
  assert.equal(one.samples[0].x[0], 1); assert.equal(data.samples[0].x[0], 2);
  assert.deepEqual(converted.profile, data.profile);
  assert.match(converted.limitations[0], /whole-piece/);
});

test('actual legal replay with no eligible late positions withholds prices and keeps grant exclusions explicit', async () => {
  const grant = records.map(row => ({ ...structuredClone(row), id: `grant-${row.aColor}`, pairId: 'grant-pair', comparisonId: 'grant' }));
  const input = [...records, ...grant], before = JSON.stringify(input);
  const result = await material.analyzeBoardMaterial({ stages: [stage(input)], profile, roster, bootstrap: 0,
    openingGroups: { start: 'family-1' }, rulesFactory: async () => rules });
  assert.equal(result.report.status, 'unsupported-estimates'); assert.equal(result.report.exclusions.grantGames, 2);
  assert.equal(result.report.coverage.completedGames, 2); assert.equal(result.report.coverage.accepted, 0);
  assert.ok(result.report.estimates.pieces.every(row => row.total === null));
  assert.equal(JSON.stringify(input), before);
  assert.match(material.renderMaterial(result.report), /Estimates are withheld/);
  assert.equal(result.dataset.profile.hash, profile.hash);
});

test('material CLI validates options, keeps output separate and refuses active source locks or tampering', t => {
  assert.deepEqual(command.parseArgs(['--run', 'a', '--out', 'b']), { run: 'a', out: 'b', bootstrap: 100, seed: 42 });
  for (const args of [[], ['--run', 'a'], ['--run', 'a', '--out', 'b', '--engine', 'bad'],
    ['--run', 'a', '--out', 'b', '--bootstrap', '1001'], ['--run', 'a', '--out', 'b', '--seed', '-1']]) assert.throws(() => command.parseArgs(args));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-material-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); fs.mkdirSync(source);
  assert.throws(() => command.validateOutput(source, path.join(source, 'analysis')), /outside/);
  assert.throws(() => command.validateOutput(source, root), /outside/);
  fs.writeFileSync(path.join(source, '.v19-panel.lock'), '{}');
  assert.throws(() => command.loadPanel(source), /Stop the source panel/);
  fs.unlinkSync(path.join(source, '.v19-panel.lock'));
  const file = path.join(source, 'data'); fs.writeFileSync(file, 'unchanged');
  assert.throws(() => command.verifySource([{ file, sha256: 'a'.repeat(64) }]), /changed during analysis/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'unchanged');
  assert.throws(() => command.verifySource([{ file, absent: true }]), /changed during analysis/);
});

test('the offline CLI opens a real current owned runtime without engines and never writes into its source', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-v19-material-owned-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'panel'), out = path.join(root, 'material'); fs.mkdirSync(source);
  const overlay = ensureResearchOverlay({ name: 'tier-panels-v19', entryFile: 'scripts/v19-panels.js',
    definitionFile: 'src/balance-designs-v19-panels.js', cacheDirectory: path.join(source, 'runtime') });
  const plan = require(path.join(overlay.directory, 'scripts/balance/v19-panel-current-plan'));
  const declaration = { ...plan.buildCampaignPlan({ study: 'level1', jobs: 4 }), study: 'level1' };
  const manifest = { ...declaration, planSha256: createHash('sha256').update(JSON.stringify(declaration)).digest('hex'),
    runId: 'owned-fixture-no-games', createdAt: '2026-11-18T00:00:00.000Z', initialOpenings: 8,
    overlaySha256: overlay.manifestSha256,
    identity: require(path.join(overlay.directory, 'scripts/balance/run')).getRunIdentity(process.execPath) };
  const owner = { schemaVersion: 1, format: 'levelup-v19-panel-runtime-owner', study: 'level1', jobs: 4, initialOpenings: 8,
    directory: path.relative(source, overlay.directory).split(path.sep).join('/'), manifestSha256: overlay.manifestSha256 };
  for (const [name, value] of [['panel-runtime.json', owner], ['screen.json', manifest], ['panel-state.json', { runId: manifest.runId, targetOpenings: 8 }]]) fs.writeFileSync(path.join(source, name), JSON.stringify(value));
  const before = Object.fromEntries(fs.readdirSync(source).filter(name => name !== 'runtime').map(name => [name, fs.readFileSync(path.join(source, name), 'utf8')]));
  const result = await command.main(['--run', source, '--out', out, '--bootstrap', '0'], { log() {} });
  assert.equal(result.report.status, 'no-scored-board-pairs');
  assert.equal(result.manifest.engineSearches, 0); assert.equal(result.manifest.newGames, 0);
  assert.equal(result.manifest.actualProfile.roles.reserveTypes.length, 1);
  assert.equal(result.manifest.sourceFilesVerifiedAfterAnalysis, true);
  assert.equal(result.manifest.sourceFormat, 'levelup-v19-tier-panels-004');
  assert.ok(result.manifest.analysisSources.some(row => row.file === 'scripts/balance/material-dataset.js' && /^[a-f0-9]{64}$/.test(row.sha256)));
  assert.deepEqual(fs.readdirSync(source).sort(), [...Object.keys(before), 'runtime'].sort());
  for (const [name, bytes] of Object.entries(before)) assert.equal(fs.readFileSync(path.join(source, name), 'utf8'), bytes);
  assert.ok(fs.existsSync(path.join(out, 'material-report.md')));
  await assert.rejects(command.main(['--run', source, '--out', out], { log() {} }), /new or empty/);
  const tampered = JSON.parse(before['screen.json']); tampered.study = 'level2';
  fs.writeFileSync(path.join(source, 'screen.json'), JSON.stringify(tampered));
  assert.throws(() => command.loadPanel(source), /frozen panel plan|ownership/);
  const changedIdentity = JSON.parse(before['screen.json']); changedIdentity.identity.rulesBundleSha256 = 'f'.repeat(64);
  fs.writeFileSync(path.join(source, 'screen.json'), JSON.stringify(changedIdentity));
  assert.throws(() => command.loadPanel(source), /owned rules\/runner inventory/);
});
