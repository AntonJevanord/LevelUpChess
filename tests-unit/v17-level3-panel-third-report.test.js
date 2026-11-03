'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../scripts/balance/v17-level3-panel-third-report');
const text = api.loadSource(), parsed = api.parseReport(text);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('the exact uploaded report is pinned without inventing a readable raw journal', () => {
  const snapshot = api.buildSnapshot(parsed);
  assert.equal(snapshot.provenance.rawJournalAvailable, false);
  assert.match(snapshot.provenance.rawJournalFailure, /32 MiB/);
  assert.equal(snapshot.provenance.reportReproducedFromGames, false);
  assert.equal(snapshot.provenance.originalCampaignManifestSupplied, false);
  assert.equal(snapshot.provenance.originalStageManifestsSupplied, false);
  assert.equal(snapshot.provenance.nativePreflightSupplied, false);
  assert.equal(snapshot.provenance.legalMovesIndependentlyReplayed, false);
  assert.equal(snapshot.provenance.engineSha256, null);
  assert.equal(snapshot.continuity.snapshotsMustNotBeSummed, true);
  assert.equal(snapshot.continuity.previousGameIdentitiesVerified, false);
  assert.throws(() => api.loadSource({ read(file) { const bytes = Buffer.from(fs.readFileSync(file)); bytes[10] ^= 1; return bytes; } }), /checksum changed/);
  assert.throws(() => api.loadSource({ read: () => Buffer.alloc(1) }), /byte count changed/);
});

test('current progress keeps the 64-opening target separate from 40/40/32 declared cases', () => {
  assert.deepEqual(parsed.reportedProgress, { finalizedGames: 12320, scheduledGames: 21120, pairedGames: 12314 });
  assert.deepEqual(parsed.budgets.map(row => [row.nodes, row.declaredOpenings, row.targetOpenings, row.finalizedGames]), [
    [20000, 40, 64, 4400], [40000, 40, 64, 4400], [80000, 32, 64, 3520],
  ]);
  assert.equal(parsed.comparisons.length, 45);
  assert.throws(() => api.parseReport(text.replace('Finalized games: 12320/21120;', 'Finalized games: 12321/21120;')));
});

test('score-grid recovery is exact for complete color pairs and rejects incompatible percentages', () => {
  assert.deepEqual(api.dequantizeScore('33.59%', 32), { printed: '33.59%', score: 43 / 128, scoreUnits: 43, denominator: 128 });
  assert.deepEqual(api.dequantizeScore('54.03%', 31), { printed: '54.03%', score: 67 / 124, scoreUnits: 67, denominator: 124 });
  assert.equal(api.dequantizeScore('0.00%', 32).score, 0);
  assert.equal(api.dequantizeScore('100.00%', 32).score, 1);
  for (const [printed, count] of [['50.01%', 32], ['101.00%', 32], ['50%', 0], ['50%', 65], ['50%', 1.5], ['unknown', 32]]) assert.throws(() => api.dequantizeScore(printed, count));
});

test('Nightrider inversion and common-case basket means are derived only from all32 matched cases', () => {
  const night = api.deriveNightrider(parsed.comparisons);
  const low = night.perBudget[0], mid = night.perBudget[1], high = night.perBudget[2];
  assert.deepEqual(low.overallNine.exactFraction, { numerator: 119, denominator: 288 });
  assert.deepEqual(mid.overallNine.exactFraction, { numerator: 55, denominator: 128 });
  assert.deepEqual(high.overallNine.exactFraction, { numerator: 43, denominator: 96 });
  assert.equal(low.overallNine.games, 576); assert.equal(low.frozenFour.games, 256);
  close(low.frozenFour.score, 207 / 512); close(mid.frozenFour.score, 109 / 256); close(high.frozenFour.score, 209 / 512);
  assert.equal(low.opponents.find(row => row.opponent === 'Queen pawn').score, 59 / 128);
  assert.equal(high.opponents.find(row => row.opponent === 'Amazon').score, 33 / 128);
  close(night.delta20kTo80k, 5 / 144);
  assert.equal(night.deltaUncertaintyAvailable, false);
  close(night.opponentDeltas.find(row => row.opponent === 'Cruisader').difference, 18 / 128);
  close(night.opponentDeltas.find(row => row.opponent === 'Ranged rook').difference, 21 / 128);
  const missing = parsed.comparisons.filter(row => !(row.a === 'Nightrider' && row.b === 'X-ray queen'));
  assert.throws(() => api.deriveNightrider(missing), /every roster opponent/);
  const unequal = structuredClone(parsed.comparisons);
  unequal.find(row => row.b === 'Nightrider').openingCases = 31;
  assert.throws(() => api.deriveNightrider(unequal), /all 32 matched cases/);
});

