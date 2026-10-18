const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { capabilityProbes } = require('../scripts/engine-capabilities');

test('legacy and standard games do not depend on capabilities from newer rules', () => {
  const fen = '4k3/8/8/8/8/8/ACD5/O3K3 w KQ - 0 1';
  assert.deepEqual(capabilityProbes(fen, 'chess'), []);
  assert.deepEqual(capabilityProbes(fen, 'levelup-knight'), []);
  assert.deepEqual(capabilityProbes(undefined, 'levelup-v5'), []);
  assert.deepEqual(capabilityProbes('4k3/8/8/8/8/8/8/4K3 w A - 0 1', 'levelup-v5'), [], 'castling-field letters are not pieces');
});

test('probe selection follows both colors actually present in the game', () => {
  assert.equal(capabilityProbes('4k3/8/8/8/8/8/8/O3K3 w - - 0 1', 'levelup-v5').length, 1);
  assert.equal(capabilityProbes('o3k3/8/8/8/8/8/8/4K3 w - - 0 1', 'levelup-v5').length, 1);
  for (const pawn of 'ACDacd') {
    assert.equal(capabilityProbes(`4k3/8/8/8/8/8/${pawn}7/4K3 w - - 0 1`, 'levelup-v5').length, 3);
  }
  assert.equal(capabilityProbes('o3k3/8/8/8/8/8/A7/4K3 w - - 0 1', 'levelup-v5').length, 4);
});

test('an engine with the active configuration satisfies every capability fixture', { skip: !process.env.FAIRY_STOCKFISH_PATH }, () => {
  const probes = capabilityProbes('o3k3/8/8/8/8/8/ASLM4/4K3 w - - 0 1', 'levelup-v5');
  const config = path.resolve(__dirname, '../variants/levelup-v5.ini');
  for (const probe of probes) {
    const output = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
      input: `setoption name VariantPath value ${config}\nsetoption name UCI_Variant value levelup-v5\nposition fen ${probe.fen}\ngo perft 1\nquit\n`,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(output.error);
    assert.equal(output.status, 0, output.stderr);
    assert.match(output.stdout, /Nodes searched:\s*\d+/);
    const moves = new Set([...output.stdout.matchAll(/^([a-h][1-8][a-h][1-8][a-z]*): 1$/gm)].map(match => match[1]));
    for (const move of probe.required) assert.ok(moves.has(move), `${probe.name}: missing ${move}`);
    for (const move of probe.forbidden) assert.ok(!moves.has(move), `${probe.name}: unexpected ${move}`);
  }
});
