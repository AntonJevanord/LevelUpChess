const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { DESIGNS } = require('../src/design-catalog');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { createMatchRules } = require('../dist/balance-rules.cjs');

const slotFor = { pawn: 'a2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
// Preserve the original library as an independent historical rules fixture.
const originalDesignIds = [
  'knight.blue@1', 'knight.orange@1', 'knight.purple@1',
  'bishop.blue@1', 'bishop.orange@1', 'bishop.purple@1',
  'queen.blue@1', 'queen.orange@1', 'queen.purple@1',
  'pawn.blue@1', 'pawn.orange@1', 'pawn.purple@1', 'pawn.purple@2',
  'rook.blue@1', 'rook.orange@1', 'rook.purple@1', 'rook.purple@2',
];
function registry(ids) {
  return createDesignRegistry({ schemaVersion: 2, comparisons: ids.map(id => ({ armyA: { upgrades: { [slotFor[DESIGNS[id].family]]: id } }, armyB: { upgrades: {} } })) });
}
function position(pieces, turn = 'w', rights = '-', ep = '-', halfmove = 0) {
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
  return `${placement} ${turn} ${rights} ${ep} ${halfmove} 1`;
}
function board(t, rules, fen) {
  const instance = rules.createBoard(fen);
  t.after(() => instance.dispose());
  return instance;
}
let profile, rules;
const letter = (id, color = 'w') => {
  const allocated = profile.registry.allocations.find(item => item.id === id).letter;
  return color === 'w' ? allocated.toUpperCase() : allocated;
};
test.before(async () => {
  profile = compileDesignProfile(registry(originalDesignIds));
  rules = await createMatchRules({ profile });
});

test('the compiler is deterministic and retains the frozen original library and roles', () => {
  const restored = compileDesignProfile(JSON.parse(JSON.stringify(profile.registry)));
  assert.deepEqual(restored, profile);
  assert.equal(profile.registry.definitions.length, 17);
  assert.equal(profile.hash, createHash('sha256').update(JSON.stringify({ config: profile.config, registry: profile.registry })).digest('hex'));
  assert.equal(rules.profileHash, profile.hash);
  assert.equal(rules.registryHash, profile.registry.hash);
  assert.equal(rules.royalMode, 'king');
  assert.equal(rules.evaluationCaveat, null);
  assert.deepEqual(profile.roles.royalTypes, ['k']);
  assert.ok(profile.roles.pawnTypes.includes(letter('pawn.purple@2', 'b')));
  assert.ok(profile.roles.castlingRooks.includes(letter('rook.purple@2', 'b')));
  assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.roles));
  assert.throws(() => compileDesignProfile({ ...profile.registry, hash: 'changed' }), /hash/);
});

