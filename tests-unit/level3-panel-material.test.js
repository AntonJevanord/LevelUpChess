'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { completedPairs, analyzeMaterial, renderMaterial } = require('../scripts/balance/level3-panel-material');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { decodeMaterial } = require('../scripts/balance/material-dataset');
const core = require('../scripts/balance/reference-regression');

const ROSTER = [{ id: 'knight.purple@3', family: 'knight', name: 'Unicorn', movement: 'NC' },
  { id: 'queen.purple@1', family: 'queen', name: 'Amazon', movement: 'QN' }];
const PROFILE = compileDesignProfile(createDesignRegistry({ schemaVersion: 2, comparisons: ROSTER.map(row => ({
  armyA: { upgrades: { [row.family === 'knight' ? 'b1' : 'd1']: row.id } }, armyB: { upgrades: {} } })) }));
const COMPARISONS = [
  { id: 'unicorn-baseline', kind: 'baseline', designA: ROSTER[0].id, designB: null },
  { id: 'amazon-baseline', kind: 'baseline', designA: ROSTER[1].id, designB: null },
  { id: 'unicorn-amazon', kind: 'head', designA: ROSTER[0].id, designB: ROSTER[1].id },
];

function fenOf(pieces, ply) {
  let square = 0;
  const board = Array(64).fill(null);
  // Fixtures exercise the replay/fit protocol without engine searches. The
  // supplied board implementation below deliberately makes no legality claim.
  for (const piece of ['K', 'k', ...pieces]) board[square++] = piece;
  const placement = Array.from({ length: 8 }, (_, rank) => {
    let text = '', empty = 0;
    for (const piece of board.slice(rank * 8, rank * 8 + 8)) {
      if (piece) { if (empty) text += empty; empty = 0; text += piece; } else empty++;
    }
    return text + (empty || '');
  }).join('/');
  return `${placement} ${ply % 2 ? 'b' : 'w'} - - ${ply} ${1 + Math.floor(ply / 2)}`;
}
function fixture({ key = 'batch-1', nodes = 20000, groups = 16, repetitions = 3 } = {}) {
  const random = core.randomSource(1729), records = [], boards = new Map();
  const letter = id => PROFILE.registry.allocations.find(row => row.id === id).letter;
  for (let group = 0; group < groups; group++) for (const comparison of COMPARISONS) for (let repetition = 0; repetition < repetitions; repetition++) for (const aColor of ['w', 'b']) {
    const pieces = [];
    for (const type of 'pnbrq') for (const color of ['w', 'b']) {
      const count = Math.floor(random() * 3);
      for (let index = 0; index < count; index++) pieces.push(color === 'w' ? type.toUpperCase() : type);
    }
    for (const [id, color] of [[comparison.designA, aColor], [comparison.designB, aColor === 'w' ? 'b' : 'w']]) {
      if (id && random() > 0.25) pieces.push(color === 'w' ? letter(id).toUpperCase() : letter(id));
    }
    const id = `${group}-${comparison.id}-${repetition}-${aColor}`, pairId = `${group}-${comparison.id}-${repetition}`;
    const startFen = fenOf(pieces, 0), x = decodeMaterial(startFen, PROFILE).x;
    const coefficients = [0.13, 0.37, 0.40, 0.65, 1.17, 0.01, 0.4, 0.5];
    const eta = x.reduce((sum, value, column) => sum + value * coefficients[column], 0);
    const y = random() < 0.12 ? 0.5 : Number(random() < 1 / (1 + Math.exp(-eta)));
    const result = y === 0.5 ? '1/2-1/2' : y ? '1-0' : '0-1';
    const moves = Array.from({ length: 28 }, (_, ply) => `${id}-move-${ply}`);
    const record = { id, pairId, comparisonId: comparison.id, openingId: `opening-${group}`, aColor,
      attempt: 1, status: 'completed', result, reason: 'threefold-repetition',
      startFen, finalFen: fenOf(pieces, 28), moves, sans: moves.map((_, ply) => `SAN${ply}`),
      openingMoves: [], openingPlies: 0, totalPlies: 28, playedPlies: 28,
      profileHash: PROFILE.hash, registryHash: PROFILE.registryHash, variant: PROFILE.variant,
      royalMode: 'king', evaluationCaveat: null, ...(PROFILE.evaluation ? { evaluation: PROFILE.evaluation } : {}),
      engine: { nodes, threads: 1, hashMb: 32, maxPlies: 400 }, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } };
    records.push(record);
    // Random fixtures can share a start; all matching boards have the same FEN
    // stream but each SAN sequence must match its own record. Use the first
    // UCI token to select its record before applying that move.
    const rows = boards.get(startFen) || []; rows.push({ record, pieces }); boards.set(startFen, rows);
  }
  const rulesFactory = async () => ({ createBoard(startFen) {
    const candidates = boards.get(startFen); assert.ok(candidates?.length);
    let ply = 0, selected;
    return { fen: () => fenOf((selected || candidates[0]).pieces, ply),
      outcome: () => ply === 28 ? { result: selected.record.result, reason: selected.record.reason } : null,
      san: move => { selected ||= candidates.find(row => row.record.moves[ply] === move); assert.ok(selected); assert.equal(move, selected.record.moves[ply]); return selected.record.sans[ply]; },
      push: move => { assert.equal(move, selected.record.moves[ply]); ply++; return true; }, dispose() {} };
  } });
  return { stage: { key, nodes, profile: PROFILE, records, comparisons: COMPARISONS,
    manifest: { engineSha256: 'frozen-engine', runnerSha256: 'frozen-runner', rulesBundleSha256: 'frozen-rules' } }, rulesFactory };
}

