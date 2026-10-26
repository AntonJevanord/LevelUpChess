'use strict';

// Reproduce arithmetic/provenance checks without engines or fitting material.
// The new comparison journal was not supplied; this is not a move-replay audit.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = __dirname;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(root, name));
const reportName = 'bishop-decision-final-001.uploaded-report.md';
const report = read(reportName);
assert.equal(hash(report), 'f9ce85502d5521a06ecabfc980ecdb5962439cc699f6fa3e6c3dfc8d4127e03a');
const journalName = 'bishop-reference-001.games.jsonl';
const historicalJournal = read(journalName);
assert.equal(hash(historicalJournal), 'a54f1b4bf55e7ad5259aa465285605d23f8a999a4f3f045a18d3cc6a58b910da');
const ids = {
  'Short side bishop (BsWsN)': 'bishop.purple@7',
  'Long quiet hop bishop (BsRgmsR0)': 'bishop.purple@12',
  'Blocked wide-knight bishop (BsR2nsN)': 'bishop.purple@13',
  RfB: 'rook.purple@10', NC: 'knight.purple@3', Amazon: 'queen.purple@1',
};
const decisionMatchups = report.toString('utf8').split('\n')
  .filter(line => /^\| (Short side|Long quiet hop|Blocked wide-knight) bishop /.test(line))
  .map(line => {
    const fields = line.split('|').slice(1, -1).map(value => value.trim());
    const [games, scheduled] = fields[2].split('/').map(Number);
    const [wins, draws, losses] = fields[3].split(' / ').map(Number);
    const score = (wins + draws / 2) / games;
    const [lower, upper] = fields[5].split('–').map(value => Number.parseFloat(value) / 100);
    assert.equal(games, 256); assert.equal(scheduled, 256);
    assert.equal(wins + draws + losses, games);
    assert.equal((score * 100).toFixed(2) + '%', fields[4]);
    assert.equal(fields[6], '0'); assert.equal(fields[7], '0');
    assert.ok(Number.isFinite(lower) && lower <= score && upper >= score);
    assert.ok(ids[fields[0]] && ids[fields[1]]);
    return { designA: ids[fields[0]], designB: ids[fields[1]], games,
      wins, draws, losses, score, reportedConditional95: { lower, upper },
      evidence: 'uploaded decision report; new compare journal not supplied' };
  });
assert.equal(decisionMatchups.length, 9);
assert.equal(new Set(decisionMatchups.map(row => row.designA + '/' + row.designB)).size, 9);
assert.equal(decisionMatchups.reduce((sum, row) => sum + row.games, 0), 2304);
assert.match(report.toString(), /Status: complete\. Complete matchups: 9\/9; scored color pairs: 1152\/1152; missing pairs: 0\./);
assert.match(report.toString(), /\| restore \| 0\/0 \| 0 \| 0 \| 0 \| 0 \| 0 \|/);
assert.match(report.toString(), /\| compare \| 1280\/1280 \| 1280 \| 0 \| 0 \| 0 \| 0 \|/);

