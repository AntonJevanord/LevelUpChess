const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { createHash } = require('node:crypto');
const { rulesBuildOptions } = require('../scripts/rules-build');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { pieceMap } = require('../src/profile-fen');

const IDS = ['pawn.purple@3', 'pawn.purple@4', 'pawn.purple@5', 'pawn.purple@6'];
const fixtures = [];
const consequences = [];
let profile, rules, directory, ini;

function position(pieces, turn = 'w', ep = '-') {
  const placement = Array.from({ length: 8 }, (_, row) => {
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
  return `${placement} ${turn} - ${ep} 0 1`;
}
const reflectSquare = square => square[0] + (9 - Number(square[1]));
const oppositeCase = value => value.replace(/[a-z]/gi, character => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
function opposite(fen) {
  const fields = fen.split(' ');
  fields[0] = oppositeCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(reflectSquare).sort().join('');
  return fields.join(' ');
}
const letter = id => profile.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
function board(t, fen) {
  const instance = rules.createBoard(fen);
  t.after(() => instance.dispose());
  return instance;
}
function bothColors(t, name, fen, check) {
  for (const color of ['w', 'b']) {
    const input = color === 'w' ? fen : opposite(fen);
    const instance = board(t, input);
    fixtures.push({ name: `${name}, ${color}`, fen: input });
    check(instance, color === 'w' ? square => square : reflectSquare, color);
  }
}
function targets(instance, from) {
  return [...new Set(instance.moves().filter(move => move.startsWith(from)).map(move => move.slice(2, 4)))].sort();
}
function push(instance, move, name) {
  const fen = instance.fen();
  assert.equal(instance.push(move), true, name);
  consequences.push({ name, fen, move, expected: instance.fen() });
}

test.before(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-pawn-candidates-'));
  const output = path.join(directory, 'rules.cjs');
  await build({
    ...rulesBuildOptions(),
    absWorkingDir: path.resolve(__dirname, '..'), entryPoints: ['src/balance-rules.js'],
    bundle: true, platform: 'node', format: 'cjs', outfile: output, legalComments: 'none',
  });
  const registry = createDesignRegistry({ schemaVersion: 2, comparisons: IDS.map(id => ({ armyA: { upgrades: { a2: id } }, armyB: { upgrades: {} } })) });
  profile = compileDesignProfile(registry);
  rules = await require(output).createMatchRules({ profile });
  ini = path.join(directory, 'profile.ini');
  writeFileSync(ini, profile.config);
});
test.after(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

test('the four candidates have distinct quiet movement for either color', t => {
  const expected = {
    'pawn.purple@3': ['a4', 'b4', 'c4', 'd5', 'd6', 'd7', 'd8', 'e4', 'f4', 'g4', 'h4'],
    'pawn.purple@4': ['a4', 'b4', 'c4', 'd5', 'e4', 'f4', 'g4', 'h4'],
    'pawn.purple@5': ['b2', 'b6', 'c3', 'c5', 'd2', 'd3', 'd5', 'd6', 'e3', 'e5', 'f2', 'f6'],
    'pawn.purple@6': ['d5', 'd6'],
  };
  for (const id of IDS) bothColors(t, `${id} quiet`, position({ a1: 'K', h7: 'k', d4: letter(id) }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), expected[id].map(square).sort(), id);
  });
});

test('Courier captures forward diagonals up to two squares and cannot capture backward or sideways', t => {
  const id = IDS[0];
  bothColors(t, 'Courier capture limits', position({ a1: 'K', h7: 'k', d4: letter(id), b6: 'p', g7: 'p', c3: 'p', e3: 'p', f4: 'p' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(legal.includes(square('b6')));
    for (const forbidden of ['g7', 'c3', 'e3', 'f4']) assert.ok(!legal.includes(square(forbidden)), forbidden);
  });
  bothColors(t, 'Courier blockers', position({ a1: 'K', h7: 'k', d4: letter(id), c4: 'P', e4: 'P', d5: 'P', e5: 'P', b6: 'p', f6: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), [square('b6')]);
  });
});

test('Rank controls clear horizontal lines while keeping ordinary forward movement and captures', t => {
  const id = IDS[1];
  bothColors(t, 'Rank capture directions', position({ a1: 'K', h7: 'k', d4: letter(id), a4: 'p', h4: 'p', d5: 'p', c5: 'p', e5: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['a4', 'b4', 'c4', 'c5', 'e4', 'e5', 'f4', 'g4', 'h4'].map(square).sort());
  });
  bothColors(t, 'Rank blocked rays', position({ a1: 'K', h7: 'k', d4: letter(id), c4: 'P', f4: 'P', b4: 'p', g4: 'p', d5: 'P' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), [square('e4')]);
  });
});

