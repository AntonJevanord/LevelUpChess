const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const { getPlayableProfile } = require('../scripts/playable-profile');
const { DEFAULT_DESIGN_CHOICES, designSetupFromChoices } = require('../src/design-setup');
const { engineRequest, createPosition, validateProfileIdentity, experimentalCapabilityProbes } = require('../scripts/engine');

const profile = getPlayableProfile();
const identity = { variant: profile.variant, profileHash: profile.hash, registryHash: profile.registryHash };
const letter = id => profile.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
const rookFen = `7k/8/8/5n2/3${letter('rook.purple@2')}4/8/8/7K w - - 0 1`;
const pawnFen = `7k/8/8/8/8/4${letter('pawn.purple@5')}3/8/7K w - - 0 1`;
const pairedArmyFen = () => designSetupFromChoices({
  ...DEFAULT_DESIGN_CHOICES,
  b1: 'knight.purple@2', b2: 'pawn.purple@6',
  g8: 'knight.purple@2', g7: 'pawn.purple@6',
}, 6).fen;

test('experimental engine requests require matching profile and registry identities before launch', async t => {
  t.mock.method(childProcess, 'spawn', () => { throw new Error('An invalid profile must not start an engine.'); });
  for (const replacement of [
    { profileHash: undefined }, { registryHash: undefined }, { profileHash: '0'.repeat(64) },
    { registryHash: profile.hash }, { profileHash: { hash: profile.hash } },
  ]) {
    await assert.rejects(engineRequest({ ...identity, ...replacement, fen: rookFen }), /Experimental rules changed/);
  }
  await assert.rejects(engineRequest({ ...identity, fen: rookFen, config: '[injected:chess]' }), /Invalid engine request/);
  await assert.rejects(engineRequest({ ...identity, fen: rookFen, variant: 'levelup-design-00000000000000000000' }), /Experimental rules changed/);
  await assert.rejects(createPosition(rookFen, 'chess', identity), /matching experimental variant/);
});

test('generated native rules must match the trusted catalog before experimental search', t => {
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', function(file, ...args) {
    if (String(file).replace(/\\/g, '/').endsWith('/variants/levelup-playable.ini')) return '[changed:chess]\n';
    return original.call(this, file, ...args);
  });
  assert.throws(() => validateProfileIdentity(profile.variant, identity), /Run npm.cmd run build/);
});

test('experimental capability selection follows active immutable IDs and requires exact moves', async () => {
  const probes = await experimentalCapabilityProbes(rookFen);
  assert.ok(probes.length > 2);
  assert.ok(probes.some(probe => probe.name.startsWith('rook.purple@2:')));
  assert.ok(probes.every(probe => probe.name.startsWith('rook.purple@2:') || probe.name.startsWith('ordinary ')));
  assert.ok(probes.every(probe => probe.exact && probe.required.length && !probe.forbidden.length));
  assert.equal(await experimentalCapabilityProbes(rookFen), probes, 'matching profile and active designs reuse expected move sets');
  const pawnProbes = await experimentalCapabilityProbes(pawnFen);
  assert.ok(pawnProbes.some(probe => probe.name.startsWith('pawn.purple@5:')));
  assert.ok(pawnProbes.every(probe => !probe.name.startsWith('rook.')));
  const pairProbes = await experimentalCapabilityProbes(pairedArmyFen());
  assert.ok(pairProbes.some(probe => probe.name.startsWith('pawn.purple@6:')));
  assert.ok(pairProbes.some(probe => probe.name.startsWith('knight.purple@2:')));
  assert.ok(pairProbes.every(probe => /^(pawn\.purple@6:|knight\.purple@2:|ordinary )/.test(probe.name)));
});

async function fakeExperimentalEngine(t, { unexpectedMove } = {}) {
  const probes = await experimentalCapabilityProbes(rookFen);
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
      const probe = probes.find(candidate => candidate.fen === fen);
      assert.ok(probe);
      const moves = [...probe.required, ...(unexpectedMove ? [unexpectedMove] : [])];
      emit([...moves.map(move => `${move}: 1`), `Nodes searched: ${moves.length}`]);
    } else if (command === 'isready') emit(['readyok']);
    else if (command.startsWith('go movetime ')) emit(['bestmove d4f5']);
  };
  child.kill = () => { child.killed = true; };
  t.mock.method(childProcess, 'spawn', () => child);
  const engineFile = require.resolve('../scripts/engine');
  delete require.cache[engineFile];
  const engine = require(engineFile);
  t.after(() => { delete require.cache[engineFile]; });
  return { ...engine, commands, child };
}

test('exact experimental preflight rejects an engine retaining a removed move', async t => {
  const { engineRequest: request, commands, child } = await fakeExperimentalEngine(t, { unexpectedMove: 'a1h8' });
  await assert.rejects(request({ ...identity, fen: rookFen }), /does not support rook.purple@2/);
  assert.equal(commands.some(command => command.startsWith('go movetime ')), false);
  assert.equal(child.killed, true);
});

test('experimental preflight loads the pinned INI and validates the resulting move', async t => {
  const { engineRequest: request, commands, child } = await fakeExperimentalEngine(t);
  const result = await request({ ...identity, fen: rookFen, difficulty: 'easy' });
  assert.equal(result.move, 'd4f5');
  assert.ok(commands.some(command => command.startsWith('setoption name VariantPath value ') && command.endsWith('levelup-playable.ini')));
  assert.equal(child.killed, true);
});

test('the native engine can reply legally to revised pieces and paired pawn armies', {
  skip: !process.env.FAIRY_STOCKFISH_PATH,
  timeout: 60000,
}, async () => {
  // Exercise every new pawn under the full library's actual letter/slot map,
  // including V/W letters that older profiles used for pseudo-royal kings.
  const pawns = ['pawn.purple@3', 'pawn.purple@4', 'pawn.purple@5', 'pawn.purple@6']
    .map(id => `7k/8/8/8/8/4${letter(id)}3/8/7K w - - 0 1`);
  for (const fen of [rookFen, ...pawns, pairedArmyFen()]) {
    const board = await createPosition(fen, profile.variant, identity);
    try {
      const legal = board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
      const result = await engineRequest({ ...identity, fen, difficulty: 'easy' });
      assert.ok(legal.includes(result.move), result.move);
    } finally { board.dispose(); }
  }
});
