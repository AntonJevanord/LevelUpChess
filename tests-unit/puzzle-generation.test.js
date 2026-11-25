'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const command = require('../scripts/generate-puzzles');
const generator = require('../scripts/puzzles/generate');
const model = require('../src/puzzle-data');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const nativeRules = require('../dist/rules-node.cjs');
const profile = require('../src/playable-v19-level3-expanded-profile.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let directory, source, record, context, createGame;
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-puzzle-generation-'));
  const root = path.join(directory, 'synthetic-source'); fs.mkdirSync(root);
  const file = path.join(root, 'source-fixture.json'); fs.writeFileSync(file, 'synthetic pipeline fixture; not a scored game\n');
  const bytes = fs.readFileSync(file), rules = await createMatchRules({ profile });
  const board = rules.createBoard('6k1/X7/5K2/8/8/8/8/8 b - - 0 1');
  const startFen = board.fen(); assert.ok(board.push('g8h8')); assert.ok(board.push('a7g7'));
  assert.equal(board.outcome().reason, 'checkmate');
  record = { id: 'synthetic-vanguard-game', attempt: 1, status: 'completed', result: '1-0', reason: 'checkmate',
    startFen, finalFen: board.fen(), moves: ['g8h8', 'a7g7'], openingMoves: [], openingId: 'synthetic-empty-prefix' };
  board.dispose();
  context = { key: 'synthetic-context', profile, rulesFactory: createMatchRules, records: [record], identity: {
    runId: 'synthetic-puzzle-generation-fixture', stageKey: 'synthetic-stage', cohort: 'new-005',
    engineSha256: 'a'.repeat(64), rulesBundleSha256: sha(fs.readFileSync(path.resolve(__dirname, '../dist/balance-rules.cjs'))) } };
  source = { root, manifest: { runId: context.identity.runId, format: 'synthetic-fixture', initialOpenings: 8 }, contexts: [context],
    files: [{ file, sha256: sha(bytes) }], verify() { assert.deepEqual(fs.readFileSync(file), bytes); } };
  await nativeRules.initVariantRules(profile.variant);
  createGame = (fen, variant) => new nativeRules.VariantGame(fen, variant);
});
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
test('CLI validates bounded pilot options, repeated sources and frozen resume settings', () => {
  assert.equal(command.parseArgs(['--help']).help, true);
  const options = command.parseArgs(['--run', 'a', '--run', 'b', '--out', 'new', '--max-moves', '3', '--all-pieces']);
  assert.deepEqual(options.runs, ['a', 'b']); assert.equal(options.settings.maxMoves, 3); assert.equal(options.settings.variantOnly, false);
  for (const args of [[], ['--run', 'a'], ['--run', 'a', '--out', 'x', '--resume', 'y'],
    ['--run', 'a', '--out', 'x', '--max-puzzles', '1001'], ['--run', 'a', '--out', 'x', '--max-moves', '4'],
    ['--run', 'a', '--resume', 'x', '--nodes', '80000'], ['--run', 'a', '--check', '--engine', 'x']]) assert.throws(() => command.parseArgs(args));
});
test('source check is read-only and never resolves an engine or starts generation', async () => {
  const logs = [];
  const result = await command.main(['--run', 'synthetic', '--check'], { load: () => source, log: text => logs.push(text),
    generate() { assert.fail('check cannot generate'); } });
  assert.equal(result.games, 1); assert.match(logs[0], /No engines/);
});
test('candidate selection replays the entire completed game and excludes forced prefixes and malformed outcomes', async () => {
  const games = generator.planGames([source, source], 10); assert.equal(games.length, 1);
  const candidates = await generator.candidatesForGame(games[0], command.DEFAULTS);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].ply, 1);
  assert.deepEqual(record.moves.slice(0, candidates[0].ply), ['g8h8']);
  await assert.rejects(generator.candidatesForGame({ ...games[0], record: { ...record, finalFen: record.startFen } }, command.DEFAULTS), /recorded checkmate/);
  await assert.rejects(generator.candidatesForGame({ ...games[0], record: { ...record, openingMoves: ['a1a2'] } }, command.DEFAULTS), /forced prefix/);
  const skipped = await generator.candidatesForGame({ ...games[0], record: { ...record, openingMoves: ['g8h8'] } }, command.DEFAULTS);
  assert.equal(skipped.length, 0);
  assert.throws(() => generator.assertOutput([source.root], path.join(source.root, 'puzzles'), false), /separate/);
});

class ScreenEngine {
  static starts = 0; static closes = 0;
  constructor() { this.closed = false; }
  async start() { ScreenEngine.starts++; }
  async close() { if (!this.closed) { ScreenEngine.closes++; this.closed = true; } }
  async perft({ fen }) { const rules = await createMatchRules({ profile }), board = rules.createBoard(fen); try { return board.moves(); } finally { board.dispose(); } }
  async search() { return { scoreInfo: { score: { type: 'mate', value: 1 } } }; }
}
const settings = { ...command.DEFAULTS, maxGames: 1, maxPositions: 1, maxPuzzles: 1 };
const deps = { sources: [], settings, enginePath: process.execPath, Engine: ScreenEngine, derive: model.derivePuzzlePieces,
  validate: model.validatePuzzlePack, log() {} };
