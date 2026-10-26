'use strict';

// Reproduce this material fit offline from the exact uploaded comparison games.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { exportDataset } = require('../../../scripts/balance/material-dataset');
const { analyzeDecisionMaterial } = require('../../../scripts/balance/decision-material-fit');
const { validateDecisionPlan } = require('../../../scripts/balance/bishop-decision-plan');
const { createMatchRules } = require('../../../dist/balance-rules.cjs');
const PREFIX = 'bishop-decision-complete-001.';
const INPUTS = {
  'games.jsonl': 'e36ae6d3e25901bd283c087380cc0a0d5cfef81953b60bf85a1b1e7e6b6377c8',
  'collection.json': '76eeb80950661b45c0642c7a72837042f2264e0a50571a57a6a92db1a83f335f',
  'campaign.json': 'efb180d7addbbb55f2c2267bf7e8c7e639145862486f9ec936df40dac0b43257',
};
const SOURCES = [
  'experiments/balance/results/bishop-decision-material-001.audit.cjs',
  'scripts/balance/decision-material-fit.js', 'scripts/balance/material-dataset.js',
  'scripts/balance/reference-regression.js', 'scripts/balance/bishop-analysis.js',
  'scripts/balance/official-references.js', 'experiments/designs/official-references-v16.json',
  'src/design-catalog.js', 'scripts/balance/design-registry.js',
  'scripts/balance/design-profile.js', 'dist/balance-rules.cjs',
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const number = value => Number.isFinite(value) ? value.toFixed(2) : 'unavailable';
const range = value => value && Number.isFinite(value.lower) ? `${number(value.lower)}–${number(value.upper)}` : 'unavailable';

function inputs() {
  return Object.fromEntries(Object.entries(INPUTS).map(([name, expected]) => {
    const bytes = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, PREFIX + name + '.gz')));
    assert.equal(sha(bytes), expected, `Archived input changed: ${name}.`);
    return [name, bytes];
  }));
}

