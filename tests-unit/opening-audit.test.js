'use strict';

// Synthetic journal metadata and legal prefix diagnostics only; no engine or
// scored research match is started by this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditGames, inventory, replayPrefix, normalizeEvaluation } = require('../scripts/balance/opening-audit');
const { normalizeConfig, makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { createMatchRules } = require('../dist/balance-rules.cjs');
const { placementFromMap } = require('../src/profile-fen');

const queenId = 'queen.purple@1', pawnId = 'pawn.blue@5', grantId = 'king.reserve-pawn@6', rookId = 'rook.purple@10';
function fen(pieces, { turn = 'w', rights = '-', ep = '-', pocket } = {}) {
  const map = new Map(Object.entries(pieces)); if (pocket !== undefined) map.pocket = pocket;
  return `${placementFromMap(map)} ${turn} ${rights} ${ep} 0 1`;
}
async function context({ armyA = {}, armyB = {}, openings = [{ id: 'quiet', moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'] }], repetitions = 1, id = 'synthetic-opening-source' } = {}) {
  const config = normalizeConfig({ schemaVersion: 3, name: 'Synthetic opening audit', seed: 7, repetitions,
    engine: { nodes: 100, threads: 1, hashMb: 16, maxPlies: 400 }, openings,
    comparisons: [{ id: 'a-v-b', label: 'A versus B', armyA, armyB, strengthA: { skill: 20 }, strengthB: { skill: 20 } }] });
  const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
  const rules = await createMatchRules({ profile }), schedule = makeSchedule(config);
  const records = schedule.map(game => ({ schemaVersion: 1, id: game.id, pairId: game.pairId,
    comparisonId: game.comparisonId, comparisonLabel: game.comparison.label, openingId: game.openingId,
    repetition: game.repetition, aColor: game.aColor, attempt: 1, status: 'completed', result: '1/2-1/2',
    startFen: rules.startingFen(game.aColor === 'w' ? game.comparison.armyA : game.comparison.armyB,
      game.aColor === 'b' ? game.comparison.armyA : game.comparison.armyB),
    moves: [...game.openingMoves], openingMoves: [...game.openingMoves], openingPlies: game.openingMoves.length,
    profileHash: profile.hash, registryHash: registry.hash, registryReference: 'run.json#designRegistry', variant: profile.variant,
    engine: config.engine, evaluation: config.evaluation,
    whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
    blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB }));
  return { id, manifest: { config, schedule, designRegistry: registry, designProfile: profile }, records, rules, profile,
    letter: selected => profile.registry.allocations.find(row => row.id === selected).letter };
}
const source = value => ({ id: value.id, manifest: value.manifest, records: value.records });

test('quiet prefixes preserve every upgrade and both colors without replaying later game moves', async () => {
  const input = await context({ armyA: { upgrades: { d1: queenId } } });
  for (const row of input.records) row.moves.push('not-a-legal-later-move');
  const result = await auditGames([source(input)]);
  assert.deepEqual(result.counts, { inputAttempts: 2, latestGames: 2, eligibleGames: 2, skippedUnfinished: 0,
    duplicateCopiesIgnored: 0, uniquePositions: 2, evaluationCalls: 0, evaluationCacheHits: 0 });
  assert.deepEqual(result.positions.map(row => row.aColor).sort(), ['b', 'w']);
  for (const row of result.positions) {
    assert.equal(row.openingMoves.length, 4); assert.equal(row.events.captures.length, 0);
    assert.equal(row.upgradedPieces.length, 1); assert.equal(row.upgradedPieces[0].retainsDesign, true);
    assert.deepEqual(row.before, row.after); assert.equal(row.terminalAfter, null);
    assert.equal(row.tactics.available, false); assert.equal(row.endInCheck, false);
  }
});

test('a forced exchange records an upgraded queen capture rather than treating it as a fair starting position', async () => {
  const input = await context({ armyA: { upgrades: { d1: queenId } },
    openings: [{ id: 'forced-queen-trade', moves: ['e2e4', 'd7d5', 'd1h5', 'd5e4', 'h5f7', 'e8f7'] }] });
  // Only the army-A-as-White prefix is applicable to this one-sided fixture.
  input.records = input.records.filter(row => row.aColor === 'w');
  const result = await auditGames([source(input)]), row = result.positions[0];
  assert.equal(row.events.captures.length, 3);
  const queen = row.events.captures.find(row => row.upgraded);
  assert.equal(queen.designId, queenId); assert.equal(queen.square, 'f7');
  assert.equal(row.upgradedPieces[0].status, 'captured');
  assert.ok(row.flags.includes('upgraded-piece-captured-during-prefix'));
  assert.equal(row.after.totals.w.upgradedBoard, 0);
});

test('an upgraded pawn promotion preserves lineage and is not misreported as capture', async () => {
  const input = await context({ armyA: { upgrades: { c2: pawnId } } });
  const startFen = fen({ a1: 'K', h6: 'k', c7: input.letter(pawnId).toUpperCase() });
  const row = await replayPrefix({ rules: input.rules, profile: input.profile, startFen, openingMoves: ['c7c8q'] });
  assert.equal(row.events.captures.length, 0); assert.equal(row.events.promotions.length, 1);
  assert.equal(row.events.promotions[0].designId, pawnId);
  assert.equal(row.upgradedPieces[0].status, 'promoted');
  assert.equal(row.upgradedPieces[0].retainsDesign, false);
  assert.equal(row.after.board.w['standard.q'], 1);
  assert.ok(row.flags.includes('upgraded-pawn-promoted-during-prefix'));
  assert.ok(!row.flags.includes('upgraded-piece-captured-during-prefix'));
});

test('en-passant captures are found on the victim square instead of the empty landing', async () => {
  const input = await context({ armyA: { upgrades: { c2: pawnId } } });
  const startFen = fen({ a1: 'K', h8: 'k', c5: input.letter(pawnId).toUpperCase(), d5: 'p' }, { ep: 'd6' });
  const row = await replayPrefix({ rules: input.rules, profile: input.profile, startFen, openingMoves: ['c5d6'] });
  assert.equal(row.events.captures.length, 1); assert.equal(row.events.captures[0].square, 'd5');
  assert.equal(row.after.totals.b.board, row.before.totals.b.board - 1);
  assert.equal(row.upgradedPieces[0].currentLocation.square, 'd6');
});

test('reserve deployment moves an existing upgraded token from pocket to board', async () => {
  const input = await context({ armyA: { reserve: [{ id: grantId, count: 1 }] } });
  const letter = input.letter(grantId).toUpperCase();
  const startFen = fen({ a1: 'K', h8: 'k' }, { pocket: letter });
  const row = await replayPrefix({ rules: input.rules, profile: input.profile, startFen, openingMoves: [`${letter}@d4`] });
  assert.equal(row.events.captures.length, 0); assert.equal(row.events.drops.length, 1);
  assert.equal(row.before.totals.w.upgradedPocket, 1); assert.equal(row.after.totals.w.upgradedPocket, 0);
  assert.equal(row.after.totals.w.upgradedBoard, 1); assert.equal(row.upgradedPieces[0].status, 'board');
  assert.deepEqual(row.upgradedPieces[0].initialLocation, { zone: 'pocket' });
  assert.deepEqual(row.upgradedPieces[0].currentLocation, { zone: 'board', square: 'd4' });
});

test('castling relocates an upgraded rook without losing or duplicating it', async () => {
  const input = await context({ armyA: { upgrades: { h1: rookId } } });
  const startFen = fen({ e1: 'K', e8: 'k', h1: input.letter(rookId).toUpperCase() }, { rights: 'K' });
  const row = await replayPrefix({ rules: input.rules, profile: input.profile, startFen, openingMoves: ['e1g1'] });
  assert.equal(row.events.captures.length, 0); assert.equal(row.events.relocations.length, 1);
  assert.equal(row.events.relocations[0].reason, 'castling');
  assert.deepEqual(row.upgradedPieces[0].currentLocation, { zone: 'board', square: 'f1' });
  assert.equal(row.upgradedPieces[0].retainsDesign, true);
});

test('illegal prefixes and foreign recorded context cannot enter the diagnostic', async () => {
  const input = await context({ armyA: { upgrades: { d1: queenId } } });
  for (const patch of [{ profileHash: '0'.repeat(64) }, { registryHash: '0'.repeat(64) }, { variant: 'foreign' },
    { engine: { ...input.manifest.config.engine, nodes: 999 } }, { evaluation: { pieceValues: {} } },
    { openingId: 'foreign' }, { openingMoves: [] }, { openingPlies: 2 }, { startFen: 'foreign' },
    { whiteStrength: { skill: 2 } }, { registryReference: 'foreign' }]) {
    const changed = structuredClone(source(input)); changed.records[0] = { ...changed.records[0], ...patch };
    await assert.rejects(auditGames([changed]));
  }
  const wrongProfile = structuredClone(source(input)); wrongProfile.manifest.designProfile.config += '\n';
  await assert.rejects(auditGames([wrongProfile]), /profile hash/);
  const wrongMeaning = structuredClone(source(input)), letter = input.letter(queenId);
  wrongMeaning.manifest.designProfile.definitionsByLetter[letter] = { ...wrongMeaning.manifest.designProfile.definitionsByLetter[letter], movement: 'Q' };
  await assert.rejects(auditGames([wrongMeaning]), /letter meanings/);
  await assert.rejects(replayPrefix({ rules: input.rules, profile: input.profile,
    startFen: input.records[0].startFen, openingMoves: ['e2e5'] }), /Illegal recorded opening move/);
});

test('duplicate copies and older attempts do not multiply positions or hide conflicts', async () => {
  const input = await context();
  const duplicate = source(input); duplicate.records = [...duplicate.records, structuredClone(duplicate.records[0])];
  const report = await auditGames([duplicate, structuredClone(duplicate)]);
  assert.equal(report.counts.eligibleGames, 2); assert.equal(report.counts.uniquePositions, 2);
  assert.equal(report.counts.duplicateCopiesIgnored, 4);
  const conflict = structuredClone(duplicate); conflict.records.at(-1).moves.push('conflict');
  await assert.rejects(auditGames([conflict]), /Conflicting copies/);
  const later = structuredClone(source(input)); later.records = later.records.map(row => ({ ...row, attempt: 2 }));
  const recovered = await auditGames([source(input), later]);
  assert.equal(recovered.counts.latestGames, 2);
  assert.ok(recovered.positions.every(row => row.recordReferences.every(ref => ref.attempt === 2)));
  const unfinished = structuredClone(source(input)); unfinished.records[0].status = 'aborted'; unfinished.records[0].moves = [];
  const skipped = await auditGames([unfinished]);
  assert.equal(skipped.counts.skippedUnfinished, 1); assert.equal(skipped.counts.eligibleGames, 1);
});

test('evaluations normalize Black scores and bounds without subtracting mates or bounded cp scores', () => {
  const white = '8/7k/8/8/8/8/8/K7 w - - 0 1', black = white.replace(' w ', ' b ');
  assert.deepEqual(normalizeEvaluation({ score: { type: 'cp', value: 80 } }, black).score, { type: 'cp', value: -80 });
  assert.deepEqual(normalizeEvaluation({ info: { score: { type: 'mate', value: -3, bound: 'lowerbound' }, pv: ['h8g7'] } }, black).score,
    { type: 'mate', value: 3, bound: 'upperbound' });
  assert.deepEqual(normalizeEvaluation({ score: { type: 'cp', value: 10, bound: 'upperbound' } }, white).score,
    { type: 'cp', value: 10, bound: 'upperbound' });
  assert.equal(normalizeEvaluation({ info: null }, white).available, false);
  assert.deepEqual(normalizeEvaluation({ info: { nodes: 123 }, scoreInfo: { score: { type: 'cp', value: 45 } } }, black).score,
    { type: 'cp', value: -45 });
  assert.throws(() => normalizeEvaluation({ score: { type: 'win-percent', value: 50 } }, white));
});

test('repeated positions share cached evaluations and tactical inspections while retaining journal coverage', async () => {
  const input = await context({ repetitions: 2, openings: [{ id: 'odd-prefix', moves: ['e2e4'] }] });
  let evaluations = 0, inspections = 0;
  const report = await auditGames([source(input)], { nodes: 123, evaluationIdentity: 'synthetic-engine',
    evaluate: async ({ fen, nodes }) => {
      evaluations++; assert.equal(nodes, 123);
      return { move: 'a2a3', info: { score: { type: 'cp', value: fen.split(' ')[1] === 'w' ? 20 : -50 }, pv: ['a2a3'], nodes } };
    },
    inspectPosition: async ({ fen }) => { inspections++; return { inCheck: false, fen, upgradedPieces: [] }; } });
  assert.equal(report.counts.eligibleGames, 4); assert.equal(report.counts.uniquePositions, 2);
  assert.equal(evaluations, 2); assert.equal(inspections, 2);
  assert.equal(report.counts.evaluationCacheHits, 2);
  for (const row of report.positions) {
    assert.equal(row.recordReferences.length, 2);
    assert.equal(row.evaluation.before.score.value, 20); assert.equal(row.evaluation.after.score.value, 50);
    assert.equal(row.evaluation.deltaCpWhite, 30); assert.equal(row.evaluation.deltaCpA, row.aColor === 'w' ? 30 : -30);
    assert.deepEqual(row.evaluation.after.pv, ['a2a3']);
    assert.equal(row.startInCheck, false); assert.equal(row.endInCheck, false);
  }
  const mates = await auditGames([source(input)], { evaluate: async ({ fen }) => ({ score: fen.split(' ')[1] === 'w'
    ? { type: 'cp', value: 20 } : { type: 'mate', value: -2 } }) });
  assert.ok(mates.positions.every(row => row.evaluation.deltaCp === null));
});

test('inspection flags expose pins and capture candidates without a forced-loss assertion', async () => {
  const input = await context({ armyA: { upgrades: { d1: queenId } } });
  const report = await auditGames([source(input)], { inspectPosition: async () => ({ inCheck: false,
    upgradedPieces: [{ royalShieldPin: { status: 'pinned', exposesCheck: true }, captureThreats: [{ unrecapturedCandidate: true, actualTurn: false }] }] }) });
  assert.ok(report.positions.every(row => row.flags.includes('upgrade-pin-after-prefix') && row.flags.includes('unrecaptured-capture-candidate-after-prefix')));
  assert.ok(report.notes.some(note => note.includes('not proofs')));
});

test('inventory counts pockets separately from board material and uses semantic archived IDs', async () => {
  const input = await context({ armyA: { reserve: [{ id: grantId, count: 2 }] } });
  const letter = input.letter(grantId).toUpperCase();
  const result = inventory(fen({ a1: 'K', h8: 'k', d4: letter }, { pocket: letter + letter.toLowerCase() }), input.profile);
  assert.equal(result.board.w[grantId], 1); assert.equal(result.pocket.w[grantId], 1); assert.equal(result.pocket.b[grantId], 1);
  assert.equal(result.totals.w.upgradedBoard, 1); assert.equal(result.totals.w.upgradedPocket, 1);
});
