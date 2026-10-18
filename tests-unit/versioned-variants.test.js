const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initVariantRules, VariantGame, VARIANT, PIECE_VARIANT, SUPPORTED_VARIANTS,
} = require('../dist/rules-node.cjs');

test.before(async () => { await initVariantRules(); });

function game(t, fen, variant = PIECE_VARIANT) {
  const instance = new VariantGame(fen, variant);
  t.after(() => instance.dispose());
  return instance;
}

const purpleFen = '7k/8/8/8/3G4/8/8/K7 w - - 0 1';
const destinations = (instance, square) => instance.moves({ square, verbose: true }).map(move => move.to).sort();

test('both rule versions initialize while the constructor keeps its legacy default', t => {
  assert.deepEqual(SUPPORTED_VARIANTS, ['levelup-knight', 'levelup', 'levelup-v5']);
  assert.equal(Object.isFrozen(SUPPORTED_VARIANTS), true);
  const legacy = new VariantGame();
  t.after(() => legacy.dispose());
  assert.equal(legacy.variant, VARIANT);
  const current = game(t);
  assert.equal(current.variant, PIECE_VARIANT);
  assert.equal(current.moves().length, 20);
  assert.equal(current.board().flat().filter(Boolean).length, 32);
  assert.throws(() => new VariantGame(undefined, 'chess'), /not supported/);
  assert.throws(() => new VariantGame(undefined, 'LEVELUP'), /not supported/);
  assert.throws(() => new VariantGame('invalid', PIECE_VARIANT), /starting position/);
});

test('purple adds one-square orthogonal moves and retains two-square jumps in the current version', t => {
  const current = game(t, purpleFen);
  assert.deepEqual(destinations(current, 'd4'), ['b4', 'c4', 'd2', 'd3', 'd5', 'd6', 'e4', 'f4']);
  const legacy = game(t, purpleFen, VARIANT);
  assert.deepEqual(destinations(legacy, 'd4'), ['b4', 'd2', 'd6', 'f4']);
  assert.throws(() => legacy.move({ from: 'd4', to: 'd5' }), /not legal/);
  current.move({ from: 'd4', to: 'd5' });
  assert.equal(current.get('d5').type, 'g');
});

test('black purple pieces get the same short moves and jumps', t => {
  const current = game(t, 'k7/8/8/3g4/8/8/8/7K b - - 0 1');
  assert.deepEqual(destinations(current, 'd5'), ['b5', 'c5', 'd3', 'd4', 'd6', 'd7', 'e5', 'f5']);
  current.move({ from: 'd5', to: 'e5' });
  assert.equal(current.get('e5').color, 'b');
});

test('purple captures on short steps and jumps across occupied squares without capturing blockers', t => {
  const instance = game(t, '7k/8/3p4/3P4/2pGP3/3p4/8/K7 w - - 0 1');
  assert.deepEqual(destinations(instance, 'd4'), ['b4', 'c4', 'd2', 'd3', 'd6', 'f4']);
  const before = instance.fen();
  assert.equal(instance.move({ from: 'd4', to: 'd3' }).captured, 'p');
  instance.undo();
  assert.equal(instance.fen(), before);
  assert.equal(instance.move({ from: 'd4', to: 'd6' }).captured, 'p');
  assert.equal(instance.get('d5').type, 'p');
  instance.undo();
  instance.move({ from: 'd4', to: 'f4' });
  assert.equal(instance.get('e4').type, 'p');
  assert.equal(instance.get('f4').type, 'g');
});

test('purple short attacks give check and stop kings entering attacked squares', t => {
  const current = game(t, '4k3/4G3/8/8/8/8/8/K7 b - - 0 1');
  const legacy = game(t, '4k3/4G3/8/8/8/8/8/K7 b - - 0 1', VARIANT);
  assert.equal(current.isCheck(), true);
  assert.equal(legacy.isCheck(), false);
  const king = game(t, '8/8/4k3/8/3G4/8/8/K7 b - - 0 1');
  assert.ok(!destinations(king, 'e6').includes('d5'));
  assert.ok(destinations(king, 'e6').includes('e5'));
});

test('current purple has mating material while legacy purple retains its draw rule', t => {
  const current = game(t, purpleFen);
  assert.equal(current.isInsufficientMaterial(), false);
  assert.equal(current.isDraw(), false);
  assert.equal(current.isGameOver(), false);
  const legacy = game(t, purpleFen, VARIANT);
  assert.equal(legacy.isInsufficientMaterial(), true);
  assert.equal(legacy.isDraw(), true);
  const mate = game(t, '8/8/8/8/8/G7/2K5/k7 b - - 0 1');
  assert.equal(mate.isCheckmate(), true);
  assert.equal(mate.isInsufficientMaterial(), false);
  assert.equal(mate.isDraw(), false);
  assert.equal(mate.isGameOver(), true);
});

