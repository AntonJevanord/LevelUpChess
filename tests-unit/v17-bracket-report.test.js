'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createV17Report, renderV17Report, renderV17Csv } = require('../scripts/balance/v17-report');

function fixture({ variants = ['reduced', 'current', 'expanded'], budget = 2 } = {}) {
  const openings = Array.from({ length: 16 }, (_, index) => ({ id: `case-${index + 1}`, moves: [] }));
  const opponents = ['two-step', 'king-step', 'grant'];
  const comparisons = variants.flatMap(version => opponents.map(opponent => ({ id: `${version}-v-${opponent}`,
    armyA: { upgrades: { c2: `pawn.fixture-${version}@1` } }, armyB: { upgrades: { c2: `pawn.fixture-${opponent}@1` } },
    strengthA: { skill: 20 }, strengthB: { skill: 20 } })));
  const ids = [...variants, ...opponents].map(key => `pawn.fixture-${key}@1`);
  const values = ids.map((id, index) => ({ id, automatic: { mg: 110 + index, eg: 210 + index }, applied: { mg: 400, eg: 500 }, valueGroup: 'fixture' }));
  const config = { name: 'Bracket fixture', repetitions: 1, openings, comparisons,
    evaluation: { pieceValues: Object.fromEntries(values.map(value => [value.id, value.applied])) } };
  const metadata = { kind: 'fixture', symmetric: false,
    rows: variants.map(key => ({ key, label: `Pawn ${key}` })), columns: opponents.map(key => ({ key, label: key })),
    comparisons: variants.flatMap(version => opponents.map(opponent => ({ id: `${version}-v-${opponent}`,
      aKey: version, aLabel: `Pawn ${version}`, bKey: opponent, bLabel: opponent }))),
    brackets: [{ key: 'pawn', label: 'Pawn', family: 'pawn', level: 2,
      variants: variants.map(key => ({ key, label: key, id: `pawn.fixture-${key}@1`, movement: 'fmWfceF', rowKey: key })) }],
    rowBudgets: Object.fromEntries(variants.map(key => [key, budget])),
    openingCohorts: [{ id: 'first-eight', openingIds: openings.slice(0, 8).map(opening => opening.id) },
      { id: 'second-eight', openingIds: openings.slice(8).map(opening => opening.id) }],
    evaluationAudit: { provenance: { file: 'fixture-values.json', sha256: 'fixture-hash', engineSha256: 'fixture-engine', policy: 'Same applied values.' }, values } };
  const pair = (version, opponent, number, value = 0.5) => ['w', 'b'].map(aColor => ({
    id: `${version}-${opponent}-${number}-${aColor}`, pairId: `${version}-${opponent}-${number}`,
    comparisonId: `${version}-v-${opponent}`, openingId: `case-${number}`, repetition: 1, aColor, attempt: 1,
    status: 'completed', result: value === 0.5 ? '1/2-1/2' : (value === 1) === (aColor === 'w') ? '1-0' : '0-1',
  }));
  const complete = (scorer = () => 0.5, cases = Array.from({ length: 16 }, (_, index) => index + 1)) => variants.flatMap(version => opponents.flatMap(opponent => cases.flatMap(number => pair(version, opponent, number, scorer(version, opponent, number)))));
  const create = (records, changes = {}) => createV17Report({ experiment: 'fixture', config, metadata, records, ...changes });
  return { variants, opponents, config, metadata, pair, complete, create };
}

test('empty bracket reports retain pending cohorts without manufacturing balanced scores', () => {
  const f = fixture(), report = f.create([]), study = report.bracketStudy;
  assert.equal(study.format, 'levelup-v17-bracket-screen');
  assert.deepEqual(study.cohorts.map(cohort => [cohort.openingIds.length, cohort.complete]), [[8, false], [8, false], [16, false]]);
  assert.ok(study.cohorts.every(cohort => cohort.rows.every(row => row.score === null && row.games === 0)));
  assert.match(renderV17Report(report), /pending \(0\/8\)/);
  assert.doesNotMatch(renderV17Report(report), /50\.00%|95%|accepted/);
});