function scoredJournalMatchup(name, designA, designB) {
  const all = read(name).toString('utf8').trim().split('\n').map(JSON.parse);
  const latest = new Map();
  for (const row of all) if (row.designA === designA && row.designB === designB) {
    const previous = latest.get(row.id);
    if (!previous || row.attempt > previous.attempt) latest.set(row.id, row);
  }
  const groups = new Map();
  for (const row of latest.values()) {
    const key = row.pairId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let wins = 0, draws = 0, losses = 0, games = 0, incompletePairGames = 0;
  for (const rows of groups.values()) {
    const completed = rows.filter(row => row.status === 'completed' && ['1-0', '0-1', '1/2-1/2'].includes(row.result));
    if (completed.length !== 2 || new Set(completed.map(row => row.aColor)).size !== 2) {
      incompletePairGames += completed.length; continue;
    }
    for (const row of completed) {
      const white = { '1-0': 1, '0-1': 0, '1/2-1/2': 0.5 }[row.result];
      const aScore = row.aColor === 'w' ? white : 1 - white;
      if (aScore === 1) wins++; else if (aScore === 0) losses++; else draws++;
      games++;
    }
  }
  return { designA, designB, games, wins, draws, losses,
    score: (wins + draws / 2) / games, incompletePairGames,
    journal: name, journalSha256: hash(read(name)) };
}
const verifiedHistorical = [
  scoredJournalMatchup('bishop-reference-001.games.jsonl', 'bishop.purple@7', 'rook.purple@10'),
  scoredJournalMatchup('bishop-reference-001.games.jsonl', 'bishop.purple@12', 'rook.purple@10'),
];
for (const raw of verifiedHistorical) {
  const reported = decisionMatchups.find(row => row.designA === raw.designA && row.designB === raw.designB);
  for (const key of ['games', 'wins', 'draws', 'losses', 'score']) assert.equal(raw[key], reported[key]);
}
const matrix = JSON.parse(read('reference-matrix-002.json'));
const referencePairs = [
  ['rook.purple@10', 'knight.purple@3', 'simple-reference-001.games.jsonl'],
  ['rook.purple@10', 'queen.purple@1', 'simple-reference-001.games.jsonl'],
  ['knight.purple@3', 'queen.purple@1', 'reference-panel-001.games.jsonl'],
].map(([a, b, name]) => {
  const raw = scoredJournalMatchup(name, a, b);
  const archived = matrix.reportedMatchups.find(row => row.designA === a && row.designB === b);
  for (const key of ['games', 'wins', 'draws', 'losses', 'score']) assert.equal(raw[key], archived[key]);
  return { ...raw, reportedConditional95: archived.observedInterval,
    intervalSource: 'reference-matrix-002.json / archived simple-reference report',
    evidence: 'archived journals; paired W/D/L independently recounted, no new move replay' };
});
const selected = decisionMatchups.filter(row => row.designA === 'bishop.purple@13');
assert.equal(selected.length, 3);
const output = {
  schemaVersion: 1,
  format: 'levelup-bishop-decision-final-upload-audit',
  recordedDate: '2026-10-26',
  decision: 'Freeze bishop.purple@13 with rook.purple@10, knight.purple@3 and queen.purple@1 as the official version-16 reference roster. Close the bishop campaign at its declared cap.',
  inputs: {
    uploadedReport: { file: reportName, sha256: hash(report), bytes: report.length },
    uploadedJournal: { filename: 'bishop.games.jsonl', archivedFile: journalName,
      sha256: hash(historicalJournal), bytes: historicalJournal.length,
      byteIdenticalToExistingArchive: true, duplicateArchived: false,
      scope: 'Earlier five-bishop versus RfB collection; not the new decision compare journal.' },
  },
  checks: {
    nineMatchupCountsAndReportedScoresArithmeticallyConsistent: true,
    finalReportStatesNoMissingOrUnpairedOutcomes: true,
    finalReportStates1280CompletedNewGamesWithoutErrorsOrTruncation: true,
    twoInheritedRfBMatchupsAgreeWithArchivedRawOutcomes: true,
    threeExistingReferencePairsAgreeWithArchivedRawOutcomes: true,
    newDecisionGameMovesReplayed: false,
    newDecisionManifestAndProfileHashesVerifiedFromUpload: false,
    newDecisionBootstrapIntervalsIndependentlyRecomputed: false,
  },
  reportedCollection: { newCompletedGames: 1280, restorationGames: 0,
    relevantInheritedGames: 1024, pairedComparisonGames: 2304, completePairs: 1152,
    completeMatchups: 9, errors: 0, truncated: 0, unpairedCompletedGames: 0 },
  uncertainty: { kind: 'conditional whole-opening percentile bootstrap',
    resamples: 200, seed: 42, selectedOpeningGroups: 128,
    interpretation: 'Reported ranges condition on the selected opening groups and recorded playing/source policies. They do not establish a universal 95% probability of balance or exact equality.' },
  selectedBishop: { id: 'bishop.purple@13', name: 'Cruisader', movement: 'BsR2nsN',
    scoreMinimum: Math.min(...selected.map(row => row.score)),
    scoreMaximum: Math.max(...selected.map(row => row.score)),
    reportedIntervalEnvelope: {
      lower: Math.min(...selected.map(row => row.reportedConditional95.lower)),
      upper: Math.max(...selected.map(row => row.reportedConditional95.upper)),
    },
  },
  decisionMatchups,
  verifiedInheritedMatchups: verifiedHistorical,
  officialReferencePairs: [...selected, ...referencePairs],
  limitations: [
    'The supplied decision-report.md supports the design decision, but the new 1280-game compare journal, campaign manifest and decision-report.json were not supplied.',
    'The supplied bishop.games.jsonl is identical to the previously audited historical five-bishop journal and adds no new decision-game histories.',
    'No new decision move replay, native-inventory verification or bootstrap refit was possible from these two uploads; do not describe those checks as completed.',
    'Archived reference-reference paired outcomes were recounted. Their conditional ranges are retained from the existing report, not recomputed or pooled across protocols.',
  ],
};
const json = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'bishop-decision-final-001.audit.json'), json);
else assert.equal(read('bishop-decision-final-001.audit.json').toString('utf8'), json);
console.log('Bishop decision upload audit passed: 9 arithmetic rows, 2 inherited bishop/RfB rows and 3 archived reference pairs; no new-game move replay claimed.');