test('quiet bishop steps do not supply mating material while vertical rooks and amazons do', t => {
  for (const piece of ['E', 'e', 'H', 'h']) {
    const instance = game(t, `8/7k/8/8/3${piece}4/8/K7/8 w - - 0 1`);
    assert.equal(instance.isInsufficientMaterial(), true, piece);
    assert.equal(instance.isDraw(), true, piece);
  }
  for (const piece of ['J', 'j', 'U', 'u']) {
    const instance = game(t, `8/7k/8/8/3${piece}4/8/K7/8 w - - 0 1`);
    assert.equal(instance.isInsufficientMaterial(), false, piece);
  }
});

test('ordinary castling, en passant, promotion, and checks remain available in the current variant', t => {
  for (const [san, king, rook, flag] of [['O-O', 'g1', 'f1', 'k'], ['O-O-O', 'c1', 'd1', 'q']]) {
    const castle = game(t, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    assert.equal(castle.move(san).flags, flag);
    assert.equal(castle.get(king).type, 'k');
    assert.equal(castle.get(rook).type, 'r');
  }
  const ep = game(t);
  for (const san of ['e4', 'a6', 'e5', 'd5']) ep.move(san);
  assert.equal(ep.move('exd6').flags, 'e');
  assert.equal(ep.get('d5'), undefined);
  const promotion = game(t, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.deepEqual(promotion.moves({ square: 'a7', verbose: true }).map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
  promotion.move({ from: 'a7', to: 'a8', promotion: 'r' });
  assert.equal(promotion.isCheck(), true);
  assert.equal(promotion.get('a8').type, 'r');
});

test('PGN imports select their exact rules and preserve them through undo, export, and reset', t => {
  const current = game(t, purpleFen);
  current.move('Gd5');
  current.move('Kh7');
  const original = current.fen();
  const restored = game(t, undefined, VARIANT);
  restored.loadPgn(current.pgn());
  assert.equal(restored.variant, PIECE_VARIANT);
  assert.equal(restored.getHeaders().Variant, PIECE_VARIANT);
  assert.equal(restored.fen(), original);
  assert.deepEqual(restored.history(), ['Gd5', 'Kh7']);
  restored.undo();
  assert.equal(restored.variant, PIECE_VARIANT);
  restored.reset();
  assert.equal(restored.variant, PIECE_VARIANT);
  assert.equal(restored.fen(), purpleFen);
  assert.equal(restored.getHeaders().Variant, PIECE_VARIANT);
  assert.deepEqual(destinations(restored, 'd4'), ['b4', 'c4', 'd2', 'd3', 'd5', 'd6', 'e4', 'f4']);
  // A caller cannot relabel a game under rules that would change its moves.
  restored.setHeader('Variant', VARIANT);
  assert.match(restored.pgn(), /\[Variant "levelup"\]/);
  const legacy = game(t, purpleFen, VARIANT);
  legacy.move('Gd6');
  restored.loadPgn(legacy.pgn());
  assert.equal(restored.variant, VARIANT);
  assert.deepEqual(restored.history(), ['Gd6']);
  restored.reset();
  assert.equal(restored.getHeaders().Variant, VARIANT);
  assert.deepEqual(destinations(restored, 'd4'), ['b4', 'd2', 'd6', 'f4']);
});

test('a failed cross-version PGN import preserves the original rules, position, and history', t => {
  const instance = game(t, purpleFen);
  instance.move('Gd5');
  const before = instance.pgn();
  for (const variant of ['levelup-knight', 'chess', 'levelup-future']) {
    const invalid = before.replace('[Variant "levelup"]', `[Variant "${variant}"]`);
    assert.throws(() => instance.loadPgn(invalid));
    assert.equal(instance.variant, PIECE_VARIANT);
    assert.equal(instance.pgn(), before);
  }
});

test('known PGN variant names accept the case variants supported by earlier saves', t => {
  for (const variant of SUPPORTED_VARIANTS) {
    const instance = game(t, purpleFen, variant);
    instance.move('Gd6');
    const restored = game(t);
    restored.loadPgn(instance.pgn().replace(`[Variant "${variant}"]`, `[Variant "${variant.toUpperCase()}"]`));
    assert.equal(restored.variant, variant);
    assert.equal(restored.getHeaders().Variant, variant);
    assert.equal(restored.fen(), instance.fen());
    assert.match(restored.pgn(), new RegExp(`\\[Variant "${variant}"\\]`));
  }
});
