'use strict';

// Offline reference-only pooling; each original source keeps its own profile.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { extractReferenceMaterial } = require('../../../scripts/balance/reference-material-dataset');
const { analyzeDecisionMaterial } = require('../../../scripts/balance/decision-material-fit');
const { asSimpleReplayManifest } = require('../../../scripts/balance/bishop-source');
const { getOfficialReferences } = require('../../../scripts/balance/official-references');
const ROOT = path.resolve(__dirname, '../../..');
const ENGINE = '848ad74c3fbc2684e57b42c581ee94e93e5ed832fb536846a37f9dddebbb8b16';
const PINNED = {
  'reference-panel-001.collection.json': '534dd8c8688899b555757978fcf8a36fabd700416e6dd78b18e6e858d6871417',
  'reference-panel-001.games.jsonl': '3aaa7ea9dd70cb555e368849897d6c1dc67d6240b0091c5da5092fcb9b64ba49',
  'simple-reference-001.replay-source.json': 'c7313eb0330d637ea5105d2e44ad8dc93e11e26895ee59e828946dfcec0edd82',
  'simple-reference-001.games.jsonl': '8de913ef53c3023f525c80da572e6ad153d83d2651a96d3ccbbad10f5eea2b84',
  'simple-reference-preflight-001.json': 'd4c87f8f7e56326e74d85b12663d9f692cd1bfecda90213e98b66aedcaf7444e',
  'bishop-decision-complete-001.collection.json.gz': '286d129accc554ede1071c0deba6a096736f917f4f317697bf0f8284e60f5879',
  'bishop-decision-complete-001.games.jsonl.gz': '32354a18094cb4480b8f2714458190432bd3bb2d43f863f48b0d6b59a0ca4e74',
};
const SOURCES = ['experiments/balance/results/reference-material-001.audit.cjs',
  'scripts/balance/reference-material-dataset.js', 'scripts/balance/decision-material-fit.js',
  'scripts/balance/material-dataset.js', 'scripts/balance/reference-regression.js',
  'scripts/balance/bishop-analysis.js', 'scripts/balance/official-references.js',
  'experiments/designs/official-references-v16.json', 'src/design-catalog.js',
  'scripts/balance/design-registry.js', 'scripts/balance/design-profile.js', 'dist/balance-rules.cjs'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const number = value => Number.isFinite(value) ? value.toFixed(2) : 'unavailable';
const range = value => value && Number.isFinite(value.lower) ? `${number(value.lower)}–${number(value.upper)}` : 'unavailable';
function loadInputs() {
  return Object.fromEntries(Object.entries(PINNED).map(([name, hash]) => {
    const bytes = fs.readFileSync(path.join(__dirname, name));
    assert.equal(sha(bytes), hash, `Reference input changed: ${name}.`);
    return [name, name.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes];
  }));
}
function sourceDeclarations(input) {
  const parent = JSON.parse(input['reference-panel-001.collection.json']);
  const simple = asSimpleReplayManifest(JSON.parse(input['simple-reference-001.replay-source.json']));
  const simplePreflight = JSON.parse(input['simple-reference-preflight-001.json']);
  const decision = JSON.parse(input['bishop-decision-complete-001.collection.json.gz']);
  const journal = bytes => bytes.toString('utf8').trim().split('\n').map(JSON.parse);
  const sources = [
    { id: 'original-reference', profile: parent.plan.profile, identity: parent.identity,
      records: journal(input['reference-panel-001.games.jsonl']), metadata: { manifestRunId: parent.runId, originalManifestSupplied: true } },
    { id: 'simple-reference', profile: simple.plan.profile, identity: simple.identity,
      records: journal(input['simple-reference-001.games.jsonl']), metadata: { manifestRunId: simple.runId, originalManifestSupplied: false } },
    { id: 'bishop-decision', profile: decision.plan.profile, identity: decision.identity,
      records: journal(input['bishop-decision-complete-001.games.jsonl.gz']), metadata: { manifestRunId: decision.runId, originalManifestSupplied: true } },
  ];
  const openings = plan => plan.openings.map(({ id, fen, members }) => ({ id, fen, members }));
  assert.deepEqual(openings(parent.plan), openings(simple.plan));
  assert.deepEqual(openings(parent.plan), openings(decision.plan));
  const inventories = [parent.native.pieceValues, simplePreflight.native.pieceValues, decision.native.pieceValues];
  const fields = ['rawMg', 'captureMg', 'evalMg', 'rawEg', 'captureEg', 'evalEg'];
  const compatibility = [];
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index], inventory = inventories[index];
    assert.equal(source.identity.engineSha256, ENGINE);
    assert.equal(inventory.version, 1);
    for (const type of 'pnbrqkPNBRQK') for (const field of fields) {
      assert.equal(inventory.pieces[type][field], inventories[0].pieces[type][field], `Ordinary ${type} ${field} differs.`);
    }
    const present = [];
    for (const reference of getOfficialReferences().roster) {
      const allocation = source.profile.registry.allocations.find(row => row.id === reference.id);
      if (!allocation) continue;
      for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) for (const field of fields) {
        assert.equal(inventory.pieces[letter][field], reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg']);
      }
      present.push(reference.id);
    }
    for (const record of source.records.filter(row => row.kind === 'head')) {
      assert.deepEqual(record.engine, { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 });
      assert.deepEqual(record.whiteStrength, { skill: 20 }); assert.deepEqual(record.blackStrength, { skill: 20 });
    }
    compatibility.push({ id: source.id, profileHash: source.profile.hash, referenceIdsPresent: present,
      engineSha256: ENGINE, ordinaryAndReferenceValueTablesMatch: true,
      inventoryProvenance: index === 1 ? 'Archived compatibility preflight; original simple collection manifest/native inventory remain unavailable.' : 'Recorded original collection native diagnostics.' });
  }
  return { sources, compatibility };
}
function matchups(dataset) {
  const rows = new Map();
  for (const game of dataset.games) {
    const key = `${game.designA}/${game.designB}`, row = rows.get(key) || { designA: game.designA, designB: game.designB, games: 0, wins: 0, draws: 0, losses: 0 };
    const white = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 }[game.result], score = game.aColor === 'w' ? white : 1 - white;
    row.games++; if (score === 1) row.wins++; else if (score === 0) row.losses++; else row.draws++;
    rows.set(key, row);
  }
  assert.equal(rows.size, 6);
  return [...rows.values()].map(row => ({ ...row, score: (row.wins + row.draws / 2) / row.games }));
}
function markdown(report) {
  const { result, coverage, selection } = report;
  const lines = ['# All-reference head-to-head material estimates', '',
    'This separate fit uses all 1,534 complete scored color-paired games between the four exact frozen references. It excludes other experimental opponents. Pawn = 1 and queen = 9 are assumptions. Earlier reports, reference designs, native values and purchase costs are unchanged.', '',
    '| Reference | Added value | Added conditional 95% range | Whole piece | Whole conditional 95% range |',
    '| --- | ---: | --- | ---: | --- |'];
  for (const row of result.wholePieces) lines.push(`| ${row.name} | ${number(row.bonus)} | ${range(result.estimates.bonuses[row.id]?.interval)} | ${number(row.value)} | ${range(row.interval)} |`);
  lines.push('', 'Ordinary values in this same fit:', '', '| Piece | Estimate | Conditional 95% range |', '| --- | ---: | --- |');
  for (const [name, row] of Object.entries(result.estimates.ordinary)) lines.push(`| ${name} | ${number(row.value)} | ${row.assumed ? 'fixed assumption' : range(row.interval)} |`);
  lines.push('', 'Whole-piece values add family plus bonus before rounding. Their ranges use the sum within each same normalized bootstrap refit.', '',
    '| Reference matchup (first piece perspective) | Games | W / D / L | Points score |', '| --- | ---: | --- | ---: |');
  const names = Object.fromEntries(getOfficialReferences().roster.map(row => [row.id, row.name]));
  for (const row of report.matchups) lines.push(`| ${names[row.designA]} / ${names[row.designB]} | ${row.games} | ${row.wins} / ${row.draws} / ${row.losses} | ${(row.score * 100).toFixed(2)}% |`);
  lines.push('', `Selection scans ${selection.inputRecords} records in three authoritative journals: ${selection.referenceRecords} concern the exact references; ${selection.excludedOtherRecords} other-opponent records are excluded. One Unicorn/Amazon game hit the 400-ply cap; its completed opposite-color partner is excluded from this paired analysis. Both original records remain preserved. No completed game is silently scored as a draw.`, '',
    `Selected sources contribute 254 original Unicorn/Amazon games, 512 simple-study Vanguard games, and 768 final-decision Cruisader games. All ${coverage.replayedPlies} plies replay under their original profiles, then material features align by immutable design ID. Duplicated inherited copies add no weight.`, '',
    `Sampling retains ${coverage.accepted} stable positions from ${coverage.sampledGames} games (${coverage.phases.middlegame} middlegame / ${coverage.phases.endgame} endgame). ${coverage.gamesWithoutSamples} games have no eligible positions; ${coverage.sampledPartialPairs} pairs contribute samples from only one game. All ${coverage.completePairs} raw pairs remain complete. Each sampled game has unit total weight; min-ply 16, stride 5, two unchanged-material plies before/after.`, '',
    `All sources share 128 selected opening groups, engine/search settings and the recorded relevant material tables. Each source retains its profile, identity and policy. The simple study has a reconstructed replay descriptor rather than its original collection manifest; its value evidence is a compatibility preflight. Bounded compatibility supports this conditional pooled estimate without establishing universal process equivalence.`, '',
    `Anchored rank ${result.analysis.rank.rank}/${result.analysis.rank.columns}; converged ${result.analysis.fit.converged}; ${result.analysis.bootstrap.validRatios}/${result.analysis.bootstrap.requested} valid bootstrap fits. All five held-out folds supported: ${result.analysis.validation.available}. Held-out Brier ${result.analysis.validation.metrics?.brier?.toFixed(5) ?? 'unavailable'}, constant baseline ${result.analysis.validation.baselineMetrics?.brier?.toFixed(5) ?? 'unavailable'}.`, '',
    'Intervals use 200 whole-opening resamples, seed 42. Every context and matchup belonging to an opening shares its resample multiplicity and validation fold. There are 128 opening groups, not 1,534 independent observations; broader ancestry is unknown.', '',
    'The [earlier 1,280-game fit](bishop-decision-material-001.report.md) included the unselected long-hop bishop and had different opponent coverage. It remains unchanged: Vanguard 8.01, Unicorn 6.21, Cruisader 6.81, Amazon 12.58. Coefficients can change with the cohort. Material-only values do not capture every tactical matchup; the near-even observed scores and frozen designs are unchanged.', '',
    'No new match games, engine searches, evaluator tuning or ordinary-control collection were performed. Reproduce from the existing archives:', '', '```powershell',
    'node experiments/balance/results/reference-material-001.audit.cjs', '```', '');
  return lines.join('\n');
}
async function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments to verify or --write to regenerate.');
  const input = loadInputs(), { sources, compatibility } = sourceDeclarations(input);
  const { dataset, selection } = await extractReferenceMaterial({ sources, onProgress: console.log });
  assert.equal(selection.selectedGames, 1534); assert.equal(dataset.coverage.replayedPlies, 176824);
  const result = await analyzeDecisionMaterial(dataset, { bootstrap: 200, seed: 42, validationFolds: 5,
    onProgress: event => console.log(`${event.phase}: ${event.completed}/${event.total}`) });
  Object.assign(result.method, { cohort: 'all-frozen-reference-head-to-head', historicalPooling: true, sourceContexts: sources.map(source => source.id) });
  result.warnings.push('The pooled result retains three original rule/engine-source contexts; matching policies and bounded compatibility checks support conditional reuse, not universal equivalence.');
  const report = { schemaVersion: 1, format: 'levelup-all-reference-material-audit', recordedDate: '2026-10-27',
    inputs: Object.fromEntries(Object.entries(input).map(([name, bytes]) => [name, { archivedSha256: PINNED[name], decodedSha256: sha(bytes), decodedBytes: bytes.length }])),
    analysisSources: Object.fromEntries(SOURCES.map(file => [file, sha(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n'))])),
    sourceHashFormat: 'SHA-256 of source text normalized to LF', compatibility,
    selection, coverage: dataset.coverage, datasetSha256: sha(JSON.stringify(dataset)),
    datasetHashFormat: 'SHA-256 of JSON.stringify(replayed projected dataset)', sources: dataset.sources,
    matchups: matchups(dataset), engineSearches: 0, newMatchGames: 0, result };
  for (const [name, content] of [['reference-material-001.audit.json', json(report)], ['reference-material-001.report.md', markdown(report)]]) {
    const file = path.join(__dirname, name);
    if (args.includes('--write')) fs.writeFileSync(file, content);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content, `Reference material artifact differs: ${name}.`);
  }
  console.log('All-reference material audit passed; earlier reports and source games are unchanged.');
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { main, sourceDeclarations, markdown };
