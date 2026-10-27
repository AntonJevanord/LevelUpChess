'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createPawnGrantConfig, pawnGrantMetadata } = require('../scripts/balance/v17-pawn-grants');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getDesign } = require('../src/design-catalog');
const { pieceMap, pocketLetters } = require('../src/profile-fen');
const { createMatchRules } = require('../dist/balance-rules.cjs');

const cost = army => Object.values(army.upgrades).reduce((sum, id) => sum + getDesign(id).level, 0)
  + army.reserve.reduce((sum, item) => sum + getDesign(item.id).level * item.count, 0);

test('the declared pawn/grant experiment freezes equal three-point bundles and all requested opponents', () => {
  const config = createPawnGrantConfig();
  assert.deepEqual(JSON.parse(fs.readFileSync(require.resolve('../experiments/balance/v17-pawn-grants.json'), 'utf8')), config);
  assert.equal(config.schemaVersion, 3);
  assert.equal(config.comparisons.length, 15);
  assert.equal(pawnGrantMetadata.length, 15);
  const references = new Set(['vanguard', 'unicorn', 'cruisader', 'amazon']);
  const bundles = new Set(['bishop-pawns', 'returning-pawns', 'pawn-grants']);
  assert.equal(pawnGrantMetadata.filter(cell => bundles.has(cell.aKey) && references.has(cell.bKey)).length, 12);
  assert.equal(pawnGrantMetadata.filter(cell => bundles.has(cell.aKey) && bundles.has(cell.bKey)).length, 3);
  for (const comparison of config.comparisons) for (const army of [comparison.armyA, comparison.armyB]) {
    assert.equal(cost(army), 3);
    assert.deepEqual(army.remove, []);
    const pawns = Object.entries(army.upgrades).filter(([, id]) => getDesign(id).family === 'pawn');
    if (pawns.length) {
      assert.deepEqual(pawns.map(([square]) => square), ['c2', 'd2', 'e2']);
      assert.equal(new Set(pawns.map(([, id]) => id)).size, 1);
      assert.deepEqual(army.reserve, []);
    }
    if (army.reserve.length) {
      assert.deepEqual(army.upgrades, {});
      assert.deepEqual(army.reserve, [{ id: 'king.reserve-pawn@1', count: 3 }]);
    }
  }
});

test('240 scheduled games retain all eight opening groups and complete color pairs in every cell', () => {
  const config = createPawnGrantConfig(), schedule = makeSchedule(config);
  assert.equal(config.openings.length, 8);
  assert.ok(config.openings.some(opening => opening.moves.length === 0), 'an unforced start exposes move-one drop choices');
  assert.equal(schedule.length, 240);
  assert.equal(new Set(schedule.map(game => game.id)).size, 240);
  assert.equal(new Set(schedule.map(game => game.pairId)).size, 120);
  for (const comparison of config.comparisons) {
    const games = schedule.filter(game => game.comparisonId === comparison.id);
    assert.equal(games.length, 16);
    for (const opening of config.openings) {
      const pair = games.filter(game => game.openingId === opening.id);
      assert.deepEqual(pair.map(game => game.aColor).sort(), ['b', 'w']);
      assert.equal(pair[0].pairId, pair[1].pairId);
    }
  }
});

test('bundle starts preserve royal kings and pawn positions, and every declared prefix is legal', async () => {
  const config = createPawnGrantConfig(), registry = createDesignRegistry(config);
  assert.equal(registry.definitions.length, 7, 'four references, two pawn upgrades and one finite grant');
  const profile = compileDesignProfile(registry), rules = await createMatchRules({ profile });
  const guard = registry.allocations.find(allocation => allocation.id === 'king.reserve-pawn@1').letter;
  for (const game of makeSchedule(config)) {
    const white = game.aColor === 'w' ? game.comparison.armyA : game.comparison.armyB;
    const black = game.aColor === 'w' ? game.comparison.armyB : game.comparison.armyA;
    const fen = rules.startingFen(white, black), pieces = pieceMap(fen);
    assert.equal(pieces.get('e1'), 'K');
    assert.equal(pieces.get('e8'), 'k');
    const whiteCount = white.reserve.length ? 3 : 0, blackCount = black.reserve.length ? 3 : 0;
    assert.equal([...pocketLetters(fen)].filter(type => type === guard.toUpperCase()).length, whiteCount);
    assert.equal([...pocketLetters(fen)].filter(type => type === guard).length, blackCount);
    assert.equal(pieces.size, 32, 'reserves never displace or add on-board pieces before play');
    for (const [army, color] of [[white, 'w'], [black, 'b']]) {
      for (const file of 'cde') {
        const id = army.upgrades[file + '2'];
        const type = id ? registry.allocations.find(allocation => allocation.id === id).letter : 'p';
        assert.equal(pieces.get(file + (color === 'w' ? '2' : '7')), color === 'w' ? type.toUpperCase() : type);
      }
    }
    const board = rules.createBoard(fen);
    try {
      for (const move of game.openingMoves) assert.ok(board.push(move), game.id + ': ' + move);
      assert.equal(pocketLetters(board.fen()).length, whiteCount + blackCount, 'ordinary prefixes leave every grant undeployed');
    } finally { board.dispose(); }
  }
});