test('generation records a proved variant puzzle, imports into shared model and resumes without new engine work', async () => {
  const out = path.join(directory, 'proved'); const before = fs.readFileSync(source.files[0].file);
  const result = await generator.generate({ ...deps, sources: [source], out, createGame });
  assert.equal(result.pack.puzzles.length, 1); assert.equal(result.attempts[0].status, 'accepted');
  const puzzle = result.pack.puzzles[0];
  assert.deepEqual(puzzle.initialMoves, ['g8h8']); assert.equal(puzzle.goal.moves, 1);
  assert.equal(puzzle.solution.move, 'a7g7'); assert.ok(puzzle.pieces.moved.includes('rook.purple@10'));
  assert.equal(puzzle.provenance.runId, 'synthetic-puzzle-generation-fixture');
  await model.replayPuzzle(puzzle, { createGame });
  const count = ScreenEngine.starts;
  const again = await generator.generate({ ...deps, sources: [source], out, resume: true, createGame });
  assert.equal(again.pack.puzzles.length, 1); assert.equal(ScreenEngine.starts, count);
  assert.equal(ScreenEngine.starts, ScreenEngine.closes); assert.deepEqual(fs.readFileSync(source.files[0].file), before);
  assert.equal(fs.existsSync(path.join(out, '.puzzle-generation.lock')), false);
  assert.throws(() => model.validatePuzzlePack({ ...result.pack, profiles: {} }), /profile/i);
});
test('bound-limited and alternative solutions are never exported, and native disagreement cleans up', async () => {
  const limited = await generator.generate({ ...deps, sources: [source], out: path.join(directory, 'limited'),
    settings: { ...settings, proofNodes: 1 }, createGame });
  assert.equal(limited.pack.puzzles.length, 0); assert.equal(limited.attempts[0].reason, 'unproven');
  const out = path.join(directory, 'disagree');
  class WrongEngine extends ScreenEngine { async perft() { return []; } }
  await assert.rejects(generator.generate({ ...deps, sources: [source], out, Engine: WrongEngine, createGame }), /disagree/);
  assert.equal(fs.existsSync(path.join(out, '.puzzle-generation.lock')), false);
  const details = JSON.parse(fs.readFileSync(path.join(out, 'native-rules-mismatch.json')));
  assert.equal(details.gameId, record.id); assert.equal(details.ply, 1);
  assert.equal(details.profile.hash, profile.hash); assert.equal(details.fen.split(' ')[1], 'w');
  assert.deepEqual(details.nativeOnly, []); assert.ok(details.archivedOnly.includes('a7g7'));
  const retry = await generator.generate({ ...deps, sources: [source], out, resume: true, createGame });
  assert.equal(retry.pack.puzzles.length, 1);
});

test('legacy native analysis cannot create a pilot output', async () => {
  const out = path.join(directory, 'legacy-refused');
  await assert.rejects(generator.generate({ ...deps, sources: [source], out, createGame,
    enginePath: path.resolve(__dirname, '../stockfish/fairy-stockfish-largeboard_x86-64.exe') }), /legacy largeboard/);
  assert.equal(fs.existsSync(out), false);
});
test('cancellation preserves a resumable empty pack without accepting the interrupted proof', async () => {
  const out = path.join(directory, 'cancelled'), controller = new AbortController();
  const result = await generator.generate({ ...deps, sources: [source], out, signal: controller.signal, createGame,
    prove: async () => { controller.abort(); const error = new Error('stop'); error.name = 'AbortError'; throw error; } });
  assert.equal(result.stopped, true); assert.equal(fs.existsSync(path.join(out, '.puzzle-generation.lock')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'puzzles.json'))).puzzles.length, 0);
  const resumed = await generator.generate({ ...deps, sources: [source], out, resume: true, createGame });
  assert.equal(resumed.pack.puzzles.length, 1);
});
test('native Fairy-Stockfish screen, exact proof and portable pack agree on a variant mate fixture', { skip: !process.env.FAIRY_STOCKFISH_PATH }, async () => {
  const result = await generator.generate({ ...deps, Engine: undefined, sources: [source],
    enginePath: process.env.FAIRY_STOCKFISH_PATH, out: path.join(directory, 'native-smoke'), createGame });
  assert.equal(result.pack.puzzles.length, 1); assert.equal(result.pack.puzzles[0].provenance.proof.method, 'exhaustive-bounded-mate');
  await model.replayPuzzle(result.pack.puzzles[0], { createGame });
});