test('dynamic setup resolves IDs, retains ordinary promotion pieces, and treats V/W as nonroyal', t => {
  assert.equal(letter('pawn.purple@2'), 'V');
  assert.equal(letter('rook.purple@2'), 'W');
  const fen = rules.startingFen({ upgrades: { a2: 'pawn.purple@2', a1: 'rook.purple@2' } }, { upgrades: { h2: 'pawn.purple@1', h1: 'rook.purple@1' } });
  assert.equal(fen, 'rnbqkbno/pppppppd/8/8/8/8/VPPPPPPP/WNBQKBNR w KQkq - 0 1');
  assert.ok(board(t, rules, fen).moves().length > 0);
  assert.equal(rules.startingFen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(board(t, rules, position({ a1: 'K', h7: 'k', d4: 'V', f4: 'W' })).outcome(), null);
  assert.throws(() => rules.createBoard(position({ a1: 'K', d4: 'V' })), /exactly one selected royal/);
});

test('revised purple pawn limits quiet slides to two while retaining diagonal captures', t => {
  for (const id of ['pawn.purple@1', 'pawn.purple@2']) {
    const type = letter(id);
    const quiet = board(t, rules, position({ a1: 'K', h7: 'k', d4: type }));
    assert.ok(quiet.moves().includes('d4f4'));
    assert.ok(quiet.moves().includes('d4d2'));
    assert.equal(quiet.moves().includes('d4g4'), id.endsWith('@1'));
    const capture = board(t, rules, position({ a1: 'K', h7: 'k', d4: type, b6: 'p', f4: 'p', e5: 'P', g7: 'p' }));
    assert.ok(capture.moves().includes('d4b6'));
    assert.ok(!capture.moves().includes('d4f4'), 'quiet rook movement cannot capture orthogonally');
    assert.ok(!capture.moves().includes('d4g7'), 'diagonal capture rays cannot cross a blocker');
  }
});

test('revised purple rook adds capture-only knight jumps and removes the old capture box', t => {
  for (const id of ['rook.purple@1', 'rook.purple@2']) {
    const type = letter(id);
    const instance = board(t, rules, position({ a1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', f5: 'p', e5: 'p', f6: 'p', f4: 'p' }));
    assert.ok(instance.moves().includes('d4f5'), 'knight capture can jump blockers');
    assert.equal(instance.moves().includes('d4e5'), id.endsWith('@1'));
    assert.equal(instance.moves().includes('d4f6'), id.endsWith('@1'));
    assert.equal(instance.moves().includes('d4f4'), id.endsWith('@1'), 'only the predecessor jumps two squares orthogonally to capture');
    const quiet = board(t, rules, position({ a1: 'K', h7: 'k', d4: type }));
    assert.ok(quiet.moves().includes('d4g4'));
    assert.ok(!quiet.moves().includes('d4f5'), 'added knight movement requires a capture');
  }
});

test('extra WD pieces preserve their original knights and mirror spawn squares for Black', t => {
  const fen = rules.startingFen({ b1: 'knight.purple@1', g1: 'knight.purple@1' }, { b1: 'knight.purple@1', g1: 'knight.purple@1' });
  assert.equal(fen, 'rnbqkbnr/pppppppp/1g4g1/8/8/1G4G1/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(board(t, rules, fen).moves().length, 26);
});

test('mapped pawn definitions retain standard QRBN promotions for both colors', t => {
  for (const allocation of profile.registry.allocations.filter(item => DESIGNS[item.id].roles.pawn)) {
    for (const color of ['w', 'b']) {
      const type = color === 'w' ? allocation.letter.toUpperCase() : allocation.letter;
      const instance = board(t, rules, color === 'w' ? position({ a1: 'K', h6: 'k', b7: type }) : position({ a8: 'k', h3: 'K', b2: type }, 'b'));
      const move = color === 'w' ? 'b7b8' : 'b2b1';
      assert.deepEqual(instance.moves().filter(candidate => candidate.startsWith(move)).sort(), ['b', 'n', 'q', 'r'].map(piece => move + piece), allocation.id);
      assert.ok(!instance.moves().includes(move));
      assert.equal(instance.push(move + 'q'), true);
      assert.match(instance.fen(), color === 'w' ? /Q/ : /q/);
    }
  }
});

test('both current and revised mapped pawns participate in en passant and king-safety checks', t => {
  for (const id of ['pawn.purple@1', 'pawn.purple@2']) {
    const type = letter(id, 'b');
    const instance = board(t, rules, position({ h8: 'k', h1: 'K', f5: type, d4: 'P' }, 'b', '-', 'd3'));
    assert.ok(instance.moves().includes('f5d3'));
    assert.equal(instance.push('f5d3'), true);
    assert.ok(!instance.fen().includes('P'));
    const pinned = board(t, rules, position({ h8: 'K', g1: 'k', a7: 'B', f5: type, d4: 'P' }, 'b', '-', 'd3'));
    assert.ok(!pinned.moves().includes('f5d3'), 'en passant cannot expose the royal king');
  }
});

test('initial blue-pawn leaps and occupied queen markers replay through mapped-role validation', t => {
  const pawn = board(t, rules, position({ a1: 'K', h8: 'k', d2: letter('pawn.blue@1'), e4: 'p' }));
  assert.equal(pawn.push('d2d5'), true);
  assert.equal(pawn.fen().split(' ')[3], 'd3d4d5');
  const resumed = board(t, rules, pawn.fen());
  assert.ok(resumed.moves().includes('e4d3'));
  assert.equal(resumed.push('e4d3'), true);
  assert.ok(!resumed.fen().includes(letter('pawn.blue@1')));
  const queen = board(t, rules, position({ a1: 'K', h8: 'k', d1: letter('queen.blue@1') }));
  assert.equal(queen.push('d1e3'), true);
  assert.equal(queen.fen().split(' ')[3], 'e3');
  assert.equal(board(t, rules, queen.fen()).fen(), queen.fen());
});

test('assigned rook letters castle on both sides, but cannot cross check', t => {
  for (const allocation of profile.registry.allocations.filter(item => DESIGNS[item.id].roles.castlingRook)) {
    const type = allocation.letter.toUpperCase();
    const instance = board(t, rules, position({ e8: 'k', a1: type, e1: 'K', h1: type }, 'w', 'KQ'));
    assert.ok(instance.moves().includes('e1g1'), allocation.id);
    assert.ok(instance.moves().includes('e1c1'), allocation.id);
    assert.equal(instance.san('e1g1'), 'O-O');
    assert.equal(instance.push('e1g1'), true);
    assert.equal(instance.fen().split(' ')[2], '-');
    const checked = board(t, rules, position({ b8: 'k', f8: 'r', a1: type, e1: 'K', h1: type }, 'w', 'KQ'));
    assert.ok(!checked.moves().includes('e1g1'));
  }
});

test('dynamic army validation rejects wrong families, missing IDs, kings, removals, and overspending', async () => {
  for (const army of [
    { upgrades: { a2: 'rook.purple@2' } }, { upgrades: { a2: 'pawn.unknown@1' } },
    { upgrades: { e1: 'rook.purple@2' } }, { upgrades: { a2: 3 } },
    { upgrades: { a2: 'pawn.purple@2', b2: 'pawn.purple@2', c2: 'pawn.blue@1' } },
    { upgrades: { a1: 'rook.purple@2' }, remove: ['a1'] }, { remove: ['e1'], upgrades: {} },
  ]) assert.throws(() => rules.startingFen(army));
  assert.match(rules.startingFen({ upgrades: {}, remove: ['a1'] }, { upgrades: {}, remove: ['h1'] }), / w Kq - 0 1$/);
  await assert.rejects(createMatchRules({ profile, whiteKing: 1 }), /ordinary kings/);
  await assert.rejects(createMatchRules({ profile: {} }), /compiled dynamic/);
});

test('module isolation includes full profile content, even when a variant label is reused', async t => {
  const original = compileDesignProfile(registry(['pawn.purple@1']));
  const revised = compileDesignProfile(registry(['pawn.purple@2']));
  const changed = { ...revised, variant: original.variant, config: revised.config.replace(revised.variant, original.variant) };
  changed.hash = createHash('sha256').update(JSON.stringify({ config: changed.config, registry: changed.registry })).digest('hex');
  const oldRules = await createMatchRules({ profile: original });
  const oldBoard = board(t, oldRules, position({ a1: 'K', h7: 'k', d4: 'D' }));
  const newRules = await createMatchRules({ profile: changed });
  const newBoard = board(t, newRules, position({ a1: 'K', h7: 'k', d4: 'D' }));
  assert.ok(oldBoard.moves().includes('d4g4'));
  assert.ok(!newBoard.moves().includes('d4g4'));
  assert.ok(oldBoard.moves().includes('d4g4'), 'loading another profile must not alter existing boards');
  const legacy = await createMatchRules();
  assert.equal(legacy.variant, 'levelup-balance-0-0');
  assert.ok(board(t, legacy, position({ a1: 'K', h7: 'k', d4: 'D' })).moves().includes('d4g4'));
});

test('reallocated A/C letters follow design roles instead of legacy pawn identities', async t => {
  const selected = compileDesignProfile(registry(['pawn.purple@1', 'pawn.purple@2', 'rook.purple@1', 'rook.purple@2']));
  assert.equal(selected.registry.allocations.find(item => item.id === 'pawn.purple@2').letter, 'a');
  assert.equal(selected.registry.allocations.find(item => item.id === 'rook.purple@2').letter, 'c');
  const mapped = await createMatchRules({ profile: selected });
  const pawn = board(t, mapped, position({ a1: 'K', h7: 'k', d2: 'A' }));
  assert.ok(pawn.moves().includes('d2d4'));
  assert.ok(!pawn.moves().includes('d2d5'), 'A no longer means the blue pawn');
  assert.throws(() => mapped.createBoard(position({ a1: 'K', h8: 'k', d5: 'A', e4: 'p' }, 'b', '-', 'd3d4d5')), /Invalid/, 'the revised pawn cannot invent a triple-leap marker');
  const rook = board(t, mapped, position({ a1: 'K', h6: 'k', c7: 'C' }));
  assert.ok(rook.moves().includes('c7c8'));
  assert.ok(!rook.moves().includes('c7c8q'), 'C is a rook and must not acquire pawn promotion');
  const castle = board(t, mapped, position({ a1: 'C', e1: 'K', h1: 'C', e8: 'k' }, 'w', 'KQ'));
  assert.ok(castle.moves().includes('e1g1'));
  assert.ok(castle.moves().includes('e1c1'));
});

test('every generated capability fixture is legal in the frozen profile', t => {
  assert.ok(profile.capabilityProbes.length > 100);
  for (const probe of profile.capabilityProbes) {
    const instance = board(t, rules, probe.fen);
    assert.ok(instance.moves().length > 0, probe.name);
  }
});

test('native and WASM agree for every frozen-profile capability fixture', { skip: !process.env.FAIRY_STOCKFISH_PATH }, async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-design-rules-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'profile.ini');
  writeFileSync(configPath, profile.config);
  // One native process per fixture isolates its asynchronous perft state.
  for (const probe of profile.capabilityProbes) {
    const instance = board(t, rules, probe.fen);
    const child = spawnSync(process.env.FAIRY_STOCKFISH_PATH, [], {
      input: `setoption name VariantPath value ${configPath}\nsetoption name UCI_Variant value ${profile.variant}\nposition fen ${probe.fen}\ngo perft 1\nquit\n`,
      encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, `${probe.name}: ${child.stderr}`);
    assert.match(child.stdout, /Nodes searched:/, probe.name);
    const moves = [...child.stdout.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): 1\r?$/gm)].map(match => match[1]).sort();
    assert.deepEqual(moves, instance.moves().sort(), probe.name);
  }
});
