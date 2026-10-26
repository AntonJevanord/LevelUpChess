'use strict';

// Read-only evidence summary. This tool performs no searches, rule replay,
// material fitting or campaign edits; raw and report-only evidence stay apart.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');
const ROOT = path.resolve(__dirname, '../..');
const RESULTS = path.join(ROOT, 'experiments/balance/results');
const BISHOP = 'bishop.purple@7', ROOK = 'rook.purple@10', CAMEL = 'knight.purple@3', AMAZON = 'queen.purple@1';
const ROSTER = Object.freeze([
  { id: BISHOP, label: 'Short-side bishop', movement: 'BsWsN' },
  { id: ROOK, label: 'Forward-bishop rook', movement: 'RfB' },
  { id: CAMEL, label: 'Camel knight', movement: 'NC' },
  { id: AMAZON, label: 'Amazon', movement: 'QN' },
]);
const PINNED = {
  'reference-matrix.expected-games.json': '44f7d047c3d43aac01aa22e602fbf92ca380fef5241bd5a17fb9defc1042f8ad',
  'short-side-revision-recovery-001.games.jsonl': 'c5e3d9c38b14f354c4febda2fa35dfce1fc35b7cb76140191274ccb3e5dee7c0',
  'short-side-revision-recovery-001.audit.json': '908819f8abf13411ba49a143704ae1dbee8de4ab8bf1ffe44b1ccbf3a48f9230',
  'simple-reference-001.uploaded-report.json': 'c83a26ca3cf0ab33306bc7ad2481076b6585786538c6d90d7342e0b8f2c4c4dd',
  'reference-revisions-001.uploaded-report.md': 'cf4d138e6021f8740317f31e5f9db78470c9cb3890b34cb0195a7e5bccafe37a',
};
const SCORES = { '1-0': 1, '1/2-1/2': 0.5, '0-1': 0 };
const FILES = ['matrix.md', 'matrix.json', 'gap-plan.json', 'recovered-head.games.jsonl'];
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = message => { throw new Error(message); };
const pairKey = (a, b) => [a, b].sort().join('|');
const number = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'unavailable';