test('fixed halves expose scores, WDL and physical colors with common-case weighting', () => {
  const f = fixture(), report = f.create(f.complete((version, opponent, number) => number <= 8 ? 1 : 0));
  const study = report.bracketStudy, row = study.cohorts[2].rows[0];
  assert.ok(study.cohorts.every(cohort => cohort.complete));
  assert.deepEqual(study.cohorts.map(cohort => cohort.rows[0].score), [1, 0, 0.5]);
  assert.deepEqual([row.games, row.wins, row.draws, row.losses], [96, 48, 0, 48]);
  assert.deepEqual(row.physicalColors.map(color => [color.games, color.score]), [[48, 0.5], [48, 0.5]]);
  assert.equal(study.brackets[0].variants[0].reviewPriority, 'mixed or within-band evidence');
  assert.match(renderV17Report(report), /100\.00% \(8\/8\).*0\.00% \(8\/8\).*50\.00% \(16\/16\)/);
});

test('a fast opponent in the second half cannot move a shared-case or first-half score', () => {
  const f = fixture(), records = f.complete(() => 0.5, [1, 2, 3, 4, 5, 6, 7, 8]);
  const before = f.create(records).bracketStudy;
  const after = f.create([...records, ...f.pair('current', 'two-step', 9, 1)]).bracketStudy;
  assert.deepEqual(after.cohorts[0], before.cohorts[0]);
  assert.deepEqual(after.cohorts[1].rows, before.cohorts[1].rows);
  assert.equal(after.cohorts[0].complete, true);
  assert.equal(after.cohorts[1].complete, false);
  assert.equal(after.cohorts[2].rows[1].score, 0.5);
  assert.equal(after.cohorts[2].rows[1].openingCoverage.shared, 8);
});

test('unpaired and truncated partners remove that case across opponents, never turn into a draw', () => {
  const f = fixture(), records = f.complete(() => 1);
  const target = records.find(record => record.id === 'current-grant-8-b');
  Object.assign(target, { status: 'truncated', result: '*' });
  const study = f.create(records).bracketStudy, row = study.cohorts[2].rows.find(item => item.key === 'current');
  assert.equal(row.openingCoverage.shared, 15);
  assert.deepEqual([row.games, row.wins, row.draws, row.losses], [90, 90, 0, 0]);
  assert.equal(study.cohorts[0].complete, false);
  assert.deepEqual(row.flags, ['partial screen']);
  assert.deepEqual(f.create([...records, ...structuredClone(records)]).bracketStudy, study);
});

test('matchup flags and persistent review priorities are descriptive, not acceptance claims', () => {
  const f = fixture();
  const report = f.create(f.complete((version, opponent) => version === 'reduced' ? 0 : version === 'expanded' ? 1 : opponent === 'two-step' ? 1 : opponent === 'grant' ? 0 : 0.5));
  const variants = report.bracketStudy.brackets[0].variants;
  assert.equal(variants[0].reviewPriority, 'buff review priority');
  assert.equal(variants[2].reviewPriority, 'nerf review priority');
  assert.deepEqual(variants[1].cohorts[2].flags, ['matchup concern']);
  assert.match(renderV17Report(report), /Descriptive triage only/);
  assert.doesNotMatch(renderV17Report(report), /95%|confidence interval of|accepted as balanced/);
});

test('shared designs may appear in two brackets without adding games or value rows', () => {
  const f = fixture();
  f.metadata.brackets.push({ ...structuredClone(f.metadata.brackets[0]), key: 'second-bracket', label: 'Second interpretation' });
  const report = f.create(f.complete());
  assert.equal(report.bracketStudy.brackets.length, 2);
  assert.equal(report.bracketStudy.evaluationAudit.values.length, 6);
  assert.equal(report.progress.pairedGames, 288);
  assert.equal(report.bracketStudy.cohorts[2].rows.length, 3);
});

