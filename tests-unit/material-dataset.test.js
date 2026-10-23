'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getCampaign } = require('../scripts/balance/material-plan');
const { DEFAULT_SAMPLING, decodeMaterial, exportDataset } = require('../scripts/balance/material-dataset');

const profile = getCampaign().profile;
const placement = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const fen = (ply, pieces = placement) => `${pieces} ${ply % 2 ? 'b' : 'w'} KQkq - ${ply} ${1 + Math.floor(ply / 2)}`;
const identity = { profileHash: profile.hash, registryHash: profile.registryHash, engineIdentityVerified: false, evaluation: 'automatic-reference' };
const scoreReason = { result: '1/2-1/2', reason: 'threefold-repetition' };

function fixture({ plies = 28, changes = {}, result = scoreReason.result, reason = scoreReason.reason } = {}) {
  const states = Array.from({ length: plies + 1 }, (_, ply) => fen(ply, changes[ply] || placement));
  const moves = Array.from({ length: plies }, (_, ply) => `move${ply}`);
  const records = ['w', 'b'].map(aColor => ({
    id: `game-${aColor}`, pairId: 'pair-1', comparisonId: 'ordinary', openingId: 'start', aColor,
    attempt: 1, status: 'completed', result, reason, startFen: states[0], finalFen: states.at(-1),
    moves: [...moves], sans: moves.map((_, index) => `SAN${index}`), openingMoves: [], openingPlies: 0,
    totalPlies: plies, playedPlies: plies, profileHash: profile.hash, registryHash: profile.registryHash,
    variant: profile.variant, royalMode: 'king', evaluationCaveat: null,
    engine: { nodes: 1000, threads: 1, hashMb: 16, maxPlies: 100 },
    whiteStrength: { skill: 20 }, blackStrength: { skill: 20 },
  }));
  let disposed = 0;
  const rulesFactory = async () => ({ createBoard(start) {
    assert.equal(start, states[0]);
    let ply = 0;
    return {
      fen: () => states[ply],
      outcome: () => ply === plies ? { result, reason } : null,
      san(move) { assert.equal(move, moves[ply]); return `SAN${ply}`; },
      push(move) { if (move !== moves[ply]) return false; ply++; return true; },
      dispose() { disposed++; },
    };
  } });
  return { sources: [{ id: 'source', records, identity }], profile, rulesFactory,
    disposed: () => disposed, records, states };
}

test('FEN features count families plus stable upgrade bonuses and white-perspective tempo', () => {
  const white = decodeMaterial('4k3/8/8/8/8/8/8/3UK3 w - - 0 1', profile);
  assert.deepEqual(white.x, [0, 0, 0, 0, 1, 1, 1]);
  assert.equal(white.totalPieces, 3);
  assert.equal(white.phase, 'endgame');
  const black = decodeMaterial('3uk3/8/8/8/8/8/8/4K3 b - - 0 1', profile);
  assert.deepEqual(black.x, [0, 0, 0, 0, -1, -1, -1]);
  const promoted = decodeMaterial('4k3/8/8/8/8/8/8/3QK3 w - - 0 1', profile);
  assert.deepEqual(promoted.x, [0, 0, 0, 0, 1, 1, 0], 'ordinary promotion loses any pawn-upgrade identity');
});

test('temporary letter allocations resolve to their actual immutable design IDs', () => {
  const registry = createDesignRegistry({ schemaVersion: 2, comparisons: [
    { armyA: { upgrades: { d1: 'queen.purple@1' } }, armyB: { upgrades: { d1: 'queen.purple@2' } } },
  ] });
  const alternate = compileDesignProfile(registry);
  const letter = registry.allocations.find(item => item.id === 'queen.purple@2').letter;
  assert.notEqual(letter, 'u');
  const state = decodeMaterial(`4k3/8/8/8/8/8/8/3${letter.toUpperCase()}K3 w - - 0 1`, alternate);
  assert.deepEqual(state.x, [0, 0, 0, 0, 1, 1, 0, 1]);
});

test('unknown pieces, pockets, promoted markers and missing royal kings fail explicitly', () => {
  for (const value of ['4k3/8/8/8/8/8/8/3XK3 w - - 0 1',
    '4k3/8/8/8/8/8/8/3Q~K3 w - - 0 1', '4k3/8/8/8/8/8/8/3QK3[P] w - - 0 1',
    '8/8/8/8/8/8/8/3QK3 w - - 0 1']) assert.throws(() => decodeMaterial(value, profile));
  const broken = structuredClone(profile); broken.definitionsByLetter.u.family = 'rook';
  assert.throws(() => decodeMaterial(fen(0), broken), /intact compiled|Archived definition/);
});

test('default sparse windows retain draws, game-balanced weights and shared opening groups', async () => {
  const data = fixture();
  const exported = await exportDataset({ ...data, openingGroups: { start: 'unforced' } });
  assert.deepEqual(exported.sampling, DEFAULT_SAMPLING);
  assert.deepEqual(exported.samples.filter(sample => sample.gameId.endsWith('game-w')).map(sample => sample.ply), [16, 21, 26]);
  assert.deepEqual(new Set(exported.samples.map(sample => sample.x[5])), new Set([1, -1]));
  assert.ok(exported.samples.every(sample => sample.y === 0.5 && sample.weight === 1 / 3 && sample.groupId === 'unforced'));
  assert.equal(exported.coverage.completePairs, 1);
  assert.equal(exported.coverage.completedGames, 2);
  assert.equal(exported.coverage.replayedPlies, 56);
  assert.equal(exported.coverage.accepted, 6);
  assert.equal(exported.coverage.excluded.terminal, 0);
  assert.equal(exported.games.length, 2);
  assert.equal(data.disposed(), 2);
  assert.deepEqual(exported.sources[0].identity, identity);
});

