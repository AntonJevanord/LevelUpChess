const test = require('node:test');
const assert = require('node:assert/strict');
const { getDesign } = require('../src/design-catalog');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { designSetupFromChoices, loadDesignSetup, DEFAULT_DESIGN_CHOICES } = require('../src/design-setup');
const { deployDesignArmies, recoverDesignChoices } = require('../src/design-deployment');
const { pieceMap } = require('../src/profile-fen');
const { START_FEN } = require('../src/knight-setup');

const pairId = 'pawn.purple@6';
const guardId = 'knight.purple@2';
const profile = smallProfile([pairId, guardId]);
const typeFor = (id, color = 'w', library = profile) => {
  const letter = library.registry.allocations.find(allocation => allocation.id === id).letter;
  return color === 'w' ? letter.toUpperCase() : letter;
};
const choiceFor = (square, id, library = profile) => ({ square, definition: getDesign(id), letter: typeFor(id, 'b', library) });
const armyFor = upgrades => ({ choices: Object.entries(upgrades).map(([square, id]) => choiceFor(square, id)) });
function smallProfile(ids) {
  const squareFor = { pawn: 'a2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
  return compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons: ids.map(id => ({
    armyA: { upgrades: { [squareFor[getDesign(id).family]]: id } }, armyB: {},
  })) }));
}

test('a paired purchase deploys two same-color pawns for one three-point choice', () => {
  const choices = { ...DEFAULT_DESIGN_CHOICES, a2: pairId, h7: pairId };
  const setup = designSetupFromChoices(choices, 3, profile);
  const pieces = pieceMap(setup.fen);
  assert.deepEqual(setup.costs, { w: 3, b: 3 });
  assert.equal(pieces.size, 34);
  assert.equal(pieces.get('a2'), typeFor(pairId));
  assert.equal(pieces.get('a3'), typeFor(pairId));
  assert.equal(pieces.get('h7'), typeFor(pairId, 'b'));
  assert.equal(pieces.get('h6'), typeFor(pairId, 'b'));
  assert.equal(pieces.get('b2'), 'P');
  assert.equal(pieces.get('g7'), 'p');
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
});

test('inserted guards keep home knights and advance ordinary pawns only on their own file', () => {
  const choices = { ...DEFAULT_DESIGN_CHOICES, b1: guardId, g8: guardId };
  const setup = designSetupFromChoices(choices, 3, profile);
  const pieces = pieceMap(setup.fen);
  for (const [square, type] of [['b1', 'N'], ['b2', typeFor(guardId)], ['b3', 'P'], ['g8', 'n'], ['g7', typeFor(guardId, 'b')], ['g6', 'p']]) {
    assert.equal(pieces.get(square), type, square);
  }
  assert.equal(pieces.get('b7'), 'p');
  assert.equal(pieces.get('g2'), 'P');
  assert.equal(pieces.get('e1'), 'K');
  assert.equal(pieces.get('e8'), 'k');
  assert.match(setup.fen, / w KQkq - 0 1$/);
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
});

test('guard plus paired pawns fill only the owner half and recover all six-point purchases', () => {
  const choices = { ...DEFAULT_DESIGN_CHOICES, b1: guardId, b2: pairId, g8: guardId, g7: pairId };
  const setup = designSetupFromChoices(choices, 6, profile);
  const pieces = pieceMap(setup.fen);
  assert.deepEqual(setup.costs, { w: 6, b: 6 });
  for (const [square, type] of [
    ['b1', 'N'], ['b2', typeFor(guardId)], ['b3', typeFor(pairId)], ['b4', typeFor(pairId)],
    ['g8', 'n'], ['g7', typeFor(guardId, 'b')], ['g6', typeFor(pairId, 'b')], ['g5', typeFor(pairId, 'b')],
  ]) assert.equal(pieces.get(square), type, square);
  assert.equal(pieces.has('b5'), false);
  assert.equal(pieces.has('g4'), false);
  assert.equal(pieces.get('b7'), 'p');
  assert.equal(pieces.get('g2'), 'P');
  assert.deepEqual(loadDesignSetup(setup.fen, profile), choices);
  assert.throws(() => designSetupFromChoices(choices, 5, profile), /[Bb]udget/);
  const reversed = Object.fromEntries(Object.entries(choices).reverse());
  assert.equal(designSetupFromChoices(reversed, 6, profile).fen, setup.fen);
});

