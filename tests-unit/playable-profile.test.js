const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { getPlayableProfile } = require('../scripts/playable-profile');
const {
  PLAYABLE_PROFILE, EXPERIMENTAL_VARIANT, DESIGN_OPTIONS, pieceInfoForProfile,
  getProfileSnapshot, validateProfileSnapshot, encodeProfileSnapshot, decodeProfileSnapshot,
} = require('../src/design-options');
const { designSetupFromChoices, loadDesignSetup, DEFAULT_DESIGN_CHOICES } = require('../src/design-setup');
const { VariantGame, initVariantRules } = require('../dist/rules-node.cjs');
const { createMatchRules } = require('../dist/balance-rules.cjs');

const letter = (id, color = 'w') => {
  const type = PLAYABLE_PROFILE.registry.allocations.find(item => item.id === id).letter;
  return color === 'w' ? type.toUpperCase() : type;
};
function position(pieces, turn = 'w', castling = '-') {
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
  }).join('/');
  return `${ranks} ${turn} ${castling} - 0 1`;
}
function game(t, fen) {
  const instance = new VariantGame(fen, EXPERIMENTAL_VARIANT);
  t.after(() => instance.dispose());
  return instance;
}
test.before(() => initVariantRules());

test('the embedded profile and native INI reproduce the trusted current catalog', () => {
  const compiled = getPlayableProfile();
  assert.deepEqual(PLAYABLE_PROFILE, compiled);
  assert.equal(readFileSync(require.resolve('../variants/levelup-playable.ini'), 'utf8'), compiled.config);
  assert.equal(compiled.registry.definitions.length, 17);
  assert.equal(new Set(DESIGN_OPTIONS.map(option => option.id)).size, 17);
  assert.equal(compiled.hash, createHash('sha256').update(JSON.stringify({ config: compiled.config, registry: compiled.registry })).digest('hex'));
  assert.equal(DESIGN_OPTIONS.find(option => option.id === 'pawn.purple@2').status, 'parked');
  assert.equal(DESIGN_OPTIONS.find(option => option.id === 'rook.purple@2').status, 'experimental');
});

test('full starting choices resolve IDs for both armies, budgets, and extra units', () => {
  const choices = { ...DEFAULT_DESIGN_CHOICES, a1: 'rook.purple@2', b1: 'knight.purple@1', a7: 'pawn.purple@2', h8: 'rook.purple@1' };
  const setup = designSetupFromChoices(choices, 6);
  assert.deepEqual(setup.costs, { w: 6, b: 6 });
  assert.deepEqual(setup.choices, choices);
  assert.deepEqual(loadDesignSetup(setup.fen), choices);
  assert.match(setup.fen, / w KQkq - 0 1$/);
  assert.throws(() => designSetupFromChoices({ ...choices, d1: 'queen.blue@1' }, 6), /[Bb]udget/);
  assert.throws(() => designSetupFromChoices({ ...choices, b1: 'rook.blue@1' }, 6), /knight|family|design/i);
  assert.throws(() => designSetupFromChoices({ ...choices, a1: 'unknown@1' }, 6), /registered|unknown|design/i);
  assert.throws(() => designSetupFromChoices({ ...choices, e1: 'queen.purple@1' }, 6));
  assert.throws(() => designSetupFromChoices({}, 6));
  assert.throws(() => designSetupFromChoices(choices, 7));
  assert.throws(() => designSetupFromChoices(choices, 0));
});

test('mapped V/W remain a pawn and rook in display, checks, and move generation', t => {
  const pawn = letter('pawn.purple@2'), rook = letter('rook.purple@2');
  assert.equal(pawn, 'V');
  assert.equal(rook, 'W');
  assert.equal(pieceInfoForProfile(PLAYABLE_PROFILE, 'v').family, 'pawn');
  assert.equal(pieceInfoForProfile(PLAYABLE_PROFILE, 'w').family, 'rook');
  const instance = game(t, position({ a1: 'K', h7: 'k', d4: pawn, f4: rook }));
  assert.equal(instance.profile.hash, PLAYABLE_PROFILE.hash);
  assert.equal(instance.pieceInfo('v').level, 3);
  assert.equal(instance.pieceInfo('k').family, 'king');
  assert.ok(instance.moves({ square: 'd4', verbose: true }).some(move => move.to === 'd6'));
  assert.ok(!instance.moves({ square: 'd4', verbose: true }).some(move => move.to === 'd7'));
  assert.throws(() => game(t, position({ a1: 'K', d4: pawn })), /royal king/);
});

