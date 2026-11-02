'use strict';

// Opening legality, value-table and perft diagnostics only. No scored games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
const { UciEngine } = require('../scripts/balance/uci');
const { placementFromMap } = require('../src/profile-fen');

const ROOT = path.resolve(__dirname, '..');
const overlay = ensureResearchOverlay({ root: ROOT, name: 'cataphract-followup-test',
  entryFile: 'scripts/nightrider-balance.js', definitionFile: 'src/balance-designs-cataphract-followup.js' });
const plan = require(path.join(overlay.directory, 'scripts/balance/cataphract-followup-plan'));
const { makeSchedule } = require(path.join(overlay.directory, 'scripts/balance/plan'));
const { createDesignRegistry } = require(path.join(overlay.directory, 'scripts/balance/design-registry'));
const { compileDesignProfile } = require(path.join(overlay.directory, 'scripts/balance/design-profile'));
const { getOfficialReferences } = require(path.join(overlay.directory, 'scripts/balance/official-references'));
const native = process.env.FAIRY_STOCKFISH_PATH || path.join(ROOT, 'node_modules/.cache/levelup-native-values/stockfish');
const configFile = path.join(ROOT, 'prototypes/cataphract/forward-camels.ini');
const variants = ['original', 'no-tall-back', 'forward-half'];
const flip = square => square[0] + (9 - Number(square[1]));
const swap = piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
const offsets = [[-3, -1], [-3, 1], [-1, -3], [-1, 3], [1, -3], [1, 3], [3, -1], [3, 1]];
const targets = (origin, variant) => offsets.filter(([x, y]) => variant === 'original' || variant === 'no-tall-back' ? variant === 'original' || !(Math.abs(y) === 3 && y < 0) : y > 0)
  .map(([x, y]) => [origin.charCodeAt(0) - 97 + x, Number(origin[1]) + y])
  .filter(([x, y]) => x >= 0 && x < 8 && y >= 1 && y <= 8).map(([x, y]) => 'abcdefgh'[x] + y).sort();
let temporary, raw;
const parity = [];

function fen(pieces, black = false) {
  const map = new Map(Object.entries(pieces).map(([square, piece]) => black ? [flip(square), swap(piece)] : [square, piece]));
  return `${placementFromMap(map)} ${black ? 'b' : 'w'} - - 0 1`;
}
function board(variant, pieces, black = false, castling = '-') {
  const fields = fen(pieces, black).split(' '); fields[2] = black ? castling.toLowerCase() : castling;
  const position = fields.join(' ');
  parity.push({ variant, fen: position });
  return new raw.Board(`levelup-cataphract-${variant}`, position, false);
}
const moves = b => b.legalMoves().split(' ').filter(Boolean).sort();
function context(nodes = 40000) {
  const declaration = plan.loadExperiment(nodes), registry = createDesignRegistry(declaration.config);
  const profile = compileDesignProfile(registry, declaration.config.evaluation), schedule = makeSchedule(declaration.config);
  return { declaration, registry, profile, schedule, manifest: { runId: `synthetic-cataphract-${nodes}`, config: declaration.config,
    schedule, designRegistry: registry, designProfile: profile } };
}

test.before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-cataphract-'));
  const output = path.join(temporary, 'raw.cjs');
  await build({ ...rulesBuildOptions(), absWorkingDir: ROOT,
    stdin: { contents: "import Module from 'ffish-es6'; import bytes from 'variant-wasm'; export async function createRaw(config) { const m = await Module({ wasmBinary: Uint8Array.from(atob(bytes), c => c.charCodeAt(0)) }); m.loadVariantConfig(config); return m; }", resolveDir: ROOT, loader: 'js' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none' });
  raw = await require(output).createRaw(fs.readFileSync(configFile, 'utf8'));
});
test.after(() => { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); });