test('legacy fixed guards retain rank-three deployment and reject a pair collision', () => {
  const legacy = smallProfile(['knight.purple@1', pairId]);
  const choices = { ...DEFAULT_DESIGN_CHOICES, b1: 'knight.purple@1', g8: 'knight.purple@1' };
  const setup = designSetupFromChoices(choices, 3, legacy);
  const pieces = pieceMap(setup.fen);
  assert.equal(pieces.get('b3'), typeFor('knight.purple@1', 'w', legacy));
  assert.equal(pieces.get('b2'), 'P');
  assert.equal(pieces.get('g6'), typeFor('knight.purple@1', 'b', legacy));
  assert.equal(pieces.get('g7'), 'p');
  assert.deepEqual(loadDesignSetup(setup.fen, legacy), choices);
  assert.throws(() => designSetupFromChoices({ ...choices, b2: pairId }, 6, legacy), /occupied/);
});

test('insertion rejects opponent pieces, nonpawns, royals, and own-half overflow without changing its input', () => {
  const white = armyFor({ b1: guardId });
  const black = armyFor({ b1: guardId });
  const failures = [
    { edits: [['b2', 'p']], white, black: {} },
    { edits: [['b3', 'p']], white, black: {} },
    { edits: [['b3', 'R']], white, black: {} },
    { edits: [['b3', 'K']], white, black: {} },
    { edits: [['b3', 'P'], ['b4', 'P'], ['b5', 'p']], white, black: {} },
    { edits: [['b7', 'P']], white: {}, black },
    { edits: [['b6', 'p'], ['b5', 'p'], ['b4', 'P']], white: {}, black },
  ];
  for (const fixture of failures) {
    const initial = pieceMap(START_FEN);
    for (const [square, type] of fixture.edits) initial.set(square, type);
    const before = new Map(initial);
    assert.throws(() => deployDesignArmies(profile, fixture.white, fixture.black, initial), /pawns|space/);
    assert.deepEqual(initial, before);
  }
  const initial = pieceMap(START_FEN);
  initial.set('b3', 'P');
  const before = new Map(initial);
  assert.throws(() => deployDesignArmies(profile, armyFor({ b2: pairId }), {}, initial), /occupied/);
  assert.deepEqual(initial, before);
});

test('removed pawns create space for guards without advancing or recreating material', () => {
  const army = { ...armyFor({ b1: guardId }), remove: ['b2'] };
  const pieces = deployDesignArmies(profile, army);
  assert.equal(pieces.get('b2'), typeFor(guardId));
  assert.equal(pieces.has('b3'), false);
  assert.equal(pieces.get('b1'), 'N');
  assert.equal(pieces.size, 32);
  assert.equal(pieces.get('b7'), 'p');
});

test('recovery does not infer a pair from an incomplete or opposing-color study', () => {
  const choices = { ...DEFAULT_DESIGN_CHOICES, b2: pairId };
  const full = designSetupFromChoices(choices, 3, profile);
  const pieces = pieceMap(full.fen);
  pieces.delete('b3');
  const { recoverDesignChoices } = require('../src/design-deployment');
  assert.equal(recoverDesignChoices(pieces, profile).b2, '');
  pieces.set('b3', typeFor(pairId, 'b'));
  assert.equal(recoverDesignChoices(pieces, profile).b2, '');
  const malformed = pieceMap(START_FEN);
  malformed.set('b7', typeFor(guardId));
  assert.equal(recoverDesignChoices(malformed, profile).b8, '');
});

test('browser and balance rules generate the same paired and inserted starting armies', async () => {
  const { createMatchRules } = require('../dist/balance-rules.cjs');
  const rules = await createMatchRules({ profile });
  const choices = { ...DEFAULT_DESIGN_CHOICES, b1: guardId, b2: pairId, g8: guardId, g7: pairId };
  const setup = designSetupFromChoices(choices, 6, profile);
  const fen = rules.startingFen({ b1: guardId, b2: pairId }, { g1: guardId, g2: pairId });
  assert.equal(fen, setup.fen);
  const board = rules.createBoard(fen);
  try { assert.ok(board.moves().length > 0); }
  finally { board.dispose(); }
});

test('split queens replace the original and insert a second unit for one three-point purchase', () => {
  const id = 'queen.purple@2';
  const library = smallProfile([id]);
  const choices = { ...DEFAULT_DESIGN_CHOICES, d1: id, d8: id };
  const setup = designSetupFromChoices(choices, 3, library);
  const pieces = pieceMap(setup.fen);
  assert.deepEqual(setup.costs, { w: 3, b: 3 });
  assert.equal(pieces.size, 34);
  for (const square of ['d1', 'd2']) assert.equal(pieces.get(square), typeFor(id, 'w', library), square);
  for (const square of ['d8', 'd7']) assert.equal(pieces.get(square), typeFor(id, 'b', library), square);
  for (const [square, piece] of [['d3', 'P'], ['d6', 'p'], ['e1', 'K'], ['e8', 'k'], ['c2', 'P'], ['e7', 'p']]) {
    assert.equal(pieces.get(square), piece, square);
  }
  assert.match(setup.fen, / w KQkq - 0 1$/);
  assert.deepEqual(loadDesignSetup(setup.fen, library), choices);
  assert.equal(designSetupFromChoices(loadDesignSetup(setup.fen, library), 3, library).fen, setup.fen);
});