function pinned(name) {
  const file = path.join(RESULTS, name), bytes = fs.readFileSync(file);
  if (sha(bytes) !== PINNED[name]) fail(`Pinned reference-matrix evidence changed: ${name}.`);
  return { file, bytes, sha256: sha(bytes) };
}
function loadExpectedGames() {
  const input = pinned('reference-matrix.expected-games.json'), expected = JSON.parse(input.bytes);
  if (expected.format !== 'levelup-reference-matrix-expected-games' || expected.schedule?.length !== 512) fail('The frozen 512-game recovery inventory is required.');
  return expected;
}
function readJournalSnapshot(file) {
  const absolute = path.resolve(file), bytes = fs.readFileSync(absolute), text = bytes.toString('utf8');
  const end = text.lastIndexOf('\n') + 1;
  const complete = text.slice(0, end);
  const records = complete.split('\n').filter(line => line.trim()).map((line, index) => {
    try { return JSON.parse(line); } catch { fail(`Malformed complete journal line ${index + 1}: ${absolute}.`); }
  });
  return { file: absolute, sha256: sha(bytes), records, ignoredTornTailBytes: Buffer.byteLength(text.slice(end)) };
}
function validateRecord(record, game, expected) {
  for (const field of ['id', 'unitId', 'pairId', 'kind', 'comparisonId', 'openingId', 'aColor', 'designA', 'designB', 'whiteDesign', 'blackDesign', 'startFen']) {
    if (record[field] !== game[field]) fail(`Revision record differs from planned ${field}: ${record.id}.`);
  }
  if (record.schemaVersion !== 1 || record.profileHash !== expected.profileHash || record.registryHash !== expected.registryHash
    || record.variant !== expected.variant || record.registryReference !== 'collection.json#plan.registry'
    || !isDeepStrictEqual(record.engine, expected.engine) || record.evaluation !== undefined
    || record.royalMode !== 'king' || record.evaluationCaveat !== null
    || !isDeepStrictEqual(record.whiteStrength, { skill: 20 }) || !isDeepStrictEqual(record.blackStrength, { skill: 20 })
    || !isDeepStrictEqual(record.openingMoves, []) || record.openingPlies !== 0) fail(`Revision record identity or playing policy differs: ${record.id}.`);
  if (!Number.isSafeInteger(record.attempt) || record.attempt < 1 || !['completed', 'truncated', 'aborted', 'error'].includes(record.status)
    || !Array.isArray(record.moves) || !Array.isArray(record.sans) || record.moves.length !== record.sans.length
    || record.totalPlies !== record.moves.length || record.playedPlies !== record.moves.length
    || record.moves.some(move => typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
    || record.sans.some(san => typeof san !== 'string' || !san)
    || typeof record.finalFen !== 'string' || record.finalFen.split(/\s+/).length !== 6
    || (record.status === 'completed' ? !Object.hasOwn(SCORES, record.result) : record.result !== '*')) fail(`Malformed revision history: ${record.id}.`);
}
function sameHistory(a, b) {
  return ['moves', 'sans', 'result', 'reason', 'finalFen', 'status'].every(field => isDeepStrictEqual(a[field], b[field]));
}
function recoverRevisionRecords(sources, expected = loadExpectedGames()) {
  const schedule = new Map(expected.schedule.map(game => [game.id, game])), latest = new Map();
  const sourceByGame = new Map();
  for (const source of sources) for (const record of source.records) {
    const relevant = schedule.has(record?.id)
      || record?.kind === 'head' && record.designA === BISHOP && [CAMEL, AMAZON].includes(record.designB);
    if (!relevant) continue;
    const game = schedule.get(record.id);
    if (!game) fail(`Foreign short-side bishop comparison game: ${record.id}.`);
    validateRecord(record, game, expected);
    const prior = latest.get(record.id);
    if (prior && !sameHistory(prior, record)) {
      if (['completed', 'truncated'].includes(prior.status) || record.attempt <= prior.attempt
        || prior.moves.some((move, index) => record.moves[index] !== move)
        || prior.sans.some((san, index) => record.sans[index] !== san)) fail(`Conflicting copies or attempts for revision game: ${record.id}.`);
    }
    if (!prior || record.attempt >= prior.attempt) latest.set(record.id, record);
    const locations = sourceByGame.get(record.id) || [];
    if (!locations.includes(source.file)) locations.push(source.file);
    sourceByGame.set(record.id, locations);
  }
  return { latest, records: expected.schedule.map(game => latest.get(game.id)).filter(Boolean),
    sourceByGame, sources: sources.map(({ records, ...source }) => ({ ...source, journalRecords: records.length })),
    ignoredTornTailBytes: sources.reduce((sum, source) => sum + (source.ignoredTornTailBytes || 0), 0) };
}
function normalizeMatch(input) {
  const match = { ...input }, ids = ROSTER.map(piece => piece.id);
  if (!ids.includes(match.designA) || !ids.includes(match.designB) || match.designA === match.designB
    || !Number.isSafeInteger(match.games) || match.games < 0 || match.games % 2
    || ['wins', 'draws', 'losses'].some(key => !Number.isSafeInteger(match[key]) || match[key] < 0)
    || match.wins + match.draws + match.losses !== match.games) fail('A matchup requires intact paired counts and reference identities.');
  const score = match.games ? (match.wins + match.draws / 2) / match.games : null;
  if (match.observedAScore !== undefined && (score === null ? match.observedAScore !== null : Math.abs(match.observedAScore - score) > 1e-9)) fail('A matchup score disagrees with its W/D/L counts.');
  match.observedAScore = score;
  if (match.observedInterval && (!Number.isFinite(match.observedInterval.lower) || !Number.isFinite(match.observedInterval.upper)
    || match.observedInterval.lower < 0 || match.observedInterval.upper > 1 || match.observedInterval.lower > match.observedInterval.upper)) fail('Invalid matchup conditional range.');
  if (ids.indexOf(match.designA) > ids.indexOf(match.designB)) {
    [match.designA, match.designB] = [match.designB, match.designA];
    [match.wins, match.losses] = [match.losses, match.wins];
    match.observedAScore = score === null ? null : 1 - score;
    if (match.observedInterval) match.observedInterval = { lower: 1 - match.observedInterval.upper, upper: 1 - match.observedInterval.lower };
  }
  return match;
}
function matrixFromMatches(matches) {
  const matrix = Object.fromEntries(ROSTER.map(a => [a.id, Object.fromEntries(ROSTER.map(b => [b.id, null]))]));
  const seen = new Set();
  for (const input of matches) {
    const match = normalizeMatch(input), key = pairKey(match.designA, match.designB);
    if (seen.has(key)) fail('Duplicate matrix comparison; do not average different sources or opening counts.');
    seen.add(key);
    const cell = { score: match.observedAScore, games: match.games, sourceId: match.sourceId,
      interval: match.observedInterval || null };
    matrix[match.designA][match.designB] = cell;
    matrix[match.designB][match.designA] = { ...cell, score: cell.score === null ? null : 1 - cell.score,
      interval: cell.interval ? { lower: 1 - cell.interval.upper, upper: 1 - cell.interval.lower } : null };
  }
  return matrix;
}
function parseReportedBishop(markdown, opponent, sourceId) {
  const line = markdown.split(/\r?\n/).find(line => line.startsWith(`| Bishop: short side / ${opponent.label} |`));
  if (!line) fail('The historical revision report has no expected bishop comparison.');
  const columns = line.split('|').slice(1, -1).map(text => text.trim());
  const [wins, draws, losses] = columns[2].split('/').map(Number);
  const range = columns[4].split('–').map(text => Number(text.replace('%', '').trim()) / 100);
  return normalizeMatch({ designA: BISHOP, designB: opponent.id, games: Number(columns[1]), wins, draws, losses,
    observedInterval: { lower: range[0], upper: range[1] }, sourceId, evidence: 'historical-report-only' });
}
function bishopObservation(input) {
  const file = input ? (fs.statSync(path.resolve(input)).isDirectory() ? path.join(path.resolve(input), 'bishop-report.json') : path.resolve(input))
    : path.join(RESULTS, 'reference-matrix-640.observation.json');
  const bytes = fs.readFileSync(file), report = JSON.parse(bytes);
  const isObservation = report.format === 'levelup-reference-matrix-observation';
  let match;
  if (isObservation && report.kind === 'user-reported-checkpoint') match = report.bishopVsRook;
  else if (report.format === 'levelup-bishop-report' && report.studyId === 'bishop-references-v16-001') {
    if (report.profileHash !== undefined && report.profileHash !== 'b2c0b54f4d98ce600f4d5c1c2deb92b3dfccdd657250b8307b7778a570dbecf7'
      || report.registryHash !== undefined && report.registryHash !== '43744bc9d6af7cb0adf88b26d6827392c10f8ef849704405af5555a77068082a') fail('The bishop report profile or registry differs from the declared study.');
    match = report.analysis?.predictions?.matchups?.find(row => pairKey(row.designA, row.designB) === pairKey(BISHOP, ROOK));
  } else fail('Use a bishop-reference report or the explicit checkpoint observation.');
  if (!match || pairKey(match.designA, match.designB) !== pairKey(BISHOP, ROOK)) fail('The bishop report has no short-side bishop versus RfB result.');
  const sourceId = isObservation ? input ? 'local-bishop-observation' : 'bishop-observation-640' : 'bishop-local-report';
  return { match: normalizeMatch({ ...match, sourceId, evidence: isObservation ? 'user-reported-checkpoint' : 'local-report-not-replayed-here' }),
    source: { id: sourceId, file, sha256: sha(bytes), kind: isObservation ? 'user-reported-checkpoint' : 'bishop-report',
      checkpoint: report.checkpoint, rawGameReplayPerformedHere: false } };
}
function pairedRecovery(records, opponent) {
  const selected = records.filter(record => record.status === 'completed' && record.designB === opponent);
  const units = new Map();
  for (const record of selected) { const pair = units.get(record.unitId) || []; pair.push(record); units.set(record.unitId, pair); }
  const pairs = [...units.values()].filter(pair => pair.length === 2 && new Set(pair.map(game => game.aColor)).size === 2);
  const paired = pairs.flat(), score = record => record.aColor === 'w' ? SCORES[record.result] : 1 - SCORES[record.result];
  return { designA: BISHOP, designB: opponent, games: paired.length, completePairs: pairs.length,
    completedAvailableGames: selected.length, partialCompletedGames: selected.length - paired.length,
    wins: paired.filter(row => score(row) === 1).length, draws: paired.filter(row => score(row) === 0.5).length,
    losses: paired.filter(row => score(row) === 0).length,
    observedAScore: paired.length ? paired.reduce((sum, record) => sum + score(record), 0) / paired.length : null };
}
function makeReferenceMatrix({ bishop, revisions } = {}) {
  const expected = loadExpectedGames(), raw = pinned('short-side-revision-recovery-001.games.jsonl');
  const audit = JSON.parse(pinned('short-side-revision-recovery-001.audit.json').bytes);
  if (audit.allSelectedMovesSanFinalOutcomesReplay !== true || audit.selectedGames !== 480) fail('The archived bishop recovery audit is incomplete.');
  const sources = [readJournalSnapshot(raw.file)];
  if (revisions) {
    const input = path.resolve(revisions), directory = fs.statSync(input).isDirectory();
    sources.push(readJournalSnapshot(directory ? path.join(input, 'games.jsonl') : input));
  }
  const recovered = recoverRevisionRecords(sources, expected);
  const simpleInput = pinned('simple-reference-001.uploaded-report.json'), simple = JSON.parse(simpleInput.bytes);
  const historicalInput = pinned('reference-revisions-001.uploaded-report.md'), historical = historicalInput.bytes.toString('utf8');
  const sourceRows = [{ id: 'simple-archive', file: simpleInput.file, sha256: simpleInput.sha256, kind: 'archived-replay-audited-report' },
    { id: 'revision-final-report', file: historicalInput.file, sha256: historicalInput.sha256, kind: 'historical-report-only' },
    ...recovered.sources.map((source, index) => ({ id: index ? 'revision-import' : 'revision-recovered-archive', ...source,
      kind: index ? 'metadata-validated-import-no-new-legality-replay' : 'previously-legally-replayed-archive' }))];
  const observation = bishopObservation(bishop); sourceRows.push(observation.source);
  const referenceIds = [ROOK, CAMEL, AMAZON];
  const matches = simple.analysis.predictions.matchups.filter(row => referenceIds.includes(row.designA) && referenceIds.includes(row.designB))
    .map(row => normalizeMatch({ ...row, sourceId: 'simple-archive', evidence: 'archived-replay-audited-report' }));
  if (matches.length !== 3) fail('The archived simple report must supply three distinct reference comparisons.');
  matches.push(...ROSTER.filter(row => [CAMEL, AMAZON].includes(row.id)).map(row => parseReportedBishop(historical, row, 'revision-final-report')),
    observation.match);
  const rawCoverage = [CAMEL, AMAZON].map(opponent => {
    const recovery = pairedRecovery(recovered.records, opponent);
    const reported = matches.find(match => pairKey(match.designA, match.designB) === pairKey(BISHOP, opponent));
    return { ...recovery, targetGames: 256, reportedGames: 256,
      fullReportedResultAgreement: recovery.games === 256
        ? ['wins', 'draws', 'losses'].every(name => recovery[name] === reported[name]) : null,
      provenance: 'The default subset was legally replayed in the archived audit. Additional imported rows are metadata/history-shape checked only; this command does not replay moves.' };
  });
  const unscoredGames = expected.schedule.filter(game => recovered.latest.get(game.id)?.status === 'truncated');
  const completed = expected.schedule.filter(game => recovered.latest.get(game.id)?.status === 'completed');
  const missingGames = expected.schedule.filter(game => !['completed', 'truncated'].includes(recovered.latest.get(game.id)?.status));
  const gapPlan = { schemaVersion: 1, format: 'levelup-reference-matrix-gap-plan', targetGames: 512,
    recoveredCompletedGames: completed.length, remainingGames: missingGames.length, unscoredGames,
    missingGames, launchable: false, originalProfileHash: expected.profileHash, originalRegistryHash: expected.registryHash,
    interpretation: 'Inventory only, not a runnable experiment. First search retained revision data. Only absent or unfinished short-side bishop/QN/NC cells are listed. Historical truncations remain unscored, the active RfB games are awaited, and the old Camel/Amazon truncation is not scheduled.' };
  const report = { schemaVersion: 1, format: 'levelup-reference-matrix', roster: ROSTER,
    matrix: matrixFromMatches(matches), reportedMatchups: matches, rawCoverage, sources: sourceRows,
    rawRecovery: { selectedHeadGames: recovered.records.length, recoveredCompletedGames: completed.length,
      ignoredTornTailBytes: recovered.ignoredTornTailBytes, sourceJournalCopiesCountedOnce: true },
    gaps: { targetGames: 512, remainingGames: gapPlan.remainingGames, unscoredGames: unscoredGames.length },
    interpretation: 'Each cell is the row piece’s paired point score against the column piece. Draws count half. Historical reported totals and recovered raw subsets are separate evidence; different opening coverage is not averaged into a ranking.',
    limitations: [
      'The historical bishop/QN and bishop/NC reported scores use 256 games each; raw recovery may cover fewer games and yield different scores.',
      'Default bishop/RfB is the transcribed 640-game checkpoint. Supply --bishop with the actual local report to refresh it.',
      'This command starts no games, makes no material fits and performs no rule or engine replay. Imported journal metadata and history shape are checked against the original declared schedule.',
      'Different source profiles and checkpoints remain identified; this table does not establish universal equivalence or statistical independence.',
      'The active bishop collector and its raw files remain unchanged. Missing-game inventories do not authorize an automatic rerun or replace completed/truncated histories.',
    ] };
  return { report, gapPlan, recoveredRecords: recovered.records };
}
function markdown(report) {
  const names = Object.fromEntries(ROSTER.map(row => [row.id, row.label]));
  const lines = ['# Four-reference matchup matrix', '', report.interpretation, '',
    '| Row piece / opponent | ' + ROSTER.map(row => row.label).join(' | ') + ' |',
    '| --- | ' + ROSTER.map(() => '---:').join(' | ') + ' |'];
  for (const row of ROSTER) lines.push(`| ${row.label} | ` + ROSTER.map(column => {
    const cell = report.matrix[row.id][column.id];
    return cell ? number(cell.score) : '—';
  }).join(' | ') + ' |');
  lines.push('', '| Comparison (A / B) | Paired games | A W / D / L | Source | Evidence |',
    '| --- | ---: | --- | --- | --- |');
  for (const match of report.reportedMatchups) lines.push(`| ${names[match.designA]} / ${names[match.designB]} | ${match.games} | ${match.wins} / ${match.draws} / ${match.losses} | ${match.sourceId} | ${match.evidence} |`);
  lines.push('', '## Recovered raw bishop games', '',
    'These subset scores are not substituted for the historical full-report scores above.', '',
    '| Comparison | Paired raw games | W / D / L | Raw subset point score | Completed raw games | Historical reported games |',
    '| --- | ---: | --- | ---: | ---: | ---: |');
  for (const row of report.rawCoverage) lines.push(`| ${names[row.designA]} / ${names[row.designB]} | ${row.games} | ${row.wins} / ${row.draws} / ${row.losses} | ${number(row.observedAScore)} | ${row.completedAvailableGames} | ${row.reportedGames} |`);
  lines.push('', `Recovery inventory: ${report.gaps.remainingGames} absent/unfinished short-side bishop/QN/NC games; ${report.gaps.unscoredGames} historical truncations remain unscored. This is not a runnable campaign.`, '', '## Sources', '');
  for (const source of report.sources) lines.push(`- ${source.id}: ${source.kind}; SHA-256 ${source.sha256}; ${source.file}.`);
  lines.push('', '## Limits', '');
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return lines.join('\n') + '\n';
}
function writeReferenceMatrix({ bishop, revisions, out } = {}) {
  if (!out || typeof out !== 'string') fail('A new output directory is required.');
  const result = makeReferenceMatrix({ bishop, revisions }), directory = path.resolve(out);
  const within = (parent, child) => child === parent || child.startsWith(parent + path.sep);
  if (result.report.sources.some(source => within(directory, path.resolve(source.file)))) fail('The output directory must not contain input evidence.');
  for (const input of [bishop, revisions].filter(Boolean)) {
    const absolute = path.resolve(input);
    const inputDirectory = fs.statSync(absolute).isDirectory() ? absolute : path.dirname(absolute);
    if (within(inputDirectory, directory)) fail('Write the matrix outside the active/source run directory.');
  }
  if (fs.existsSync(directory)) {
    const names = fs.readdirSync(directory);
    if (names.length) {
      if (names.some(name => !FILES.includes(name)) || !names.includes('matrix.json')) fail('Output directory contains files not owned by this matrix tool.');
      const previous = JSON.parse(fs.readFileSync(path.join(directory, 'matrix.json')));
      if (previous.schemaVersion !== 1 || previous.format !== 'levelup-reference-matrix'
        || !isDeepStrictEqual(Object.keys(previous.artifacts || {}).sort(), FILES.filter(name => name !== 'matrix.json').sort())) fail('Use a new directory or a recognized matrix output.');
      for (const [name, digest] of Object.entries(previous.artifacts)) {
        if (!FILES.includes(name) || !fs.existsSync(path.join(directory, name)) || sha(fs.readFileSync(path.join(directory, name))) !== digest) fail('A generated matrix file changed; choose a new output directory.');
      }
    }
  }
  const outputs = { 'matrix.md': markdown(result.report), 'gap-plan.json': json(result.gapPlan),
    'recovered-head.games.jsonl': result.recoveredRecords.map(record => JSON.stringify(record)).join('\n') + (result.recoveredRecords.length ? '\n' : '') };
  result.report.artifacts = Object.fromEntries(Object.entries(outputs).map(([name, content]) => [name, sha(content)]));
  outputs['matrix.json'] = json(result.report);
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) {
    const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
    try { fs.writeFileSync(temporary, content, { flag: 'wx' }); renameWithRetrySync(temporary, path.join(directory, name)); }
    finally { unlinkWithRetrySync(temporary); }
  }
  return { ...result, files: Object.fromEntries(FILES.map(name => [name, path.join(directory, name)])) };
}
module.exports = { ROSTER, loadExpectedGames, readJournalSnapshot, recoverRevisionRecords,
  matrixFromMatches, makeReferenceMatrix, writeReferenceMatrix, markdown };
