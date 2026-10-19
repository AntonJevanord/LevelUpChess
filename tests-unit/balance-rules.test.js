const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createMatchRules, normalizeArmy } = require('../dist/balance-rules.cjs');

function position(pieces, turn = 'w', rights = '-', ep = '-', halfmove = 0) {
  const ranks = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0;
      rank += piece;
    }
    return rank + (empty || '');
  });
  return `${ranks.join('/')} ${turn} ${rights} ${ep} ${halfmove} 1`;
}

function board(t, rules, fen) {
  const instance = rules.createBoard(fen);
  t.after(() => instance.dispose());
  return instance;
}

function play(instance, moves) {
  for (const move of moves) assert.equal(instance.push(move), true, move);
}

test('army maps default to ordinary pieces and expose only normalized upgrade choices', () => {
  assert.deepEqual(normalizeArmy(), { upgrades: {}, cost: 0, kingLevel: 0 });
  assert.deepEqual(normalizeArmy({ h2: 0, g1: 1, a2: 3, e1: 2 }), {
    upgrades: { a2: 3, e1: 2, g1: 1 }, cost: 6, kingLevel: 2,
  });
  for (const invalid of [null, [], 'army', { a7: 1 }, { e8: 1 }, { a2: -1 }, { a2: 4 }, { a2: 1.5 }, { a2: '1' }]) {
    assert.throws(() => normalizeArmy(invalid));
  }
});