test('reported 80k outcomes and color range stay distinct from newly derived aggregate scores', () => {
  const night = parsed.budgets.find(row => row.nodes === 80000).rows.find(row => row.name === 'Nightrider');
  assert.deepEqual([night.wins, night.draws, night.losses, night.games], [202, 112, 262, 576]);
  assert.equal(night.scorePrinted, '44.79%');
  assert.equal(night.conditionalRangePrinted, '41.41%–48.35%');
  assert.deepEqual(night.physicalColorScoresPrinted, { white: '56.08%', black: '33.51%' });
  assert.match(night.source, /not recomputed from games/);
  const current20k = parsed.budgets[0].rows.find(row => row.name === 'Nightrider');
  assert.equal(current20k.sharedOpenings, 40); assert.equal(current20k.scorePrinted, '40.90%');
  close(api.deriveNightrider(parsed.comparisons).perBudget[0].overallNine.score, 119 / 288);
});

test('three unscored pairs do not become an invented count of truncated attempts', () => {
  const snapshot = api.buildSnapshot(parsed);
  assert.equal(snapshot.unscored.finalizedRecordsExcludedFromPairs, 6);
  assert.equal(snapshot.unscored.colorPairsWithoutAScore, 3);
  assert.equal(snapshot.unscored.exactTruncationCountKnown, false);
  assert.deepEqual(parsed.comparisons.filter(row => row.openingCases === 31).map(row => [row.a, row.b]), [
    ['Vertical bishop', 'Unicorn'], ['Unicorn', 'Ranged rook'], ['Rook pawn', 'Ranged rook'],
  ]);
  assert.deepEqual(parsed.budgets.map(row => row.unscoredComparisons.length), [0, 2, 1]);
});

test('missing or repeated matchup rows and corrupt printed results are rejected structurally', () => {
  const [before, sensitivity] = text.split('## Search sensitivity on shared cases\n');
  const missing = sensitivity.split('\n').filter(line => !line.startsWith('| Nightrider / X-ray queen |')).join('\n');
  assert.throws(() => api.parseReport(before + '## Search sensitivity on shared cases\n' + missing), /Wrong row count/);
  assert.throws(() => api.parseReport(before + '## Search sensitivity on shared cases\n' + sensitivity.replace('| Queen pawn / Unicorn |', '| Queen pawn / Vertical bishop |')), /Duplicate/);
  assert.throws(() => api.parseReport(before + '## Search sensitivity on shared cases\n' + sensitivity.replace('| +6.25 |', '| +7.25 |')), /disagrees with matched scores/);
  assert.throws(() => api.parseReport(text.replace('202 / 112 / 262', '203 / 112 / 262')));
  assert.throws(() => api.parseReport(text.replace('## 80,000 nodes per move', '## 90,000 nodes per move')));
});

test('committed report-only artifacts verify offline and preserve the exact uploaded source', () => {
  const before = Buffer.from(text), result = api.main([]);
  assert.equal(api.loadSource(), before.toString('utf8'));
  assert.equal(result.reportedProgress.finalizedGames, 12320);
  assert.match(api.renderSnapshot(result), /not a journal audit/);
  assert.match(api.renderSnapshot(result), /Crusader \(\+14\.06pp\)/);
  assert.throws(() => api.main(['--engine', 'unexpected']), /Use no arguments/);
});
