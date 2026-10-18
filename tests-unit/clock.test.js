const test = require('node:test');
const assert = require('node:assert/strict');
const { CLOCK_CONTROLS, ChessClock, formatClock } = require('../src/clock');

function fixture(control = 'blitz') {
  let time = 0;
  const clock = new ChessClock(control, () => time);
  return { clock, advance: ms => { time += ms; } };
}

test('timed clocks require an explicit start and count only the active side', () => {
  const { clock, advance } = fixture();
  advance(5000);
  assert.equal(clock.completeMove('w', 'b'), false);
  assert.deepEqual(clock.remaining, { w: 180000, b: 180000 });
  clock.start('w');
  advance(1234);
  assert.equal(clock.tick(), null);
  assert.deepEqual(clock.remaining, { w: 178766, b: 180000 });
  assert.equal(clock.completeMove('w', 'b'), true);
  assert.deepEqual(clock.remaining, { w: 180766, b: 180000 });
  advance(2500);
  clock.tick();
  assert.deepEqual(clock.remaining, { w: 180766, b: 177500 });
});

test('pause and repeated resume preserve thinking time and the undo checkpoint', () => {
  const { clock, advance } = fixture();
  clock.start();
  advance(5000);
  clock.pause();
  advance(90000);
  assert.equal(clock.completeMove('w', 'b'), false);
  assert.equal(clock.remaining.w, 175000);
  clock.start('w');
  advance(3000);
  clock.start('w');
  clock.completeMove('w', 'b');
  assert.equal(clock.remaining.w, 174000);
  advance(1000);
  assert.equal(clock.undo(), true);
  assert.deepEqual(clock.remaining, { w: 180000, b: 180000 });
  assert.equal(clock.active, 'w');
  assert.equal(clock.running, false);
  assert.equal(clock.started, true);
});

test('undo reverses both thinking time and increment across multiple turns', () => {
  const { clock, advance } = fixture();
  clock.start();
  advance(10000);
  clock.completeMove('w', 'b');
  advance(20000);
  clock.completeMove('b', 'w');
  advance(4000);
  clock.pause();
  assert.deepEqual(clock.remaining, { w: 168000, b: 162000 });
  clock.undo();
  assert.deepEqual(clock.remaining, { w: 172000, b: 180000 });
  assert.equal(clock.active, 'b');
  clock.undo();
  assert.deepEqual(clock.remaining, { w: 180000, b: 180000 });
  assert.equal(clock.undo(), false);
});

test('deadline prevents a move and increment, including without a timer tick', () => {
  const { clock, advance } = fixture('five');
  clock.start();
  advance(300000);
  assert.equal(clock.completeMove('w', 'b'), false);
  assert.equal(clock.expired, 'w');
  assert.equal(clock.running, false);
  assert.equal(clock.remaining.w, 0);
  assert.equal(clock.history.length, 0);
  assert.equal(clock.start(), false);
  advance(9000);
  assert.equal(clock.tick(), 'w');
});

test('a finished move stops immediately without charging the next side', () => {
  const { clock, advance } = fixture();
  clock.start();
  advance(179999);
  assert.equal(clock.completeMove('w', 'b'), true);
  assert.equal(clock.remaining.w, 2001);
  advance(10000);
  assert.equal(clock.completeMove('b', 'w', true), true);
  assert.equal(clock.running, false);
  assert.deepEqual(clock.remaining, { w: 2001, b: 172000 });
  assert.equal(clock.history.length, 2);
  advance(600000);
  assert.equal(clock.tick(), null);
  assert.equal(clock.expired, null);
  assert.deepEqual(clock.remaining, { w: 2001, b: 172000 });
});

test('an expired clock with moves can be undone to a paused playable position', () => {
  const { clock, advance } = fixture('five');
  clock.start();
  clock.completeMove('w', 'b');
  advance(300001);
  clock.tick();
  assert.equal(clock.expired, 'b');
  clock.undo();
  assert.equal(clock.expired, null);
  assert.equal(clock.active, 'w');
  assert.deepEqual(clock.remaining, { w: 300000, b: 300000 });
  assert.equal(clock.running, false);
});

test('save/load settles elapsed time, loads paused, and preserves an unfinished turn for undo', () => {
  const { clock, advance } = fixture();
  clock.start();
  advance(10000);
  clock.completeMove('w', 'b');
  advance(2500);
  clock.pause();
  advance(5000);
  clock.start();
  advance(1500);
  const saved = JSON.parse(JSON.stringify(clock.snapshot()));
  assert.deepEqual(saved.remaining, { w: 172000, b: 176000 });
  const loaded = fixture();
  loaded.clock.restore(saved, 1);
  loaded.advance(100000);
  loaded.clock.tick();
  assert.equal(loaded.clock.running, false);
  assert.deepEqual(loaded.clock.remaining, saved.remaining);
  loaded.clock.start();
  loaded.advance(5000);
  loaded.clock.completeMove('b', 'w');
  assert.equal(loaded.clock.remaining.b, 173000);
  loaded.clock.undo();
  assert.deepEqual(loaded.clock.remaining, { w: 172000, b: 180000 });
  loaded.clock.undo();
  assert.deepEqual(loaded.clock.remaining, { w: 180000, b: 180000 });
});