test('Returning captures on forward rays but uses backward rays only for quiet moves', t => {
  const id = IDS[2];
  bothColors(t, 'Returning capture modalities', position({ h1: 'K', h7: 'k', d4: letter(id), b6: 'p', d6: 'p', f6: 'p', b2: 'p', d2: 'p', f2: 'p', a4: 'p', h4: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['b6', 'c3', 'c5', 'd3', 'd5', 'd6', 'e3', 'e5', 'f6'].map(square).sort());
  });
  bothColors(t, 'Returning blocked rays', position({ a1: 'K', h7: 'k', d4: letter(id), c3: 'P', d3: 'P', e3: 'P', c5: 'P', d5: 'P', e5: 'P' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), []);
  });
});

test('Twin units jump forward over blockers, capture only one square diagonally, and cannot retreat', t => {
  const id = IDS[3];
  bothColors(t, 'Twin blocked quiet jump', position({ a1: 'K', h7: 'k', d4: letter(id), d5: 'P', c5: 'p', e5: 'p', c3: 'p', e3: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c5', 'd6', 'e5'].map(square).sort());
  });
  bothColors(t, 'Twin jump cannot capture', position({ a1: 'K', h7: 'k', d4: letter(id), d5: 'P', d6: 'p', c5: 'p', e5: 'p' }), (instance, square) => {
    assert.deepEqual(targets(instance, square('d4')), ['c5', 'e5'].map(square).sort());
  });
});

test('every candidate promotes only to standard QRBN pieces for either color', t => {
  for (const id of IDS) bothColors(t, `${id} promotion`, position({ a1: 'K', h6: 'k', b7: letter(id) }), (instance, square) => {
    const move = square('b7') + square('b8');
    assert.deepEqual(instance.moves().filter(candidate => candidate.startsWith(move)).sort(), ['b', 'n', 'q', 'r'].map(type => move + type));
    push(instance, move + 'n', `${id} standard promotion`);
    assert.equal(pieceMap(instance.fen()).get(square('b8')), instance.turn() === 'b' ? 'N' : 'n');
  });
});

test('capture-only diagonals take en passant while Returning visits the empty target quietly', t => {
  for (const id of IDS) bothColors(t, `${id} en passant`, position({ h1: 'K', h8: 'k', c5: letter(id), d5: 'p' }, 'w', 'd6'), (instance, square) => {
    push(instance, square('c5') + square('d6'), `${id} forward en passant target`);
    assert.equal(pieceMap(instance.fen()).has(square('d5')), id === IDS[2], id);
    assert.doesNotThrow(() => board(t, instance.fen()));
  });
  const type = letter(IDS[2]);
  bothColors(t, 'Returning quiet backward en passant target', position({ h1: 'K', h8: 'k', c7: type, d5: 'p' }, 'w', 'd6'), (instance, square, color) => {
    push(instance, square('c7') + square('d6'), 'Returning quiet backward en passant target');
    assert.equal(pieceMap(instance.fen()).get(square('d5')), color === 'w' ? 'p' : 'P');
  });
});

test('home and shifted forward moves produce reloadable FENs with en passant only for Rank initial doubles', t => {
  for (const id of IDS) for (const origin of [2, 3, 4]) {
    const initial = position({ h1: 'K', h8: 'k', ['d' + origin]: letter(id) });
    bothColors(t, `${id} origin ${origin}`, initial, (instance, square, color) => {
      const from = square('d' + origin), to = square('d' + (origin + 2));
      const allowed = id !== IDS[1] || origin === 2;
      assert.equal(instance.moves().includes(from + to), allowed, `${id} origin ${origin}`);
      if (!allowed) return;
      push(instance, from + to, `${id} forward origin ${origin}`);
      const ep = instance.fen().split(' ')[3];
      assert.equal(ep, id === IDS[1] ? color === 'w' ? 'd3d4' : 'd5d6' : '-');
      assert.equal(board(t, instance.fen()).fen(), instance.fen());
    });
  }
});

test('reversible quiet moves advance the halfmove counter while forward-only moves and captures reset it', t => {
  for (const id of IDS) for (const color of ['w', 'b']) {
    const start = position({ a1: 'K', h7: 'k', d4: letter(id) }).replace(' 0 1', ' 37 1');
    const input = color === 'w' ? start : opposite(start);
    const from = color === 'w' ? 'd4' : reflectSquare('d4');
    const initial = board(t, input);
    for (const move of initial.moves().filter(move => move.startsWith(from))) {
      const instance = board(t, input);
      push(instance, move, `${id} ${color} quiet halfmove ${move}`);
      const reversible = move.length === 4 && (id === IDS[2] || move[1] === move[3]);
      assert.equal(Number(instance.fen().split(' ')[4]), reversible ? 38 : 0, `${id} ${move}`);
    }
  }
  for (const target of ['b6', 'c5', 'd5', 'd6', 'e5', 'f6']) {
    const start = position({ a1: 'K', h7: 'k', d4: letter(IDS[2]), [target]: 'p' }).replace(' 0 1', ' 37 1');
    bothColors(t, 'Returning forward capture resets counter ' + target, start, (instance, square) => {
      push(instance, square('d4') + square(target), 'Returning capture counter ' + target);
      assert.equal(Number(instance.fen().split(' ')[4]), 0);
    });
  }
});

test('candidate moves preserve ordinary royal safety under a rook pin', t => {
  for (const id of IDS) bothColors(t, `${id} pinned`, position({ c4: 'K', h7: 'k', d4: letter(id), h4: 'r' }), (instance, square) => {
    const legal = targets(instance, square('d4'));
    assert.ok(!legal.includes(square('d5')), id);
    assert.ok(!legal.includes(square('d6')), id);
    if (id === IDS[1]) assert.ok(legal.includes(square('h4')), 'Rank may capture the pinning rook along its rank');
  });
});

test('new capability probes are legal, identify capture limits, and preserve predecessor profiles', t => {
  for (const probe of profile.capabilityProbes) {
    const instance = board(t, probe.fen);
    assert.ok(instance.moves().length > 0, probe.name);
    fixtures.push(probe);
  }
  assert.ok(profile.capabilityProbes.some(probe => probe.name.includes('forward capture range')));
  assert.ok(profile.capabilityProbes.some(probe => probe.name.includes('quiet backward visit')));
  assert.equal(profile.roles.initialPawnLeaps[letter(IDS[1]).toLowerCase()], 2);
  for (const id of [IDS[0], IDS[2], IDS[3]]) assert.equal(profile.roles.initialPawnLeaps[letter(id).toLowerCase()], undefined);
  const previousIds = ['bishop.blue@1', 'bishop.orange@1', 'bishop.purple@1', 'knight.blue@1', 'knight.orange@1', 'knight.purple@1', 'pawn.blue@1', 'pawn.orange@1', 'pawn.purple@1', 'pawn.purple@2', 'queen.blue@1', 'queen.orange@1', 'queen.purple@1', 'rook.blue@1', 'rook.orange@1', 'rook.purple@1', 'rook.purple@2'];
  const previous = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons: previousIds.map(id => ({ armyA: { upgrades: { a2: id } }, armyB: { upgrades: {} } })) }));
  assert.equal(previous.hash, '4a00861f3419f976b90f36b44c0fcdcb3b6d075e3dbb6226395aae50ba593114', 'version-09 definitions, allocations and config retain their identity');
  assert.equal(createHash('sha256').update(JSON.stringify(previous.capabilityProbes)).digest('hex'), '90cb4efb668c939caee586ace237446198e4238fe43880de798aa6af40e75bc8', 'version-09 capability fixtures are byte-for-byte unchanged');
});

