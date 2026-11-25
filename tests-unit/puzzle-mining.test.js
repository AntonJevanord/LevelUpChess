'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const command = require('../scripts/mine-puzzles');
const mining = require('../scripts/puzzles/mining');
const model = require('../src/puzzle-data');
const { getPlayableProfile, PLAYABLE_LIBRARIES } = require('../src/design-options');
const { placementFromMap } = require('../src/profile-fen');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const native = require('../dist/rules-node.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let root, profile, rules, source, createGame;
test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-puzzle-mining-test-'));
  const sourceRoot = path.join(root, 'synthetic-source'); fs.mkdirSync(sourceRoot);
  const file = path.join(sourceRoot, 'fixture.txt'); fs.writeFileSync(file, 'Synthetic unscored pipeline fixture.');
  const library = PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level3-expanded'); profile = getPlayableProfile(library.variant);
  rules = await createMatchRules({ profile });
  const type = profile.registry.allocations.find(row => row.id === 'rook.purple@10').letter.toUpperCase();
  const board = rules.createBoard(`${placementFromMap(new Map(Object.entries({ f6: 'K', g8: 'k', a7: type })))} b - - 0 1`);
  const startFen = board.fen(); assert.ok(board.push('g8h8')); assert.ok(board.push('a7g7'));
  const record = { id: 'synthetic-vanguard-finish', attempt: 1, status: 'completed', result: '1-0', reason: 'checkmate',
    startFen, finalFen: board.fen(), moves: ['g8h8', 'a7g7'], openingMoves: [], openingId: 'synthetic-prefix' };
  board.dispose();
  source = { root: sourceRoot, manifest: { runId: 'synthetic-mining-fixture', format: 'synthetic-fixture', initialOpenings: 8 },
    files: [{ file, sha256: sha(fs.readFileSync(file)) }],
    contexts: [{ key: 'synthetic-context', profile, rulesFactory: createMatchRules, records: [record], identity: { runId: 'synthetic-mining-fixture',
      stageKey: 'synthetic-stage', cohort: 'fixture', engineSha256: 'a'.repeat(64) } }],
    verify() { assert.equal(sha(fs.readFileSync(file)), source.files[0].sha256); } };
  await native.initVariantRules(profile.variant);
  createGame = (fen, variant) => new native.VariantGame(fen, variant);
});
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('mining CLI keeps explicit goal/mix limits and refuses ignored or changed resume settings', async () => {
  assert.equal(command.parseArgs(['--help']).help, true);
  const options = command.parseArgs(['--run', 'one', '--run', 'two', '--out', 'new', '--variant-share', '90', '--goals', 'mate', '--min-moves', '3', '--max-moves', '5']);
  assert.deepEqual(options.runs, ['one', 'two']); assert.equal(options.settings.variantShare, 90);
  assert.deepEqual(options.settings.goals, ['mate']); assert.equal(options.settings.maxMoves, 5);
  for (const args of [[], ['--run', 'a'], ['--run', 'a', '--out', 'x', '--variant-share', '101'],
    ['--run', 'a', '--out', 'x', '--goals', 'mate,mate'], ['--run', 'a', '--out', 'x', '--max-moves', '6'],
    ['--run', 'a', '--out', 'x', '--min-moves', '4'], ['--run', 'a', '--resume', 'x', '--nodes', '20000'],
    ['--run', 'a', '--check', '--engine', 'x']]) assert.throws(() => command.parseArgs(args));
  const checked = await command.main(['--run', 'synthetic', '--check'], { load: () => source, log() {}, mine() { assert.fail('check cannot mine'); } });
  assert.equal(checked.games, 1);
});

test('rounded mix quotas never turn unknown checks into exclusive puzzles or discard verified overflow', () => {
  const rows = (type, count) => Array.from({ length: count }, (_, index) => ({ id: type + index,
    status: 'verified', puzzle: { id: type + index, relevance: { classification: type } } }));
  const bank = [...rows('exclusive', 20), ...rows('ordinary', 10), { status: 'rejected', relevance: { classification: 'unknown' } }];
  const original = JSON.stringify(bank), chosen = mining.selectMix(bank, 90, 20);
  assert.deepEqual(chosen.selected, { exclusive: 18, ordinary: 2 }); assert.equal(chosen.actualShare, 90);
  assert.equal(chosen.puzzles.length, 20); assert.equal(JSON.stringify(bank), original);
  assert.equal(mining.selectMix(rows('ordinary', 5), 100, 5).puzzles.length, 0);
  assert.equal(mining.selectMix(rows('exclusive', 5), 0, 5).puzzles.length, 0);
  assert.equal(mining.selectMix(bank, 100, 20).selected.ordinary, 0);
});

