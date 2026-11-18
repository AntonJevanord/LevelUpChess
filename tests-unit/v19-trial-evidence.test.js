'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evidence = require('../scripts/balance/v19-trial-evidence');
let input, audit;
test.before(async () => { input = await evidence.loadEvidence(); audit = await evidence.buildAudit(input); });
const study = name => input.studies.find(row => row.study === name);
const row = (name, key) => study(name).report.rows.find(item => item.key === key);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}.`);
function inputs(name) {
  return study(name).stages.map(stage => ({ batchIndex: stage.batchIndex, nodes: stage.nodes, records: structuredClone(stage.records) }));
}
function uploaded(name) { return evidence.readPinned(input.pins.studies[name].uploadedReport).toString('utf8'); }

test('all exact uploads reproduce thirty-two-case reports with explicitly derived contexts', () => {
  assert.deepEqual(evidence.STUDIES, ['level2', 'level3']);
  assert.equal(input.descriptors.baseTag, 'v0.19.1'); assert.equal(input.descriptors.stages.length, 8);
  assert.deepEqual(input.studies.map(s => s.uploadedNumericTablesReproducedExactly), [true, true]);
  assert.deepEqual(study('level2').stages.map(s => s.records.length), [96, 96, 96, 96]);
  assert.deepEqual(study('level3').stages.map(s => s.records.length), [320, 320, 320, 320]);
  assert.deepEqual(audit.counts, { attempts: 1664, finalizedGames: 1664, completedGames: 1663, truncatedGames: 1,
    errors: 0, retries: 0, completePairs: 831, pairedGames: 1662, engineSearches: 0, newMatchGames: 0 });
  assert.equal(evidence.PROVENANCE.originalStageManifestsSupplied, false);
  assert.equal(evidence.PROVENANCE.originalExecutableIndependentlyVerified, false);
  assert.equal(evidence.PROVENANCE.nativePreflightSupplied, false);
  assert.equal(evidence.PROVENANCE.fullGameMovesIndependentlyReplayed, false);
  assert.equal(evidence.PROVENANCE.recordedEngineSha256, evidence.ENGINE_SHA256);
});

test('level-two shared-case matching retains the truncation and its unscored partner', () => {
  const diagonal = row('level2', 'pawn-diagonal-vertical'), forward = row('level2', 'pawn-forward-queen');
  close(diagonal.score, 0.609375); close(forward.score, 0.6720430107526881);
  assert.deepEqual([diagonal.games, diagonal.wins, diagonal.draws, diagonal.losses], [192, 95, 44, 53]);
  assert.deepEqual([forward.games, forward.wins, forward.draws, forward.losses, forward.openingCoverage.shared], [186, 101, 48, 37, 31]);
  assert.deepEqual(forward.cells.map(cell => cell.games), [64, 62, 64]);
  close(forward.conditionalRange.lower, 0.6075268817204301); close(forward.conditionalRange.upper, 0.7338709677419355);
  const truncated = study('level2').stages.flatMap(stage => stage.records).filter(record => record.status === 'truncated');
  assert.equal(truncated.length, 1); assert.equal(truncated[0].openingId, 'v19-book-26'); assert.equal(truncated[0].aColor, 'w');
  assert.equal(truncated[0].totalPlies, 400); assert.equal(truncated[0].result, '*');
  assert.ok(!forward.openingCoverage.openingIds.includes('v19-book-26'));
});

test('the six-jump pawn preserves its strong Unicorn matchup without treating the average as universal parity', () => {
  const six = row('level3', 'pawn-six-knight');
  close(six.score, 0.513671875); assert.deepEqual([six.wins, six.draws, six.losses], [101, 61, 94]);
  assert.deepEqual(six.cells.map(cell => cell.score), [0.6484375, 0.4765625, 0.46875, 0.4609375]);
  assert.deepEqual(six.physicalColors.map(color => color.score), [0.58984375, 0.4375]);
  close(row('level3', 'pawn-full-knight').score, 0.58203125);
  close(row('level3', 'pawn-forward-knight').score, 0.435546875);
  close(row('level3', 'herald-control').score, 0.4921875);
  const text = evidence.renderAudit(audit); assert.ok(text.includes('three non-Unicorn references together score 46.88%'));
});

test('all stored opening positions and eight Wraith mate-in-one continuations replay under frozen rules', () => {
  assert.deepEqual(input.studies.map(s => s.replay.prefixesIndependentlyReplayed), [384, 1280]);
  assert.deepEqual(input.studies.map(s => s.replay.mateContinuationsIndependentlyReplayed), [0, 8]);
  const l2 = study('level2').report.openingEvaluations.counts, l3 = study('level3').report.openingEvaluations.counts;
  assert.deepEqual([l2.exactCp, l2.boundedCp, l2.mate, l2.invalid], [329, 55, 0, 0]);
  assert.deepEqual([l3.exactCp, l3.boundedCp, l3.mate, l3.invalid], [1025, 247, 8, 0]);
  const mates = study('level3').replay.mates;
  for (const id of evidence.EXCLUDED_OPENINGS) assert.equal(mates.filter(mate => mate.openingId === id).length, 4);
  assert.ok(mates.every(mate => mate.move === 'd1a4' && mate.recordedSan === 'Ia4#' && mate.totalPlies === 9
    && mate.aColor === 'w' && mate.result === '1-0' && mate.score.value === 1 && mate.terminalResultIndependentlyReplayed));
  assert.equal(mates[0].openingFen.split(' ')[1], 'w');
});

test('the two-opening sensitivity removes complete common cells while retaining the official result', () => {
  const wraith = row('level3', 'wraith-side-rays'), sensitivity = study('level3').sensitivity;
  close(wraith.score, 0.525390625); assert.deepEqual([wraith.wins, wraith.draws, wraith.losses], [97, 75, 84]);
  assert.deepEqual(sensitivity.excludedOpeningIds, ['v19-book-02', 'v19-book-26']);
  assert.equal(sensitivity.diagnosticOnly, true); assert.equal(sensitivity.bothColorsAndAllReferenceCells, true);
  const diagnostic = sensitivity.rows.find(item => item.key === 'wraith-side-rays');
  assert.deepEqual([diagnostic.games, diagnostic.wins, diagnostic.draws, diagnostic.losses, diagnostic.openingCoverage.shared], [240, 87, 72, 81, 30]);
  close(diagnostic.score, 0.5125);
  assert.ok(diagnostic.cells.every(cell => cell.games === 60));
  assert.ok(sensitivity.rows.every(item => item.openingCoverage.shared === 30));
  const text = evidence.renderAudit(audit); assert.ok(text.includes('declared **52.54% remains unchanged**'));
});

test('the empty queen owner receipt is retained without inventing games or a runtime snapshot', () => {
  assert.deepEqual(input.queenRuntime, { schemaVersion: 1, format: 'levelup-v19-panel-runtime-owner', study: 'level1',
    directory: null, jobs: 4, initialOpenings: 32 });
  assert.equal(evidence.PROVENANCE.queenRuntimeSnapshotPresentInReceipt, false);
  assert.equal(input.studies.some(item => item.study === 'level1'), false);
});

test('archive, duplicate, movement context and report tampering cannot silently change the evidence', async () => {
  const pin = input.pins.studies.level2.journals[0];
  const bytes = fs.readFileSync(path.join(evidence.ROOT, pin.archiveFile)); bytes[0] ^= 1;
  assert.throws(() => evidence.readPinned(pin, () => bytes), /Archive changed/);
  assert.throws(() => evidence.parseJournal(Buffer.from('{}')), /complete newline/);
  const duplicate = inputs('level2'); duplicate[0].records.push(structuredClone(duplicate[0].records[0]));
  await assert.rejects(evidence.analyzeStudy('level2', duplicate, input.descriptors, uploaded('level2')), /Duplicate uploaded/);
  const changed = inputs('level2'); changed[0].records[0].engine.nodes = 80000;
  await assert.rejects(evidence.analyzeStudy('level2', changed, input.descriptors, uploaded('level2')), /search budget changed/);
  await assert.rejects(evidence.analyzeStudy('level2', inputs('level2'), input.descriptors, uploaded('level2').replace('60.94%', '50.00%')), /numeric tables differ/);
});

test('derived review artifacts regenerate exactly without engines, arbitrary paths or extra arguments', async () => {
  assert.equal(fs.readFileSync(path.join(evidence.ROOT, `${evidence.PREFIX}.audit.json`), 'utf8'), JSON.stringify(audit) + '\n');
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../docs/v19-focused-trials-review.md'), 'utf8'), evidence.renderAudit(audit));
  await assert.rejects(evidence.main(['--engine', 'unwanted']), /Use no arguments/);
});
