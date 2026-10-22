const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { designSetupFromChoices } = require('../src/design-setup');
const { PLAYABLE_PROFILE } = require('../src/design-options');
const { PIECE_SLOTS } = require('../src/piece-catalog');
const { ChessClock } = require('../src/clock');

let api, directory;
test.before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-playable-save-'));
  const outfile = path.join(directory, 'save.cjs');
  await build({
    ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: {
      contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules, EXPERIMENTAL_VARIANT } from './src/variant-game.js';",
      resolveDir: path.resolve(__dirname, '..'), loader: 'js',
    },
  });
  api = require(outfile);
  await api.initVariantRules();
});
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

const settings = { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 6 };
const choices = () => Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square,
  ['a1', 'a8'].includes(slot.square) ? 'rook.purple@2' : ['d2', 'd7'].includes(slot.square) ? 'pawn.purple@8' : '',
]));
function game(t, fen = designSetupFromChoices(choices(), 6).fen) {
  const value = new api.VariantGame(fen, api.EXPERIMENTAL_VARIANT);
  t.after(() => value.dispose());
  return value;
}

test('experimental saves retain exact rules, both armies, move history, and paused clock recovery', async t => {
  const original = game(t);
  const clock = new ChessClock();
  clock.reset('five', original.turn());
  clock.start(original.turn());
  for (const move of [{ from: 'd2', to: 'd4' }, { from: 'd7', to: 'd5' }]) {
    const color = original.turn();
    original.move(move);
    clock.completeMove(color, original.turn(), original.isGameOver());
  }
  const saved = api.makeSave(original, settings, clock.snapshot());
  assert.equal(saved.version, 2);
  assert.equal(saved.profile.hash, PLAYABLE_PROFILE.hash);
  assert.equal(saved.profile.config, PLAYABLE_PROFILE.config);
  assert.deepEqual(saved.profile.registry, PLAYABLE_PROFILE.registry);
  assert.deepEqual(saved.setup, { choices: choices(), budget: 6 });
  assert.match(saved.pgn, /\[LevelUpProfile "/);
  const restored = await api.parseSave(JSON.stringify(saved));
  t.after(() => restored.game.dispose());
  assert.equal(restored.game.fen(), original.fen());
  assert.deepEqual(restored.game.history(), original.history());
  assert.equal(restored.game.profile.hash, original.profile.hash);
  assert.deepEqual(restored.settings, settings);
  const recoveredClock = new ChessClock();
  recoveredClock.restore(restored.clock, restored.game.history().length);
  assert.equal(recoveredClock.running, false);
  assert.deepEqual(restored.clock.remaining, saved.clock.remaining);
  restored.game.undo();
  assert.equal(restored.game.turn(), 'b');
  assert.equal(restored.game.get('d7').type, PLAYABLE_PROFILE.registry.allocations.find(a => a.id === 'pawn.purple@8').letter);
});

test('mismatched definitions, allocation, config, format, and setup are rejected before replacement', async t => {
  const original = game(t);
  const saved = api.makeSave(original, settings);
  const before = original.pgn();
  const changes = [
    value => { value.profile.hash = '0'.repeat(64); },
    value => { value.profile.registry.definitions[0].movement = 'Q'; },
    value => { value.profile.registry.allocations[0].letter = 'k'; },
    value => { value.profile.config += '\nking = k:Q\n'; },
    value => { value.version = 1; },
    value => { value.setup.choices.d2 = 'pawn.purple@7'; },
    value => { value.settings.upgradeBudget = 3; value.setup = null; },
    value => { delete value.setup; },
  ];
  for (const change of changes) {
    const damaged = structuredClone(saved);
    change(damaged);
    await assert.rejects(api.parseSave(JSON.stringify(damaged)));
    assert.equal(original.pgn(), before);
  }
});

test('experimental PGN is self-describing and a changed snapshot cannot relabel its moves', async t => {
  const original = game(t);
  original.move({ from: 'd2', to: 'd4' });
  const pgn = api.exportPgn(original);
  const restored = await api.parsePgn(pgn);
  t.after(() => restored.dispose());
  assert.equal(restored.fen(), original.fen());
  assert.equal(restored.profile.registryHash, original.profile.registryHash);
  const encoded = pgn.match(/\[LevelUpProfile "([^"]+)"\]/)[1];
  const snapshot = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  snapshot.registryHash = '0'.repeat(64);
  const altered = pgn.replace(encoded, Buffer.from(JSON.stringify(snapshot)).toString('base64'));
  await assert.rejects(api.parsePgn(altered));
});

test('custom study starts save without inventing a standard-army setup and keep standard promotions', async t => {
  const pawn = PLAYABLE_PROFILE.registry.allocations.find(a => a.id === 'pawn.purple@8').letter.toUpperCase();
  const original = game(t, `7k/1${pawn}6/8/8/8/8/8/K7 w - - 0 1`);
  original.move({ from: 'b7', to: 'b8', promotion: 'q' });
  const saved = api.makeSave(original, settings);
  assert.equal(saved.setup, null);
  const restored = await api.parseSave(JSON.stringify(saved));
  t.after(() => restored.game.dispose());
  assert.equal(restored.game.fen(), original.fen());
  assert.equal(restored.game.get('b8').type, 'q');
  const damaged = structuredClone(saved);
  damaged.setup = { choices: choices(), budget: 6 };
  await assert.rejects(api.parseSave(JSON.stringify(damaged)), /starting choices/);
});

test('valid PGN FEN spacing cannot make a subsequent save lose its starting choices', async t => {
  const original = game(t);
  const initial = original.getHeaders().FEN;
  const imported = await api.parsePgn(original.pgn().replace(`[FEN "${initial}"]`, `[FEN " ${initial.replace(/ /g, '  ')} "]`));
  t.after(() => imported.dispose());
  const saved = api.makeSave(imported, settings);
  assert.deepEqual(saved.setup, { choices: choices(), budget: 6 });
  const restored = await api.parseSave(JSON.stringify(saved));
  t.after(() => restored.game.dispose());
  assert.equal(restored.game.fen(), original.fen());
});

test('paired pawns and inserted guards retain their purchases and deployment through saves, PGN, and undo', async t => {
  const selected = Object.fromEntries(PIECE_SLOTS.map(slot => [slot.square,
    ['b1', 'g8'].includes(slot.square) ? 'knight.purple@2' : ['b2', 'g7'].includes(slot.square) ? 'pawn.orange@2' : '',
  ]));
  const setup = designSetupFromChoices(selected, 6);
  assert.deepEqual(setup.costs, { w: 5, b: 5 });
  const original = game(t, setup.fen);
  const type = id => PLAYABLE_PROFILE.registry.allocations.find(item => item.id === id).letter;
  for (const square of ['b3', 'b4', 'g5', 'g6']) assert.equal(original.get(square).type, type('pawn.orange@2'));
  for (const square of ['b2', 'g7']) assert.equal(original.get(square).type, type('knight.purple@2'));
  assert.equal(original.get('b1').type, 'n');
  assert.equal(original.get('g8').type, 'n');
  original.move({ from: 'b4', to: 'b6' });
  original.move({ from: 'g5', to: 'g3' });

  const saved = api.makeSave(original, settings);
  assert.deepEqual(saved.setup, { choices: selected, budget: 6 });
  const restored = await api.parseSave(JSON.stringify(saved));
  t.after(() => restored.game.dispose());
  assert.equal(restored.game.fen(), original.fen());
  assert.deepEqual(restored.game.history(), original.history());
  restored.game.undo(); restored.game.undo();
  assert.equal(restored.game.fen(), setup.fen);

  const imported = await api.parsePgn(api.exportPgn(original));
  t.after(() => imported.dispose());
  assert.equal(imported.fen(), original.fen());
  assert.deepEqual(api.makeSave(imported, settings).setup, { choices: selected, budget: 6 });
});
