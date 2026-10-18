const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { capabilityProbes } = require('../scripts/engine-capabilities');

const allPiecesFen = '4k3/8/8/8/8/8/ACDOLMS1/4K3 w - - 0 1';
const customTypes = 'efghijtuacdolms';
const placementTypes = fen => [...new Set(fen.split(' ')[0].toLowerCase().split('').filter(type => customTypes.includes(type)))].sort();

test('legacy and standard games do not depend on capabilities from newer rules', () => {
  assert.deepEqual(capabilityProbes(allPiecesFen, 'chess'), []);
  assert.deepEqual(capabilityProbes(allPiecesFen, 'levelup-knight'), []);
  assert.deepEqual(capabilityProbes(undefined, 'levelup-v5'), []);
  assert.deepEqual(capabilityProbes('4k3/8/8/8/8/8/8/4K3 w A - 0 1', 'levelup-v5'), [], 'castling-field letters are not pieces');
  assert.deepEqual(capabilityProbes('4k3/8/8/8/8/8/LMS5/4K3 w - - 0 1', 'levelup'), [], 'version 04 does not depend on version 05 abilities');
});

test('probe selection follows each upgraded type and color actually present in the game', () => {
  const expected = { a: 4, c: 3, d: 3, o: 1, l: 3, m: 2, s: 2 };
  for (const [type, count] of Object.entries(expected)) {
    for (const piece of [type, type.toUpperCase()]) {
      const probes = capabilityProbes(`4k3/8/8/8/8/8/${piece}7/4K3 w - - 0 1`, 'levelup-v5');
      assert.equal(probes.length, count, piece);
      for (const probe of probes) assert.deepEqual(placementTypes(probe.fen), [type], `${piece}: ${probe.name} introduces an unrelated upgrade`);
    }
  }
  assert.equal(capabilityProbes(allPiecesFen, 'levelup-v5').length, 18);
});

test('both castling directions are checked independently for every upgraded rook type', () => {
  for (const type of ['l', 'm', 'o']) {
    const probes = capabilityProbes(`4k3/8/8/8/8/8/${type}7/4K3 w - - 0 1`, 'levelup-v5');
    const castle = probes.find(probe => probe.name.includes('castling'));
    assert.ok(castle, type);
    assert.ok(castle.required.includes('e1g1'), type + ' kingside');
    assert.ok(castle.required.includes('e1c1'), type + ' queenside');
    assert.match(castle.fen, new RegExp(`${type.toUpperCase()}3K2${type.toUpperCase()} w KQ`));
  }
});

const swapCase = value => value.replace(/[a-z]/gi, letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase());
const mirrorSquare = square => square[0] + (9 - Number(square[1]));
const mirrorMove = move => mirrorSquare(move.slice(0, 2)) + mirrorSquare(move.slice(2, 4)) + move.slice(4);
function opposite(fen) {
  const fields = fen.split(' ');
  fields[0] = swapCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[2] = swapCase(fields[2]);
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(mirrorSquare).sort().join('');
  return fields.join(' ');
}

test('native and browser rules satisfy every isolated fixture for both colors and rule versions', { skip: !process.env.FAIRY_STOCKFISH_PATH }, async () => {
  const { initVariantRules, VariantGame } = require('../dist/rules-node.cjs');
  await initVariantRules();
  for (const [variant, army] of [
    ['levelup-v5', allPiecesFen],
    ['levelup', '4k3/8/8/8/8/8/ACD5/4K3 w - - 0 1'],
  ]) for (const probe of capabilityProbes(army, variant)) for (const mirrored of [false, true]) {
    const fen = mirrored ? opposite(probe.fen) : probe.fen;
    const label = `${variant}: ${probe.name}, ${mirrored ? 'mirrored' : 'original'}`;
    const config = path.resolve(__dirname, `../variants/${variant}.ini`);
    const output = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
      input: `setoption name VariantPath value ${config}\nsetoption name UCI_Variant value ${variant}\nposition fen ${fen}\ngo perft 1\nquit\n`,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(output.error);
    assert.equal(output.status, 0, output.stderr);
    assert.match(output.stdout, /Nodes searched:\s*\d+/);
    const moves = new Set([...output.stdout.matchAll(/^([a-h][1-8][a-h][1-8][a-z]*): 1\r?$/gm)].map(match => match[1]));
    for (const original of probe.required) {
      const move = mirrored ? mirrorMove(original) : original;
      assert.ok(moves.has(move), `${label}: missing ${move}`);
    }
    for (const original of probe.forbidden) {
      const move = mirrored ? mirrorMove(original) : original;
      assert.ok(!moves.has(move), `${label}: unexpected ${move}`);
    }
    const game = new VariantGame(fen, variant);
    try {
      const browser = game.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')).sort();
      assert.deepEqual([...moves].sort(), browser, label);
    } finally { game.dispose(); }
  }
});
