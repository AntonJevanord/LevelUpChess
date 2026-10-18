const test = require('node:test');
const assert = require('node:assert/strict');
const { initVariantRules, VariantGame, VARIANT } = require('../dist/rules-node.cjs');

test.before(async () => { await initVariantRules(); });

function game(t, fen) {
  const instance = new VariantGame(fen);
  t.after(() => instance.dispose());
  return instance;
}

function oppositePosition(fen) {
  const fields = fen.split(' ');
  fields[0] = fields[0].split('/').reverse().join('/').replace(/[a-z]/gi, piece => piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase());
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  return fields.join(' ');
}

function mirroredSquare(square) { return square[0] + (9 - Number(square[1])); }

function bothColors(t, fen, check) {
  check(game(t, fen), square => square, 'w');
  check(game(t, oppositePosition(fen)), mirroredSquare, 'b');
}

const upgradeFen = '4k3/8/8/8/3E4/8/8/4K3 w - - 0 1';
const pgn = (fen, moves, extra = '') => `[Variant "${VARIANT}"]\n[SetUp "1"]\n[FEN "${fen}"]\n${extra}\n${moves}`;

test('variant initialization is shared and an ordinary starting army remains valid', t => {
  assert.equal(initVariantRules(), initVariantRules());
  const instance = game(t);
  assert.equal(instance.variant, VARIANT);
  assert.equal(instance.turn(), 'w');
  assert.equal(instance.board().flat().filter(Boolean).length, 32);
  assert.equal(instance.moves().length, 20);
  assert.equal(instance.get('g1').type, 'n');
  assert.equal(instance.get('g9'), undefined);
  assert.throws(() => new VariantGame('not a FEN'), /starting position/);
});

test('a blue knight adds quiet orthogonal steps while retaining knight captures', t => {
  const instance = game(t, '4k3/8/5p2/4p3/4E3/8/8/4K3 w - - 0 1');
  const legal = instance.moves({ square: 'e4', verbose: true });
  assert.equal(instance.get('e4').type, 'e');
  assert.equal(instance.get('e4').color, 'w');
  for (const square of ['d4', 'f4', 'e3']) assert.ok(legal.some(move => move.to === square), square);
  assert.ok(!legal.some(move => move.to === 'e5'));
  const capture = legal.find(move => move.to === 'f6');
  assert.equal(capture.captured, 'p');
  assert.equal(capture.san, 'Exf6+');
  const initial = instance.fen();
  assert.throws(() => instance.move({ from: 'e4', to: 'e5' }), /not legal/);
  assert.equal(instance.fen(), initial);
  instance.move({ from: 'e4', to: 'f6' });
  assert.equal(instance.get('f6').type, 'e');
  assert.equal(instance.get('e4'), undefined);
});

test('the same quiet-step rule applies to black upgrades', t => {
  const instance = game(t, '4k3/8/8/3e4/8/8/8/4K3 b - - 0 1');
  assert.ok(instance.moves({ square: 'd5', verbose: true }).some(move => move.to === 'd4'));
  instance.move({ from: 'd5', to: 'd4' });
  assert.equal(instance.get('d4').color, 'b');
  assert.equal(instance.turn(), 'w');
});

