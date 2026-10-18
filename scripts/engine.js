const { spawn } = require('node:child_process');
const path = require('node:path');
const { Chess } = require('chess.js');
const { capabilityProbes } = require('./engine-capabilities');

const enginePath = () => process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../stockfish/fairy-stockfish-levelup_x86-64.exe');
const variantPath = variant => path.resolve(__dirname, `../variants/${variant}.ini`);
const variants = ['chess', 'levelup-knight', 'levelup', 'levelup-v5'];
const levels = {
  easy: { skill: 0, time: 150 },
  medium: { skill: 8, time: 600 },
  hard: { skill: 20, time: 1500 },
};

// Standard games never need to initialize the optional WebAssembly rules library.
async function createPosition(fen, variant = 'chess') {
  if (variant === 'chess') return new Chess(fen);
  if (!variants.includes(variant)) throw new Error('Unsupported chess variant.');
  const { initVariantRules, VariantGame } = require('../dist/rules-node.cjs');
  await initVariantRules();
  return new VariantGame(fen, variant);
}

// Each request owns one process: cancellation cannot leak a move into a later game.
async function engineRequest({ fen, difficulty = 'medium', variant = 'chess', signal } = {}) {
  if (!variants.includes(variant) || !Object.hasOwn(levels, difficulty) || (fen !== undefined && (typeof fen !== 'string' || /[\r\n]/.test(fen)))) {
    throw new Error('Invalid engine request.');
  }
  const position = fen ? await createPosition(fen, variant) : null;
  const probes = capabilityProbes(fen, variant);
  return new Promise((resolve, reject) => {
    let child;
    let buffer = '';
    let name = 'Fairy Stockfish';
    let phase = 'uci';
    let advertisedVariant = false;
    let selectedVariant = false;
    let settled = false;
    let probeIndex = 0;
    let probeMoves = new Set();
    let probeReady = false;
    let probeDone = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      child?.kill();
      position?.dispose?.();
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(new Error('Engine search cancelled.'));
    const timer = setTimeout(() => finish(new Error(phase === 'probe'
      ? `Fairy Stockfish does not support ${probes[probeIndex].name}. Use the bundled LevelUp engine, or update FAIRY_STOCKFISH_PATH.`
      : 'Engine did not respond in time. Check the executable and try again.')), 10000);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      child = spawn(enginePath(), [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      finish(new Error('Cannot launch Fairy Stockfish. Check FAIRY_STOCKFISH_PATH.'));
      return;
    }
    const send = command => { if (!settled && !child.stdin.destroyed) child.stdin.write(command + '\n'); };
    const configure = () => {
      phase = 'ready';
      send('setoption name Threads value 1');
      send('setoption name Hash value 16');
      send(`setoption name UCI_Variant value ${variant}`);
      send(`setoption name Skill Level value ${levels[difficulty].skill}`);
      send('isready');
    };
    const advance = () => {
      const probe = probes[probeIndex];
      if (probe) {
        phase = 'probe';
        probeMoves = new Set();
        probeReady = false;
        probeDone = false;
        send(`position fen ${probe.fen}`);
        send('go perft 1');
        send('isready');
      } else {
        phase = 'search';
        send('ucinewgame');
        send(`position fen ${fen}`);
        send(`go movetime ${levels[difficulty].time}`);
      }
    };
    const completeProbe = () => {
      // Perft runs on a worker: readyok can arrive before its move list.
      if (!probeReady || !probeDone) return;
      const probe = probes[probeIndex];
      if (!probe.required.every(move => probeMoves.has(move)) || probe.forbidden.some(move => probeMoves.has(move))) {
        finish(new Error(`Fairy Stockfish does not support ${probe.name}. Use the bundled LevelUp engine, or update FAIRY_STOCKFISH_PATH.`));
        return;
      }
      probeIndex++;
      advance();
    };
    child.on('error', () => finish(new Error('Cannot launch Fairy Stockfish. Run npm.cmd start on Windows, or set FAIRY_STOCKFISH_PATH to a compatible engine.')));
    child.stdin.on('error', () => finish(new Error('Engine connection closed.')));
    child.on('exit', () => finish(new Error(phase === 'probe'
      ? `Fairy Stockfish exited while checking ${probes[probeIndex].name}. Use the bundled LevelUp engine, or update FAIRY_STOCKFISH_PATH.`
      : 'Fairy Stockfish exited before completing the request.')));
    // Drain stderr, but never expose local paths or arbitrary executable output to the client.
    child.stderr.resume();
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > 1048576) { finish(new Error('Unexpected engine output.')); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1 && !settled) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('id name ')) name = line.slice(8).slice(0, 120);
        if (phase === 'variant-options' && line.startsWith('option name UCI_Variant ') && line.split(' var ').slice(1).includes(variant)) advertisedVariant = true;
        if (phase === 'ready' && line.startsWith(`info string variant ${variant} `)) selectedVariant = true;
        if (phase === 'probe') {
          const move = line.match(/^([a-h][1-8][a-h][1-8][a-z]*):\s+1$/);
          if (move) probeMoves.add(move[1]);
          if (/^Nodes searched:\s*\d+$/.test(line)) { probeDone = true; completeProbe(); continue; }
        }
        if (line === 'uciok' && phase === 'uci') {
          if (variant === 'chess') configure();
          else {
            phase = 'variant-options';
            // Reload the advertised options after VariantPath has registered the rules.
            send(`setoption name VariantPath value ${variantPath(variant)}`);
            send('uci');
          }
        } else if (line === 'uciok' && phase === 'variant-options') {
          if (!advertisedVariant) { finish(new Error('Fairy Stockfish could not load the piece-upgrade rules. Update the engine and try again.')); continue; }
          configure();
        } else if (line === 'readyok' && phase === 'ready') {
          if (variant !== 'chess' && !selectedVariant) { finish(new Error('Fairy Stockfish did not select the piece-upgrade rules. Update the engine and try again.')); continue; }
          if (!fen) { finish(null, { name }); continue; }
          advance();
        } else if (line === 'readyok' && phase === 'probe') {
          probeReady = true;
          completeProbe();
        } else if (line.startsWith('bestmove ') && phase === 'search') {
          const move = line.split(/\s+/)[1];
          if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move || '')) { finish(new Error('Engine returned no playable move.')); continue; }
          try {
            if (!position.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })) throw new Error();
            finish(null, { name, move });
          } catch { finish(new Error('Engine returned an illegal move.')); }
        }
      }
    });
    send('uci');
  });
}
module.exports = { engineRequest, createPosition, levels, variants };
