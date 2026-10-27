const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProgressFormatter, readProgressHistory } = require('../scripts/balance/progress');

const COMPARISON = 'camel-knight-v-blink-rook';
const USER_ID = 'c25_camel-knight-v-blink-rook_o13_french-prefix_r1_b';
function fixture() {
  const comparison = {
    id: COMPARISON,
    armyA: { upgrades: { b1: 'knight.purple@3' }, remove: [] },
    armyB: { upgrades: { a1: 'rook.purple@3' }, remove: [] },
  };
  return ['w', 'b'].map(aColor => ({
    id: aColor === 'b' ? USER_ID : USER_ID.replace(/_b$/, '_w'),
    comparisonId: COMPARISON, pairId: 'camel-blink-french', openingId: 'french-prefix', aColor, comparison,
  }));
}
const finish = (game, result, prefix = '') => `${prefix}Finished ${game.id}: ${result} (${result === '*' ? 'max-plies' : result === '1/2-1/2' ? 'stalemate' : 'checkmate'}).`;
const record = (game, result, extra = {}) => ({ id: game.id, comparisonId: game.comparisonId, aColor: game.aColor,
  pairId: game.pairId, openingId: game.openingId, attempt: 1, status: 'completed', result, ...extra });

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-progress-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function writeJournal(directory, records, tail = '') {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'games.jsonl'), records.map(value => JSON.stringify(value) + '\n').join('') + tail);
}
function snapshot(directory) {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(snapshot(file)).map(([name, content]) => [`${entry.name}/${name}`, content])
      : [[entry.name, fs.readFileSync(file, 'utf8')]];
  }));
}

test('all White/Black results identify the correct purchase and contestant, including the user example', () => {
  const schedule = fixture();
  for (const [aColor, result, winner, label, color, points, tally] of [
    ['w', '1-0', 'A', 'Camel knight', 'White', '1 - 0', '1 win, 0 draws, 0 losses'],
    ['w', '0-1', 'B', 'Blink rook', 'Black', '0 - 1', '0 wins, 0 draws, 1 loss'],
    ['b', '1-0', 'B', 'Blink rook', 'White', '0 - 1', '0 wins, 0 draws, 1 loss'],
    ['b', '0-1', 'A', 'Camel knight', 'Black', '1 - 0', '1 win, 0 draws, 0 losses'],
  ]) {
    const game = schedule.find(value => value.aColor === aColor);
    const message = finish(game, result), output = createProgressFormatter(schedule)(message);
    assert.ok(output.startsWith(message), 'the original White/Black result remains visible');
    assert.ok(output.includes(`Winner: ${winner} ${label} (${color}).`), output);
    assert.ok(output.includes(`A Camel knight ${points} B Blink rook`), output);
    assert.ok(output.includes(`A: ${tally} (1 game).`), output);
  }
});

test('trusted campaign labels name current references and bundles without changing scoring or generic defaults', () => {
  const schedule = fixture();
  const format = createProgressFormatter(schedule, [], { [COMPARISON]: { a: 'Unicorn', b: 'Three pawn grants' } });
  const message = finish(schedule[1], '0-1');
  assert.match(format(message), /Winner: A Unicorn \(Black\)/);
  assert.match(format(message), /A Unicorn 1 - 0 B Three pawn grants/);
  assert.match(createProgressFormatter(schedule)(message), /A Camel knight 1 - 0 B Blink rook/);
});

test('draws award half-points and a partial color pair still contributes to the explicitly live tally', () => {
  const schedule = fixture(), format = createProgressFormatter(schedule);
  const first = format(finish(schedule[0], '1/2-1/2'));
  assert.match(first, /Draw\./);
  assert.match(first, /all scored games/);
  assert.match(first, /A Camel knight 0\.5 - 0\.5 B Blink rook/);
  assert.match(first, /0 wins, 1 draw, 0 losses \(1 game\)/);
  const second = format(finish(schedule[1], '0-1'));
  assert.match(second, /A Camel knight 1\.5 - 0\.5 B Blink rook/);
  assert.match(second, /1 win, 1 draw, 0 losses \(2 games\)/);
});

test('alternative design results name the exact revision rather than only its family', () => {
  const game = fixture()[0];
  game.comparison = { armyA: { upgrades: { d2: 'pawn.purple@10' } }, armyB: { upgrades: { d1: 'queen.purple@1' } } };
  const output = createProgressFormatter([game])(finish(game, '1-0'));
  assert.match(output, /Winner: A Rank pawn \(wide knight and camel\) \(White\)/);
  assert.match(output, /B Amazon/);
});

test('truncations, aborted attempts, errors and malformed seed identities never become draws or wins', () => {
  const schedule = fixture(), [white, black] = schedule;
  const format = createProgressFormatter(schedule, [
    record(white, '*', { status: 'truncated' }),
    record(white, '1-0', { status: 'aborted' }),
    record(black, '0-1', { status: 'error' }),
    record(white, '*'),
    record(white, '1-0', { comparisonId: 'wrong-comparison' }),
    record(white, '1-0', { aColor: 'b' }),
    record(white, '1-0', { id: 'unknown-game' }),
  ]);
  const output = format(finish(black, '*'));
  assert.match(output, /Unscored\./);
  assert.match(output, /A Camel knight 0 - 0 B Blink rook/);
  assert.match(output, /0 wins, 0 draws, 0 losses \(0 games\)/);
  assert.doesNotMatch(output, /Winner:|Draw\./);
});

