const childProcess = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

const MOVE = /^(?:[a-h][1-8][a-h][1-8][a-z]?|[A-Z]@[a-h][1-8])$/;
const MAX_LINE = 65536;
const MAX_OUTPUT = 8 * 1024 * 1024;

function cancelled(message = 'Engine operation cancelled.') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function commandText(value, name) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value) || value.length > 65536) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function integer(value, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
  return value;
}

function parseOption(line) {
  const match = line.match(/^option name (.+?) type (check|spin|combo|button|string)(?: (.*))?$/);
  if (!match) return null;
  const option = { type: match[2] };
  const tail = match[3] || '';
  const fields = [...tail.matchAll(/(?:^| )(default|min|max|var)(?: |$)/g)];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const value = tail.slice(field.index + field[0].length, fields[i + 1]?.index ?? tail.length).trim();
    if (field[1] === 'var') (option.vars ||= []).push(value);
    else if (field[1] === 'min' || field[1] === 'max') option[field[1]] = Number(value);
    else if (option.type === 'spin') option.default = Number(value);
    else if (option.type === 'check') option.default = value === 'true';
    else option.default = value;
  }
  return { name: match[1], ...option };
}

function parseInfo(line) {
  if (!/^info (?:depth|seldepth|score|nodes|time|multipv)\b/.test(line)) return null;
  const multipv = line.match(/\bmultipv (\d+)/);
  if (multipv && Number(multipv[1]) !== 1) return null;
  const info = { raw: line };
  for (const key of ['depth', 'seldepth', 'nodes', 'nps', 'time']) {
    const match = line.match(new RegExp(`\\b${key} (\\d+)`));
    if (match) info[key] = Number(match[1]);
  }
  const score = line.match(/\bscore (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/);
  if (score) {
    info.score = { type: score[1], value: Number(score[2]) };
    if (score[3]) info.score.bound = score[3];
  }
  const pv = line.match(/\bpv (.+)$/);
  if (pv) info.pv = pv[1].trim().split(/\s+/);
  return info;
}

/** A single persistent process. Protocol failures abort a run; they are never chess losses. */
class UciEngine {
  constructor({ path, variantPath, variant = 'chess', options = {} } = {}) {
    this.path = commandText(path, 'engine path');
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(variant)) throw new Error('Invalid engine variant.');
    this.variant = variant;
    this.variantPath = variantPath === undefined ? undefined : commandText(variantPath, 'variant path');
    this.options = { ...options };
    if (options.skill !== undefined && options.elo !== undefined) throw new Error('Choose skill or Elo, not both.');
    if (options.skill !== undefined) integer(options.skill, 'skill level', 0, 20);
    if (options.elo !== undefined) integer(options.elo, 'Elo');
    integer(options.threads ?? 1, 'thread count');
    integer(options.hash ?? 32, 'hash size');
    this.timeoutMs = integer(options.timeoutMs ?? 30000, 'engine timeout', 1, 3600000);
    this.state = 'new';
    this.metadata = null;
    this.child = null;
    this._busy = false;
    this._pending = null;
    this._buffer = '';
    this._decoder = new StringDecoder('utf8');
    this._fatalError = null;
    this._closed = Promise.resolve();
  }

  async _run(signal, operation) {
    if (this._busy) throw new Error('An engine operation is already in progress.');
    if (this.state === 'closed') throw this._fatalError || new Error('Engine is closed.');
    this._busy = true;
    const abort = () => this._fail(cancelled());
    try {
      if (signal?.aborted) { abort(); throw this._fatalError; }
      signal?.addEventListener('abort', abort, { once: true });
      return await operation();
    } catch (error) {
      this._fail(error);
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      this._busy = false;
    }
  }

  _spawn() {
    this.child = childProcess.spawn(this.path, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const child = this.child;
    this._closed = new Promise(resolve => {
      child.once('close', () => {
        resolve();
        if (this.state !== 'closed') this._fail(new Error('Engine exited before completing the operation.'));
      });
    });
    child.once('error', error => this._fail(new Error(`Cannot launch engine: ${error.message}`)));
    child.stdin.on('error', () => this._fail(new Error('Engine input connection closed.')));
    child.stdout.on('error', () => this._fail(new Error('Engine output connection closed.')));
    // Always drain stderr. Engine diagnostics are not match results.
    child.stderr.resume();
    child.stdout.on('data', chunk => {
      if (this.state === 'closed') return;
      this._buffer += this._decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      let newline;
      while ((newline = this._buffer.indexOf('\n')) !== -1 && this.state !== 'closed') {
        if (newline > MAX_LINE) { this._fail(new Error('Engine output line is too long.')); return; }
        const line = this._buffer.slice(0, newline).replace(/\r$/, '').trim();
        this._buffer = this._buffer.slice(newline + 1);
        const pending = this._pending;
        if (!pending) continue;
        pending.bytes += newline + 1;
        if (pending.bytes > MAX_OUTPUT) { this._fail(new Error('Engine output limit exceeded.')); return; }
        try { pending.receive(line); } catch (error) { this._fail(error); }
      }
      if (this._buffer.length > MAX_LINE) this._fail(new Error('Engine output line is too long.'));
    });
  }

  _send(command) {
    if (this.state === 'closed') throw this._fatalError || new Error('Engine is closed.');
    if (!this.child?.stdin.writable || this.child.stdin.destroyed) throw new Error('Engine input connection closed.');
    this.child.stdin.write(`${command}\n`);
  }

  _fail(error) {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this._fatalError = error;
    const pending = this._pending;
    this._pending = null;
    pending?.reject(error);
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGKILL');
    }
  }

  _exchange(commands, receive, timeoutMs = this.timeoutMs) {
    if (this.state === 'closed') return Promise.reject(this._fatalError || new Error('Engine is closed.'));
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        if (this._pending !== pending) return;
        clearTimeout(timer);
        this._pending = null;
        error ? reject(error) : resolve(value);
      };
      const pending = { bytes: 0, receive: line => receive(line, value => finish(null, value)), reject: error => { clearTimeout(timer); reject(error); } };
      const timer = setTimeout(() => this._fail(new Error('Engine operation timed out; match was not scored.')), timeoutMs);
      this._pending = pending;
      try { for (const command of commands) this._send(command); } catch (error) { this._fail(error); }
    });
  }

  async _uci() {
    const metadata = { idname: 'Unknown UCI engine', idauthor: '', options: {}, variant: this.variant };
    await this._exchange(['uci'], (line, done) => {
      if (line.startsWith('id name ')) metadata.idname = line.slice(8);
      if (line.startsWith('id author ')) metadata.idauthor = line.slice(10);
      const option = parseOption(line);
      if (option) {
        const { name, ...details } = option;
        metadata.options[name] = details;
      }
      if (line === 'uciok') done();
    });
    return metadata;
  }

  _spin(name, value) {
    const option = this.metadata.options[name];
    if (!option || option.type !== 'spin' || !Number.isFinite(option.min) || !Number.isFinite(option.max)) {
      throw new Error(`Engine does not advertise a supported ${name} option.`);
    }
    if (value < option.min || value > option.max) {
      throw new Error(`${name} must be between ${option.min} and ${option.max} for this engine.`);
    }
    return `setoption name ${name} value ${value}`;
  }

  async start({ signal } = {}) {
    return this._run(signal, async () => {
      if (this.state !== 'new') throw new Error('Engine has already started.');
      this.state = 'starting';
      this._spawn();
      let metadata = await this._uci();
      if (this.variantPath) {
        if (!metadata.options.VariantPath) throw new Error('Engine does not support loading variant rules.');
        this._send(`setoption name VariantPath value ${this.variantPath}`);
        metadata = await this._uci();
      }
      this.metadata = metadata;
      const variants = metadata.options.UCI_Variant;
      if ((this.variant !== 'chess' || variants) && !variants?.vars?.includes(this.variant)) {
        throw new Error(`Engine does not advertise variant ${this.variant}.`);
      }
      const commands = [this._spin('Threads', this.options.threads ?? 1), this._spin('Hash', this.options.hash ?? 32)];
      if (variants) commands.push(`setoption name UCI_Variant value ${this.variant}`);
      const limitStrength = metadata.options.UCI_LimitStrength;
      if (this.options.elo !== undefined) {
        if (limitStrength?.type !== 'check') throw new Error('Engine does not support UCI_LimitStrength; Elo is unavailable.');
        commands.push(this._spin('UCI_Elo', this.options.elo), 'setoption name UCI_LimitStrength value true');
      } else {
        if (limitStrength?.type === 'check') commands.push('setoption name UCI_LimitStrength value false');
        commands.push(this._spin('Skill Level', this.options.skill ?? 20));
      }
      let selected = this.variant === 'chess';
      await this._exchange([...commands, 'isready'], (line, done) => {
        if (line.startsWith(`info string variant ${this.variant} `)) selected = true;
        if (line === 'readyok') {
          if (!selected) throw new Error(`Engine did not confirm selection of variant ${this.variant}.`);
          done();
        }
      });
      this.state = 'ready';
      return metadata;
    });
  }

  async newGame({ signal } = {}) {
    return this._run(signal, async () => {
      this._requireReady();
      const commands = [];
      if (this.metadata.options['Clear Hash']?.type === 'button') commands.push('setoption name Clear Hash');
      commands.push('ucinewgame', 'isready');
      await this._exchange(commands, (line, done) => { if (line === 'readyok') done(); });
    });
  }

  _requireReady() {
    if (this.state !== 'ready') throw new Error('Engine has not completed startup.');
  }

  async search({ fen, moves = [], nodes = 20000, movetimeMs, signal } = {}) {
    commandText(fen, 'position FEN');
    if (!Array.isArray(moves) || moves.length > 10000 || moves.some(move => typeof move !== 'string' || !MOVE.test(move))) throw new Error('Invalid move history.');
    const budget = movetimeMs === undefined ? `nodes ${integer(nodes, 'node budget')}` : `movetime ${integer(movetimeMs, 'move time')}`;
    return this._run(signal, async () => {
      this._requireReady();
      let info = null;
      return this._exchange([`position fen ${fen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`, `go ${budget}`], (line, done) => {
        const parsed = parseInfo(line);
        if (parsed) info = parsed;
        if (!line.startsWith('bestmove ')) return;
        const move = line.split(/\s+/)[1];
        if (move === '(none)' || move === '0000') done({ move: null, info });
        else if (MOVE.test(move || '')) done({ move, info });
        else throw new Error('Engine returned an invalid UCI move.');
      }, movetimeMs === undefined ? this.timeoutMs : Math.max(this.timeoutMs, movetimeMs + 5000));
    });
  }

  async perft({ fen, signal } = {}) {
    commandText(fen, 'position FEN');
    return this._run(signal, async () => {
      this._requireReady();
      const moves = new Set();
      let ready = false;
      let complete = false;
      return this._exchange([`position fen ${fen}`, 'go perft 1', 'isready'], (line, done) => {
        const move = line.match(/^((?:[a-h][1-8][a-h][1-8][a-z]?|[A-Z]@[a-h][1-8])):\s+1$/);
        if (move) moves.add(move[1]);
        if (/^Nodes searched:\s*\d+$/.test(line)) complete = true;
        if (line === 'readyok') ready = true;
        // Perft is asynchronous: readyok alone does not finish the move list.
        if (ready && complete) done([...moves].sort());
      });
    });
  }

  /** Read the active variant's material tables without searching a position. */
  async pieceValues({ signal } = {}) {
    return this._run(signal, async () => {
      this._requireReady();
      let version = false;
      let complete = false;
      const pieces = {};
      try {
        // The ready barrier keeps trailing or duplicated diagnostic rows inside
        // this exchange instead of allowing them to leak into a later search.
        return await this._exchange(['levelupvalues', 'isready'], (line, done) => {
          if (!line) return;
          if (/Unknown command:.*levelupvalues/i.test(line)) throw new Error('Engine does not support the levelupvalues diagnostic.');
          if (line === 'levelupvalues version 1') {
            if (version || complete) throw new Error('Duplicate piece-value diagnostic version.');
            version = true;
            return;
          }
          if (line === 'levelupvalues done') {
            if (!version || complete || !Object.keys(pieces).length) throw new Error('Incomplete or duplicated piece-value diagnostic.');
            complete = true;
            return;
          }
          if (line === 'readyok') {
            if (!complete) throw new Error('Piece-value diagnostic ended before all values were reported.');
            done(Object.freeze({ version: 1, pieces: Object.freeze(pieces) }));
            return;
          }
          const row = line.match(/^levelupvalue ([a-zA-Z]) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)$/);
          if (!row || !version || complete) throw new Error('Unsupported or malformed piece-value diagnostic.');
          const [, letter, ...fields] = row;
          if (Object.hasOwn(pieces, letter)) throw new Error(`Duplicate piece-value diagnostic for ${letter}.`);
          const values = fields.map(value => integer(Number(value), 'reported piece value', 0, 10000000));
          pieces[letter] = Object.freeze(Object.fromEntries(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']
            .map((field, index) => [field, values[index]])));
        });
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error(`Cannot verify manual piece values: ${error.message} Use the bundled compatible LevelUp engine.`, { cause: error });
      }
    });
  }

  async close() {
    const child = this.child;
    if (!child) { this.state = 'closed'; return; }
    if (this._pending) this._fail(cancelled('Engine closed before operation completed.'));
    else if (this.state !== 'closed') {
      try { this._send('quit'); child.stdin.end(); } catch { /* Kill below if stdin is already closed. */ }
      this.state = 'closed';
    }
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 250);
    try { await this._closed; } finally { clearTimeout(timer); }
  }
}

module.exports = { UciEngine };
