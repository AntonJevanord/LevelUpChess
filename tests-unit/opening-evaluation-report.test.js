'use strict';

// Synthetic search observations and outcomes only. No engine process starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeOpeningEvaluation, unavailableOpeningEvaluation } = require('../scripts/balance/opening-evaluation');
const { buildOpeningEvaluationReport, renderOpeningEvaluationReport } = require('../scripts/balance/opening-evaluation-report');
const ENGINE = 'a'.repeat(64), PROFILE = 'c'.repeat(64);
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function record(id, aColor, whiteCp, options = {}) {
  const color = options.color || 'w', strength = options.strength || { skill: 20 };
  const limits = options.limits || { nodes: 40000 }, openingMoves = color === 'w' ? [] : ['e2e4'];
  const row = { id, attempt: options.attempt || 1, aColor, comparisonId: options.comparisonId || 'a-v-b', comparisonLabel: 'A versus B',
    openingId: options.openingId || 'opening-1', pairId: options.pairId || 'pair-1', repetition: 1,
    status: options.status || 'completed', result: '1-0', engine: { ...limits, threads: 1, hashMb: 32, maxPlies: 400 },
    whiteStrength: strength, blackStrength: strength, openingMoves, openingPlies: openingMoves.length,
    variant: 'diagnostic-fixture', profileHash: options.profileHash || PROFILE, registryHash: 'd'.repeat(64) };
  const context = { fen: color === 'w' ? START : AFTER_E4, openingPlies: openingMoves.length, attempt: row.attempt,
    color, engineSha256: options.engineSha256 || ENGINE, engineName: 'Fixture engine', strength, limits };
  row.openingEvaluation = makeOpeningEvaluation(context, { info: { score: { type: 'cp', value: whiteCp * (color === 'b' ? -1 : 1) }, depth: 12, nodes: 39900, pv: ['e2e4'] } });
  return row;
}

test('White-POV scores stay independent of A color and the evaluator side', () => {
  const first = record('a', 'w', 400, { status: 'aborted' });
  const second = record('b', 'b', -200, { status: 'truncated' });
  const report = buildOpeningEvaluationReport([first, second]), context = report.contexts[0];
  assert.equal(report.counts.pairedExactCp, 1);
  assert.equal(context.exactCp.white.mean, 100);
  assert.equal(context.exactCp.a.mean, 300);
  assert.equal(context.pairedWhiteCp.median, 100);
  assert.deepEqual(context.aColors.map(row => row.exactACp.mean), [400, 200]);
  const black = buildOpeningEvaluationReport([record('c', 'w', -75, { color: 'b' }), record('d', 'b', 25, { color: 'b' })]);
  assert.equal(black.contexts[0].evaluatingColor, 'b');
  assert.equal(black.contexts[0].exactCp.a.mean, -50);
  assert.equal(black.contexts[0].pairedWhiteCp.median, -25);
  assert.match(renderOpeningEvaluationReport(black), /Black.*skill/);
  assert.match(renderOpeningEvaluationReport(report), /Positive scores favor White/);
  assert.deepEqual([first.status, second.status], ['aborted', 'truncated']);
});

test('bounds, mate scores, unavailable captures and missing history stay outside cp averages', () => {
  const rows = Array.from({ length: 7 }, (_, index) => record(`g${index}`, 'w', 10, { pairId: `p${index}` }));
  rows[1].openingEvaluation.score.bound = 'lowerbound';
  rows[2].openingEvaluation.score = { type: 'mate', value: -3, bound: 'upperbound' };
  rows[3].openingEvaluation = unavailableOpeningEvaluation({ ...rows[3].openingEvaluation, attempt: 1 }, 'engine-reported-no-score');
  delete rows[4].openingEvaluation; delete rows[4].openingMoves;
  delete rows[5].openingEvaluation;
  rows[6].openingEvaluation.perspective = 'black';
  const summary = buildOpeningEvaluationReport(rows);
  for (const [name, value] of Object.entries({ exactCp: 1, boundedCp: 1, mate: 1, unavailable: 1, missing: 2, invalid: 1 })) assert.equal(summary.counts[name], value, name);
  assert.equal(summary.contexts[0].exactCp.white.mean, 10);
  assert.deepEqual(summary.contexts[0].mateScores, [{ score: { type: 'mate', value: -3, bound: 'upperbound' }, games: 1 }]);
  assert.equal(summary.counts.pairedExactCp, 0);
  assert.equal(summary.issues.length, 1);
  assert.equal(summary.unavailableReasons['engine-reported-no-score'], 1);
  assert.match(renderOpeningEvaluationReport(summary), /2 legacy\/missing observations/);
});

test('latest attempts count once, retained capture attempts survive retry, and copies cannot hide conflicts', () => {
  const first = record('a', 'w', 100, { status: 'error' }), retried = structuredClone(first);
  retried.attempt = 2; retried.status = 'completed';
  const opponent = record('b', 'b', 0);
  const report = buildOpeningEvaluationReport([first, retried, opponent, structuredClone(retried)]);
  assert.equal(report.counts.inputAttempts, 4);
  assert.equal(report.counts.uniqueAttempts, 3);
  assert.equal(report.counts.latestGames, 2);
  assert.equal(report.counts.duplicateCopiesIgnored, 1);
  assert.equal(report.openings[0].pairedWhiteCp.median, 50);
  const corrupt = structuredClone(retried); corrupt.openingEvaluation.score.value = 101;
  assert.throws(() => buildOpeningEvaluationReport([retried, corrupt]), /Conflicting duplicate/);
  const badPair = record('another-id', 'w', 100);
  assert.throws(() => buildOpeningEvaluationReport([first, badPair]), /repeats a physical color/);
});