test('material replay reports both baseline and head evidence, ordinary values and joint whole totals', async () => {
  const data = fixture();
  const report = await analyzeMaterial({ stages: [data.stage], roster: ROSTER, bootstrap: 20, rulesFactory: data.rulesFactory });
  assert.equal(report.nodes.length, 1);
  const entry = report.nodes[0];
  assert.equal(entry.coverage.pairedGames, 288); assert.equal(entry.coverage.positions, 864);
  assert.equal(entry.analysis.primary.combined.rank.fullRank, true);
  assert.equal(entry.analysis.primary.combined.normalized.available, true);
  assert.equal(entry.analysis.diagnostic.combined.fit.converged, true);
  assert.equal(entry.estimates.combined.ordinary.pawn.value, 1);
  assert.equal(entry.estimates.combined.ordinary.queen.value, 9);
  for (const piece of entry.estimates.combined.pieces) {
    assert.equal(piece.available, true); assert.equal(piece.total, piece.ordinary + piece.bonus);
    assert.equal(piece.validJointReplicates, 20);
    assert.ok(Number.isFinite(piece.totalInterval.lower)); assert.ok(Number.isFinite(piece.totalInterval.upper));
  }
  assert.equal(entry.analysis.predictions.matchups.length, 1);
  const markdown = renderMaterial(report);
  assert.match(markdown, /Combined bonus \| Whole piece/); assert.match(markdown, /knight/); assert.match(markdown, /fixed assumption/);
});

test('joint whole ranges equal direct same-refit totals rather than summed marginal endpoints', async () => {
  const data = fixture();
  const report = await analyzeMaterial({ stages: [data.stage], roster: ROSTER, bootstrap: 20, seed: 91, rulesFactory: data.rulesFactory });
  const entry = report.nodes[0], piece = entry.estimates.combined.pieces[0];
  const families = entry.analysis.primary.combined.bootstrap.ratioIntervals;
  assert.notDeepEqual(piece.totalInterval, { lower: families[piece.family].lower + piece.bonusInterval.lower,
    upper: families[piece.family].upper + piece.bonusInterval.upper });
  assert.equal(piece.validJointReplicates, entry.analysis.primary.combined.bootstrap.validRatios);
});

test('node budgets stay separate and equal-budget batches retain shared opening grouping', async () => {
  const first = fixture({ groups: 8, repetitions: 1 }), second = fixture({ key: 'batch-2', nodes: 40000, groups: 8, repetitions: 1 });
  const report = await analyzeMaterial({ stages: [first.stage, second.stage], roster: ROSTER, bootstrap: 0,
    rulesFactory: ({ stage }) => (stage.nodes === 20000 ? first : second).rulesFactory() });
  assert.deepEqual(report.nodes.map(row => row.nodes), [20000, 40000]);
  assert.deepEqual(report.nodes.map(row => row.coverage.pairedGames), [48, 48]);
  assert.equal(report.method.nodePoliciesPooled, false);
  assert.ok(report.nodes.every(row => row.status === 'unsupported-estimates'));
  assert.ok(report.nodes.every(row => row.estimates.combined.pieces.every(piece => piece.total === null)));
});

test('copied histories in another batch retain provenance without gaining fitting weight', async () => {
  const first = fixture({ groups: 8, repetitions: 1 }), copy = fixture({ key: 'copied-batch', groups: 8, repetitions: 1 });
  const report = await analyzeMaterial({ stages: [first.stage, copy.stage], roster: ROSTER, bootstrap: 0,
    rulesFactory: ({ stage }) => (stage.key === 'copied-batch' ? copy : first).rulesFactory() });
  assert.equal(report.nodes.length, 1); assert.equal(report.nodes[0].provenance.length, 2);
  assert.equal(report.nodes[0].coverage.pairedGames, 48);
  assert.equal(report.nodes[0].coverage.duplicateHistoryPairs, 24);
  assert.equal(report.nodes[0].coverage.openingGroups, 8);
});