test('512 games compare both restrictions against the frozen four at 40k and 80k', () => {
  const campaign = plan.buildPlan(4);
  assert.equal(campaign.games, 512); assert.equal(campaign.jobs, 4);
  assert.deepEqual(campaign.stages.map(stage => [stage.nodes, stage.games]), [[40000, 256], [80000, 256]]);
  assert.deepEqual(plan.BODIES.map(body => body.movement), ['RsCfC', 'RfhC']);
  const contexts = plan.NODES.map(context);
  const signature = input => input.schedule.map(game => [game.id, game.pairId, game.openingId, game.aColor]);
  assert.deepEqual(signature(contexts[0]), signature(contexts[1]));
  assert.equal(new Set(contexts.map(input => input.profile.hash)).size, 1);
  for (const input of contexts) {
    assert.equal(input.schedule.length, 256); assert.equal(input.declaration.config.comparisons.length, 8);
    assert.equal(new Set(input.schedule.map(game => game.pairId)).size, 128);
    assert.ok(input.schedule.every(game => game.comparison.armyA.upgrades.a1));
  }
  for (const nodes of [20000, 60000]) assert.throws(() => plan.loadExperiment(nodes));
  for (const jobs of [0, 17, 1.5]) assert.throws(() => plan.buildPlan(jobs));
});

test('the sixteen predeclared cases are outside both the first32 panel cases and discovery focus', () => {
  const book = require('../experiments/balance/v17-level3-panel-openings.json');
  assert.deepEqual(plan.OPENINGS, book.slice(32, 48));
  const old = new Set([...book.slice(0, 32), ...book.slice(56, 64)].map(row => row.id));
  assert.ok(plan.OPENINGS.every(row => !old.has(row.id) && row.moves.length === 4));
  assert.equal(new Set(plan.OPENINGS.map(row => row.id)).size, 16);
});

test('restricted bodies share originalRC priors while the root catalog and references remain unchanged', () => {
  const input = context(), rootCatalog = require('../src/design-catalog');
  for (const body of plan.BODIES) {
    assert.equal(rootCatalog.getDesign(body.id), undefined);
    assert.deepEqual(input.declaration.config.evaluation.pieceValues[body.id], { mg: 2240, eg: 2413 });
    assert.ok(input.registry.definitions.find(row => row.id === body.id).roles.castlingRook);
  }
  assert.equal(rootCatalog.getDesign('rook.purple@12').movement, 'RC');
  assert.throws(() => require('../scripts/balance/cataphract-followup-plan').loadExperiment(40000), /isolated research runtime/);
  for (const reference of getOfficialReferences().roster) assert.deepEqual(input.declaration.config.evaluation.pieceValues[reference.id], reference.engineValue);
  assert.equal(input.registry.definitions.length, 6);
  assert.ok(!input.registry.definitions.some(row => row.id === 'rook.purple@12'));
});

test('RsCfC keeps six directions, RfhC only four forward; both move and capture without friendly captures', () => {
  for (const variant of variants) for (const black of [false, true]) for (const origin of ['d4', 'a1', 'h8']) {
    const base = origin === 'a1' ? { h2: 'K', g8: 'k', a1: 'A' } : origin === 'h8' ? { a2: 'K', c1: 'k', h8: 'A' } : { h1: 'K', a8: 'k', d4: 'A' };
    const s = black ? flip : square => square;
    const available = targets(origin, variant);
    for (const occupant of [null, 'p', 'P']) {
      const pieces = { ...base, ...Object.fromEntries(targets(origin, 'original').map(target => [target, occupant]).filter(([, piece]) => piece)) };
      const b = board(variant, pieces, black);
      try {
        const camel = moves(b).filter(move => move.startsWith(s(origin)) && move[0] !== move[2] && move[1] !== move[3]);
        assert.deepEqual(camel, occupant === 'P' ? [] : available.map(target => s(origin) + s(target)).sort(), `${variant} ${origin} ${black} ${occupant}`);
      } finally { b.delete(); }
    }
  }
});

test('camel jumps cross adjacent blockers while rook rays remain blocked', () => {
  for (const variant of variants) for (const black of [false, true]) {
    const s = black ? flip : square => square;
    const pieces = { h1: 'K', a8: 'k', d4: 'A', c4: 'P', e4: 'P', d3: 'P', d5: 'P' };
    const b = board(variant, pieces, black);
    try {
      const actual = moves(b).filter(move => move.startsWith(s('d4')));
      assert.deepEqual(actual, targets('d4', variant).map(target => s('d4') + s(target)).sort());
    } finally { b.delete(); }
  }
});