class ScreenEngine {
  static starts = 0; static closes = 0;
  async start() { ScreenEngine.starts++; }
  async close() { ScreenEngine.closes++; }
  async perft({ fen }) { const board = rules.createBoard(fen); try { return board.moves(); } finally { board.dispose(); } }
  async search() { return { move: 'a7g7', scoreInfo: { score: { type: 'mate', value: 1 }, pv: ['a7g7'] } }; }
}
const settings = { ...command.DEFAULTS, goals: ['mate'], minMoves: 1, maxMoves: 1,
  maxGames: 1, maxPositions: 2, positionsPerGame: 2, maxPuzzles: 1, variantShare: 100, proofNodes: 5000, proofMs: 5000 };
const dependencies = () => ({ sources: [source], settings, enginePath: process.execPath, createGame, Engine: ScreenEngine, log() {} });

test('owned mining keeps exact profiles, verifies real relevance, resumes without new searches and preserves sources', async () => {
  const out = path.join(root, 'proved'), original = fs.readFileSync(source.files[0].file);
  const result = await mining.mine({ ...dependencies(), out });
  assert.equal(result.pack.puzzles.length, 1);
  const puzzle = result.pack.puzzles[0];
  assert.equal(puzzle.relevance.classification, 'exclusive'); assert.equal(puzzle.solution.move, 'a7g7');
  assert.equal(puzzle.provenance.runId, 'synthetic-mining-fixture');
  await model.replayPuzzle(puzzle, { createGame });
  const searches = ScreenEngine.starts;
  const resumed = await mining.mine({ ...dependencies(), out, resume: true });
  assert.equal(resumed.pack.puzzles.length, 1); assert.equal(ScreenEngine.starts, searches);
  assert.equal(ScreenEngine.starts, ScreenEngine.closes);
  assert.deepEqual(fs.readFileSync(source.files[0].file), original);
  assert.equal(fs.existsSync(path.join(out, '.puzzle-mining.lock')), false);
  const owner = JSON.parse(fs.readFileSync(path.join(out, 'mining.json'))); owner.settings.variantShare = 0;
  fs.writeFileSync(path.join(out, 'mining.json'), JSON.stringify(owner));
  await assert.rejects(mining.mine({ ...dependencies(), out, resume: true }), /ownership changed/);
});

test('unknown relevance is withheld, native disagreement aborts and interruption leaves a resumable pack', async () => {
  const withheld = await mining.mine({ ...dependencies(), out: path.join(root, 'unknown'), classify: async () => ({ classification: 'unknown', reason: 'work-limit' }) });
  assert.equal(withheld.pack.puzzles.length, 0); assert.equal(withheld.rows[0].reason, 'unknown-variant-relevance');
  class WrongEngine extends ScreenEngine { async perft() { return []; } }
  const bad = path.join(root, 'bad');
  await assert.rejects(mining.mine({ ...dependencies(), out: bad, Engine: WrongEngine }), /disagree/);
  assert.equal(fs.existsSync(path.join(bad, '.puzzle-mining.lock')), false);
  const controller = new AbortController(), out = path.join(root, 'paused');
  const paused = await mining.mine({ ...dependencies(), out, signal: controller.signal,
    mateProof: async () => { controller.abort(); const error = new Error('stopped'); error.name = 'AbortError'; throw error; } });
  assert.equal(paused.stopped, true); assert.ok(fs.existsSync(path.join(out, 'puzzles.json')));
  const resumed = await mining.mine({ ...dependencies(), out, resume: true });
  assert.equal(resumed.pack.puzzles.length, 1);
});

test('long native PVs remain in the journal but only bounded hints reach the exhaustive prover', async () => {
  class LongPvEngine extends ScreenEngine {
    async search() { return { move: 'a7g7', scoreInfo: { score: { type: 'mate', value: 1 }, pv: Array(40).fill('a7g7') } }; }
  }
  let hints;
  const result = await mining.mine({ ...dependencies(), Engine: LongPvEngine, out: path.join(root, 'long-pv'),
    mateProof: async options => { hints = options.pv; return require('../scripts/puzzles/mate-proof').proveMate(options); } });
  assert.equal(hints.length, 32); assert.equal(result.rows[0].search.pv.length, 40);
  assert.equal(result.pack.puzzles.length, 1);
});