test('latest valid completion survives failed retries and duplicate histories or finish notifications do not add games', () => {
  const schedule = fixture(), [white, black] = schedule;
  const final = record(white, '1/2-1/2', { attempt: 2 });
  const format = createProgressFormatter(schedule, [
    record(white, '0-1'), final, { ...final },
    record(white, '*', { attempt: 3, status: 'error' }),
    record(black, '*', { attempt: 1, status: 'aborted' }),
  ]);
  const first = format(finish(white, '1/2-1/2'));
  const duplicate = format(finish(white, '1/2-1/2'));
  assert.equal(duplicate, first);
  assert.match(duplicate, /0 wins, 1 draw, 0 losses \(1 game\)/);
  const afterRetry = format(finish(black, '1-0'));
  assert.match(afterRetry, /A Camel knight 0\.5 - 1\.5 B Blink rook/);
  assert.match(afterRetry, /0 wins, 1 draw, 1 loss \(2 games\)/);
});

test('matchup counters stay independent and identical-army controls keep explicit A/B winner names', () => {
  const schedule = fixture();
  const control = { id: 'ordinary-control_w', comparisonId: 'standard-control', pairId: 'ordinary-control',
    openingId: 'start', aColor: 'w', comparison: { armyA: { upgrades: {}, remove: [] }, armyB: { upgrades: {}, remove: [] } } };
  const format = createProgressFormatter([...schedule, control]);
  format(finish(schedule[0], '1-0'));
  const controlOutput = format(finish(control, '0-1'));
  assert.match(controlOutput, /Winner: B Standard army \(Black\)/);
  assert.match(controlOutput, /A Standard army 0 - 1 B Standard army/);
  assert.match(controlOutput, /0 wins, 0 draws, 1 loss \(1 game\)/);
  const matchup = format(finish(schedule[1], '0-1'));
  assert.match(matchup, /A Camel knight 2 - 0 B Blink rook/);
  assert.match(matchup, /2 wins, 0 draws, 0 losses \(2 games\)/);
});

test('mixed army labels preserve placement, legacy king levels and removed material', () => {
  const [game] = fixture();
  game.comparison = {
    armyA: { upgrades: { b1: 1, e1: 3 }, remove: ['d1', 'a2'] },
    armyB: { upgrades: { b1: 'knight.blue@1', g1: 'knight.purple@3' }, remove: [] },
  };
  const output = createProgressFormatter([game])(finish(game, '1-0'));
  assert.match(output, /Level 1 knight at b1 \+ Level 3 king at e1 without d1, a2/);
  assert.match(output, /Knight level 1 \(knight\.blue@1\) at b1 \+ Camel knight at g1/);
});

test('worker prefixes are retained and non-results or unknown game messages pass through unchanged', () => {
  const schedule = fixture(), format = createProgressFormatter(schedule);
  for (const message of [
    'Preflight: checking every army, king profile, and opening prefix.',
    `Starting game 1/2: ${schedule[0].id} (attempt 1).`,
    `Game ${schedule[0].id}: ply 10, e2e4 (e4).`,
    'Finished unknown-game: 1-0 (checkmate).',
    `Finished ${schedule[0].id}: invalid-result (checkmate).`,
  ]) assert.equal(format(message), message);
  const output = format(finish(schedule[1], '1-0', '[worker 2] '));
  assert.ok(output.startsWith('[worker 2] Finished '));
  assert.match(output, /\n\[worker 2\] Match score/);
  assert.match(output, /Winner: B Blink rook \(White\)/);
});

test('restart history merges durable worker results ahead of the parent and ignores torn tails without writing', t => {
  const directory = temporary(t), schedule = fixture(), [white, black] = schedule;
  const first = record(white, '1-0'), second = record(black, '1-0');
  const worker1 = path.join(directory, 'workers', 'worker-01'), worker2 = path.join(directory, 'workers', 'worker-02');
  writeJournal(directory, [first], '{"id":"partial-parent');
  writeJournal(worker1, [first], '{"id":"partial-worker');
  writeJournal(worker2, [second]);
  fs.writeFileSync(path.join(directory, 'run.json'), '{"preserve":"manifest"}');
  const manifest = { parallel: { shards: [{ directory: 'workers/worker-01' }, { directory: 'workers/worker-02' }] } };
  const before = snapshot(directory);
  const records = readProgressHistory(directory, manifest);
  assert.deepEqual(records, [first, first, second]);
  const format = createProgressFormatter(schedule, records);
  const output = format(finish(black, '1-0'));
  assert.match(output, /A Camel knight 1 - 1 B Blink rook/);
  assert.match(output, /1 win, 0 draws, 1 loss \(2 games\)/);
  assert.deepEqual(snapshot(directory), before);
});

test('history loading tolerates missing journals and never reads arbitrary shard directories', t => {
  const directory = temporary(t), game = fixture()[0];
  const unrelated = path.join(directory, 'unrelated');
  writeJournal(unrelated, [record(game, '1-0')]);
  const manifest = { parallel: { shards: [
    { directory: 'unrelated' }, { directory: '../outside' }, { directory: '/tmp' },
    { directory: 'workers/worker-17' }, { directory: 'workers/worker-01' },
  ] } };
  const before = snapshot(directory);
  assert.deepEqual(readProgressHistory(directory, manifest), []);
  assert.deepEqual(readProgressHistory(path.join(directory, 'does-not-exist')), []);
  assert.deepEqual(snapshot(directory), before);
});