test('both ordinary castling sides remain legal with a restricted rook', () => {
  for (const variant of variants) for (const black of [false, true]) {
    const s = black ? flip : square => square;
    const b = board(variant, { a1: 'A', e1: 'K', h1: 'A', e8: 'k' }, black, 'KQ');
    try {
      assert.ok(moves(b).includes(s('e1') + s('c1')));
      assert.ok(moves(b).includes(s('e1') + s('g1')));
    } finally { b.delete(); }
  }
});

test('all256 army/color/opening cases pass browser legality without playing games', { timeout: 90000 }, async () => {
  const { validateDesignConfig } = require(path.join(overlay.directory, 'scripts/balance/validate-designs'));
  const result = await validateDesignConfig(context().declaration.config, { standardOpeningSources: true });
  assert.equal(result.games, 256); assert.equal(result.validatedOpenings, 256); assert.equal(result.native, false);
});

test('candidate contrasts require shared complete opening blocks and report overall scores separately', () => {
  const input = context();
  const records = input.schedule.map(game => {
    const value = game.comparisonId.startsWith('forward-half') ? 0.5 : 1;
    return { ...game, attempt: 1, status: 'completed', result: value === 0.5 ? '1/2-1/2' : game.aColor === 'w' ? '1-0' : '0-1',
      reason: value === 0.5 ? 'threefold-repetition' : 'checkmate',
      profileHash: input.profile.hash, registryHash: input.profile.registryHash, variant: input.profile.variant,
      registryReference: 'run.json#designRegistry', engine: input.declaration.config.engine,
      evaluation: input.declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
  });
  const report = plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 40000, manifest: input.manifest, records }]);
  assert.equal(report.contrasts[0].sharedOpenings, 16); assert.equal(report.contrasts[0].difference, -0.5);
  assert.match(plan.renderReport(report), /Overall/); assert.match(plan.renderReport(report), /separate benchmark/);
  const partial = structuredClone(records); partial[0].status = 'truncated'; partial[0].result = '*';
  assert.equal(plan.reportStudy({ runId: 'synthetic' }, [{ nodes: 40000, manifest: input.manifest, records: partial }]).contrasts[0].sharedOpenings, 15);
});

test('native and browser moves match all directional fixtures and candidate automatic values stay diagnostic', { skip: !fs.existsSync(native), timeout: 90000 }, async t => {
  for (const variant of variants) {
    const engine = new UciEngine({ path: native, variantPath: configFile, variant: `levelup-cataphract-${variant}`, options: { threads: 1, hash: 16 } });
    t.after(() => engine.close()); await engine.start();
    for (const fixture of parity.filter(row => row.variant === variant)) {
      const b = new raw.Board(`levelup-cataphract-${variant}`, fixture.fen, false);
      try { assert.deepEqual(await engine.perft({ fen: fixture.fen }), moves(b)); } finally { b.delete(); }
    }
    const actual = (await engine.pieceValues()).pieces.a;
    const expected = variant === 'original' ? { mg: 2240, eg: 2413 } : plan.BODIES.find(body => body.key === variant).automatic;
    for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(actual[field], expected.mg);
    for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(actual[field], expected.eg);
    await engine.close();
  }
  t.diagnostic(`${parity.length} native/browser move-set fixtures; no searches or scored games.`);
});

test('compiled follow-up applies originalRC values to both colors and all six engine tables', { skip: !fs.existsSync(native) }, async t => {
  const { profile } = context(), variantPath = path.join(temporary, 'compiled-profile.ini');
  fs.writeFileSync(variantPath, profile.config);
  const engine = new UciEngine({ path: native, variantPath, variant: profile.variant, options: { threads: 1, hash: 16 } });
  t.after(() => engine.close()); await engine.start();
  const tables = (await engine.pieceValues()).pieces;
  for (const body of plan.BODIES) {
    const letter = profile.registry.allocations.find(row => row.id === body.id).letter;
    for (const type of [letter, letter.toUpperCase()]) {
      for (const field of ['rawMg', 'captureMg', 'evalMg']) assert.equal(tables[type][field], 2240);
      for (const field of ['rawEg', 'captureEg', 'evalEg']) assert.equal(tables[type][field], 2413);
    }
  }
  await engine.close();
});
