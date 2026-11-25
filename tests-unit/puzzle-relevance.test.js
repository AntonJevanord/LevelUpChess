'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { getPlayableProfile, PLAYABLE_LIBRARIES } = require('../src/design-options');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const examples = require('../src/puzzle-examples.json');
const { buildOrdinaryCounterfactual, createOrdinaryRules, classifyVariantRelevance } = require('../scripts/puzzles/variant-relevance');
const profile = getPlayableProfile(Object.keys(examples.profiles)[0]);
const sha = value => createHash('sha256').update(value).digest('hex');
const letter = (selected, id) => selected.registry.allocations.find(row => row.id === id).letter;
async function fixture(selected, fen, move, initialMoves = []) {
  const rules = await createMatchRules({ profile: selected }), board = rules.createBoard(fen);
  try {
    for (const made of initialMoves) assert.ok(board.push(made));
    if (move) assert.match(board.san(move), /#$/);
    return { ...examples.puzzles[2], id: 'synthetic-counterfactual-fixture', variant: selected.variant,
      initialFen: fen, initialMoves, fen: board.fen(), solverColor: board.turn(),
      goal: { type: 'mate', moves: 1 }, solution: { move: move || examples.puzzles[2].solution.move, replies: [] } };
  } finally { board.dispose(); }
}

test('private movement demotion retains letters, roles, priors and ordinary royal kings without changing original profile bytes', async () => {
  const before = JSON.stringify(profile), receipt = buildOrdinaryCounterfactual(profile);
  assert.equal(receipt.sourceProfileHash, profile.hash);
  assert.notEqual(receipt.variant, profile.variant);
  assert.equal(receipt.hash, sha(receipt.config));
  assert.match(receipt.config, /x:R(?:\n|$)/);
  assert.match(receipt.config, /pawnTypes = pdeh/);
  assert.match(receipt.config, /castlingRookPiece = rlx/);
  assert.match(receipt.config, /pieceValueMg =/);
  assert.ok(!/^king = -$/m.test(receipt.config));
  for (const allocation of profile.registry.allocations) assert.match(receipt.config,
    new RegExp(`customPiece${allocation.slot} = ${allocation.letter}:`));
  const original = await createMatchRules({ profile }), ordinary = await createOrdinaryRules(profile);
  const board = original.createBoard(examples.puzzles[2].fen), baseline = ordinary.createBoard(examples.puzzles[2].fen);
  try { assert.equal(board.san('a7g7'), 'Xg7#'); assert.equal(baseline.san('a7g7'), 'Xg7'); }
  finally { board.dispose(); baseline.dispose(); }
  assert.equal(JSON.stringify(profile), before);
});

test('a Vanguard diagonal mate is exclusive while a pawn-rook ladder mate remains ordinary', async () => {
  const exclusive = await classifyVariantRelevance({ puzzle: examples.puzzles[2], profile, rulesFactory: createMatchRules });
  assert.equal(exclusive.classification, 'exclusive');
  assert.equal(exclusive.proof.status, 'no-forced-mate');
  assert.deepEqual(exclusive.alteredIds, ['rook.purple@10']);
  const l1 = getPlayableProfile(PLAYABLE_LIBRARIES.find(row => row.id === 'v19-level1-expanded').variant);
  const pawnRook = letter(l1, 'rook.blue@3').toUpperCase();
  const puzzle = await fixture(l1, `6k1/R7/1${pawnRook}6/8/8/8/8/K7 w - - 0 1`, 'b6b8');
  const ordinary = await classifyVariantRelevance({ puzzle, profile: l1, rulesFactory: createMatchRules });
  assert.equal(ordinary.classification, 'ordinary');
  assert.equal(ordinary.reason, 'recorded-mating-tree-survives-demotion');
});

test('a stationary upgraded diagonal can decide the mating goal even though the solver moves an ordinary rook', async () => {
  const puzzle = await fixture(profile, '6bk/6R1/5X2/5K2/8/8/8/8 w - - 0 1', 'g7a7');
  const result = await classifyVariantRelevance({ puzzle, profile, rulesFactory: createMatchRules });
  assert.equal(result.classification, 'exclusive');
  assert.deepEqual(result.alteredIds, ['rook.purple@10']);
});

test('work limits, unsupported goals and extra reserve units remain inconclusive rather than variant-exclusive', async () => {
  const limited = await classifyVariantRelevance({ puzzle: examples.puzzles[2], profile, rulesFactory: createMatchRules, nodeLimit: 1 });
  assert.equal(limited.classification, 'unknown'); assert.equal(limited.proof.status, 'unproven');
  assert.equal((await classifyVariantRelevance({ puzzle: { goal: { type: 'anything' } }, profile })).classification, 'unknown');
  const grant = letter(profile, 'king.grant-wd-level3@1').toUpperCase();
  for (const fen of [`7k/X7/5K2/8/8/8/8/${grant}7 w - - 0 1`, `7k/X7/5K2/8/8/8/8/8[${grant}] w - - 0 1`]) {
    const puzzle = { ...examples.puzzles[2], initialFen: fen, fen };
    const result = await classifyVariantRelevance({ puzzle, profile, rulesFactory: createMatchRules });
    assert.equal(result.classification, 'unknown'); assert.equal(result.reason, 'no-ordinary-baseline-for-additional-piece');
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(classifyVariantRelevance({ puzzle: examples.puzzles[2], profile, signal: controller.signal }), { name: 'AbortError' });
  const invalid = { ...examples.puzzles[2], solution: { move: 'a7a6', replies: [] } };
  assert.equal((await classifyVariantRelevance({ puzzle: invalid, profile, rulesFactory: createMatchRules })).reason, 'original-mating-tree-invalid');
});

test('private ordinary pawn promotions, en passant, custom-rook castling and finite drops retain the original role machinery', async () => {
  const rules = await createOrdinaryRules(profile), pawn = letter(profile, 'pawn.level3-six-knight@1').toUpperCase();
  for (const [fen, expected] of [[`8/3${pawn}4/7k/8/8/8/8/K7 w - - 0 1`, ['d7d8q', 'd7d8r', 'd7d8b', 'd7d8n']],
    [`7k/8/8/2${pawn}p4/8/8/8/K7 w - d6 0 1`, ['c5d6']],
    ['k7/8/8/8/8/8/8/4K2X w K - 0 1', ['e1g1']]]) {
    const board = rules.createBoard(fen);
    try { for (const move of expected) assert.ok(board.moves().includes(move), move); }
    finally { board.dispose(); }
  }
  const grant = letter(profile, 'king.grant-wd-level3@1').toUpperCase();
  const board = rules.createBoard(`7k/8/8/8/8/8/8/K7[${grant}] w - - 0 1`);
  try {
    assert.ok(board.moves().includes(`${grant}@d4`)); assert.ok(!board.moves().includes(`${grant}@d5`));
  } finally { board.dispose(); }
});

test('source histories with a repeated position are not silently reset for exclusivity claims', async () => {
  const fen = '7k/X7/5K2/8/8/8/8/8 b - - 0 1';
  const puzzle = await fixture(profile, fen, undefined, ['h8g8', 'a7a6', 'g8h8', 'a6a7']);
  const result = await classifyVariantRelevance({ puzzle, profile, rulesFactory: createMatchRules });
  assert.equal(result.classification, 'unknown'); assert.equal(result.reason, 'repeated-position-in-source-history');
});

test('material comparison passes unchanged valuation and declared tactical bounds to its goal prover', async () => {
  const puzzle = { ...examples.puzzles[2], goal: { type: 'material', moves: 2, minimumGain: 200, settlePlies: 4 } };
  let calls = 0;
  for (const [status, expected] of [['proved', 'ordinary'], ['ambiguous', 'ordinary'], ['no-material-win', 'exclusive'], ['unproven', 'unknown']]) {
    const result = await classifyVariantRelevance({ puzzle, profile, rulesFactory: createMatchRules,
      async proveGoal(options) {
        calls++; assert.equal(options.profile, profile); assert.equal(options.maxMoves, 2); assert.equal(options.minimumGain, 200);
        assert.equal(options.settlePlies, 4); assert.deepEqual(options.initialMoves, []);
        assert.equal(options.rules.sourceProfileHash, profile.hash); return { status };
      } });
    assert.equal(result.classification, expected);
  }
  assert.equal(calls, 4);
});

test('real material certificates distinguish a Vanguard diagonal capture from an ordinary rook capture', async () => {
  const { proveMaterial } = require('../scripts/puzzles/material-proof');
  const data = require('../src/puzzle-data');
  const native = require('../dist/rules-node.cjs');
  await native.initVariantRules(profile.variant);
  const createGame = (fen, variant) => new native.VariantGame(fen, variant);
  const rules = await createMatchRules({ profile });
  const vanguard = letter(profile, 'rook.purple@10').toUpperCase();
  for (const [rawFen, expectedMove, classification] of [
    [`7k/8/8/4q3/3${vanguard}4/8/1P6/K7 w - - 0 1`, 'd4e5', 'exclusive'],
    [`8/7k/3q4/8/3${vanguard}4/8/1P6/K7 w - - 0 1`, 'd4d6', 'ordinary'],
  ]) {
    const board = rules.createBoard(rawFen), fen = board.fen(); board.dispose();
    const proof = await proveMaterial({ rules, profile, initialFen: fen, maxMoves: 1 });
    assert.equal(proof.status, 'proved'); assert.equal(proof.solution.move, expectedMove);
    const puzzle = { id: 'synthetic-material-relevance', title: 'Material relevance verification fixture',
      variant: profile.variant, initialFen: fen, initialMoves: [], fen, solverColor: 'w',
      goal: proof.goal, solution: proof.solution, provenance: { kind: 'authored' } };
    puzzle.pieces = await data.derivePuzzlePieces(puzzle, { createGame });
    const result = await classifyVariantRelevance({ puzzle, profile, rulesFactory: createMatchRules });
    assert.equal(result.classification, classification);
  }
});