test('queen and companion keeps the ordinary queen and grants a capturable nonroyal unit', () => {
  const id = 'queen.purple@3';
  const library = smallProfile([id]);
  const choices = { ...DEFAULT_DESIGN_CHOICES, d1: id, d8: id };
  const setup = designSetupFromChoices(choices, 3, library);
  const pieces = pieceMap(setup.fen);
  assert.deepEqual(setup.costs, { w: 3, b: 3 });
  assert.equal(pieces.size, 34);
  for (const [square, piece] of [['d1', 'Q'], ['d8', 'q'], ['d3', 'P'], ['d6', 'p']]) assert.equal(pieces.get(square), piece, square);
  assert.equal(pieces.get('d2'), typeFor(id, 'w', library));
  assert.equal(pieces.get('d7'), typeFor(id, 'b', library));
  assert.deepEqual(library.roles.royalTypes, ['k']);
  assert.deepEqual(loadDesignSetup(setup.fen, library), choices);
  assert.equal(designSetupFromChoices(loadDesignSetup(setup.fen, library), 3, library).fen, setup.fen);
});

test('either queen package advances paired pawns within its own half and recovers all purchases', () => {
  for (const id of ['queen.purple@2', 'queen.purple@3']) {
    const library = smallProfile([id, pairId]);
    const choices = { ...DEFAULT_DESIGN_CHOICES, d1: id, d2: pairId, d8: id, d7: pairId };
    const setup = designSetupFromChoices(choices, 6, library);
    const pieces = pieceMap(setup.fen);
    assert.deepEqual(setup.costs, { w: 6, b: 6 });
    assert.equal(pieces.size, 36);
    for (const square of ['d3', 'd4']) assert.equal(pieces.get(square), typeFor(pairId, 'w', library), square);
    for (const square of ['d6', 'd5']) assert.equal(pieces.get(square), typeFor(pairId, 'b', library), square);
    assert.deepEqual(loadDesignSetup(setup.fen, library), choices);
    assert.equal(designSetupFromChoices(loadDesignSetup(setup.fen, library), 6, library).fen, setup.fen);
    const reversed = Object.fromEntries(Object.entries(choices).reverse());
    assert.equal(designSetupFromChoices(reversed, 6, library).fen, setup.fen);
  }
});

test('queen recovery requires both same-color split units or the unchanged base queen', () => {
  for (const id of ['queen.purple@2', 'queen.purple@3']) {
    const library = smallProfile([id]);
    const setup = designSetupFromChoices({ ...DEFAULT_DESIGN_CHOICES, d1: id, d8: id }, 3, library);
    for (const [square, replacement, purchase] of [
      ['d2', undefined, 'd1'], ['d2', typeFor(id, 'b', library), 'd1'],
      ['d1', 'Q', 'd1'], ['d7', typeFor(id, 'w', library), 'd8'], ['d8', 'K', 'd8'],
    ]) {
      if (id === 'queen.purple@3' && square === 'd1' && replacement === 'Q') continue;
      const pieces = pieceMap(setup.fen);
      if (replacement) pieces.set(square, replacement); else pieces.delete(square);
      assert.equal(recoverDesignChoices(pieces, library)[purchase], '', `${id}: ${square}`);
    }
  }
});

test('queen insertion rejects blocked or overflowing files transactionally for either color', () => {
  for (const id of ['queen.purple@2', 'queen.purple@3']) {
    const library = smallProfile([id]);
    const army = { choices: [choiceFor('d1', id, library)] };
    for (const [color, edits] of [
      ['w', [['d2', 'p']]], ['w', [['d3', 'R']]], ['w', [['d3', 'P'], ['d4', 'P']]],
      ['b', [['d7', 'P']]], ['b', [['d6', 'r']]], ['b', [['d6', 'p'], ['d5', 'p']]],
    ]) {
      const pieces = pieceMap(START_FEN);
      for (const [square, piece] of edits) pieces.set(square, piece);
      const before = new Map(pieces);
      assert.throws(() => deployDesignArmies(library, color === 'w' ? army : {}, color === 'b' ? army : {}, pieces), /pawns|space/);
      assert.deepEqual(pieces, before);
    }
    const pieces = deployDesignArmies(library, { ...army, remove: ['d2'] });
    assert.equal(pieces.get('d2'), typeFor(id, 'w', library));
    assert.equal(pieces.has('d3'), false);
    assert.equal(pieces.size, 32);
    assert.equal(pieces.get('d7'), 'p');
  }
});