test('the playable facade agrees with experiment rules across every profile fixture', async t => {
  const rules = await createMatchRules({ profile: PLAYABLE_PROFILE });
  for (const probe of PLAYABLE_PROFILE.capabilityProbes) {
    const instance = new VariantGame(probe.fen, EXPERIMENTAL_VARIANT);
    const expected = rules.createBoard(probe.fen);
    try {
      assert.deepEqual(instance.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')).sort(), expected.moves().sort(), probe.name);
    } finally { instance.dispose(); expected.dispose(); }
  }
});

test('revised rook captures jump while quiet moves and castling retain rook rules', t => {
  const rook = letter('rook.purple@2');
  const empty = game(t, position({ a1: 'K', h7: 'k', d4: rook }));
  assert.ok(!empty.moves({ square: 'd4', verbose: true }).some(move => move.to === 'f5'));
  const capture = game(t, position({ a1: 'K', h7: 'k', d4: rook, e4: 'P', f5: 'p', f6: 'p' }));
  assert.equal(capture.move({ from: 'd4', to: 'f5' }).captured, 'p');
  capture.undo();
  assert.ok(!capture.moves({ square: 'd4', verbose: true }).some(move => move.to === 'f6'));
  for (const [san, target] of [['O-O', 'f1'], ['O-O-O', 'd1']]) {
    const instance = game(t, position({ e8: 'k', e1: 'K', a1: rook, h1: rook }, 'w', 'KQ'));
    instance.move(san);
    assert.equal(instance.get(target).type, rook.toLowerCase());
    instance.undo();
    assert.match(instance.fen(), / w KQ - 0 1$/);
  }
});

test('mapped pawn promotions remain standard for both colors', t => {
  for (const color of ['w', 'b']) {
    const type = letter('pawn.purple@2', color);
    const from = color === 'w' ? 'b7' : 'b2';
    const to = color === 'w' ? 'b8' : 'b1';
    const instance = game(t, position({ h1: 'K', h8: 'k', [from]: type }, color));
    const promotions = instance.moves({ square: from, verbose: true }).filter(move => move.to === to).map(move => move.promotion).sort();
    assert.deepEqual(promotions, ['b', 'n', 'q', 'r']);
    instance.move({ from, to, promotion: 'q' });
    assert.equal(instance.get(to).type, 'q');
  }
});

test('multi-target en passant and queen landing markers reload under assigned roles', t => {
  const pawn = game(t, position({ h1: 'K', h8: 'k', b2: letter('pawn.blue@1'), c4: 'p' }));
  pawn.move({ from: 'b2', to: 'b5' });
  const reloaded = game(t, pawn.fen());
  const before = reloaded.fen();
  assert.equal(reloaded.move({ from: 'c4', to: 'b3' }).flags, 'e');
  assert.equal(reloaded.get('b5'), undefined);
  reloaded.undo();
  assert.equal(reloaded.fen(), before);
  const queen = game(t, position({ h1: 'K', h8: 'k', b1: letter('queen.blue@1') }));
  queen.move({ from: 'b1', to: 'd2' });
  assert.equal(game(t, queen.fen()).fen(), queen.fen());
});

test('PGN snapshots preserve both revisions, reject tampering, and leave failed imports unchanged', t => {
  const choices = { ...DEFAULT_DESIGN_CHOICES, a1: 'rook.purple@2', h1: 'rook.purple@1', a7: 'pawn.purple@2' };
  const original = game(t, designSetupFromChoices(choices, 6).fen);
  original.move('e4'); original.move('e5');
  const pgn = original.pgn();
  assert.ok(original.getHeaders().LevelUpProfile);
  assert.deepEqual(decodeProfileSnapshot(original.getHeaders().LevelUpProfile), getProfileSnapshot());
  const restored = game(t);
  restored.loadPgn(pgn);
  assert.equal(restored.fen(), original.fen());
  assert.deepEqual(restored.history(), original.history());
  const tampered = structuredClone(getProfileSnapshot());
  tampered.registry.definitions[0].movement = 'Q';
  assert.throws(() => validateProfileSnapshot(tampered));
  assert.throws(() => encodeProfileSnapshot(tampered));
  const encoded = Buffer.from(JSON.stringify(tampered), 'utf8').toString('base64');
  const before = restored.pgn();
  assert.throws(() => restored.loadPgn(pgn.replace(original.getHeaders().LevelUpProfile, encoded)));
  assert.equal(restored.pgn(), before);
  assert.throws(() => restored.loadPgn(pgn.replace(/^\[LevelUpProfile .*\]\n/m, '')));
  assert.equal(restored.pgn(), before);
  restored.undo(); restored.reset();
  assert.equal(restored.profile.hash, PLAYABLE_PROFILE.hash);
  assert.deepEqual(loadDesignSetup(restored.fen()), choices);
});

test('experimental draws remain conservative without suppressing geometric mate', t => {
  const bare = game(t, position({ a1: 'K', h8: 'k' }));
  assert.equal(bare.isDraw(), true);
  const minor = game(t, position({ a1: 'K', h7: 'k', d4: 'B' }));
  assert.equal(minor.isInsufficientMaterial(), false);
  const mate = game(t, '7k/6Q1/5K2/8/8/8/8/8 b - - 100 1');
  assert.equal(mate.isCheckmate(), true);
  assert.equal(mate.isDraw(), false);
});
