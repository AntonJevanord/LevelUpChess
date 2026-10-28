const test = require('node:test');
const assert = require('node:assert/strict');
const { getDesign } = require('../src/design-catalog');
const { PLAYABLE_LIBRARIES, V17_CANDIDATES, V17_RESERVE_DESIGN_IDS, OFFICIAL_REFERENCE_DESIGN_IDS } = require('../src/playable-library');
const { getPlayableProfiles } = require('../scripts/playable-profile');
const { getDesignOptions } = require('../src/design-options');
const { defaultDesignChoices, designSetupFromChoices, loadDesignSetup } = require('../src/design-setup');
const { pieceMap, placementFromMap, pocketLetters } = require('../src/profile-fen');
const { createMatchRules } = require('../dist/balance-rules.cjs');

const libraries = PLAYABLE_LIBRARIES.filter(library => library.generation === 17);
const profiles = getPlayableProfiles();
const profileFor = library => profiles[PLAYABLE_LIBRARIES.indexOf(library)];
const pawnLibrary = libraries.find(library => library.id === 'v17-pawns');
const profile = pawnLibrary && profileFor(pawnLibrary);
const type = id => profile.registry.allocations.find(allocation => allocation.id === id).letter.toUpperCase();
const ids = { twoStep: 'pawn.blue@5', kingStep: 'pawn.blue@7', grant: 'king.reserve-pawn@6' };
let rules;
test.before(async () => { assert.ok(profile, 'The version-17 pawn workshop is compiled.'); rules = await createMatchRules({ profile }); });

function position(pieces, turn = 'w', pocket = '') {
  const map = new Map(Object.entries(pieces)); map.pocket = pocket;
  return `${placementFromMap(map)} ${turn} - - 0 1`;
}
const reflect = square => square[0] + (9 - Number(square[1]));
const swapCase = text => text.replace(/[a-z]/gi, char => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase());
function both(t, pieces, check, pocket = '') {
  for (const color of ['w', 'b']) {
    const mirrored = color === 'w' ? pieces : Object.fromEntries(Object.entries(pieces).map(([square, piece]) => [reflect(square), swapCase(piece)]));
    const board = rules.createBoard(position(mirrored, color, color === 'w' ? pocket : swapCase(pocket)));
    t.after(() => board.dispose());
    check(board, color === 'w' ? square => square : reflect);
  }
}

