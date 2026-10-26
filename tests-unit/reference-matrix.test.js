'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadExpectedGames, readJournalSnapshot, recoverRevisionRecords,
  matrixFromMatches, makeReferenceMatrix, writeReferenceMatrix,
} = require('../scripts/balance/reference-matrix');
const { parseArgs, main } = require('../scripts/reference-matrix');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'experiments/balance/results/short-side-revision-recovery-001.games.jsonl');
const BISHOP = 'bishop.purple@7', ROOK = 'rook.purple@10';
const CAMEL = 'knight.purple@3', AMAZON = 'queen.purple@1';
const json = value => JSON.stringify(value) + '\n';

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-reference-matrix-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function savedRecords() { return readJournalSnapshot(ARCHIVE).records; }
function completed(game) {
  // Synthetic metadata-only records exercise gap accounting. Their histories
  // deliberately are not claimed as legally replayed balance evidence.
  const template = savedRecords().find(row => row.kind === 'head' && row.aColor === game.aColor);
  return { ...structuredClone(template), ...structuredClone(game), attempt: 1 };
}
function missingDescriptors() {
  const ids = new Set(savedRecords().map(row => row.id));
  return loadExpectedGames().schedule.filter(game => !ids.has(game.id));
}
function snapshot(directory, rows, name = 'games.jsonl') {
  const file = path.join(directory, name);
  fs.writeFileSync(file, rows.map(JSON.stringify).join('\n') + '\n');
  return file;
}

test('matrix uses row scores, half-point draws and complementary reciprocal cells', () => {
  const matrix = matrixFromMatches([{ designA: BISHOP, designB: ROOK,
    games: 128, wins: 56, draws: 17, losses: 55, observedAScore: 64.5 / 128,
    observedInterval: { lower: 0.4077, upper: 0.6055 }, sourceId: 'checkpoint' }]);
  assert.equal(matrix[BISHOP][ROOK].score, 64.5 / 128);
  assert.equal(matrix[ROOK][BISHOP].score, 63.5 / 128);
  assert.equal(matrix[BISHOP][ROOK].games, 128);
  assert.equal(matrix[BISHOP][BISHOP], null);
  assert.equal(matrix[AMAZON][CAMEL], null);
});

test('default matrix separates historical report scores from recovered raw coverage', () => {
  const { report, gapPlan } = makeReferenceMatrix();
  assert.equal(report.reportedMatchups.length, 6);
  assert.equal(report.matrix[BISHOP][ROOK].score, 136.5 / 256);
  assert.equal(report.matrix[BISHOP][ROOK].games, 256);
  assert.equal(report.matrix[BISHOP][AMAZON].games, 256);
  assert.equal(report.matrix[BISHOP][AMAZON].score, 122 / 256);
  assert.equal(report.matrix[BISHOP][CAMEL].score, 105 / 256);
  assert.equal(report.matrix[CAMEL][AMAZON].games, 254);
  assert.equal(gapPlan.recoveredCompletedGames, 320);
  assert.equal(gapPlan.targetGames, 512);
  assert.equal(gapPlan.remainingGames, 192);
  assert.equal(gapPlan.missingGames.length, 192);
  assert.equal(gapPlan.unscoredGames.length, 0);
  assert.deepEqual(new Set(gapPlan.missingGames.map(game => game.designB)), new Set([CAMEL, AMAZON]));
  assert.equal(new Set(gapPlan.missingGames.map(game => game.openingId)).size, 48);
  assert.ok(gapPlan.missingGames.every(game => ![game.designA, game.designB].includes(ROOK)));
});

test('archived ordinary games are preserved as inputs but excluded from matchup recovery', () => {
  const recovered = recoverRevisionRecords([readJournalSnapshot(ARCHIVE)]);
  assert.equal(recovered.records.length, 320);
  assert.equal(recovered.latest.size, 320);
  assert.ok(recovered.records.every(record => record.kind === 'head' && record.designA === BISHOP));
});

