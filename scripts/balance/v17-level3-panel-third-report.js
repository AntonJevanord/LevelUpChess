'use strict';

// Report-only evidence: the new raw journal exceeds the available 32 MiB
// attachment-transfer limit. Never describe this parser as a game audit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../../experiments/balance/results');
const PREFIX = 'v17-level3-panel-003';
const SOURCE = Object.freeze({ file: `${PREFIX}.uploaded-report.md`, originalName: 'panel-report.md',
  sha256: '12e49c2636e918b5b7681b5082b5ea6ff88dbb30c45aff1bd57d5e44b65b29d0', bytes: 23787 });
const BUDGETS = Object.freeze([20000, 40000, 80000]);
const ROSTER = Object.freeze(['Queen pawn', 'Vertical bishop', 'Unicorn', 'Vanguard', 'Amazon',
  'Rook pawn', 'Cruisader', 'Nightrider', 'Ranged rook', 'X-ray queen']);
const REFERENCES = Object.freeze(['Vanguard', 'Unicorn', 'Cruisader', 'Amazon']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const percent = value => `${(100 * value).toFixed(2)}%`;
const cells = line => line.slice(1, -1).split('|').map(value => value.trim());

function loadSource({ read = file => fs.readFileSync(file) } = {}) {
  const bytes = read(path.join(ROOT, SOURCE.file));
  assert.equal(bytes.length, SOURCE.bytes, 'Uploaded report byte count changed.');
  assert.equal(sha(bytes), SOURCE.sha256, 'Uploaded report checksum changed.');
  return bytes.toString('utf8');
}

function table(section, header, count) {
  const lines = section.split('\n'), start = lines.findIndex(line => line.startsWith(header));
  assert.ok(start >= 0, `Missing table: ${header}`);
  const rows = [];
  for (let index = start + 2; index < lines.length && lines[index].startsWith('| '); index++) rows.push(cells(lines[index]));
  assert.equal(rows.length, count, `Wrong row count in ${header}`);
  return rows;
}

function printedPercent(value) {
  assert.match(value, /^\d+(?:\.\d{1,2})?%$/, 'Expected a printed percentage.');
  const score = Number(value.slice(0, -1)) / 100;
  assert.ok(score >= 0 && score <= 1, 'Percentage is outside the score scale.');
  return score;
}

/** Complete two-color pairs and half-point draws give a score grid k/(4n).
 * At n<=64 its spacing is much larger than two-decimal percentage rounding. */
function dequantizeScore(printed, openingCases) {
  assert.ok(Number.isInteger(openingCases) && openingCases >= 1 && openingCases <= 64, 'Invalid matched opening count.');
  const approximate = printedPercent(printed), denominator = 4 * openingCases;
  const scoreUnits = Math.round(approximate * denominator), score = scoreUnits / denominator;
  assert.ok(Math.abs(100 * score - 100 * approximate) <= 0.005000001, 'Printed score does not fit complete-pair half-point scoring.');
  return { printed, score, scoreUnits, denominator };
}

function parsePairName(value) {
  const pair = value.split(' / ');
  assert.ok(pair.length === 2 && pair.every(name => ROSTER.includes(name)) && pair[0] !== pair[1], 'Unknown or invalid matchup.');
  assert.ok(ROSTER.indexOf(pair[0]) < ROSTER.indexOf(pair[1]), 'Matchup orientation changed.');
  return pair;
}

function wdl(value) {
  const match = /^(\d+) \/ (\d+) \/ (\d+)$/.exec(value);
  assert.ok(match, 'Invalid printed W/D/L.');
  const [wins, draws, losses] = match.slice(1).map(Number);
  return { wins, draws, losses, games: wins + draws + losses };
}

function parseNode(section, nodes) {
  const progress = /^Declared opening cases: (\d+); requested total: (\d+)\. Finalized games: (\d+)\/(\d+)\.$/m.exec(section);
  assert.ok(progress, 'Missing node progress.');
  const [declaredOpenings, targetOpenings, finalizedGames, scheduledGames] = progress.slice(1).map(Number);
  assert.ok([8, 16, 32, 64].includes(targetOpenings) && declaredOpenings <= targetOpenings && declaredOpenings % 8 === 0);
  assert.equal(scheduledGames, targetOpenings * 110);
  assert.ok(finalizedGames <= declaredOpenings * 110);
  const matrix = table(section, '| Row upgrade / opponent |', 10);
  const rows = table(section, '| Upgrade | Overall W / D / L |', 10).map((row, index) => {
    assert.equal(row.length, 8); assert.equal(row[0], ROSTER[index]);
    assert.equal(matrix[index][0], row[0]); assert.equal(matrix[index].length, 13);
    const coverage = /^(\d+(?:\.\d{1,2})?%) \((\d+)\/(\d+)\)$/.exec(matrix[index][11]);
    assert.ok(coverage, 'Missing overall opening coverage.');
    assert.equal(Number(coverage[3]), targetOpenings);
    const result = wdl(row[1]), score = printedPercent(row[2]);
    assert.equal(result.games, Number(coverage[2]) * 18);
    assert.ok(Math.abs(score - (result.wins + result.draws / 2) / result.games) <= 0.000050001);
    assert.equal(coverage[1], row[2]);
    const range = /^(\d+(?:\.\d{1,2})?%)–(\d+(?:\.\d{1,2})?%)$/.exec(row[3]);
    assert.ok(range, 'Missing reported conditional range.');
    const ordinary = wdl(row[6]);
    assert.ok(Math.abs(printedPercent(row[7]) - (ordinary.wins + ordinary.draws / 2) / ordinary.games) <= 0.000050001);
    return { name: row[0], source: 'reported aggregate in uploaded Markdown; not recomputed from games',
      sharedOpenings: Number(coverage[2]), targetOpenings, ...result, scorePrinted: row[2],
      conditionalRangePrinted: row[3], conditionalRange: { lower: printedPercent(range[1]), upper: printedPercent(range[2]) },
      physicalColorScoresPrinted: { white: row[4], black: row[5] }, ordinaryReported: { ...ordinary, scorePrinted: row[7] } };
  });
  const keys = new Set();
  const matchups = table(section, '| A versus B | Paired games |', 45).map(row => {
    assert.equal(row.length, 5);
    const [a, b] = parsePairName(row[0]), key = `${a}/${b}`;
    assert.ok(!keys.has(key), 'Duplicate node matchup.'); keys.add(key);
    const result = wdl(row[2]), pairedGames = Number(row[1]);
    assert.ok(Number.isInteger(pairedGames) && pairedGames % 2 === 0 && pairedGames <= declaredOpenings * 2);
    assert.equal(result.games, pairedGames);
    assert.ok(Math.abs(printedPercent(row[3]) - (result.wins + result.draws / 2) / pairedGames) <= 0.000050001);
    return { a, b, pairedGames, ...result, scorePrinted: row[3], conditionalRangePrinted: row[4] };
  });
  return { nodes, declaredOpenings, targetOpenings, finalizedGames, scheduledGames, rows,
    pairedGames: matchups.reduce((sum, row) => sum + row.pairedGames, 0) + rows.reduce((sum, row) => sum + row.ordinaryReported.games, 0),
    unscoredComparisons: matchups.filter(row => row.pairedGames < declaredOpenings * 2)
      .map(({ a, b, pairedGames }) => ({ a, b, pairedGames, expectedGames: declaredOpenings * 2 })), matchups };
}

function parseReport(text) {
  assert.ok(text.startsWith('# Level-three roster: matchups and search sensitivity\n'), 'Unexpected report title.');
  const progress = /^Finalized games: (\d+)\/(\d+); scored paired games: (\d+)\.$/m.exec(text);
  assert.ok(progress, 'Missing campaign progress.');
  const [finalizedGames, scheduledGames, pairedGames] = progress.slice(1).map(Number);
  const sections = [...text.matchAll(/^## ([\d,]+) nodes per move\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  assert.equal(sections.length, 3, 'Expected all three node-budget sections.');
  const budgets = sections.map((section, index) => {
    const nodes = Number(section[1].replaceAll(',', '')); assert.equal(nodes, BUDGETS[index]);
    return parseNode(section[2], nodes);
  });
  assert.equal(budgets.reduce((sum, node) => sum + node.finalizedGames, 0), finalizedGames);
  assert.equal(budgets.reduce((sum, node) => sum + node.scheduledGames, 0), scheduledGames);
  assert.equal(budgets.reduce((sum, node) => sum + node.pairedGames, 0), pairedGames);
  assert.equal(new Set(budgets.map(node => node.targetOpenings)).size, 1, 'Budgets disagree about requested target.');
  const sensitivity = text.split('## Search sensitivity on shared cases\n');
  assert.equal(sensitivity.length, 2, 'Missing or repeated search-sensitivity section.');
  const keys = new Set(), maximumCases = Math.min(...budgets.map(node => node.declaredOpenings));
  const comparisons = table(sensitivity[1], '| A versus B | Matched openings |', 45).map(row => {
    assert.equal(row.length, 7);
    const [a, b] = parsePairName(row[0]), key = `${a}/${b}`;
    assert.ok(!keys.has(key), 'Duplicate shared-case matchup.'); keys.add(key);
    const openingCases = Number(row[1]); assert.ok(openingCases <= maximumCases);
    const scores = BUDGETS.map((nodes, index) => ({ nodes, ...dequantizeScore(row[index + 2], openingCases) }));
    assert.match(row[5], /^[+-]\d+(?:\.\d{1,2})?$/, 'Invalid printed score difference.');
    assert.ok(Math.abs((scores[2].score - scores[0].score) * 100 - Number(row[5])) <= 0.005000001,
      'Printed search difference disagrees with matched scores.');
    return { a, b, openingCases, pairedGames: 2 * openingCases, scores,
      deltaPrinted: row[5], conditionalDeltaRangePrinted: row[6] };
  });
  return { reportedProgress: { finalizedGames, scheduledGames, pairedGames }, budgets, comparisons };
}

function fraction(numerator, denominator) {
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function deriveNightrider(comparisons) {
  const matches = comparisons.filter(row => row.a === 'Nightrider' || row.b === 'Nightrider');
  assert.equal(matches.length, 9, 'Nightrider requires every roster opponent.');
  assert.ok(matches.every(row => row.openingCases === 32), 'Nightrider uniform first-32 derivation requires all 32 matched cases against every opponent.');
  assert.equal(new Set(matches.map(row => row.a === 'Nightrider' ? row.b : row.a)).size, 9);
  const perBudget = BUDGETS.map(nodes => {
    const opponents = matches.map(row => {
      const source = row.scores.find(score => score.nodes === nodes), inverted = row.b === 'Nightrider';
      assert.ok(source, 'Missing Nightrider node condition.');
      const units = inverted ? source.denominator - source.scoreUnits : source.scoreUnits;
      return { opponent: inverted ? row.a : row.b, score: units / source.denominator, scoreUnits: units,
        denominator: source.denominator, openingCases: row.openingCases };
    });
    const summarize = rows => ({ score: mean(rows.map(row => row.score)),
      exactFraction: fraction(rows.reduce((sum, row) => sum + row.scoreUnits, 0), 128 * rows.length),
      opponents: rows.length, sharedOpenings: 32, games: 64 * rows.length });
    return { nodes, opponents, overallNine: summarize(opponents), frozenFour: summarize(opponents.filter(row => REFERENCES.includes(row.opponent))) };
  });
  return { scope: 'Derived from reported shared-case score aggregates, not raw games; exact half-point grid conditional on reported complete-pair counts.',
    perBudget, delta20kTo80k: perBudget[2].overallNine.score - perBudget[0].overallNine.score,
    opponentDeltas: perBudget[0].opponents.map(row => ({ opponent: row.opponent, fromScore: row.score,
      toScore: perBudget[2].opponents.find(other => other.opponent === row.opponent).score,
      difference: perBudget[2].opponents.find(other => other.opponent === row.opponent).score - row.score })),
    deltaUncertaintyAvailable: false };
}

function buildSnapshot(parsed = parseReport(loadSource())) {
  const unpairedFinalizedRecords = parsed.reportedProgress.finalizedGames - parsed.reportedProgress.pairedGames;
  assert.equal(unpairedFinalizedRecords % 2, 0);
  const nightrider = deriveNightrider(parsed.comparisons);
  const reported80k = parsed.budgets.find(row => row.nodes === 80000).rows.find(row => row.name === 'Nightrider');
  assert.equal(reported80k.sharedOpenings, 32);
  assert.ok(Math.abs(printedPercent(reported80k.scorePrinted) - nightrider.perBudget[2].overallNine.score) <= 0.000050001,
    'Reported 80k Nightrider score disagrees with the same32 matched aggregate.');
  return { schemaVersion: 1, format: 'levelup-v17-panel-report-only-snapshot', recordedDate: '2026-11-03', source: SOURCE,
    provenance: { basis: 'uploaded Markdown report only', rawJournalAvailable: false,
      rawJournalFailure: 'The uploaded games.jsonl exceeded the executor transfer limit of 32 MiB.',
      originalCampaignManifestSupplied: false, originalStageManifestsSupplied: false, nativePreflightSupplied: false,
      legalMovesIndependentlyReplayed: false, reportReproducedFromGames: false, engineSha256: null },
    ...parsed, nightrider,
    unscored: { finalizedRecordsExcludedFromPairs: unpairedFinalizedRecords,
      colorPairsWithoutAScore: unpairedFinalizedRecords / 2, exactTruncationCountKnown: false,
      explanation: 'One or both games of an unscored pair may be truncated. Aggregate Markdown does not establish exact truncation, retry or error-attempt counts.' },
    continuity: { cumulativeSnapshot: true, previousGameIdentitiesVerified: false, snapshotsMustNotBeSummed: true },
    limitations: [
      'Current target is 64 openings, but 20k/40k have 40 declared cases and 80k has 32. Current overall rows use different cohorts and must not be read as a matched search-budget comparison.',
      'The shared-sensitivity table matches cases across all three budgets. Three matchup cells contain 31 cases rather than 32; no uniform 32-opening overall is inferred for affected pieces.',
      'Nightrider has 32 complete matched cases against every opponent, so its aggregate score and four-reference subset are derivable on the same 32 cases at each budget.',
      'Reported two-decimal scores are uniquely resolved onto the complete-color-pair half-point score grid. This does not supply opening identities, individual outcomes or executable provenance.',
      'No first-32 W/D/L, low-budget ordinary results, material estimates or new opening-block uncertainty are inferred. The 80k Nightrider W/D/L, color scores and range are retained as reported fields, not independently recomputed.',
      'This cumulative snapshot is not additional independent evidence on top of earlier cumulative snapshots. Journal continuity cannot be verified from Markdown.',
      'No engine searches, matches or game-record repairs are performed.',
    ] };
}

function renderSnapshot(snapshot) {
  const night = snapshot.nightrider, reported = snapshot.budgets.find(row => row.nodes === 80000).rows.find(row => row.name === 'Nightrider');
  return ['# Panel extension: report-only snapshot', '',
    'The uploaded Markdown requests 64 total openings and reports 12,320 finalized games, 12,314 scored paired games. The new raw journal exceeds the available 32 MiB transfer limit, so this is explicitly a report-only record, not a journal audit or report reproduction from games.', '',
    '| Nodes | Declared openings | Requested total | Finalized games |', '| ---: | ---: | ---: | ---: |',
    ...snapshot.budgets.map(row => `| ${row.nodes} | ${row.declaredOpenings} | ${row.targetOpenings} | ${row.finalizedGames}/${row.scheduledGames} |`), '',
    '## Nightrider on the same first 32 openings', '',
    '| Nodes | All nine roster opponents | Four frozen references only |', '| ---: | ---: | ---: |',
    ...night.perBudget.map(row => `| ${row.nodes} | ${percent(row.overallNine.score)} | ${percent(row.frozenFour.score)} |`), '',
    'All nine Nightrider matchups have 32 fully matched cases. Its aggregate 20k-to-80k increase is 3.47 percentage points; no opening-block range for that aggregate change can be derived from this Markdown.', '',
    '| Opponent | Nightrider 20k score | Nightrider 80k score | Change (pp) |', '| --- | ---: | ---: | ---: |',
    ...night.opponentDeltas.map(row => `| ${row.opponent} | ${percent(row.fromScore)} | ${percent(row.toScore)} | ${(100 * row.difference).toFixed(2)} |`), '',
    'The largest gains are against Cataphract (+16.41pp) and Crusader (+14.06pp). The frozen-reference average stays close to 41% because losses against Amazon and Vanguard offset other gains. The all-roster and frozen-reference baskets answer different questions.', '',
    `The 80k report records ${reported.wins} wins, ${reported.draws} draws and ${reported.losses} losses over ${reported.games} games, a ${reported.scorePrinted} score, range ${reported.conditionalRangePrinted}, and physical White/Black scores ${reported.physicalColorScoresPrinted.white}/${reported.physicalColorScoresPrinted.black}. These are reported aggregates, not independently audited results.`, '',
    '## Incomplete color pairs', '',
    'Three shared-sensitivity matchups have 31 cases: Vertical bishop/Unicorn, Unicorn/Cataphract and Ranger/Cataphract. The per-budget report omits one color pair in each of the first two at 40k and one in the last at 80k. The six finalized records excluded from scored pairs establish three unscored pairs, not an exact count of truncated games.', '',
    '## Scope and provenance', '', ...snapshot.limitations.map(note => `- ${note}`), '',
    'The exact uploaded report is retained with a byte-count and SHA-256 pin. Run `node scripts/balance/v17-level3-panel-third-report.js` to verify the report-only artifacts; `--write` regenerates derived JSON/Markdown only.', ''].join('\n');
}

function main(args = process.argv.slice(2)) {
  assert.ok(!args.length || args.length === 1 && args[0] === '--write', 'Use no arguments or --write.');
  const snapshot = buildSnapshot();
  for (const [suffix, text] of [['report-only.json', JSON.stringify(snapshot) + '\n'], ['report-only.md', renderSnapshot(snapshot)]]) {
    const file = path.join(ROOT, `${PREFIX}.${suffix}`);
    if (args.length) fs.writeFileSync(file, text);
    else assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), text, `Report-only artifact changed: ${file}.`);
  }
  console.log('Report-only snapshot verified; no raw-journal audit, engine or new games.');
  return snapshot;
}

if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
module.exports = { SOURCE, BUDGETS, ROSTER, REFERENCES, loadSource, dequantizeScore, parseReport, deriveNightrider, buildSnapshot, renderSnapshot, main };