test('highest attempts survive copied order, duplicate durable records add no weight and unscored pairs are excluded', () => {
  const data = fixture({ groups: 1, repetitions: 1 }), original = data.stage.records[0];
  const interrupted = { ...original, attempt: 1, status: 'aborted', result: '*', moves: original.moves.slice(0, 2) };
  const finished = { ...original, attempt: 2 };
  data.stage.records[0] = finished;
  data.stage.records.push(interrupted, { ...finished });
  const selected = completedPairs(data.stage);
  assert.equal(selected.records.length, 6); assert.equal(selected.excluded.duplicateAttempts, 1);
  assert.equal(selected.records.find(row => row.id === original.id).attempt, 2);
  Object.assign(data.stage.records[1], { status: 'truncated', result: '*', reason: 'max-plies' });
  const partial = completedPairs(data.stage);
  assert.equal(partial.records.length, 4); assert.equal(partial.excluded.truncatedGames, 1); assert.equal(partial.excluded.unpairedGames, 1);
});

test('conflicting copied attempts, changing retry prefixes and metadata corruption fail visibly', () => {
  for (const mutate of [
    stage => stage.records.push({ ...stage.records[0], result: stage.records[0].result === '1-0' ? '0-1' : '1-0' }),
    stage => stage.records.push({ ...stage.records[0], attempt: 2 }),
    stage => { stage.records[0] = { ...stage.records[0], kind: 'head', designA: 'unknown' }; },
    stage => { stage.records[0] = { ...stage.records[0], whiteDesign: 'unknown' }; },
    stage => { stage.records[1] = { ...stage.records[1], aColor: 'w' }; },
  ]) {
    const data = fixture({ groups: 1, repetitions: 1 }); mutate(data.stage);
    assert.throws(() => completedPairs(data.stage));
  }
});

test('different profile, engine or search policies cannot be pooled under an equal-budget label', async () => {
  const first = fixture({ groups: 1, repetitions: 1 }), second = fixture({ key: 'second', groups: 1, repetitions: 1 });
  second.stage.manifest.engineSha256 = 'different-engine';
  await assert.rejects(analyzeMaterial({ stages: [first.stage, second.stage], roster: ROSTER, bootstrap: 0,
    rulesFactory: ({ stage }) => (stage.key === 'second' ? second : first).rulesFactory() }), /Cannot pool/);
  second.stage.manifest.engineSha256 = 'frozen-engine'; second.stage.records[0].engine.nodes = 40000;
  await assert.rejects(analyzeMaterial({ stages: [second.stage], roster: ROSTER, bootstrap: 0, rulesFactory: second.rulesFactory }), /node budget/);
});

test('empty material stages remain explicit and pre-cancellation never mutates evidence', async () => {
  const data = fixture({ groups: 1, repetitions: 1 }), before = structuredClone(data.stage);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(analyzeMaterial({ stages: [data.stage], roster: ROSTER, signal: controller.signal, rulesFactory: data.rulesFactory }), error => error.name === 'AbortError');
  assert.deepEqual(data.stage, before);
  data.stage.records = [];
  const report = await analyzeMaterial({ stages: [data.stage], roster: ROSTER, bootstrap: 0 });
  assert.equal(report.nodes[0].status, 'no-scored-pairs'); assert.equal(report.nodes[0].analysis, null);
  assert.match(renderMaterial(report), /No complete scored color pairs/);
});

test('replay yields between bounded whole-pair chunks and cancellation stops before the next chunk', async () => {
  const data = fixture(), before = structuredClone(data.stage), controller = new AbortController();
  let boardsCreated = 0, factoriesCreated = 0, cancellationQueued = false;
  const progress = [];
  await assert.rejects(analyzeMaterial({ stages: [data.stage], roster: ROSTER, bootstrap: 20,
    signal: controller.signal, onProgress: message => { if (typeof message === 'string') progress.push(message); },
    rulesFactory: async () => {
      factoriesCreated++;
      const rules = await data.rulesFactory();
      return { createBoard(fen) {
        boardsCreated++;
        if (!cancellationQueued) { cancellationQueued = true; setImmediate(() => controller.abort()); }
        return rules.createBoard(fen);
      } };
    } }), error => error.name === 'AbortError');
  assert.equal(factoriesCreated, 1);
  assert.equal(boardsCreated, 32);
  assert.ok(progress.some(message => /32\/288 scored games/.test(message)));
  assert.ok(!progress.some(message => /Fitting material/.test(message)));
  assert.deepEqual(data.stage, before);
});

test('successful chunked replay reuses one rules instance and preserves complete stage provenance', async () => {
  const data = fixture({ groups: 8, repetitions: 1 });
  let factoriesCreated = 0, boardsCreated = 0;
  const report = await analyzeMaterial({ stages: [data.stage], roster: ROSTER, bootstrap: 0,
    rulesFactory: async () => {
      factoriesCreated++;
      const rules = await data.rulesFactory();
      return { createBoard(fen) { boardsCreated++; return rules.createBoard(fen); } };
    } });
  assert.equal(factoriesCreated, 1); assert.equal(boardsCreated, 48);
  assert.equal(report.nodes[0].coverage.pairedGames, 48);
  assert.equal(report.nodes[0].coverage.positions, 144);
  assert.equal(report.nodes[0].coverage.openingGroups, 8);
  assert.equal(report.nodes[0].provenance[0].selectedGames, 48);
});