test('a bracket cannot relabel another army or silently change its applied valuation', () => {
  const f = fixture();
  f.metadata.brackets[0].variants[0].rowKey = 'expanded';
  assert.throws(() => f.create([]), /does not belong/);
  const g = fixture();
  g.config.evaluation.pieceValues['pawn.fixture-reduced@1'] = { mg: 1, eg: 2 };
  assert.throws(() => g.create([]), /differs from the applied/);
  const h = fixture();
  h.metadata.evaluationAudit.values[0].applied = { mg: 401, eg: 500 };
  h.config.evaluation.pieceValues['pawn.fixture-reduced@1'] = { mg: 401, eg: 500 };
  assert.throws(() => h.create([]), /same applied MG\/EG/);
});

test('overlapping, incomplete, foreign cohorts and missing budgets fail visibly', () => {
  for (const mutate of [
    f => { f.metadata.openingCohorts[1].openingIds[0] = 'case-1'; },
    f => { f.metadata.openingCohorts[1].openingIds.pop(); },
    f => { f.metadata.openingCohorts[1].openingIds[0] = 'foreign'; },
    f => { delete f.metadata.rowBudgets.current; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => f.create([]), /cohort|budget/);
  }
});

test('separate purchase budgets stay attached to their rows without a pooled grand mean', () => {
  const f = fixture({ budget: 1 }), report = f.create(f.complete());
  assert.ok(report.bracketStudy.cohorts.every(cohort => cohort.rows.every(row => row.upgradePoints === 1)));
  assert.equal(report.bracketStudy.overall, undefined);
  assert.match(renderV17Report(report), /not pooled into a global score/);
});

test('legacy report JSON, Markdown and CSV remain byte identical without bracket metadata', () => {
  const config = { name: 'Legacy outcome', repetitions: 1, openings: [{ id: 'start', moves: [] }],
    comparisons: [{ id: 'a-v-b', armyA: { upgrades: {} }, armyB: { upgrades: {} } }] };
  const metadata = { rows: [{ key: 'a', label: 'A' }], columns: [{ key: 'b', label: 'B' }],
    comparisons: [{ id: 'a-v-b', aKey: 'a', aLabel: 'A', bKey: 'b', bLabel: 'B' }] };
  const report = createV17Report({ experiment: 'legacy', config, metadata, records: [] });
  assert.equal(Object.hasOwn(report, 'bracketStudy'), false);
  const hashes = [JSON.stringify(report), renderV17Report(report), renderV17Csv(report)].map(text => createHash('sha256').update(text).digest('hex'));
  assert.deepEqual(hashes, ['1f517603856c96fa3bcf6b73f4e4e83d75a61787aaea7ab03f447a1dae7ff01c',
    'd7bd3f373f588c8c32c2b66e8cfef4eee7a34090793cdd074e63643bdfbf0e50',
    '3c971eaf1c34337874e635fbbb39389867cf674b48d7b0cb242b183f3aedc73f']);
});

test('all five real declarations integrate bracket metadata, calibration receipts and purchase budgets', () => {
  const { FILES, loadBracket } = require('../scripts/balance/v17-bracket-plan');
  for (const experiment of Object.keys(FILES)) {
    const declaration = loadBracket(experiment), report = createV17Report({ ...declaration, records: [] });
    const study = report.bracketStudy;
    assert.ok(study);
    assert.deepEqual(study.cohorts.map(cohort => cohort.openingIds.length), [8, 8, 16]);
    assert.equal(study.evaluationAudit.provenance.sha256, declaration.metadata.evaluationAudit.sha256);
    assert.ok(study.evaluationAudit.values.length <= 20);
    assert.equal(study.evaluationAudit.values.length, Object.keys(declaration.config.evaluation.pieceValues).length);
    for (const value of study.evaluationAudit.values) assert.equal(Object.keys(value.automaticTables).length, 6);
    if (experiment === 'acceptance-majors') assert.deepEqual([...new Set(study.cohorts[2].rows.map(row => row.upgradePoints))].sort(), [1, 2]);
    else assert.equal(new Set(study.cohorts[2].rows.map(row => row.upgradePoints)).size, 1);
    assert.doesNotThrow(() => renderV17Report(report));
  }
});