test('an additional complete revision journal fills all gaps without counting archived copies twice', t => {
  const directory = temporary(t), original = savedRecords().filter(record => record.kind === 'head');
  const file = snapshot(directory, [...original, ...missingDescriptors().map(completed)]);
  const before = fs.readFileSync(file);
  const { gapPlan, recoveredRecords } = makeReferenceMatrix({ revisions: file });
  assert.equal(gapPlan.recoveredCompletedGames, 512);
  assert.equal(gapPlan.remainingGames, 0);
  assert.equal(gapPlan.missingGames.length, 0);
  assert.equal(recoveredRecords.length, 512);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('recovering one missing color keeps its partner missing and does not invent a completed pair', t => {
  const directory = temporary(t), [game] = missingDescriptors();
  const file = snapshot(directory, [completed(game)]);
  const { gapPlan } = makeReferenceMatrix({ revisions: file });
  assert.equal(gapPlan.recoveredCompletedGames, 321);
  assert.equal(gapPlan.remainingGames, 191);
  assert.ok(!gapPlan.missingGames.some(row => row.id === game.id));
  assert.ok(gapPlan.missingGames.some(row => row.pairId === game.pairId));
});

test('conflicting completed copies of a recovered game fail instead of replacing a history', t => {
  const directory = temporary(t), changed = structuredClone(savedRecords().find(row => row.kind === 'head'));
  changed.result = changed.result === '1-0' ? '0-1' : '1-0';
  const file = snapshot(directory, [changed]);
  assert.throws(() => makeReferenceMatrix({ revisions: file }), /conflict|contradict|history|completed/i);
});

test('changed profile, policy, starting position and color metadata are refused', t => {
  const directory = temporary(t), [game] = missingDescriptors();
  for (const [name, mutate] of [
    ['profile', row => { row.profileHash = 'wrong'; }],
    ['engine', row => { row.engine.nodes = 100; }],
    ['start', row => { row.startFen = savedRecords()[0].startFen; }],
    ['color', row => { row.aColor = row.aColor === 'w' ? 'b' : 'w'; }],
    ['evaluation', row => { row.evaluation = { pieceValues: {} }; }],
  ]) {
    const row = completed(game); mutate(row);
    const file = snapshot(directory, [row], `${name}.jsonl`);
    assert.throws(() => makeReferenceMatrix({ revisions: file }), /metadata|policy|profile|identity|planned|differs|mismatch|frozen|evaluation|start|color/i, name);
  }
});

test('a torn journal tail is excluded and source bytes remain untouched', t => {
  const directory = temporary(t), row = savedRecords().find(item => item.kind === 'head');
  const file = path.join(directory, 'active.jsonl'), tail = '{"unfinished":';
  fs.writeFileSync(file, json(row) + tail);
  const before = fs.readFileSync(file), snapshot = readJournalSnapshot(file);
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.ignoredTornTailBytes, Buffer.byteLength(tail));
  assert.deepEqual(snapshot.records[0], row);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('truncated imported games stay unscored and are not automatically scheduled for replay', t => {
  const directory = temporary(t), [game] = missingDescriptors(), row = completed(game);
  Object.assign(row, { status: 'truncated', result: '*', reason: 'max-plies' });
  const file = snapshot(directory, [row]);
  const { gapPlan } = makeReferenceMatrix({ revisions: file });
  assert.equal(gapPlan.recoveredCompletedGames, 320);
  assert.equal(gapPlan.unscoredGames.length, 1);
  assert.equal(gapPlan.remainingGames, 191);
  assert.ok(!gapPlan.missingGames.some(item => item.id === game.id));
});

test('a supplied bishop report replaces the transcribed checkpoint observation', t => {
  const directory = temporary(t), file = path.join(directory, 'bishop-report.json');
  const match = { designA: BISHOP, designB: ROOK, games: 256,
    wins: 100, draws: 56, losses: 100, observedAScore: 0.5, observedInterval: { lower: 0.45, upper: 0.55 } };
  fs.writeFileSync(file, json({ schemaVersion: 1, format: 'levelup-bishop-report',
    studyId: 'bishop-references-v16-001', checkpoint: 1280,
    analysis: { predictions: { matchups: [match] } } }));
  const before = fs.readFileSync(file), { report } = makeReferenceMatrix({ bishop: directory });
  assert.equal(report.matrix[BISHOP][ROOK].score, 0.5);
  assert.equal(report.matrix[BISHOP][ROOK].games, 256);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('an explicitly supplied checkpoint transcription remains report-only observation evidence', () => {
  const bishop = path.join(ROOT, 'experiments/balance/results/reference-matrix-640.observation.json');
  const { report } = makeReferenceMatrix({ bishop });
  const match = report.reportedMatchups.find(row => row.designA === BISHOP && row.designB === ROOK);
  assert.equal(match.evidence, 'user-reported-checkpoint');
  assert.equal(report.sources.find(source => source.id === match.sourceId).kind, 'user-reported-checkpoint');
  assert.equal(match.games, 128);
});

test('tool-owned outputs refresh safely and refuse changed artifacts or unrelated files', t => {
  const directory = temporary(t), out = path.join(directory, 'matrix');
  const archiveBefore = fs.readFileSync(ARCHIVE);
  writeReferenceMatrix({ out });
  for (const file of ['matrix.md', 'matrix.json', 'gap-plan.json']) assert.ok(fs.existsSync(path.join(out, file)));
  assert.ok(!fs.readdirSync(out).some(file => file.endsWith('.epd')));
  const reportBefore = fs.readFileSync(path.join(out, 'matrix.json'));
  writeReferenceMatrix({ out });
  assert.deepEqual(fs.readFileSync(path.join(out, 'matrix.json')), reportBefore);
  assert.deepEqual(fs.readFileSync(ARCHIVE), archiveBefore);
  fs.appendFileSync(path.join(out, 'matrix.md'), 'User notes to preserve.\n');
  assert.throws(() => writeReferenceMatrix({ out }), /changed|new output/i);
  const other = path.join(directory, 'unrelated'); fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'notes.txt'), 'User file.');
  assert.throws(() => writeReferenceMatrix({ out: other }), /not owned|new|directory/i);
  assert.equal(fs.readFileSync(path.join(other, 'notes.txt'), 'utf8'), 'User file.');
});

test('matrix output cannot be placed inside an active bishop input folder', t => {
  const directory = temporary(t), bishop = path.join(directory, 'bishop'); fs.mkdirSync(bishop);
  const observation = fs.readFileSync(path.join(ROOT, 'experiments/balance/results/reference-matrix-640.observation.json'));
  fs.writeFileSync(path.join(bishop, 'bishop-report.json'), observation);
  assert.throws(() => writeReferenceMatrix({ bishop, out: path.join(bishop, 'matrix') }), /outside|active|source|input/i);
  assert.deepEqual(fs.readFileSync(path.join(bishop, 'bishop-report.json')), observation);
  assert.equal(fs.existsSync(path.join(bishop, 'matrix')), false);
});

test('file inputs protect their source run folder as well as the file itself', t => {
  const directory = temporary(t), source = path.join(directory, 'source'); fs.mkdirSync(source);
  const file = path.join(source, 'bishop-report.json');
  const observation = fs.readFileSync(path.join(ROOT, 'experiments/balance/results/reference-matrix-640.observation.json'));
  fs.writeFileSync(file, observation);
  assert.throws(() => writeReferenceMatrix({ bishop: file, out: path.join(source, 'matrix') }), /outside|active|source|input/i);
  assert.deepEqual(fs.readFileSync(file), observation);
  assert.equal(fs.existsSync(path.join(source, 'matrix')), false);
});

test('a bishop report with a changed frozen profile is refused', t => {
  const directory = temporary(t), file = path.join(directory, 'bishop-report.json');
  const observation = JSON.parse(fs.readFileSync(path.join(ROOT, 'experiments/balance/results/reference-matrix-640.observation.json')));
  fs.writeFileSync(file, json({ schemaVersion: 1, format: 'levelup-bishop-report',
    studyId: 'bishop-references-v16-001', profileHash: 'different-profile',
    analysis: { predictions: { matchups: [observation.bishopVsRook] } } }));
  assert.throws(() => makeReferenceMatrix({ bishop: file }), /profile|registry|declared/i);
});

test('output refresh requires the complete artifact checksum inventory', t => {
  const directory = temporary(t), out = path.join(directory, 'matrix'); writeReferenceMatrix({ out });
  const file = path.join(out, 'matrix.json'), report = JSON.parse(fs.readFileSync(file));
  report.artifacts = {}; fs.writeFileSync(file, json(report));
  const markdownBefore = fs.readFileSync(path.join(out, 'matrix.md'));
  assert.throws(() => writeReferenceMatrix({ out }), /recognized|new directory|checksum|artifact/i);
  assert.deepEqual(fs.readFileSync(path.join(out, 'matrix.md')), markdownBefore);
});

test('duplicate reciprocal matchups cannot silently overwrite one another', () => {
  const first = { designA: BISHOP, designB: ROOK, games: 2,
    wins: 1, draws: 1, losses: 0, observedAScore: 0.75, sourceId: 'one' };
  const reciprocal = { designA: ROOK, designB: BISHOP, games: 2,
    wins: 0, draws: 1, losses: 1, observedAScore: 0.25, sourceId: 'two' };
  assert.throws(() => matrixFromMatches([first, reciprocal]), /duplicate|average/i);
});

test('CLI validates required output and stays independent of engine configuration', async t => {
  const directory = temporary(t), out = path.join(directory, 'cli'), lines = [];
  assert.equal(parseArgs(['--out', 'result']).out, 'result');
  assert.equal(parseArgs(['--out', 'result', '--revisions', 'old']).revisions, 'old');
  assert.throws(() => parseArgs([]), /out|required|choose/i);
  assert.throws(() => parseArgs(['--out', 'a', '--out', 'b']), /repeat|duplicate/i);
  assert.throws(() => parseArgs(['--out', 'a', '--jobs', '4']), /unknown|unsupported/i);
  const before = process.env.FAIRY_STOCKFISH_PATH;
  process.env.FAIRY_STOCKFISH_PATH = path.join(directory, 'missing-engine');
  try {
    await main(['--out', out], { log: line => lines.push(line) });
    assert.ok(fs.existsSync(path.join(out, 'matrix.md')));
    assert.ok(lines.length > 0);
  } finally {
    if (before === undefined) delete process.env.FAIRY_STOCKFISH_PATH;
    else process.env.FAIRY_STOCKFISH_PATH = before;
  }
});