test('native engine exactly matches both-color candidate movement, capture, blocker, promotion and EP fixtures', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 120000,
}, t => {
  const unique = [...new Map(fixtures.map(fixture => [fixture.fen, fixture])).values()];
  assert.ok(unique.length >= 50);
  for (const fixture of unique) {
    const instance = board(t, fixture.fen);
    const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
      input: `setoption name VariantPath value ${ini}\nsetoption name UCI_Variant value ${profile.variant}\nposition fen ${fixture.fen}\ngo perft 1\nquit\n`,
      encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, fixture.name + ': ' + child.stderr);
    assert.match(child.stdout, /Nodes searched:/, fixture.name);
    const moves = [...child.stdout.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
    assert.deepEqual(moves, instance.moves().sort(), fixture.name);
  }
  t.diagnostic(`${unique.length} isolated native/WASM legal-move comparisons`);
});

test('native move results match en passant, promotion, shifted-start and halfmove consequences', {
  skip: !process.env.FAIRY_STOCKFISH_PATH, timeout: 15000,
}, t => {
  assert.ok(consequences.length > 50);
  const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
    input: `setoption name VariantPath value ${ini}\nsetoption name UCI_Variant value ${profile.variant}\n`
      + consequences.map(item => `position fen ${item.fen} moves ${item.move}\nd\n`).join('') + 'quit\n',
    encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const resulting = [...child.stdout.matchAll(/^Fen: (.+)\r?$/gm)].map(match => match[1]);
  assert.equal(resulting.length, consequences.length);
  consequences.forEach((item, index) => assert.equal(resulting[index], item.expected, item.name));
  t.diagnostic(`${consequences.length} native/WASM resulting-FEN comparisons`);
});