test('orange knights retain every knight move and add exactly two-square sideways jumps for both colors', t => {
  bothColors(t, '7k/8/8/8/3F4/8/8/K7 w - - 0 1', (instance, square, color) => {
    assert.equal(instance.get(square('d4')).type, 'f');
    assert.equal(instance.get(square('d4')).color, color);
    const destinations = instance.moves({ square: square('d4'), verbose: true }).map(move => move.to).sort();
    assert.deepEqual(destinations, ['b3', 'b4', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f4', 'f5'].map(square).sort());
  });
});

test('orange sideways jumps cross friendly and enemy pieces, capture only the landing square, and respect friendly destinations', t => {
  for (const blockers of ['P', 'p']) {
    bothColors(t, `7k/8/8/8/1p${blockers}F${blockers}p2/8/8/K7 w - - 0 1`, (instance, square) => {
      const captures = instance.moves({ square: square('d4'), verbose: true }).filter(move => [square('b4'), square('f4')].includes(move.to));
      assert.equal(captures.length, 2);
      assert.ok(captures.every(move => move.captured === 'p'));
      const before = instance.fen();
      const captured = instance.move({ from: square('d4'), to: square('f4') });
      assert.equal(captured.flags, 'c');
      assert.equal(instance.get(square('e4')).type, 'p');
      assert.equal(instance.get(square('f4')).type, 'f');
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
  bothColors(t, '7k/8/8/8/1PPFPP2/8/8/K7 w - - 0 1', (instance, square) => {
    const destinations = instance.moves({ square: square('d4'), verbose: true }).map(move => move.to);
    assert.ok(!destinations.includes(square('b4')));
    assert.ok(!destinations.includes(square('f4')));
  });
});

test('purple pieces jump exactly two squares in all four orthogonal directions for both colors', t => {
  bothColors(t, '7k/8/8/8/3G4/8/8/K7 w - - 0 1', (instance, square, color) => {
    assert.equal(instance.get(square('d4')).type, 'g');
    assert.equal(instance.get(square('d4')).color, color);
    assert.deepEqual(instance.moves({ square: square('d4'), verbose: true }).map(move => move.to).sort(), ['b4', 'd2', 'd6', 'f4'].map(square).sort());
  });
});

test('purple jumps cross intermediate pieces and capture landing pieces while friendly landing pieces block', t => {
  for (const blockers of ['P', 'p']) {
    bothColors(t, `7k/8/3p4/3${blockers}4/1p${blockers}G${blockers}p2/3${blockers}4/3p4/K7 w - - 0 1`, (instance, square) => {
      const captures = instance.moves({ square: square('d4'), verbose: true });
      assert.deepEqual(captures.map(move => move.to).sort(), ['b4', 'd2', 'd6', 'f4'].map(square).sort());
      assert.ok(captures.every(move => move.captured === 'p'));
      const before = instance.fen();
      instance.move({ from: square('d4'), to: square('d6') });
      assert.equal(instance.get(square('d5')).type, 'p');
      assert.equal(instance.get(square('d6')).type, 'g');
      instance.undo();
      assert.equal(instance.fen(), before);
    });
  }
  bothColors(t, '7k/8/3P4/8/1P1G1P2/8/3P4/K7 w - - 0 1', (instance, square) => {
    assert.deepEqual(instance.moves({ square: square('d4'), verbose: true }), []);
  });
});

test('orange and purple jumps obey pins and deliver checks across occupied intermediate squares for both colors', t => {
  bothColors(t, 'k3r3/8/8/8/8/8/4F3/4K3 w - - 0 1', (instance, square) => {
    assert.deepEqual(instance.moves({ square: square('e2'), verbose: true }), []);
  });
  bothColors(t, 'k3r3/8/8/8/8/8/4G3/4K3 w - - 0 1', (instance, square) => {
    assert.deepEqual(instance.moves({ square: square('e2'), verbose: true }).map(move => move.to), [square('e4')]);
  });
  for (const fen of [
    '8/8/8/8/3FPk2/8/8/K7 b - - 0 1',
    '8/8/3k4/3P4/3G4/8/8/K7 b - - 0 1',
  ]) bothColors(t, fen, instance => assert.equal(instance.isCheck(), true));
  for (const fen of [
    '8/8/8/3k4/3G4/8/8/K7 b - - 0 1',
    '8/8/8/3k4/3F4/8/8/K7 b - - 0 1',
  ]) bothColors(t, fen, instance => assert.equal(instance.isCheck(), false));
});

test('pins and check use the upgraded piece attacks rather than its quiet moves', t => {
  const pinned = game(t, 'k3r3/8/8/8/8/8/4E3/4K3 w - - 0 1');
  assert.deepEqual(pinned.moves({ square: 'e2', verbose: true }).map(move => move.to), ['e3']);
  const knightCheck = game(t, '4k3/8/5E2/8/8/8/8/4K3 b - - 0 1');
  assert.equal(knightCheck.isCheck(), true);
  const quietAdjacent = game(t, '4k3/4E3/8/8/8/8/8/4K3 b - - 0 1');
  assert.equal(quietAdjacent.isCheck(), false);
});

test('move history is copied, undo restores the position, and reset retains setup', t => {
  const instance = game(t, upgradeFen);
  const initial = instance.fen();
  const record = instance.move({ from: 'd4', to: 'd5' });
  assert.equal(record.before, initial);
  assert.equal(record.after, instance.fen());
  assert.equal(record.san, 'Ed5');
  record.san = 'changed';
  instance.history({ verbose: true })[0].from = 'a1';
  assert.equal(instance.history({ verbose: true })[0].from, 'd4');
  assert.deepEqual(instance.history(), ['Ed5']);
  assert.equal(instance.undo().san, 'Ed5');
  assert.equal(instance.fen(), initial);
  assert.equal(instance.undo(), null);
  instance.move('Ed5');
  instance.reset();
  assert.equal(instance.fen(), initial);
  assert.deepEqual(instance.history(), []);
});

test('ordinary castling, en passant, and standard promotions still use legal rules', t => {
  const castles = game(t, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(castles.move('O-O').flags, 'k');
  assert.equal(castles.get('g1').type, 'k');
  assert.equal(castles.get('f1').type, 'r');
  const ep = game(t);
  for (const move of ['e4', 'a6', 'e5', 'd5']) ep.move(move);
  assert.equal(ep.move('exd6').flags, 'e');
  assert.equal(ep.get('d5'), undefined);
  const promotion = game(t, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.deepEqual(promotion.moves({ square: 'a7', verbose: true }).map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
  assert.throws(() => promotion.move({ from: 'a7', to: 'a8', promotion: 'e' }), /not legal/);
  promotion.move({ from: 'a7', to: 'a8', promotion: 'q' });
  assert.equal(promotion.get('a8').type, 'q');
});

test('checkmate, stalemate, insufficient material, and the fifty-move draw are distinguished', t => {
  const mate = game(t);
  for (const move of ['f3', 'e5', 'g4', 'Qh4#']) mate.move(move);
  assert.equal(mate.isCheckmate(), true);
  assert.equal(mate.isGameOver(), true);
  assert.equal(mate.isDraw(), false);
  const stalemate = game(t, 'k7/2Q5/2K5/8/8/8/8/8 b - - 0 1');
  assert.equal(stalemate.isStalemate(), true);
  assert.equal(stalemate.isCheckmate(), false);
  assert.equal(stalemate.isDraw(), true);
  const insufficient = game(t, '4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(insufficient.isInsufficientMaterial(), true);
  const fifty = game(t, '4k3/p7/8/8/8/8/4E3/4K3 w - - 100 51');
  assert.equal(fifty.isDraw(), true);
  assert.equal(fifty.isThreefoldRepetition(), false);
  assert.equal(fifty.isGameOver(), true);
});

test('a lone blue knight has the same mating-material limit as a normal knight', t => {
  for (const piece of ['E', 'e']) {
    const instance = game(t, `4k3/8/8/8/3${piece}4/8/8/4K3 w - - 0 1`);
    assert.equal(instance.isInsufficientMaterial(), true);
    assert.equal(instance.isDraw(), true);
    assert.equal(instance.isGameOver(), true);
  }
  const pair = game(t, '4k3/8/8/8/3EE3/8/8/4K3 w - - 0 1');
  assert.equal(pair.isInsufficientMaterial(), false);
  assert.equal(pair.isGameOver(), false);
  const helper = game(t, '4k3/p7/8/8/3E4/8/8/4K3 w - - 0 1');
  assert.equal(helper.isInsufficientMaterial(), false);
  assert.equal(helper.isGameOver(), false);
});

test('a lone purple piece cannot mate a bare king, while an orange knight can', t => {
  bothColors(t, '7k/8/8/8/3G4/8/8/K7 w - - 0 1', instance => {
    assert.equal(instance.isInsufficientMaterial(), true);
    assert.equal(instance.isDraw(), true);
    assert.equal(instance.isGameOver(), true);
  });
  bothColors(t, '7k/8/8/8/3F4/8/8/K7 w - - 0 1', instance => {
    assert.equal(instance.isInsufficientMaterial(), false);
    assert.equal(instance.isDraw(), false);
    assert.equal(instance.isGameOver(), false);
  });
  bothColors(t, '8/8/8/8/8/8/2K5/k1F5 b - - 0 1', instance => {
    assert.equal(instance.isInsufficientMaterial(), false);
    assert.equal(instance.isCheckmate(), true);
    assert.equal(instance.isDraw(), false);
    assert.equal(instance.isGameOver(), true);
  });
  for (const fen of [
    '7k/p7/8/8/3G4/8/8/K7 w - - 0 1',
    '7k/8/8/8/3GG3/8/8/K7 w - - 0 1',
  ]) bothColors(t, fen, instance => assert.equal(instance.isInsufficientMaterial(), false));
});

test('threefold repetition includes the initial position and is reversed by undo', t => {
  const instance = game(t);
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) instance.move(move);
    assert.equal(instance.isThreefoldRepetition(), repeat === 1);
  }
  assert.equal(instance.isDraw(), true);
  assert.equal(instance.isGameOver(), true);
  instance.undo();
  assert.equal(instance.isThreefoldRepetition(), false);
  assert.equal(instance.isGameOver(), false);
});

test('an unavailable pinned en-passant capture does not distinguish repeated positions', t => {
  const instance = game(t, 'k3r1n1/3p4/8/4P3/8/8/8/4K1N1 b - - 0 1');
  instance.move('d5');
  assert.equal(instance.fen().split(' ')[3], 'd6');
  assert.ok(!instance.moves({ square: 'e5', verbose: true }).some(move => move.to === 'd6'));
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) instance.move(move);
    assert.equal(instance.isThreefoldRepetition(), repeat === 1);
  }
  assert.equal(instance.isDraw(), true);
  assert.equal(instance.isGameOver(), true);
  instance.undo();
  assert.equal(instance.isGameOver(), false);
  instance.move('Ng8');
  assert.equal(instance.isThreefoldRepetition(), true);
});

test('an actually available en-passant capture distinguishes the initial position', t => {
  const instance = game(t, 'k5n1/3p4/8/4P3/8/8/8/4K1N1 b - - 0 1');
  instance.move('d5');
  assert.ok(instance.moves({ square: 'e5', verbose: true }).some(move => move.to === 'd6' && move.flags === 'e'));
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) instance.move(move);
    assert.equal(instance.isThreefoldRepetition(), false);
  }
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) instance.move(move);
  assert.equal(instance.isThreefoldRepetition(), true);
  assert.equal(instance.isGameOver(), true);
});

test('variant PGN round trips setup, SAN history, escaped headers, and result', t => {
  const original = game(t, upgradeFen);
  original.setHeader('Event', 'A "quoted" \\ event');
  original.move('Ed5');
  original.move('Kf8');
  original.setHeader('Result', '1-0');
  const exported = original.pgn({ maxWidth: 15 });
  assert.match(exported, /\[Variant "levelup-knight"\]/);
  assert.match(exported, /\[SetUp "1"\]/);
  assert.match(exported, /\[FEN ".*E.*"\]/);
  const restored = game(t);
  restored.loadPgn(exported);
  assert.equal(restored.fen(), original.fen());
  assert.deepEqual(restored.history(), original.history());
  assert.equal(restored.getHeaders().Event, original.getHeaders().Event);
  assert.equal(restored.getHeaders().Result, '1-0');
  restored.undo();
  original.undo();
  assert.equal(restored.fen(), original.fen());
});

test('orange and purple setup, SAN moves, PGN, and undo round trip with both colors', t => {
  bothColors(t, '7k/8/8/8/3F4/1G6/8/K7 w - - 0 1', (original, square) => {
    const initial = original.fen();
    original.move({ from: square('d4'), to: square('f4') });
    original.move({ from: square('h8'), to: square('h7') });
    original.move({ from: square('b3'), to: square('d3') });
    const restored = game(t);
    restored.loadPgn(original.pgn());
    assert.equal(restored.fen(), original.fen());
    assert.deepEqual(restored.history(), original.history());
    assert.equal(restored.get(square('f4')).type, 'f');
    assert.equal(restored.get(square('d3')).type, 'g');
    for (let move = 0; move < 3; move++) restored.undo();
    assert.equal(restored.fen(), initial);
  });
});

test('PGN main-line comments and annotations are consumed without truncating moves', t => {
  const instance = game(t);
  instance.loadPgn(pgn(upgradeFen, '1.Ed5! {a quiet step}\n1...Kf8 $1 ; black moves\n2.Ee5 *'));
  assert.deepEqual(instance.history(), ['Ed5', 'Kf8', 'Ee5']);
  assert.equal(instance.get('e5').type, 'e');
});

test('a PGN starting with black retains fullmove numbers on export', t => {
  const fen = '4k3/8/8/8/3E4/8/8/4K3 b - - 0 12';
  const instance = game(t);
  instance.loadPgn(pgn(fen, '12... Kf8 13. Ed5 *'));
  assert.match(instance.pgn(), /12\.\.\. Kf8 13\. Ed5 \*/);
  assert.equal(instance.history({ verbose: true })[0].color, 'b');
});

test('invalid or unsupported PGN leaves the current game and its history intact', t => {
  const instance = game(t, upgradeFen);
  instance.move('Ed5');
  const before = instance.pgn();
  const invalid = [
    pgn(upgradeFen, '1. Ed5 Kf8 2. Qa9 *'),
    pgn(upgradeFen, '1. Ed5 * trailing-text'),
    pgn(upgradeFen, '1. Ed5 (1. Ee4) *'),
    pgn(upgradeFen, '1. Ed5 { unfinished *'),
    pgn(upgradeFen, '2. Ed5 *'),
    pgn(upgradeFen, '1. Ed5 *', '[Result "1-0"]'),
    pgn(upgradeFen, '1. Ed5 *', '[Variant "chess"]'),
    '[Variant "chess"]\n\n1. e4 *',
    '[Variant "levelup-knight"]\n[SetUp "1"]\n\n*',
    pgn('not a FEN', '*'),
  ];
  for (const text of invalid) {
    assert.throws(() => instance.loadPgn(text), text);
    assert.equal(instance.pgn(), before, text);
  }
});
