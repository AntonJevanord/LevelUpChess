const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { Chess } = require('chess.js');
const { capabilityProbes } = require('./engine-capabilities');
const { getPlayableProfile, getPlayableProfiles, getPlayableArtifacts } = require('./playable-profile');

const enginePath = () => process.env.FAIRY_STOCKFISH_PATH || path.resolve(__dirname, '../stockfish/fairy-stockfish-levelup_x86-64.exe');
const playableProfile = getPlayableProfile();
const playableProfiles = new Map(getPlayableProfiles().map(profile => [profile.variant, profile]));
const variantPath = variant => path.resolve(__dirname, '..', playableProfiles.has(variant) ? getPlayableArtifacts(variant).ini : `variants/${variant}.ini`);
const variants = ['chess', 'levelup-knight', 'levelup', 'levelup-v5', ...playableProfiles.keys()];
const profileProbes = new Map();
const PROFILE_RELOAD = 'Experimental rules changed. Run npm.cmd run build, restart npm.cmd start, and reload the game.';
const levels = {
  easy: { skill: 0, time: 150 },
  medium: { skill: 8, time: 600 },
  hard: { skill: 20, time: 1500 },
};

function profileError(code) {
  return Object.assign(new Error(PROFILE_RELOAD), { code });
}

function validateProfileIdentity(variant, { profileHash, registryHash } = {}) {
  const profile = playableProfiles.get(variant);
  if (typeof variant === 'string' && /^levelup-design-[a-f0-9]{20}$/.test(variant) && !profile) throw profileError('PROFILE_MISMATCH');
  if (profile) {
    if (profileHash !== profile.hash || registryHash !== profile.registryHash) throw profileError('PROFILE_MISMATCH');
    try {
      const artifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', getPlayableArtifacts(variant).json), 'utf8'));
      if (!isDeepStrictEqual(artifact, profile) || fs.readFileSync(variantPath(variant), 'utf8') !== profile.config) throw new Error();
    } catch { throw profileError('PROFILE_BUILD_REQUIRED'); }
  } else if (profileHash !== undefined || registryHash !== undefined) {
    throw new Error('Profile hashes require the matching experimental variant.');
  }
}

// Standard games never need to initialize the optional WebAssembly rules library.
async function createPosition(fen, variant = 'chess', metadata) {
  validateProfileIdentity(variant, metadata);
  if (!variants.includes(variant)) throw new Error('Unsupported chess variant.');
  if (variant === 'chess') return new Chess(fen);
  const { initVariantRules, VariantGame, SUPPORTED_VARIANTS } = require('../dist/rules-node.cjs');
  if (playableProfiles.has(variant) && !SUPPORTED_VARIANTS.includes(variant)) throw profileError('PROFILE_BUILD_REQUIRED');
  await initVariantRules(variant);
  return new VariantGame(fen, variant);
}

/** Expected legal sets come from the same compiled rules as the board. */
async function experimentalCapabilityProbes(fen, variant = playableProfile.variant) {
  const profile = playableProfiles.get(variant);
  if (!profile) throw new Error('Unsupported experimental profile.');
  const present = new Set(fen.split(' ')[0].toLowerCase());
  const ids = profile.registry.allocations.filter(({ letter }) => present.has(letter)).map(({ id }) => id).sort();
  const key = `${profile.hash}:${ids.join(',')}`;
  let pending = profileProbes.get(key);
  if (!pending) {
    pending = (async () => {
      const { initVariantRules, VariantGame } = require('../dist/rules-node.cjs');
      await initVariantRules(profile.variant);
      return profile.capabilityProbes.filter(probe => ids.some(id => probe.name.startsWith(`${id}:`)) || probe.name.startsWith('ordinary ')).map(probe => {
        const board = new VariantGame(probe.fen, profile.variant);
        try {
          return { ...probe, required: board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')).sort(), forbidden: [], exact: true };
        } finally { board.dispose(); }
      });
    })();
    profileProbes.set(key, pending);
    // A small picker can produce many armies; retain only recent probe sets.
    while (profileProbes.size > 32) profileProbes.delete(profileProbes.keys().next().value);
    pending.catch(() => { if (profileProbes.get(key) === pending) profileProbes.delete(key); });
  }
  return pending;
}

// Each request owns one process: cancellation cannot leak a move into a later game.
async function engineRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['fen', 'difficulty', 'variant', 'signal', 'profileHash', 'registryHash'].includes(key))) throw new Error('Invalid engine request.');
  const { fen, difficulty = 'medium', variant = 'chess', signal, profileHash, registryHash } = input;
  validateProfileIdentity(variant, { profileHash, registryHash });
  if (!variants.includes(variant) || !Object.hasOwn(levels, difficulty) || (fen !== undefined && (typeof fen !== 'string' || /[\r\n]/.test(fen)))) {
    throw new Error('Invalid engine request.');
  }
  if (signal?.aborted) throw new Error('Engine search cancelled.');
  const position = fen ? await createPosition(fen, variant, { profileHash, registryHash }) : null;
  let probes;
  try {
    probes = fen && playableProfiles.has(variant) ? await experimentalCapabilityProbes(fen, variant) : capabilityProbes(fen, variant);
    if (signal?.aborted) throw new Error('Engine search cancelled.');
  } catch (error) { position?.dispose?.(); throw error; }
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
      if (!probe.required.every(move => probeMoves.has(move)) || probe.forbidden.some(move => probeMoves.has(move)) || probe.exact && probeMoves.size !== probe.required.length) {
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
module.exports = { engineRequest, createPosition, levels, variants, validateProfileIdentity, experimentalCapabilityProbes };