test('material windows reject capture/recapture transitions even if endpoint differences recover', async () => {
  const missingWhitePawn = 'rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR';
  const data = fixture({ plies: 12, changes: { 4: missingWhitePawn } });
  const exported = await exportDataset({ ...data, sampling: { minPly: 2, stride: 1 } });
  for (const sample of exported.samples) assert.ok(sample.ply < 2 || sample.ply > 6);
  assert.equal(exported.coverage.excluded.materialChange, 10);
  assert.ok(exported.samples.length > 0);
  for (const game of exported.games) {
    const total = exported.samples.filter(sample => sample.gameId === game.gameId).reduce((sum, sample) => sum + sample.weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-12);
  }
});

test('games without accepted positions remain visible rather than gaining invented samples', async () => {
  const data = fixture({ plies: 8 });
  const exported = await exportDataset(data);
  assert.equal(exported.samples.length, 0);
  assert.equal(exported.coverage.gamesWithoutSamples, 2);
  assert.equal(exported.coverage.sampledGames, 0);
  assert.equal(exported.coverage.groups, 0);
  assert.equal(exported.coverage.pairsWithoutSamples, 1);
});

test('one unsampled game makes a sampled partial pair and a visible limitation', async () => {
  const long = fixture(), short = fixture({ plies: 8 });
  long.sources[0].records[1] = short.records[1];
  const longRules = await long.rulesFactory(), shortRules = await short.rulesFactory();
  let created = 0;
  const rulesFactory = async () => ({ createBoard(start) {
    return (created++ === 0 ? longRules : shortRules).createBoard(start);
  } });
  const exported = await exportDataset({ ...long, rulesFactory });
  assert.equal(exported.coverage.completePairs, 1);
  assert.equal(exported.coverage.sampledCompletePairs, 0);
  assert.equal(exported.coverage.sampledPartialPairs, 1);
  assert.ok(exported.limitations.some(text => text.includes('only one game')));
});

test('duplicate games, incomplete pairs, mixed policies and corrupted journals reject before fitting', async () => {
  const changes = [
    data => { data.sources[0].records.push(data.records[0]); },
    data => { data.sources[0].records.pop(); },
    data => { data.records[1].aColor = 'w'; },
    data => { data.records[1].engine.nodes = 2000; },
    data => { data.records[1].whiteStrength.skill = 10; },
    data => { data.records[0].profileHash = 'wrong'; },
    data => { data.records[0].status = 'truncated'; data.records[0].result = '*'; },
    data => { data.records[0].evaluation = { pieceValues: {} }; },
    data => { data.records[0].totalPlies++; },
  ];
  for (const change of changes) {
    const data = fixture(); change(data);
    await assert.rejects(exportDataset(data));
    assert.equal(data.disposed(), 0);
  }
});

test('different source identity contexts cannot silently pool even matching journal annotations', async () => {
  const data = fixture();
  const other = fixture();
  other.sources[0].id = 'other';
  other.sources[0].identity = { ...identity, engineIdentityVerified: true };
  await assert.rejects(exportDataset({ ...data, sources: [...data.sources, ...other.sources] }), /identity contexts/);
});

test('final outcomes and SAN are replay-validated and boards always disposed on failure', async () => {
  for (const alter of [data => { data.records[0].finalFen = fen(1); },
    data => { data.records[0].result = '1-0'; }, data => { data.records[0].sans[1] = 'corrupted'; }]) {
    const data = fixture(); alter(data);
    await assert.rejects(exportDataset(data));
    assert.equal(data.disposed(), 1);
  }
});

test('invalid sampling options fail instead of silently changing the estimator protocol', async () => {
  for (const sampling of [{ stride: 0 }, { stableAfter: -1 }, { minPly: 2.5 }, { unknown: 1 }]) {
    await assert.rejects(exportDataset({ ...fixture(), sampling }), /sampling/);
  }
});

test('actual browser rules replay a mating pair without a native engine', async () => {
  const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  const rules = await require('../dist/balance-rules.cjs').createMatchRules({ profile });
  const board = rules.createBoard(fen(0));
  const sans = [];
  let finalFen;
  try {
    for (const move of moves) { sans.push(board.san(move)); assert.equal(board.push(move), true); }
    finalFen = board.fen();
    assert.deepEqual(board.outcome(), { result: '0-1', reason: 'checkmate' });
  } finally { board.dispose(); }
  const data = fixture({ plies: 4, result: '0-1', reason: 'checkmate' });
  for (const record of data.records) Object.assign(record, { startFen: fen(0), finalFen, moves, sans });
  const exported = await exportDataset({ sources: data.sources, profile,
    sampling: { minPly: 0, stride: 1, stableBefore: 0, stableAfter: 0 } });
  assert.equal(exported.coverage.accepted, 8);
  assert.equal(exported.coverage.replayedPlies, 8);
  assert.ok(exported.samples.every(sample => sample.y === 0));
});