async function extract(bytes) {
  const run = JSON.parse(bytes['collection.json']), campaign = JSON.parse(bytes['campaign.json']);
  validateDecisionPlan(campaign.plan);
  assert.deepEqual(run.plan, campaign.plan.stages.find(stage => stage.key === 'compare').plan);
  assert.deepEqual(run.identity, campaign.identity);
  const text = bytes['games.jsonl'].toString('utf8');
  assert.ok(text.endsWith('\n'));
  const records = text.trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 1280);
  const lookup = new Map(records.map(row => [row.id, row]));
  assert.equal(lookup.size, records.length);
  let done = 0;
  const rulesFactory = async ({ profile }) => {
    const rules = await createMatchRules({ profile });
    return { createBoard(fen) {
      const board = rules.createBoard(fen);
      return new Proxy(board, { get(target, key) {
        if (key === 'dispose') return () => {
          target.dispose(); done++;
          if (done % 128 === 0) console.log(`Material replay ${done}/1280; no new games.`);
        };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    } };
  };
  const dataset = await exportDataset({ profile: run.plan.profile,
    sources: [{ id: 'decision-compare',
      identity: { ...run.identity, profileHash: run.plan.profile.hash, registryHash: run.plan.registry.hash },
      records, metadata: { manifestRunId: run.runId } }], rulesFactory });
  for (const game of dataset.games) {
    const row = lookup.get(game.recordId);
    Object.assign(game, { kind: row.kind, designA: row.designA, designB: row.designB,
      whiteDesign: row.whiteDesign, blackDesign: row.blackDesign });
  }
  dataset.input = { journalSha256: sha(bytes['games.jsonl']), manifestRunId: run.runId,
    cohort: 'new-only-1280-comparison-games' };
  return dataset;
}

function markdown(report) {
  const { result, coverage } = report;
  const lines = ['# Material estimates from the final bishop comparison', '',
    'Primary cohort: the 1,280 new comparison games only. No historical games are pooled into this fit. Pawn = 1 and queen = 9 are assumed anchors; native engine values and purchase costs are unchanged.', '',
    '| Reference | Ordinary counterpart | Added value | Added conditional 95% range | Whole piece | Whole conditional 95% range |',
    '| --- | ---: | ---: | --- | ---: | --- |'];
  for (const row of result.wholePieces) lines.push(`| ${row.name} | ${number(row.ordinary)} | ${number(row.bonus)} | ${range(result.estimates.bonuses[row.id]?.interval)} | ${number(row.value)} | ${range(row.interval)} |`);
  lines.push('', 'Whole-piece intervals add ordinary family and bonus within each same normalized bootstrap refit. They are not sums of separate interval endpoints.', '',
    '| Ordinary piece | Value | Conditional 95% range |', '| --- | ---: | --- |');
  for (const [name, row] of Object.entries(result.estimates.ordinary)) lines.push(`| ${name} | ${number(row.value)} | ${row.assumed ? 'fixed assumption' : range(row.interval)} |`);
  const alternative = result.estimates.bonuses['bishop.purple@12'];
  lines.push('', `The unselected long quiet-hop bishop remains in the model as a nuisance design: bonus ${number(alternative.value)}, range ${range(alternative.interval)}. Its games are not attributed to Cruisader.`, '',
    `All ${coverage.completedGames} games and ${coverage.replayedPlies} plies replay. Material sampling retains ${coverage.accepted} stable positions from ${coverage.sampledGames} games: ${coverage.phases.middlegame} middlegame and ${coverage.phases.endgame} endgame. ${coverage.gamesWithoutSamples} games have no eligible samples. All ${coverage.completePairs} raw color pairs are complete; ${coverage.sampledPartialPairs} pairs contribute sampled positions from only one game.`, '',
    'Sampling: ply 16 onward, stride 5, unchanged material for two plies before and after; each sampled game has total weight one. The model retains ordinary material and all five observed upgrade bonuses, omitting only eight unused profile bonus columns.', '',
    `Anchored design rank: ${result.analysis.rank.rank}/${result.analysis.rank.columns}; converged: ${result.analysis.fit.converged}. Bootstrap: ${result.analysis.bootstrap.validRatios}/${result.analysis.bootstrap.requested} valid normalized refits. Failures: ${result.analysis.bootstrap.rankDeficient} rank, ${result.analysis.bootstrap.nonconverged} convergence, ${result.analysis.bootstrap.pawnNonpositive} pawn scale, ${result.analysis.bootstrap.possibleSeparation} separation.`, '',
    `Five opening-group validation folds supported: ${result.analysis.validation.available}. Held-out Brier score ${result.analysis.validation.metrics?.brier?.toFixed(5) ?? 'unavailable'}; constant-score baseline ${result.analysis.validation.baselineMetrics?.brier?.toFixed(5) ?? 'unavailable'}.`, '',
    'Intervals use 200 whole-opening percentile resamples, seed 42, over all 128 selected opening groups. Related opening ancestry is unknown. These ranges condition on this selected head-to-head cohort and playing policy; they are not universal exchange prices. No ordinary/single-upgrade control games occur in this cohort.', '',
    'The earlier broader fit remains separate: Vanguard +3.34, Unicorn +3.48, Amazon +3.78. Different cohorts can change fitted values without changing any saved matchup score or reference design.', '',
    'The [complete upload audit](bishop-decision-complete-001.audit.json) verifies the manifests, rules, recorded engine/source identities and all nine original matchup scores/ranges. The [material audit JSON](bishop-decision-material-001.audit.json) retains exact input/source hashes, sample identity, model coefficients, diagnostics and intervals. Raw uploads are preserved compressed; large derived sample/EPD files are regenerated when needed.', '',
    'Reproduce offline without an engine or new matches:', '', '```powershell',
    'node experiments/balance/results/bishop-decision-material-001.audit.cjs', '```', '');
  return lines.join('\n');
}

async function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments to verify, or --write to regenerate the report.');
  const bytes = inputs(), dataset = await extract(bytes);
  const result = await analyzeDecisionMaterial(dataset, { bootstrap: 200, seed: 42, validationFolds: 5,
    onProgress: event => console.log(`${event.phase}: ${event.completed}/${event.total}`) });
  const report = { schemaVersion: 1, format: 'levelup-bishop-decision-material-audit', recordedDate: '2026-10-27',
    inputs: Object.fromEntries(Object.entries(bytes).map(([name, value]) => [name, { file: PREFIX + name + '.gz', decompressedBytes: value.length, decompressedSha256: sha(value) }])),
    analysisSources: Object.fromEntries(SOURCES.map(file => [file, sha(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n'))])),
    sourceHashFormat: 'SHA-256 of source text normalized to LF',
    datasetSha256: sha(JSON.stringify(dataset)), datasetHashFormat: 'SHA-256 of JSON.stringify(replayed material dataset)',
    sampling: dataset.sampling, coverage: dataset.coverage, recordedPolicy: dataset.recordedPolicy,
    profileHash: dataset.profile.hash, noHistoricalPooling: true, engineSearches: 0, newMatchGames: 0, result };
  for (const [name, content] of [['bishop-decision-material-001.audit.json', json(report)], ['bishop-decision-material-001.report.md', markdown(report)]]) {
    const file = path.join(__dirname, name);
    if (args.includes('--write')) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Material artifact differs: ${name}.`);
  }
  console.log('Decision material audit passed; archived games and reference definitions are unchanged.');
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { main, extract, markdown };