test('snapshot and restore copy nested values rather than sharing mutable state', () => {
  const { clock } = fixture();
  clock.start();
  clock.completeMove('w', 'b');
  const saved = clock.snapshot();
  const loaded = fixture().clock;
  loaded.restore(saved, 1);
  saved.remaining.w = 1;
  saved.turnStart.w = 2;
  saved.history[0].remaining.w = 3;
  assert.equal(clock.remaining.w, 182000);
  assert.equal(loaded.remaining.w, 182000);
  assert.equal(loaded.history[0].remaining.w, 180000);
});

test('untimed play records undo while allowing imported games with no clock history', () => {
  const { clock, advance } = fixture('none');
  advance(1000000);
  assert.equal(clock.completeMove('w', 'b'), true);
  assert.equal(clock.running, false);
  assert.deepEqual(clock.remaining, { w: 0, b: 0 });
  const loaded = fixture().clock;
  loaded.restore(clock.snapshot(), 23);
  assert.equal(loaded.undo(), true);
  assert.equal(loaded.active, 'w');
  const imported = new ChessClock();
  imported.reset('none', 'b');
  loaded.restore(imported.snapshot(), 23);
  assert.equal(loaded.active, 'b');
  assert.equal(loaded.undo(), false);
});

test('invalid moves and wrong-side resume do not advance turns', () => {
  const { clock } = fixture();
  clock.start();
  assert.equal(clock.completeMove('b', 'w'), false);
  assert.equal(clock.completeMove('w', 'w'), false);
  clock.pause();
  assert.throws(() => clock.start('b'));
  assert.equal(clock.history.length, 0);
  assert.equal(clock.active, 'w');
});

test('restore accepts valid fresh, paused, running, black-to-move, and expired snapshots', () => {
  for (const control of Object.keys(CLOCK_CONTROLS)) {
    const { clock, advance } = fixture(control);
    clock.reset(control, 'b');
    const restored = fixture().clock;
    restored.restore(clock.snapshot(), 0);
    clock.start('b');
    advance(1200);
    restored.restore(clock.snapshot(), 0);
    clock.pause();
    restored.restore(clock.snapshot(), 0);
    if (control !== 'none') {
      clock.start();
      advance(CLOCK_CONTROLS[control].initialMs);
      restored.restore(clock.snapshot(), 0);
      assert.equal(restored.expired, 'b');
    }
  }
});

test('restore rejects corrupted states atomically', () => {
  const { clock, advance } = fixture();
  clock.start();
  advance(4000);
  clock.completeMove('w', 'b');
  advance(2000);
  const saved = clock.snapshot();
  const mutations = [
    data => { data.version = 2; },
    data => { data.control = 'toString'; },
    data => { data.active = 'x'; },
    data => { data.started = false; },
    data => { data.expired = 'w'; },
    data => { data.remaining.w = -1; },
    data => { data.remaining.w = Infinity; },
    data => { data.remaining.w = 1e15; },
    data => { data.remaining.b = data.turnStart.b + 1; },
    data => { data.turnStart.w -= 1; },
    data => { data.turnStart.b -= 1; },
    data => { data.history[0].active = 'b'; },
    data => { data.history[0].remaining.w -= 1; },
    data => { data.history = []; },
    data => { data.history = Array(10001).fill(data.history[0]); },
    data => { data.turnStart = null; },
  ];
  const target = fixture('rapid').clock;
  const before = target.snapshot();
  for (const mutate of mutations) {
    const corrupt = structuredClone(saved);
    mutate(corrupt);
    assert.throws(() => target.restore(corrupt, 1), /saved clock/);
    assert.deepEqual(target.snapshot(), before);
  }
  for (const count of [-1, 0, 1.5, 10001, NaN]) assert.throws(() => target.restore(saved, count));
});

test('clocks tolerate a backward time source without gaining time', () => {
  const { clock, advance } = fixture();
  clock.start();
  advance(2000);
  clock.tick();
  advance(-1000);
  clock.tick();
  assert.equal(clock.remaining.w, 178000);
  advance(1500);
  clock.tick();
  assert.equal(clock.remaining.w, 177500);
});

test('formatting rounds up fractions and handles minute boundaries', () => {
  assert.equal(formatClock(180000), '03:00');
  assert.equal(formatClock(179999), '03:00');
  assert.equal(formatClock(60001), '01:01');
  assert.equal(formatClock(60000), '01:00');
  assert.equal(formatClock(1001), '00:02');
  assert.equal(formatClock(1), '00:01');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(-1), '00:00');
  assert.equal(formatClock(3600000), '60:00');
  assert.throws(() => formatClock(NaN));
});
