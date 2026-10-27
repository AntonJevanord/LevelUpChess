const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const { build } = require('esbuild');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { designSetupFromChoices, designSlots } = require('../src/design-setup');

let api, directory, profile, whiteGuard, blackGuard, setup;
const settings = { opponent: 'local', humanSide: 'w', difficulty: 'medium', flipped: false, upgradeBudget: 9 };
const identity = () => ({ variant: profile.variant, profileHash: profile.hash, registryHash: profile.registryHash });

test.before(async () => {
  profile = getPlayableProfiles().find(value => value.registry.definitions.some(definition => definition.family === 'king' && definition.level === 9));
  assert.ok(profile, 'a current playable library includes the proposed reserve roster');
  whiteGuard = profile.registry.allocations.find(allocation => profile.definitionsByLetter[allocation.letter].family === 'king' && profile.definitionsByLetter[allocation.letter].level === 9);
  blackGuard = profile.registry.allocations.find(allocation => profile.definitionsByLetter[allocation.letter].family === 'king' && profile.definitionsByLetter[allocation.letter].level === 1);
  const choices = Object.fromEntries(designSlots(profile).map(slot => [slot.square, slot.square === 'e1' ? whiteGuard.id : slot.square === 'e8' ? blackGuard.id : '']));
  setup = designSetupFromChoices(choices, 9, profile);
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-reserve-portability-'));
  const outfile = path.join(directory, 'save.cjs');
  await build({
    ...rulesBuildOptions(), bundle: true, platform: 'node', format: 'cjs', outfile,
    stdin: { contents: "export * from './src/saved-games.js'; export { VariantGame, initVariantRules } from './src/variant-game.js';", resolveDir: path.resolve(__dirname, '..'), loader: 'js' },
  });
  api = require(outfile);
  await api.initVariantRules(profile.variant);
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('nine-point king grants preserve original setup, pockets, drops and undo in portable games', async t => {
  const game = new api.VariantGame(setup.fen, profile.variant);
  t.after(() => game.dispose());
  game.move({ drop: whiteGuard.letter, to: 'e3' });
  game.move({ drop: blackGuard.letter, to: 'e6' });
  const saved = api.makeSave(game, settings);
  assert.deepEqual(saved.setup, { choices: setup.choices, budget: 9 });
  assert.match(saved.pgn, /@e3/);
  assert.match(saved.pgn, /@e6/);
  const restored = await api.parseSave(JSON.stringify(saved));
  t.after(() => restored.game.dispose());
  assert.equal(restored.game.fen(), game.fen());
  assert.deepEqual(restored.game.history(), game.history());
  restored.game.undo();
  restored.game.undo();
  assert.equal(restored.game.fen(), setup.fen);
  assert.equal(restored.game.get('e1').type, 'k');
  assert.equal(restored.game.get('e8').type, 'k');
  const imported = await api.parsePgn(api.exportPgn(game));
  t.after(() => imported.dispose());
  assert.equal(imported.fen(), game.fen());
  assert.equal(imported.profile.hash, profile.hash);
  const damaged = structuredClone(saved);
  damaged.settings.upgradeBudget = 10;
  await assert.rejects(api.parseSave(JSON.stringify(damaged)), /settings|budget/);
  assert.throws(() => api.makeSave(game, { ...settings, upgradeBudget: 10 }), /1 to 9/);
});

async function fakeReserveEngine(t, bestmove) {
  const engineFile = require.resolve('../scripts/engine');
  delete require.cache[engineFile];
  const { experimentalCapabilityProbes } = require(engineFile);
  const probes = await experimentalCapabilityProbes(setup.fen, profile.variant);
  assert.ok(probes.some(probe => probe.required.some(move => move.includes('@'))), 'native capabilities include legal drops');
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = { resume() {} };
  child.stdin = new EventEmitter();
  child.stdin.destroyed = false;
  const commands = [];
  let fen;
  const emit = lines => queueMicrotask(() => child.stdout.emit('data', Buffer.from(lines.join('\n') + '\n')));
  child.stdin.write = text => {
    const command = text.trim();
    commands.push(command);
    if (command === 'uci') emit([`option name UCI_Variant type combo default chess var chess var ${profile.variant}`, 'uciok']);
    else if (command.startsWith('setoption name UCI_Variant value ')) emit([`info string variant ${profile.variant} files 8 ranks 8`]);
    else if (command.startsWith('position fen ')) fen = command.slice('position fen '.length);
    else if (command === 'go perft 1') {
      const probe = probes.find(value => value.fen === fen);
      assert.ok(probe);
      emit([...probe.required.map(move => `${move}: 1`), `Nodes searched: ${probe.required.length}`]);
    } else if (command === 'isready') emit(['readyok']);
    else if (command.startsWith('go movetime ')) emit([`bestmove ${bestmove}`]);
  };
  child.kill = () => { child.killed = true; };
  t.mock.method(childProcess, 'spawn', () => child);
  delete require.cache[engineFile];
  const engine = require(engineFile);
  t.after(() => { delete require.cache[engineFile]; });
  return { ...engine, child, commands };
}

test('native engine bridge accepts pocket perft moves and a legal drop reply', async t => {
  const drop = `${whiteGuard.letter.toUpperCase()}@e3`;
  const { engineRequest, child, commands } = await fakeReserveEngine(t, drop);
  const result = await engineRequest({ ...identity(), fen: setup.fen, difficulty: 'easy' });
  assert.equal(result.move, drop);
  assert.equal(child.killed, true);
  assert.ok(commands.some(command => command === `position fen ${setup.fen}`));
});

test('native engine bridge rejects a drop outside the allowed home half', async t => {
  const drop = `${whiteGuard.letter.toUpperCase()}@e5`;
  const { engineRequest, child } = await fakeReserveEngine(t, drop);
  await assert.rejects(engineRequest({ ...identity(), fen: setup.fen, difficulty: 'easy' }), /illegal move/);
  assert.equal(child.killed, true);
});
