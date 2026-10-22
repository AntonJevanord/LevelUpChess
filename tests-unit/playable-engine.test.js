const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const { getPlayableProfile, getPlayableProfiles, getPlayableArtifacts } = require('../scripts/playable-profile');
const { DEFAULT_DESIGN_CHOICES, designSetupFromChoices } = require('../src/design-setup');
const { engineRequest, createPosition, validateProfileIdentity, experimentalCapabilityProbes } = require('../scripts/engine');

const profile = getPlayableProfile();
const profiles = getPlayableProfiles();
const identity = { variant: profile.variant, profileHash: profile.hash, registryHash: profile.registryHash };
const identityFor = value => ({ variant: value.variant, profileHash: value.hash, registryHash: value.registryHash });
const letter = (id, value = profile) => value.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
const rookFen = `7k/8/8/5n2/3${letter('rook.purple@2')}4/8/8/7K w - - 0 1`;
const pawnFen = `7k/8/8/8/8/4${letter('pawn.purple@5')}3/8/7K w - - 0 1`;
const pairedArmyFen = () => designSetupFromChoices({
  ...DEFAULT_DESIGN_CHOICES,
  b1: 'knight.purple@2', b2: 'pawn.orange@2',
  g8: 'knight.purple@2', g7: 'pawn.orange@2',
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
  for (const other of profiles.filter(value => value.variant !== profile.variant)) {
    assert.doesNotThrow(() => validateProfileIdentity(other.variant, identityFor(other)));
    await assert.rejects(engineRequest({ ...identityFor(other), profileHash: profile.hash, fen: rookFen }), /Experimental rules changed/);
    await assert.rejects(engineRequest({ ...identityFor(other), registryHash: profile.registryHash, fen: rookFen }), /Experimental rules changed/);
  }
});

test('every generated native library must match its trusted catalog before experimental search', t => {
  const original = fs.readFileSync;
  let target;
  t.mock.method(fs, 'readFileSync', function(file, ...args) {
    if (String(file).replace(/\\/g, '/').endsWith('/' + target)) return target.endsWith('.json') ? '{}' : '[changed:chess]\n';
    return original.call(this, file, ...args);
  });
  for (const value of profiles) {
    for (const artifact of Object.values(getPlayableArtifacts(value.variant))) {
      target = artifact;
      assert.throws(() => validateProfileIdentity(value.variant, identityFor(value)), /Run npm.cmd run build/);
    }
  }
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
  assert.ok(pairProbes.some(probe => probe.name.startsWith('pawn.orange@2:')));
  assert.ok(pairProbes.some(probe => probe.name.startsWith('knight.purple@2:')));
  assert.ok(pairProbes.every(probe => /^(pawn\.orange@2:|knight\.purple@2:|ordinary )/.test(probe.name)));
  for (const other of profiles.filter(value => value.variant !== profile.variant)) {
    const otherFen = `7k/8/8/5n2/3${letter('rook.purple@2', other)}4/8/8/7K w - - 0 1`;
    const otherProbes = await experimentalCapabilityProbes(otherFen, other.variant);
    assert.notEqual(otherProbes, probes, 'each library owns its cached expected moves');
    assert.equal(await experimentalCapabilityProbes(otherFen, other.variant), otherProbes);
    assert.ok(otherProbes.every(probe => probe.name.startsWith('rook.purple@2:') || probe.name.startsWith('ordinary ')));
    const guard = profile.registry.allocations.find(allocation => allocation.id === 'queen.purple@4');
    const reassigned = other.registry.allocations.find(allocation => allocation.letter === guard.letter);
    assert.notEqual(reassigned.id, guard.id, 'the libraries deliberately reuse letters for different designs');
    const sharedFen = `7k/8/8/8/8/4${guard.letter.toUpperCase()}3/8/7K w - - 0 1`;
    const guardProbes = await experimentalCapabilityProbes(sharedFen, profile.variant);
    const reassignedProbes = await experimentalCapabilityProbes(sharedFen, other.variant);
    assert.notEqual(guardProbes, reassignedProbes, 'identical FEN text cannot share probes across profiles');
    assert.ok(guardProbes.some(probe => probe.name.startsWith(`${guard.id}:`)));
    assert.ok(reassignedProbes.some(probe => probe.name.startsWith(`${reassigned.id}:`)));
  }
  await assert.rejects(experimentalCapabilityProbes(rookFen, 'levelup-design-00000000000000000000'), /Unsupported experimental profile/);
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

test('the native engine can reply legally in both libraries, including pairs and nonroyal queens', {
  skip: !process.env.FAIRY_STOCKFISH_PATH,
  timeout: 60000,
}, async () => {
  // Test the generated allocations, especially letters which another library
  // gives a different family or older rules used for pseudo-royal kings.
  const pieces = ['pawn.purple@7', 'pawn.purple@8', 'pawn.purple@9', 'pawn.purple@5', 'pawn.orange@2',
    'knight.purple@3', 'bishop.purple@3', 'bishop.purple@4', 'rook.purple@4', 'queen.purple@4']
    .map(id => `7k/8/8/8/8/4${letter(id)}3/8/7K w - - 0 1`);
  const positions = [rookFen, ...pieces, pairedArmyFen()].map(fen => ({ fen, profile }));
  for (const other of profiles.filter(value => value.variant !== profile.variant)) {
    positions.push({ profile: other, fen: `7k/8/8/8/8/4${letter('pawn.purple@6', other)}3/8/7K w - - 0 1` });
  }
  for (const { fen, profile: value } of positions) {
    const metadata = identityFor(value);
    const board = await createPosition(fen, value.variant, metadata);
    try {
      const legal = board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
      const result = await engineRequest({ ...metadata, fen, difficulty: 'easy' });
      assert.ok(legal.includes(result.move), result.move);
    } finally { board.dispose(); }
  }
});

test('revised queen companions are capturable and do not create extra royal pieces', async () => {
  const guard = letter('queen.purple@4');
  const white = await createPosition(`7k/8/8/4r3/4${guard}3/8/8/K7 b - - 0 1`, profile.variant, identity);
  const black = await createPosition(`7k/8/8/8/4${guard.toLowerCase()}3/4R3/8/K7 w - - 0 1`, profile.variant, identity);
  try {
    assert.ok(white.move({ from: 'e5', to: 'e4' }), 'an enemy rook may capture the White guard');
    assert.ok(black.move({ from: 'e3', to: 'e4' }), 'an enemy rook may capture the Black guard');
    assert.equal(white.isGameOver(), false);
    assert.equal(black.isGameOver(), false);
  } finally { white.dispose(); black.dispose(); }
});
