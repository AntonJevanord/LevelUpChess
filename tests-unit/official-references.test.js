'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { getOfficialReferences, renderOfficialReferenceIni, createOfficialComparisons, requireOfficialReferenceValues } = require('../scripts/balance/official-references');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const library = getOfficialReferences();
function fen(pieces, turn = 'w', rights = '-') {
  const ranks = Array.from({ length: 8 }, (_, row) => { let value = '', empty = 0;
    for (const file of 'abcdefgh') { const piece = pieces[file + (8 - row)];
      if (piece) { if (empty) value += empty; empty = 0; value += piece; } else empty++;
    }
    return value + (empty || '');
  });
  return `${ranks.join('/')} ${turn} ${rights} - 0 1`;
}
function standaloneProfile(notation = 'BsR2nsN') {
  const profile = structuredClone(library.profile), byId = new Map(profile.registry.definitions.map(d => [d.id, d]));
  // Test the actual standalone bytes with its independent w/x/y/z allocation.
  profile.variant = library.protocol.playtest.variant;
  profile.config = library.ini.replace('y:BsR2nsN', `y:${notation}`);
  profile.registry.allocations = library.roster.map(({ id, letter, slot }) => ({ id, letter, slot }));
  profile.definitionsByLetter = Object.fromEntries(library.roster.map(({ id, letter }) => [letter, byId.get(id)]));
  profile.roles.castlingRooks = ['w', 'r'];
  return profile;
}
let rules, standalone;
test.before(async () => { rules = await createMatchRules({ profile: library.profile }); standalone = await createMatchRules({ profile: standaloneProfile() }); });
function moves(engine, profile, id, extras = {}, color = 'w') {
  const type = profile.registry.allocations.find(a => a.id === id).letter;
  const from = color === 'w' ? 'd4' : 'd5';
  const board = engine.createBoard(fen({ a1: 'K', h7: 'k', [from]: color === 'w' ? type.toUpperCase() : type, ...extras }, color));
  try { return board.moves().filter(move => move.startsWith(from)).sort(); } finally { board.dispose(); }
}
function inventory(profile = library.profile) {
  return { version: 1, pieces: Object.fromEntries(library.roster.flatMap(reference => {
    const a = profile.registry.allocations.find(a => a.id === reference.id);
    const values = Object.fromEntries(['rawMg', 'captureMg', 'evalMg', 'rawEg', 'captureEg', 'evalEg'].map(field => [field, reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg']]));
    return [a.letter, a.letter.toUpperCase()].map(letter => [letter, { ...values }]);
  })) };
}

test('official roster pins four named existing revisions and preserves their automatic value policy', () => {
  assert.deepEqual(library.roster.map(r => [r.name, r.id, r.movement]), [
    ['Vanguard', 'rook.purple@10', 'RfB'], ['Unicorn', 'knight.purple@3', 'NC'],
    ['Cruisader', 'bishop.purple@13', 'BsR2nsN'], ['Amazon', 'queen.purple@1', 'QN'],
  ]);
  assert.ok(library.roster.every(r => r.level === 3 && r.placement === 'replace'));
  assert.equal(library.profile.evaluation, undefined);
  assert.equal(library.protocol.policy.comparisons, 'candidate-versus-reference');
  assert.ok(Object.isFrozen(library) && Object.isFrozen(library.roster[0].engineValue));
  assert.throws(() => library.roster[0].movement = 'Q', TypeError);
  assert.equal(renderOfficialReferenceIni(), fs.readFileSync(library.configFiles[1], 'utf8').replace(/\r\n/g, '\n'));
});
test('new comparison declarations meet each fixed reference once, with no experimental opponents', () => {
  const comparisons = createOfficialComparisons(['bishop.purple@7', 'rook.purple@11']);
  assert.equal(comparisons.length, 8);
  for (const id of ['bishop.purple@7', 'rook.purple@11']) {
    const rows = comparisons.filter(row => Object.values(row.armyA.upgrades)[0] === id);
    assert.deepEqual(rows.map(row => Object.values(row.armyB.upgrades)[0]), library.roster.map(r => r.id));
  }
  const profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons }));
  const scheduled = require('../scripts/balance/plan').makeSchedule({ schemaVersion: 2, name: 'fixed reference candidates', comparisons });
  assert.equal(scheduled.length, 16);
  assert.equal(profile.registry.definitions.length, 6);
  assert.throws(() => createOfficialComparisons(['queen.purple@1']), /non-reference/);
  assert.throws(() => createOfficialComparisons(['unknown']), /known/);
  assert.throws(() => createOfficialComparisons(['rook.purple@11', 'rook.purple@11']), /distinct/);
});
test('standalone wxyz slots preserve compiled movement for quiet and capture positions in both colors', () => {
  assert.deepEqual(standaloneProfile().registry.allocations.map(({ letter, slot }) => [letter, slot]), [['w', 17], ['x', 18], ['y', 19], ['z', 20]]);
  for (const reference of library.roster) for (const color of ['w', 'b']) for (const extras of [{}, { c4: 'P', e4: 'P', f6: 'p', b2: 'n', f5: 'p', c2: 'p', e7: 'p' }]) {
    assert.deepEqual(moves(standalone, standaloneProfile(), reference.id, extras, color), moves(rules, library.profile, reference.id, extras, color), `${reference.name} ${color}`);
  }
  const board = standalone.createBoard(library.protocol.playtest.startFen);
  try { assert.ok(board.moves().length > 0); assert.equal(board.outcome(), null); } finally { board.dispose(); }
});
test('Cruisader keeps all four wide moves, blocks on the first sideways leg, and has no vertical rook line', () => {
  const id = 'bishop.purple@13';
  for (const color of ['w', 'b']) {
    const from = color === 'w' ? 'd4' : 'd5', rank = Number(from[1]);
    const open = new Set(moves(rules, library.profile, id, {}, color));
    for (const file of ['b', 'f']) for (const delta of [-1, 1]) assert.ok(open.has(from + file + (rank + delta)));
    assert.ok(!open.has(from + 'd' + (rank + 1)));
    assert.ok(!open.has(from + 'g' + rank));
    for (const colorBlocker of ['P', 'p']) {
      for (const [leg, second, destination] of [['e', 'f', 'f'], ['c', 'b', 'b']]) for (const delta of [-1, 1]) {
        const target = from + destination + (rank + delta);
        assert.ok(!moves(rules, library.profile, id, { [leg + rank]: colorBlocker }, color).includes(target));
        assert.ok(moves(rules, library.profile, id, { [second + rank]: colorBlocker }, color).includes(target));
      }
    }
  }
});
test('user snN spelling agrees with canonical tested nsN in blocked and open positions', async () => {
  const alias = standaloneProfile('BsR2snN'), alternate = await createMatchRules({ profile: alias });
  for (const color of ['w', 'b']) for (const extras of [{}, { e4: 'P', c4: 'p' }, { f4: 'P', b4: 'p' }, { e5: 'p', f5: 'p', b3: 'p' }]) {
    assert.deepEqual(moves(alternate, alias, 'bishop.purple@13', extras, color), moves(standalone, standaloneProfile(), 'bishop.purple@13', extras, color));
  }
});
test('Vanguard keeps upgraded and ordinary rook castling while bishop remains nonroyal', () => {
  for (const [color, king, rook, turn, rights, required] of [
    ['w', 'K', 'W', 'w', 'KQ', ['e1g1', 'e1c1']], ['b', 'k', 'w', 'b', 'kq', ['e8g8', 'e8c8']],
  ]) {
    const home = color === 'w' ? '1' : '8', other = color === 'w' ? '8' : '1';
    const board = standalone.createBoard(fen({ ['e' + home]: king, ['a' + home]: rook, ['h' + home]: rook, ['e' + other]: color === 'w' ? 'k' : 'K' }, turn, rights));
    try { for (const move of required) assert.ok(board.moves().includes(move)); } finally { board.dispose(); }
    const ordinary = standalone.createBoard(fen({ ['e' + home]: king, ['a' + home]: color === 'w' ? 'R' : 'r', ['h' + home]: color === 'w' ? 'R' : 'r', ['e' + other]: color === 'w' ? 'k' : 'K' }, turn, rights));
    try { for (const move of required) assert.ok(ordinary.moves().includes(move)); } finally { ordinary.dispose(); }
  }
  assert.deepEqual(library.profile.roles.royalTypes, ['k']);
  assert.deepEqual(library.profile.roles.pawnTypes, ['p']);
});
test('reference diagnostic validates both colors and all six tables after letter allocation changes', async () => {
  const comparisons = createOfficialComparisons(['rook.purple@8']);
  const profile = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons }));
  const actual = inventory(profile);
  assert.equal(await requireOfficialReferenceValues({ pieceValues: async () => actual }, profile), actual);
  for (const reference of library.roster) for (const field of ['rawMg', 'captureMg', 'evalMg', 'rawEg', 'captureEg', 'evalEg']) for (const uppercase of [false, true]) {
    const altered = structuredClone(actual), allocated = profile.registry.allocations.find(a => a.id === reference.id).letter;
    altered.pieces[uppercase ? allocated.toUpperCase() : allocated][field]++;
    await assert.rejects(requireOfficialReferenceValues({ pieceValues: async () => altered }, profile), /reference value changed/);
  }
  const changed = structuredClone(profile); changed.registry.definitions.find(d => d.id === 'bishop.purple@13').movement = 'BsR2sN';
  await assert.rejects(requireOfficialReferenceValues({ pieceValues: async () => actual }, changed), /frozen definition/);
  await assert.rejects(requireOfficialReferenceValues({}, profile), /diagnostic/);
});
