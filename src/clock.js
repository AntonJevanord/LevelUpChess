const CLOCK_CONTROLS = Object.freeze({
  none: Object.freeze({ label: 'Untimed', initialMs: 0, incrementMs: 0 }),
  blitz: Object.freeze({ label: '3 + 2', initialMs: 180000, incrementMs: 2000 }),
  five: Object.freeze({ label: '5 + 0', initialMs: 300000, incrementMs: 0 }),
  rapid: Object.freeze({ label: '10 + 5', initialMs: 600000, incrementMs: 5000 }),
  classic: Object.freeze({ label: '15 + 10', initialMs: 900000, incrementMs: 10000 }),
});

const MAX_HISTORY = 10000;
const isColor = color => color === 'w' || color === 'b';
const opposite = color => color === 'w' ? 'b' : 'w';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const balances = value => ({ w: value.w, b: value.b });
const equalBalances = (a, b) => a.w === b.w && a.b === b.b;
const validControl = control => Object.hasOwn(CLOCK_CONTROLS, control);

class ChessClock {
  constructor(control = 'none', now = () => performance.now()) {
    if (typeof now !== 'function') throw new TypeError('A clock time source is required.');
    this._now = now;
    this.reset(control);
  }

  reset(control = this.control, turn = 'w') {
    if (!validControl(control) || !isColor(turn)) throw new Error('Invalid chess clock settings.');
    this.control = control;
    const initial = CLOCK_CONTROLS[control].initialMs;
    this.remaining = { w: initial, b: initial };
    this.active = turn;
    this.running = false;
    this.started = false;
    this.expired = null;
    this.history = [];
    this.turnStart = balances(this.remaining);
    this._lastNow = null;
  }

  start(turn = this.active) {
    if (!isColor(turn)) throw new Error('Invalid clock side.');
    if (this.expired) return false;
    if (this.started && turn !== this.active) throw new Error('Resume the side whose turn it is.');
    if (this.running) return true;
    this.active = turn;
    this.started = true;
    if (this.control !== 'none') {
      this._lastNow = this._readNow();
      this.running = true;
    }
    return true;
  }

  pause() {
    this.tick();
    this.running = false;
    this._lastNow = null;
  }

  tick() {
    if (!this.running) return this.expired;
    const now = Math.max(this._lastNow, this._readNow());
    const elapsed = now - this._lastNow;
    this._lastNow = now;
    this.remaining[this.active] = Math.max(0, this.remaining[this.active] - elapsed);
    if (this.remaining[this.active] === 0) {
      this.expired = this.active;
      this.running = false;
      this._lastNow = null;
    }
    return this.expired;
  }

  completeMove(color, nextColor, finished = false) {
    if (!isColor(color) || nextColor !== opposite(color) || color !== this.active || typeof finished !== 'boolean' || this.history.length >= MAX_HISTORY) return false;
    if (this.tick() || (this.control !== 'none' && !this.running)) return false;
    this.history.push({ remaining: balances(this.turnStart), active: color });
    this.remaining[color] += CLOCK_CONTROLS[this.control].incrementMs;
    this.active = nextColor;
    this.started = true;
    this.turnStart = balances(this.remaining);
    if (finished) {
      this.running = false;
      this._lastNow = null;
    }
    return true;
  }

  undo() {
    if (!this.history.length) return false;
    const previous = this.history.pop();
    this.remaining = balances(previous.remaining);
    this.active = previous.active;
    this.turnStart = balances(previous.remaining);
    this.running = false;
    this.started = true;
    this.expired = null;
    this._lastNow = null;
    return true;
  }

  snapshot() {
    this.tick();
    return {
      version: 1,
      control: this.control,
      remaining: balances(this.remaining),
      active: this.active,
      started: this.started,
      expired: this.expired,
      history: this.history.map(entry => ({ remaining: balances(entry.remaining), active: entry.active })),
      turnStart: balances(this.turnStart),
    };
  }

  restore(snapshot, moveCount) {
    validateSnapshot(snapshot, moveCount);
    this.control = snapshot.control;
    this.remaining = balances(snapshot.remaining);
    this.active = snapshot.active;
    this.started = snapshot.started;
    this.expired = snapshot.expired;
    this.history = snapshot.history.map(entry => ({ remaining: balances(entry.remaining), active: entry.active }));
    this.turnStart = balances(snapshot.turnStart);
    this.running = false;
    this._lastNow = null;
  }

  _readNow() {
    const value = this._now();
    if (!Number.isFinite(value)) throw new Error('The clock time source returned an invalid time.');
    return value;
  }
}

function validateSnapshot(data, moveCount) {
  const invalid = () => { throw new Error('The saved clock is damaged. Import a PGN backup instead.'); };
  if (!isRecord(data) || data.version !== 1 || !validControl(data.control) || !isColor(data.active) || typeof data.started !== 'boolean' || (data.expired !== null && !isColor(data.expired))) invalid();
  if (!Number.isInteger(moveCount) || moveCount < 0 || moveCount > MAX_HISTORY || !Array.isArray(data.history) || data.history.length > MAX_HISTORY) invalid();
  if (data.control === 'none' ? data.history.length > moveCount : data.history.length !== moveCount) invalid();
  const { initialMs, incrementMs } = CLOCK_CONTROLS[data.control];
  const maxMs = initialMs + incrementMs * MAX_HISTORY;
  const validBalances = value => isRecord(value) && ['w', 'b'].every(color => Number.isFinite(value[color]) && value[color] >= 0 && value[color] <= maxMs);
  if (!validBalances(data.remaining) || !validBalances(data.turnStart)) invalid();
  if (data.history.some(entry => !isRecord(entry) || !isColor(entry.active) || !validBalances(entry.remaining))) invalid();

  // Every checkpoint begins a turn. Only its mover can spend time before
  // the following checkpoint, and a completed move earns one increment.
  const checkpoints = [...data.history, { remaining: data.turnStart, active: data.active }];
  if (!equalBalances(checkpoints[0].remaining, { w: initialMs, b: initialMs })) invalid();
  for (let i = 1; i < checkpoints.length; i++) {
    const previous = checkpoints[i - 1];
    const current = checkpoints[i];
    const mover = previous.active;
    const other = opposite(mover);
    if (current.active !== other || current.remaining[other] !== previous.remaining[other] || current.remaining[mover] > previous.remaining[mover] + incrementMs) invalid();
    if (data.control !== 'none' && current.remaining[mover] <= incrementMs) invalid();
  }
  if (data.remaining[opposite(data.active)] !== data.turnStart[opposite(data.active)] || data.remaining[data.active] > data.turnStart[data.active]) invalid();
  if (!data.started && (data.history.length || data.expired !== null || !equalBalances(data.remaining, data.turnStart))) invalid();
  if (data.control === 'none') {
    if (data.expired !== null) invalid();
  } else {
    if ((data.remaining[data.active] === 0) !== (data.expired === data.active)) invalid();
    if (data.expired !== null && (!data.started || data.expired !== data.active)) invalid();
    if (data.remaining[opposite(data.active)] === 0 || data.turnStart.w === 0 || data.turnStart.b === 0) invalid();
  }
}

function formatClock(ms) {
  if (!Number.isFinite(ms)) throw new TypeError('Invalid clock time.');
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

module.exports = { CLOCK_CONTROLS, ChessClock, formatClock };