test('all six current workshops use the revised one-point grant within the custom-piece limit', () => {
  assert.equal(libraries.length, 6);
  assert.equal(V17_RESERVE_DESIGN_IDS.length, 9);
  assert.equal(V17_RESERVE_DESIGN_IDS[0], ids.grant);
  for (const library of libraries) {
    const compiled = profileFor(library);
    const selected = new Set(compiled.registry.definitions.map(definition => definition.id));
    assert.ok(selected.size <= 20);
    for (const id of [...OFFICIAL_REFERENCE_DESIGN_IDS, ...V17_RESERVE_DESIGN_IDS]) assert.ok(selected.has(id), `${library.id}: ${id}`);
    assert.ok(!selected.has('king.reserve-pawn@1'));
    assert.deepEqual(compiled.roles.royalTypes, ['k']);
    assert.equal(compiled.roles.reserveTypes.length, 9);
    assert.match(compiled.config, /dropChecks = false/);
    assert.equal(getDesignOptions(compiled.variant).find(option => option.id === ids.grant).accent, 'blue');
  }
  assert.deepEqual(V17_RESERVE_DESIGN_IDS.map(id => getDesign(id).level), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(getDesign(ids.grant).movement, 'fWmfF');
});

test('the pawn picker exposes both one-point designs and removes the two-point King pawn', () => {
  assert.equal(profile.registry.definitions.length, 20);
  assert.equal(V17_CANDIDATES.pawns.length, 7);
  const options = getDesignOptions(profile.variant);
  for (const [id, name, accent] of [[ids.twoStep, 'Two-step pawn', 'green'], [ids.kingStep, 'King-step pawn', 'blue']]) {
    const option = options.find(item => item.id === id);
    assert.equal(option.name, name);
    assert.equal(option.level, 1);
    assert.equal(option.accent, accent);
    assert.equal(option.status, 'experimental');
    assert.match(option.description, /Promotes to a standard/);
  }
  assert.ok(!options.some(option => option.id === 'pawn.orange@4'));
  assert.equal(getDesign('pawn.orange@4').level, 2, 'The archived price is not rewritten.');
});

test('version-16 workshops retain their exact profiles, grant and King-pawn price', () => {
  const hashes = {
    references: 'de9e4d0a05c76126d993bb1f2fda1ba6d7a4221f6470bac38fb416cf6b63c13f',
    pawns: '60479ba5ebaf05514098ff60abb636ff8d1b4aca7932734b29c4c320c9b14cab',
    knights: 'cd11d4bc5f67eaf4d6edaeaf80aa4e60b56460129da5cf6f5d2c64f880ac78a0',
    bishops: '70c047fc6a997b52b3d516384bcfd549cecf26f32e03cb321bb48ff46e8019ba',
    rooks: 'fec9ad5537423cad109704c34b3e67743869f1ccea8f72321dae5ed2116040b5',
    queens: '5a8508f0fdc13923545c052b7b77066100b5dfc9c3d552c73a5aae8104ccf8eb',
  };
  for (const [family, hash] of Object.entries(hashes)) {
    const library = PLAYABLE_LIBRARIES.find(item => item.id === `v16-${family}`);
    const compiled = profileFor(library);
    assert.equal(compiled.hash, hash);
    assert.ok(compiled.registry.definitions.some(definition => definition.id === 'king.reserve-pawn@1'));
  }
  const archived = profileFor(PLAYABLE_LIBRARIES.find(item => item.id === 'v16-pawns'));
  assert.equal(getDesignOptions(archived.variant).find(option => option.id === 'pawn.orange@4').level, 2);
});

test('one pawn of each design and one grant cost exactly three points per side and round-trip setup', () => {
  const choices = { ...defaultDesignChoices(profile), c2: ids.twoStep, d2: ids.kingStep, e1: ids.grant,
    c7: ids.twoStep, d7: ids.kingStep, e8: ids.grant };
  const setup = designSetupFromChoices(choices, 3, profile);
  assert.deepEqual(setup.costs, { w: 3, b: 3 });
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
  const pieces = pieceMap(setup.fen);
  assert.equal(pieces.get('e1'), 'K');
  assert.equal(pieces.get('e8'), 'k');
  assert.equal(pieces.size, 32);
  assert.equal(pieces.get('c2'), type(ids.twoStep));
  assert.equal(pieces.get('d2'), type(ids.kingStep));
  assert.equal(pocketLetters(setup.fen), type(ids.grant) + type(ids.grant).toLowerCase());
  assert.throws(() => designSetupFromChoices(choices, 2, profile), /Budget exceeded/);
});

test('the playable two-step pawn uses clear forward movement, long diagonal captures and standard promotion for both colors', t => {
  const pawn = type(ids.twoStep);
  both(t, { h1: 'K', h7: 'k', d4: pawn, b6: 'p' }, (board, square) => {
    for (const target of ['d5', 'd6', 'b6']) assert.ok(board.moves().includes(square('d4') + square(target)));
    assert.ok(!board.moves().includes(square('d4') + square('e5')), 'Diagonal quiet movement is absent.');
  });
  both(t, { h1: 'K', h7: 'k', d4: pawn, d5: 'P', c5: 'P', b6: 'p' }, (board, square) => {
    for (const target of ['d5', 'd6', 'b6']) assert.ok(!board.moves().includes(square('d4') + square(target)));
  });
  for (const id of [ids.twoStep, ids.kingStep]) both(t, { h1: 'K', h6: 'k', b7: type(id) }, (board, square) => {
    const prefix = square('b7') + square('b8');
    assert.deepEqual(board.moves().filter(move => move.startsWith(prefix)).sort(), ['b', 'n', 'q', 'r'].map(piece => prefix + piece));
  });
});

test('the playable King-step pawn keeps eight quiet steps and diagonal-only captures for both colors', t => {
  const pawn = type(ids.kingStep);
  both(t, { h1: 'K', h7: 'k', d4: pawn }, (board, square) => {
    const expected = ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'].map(square).sort();
    assert.deepEqual(board.moves().filter(move => move.startsWith(square('d4'))).map(move => move.slice(2, 4)).sort(), expected);
  });
  both(t, { h1: 'K', h7: 'k', d4: pawn, c3: 'p', d3: 'p', e3: 'p', c4: 'p', e4: 'p', c5: 'p', d5: 'p', e5: 'p' }, (board, square) => {
    assert.deepEqual(board.moves().filter(move => move.startsWith(square('d4'))).map(move => move.slice(2, 4)).sort(),
      ['c3', 'e3', 'c5', 'e5'].map(square).sort());
  });
});

test('the playable level-one grant moves diagonally only to empty squares and keeps finite nonchecking drops', t => {
  const grant = type(ids.grant);
  both(t, { h1: 'K', h7: 'k', d4: grant, c5: 'p', d5: 'p' }, (board, square) => {
    assert.deepEqual(board.moves().filter(move => move.startsWith(square('d4'))).map(move => move.slice(2, 4)).sort(), ['d5', 'e5'].map(square).sort());
  });
  both(t, { h1: 'K', d5: 'k' }, (board, square) => {
    const drops = board.moves().filter(move => move.startsWith(grant + '@'));
    assert.ok(!drops.includes(grant + '@' + square('d4')), 'A checking straight-forward drop is forbidden.');
    assert.ok(drops.includes(grant + '@' + square('c4')), 'A quiet diagonal contact does not give check.');
    assert.ok(!drops.includes(grant + '@' + square('c5')), 'Drops remain within the own half.');
    assert.equal(board.push(grant + '@' + square('c3')), true);
    assert.equal(pocketLetters(board.fen()), '');
    assert.equal(pieceMap(board.fen()).get(square('h1')).toLowerCase(), 'k');
  }, grant);
});