test('search limits, engines, profiles and evaluator strengths split contexts and incompatible pairs', () => {
  const rows = [];
  for (const [id, options] of [['base', {}], ['deep', { limits: { nodes: 80000 } }], ['engine', { engineSha256: 'b'.repeat(64) }], ['profile', { profileHash: 'e'.repeat(64) }]]) {
    rows.push(record(`${id}-w`, 'w', 20, { ...options, pairId: id }), record(`${id}-b`, 'b', 40, { ...options, pairId: id }));
  }
  rows.push(record('mixed-w', 'w', 10, { pairId: 'mixed' }), record('mixed-b', 'b', 30, { pairId: 'mixed', strength: { skill: 10 } }));
  const report = buildOpeningEvaluationReport(rows);
  assert.equal(report.contexts.length, 5);
  assert.equal(report.counts.pairedExactCp, 4);
  assert.equal(report.counts.incompatibleContextPairs, 1);
  assert.equal(report.counts.unpairedExactCpGames, 2);
  assert.equal(report.openings.every(row => row.contextId), true);
  const bad = structuredClone(rows[0]); bad.openingEvaluation.limits.nodes = 123;
  assert.equal(buildOpeningEvaluationReport([bad]).counts.invalid, 1);
  assert.equal(buildOpeningEvaluationReport([rows[0]], { engineSha256: 'f'.repeat(64) }).counts.invalid, 1);
});

test('missing historical observations are reported without requiring modern FEN or opening fields', () => {
  const old = { id: 'old', pairId: 'old-pair', comparisonId: 'old-match', openingId: 'start', aColor: 'w', attempt: 1, status: 'completed' };
  const summary = buildOpeningEvaluationReport([old]);
  assert.equal(summary.counts.missing, 1); assert.equal(summary.counts.recorded, 0);
  assert.equal(summary.contexts.length, 0); assert.equal(summary.openings[0].counts.missing, 1);
  assert.match(renderOpeningEvaluationReport(summary), /no extra searches/);
  assert.equal(renderOpeningEvaluationReport(undefined), '');
  const empty = buildOpeningEvaluationReport([]);
  assert.equal(empty.counts.latestGames, 0);
});

async function fixture(plan, tools) {
  const declaration = plan.getBatchDeclaration('level1', 0), schedule = tools.makeSchedule(declaration.config);
  const registry = tools.createDesignRegistry(declaration.config), profile = tools.compileDesignProfile(registry, declaration.config.evaluation);
  const records = schedule.map(game => ({ ...game, attempt: 1, status: 'completed', result: '1/2-1/2', reason: 'threefold-repetition',
    profileHash: profile.hash, registryHash: registry.hash, variant: profile.variant, registryReference: 'run.json#designRegistry',
    engine: declaration.config.engine, evaluation: declaration.config.evaluation, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 } }));
  const source = { batchIndex: 0, nodes: 40000, records, manifest: { runId: 'synthetic-report', config: declaration.config,
    schedule, designRegistry: registry, designProfile: profile } };
  return { source, profile };
}

test('panel integration adds diagnostic coverage while preserving every outcome aggregate', async () => {
  const plan = require('../scripts/balance/v19-panel-plan');
  const tools = { ...require('../scripts/balance/plan'), ...require('../scripts/balance/design-registry'), ...require('../scripts/balance/design-profile') };
  const { source, profile } = await fixture(plan, tools), manifest = { study: 'level1', targetOpenings: 8 };
  const before = plan.reportStudy(manifest, [source]);
  assert.equal(before.openingEvaluations.counts.missing, source.records.length);
  const rules = await require('../dist/balance-rules.cjs').createMatchRules({ profile });
  const pairId = source.records[0].pairId;
  for (const row of source.records.filter(row => row.pairId === pairId)) {
    const white = row.aColor === 'w' ? row.comparison.armyA : row.comparison.armyB;
    const black = row.aColor === 'w' ? row.comparison.armyB : row.comparison.armyA;
    const board = rules.createBoard(rules.startingFen(white, black));
    try {
      for (const move of row.openingMoves) assert.ok(board.push(move));
      row.openingEvaluation = makeOpeningEvaluation({ fen: board.fen(), openingPlies: row.openingMoves.length, attempt: 1,
        color: board.turn(), engineSha256: ENGINE, strength: { skill: 20 }, limits: { nodes: 40000 } }, { info: { score: { type: 'cp', value: 30 }, depth: 8 } });
    } finally { board.dispose(); }
  }
  const after = plan.reportStudy(manifest, [source]);
  assert.equal(after.openingEvaluations.counts.pairedExactCp, 1);
  for (const field of ['rows', 'cohorts', 'comparisons', 'progress']) assert.deepEqual(after[field], before[field], field);
  assert.match(plan.renderReport(after), /## Opening evaluations/);
});

test('trial integration retains missing-data coverage in offline JSON and Markdown', async () => {
  const { ensureResearchOverlay } = require('../scripts/balance/research-overlay');
  const { OVERLAY } = require('../scripts/v19-trials');
  const overlay = ensureResearchOverlay(OVERLAY), file = name => path.join(overlay.directory, 'scripts/balance', name);
  const plan = require(file('v19-trial-plan'));
  const tools = { ...require(file('plan')), ...require(file('design-registry')), ...require(file('design-profile')) };
  const { source } = await fixture(plan, tools);
  const report = plan.reportStudy({ study: 'level1', targetOpenings: 8 }, [source]);
  assert.equal(report.openingEvaluations.counts.missing, 192);
  assert.equal(report.progress.completePairs, 96);
  assert.match(plan.renderReport(report), /192 legacy\/missing observations/);
});
