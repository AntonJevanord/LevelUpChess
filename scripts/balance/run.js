const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { UciEngine } = require('./uci');
const { openStore } = require('./storage');
const { summarize } = require('./stats');
const { checkCapabilities } = require('./capabilities');
const { storageCompatibleManifest } = require('./resume-compatibility');

const FINAL = new Set(['completed', 'truncated']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => sha256(JSON.stringify(value));

function checkAbort(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Balance run cancelled.');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  throw error;
}

function gameSides(game) {
  const { comparison, aColor } = game;
  const a = { army: comparison.armyA, strength: comparison.strengthA, contestant: 'A' };
  const b = { army: comparison.armyB, strength: comparison.strengthB, contestant: 'B' };
  return aColor === 'w' ? { white: a, black: b } : { white: b, black: a };
}

function kingPair(sides) {
  return { whiteKing: sides.white.army.upgrades.e1 || 0, blackKing: sides.black.army.upgrades.e1 || 0 };
}

function replay(board, moves, { rejectTerminal = false } = {}) {
  const sans = [];
  if (rejectTerminal && board.outcome()) throw new Error('Opening starts in a terminal position.');
  for (const move of moves) {
    if (board.outcome()) throw new Error('Recorded move history continues after a terminal position.');
    sans.push(board.san(move));
    if (!board.push(move)) throw new Error(`Illegal opening or recorded move: ${move}.`);
    if (rejectTerminal && board.outcome()) throw new Error('Opening prefix reaches a terminal position.');
  }
  return sans;
}

function recoverHistory(game, startFen, checkpoint, records) {
  const candidates = records.filter(record => record.id === game.id && ['aborted', 'error'].includes(record.status));
  if (checkpoint?.id === game.id) candidates.push(checkpoint);
  let saved = null;
  for (const candidate of candidates) {
    if (candidate.startFen !== startFen || !Array.isArray(candidate.moves) || !Number.isSafeInteger(candidate.attempt) || candidate.attempt < 1) {
      throw new Error('Saved game history does not match the planned game.');
    }
    if (!saved || candidate.attempt > saved.attempt) saved = candidate;
    else if (candidate.attempt === saved.attempt) {
      const shorter = candidate.moves.length < saved.moves.length ? candidate : saved;
      const longer = shorter === candidate ? saved : candidate;
      if (shorter.moves.some((move, index) => move !== longer.moves[index])) throw new Error('Checkpoint and journal contain conflicting histories for the same attempt.');
      saved = longer;
    }
  }
  return saved;
}

function pgnEscape(value) {
  return String(value ?? '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderPgn(records, name) {
  return records.map(record => {
    const result = record.status === 'completed' ? record.result : '*';
    const strength = side => {
      const choice = record[`${side}Strength`] || {};
      return choice.elo === undefined ? `skill ${choice.skill ?? 20}` : `UCI Elo ${choice.elo}`;
    };
    const white = record.aColor === 'w' ? 'A' : 'B';
    const tags = {
      Event: name, Site: 'Local', Date: (record.startedAt || '').slice(0, 10).replace(/-/g, '.'),
      Round: `${(record.scheduleIndex ?? 0) + 1}.${record.attempt}`,
      White: `${record.comparisonId} ${white} (${strength('white')})`,
      Black: `${record.comparisonId} ${white === 'A' ? 'B' : 'A'} (${strength('black')})`,
      Result: result, Variant: record.variant, SetUp: '1', FEN: record.startFen,
      GameId: record.id, PairId: record.pairId, Attempt: record.attempt,
      Status: record.status, Termination: record.reason,
    };
    const tokens = [];
    const fields = (record.startFen || '').split(' ');
    let number = Number(fields[5]) || 1;
    let turn = fields[1] || 'w';
    for (const san of record.sans || []) {
      if (turn === 'w') tokens.push(`${number}.`, san);
      else {
        if (!tokens.length) tokens.push(`${number}...`);
        tokens.push(san);
        number++;
      }
      turn = turn === 'w' ? 'b' : 'w';
    }
    tokens.push(result);
    return Object.entries(tags).map(([key, value]) => `[${key} "${pgnEscape(value)}"]`).join('\n') + '\n\n' + tokens.join(' ') + '\n';
  }).join('\n');
}

/**
 * Sequential color-swapped matches. maxPlies includes forced opening plies.
 * Only rules-declared outcomes are scored; limits/errors/cancellation are '*'.
 */
async function runMatches({ config, schedule, outDir, resume = false, enginePath, signal, shouldStop = () => null, onProgress = () => {} }) {
  if (!config || !Array.isArray(schedule) || !schedule.length) throw new Error('A normalized config and nonempty schedule are required.');
  const directory = path.resolve(outDir);
  const rulesFile = path.resolve(__dirname, '../../dist/balance-rules.cjs');
  let store;
  let nextIndex = 0;
  const emptySummary = () => ({ ...summarize([]), scheduledGames: schedule.length, nextIndex });
  const response = (stopped, summary) => ({ stopped, nextIndex, scheduledGames: schedule.length, summary, outDir: directory });
  if (signal?.aborted) return response(true, emptySummary());
  const nodeRequire = createRequire(__filename);
  let createMatchRules;
  try { ({ createMatchRules } = nodeRequire(rulesFile)); }
  catch (error) { throw new Error('Balance rules are not built. Run npm.cmd run build first.', { cause: error }); }
  const bundleHash = sha256(fs.readFileSync(rulesFile));
  const engineSha256 = sha256(fs.readFileSync(enginePath));
  const runnerSources = ['run.js', 'plan.js', 'stats.js', 'storage.js', 'uci.js', 'capabilities.js', '../engine-capabilities.js', 'files.js', 'resume-compatibility.js']
    .map(file => ({ file, sha256: sha256(fs.readFileSync(path.resolve(__dirname, file), 'utf8').replace(/\r\n/g, '\n')) }));
  const runnerSha256 = fingerprint(runnerSources);
  const profiles = new Map();

  const saveReports = () => {
    const summary = { ...summarize(store.records), runId: store.manifest.runId, scheduledGames: schedule.length, nextIndex };
    store.saveSummary(summary);
    store.savePgn(renderPgn(store.records, config.name));
    return summary;
  };
  const finished = () => new Set(store.records.filter(record => FINAL.has(record.status)).map(record => record.id));
  const advance = () => {
    const done = finished();
    while (nextIndex < schedule.length && done.has(schedule[nextIndex].id)) nextIndex++;
  };
  const engineOptions = strength => ({ ...strength, threads: config.engine.threads, hash: config.engine.hashMb });
  const newEngine = (profile, strength) => new UciEngine({
    path: enginePath, variant: profile.variant,
    variantPath: path.join(directory, 'rules', `${profile.variant}.ini`),
    options: engineOptions(strength),
  });

  try {
    onProgress('Preflight: checking every army, king profile, and opening prefix.');
    const profileGames = new Map();
    for (const game of schedule) {
      checkAbort(signal);
      const pair = kingPair(gameSides(game));
      const key = `${pair.whiteKing}-${pair.blackKing}`;
      if (!profileGames.has(key)) profileGames.set(key, { pair, games: [] });
      profileGames.get(key).games.push(game);
    }
    // A WASM instance owns its movement tables. Validate one whole profile at
    // a time so the two-profile cache is not repeatedly evicted by the seeded
    // game order; the actual matches retain their original shuffled order.
    for (const [key, { pair, games }] of profileGames) {
      checkAbort(signal);
      const rules = await createMatchRules(pair);
      checkAbort(signal);
      const startFens = new Set();
      const proofs = new Set();
      for (const game of games) {
        checkAbort(signal);
        const sides = gameSides(game);
        const proofKey = fingerprint({ white: sides.white.army, black: sides.black.army, opening: game.openingMoves });
        if (proofs.has(proofKey)) continue;
        const startFen = rules.startingFen(sides.white.army, sides.black.army);
        startFens.add(startFen);
        const board = rules.createBoard(startFen);
        try {
          if (game.openingMoves.length >= config.engine.maxPlies) throw new Error(`Opening ${game.openingId} reaches the total-ply limit before engine play.`);
          replay(board, game.openingMoves, { rejectTerminal: true });
        } catch (error) { throw new Error(`Preflight failed for ${game.id}: ${error.message}`, { cause: error }); }
        finally { board.dispose(); }
        proofs.add(proofKey);
      }
      profiles.set(key, {
        ...pair, variant: rules.variant, config: rules.config, royalMode: rules.royalMode,
        evaluationCaveat: rules.evaluationCaveat, startFens: [...startFens],
      });
    }
    checkAbort(signal);
    const orderedProfiles = [...profiles.values()].sort((a, b) => a.variant.localeCompare(b.variant));
    const configHash = fingerprint({ config, schedule });
    const rulesHash = fingerprint({ bundleHash, runnerSha256, profiles: orderedProfiles.map(profile => ({ variant: profile.variant, config: profile.config })) });
    const manifest = {
      schemaVersion: 1, runId: randomUUID(), createdAt: new Date().toISOString(), configHash, rulesHash, engineSha256,
      config, schedule, enginePath: path.resolve(enginePath), rulesBundleSha256: bundleHash, runnerSha256, runnerSources,
      plyLimitBasis: 'total plies, including forced opening prefix',
      rulesProfiles: orderedProfiles.map(profile => ({
        variant: profile.variant, whiteKing: profile.whiteKing, blackKing: profile.blackKing,
        configSha256: sha256(profile.config), file: `rules/${profile.variant}.ini`,
        royalMode: profile.royalMode, evaluationCaveat: profile.evaluationCaveat,
      })),
    };
    let acceptedManifest = manifest;
    if (resume) {
      const original = JSON.parse(fs.readFileSync(path.join(directory, 'run.json'), 'utf8'));
      // Exact source fingerprints approve this recovery-only patch. Keeping
      // the allowlist outside its own fingerprint avoids a circular hash.
      const patch = require('./storage-patch.json');
      acceptedManifest = storageCompatibleManifest({
        original, requested: manifest, profiles: orderedProfiles,
        approvals: patch.fromRunnerSha256.map(fromRunnerSha256 => ({ fromRunnerSha256, toRunnerSha256: patch.toRunnerSha256 })),
      });
    }
    store = openStore({ outDir: directory, resume, manifest: acceptedManifest });
    if (acceptedManifest !== manifest) {
      store.saveResumeAudit({ schemaVersion: 1, resumedAt: new Date().toISOString(), runId: store.manifest.runId,
        originalRunnerSha256: store.manifest.runnerSha256, currentRunnerSha256: runnerSha256,
        reason: 'Reviewed Windows storage retry and interrupted-history recovery patch; engine, movement rules, and experiment settings are unchanged.' });
      onProgress('Resuming with the compatible storage patch; original run identity and results are preserved.');
    }
    for (const profile of orderedProfiles) {
      if (profile.evaluationCaveat) onProgress(`Warning: ${profile.variant}: ${profile.evaluationCaveat}`);
    }
    fs.mkdirSync(path.join(directory, 'rules'), { recursive: true });
    for (const profile of orderedProfiles) {
      const file = path.join(directory, 'rules', `${profile.variant}.ini`);
      if (fs.existsSync(file)) {
        if (sha256(fs.readFileSync(file)) !== sha256(profile.config)) throw new Error(`Saved rules differ for ${profile.variant}; refusing to overwrite them.`);
      } else fs.writeFileSync(file, profile.config, { flag: 'wx' });
    }
    advance();
    const checkpoint = store.checkpoint;
    if (checkpoint && (!Number.isSafeInteger(checkpoint.nextIndex) || checkpoint.nextIndex < 0 || checkpoint.nextIndex > schedule.length)) {
      throw new Error('Invalid run checkpoint index.');
    }
    if (nextIndex >= schedule.length) return response(false, saveReports());
    checkAbort(signal);
    onProgress('Preflight: validating all requested engine strength settings.');
    const strengths = new Map();
    for (const comparison of config.comparisons) {
      for (const strength of [comparison.strengthA, comparison.strengthB]) strengths.set(fingerprint(strength), strength);
    }
    for (const strength of strengths.values()) {
      checkAbort(signal);
      const engine = newEngine(orderedProfiles[0], strength);
      try { await engine.start({ signal }); }
      finally { await engine.close(); }
    }
    for (const profile of orderedProfiles) {
      checkAbort(signal);
      onProgress(`Preflight: checking native movement capabilities for ${profile.variant}.`);
      const rules = await createMatchRules({ whiteKing: profile.whiteKing, blackKing: profile.blackKing });
      const engine = newEngine(profile, { skill: 20 });
      try {
        await engine.start({ signal });
        const result = await checkCapabilities({
          engine, rules, startFens: profile.startFens,
          whiteKing: profile.whiteKing, blackKing: profile.blackKing, signal,
        });
        onProgress(`Preflight: ${profile.variant} passed ${result.probes} movement checks.`);
      } finally { await engine.close(); }
    }

    while (nextIndex < schedule.length) {
      checkAbort(signal);
      const index = nextIndex;
      const game = schedule[index];
      const sides = gameSides(game);
      const pair = kingPair(sides);
      const profile = profiles.get(`${pair.whiteKing}-${pair.blackKing}`);
      const rules = await createMatchRules(pair);
      checkAbort(signal);
      const startFen = rules.startingFen(sides.white.army, sides.black.army);
      const saved = resume ? recoverHistory(game, startFen, store.checkpoint?.current, store.records) : null;
      const priorAttempts = store.records.filter(record => record.id === game.id).map(record => record.attempt);
      const attempt = Math.max(0, saved?.attempt || 0, ...priorAttempts) + 1;
      const moves = saved ? [...saved.moves] : [...game.openingMoves];
      if (moves.length < game.openingMoves.length || game.openingMoves.some((move, i) => moves[i] !== move)) throw new Error('Checkpoint does not preserve the forced opening prefix.');
      const board = rules.createBoard(startFen);
      let sans;
      try {
        sans = replay(board, moves);
        if (saved?.finalFen && saved.finalFen !== board.fen()) throw new Error('Journal final position does not match its move history.');
      }
      catch (error) { board.dispose(); throw new Error(`Cannot replay checkpoint for ${game.id}: ${error.message}`, { cause: error }); }
      const startedAt = new Date().toISOString();
      const engines = [];
      const names = {};
      const lastInfo = {};
      let finalized = false;
      const persistCurrent = () => store.saveCheckpoint({ schemaVersion: 1, nextIndex, current: { id: game.id, startFen, moves, sans, attempt } });
      const record = (status, outcome) => ({
        schemaVersion: 1, id: game.id, pairId: game.pairId, comparisonId: game.comparisonId,
        comparisonLabel: game.comparison.label, openingId: game.openingId, repetition: game.repetition,
        scheduleIndex: index, aColor: game.aColor, attempt, status,
        result: status === 'completed' ? outcome.result : '*', reason: outcome.reason,
        startedAt, finishedAt: new Date().toISOString(), variant: profile.variant,
        startFen, finalFen: board.fen(), moves: [...moves], sans: [...sans], openingMoves: [...game.openingMoves],
        openingPlies: game.openingMoves.length, totalPlies: moves.length, playedPlies: moves.length - game.openingMoves.length,
        whiteStrength: sides.white.strength, blackStrength: sides.black.strength,
        engineNames: names, lastInfo, engine: config.engine,
        royalMode: profile.royalMode, evaluationCaveat: profile.evaluationCaveat,
      });
      try {
        persistCurrent();
        onProgress(`Starting game ${index + 1}/${schedule.length}: ${game.id} (attempt ${attempt}).`);
        checkAbort(signal);
        let outcome = board.outcome();
        if (!outcome && moves.length < config.engine.maxPlies) {
          for (const [color, side] of [['w', sides.white], ['b', sides.black]]) {
            const engine = newEngine(profile, side.strength);
            engines.push(engine);
            const metadata = await engine.start({ signal });
            names[color] = metadata.idname;
            await engine.newGame({ signal });
            const nativeLegal = await engine.perft({ fen: board.fen(), signal });
            const wasmLegal = [...board.moves()].sort();
            if (JSON.stringify(nativeLegal) !== JSON.stringify(wasmLegal)) throw new Error(`Native engine and rules disagree on legal moves for ${game.id} (${color}).`);
          }
        }
        while (!outcome && moves.length < config.engine.maxPlies) {
          checkAbort(signal);
          const color = board.turn();
          const engine = engines[color === 'w' ? 0 : 1];
          const search = await engine.search({ fen: startFen, moves, nodes: config.engine.nodes, movetimeMs: config.engine.movetimeMs, signal });
          checkAbort(signal);
          if (!search.move || !board.moves().includes(search.move)) throw new Error(`Engine returned an illegal or missing move for ${game.id}.`);
          const san = board.san(search.move);
          if (!board.push(search.move)) throw new Error(`Rules refused engine move ${search.move}.`);
          moves.push(search.move);
          sans.push(san);
          lastInfo[color] = search.info;
          persistCurrent();
          onProgress(`Game ${game.id}: ply ${moves.length}, ${search.move} (${san}).`);
          checkAbort(signal);
          outcome = board.outcome();
        }
        const status = outcome ? 'completed' : 'truncated';
        const result = record(status, outcome || { reason: 'max-plies' });
        store.append(result);
        finalized = true;
        nextIndex++;
        advance();
        store.saveCheckpoint({ schemaVersion: 1, nextIndex, current: null });
        saveReports();
        onProgress(`Finished ${game.id}: ${result.result} (${result.reason}).`);
      } catch (error) {
        // Once the final journal line is durable, later reporting failures must
        // not invent a second attempt outcome or replace its checkpoint.
        if (finalized) throw error;
        const aborted = signal?.aborted || error.name === 'AbortError';
        let summary;
        try {
          store.append(record(aborted ? 'aborted' : 'error', { reason: aborted ? 'cancelled' : error.message }));
          persistCurrent();
          summary = saveReports();
        } catch (recoveryError) {
          error.recoveryError = recoveryError;
          throw error;
        }
        if (aborted) return response(true, summary);
        throw error;
      } finally {
        await Promise.allSettled(engines.map(engine => engine.close()));
        board.dispose();
      }
      const mode = shouldStop();
      if (mode === 'game' || (mode === 'pair' && schedule[nextIndex]?.pairId !== game.pairId)) {
        return response(nextIndex < schedule.length, saveReports());
      }
    }
    return response(false, saveReports());
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') return response(true, store ? saveReports() : emptySummary());
    throw error;
  } finally { store?.close(); }
}

module.exports = { runMatches, recoverHistory };