test('symmetric ordinary controls preserve the actual king type and have no implicit blue knight', async t => {
  const rules = await createMatchRules();
  assert.equal(rules.variant, 'levelup-balance-0-0');
  assert.match(rules.config, /king = k:K\n/);
  assert.doesNotMatch(rules.config, /extinctionPseudoRoyal/);
  assert.equal(rules.royalMode, 'king');
  assert.equal(rules.evaluationCaveat, null);
  const fen = rules.startingFen();
  assert.equal(fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(board(t, rules, fen).moves().length, 20);
  assert.deepEqual(normalizeArmy({ b1: 1, c1: 1, d1: 1 }).cost, normalizeArmy({ a2: 3 }).cost);
});

test('Black uses relative White squares and purple knights retain the normal knight', async t => {
  const rules = await createMatchRules({ whiteKing: 1, blackKing: 3 });
  const white = normalizeArmy({ b1: 3, a2: 1, c1: 2, h1: 1, d1: 3, e1: 1 });
  const black = { g1: 3, h2: 3, f1: 3, a1: 2, d1: 1, e1: 3 };
  const fen = rules.startingFen(white, black);
  assert.equal(fen, 'mnbsyjnr/pppppppd/6g1/8/8/1G6/APPPPPPP/RNIUWBNL w KQkq - 0 1');
  assert.ok(board(t, rules, fen).moves().length > 0);
  assert.throws(() => rules.startingFen({}, black), /king levels/);
  assert.throws(() => rules.startingFen(white, { ...black, e1: 2 }), /king levels/);
});

test('material-odds controls remove relative starting pieces and correct castling rights', async t => {
  const rules = await createMatchRules();
  const fen = rules.startingFen({ upgrades: { b1: 3 }, remove: ['a2', 'a1'] }, { upgrades: {}, remove: ['d1', 'h1'] });
  assert.equal(fen, 'rnb1kbn1/pppppppp/8/8/8/1G6/1PPPPPPP/1NBQKBNR w Kq - 0 1');
  assert.ok(board(t, rules, fen).moves().length > 0);
  for (const remove of [['e1'], ['a7'], ['b1', 'b1'], 'a2']) assert.throws(() => rules.startingFen({ upgrades: {}, remove }), /distinct non-king/);
  assert.throws(() => rules.startingFen({ upgrades: { b1: 3 }, remove: ['b1'] }), /cannot also be upgraded/);
});

test('invalid king levels are rejected before loading a profile', async () => {
  for (const value of [-1, 4, 1.5, '1', null]) await assert.rejects(createMatchRules({ whiteKing: value }), /King levels/);
});

test('symmetric upgraded profiles retain actual kings and the selected capture-only abilities', async t => {
  for (const level of [1, 2, 3]) {
    const rules = await createMatchRules({ whiteKing: level, blackKing: level });
    assert.equal(rules.royalMode, 'king');
    assert.equal(rules.evaluationCaveat, null);
    assert.doesNotMatch(rules.config, /extinctionPseudoRoyal|customPiece16/);
    const instance = board(t, rules, position({ a8: 'k', d4: 'K', f4: 'p', d6: 'p', f6: 'p' }));
    assert.ok(instance.moves().includes('d4f4'));
    assert.equal(instance.moves().includes('d4d6'), level >= 2);
    assert.equal(instance.moves().includes('d4f6'), level === 3);
    const mate = board(t, rules, position({ h8: 'k', f7: 'K', f4: 'N' }));
    assert.equal(mate.outcome(), null);
    play(mate, ['f4g6']);
    assert.deepEqual(mate.outcome(), { result: '1-0', reason: 'checkmate' });
  }
});

test('independent royal movement grants captures only to the selected side and level', async t => {
  for (const [whiteKing, blackKing] of [[1, 3], [3, 1]]) {
    const rules = await createMatchRules({ whiteKing, blackKing });
    assert.equal(rules.royalMode, 'pseudo-royal');
    assert.match(rules.evaluationCaveat, /king safety evaluation/);
    const whiteRoyal = ['V', 'W', 'X', 'Y'][whiteKing];
    const blackRoyal = ['v', 'w', 'x', 'y'][blackKing];
    const white = board(t, rules, position({ a8: blackRoyal, d4: whiteRoyal, f4: 'p', d6: 'p', f6: 'p' }));
    assert.ok(white.moves().includes('d4f4'));
    assert.equal(white.moves().includes('d4d6'), whiteKing >= 2);
    assert.equal(white.moves().includes('d4f6'), whiteKing === 3);
    assert.ok(!white.moves().includes('d4b4'), 'no empty-square royal jump');
    const black = board(t, rules, position({ a1: whiteRoyal, d5: blackRoyal, f5: 'P', d3: 'P', f3: 'P' }, 'b'));
    assert.ok(black.moves().includes('d5f5'));
    assert.equal(black.moves().includes('d5d3'), blackKing >= 2);
    assert.equal(black.moves().includes('d5f3'), blackKing === 3);
    assert.ok(!black.moves().includes('d5b5'), 'no empty-square royal jump');
  }
});

test('independent royal attacks give check and cannot be ignored', async t => {
  const rules = await createMatchRules({ whiteKing: 1, blackKing: 3 });
  const instance = board(t, rules, position({ d4: 'W', d6: 'y', a2: 'P' }));
  assert.ok(!instance.moves().includes('a2a3'), 'a pawn move cannot ignore royal check');
  assert.ok(!instance.moves().includes('d4d5'), 'a royal cannot move beside the opponent');
  assert.ok(instance.moves().includes('d4e4'));
  assert.throws(() => rules.createBoard(position({ d4: 'W', d6: 'y' }, 'b')), /inactive king/);
});

test('both independently selected royals castle with upgraded rooks and consume their rights', async t => {
  const rules = await createMatchRules({ whiteKing: 1, blackKing: 3 });
  for (const turn of ['w', 'b']) {
    const instance = board(t, rules, position({ a1: 'L', e1: 'W', h1: 'O', a8: 'm', e8: 'y', h8: 'r' }, turn, 'KQkq'));
    const rank = turn === 'w' ? '1' : '8';
    assert.ok(instance.moves().includes(`e${rank}c${rank}`));
    assert.ok(instance.moves().includes(`e${rank}g${rank}`));
    assert.equal(instance.san(`e${rank}g${rank}`), 'O-O');
    assert.equal(instance.push(`e${rank}g${rank}`), true);
    const remainingRights = instance.fen().split(' ')[2];
    assert.equal(remainingRights, turn === 'w' ? 'kq' : 'KQ');
  }
});

test('royal castling cannot cross, land in, or start in check', async t => {
  const rules = await createMatchRules({ whiteKing: 3, blackKing: 1 });
  for (const file of ['e', 'f', 'g']) {
    const instance = board(t, rules, position({ b8: 'w', [file + '8']: 'r', a1: 'R', e1: 'Y', h1: 'R' }, 'w', 'KQ'));
    assert.ok(!instance.moves().includes('e1g1'), file);
  }
});

test('pseudo-royal validation requires the selected royal type exactly once per side', async () => {
  const rules = await createMatchRules({ whiteKing: 1, blackKing: 3 });
  for (const pieces of [
    { a1: 'W' }, { a1: 'W', h8: 'v' }, { a1: 'V', h8: 'y' },
    { a1: 'W', h8: 'y', b1: 'W' }, { a1: 'W', h8: 'y', b1: 'K' },
    { a1: 'W', h8: 'y', b8: 'x' },
  ]) assert.throws(() => rules.createBoard(position(pieces)), /exactly one selected royal/);
  assert.throws(() => rules.createBoard('not a FEN'), /Invalid/);
});

test('royal king and knight mating material is not prematurely declared drawn', async t => {
  const rules = await createMatchRules({ whiteKing: 1 });
  const instance = board(t, rules, position({ h8: 'v', f7: 'W', f4: 'N' }));
  assert.equal(instance.outcome(), null);
  assert.equal(instance.san('f4g6').endsWith('#'), true);
  play(instance, ['f4g6']);
  assert.deepEqual(instance.outcome(), { result: '1-0', reason: 'checkmate' });
});

test('mate and stalemate take priority over the fifty-move threshold', async t => {
  const rules = await createMatchRules();
  const mate = board(t, rules, position({ h8: 'k', g7: 'Q', g6: 'K' }, 'b', '-', '-', 100));
  assert.deepEqual(mate.outcome(), { result: '1-0', reason: 'checkmate' });
  const stale = board(t, rules, position({ h8: 'k', g6: 'Q', f6: 'K' }, 'b', '-', '-', 100));
  assert.deepEqual(stale.outcome(), { result: '1/2-1/2', reason: 'stalemate' });
});

test('only matching bare royal types receive automatic insufficient-material adjudication', async t => {
  const matching = await createMatchRules({ whiteKing: 3, blackKing: 3 });
  assert.deepEqual(board(t, matching, position({ a1: 'K', h8: 'k' })).outcome(), { result: '1/2-1/2', reason: 'insufficient-material' });
  const asymmetric = await createMatchRules({ whiteKing: 3, blackKing: 0 });
  assert.equal(board(t, asymmetric, position({ a1: 'Y', h8: 'v' })).outcome(), null);
  const ordinary = await createMatchRules();
  assert.equal(board(t, ordinary, position({ a1: 'K', h8: 'k', b1: 'N' })).outcome(), null);
  assert.deepEqual(board(t, ordinary, position({ a1: 'K', h8: 'k', b1: 'N' }, 'w', '-', '-', 100)).outcome(), { result: '1/2-1/2', reason: 'fifty-move-rule' });
});

test('all upgraded pawns promote to standard queen, rook, bishop, or knight', async t => {
  const rules = await createMatchRules({ whiteKing: 2, blackKing: 1 });
  for (const pawn of ['P', 'A', 'C', 'D']) {
    const instance = board(t, rules, position({ a1: 'X', a8: 'w', h7: pawn }));
    assert.deepEqual(instance.moves().filter(move => move.startsWith('h7h8')).sort(), ['h7h8b', 'h7h8n', 'h7h8q', 'h7h8r']);
    assert.ok(!instance.moves().includes('h7h8'));
    play(instance, ['h7h8q']);
    assert.match(instance.fen(), /Q/);
  }
});

test('history replay reproduces threefold repetition and does not leak between boards', async t => {
  const rules = await createMatchRules();
  const first = board(t, rules, rules.startingFen());
  const second = board(t, rules, rules.startingFen());
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  play(first, [...cycle, ...cycle]);
  assert.deepEqual(first.outcome(), { result: '1/2-1/2', reason: 'threefold-repetition' });
  assert.equal(second.outcome(), null);
  play(second, [...cycle, ...cycle]);
  assert.equal(second.fen(), first.fen());
  assert.deepEqual(second.outcome(), first.outcome());
  assert.equal(first.push('a1a8'), false);
});

test('repetition ignores pinned multi-target en passant but preserves a legal capture', async t => {
  const rules = await createMatchRules();
  for (const pinned of [false, true]) {
    const instance = board(t, rules, position({ a1: 'K', [pinned ? 'e8' : 'h8']: 'k', h1: 'N', g8: 'n', d5: 'A', e4: 'p', ...(pinned ? { e1: 'R' } : {}) }, 'b', '-', 'd3d4d5'));
    assert.equal(instance.moves().includes('e4d3'), !pinned);
    const cycle = ['g8f6', 'h1f2', 'f6g8', 'f2h1'];
    play(instance, [...cycle, ...cycle]);
    assert.deepEqual(instance.outcome(), pinned ? { result: '1/2-1/2', reason: 'threefold-repetition' } : null);
    if (!pinned) {
      play(instance, cycle);
      assert.deepEqual(instance.outcome(), { result: '1/2-1/2', reason: 'threefold-repetition' });
    }
  }
});

test('native initial pawn and queen leap markers can be resumed without invented rights', async t => {
  const rules = await createMatchRules();
  const first = board(t, rules, position({ a1: 'K', h8: 'k', d2: 'A', e4: 'p' }));
  play(first, ['d2d5']);
  assert.equal(first.fen().split(' ')[3], 'd3d4d5');
  const resumed = board(t, rules, first.fen());
  assert.ok(resumed.moves().includes('e4d3'));
  play(resumed, ['e4d3']);
  assert.ok(!resumed.fen().includes('A'));
  const queen = board(t, rules, position({ a1: 'K', h8: 'k', d1: 'S' }));
  play(queen, ['d1e3']);
  assert.equal(queen.fen().split(' ')[3], 'e3');
  assert.equal(board(t, rules, queen.fen()).fen(), queen.fen());
  for (const ep of ['d3d4', 'd3d5', 'd3d4d5d6', 'e3', 'd3']) {
    const invalid = position({ a1: 'K', h8: 'k' }, 'b', '-', ep);
    assert.throws(() => rules.createBoard(invalid), /Invalid/);
  }
});

test('cached profiles cannot change boards created with other king pairs', async t => {
  const firstRules = await createMatchRules({ whiteKing: 1, blackKing: 0 });
  const first = board(t, firstRules, position({ d4: 'W', a8: 'v', d6: 'p', f4: 'p' }));
  const expected = first.moves().sort();
  for (const pair of [[2, 0], [3, 0], [3, 2]]) {
    const rules = await createMatchRules({ whiteKing: pair[0], blackKing: pair[1] });
    board(t, rules, rules.startingFen({ e1: pair[0] }, { e1: pair[1] }));
  }
  assert.deepEqual(first.moves().sort(), expected);
  assert.ok(!first.moves().includes('d4d6'));
});

test('disposing a board is idempotent and prevents further native calls', async () => {
  const rules = await createMatchRules();
  const instance = rules.createBoard(rules.startingFen());
  instance.dispose();
  instance.dispose();
  assert.throws(() => instance.fen(), /disposed/);
});

test('native engine and WASM agree for mixed armies and independent royals', { skip: !process.env.FAIRY_STOCKFISH_PATH }, async t => {
  const rules = await createMatchRules({ whiteKing: 1, blackKing: 3 });
  const directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-balance-rules-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'variants.ini');
  writeFileSync(configPath, rules.config);
  const fixtures = [
    rules.startingFen({ a2: 3, b1: 3, c1: 2, a1: 2, d1: 3, e1: 1 }, { h2: 1, g1: 1, f1: 3, h1: 3, d1: 1, e1: 3 }),
    position({ a8: 'y', d4: 'W', f4: 'p', d6: 'p', f6: 'p' }),
    position({ a1: 'W', d5: 'y', f5: 'P', d3: 'P', f3: 'P' }, 'b'),
    position({ a1: 'L', e1: 'W', h1: 'O', a8: 'm', e8: 'y', h8: 'r' }, 'w', 'KQkq'),
    position({ a1: 'L', e1: 'W', h1: 'O', a8: 'm', e8: 'y', h8: 'r' }, 'b', 'KQkq'),
  ];
  for (const fen of fixtures) {
    const instance = board(t, rules, fen);
    const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
      input: `setoption name VariantPath value ${configPath}\nsetoption name UCI_Variant value ${rules.variant}\nposition fen ${fen}\ngo perft 1\nquit\n`,
      encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /Nodes searched:/);
    const moves = [...child.stdout.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
    assert.deepEqual(moves, instance.moves().sort(), fen);
  }
});

test('native engine and WASM agree when symmetric profiles preserve the actual KING type', { skip: !process.env.FAIRY_STOCKFISH_PATH }, async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-balance-kings-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const level of [0, 1, 2, 3]) {
    const rules = await createMatchRules({ whiteKing: level, blackKing: level });
    const configPath = path.join(directory, `${level}.ini`);
    writeFileSync(configPath, rules.config);
    for (const fen of [
      position({ a8: 'k', d4: 'K', f4: 'p', d6: 'p', f6: 'p' }),
      position({ a1: 'L', e1: 'K', h1: 'O', a8: 'm', e8: 'k', h8: 'r' }, 'b', 'KQkq'),
    ]) {
      const instance = board(t, rules, fen);
      const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
        input: `setoption name VariantPath value ${configPath}\nsetoption name UCI_Variant value ${rules.variant}\nposition fen ${fen}\ngo perft 1\nquit\n`,
        encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
      });
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /Nodes searched:/);
      const moves = [...child.stdout.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
      assert.deepEqual(moves, instance.moves().sort(), `${rules.variant}: ${fen}`);
    }
  }
});