test('oversized certificates skip one candidate, while unrelated replay errors still fail and release ownership', async () => {
  const leaf = { move: 'a7g7', replies: [] };
  const large = { move: 'a7g7', replies: Array.from({ length: 100 }, () => ({ move: 'h8g8',
    next: { move: 'a7g7', replies: Array.from({ length: 100 }, () => ({ move: 'h8g8', next: leaf })) } })) };
  assert.equal(mining.certificateExceedsLimit({ goal: { type: 'mate' }, solution: large }), true);
  assert.equal(mining.certificateExceedsLimit({ goal: { type: 'mate' }, solution: leaf }), false);
  const result = await mining.mine({ ...dependencies(), out: path.join(root, 'large-certificate'),
    mateProof: async () => ({ status: 'proved', moves: 3, solution: large }),
    derive: async () => assert.fail('The oversized tree must be skipped before expensive replay.') });
  assert.equal(result.rows[0].reason, 'certificate-tree-limit'); assert.equal(result.pack.puzzles.length, 0);
  const bad = path.join(root, 'replay-error');
  await assert.rejects(mining.mine({ ...dependencies(), out: bad, derive: async () => { throw new Error('Illegal solver move fixture'); } }), /Illegal solver move fixture/);
  assert.equal(fs.existsSync(path.join(bad, '.puzzle-mining.lock')), false);
});

test('exports respect the browser byte cap without discarding the verified candidate bank', async () => {
  const out = path.join(root, 'large-export');
  const result = await mining.mine({ ...dependencies(), out,
    mateProof: async options => ({ ...await require('../scripts/puzzles/mate-proof').proveMate(options),
      diagnosticPadding: 'x'.repeat(model.MAX_PACK_BYTES) }) });
  assert.equal(result.rows[0].status, 'verified'); assert.equal(result.pack.puzzles.length, 0);
  assert.deepEqual(result.pack.mining.available, { exclusive: 1, ordinary: 0 });
  assert.ok(fs.statSync(path.join(out, 'puzzles.json')).size <= model.MAX_PACK_BYTES);
  assert.match(fs.readFileSync(path.join(out, 'mining-report.md'), 'utf8'), /browser import cap limits this export/);
  assert.match(fs.readFileSync(path.join(out, 'candidates.jsonl'), 'utf8'), /diagnosticPadding/);
});

test('resume preserves a live lock and safely reclaims a definitely dead process lock', async () => {
  const out = path.join(root, 'lock-resume'); await mining.mine({ ...dependencies(), out });
  const owner = JSON.parse(fs.readFileSync(path.join(out, 'mining.json'))), lock = path.join(out, '.puzzle-mining.lock');
  const live = { pid: process.pid, token: 'synthetic-live-token', runId: owner.hash };
  fs.writeFileSync(lock, JSON.stringify(live) + '\n');
  await assert.rejects(mining.mine({ ...dependencies(), out, resume: true }), /locked by process/);
  assert.deepEqual(JSON.parse(fs.readFileSync(lock)), live);
  const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.equal(dead.status, 0); assert.ok(Number.isInteger(dead.pid));
  fs.writeFileSync(lock, JSON.stringify({ ...live, pid: dead.pid, token: 'synthetic-dead-token' }) + '\n');
  const resumed = await mining.mine({ ...dependencies(), out, resume: true });
  assert.equal(resumed.pack.puzzles.length, 1); assert.equal(fs.existsSync(lock), false);
  assert.equal(fs.existsSync(lock + '.reclaim'), false);
});

test('native analysis plus exhaustive proof and movement counterfactual produce a playable variant-specific puzzle', { timeout: 120000 }, async t => {
  const engine = process.env.FAIRY_STOCKFISH_PATH;
  if (!engine || !fs.existsSync(engine)) { t.skip('Set FAIRY_STOCKFISH_PATH for native mining smoke.'); return; }
  const result = await mining.mine({ ...dependencies(), Engine: undefined, enginePath: engine, out: path.join(root, 'native') });
  assert.equal(result.pack.puzzles.length, 1); assert.equal(result.pack.puzzles[0].relevance.classification, 'exclusive');
  await model.replayPuzzle(result.pack.puzzles[0], { createGame });
});
