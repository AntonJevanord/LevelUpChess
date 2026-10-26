'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBishopPlan, validateBishopPlan, getBishopProtocol } = require('../scripts/balance/bishop-plan');
const { getBishopSource, asSimpleReplayManifest } = require('../scripts/balance/bishop-source');
const { getPlan } = require('./bishop-fixture');

test('focused declaration adds five complete color pairs per inherited position', async () => {
  const plan = await getPlan();
  assert.equal(validateBishopPlan(plan), plan);
  assert.equal(plan.totalGames, 1280); assert.equal(plan.linkedTotalGames, 7040);
  assert.equal(plan.openings.length, 128); assert.equal(plan.units.length, 640);
  assert.deepEqual(plan.study.checkpoints, [320, 640, 1280]);
  assert.deepEqual(plan.roster.filter(item => item.role === 'candidate').map(item => item.movement),
    ['BsR2sN', 'BsWsN', 'BsR2fsN', 'BsRgmsR', 'BsRgmsR0']);
  for (const opening of plan.openings) {
    const games = plan.schedule.filter(game => game.openingId === opening.id);
    assert.equal(games.length, 10);
    assert.ok(games.every(game => game.kind === 'head' && game.designB === 'rook.purple@10'
      && game.groupId === opening.id && game.openingMoves.length === 0));
    for (const unit of plan.units.filter(unit => unit.gameIds.some(id => games.some(game => game.id === id)))) {
      const pair = games.filter(game => unit.gameIds.includes(game.id));
      assert.deepEqual(pair.map(game => game.aColor), ['w', 'b']);
      assert.equal(pair[0].whiteDesign, pair[1].blackDesign);
      assert.equal(pair[0].blackDesign, pair[1].whiteDesign);
    }
  }
});
test('retained simple identities and rook castling survive the expanded registry', async () => {
  const plan = await getPlan(), source = getBishopSource();
  for (const old of source.sourceManifest.plan.registry.allocations) {
    assert.deepEqual(plan.registry.allocations.find(item => item.id === old.id), old);
  }
  assert.equal(plan.registry.definitions.length, 12);
  assert.deepEqual(plan.profile.evaluation, source.sourceManifest.plan.profile.evaluation);
  assert.ok(plan.profile.roles.castlingRooks.includes('x'));
  assert.deepEqual(plan.profile.roles.royalTypes, ['k']);
  assert.equal(plan.profile.definitionsByLetter.z.movement, 'BsRgmsR');
  assert.equal(plan.profile.definitionsByLetter.l.movement, 'BsRgmsR0');
});
test('bishop declarations reject changed identities, openings and substitutions', async () => {
  const plan = await getPlan();
  for (const mutate of [p => p.settings.nodes++, p => p.study.checkpoints[0]++,
    p => p.simpleSource.originalManifestSupplied = true, p => p.openings[0].fen = p.openings[1].fen,
    p => p.schedule[0].designB = 'queen.purple@1', p => p.schedule.reverse(),
    p => p.units[0].gameIds.pop()]) {
    const changed = structuredClone(plan); mutate(changed);
    assert.throws(() => validateBishopPlan(changed), /frozen|bishop|inherited|schedule/i);
  }
  await assert.rejects(createBishopPlan({ jobs: 8 }), /Unsupported/);
});
test('derived replay evidence never becomes an attested historical manifest', () => {
  const { sourceManifest, simpleSource } = getBishopSource();
  assert.equal(simpleSource.originalManifestSupplied, false);
  assert.equal(simpleSource.historicalNativeInventoryVerified, false);
  assert.equal(sourceManifest.provenance.originalManifestSha256, null);
  assert.equal(sourceManifest.native, undefined);
  assert.equal(sourceManifest.plan.totalGames, 3072);
  assert.equal(getBishopProtocol().sourceRecords.length, 3072);
  assert.throws(() => asSimpleReplayManifest(sourceManifest), /explicitly derived/);
});

test('new quiet hops distinguish immediate and unlimited post-hurdle landings', async () => {
  const plan = await getPlan();
  const rules = await require('../dist/balance-rules.cjs').createMatchRules({ profile: plan.profile });
  const mirror = fen => { const f = fen.split(' '); f[0] = f[0].split('/').reverse().join('/').replace(/[a-z]/gi,
    c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()); f[1] = 'b'; return f.join(' '); };
  const mirrorMove = m => m[0] + (9 - Number(m[1])) + m[2] + (9 - Number(m[3]));
  for (const [letter, long] of [['Z', false], ['L', true]]) for (const black of [false, true]) {
    const cases = [
      { rank: `3${letter}P3`, required: ['d4f4'], forbidden: ['d4e4', 'd4d5', ...(long ? [] : ['d4g4', 'd4h4'])] },
      { rank: `3${letter}P1p1`, required: ['d4f4'], forbidden: ['d4g4', 'd4h4'] },
      { rank: `3${letter}PP2`, required: [], forbidden: ['d4e4', 'd4f4', 'd4g4', 'd4h4'] },
      { rank: `3${letter}p3`, required: ['d4e4', 'd4f4', ...(long ? ['d4g4', 'd4h4'] : [])], forbidden: [] },
    ];
    for (const c of cases) {
      const fen = `8/7k/8/8/${c.rank}/8/8/K7 w - - 0 1`;
      const board = rules.createBoard(black ? mirror(fen) : fen);
      try {
        const moves = board.moves(), map = move => black ? mirrorMove(move) : move;
        for (const move of c.required) assert.ok(moves.includes(map(move)), `${letter}: missing ${map(move)}`);
        for (const move of c.forbidden) assert.ok(!moves.includes(map(move)), `${letter}: forbidden ${map(move)}`);
      } finally { board.dispose(); }
    }
  }
});
