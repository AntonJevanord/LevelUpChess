'use strict';

// Bounded head-to-head collector. Experiment policy, identity and native diagnostics
// are supplied explicitly; durable writes use the established run-store recovery.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { openStore } = require('./storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');
const { UciEngine } = require('./uci');

const ROOT = path.resolve(__dirname, '../..');
const FINAL = new Set(['completed', 'truncated']);
const STATUSES = new Set([...FINAL, 'aborted', 'error']);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => sha256(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));
const json = value => JSON.stringify(value, null, 2) + '\n';

function abortIfNeeded(signal) {
  if (signal?.aborted) { const error = new Error('Collection cancelled.'); error.name = 'AbortError'; throw error; }
}

function validateCollectionPlan(plan, validatePlan) {
  if (typeof validatePlan !== 'function') throw new Error('An explicit validatePlan callback is required.');
  validatePlan(plan);
  if (!plan || plan.schemaVersion !== 1 || !Array.isArray(plan.schedule) || !plan.schedule.length
    || !Array.isArray(plan.units) || !plan.units.length) throw new Error('A nonempty version 1 head collection plan is required.');
  const games = new Map();
  for (const game of plan.schedule) {
    if (!game || typeof game.id !== 'string' || !game.id || games.has(game.id) || game.kind !== 'head') {
      throw new Error('Head collection schedule requires unique head game identities.');
    }
    games.set(game.id, game);
  }
  const assigned = new Set(), unitIds = new Set();
  for (const unit of plan.units) {
    if (!unit || typeof unit.id !== 'string' || !unit.id || unitIds.has(unit.id)
      || !Array.isArray(unit.gameIds) || !unit.gameIds.length) throw new Error('Invalid head collection unit.');
    unitIds.add(unit.id);
    for (const id of unit.gameIds) {
      const game = games.get(id);
      if (!game || assigned.has(id) || game.unitId !== unit.id || game.pairId !== unit.id) {
        throw new Error('Head collection units must partition their scheduled games.');
      }
      assigned.add(id);
    }
  }
  if (assigned.size !== games.size) throw new Error('Head collection units must cover every scheduled game.');
  evidenceDefinitions(plan);
  return games;
}

function invocationPrefix(plan, untilGames) {
  const count = untilGames ?? plan.schedule.length;
  if (!Number.isSafeInteger(count) || count < 1 || count > plan.schedule.length) throw new Error('untilGames must select a bounded scheduled prefix.');
  if (!plan.study.checkpoints.includes(count)) throw new Error('Head collections stop only at their declared game checkpoints.');
  const ids = new Set(plan.schedule.slice(0, count).map(game => game.id));
  const units = plan.units.filter(unit => {
    const membership = unit.gameIds.map(id => ids.has(id));
    if (membership.some(Boolean) && !membership.every(Boolean)) throw new Error('untilGames cannot split a collection unit.');
    return membership[0];
  });
  return { count, ids, units };
}

function readHeadManifest(directory, validatePlan) {
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const run = read('run.json');
  if (run.format !== 'levelup-head-collection' || run.schemaVersion !== 1) throw new Error('This is not a head collection directory.');
  if (fs.existsSync(path.join(directory, 'collection.json')) && !isDeepStrictEqual(run, read('collection.json'))) throw new Error('Collection and run manifests disagree.');
  validateCollectionPlan(run.plan, validatePlan);
  validateEvidenceSnapshots(directory, run.plan, { allowMissing: journalRecords(directory).length === 0 });
  return run;
}

function writeSnapshot(file, content) {
  if (fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'))) throw new Error(`Frozen snapshot differs: ${path.basename(file)}.`);
    return;
  }
  const directory = path.dirname(file), temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content); fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
    try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { unlinkWithRetrySync(temporary); }
  }
}

function evidenceDefinitions(plan) {
  const definitions = plan.evidence ?? [];
  if (!Array.isArray(definitions)) throw new Error('Collection evidence must be an array.');
  const names = new Set();
  for (const item of definitions) {
    if (!item || typeof item.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.name)
      || item.name.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(item.name)
      || names.has(item.name.toLowerCase())) throw new Error('Evidence names must be safe, distinct relative basenames.');
    if (typeof item.file !== 'string' || !item.file || item.file.includes('\0')
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Evidence requires a source file and SHA-256 hash.');
    names.add(item.name.toLowerCase());
  }
  return definitions;
}

function evidenceBytes(plan) {
  return evidenceDefinitions(plan).map(item => {
    const bytes = fs.readFileSync(path.resolve(ROOT, item.file));
    if (sha256(bytes) !== item.sha256) throw new Error(`Frozen evidence source hash changed: ${item.name}.`);
    return { ...item, bytes };
  });
}

function validateEvidenceSnapshots(directory, plan, { allowMissing = false } = {}) {
  for (const item of evidenceDefinitions(plan)) {
    const file = path.join(directory, 'evidence', item.name);
    if (!fs.existsSync(file)) {
      if (allowMissing) continue;
      throw new Error(`Missing frozen evidence snapshot: ${item.name}.`);
    }
    if (sha256(fs.readFileSync(file)) !== item.sha256) throw new Error(`Frozen evidence snapshot changed: ${item.name}.`);
  }
}

function journalRecords(directory) {
  const file = path.join(directory, 'games.jsonl');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
}

function replay(rules, game, state) {
  if (state.startFen !== game.startFen || !Number.isSafeInteger(state.attempt) || state.attempt < 1
    || !Array.isArray(state.moves) || !Array.isArray(state.sans) || state.moves.length !== state.sans.length) throw new Error(`Invalid saved history: ${game.id}.`);
  const board = rules.createBoard(game.startFen);
  try {
    for (let ply = 0; ply < state.moves.length; ply++) {
      if (board.outcome() || board.san(state.moves[ply]) !== state.sans[ply] || !board.push(state.moves[ply])) throw new Error(`Cannot replay saved collection history: ${game.id}.`);
    }
    if (state.finalFen && state.finalFen !== board.fen()) throw new Error(`Saved final FEN differs: ${game.id}.`);
    return board;
  } catch (error) { board.dispose(); throw error; }
}

function validateHistory(records, checkpoint, games, rules, plan) {
  const latest = new Map();
  const settings = { nodes: plan.settings.nodes, threads: 1, hashMb: plan.settings.hashMb, maxPlies: plan.settings.maxPlies };
  for (const record of records) {
    const game = games.get(record.id), prior = latest.get(record.id);
    if (!game || !STATUSES.has(record.status) || record.unitId !== game.unitId || record.kind !== game.kind
      || record.profileHash !== plan.profile.hash || record.registryHash !== plan.registry.hash
      || record.variant !== plan.profile.variant || record.registryReference !== 'collection.json#plan.registry'
      || ['designA', 'designB', 'whiteDesign', 'blackDesign'].some(field => record[field] !== game[field])
      || record.pairId !== game.pairId || record.aColor !== game.aColor || record.openingId !== game.openingId || record.comparisonId !== game.comparisonId
      || !isDeepStrictEqual(record.engine, settings) || !isDeepStrictEqual(record.whiteStrength, { skill: 20 })
      || !isDeepStrictEqual(record.blackStrength, { skill: 20 }) || record.royalMode !== 'king' || record.evaluationCaveat !== null
      || !isDeepStrictEqual(record.evaluation, plan.profile.evaluation) || record.totalPlies !== record.moves?.length || record.playedPlies !== record.moves?.length
      || record.moves?.length > plan.settings.maxPlies
      || record.openingPlies !== 0 || !isDeepStrictEqual(record.openingMoves, [])
      || prior && (FINAL.has(prior.status) || record.attempt <= prior.attempt
        || prior.moves.some((move, index) => record.moves[index] !== move))) throw new Error('Saved journal does not match the collection schedule or history.');
    const board = replay(rules, game, record);
    try {
      const outcome = board.outcome();
      if (record.status === 'completed' ? !isDeepStrictEqual(outcome, { result: record.result, reason: record.reason })
        : record.result !== '*' || record.status === 'truncated' && (record.moves.length !== plan.settings.maxPlies
          || record.reason !== 'max-plies' || outcome !== null)) throw new Error('Saved outcome does not match replayed history.');
    } finally { board.dispose(); }
    latest.set(game.id, record);
  }
  const active = checkpoint?.current || {};
  if (!active || typeof active !== 'object' || Array.isArray(active)) throw new Error('Invalid collection checkpoint.');
  const recovered = new Map();
  for (const [id, state] of Object.entries(active)) {
    const game = games.get(id), prior = latest.get(id);
    if (!game || state.id !== id || state.profileHash !== plan.profile.hash || state.registryHash !== plan.registry.hash
      || state.moves?.length > plan.settings.maxPlies) throw new Error('Checkpoint does not match collection identities or bounds.');
    const board = replay(rules, game, state); board.dispose();
    if (prior) {
      const shorter = prior.moves.length < state.moves.length ? prior : state;
      const longer = shorter === prior ? state : prior;
      if (shorter.moves.some((move, index) => longer.moves[index] !== move)
        || state.attempt > prior.attempt && state.moves.length < prior.moves.length
        || state.attempt < prior.attempt && state.moves.length > prior.moves.length
        || FINAL.has(prior.status) && state.attempt > prior.attempt) throw new Error('Checkpoint conflicts with its journal history.');
    }
    if (!prior || !FINAL.has(prior.status)) recovered.set(id, !prior || state.attempt > prior.attempt
      || state.attempt === prior.attempt && state.moves.length >= prior.moves.length ? state : prior);
  }
  for (const [id, record] of latest) if (!FINAL.has(record.status) && !recovered.has(id)) recovered.set(id, record);
  return recovered;
}

async function runHeadCollection({ plan, outDir, enginePath, jobs, resume = false, signal, untilGames, validatePlan,
  shouldStop = () => null, onProgress = () => {}, engineFactory = options => new UciEngine(options),
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules,
  getIdentity, preflight, storeFactory = openStore } = {}) {
  const games = validateCollectionPlan(plan, validatePlan);
  if (typeof getIdentity !== 'function' || typeof preflight !== 'function') throw new Error('Explicit getIdentity and preflight callbacks are required.');
  if (typeof outDir !== 'string' || !outDir) throw new Error('An output directory is required.');
  const evidence = evidenceBytes(plan);
  const prefix = invocationPrefix(plan, untilGames);
  const directory = path.resolve(outDir), original = resume ? readHeadManifest(directory, validatePlan) : null;
  jobs ??= original?.jobs ?? 4;
  if (jobs !== 4) throw new Error('Head collections use exactly four workers.');
  const identity = await getIdentity(enginePath);
  const configHash = fingerprint({ plan, jobs, collectorSha256: identity.collectorSha256 });
  const rulesHash = fingerprint({ bundle: identity.rulesBundleSha256, profile: plan.profile, registry: plan.registry });
  if (!resume && fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('Use a new empty collection directory.');
  if (original && (original.jobs !== jobs || !isDeepStrictEqual(original.plan, plan) || !isDeepStrictEqual(original.identity, identity)
    || original.configHash !== configHash || original.rulesHash !== rulesHash)) throw new Error('Cannot resume: frozen collection settings, source, rules or executable changed.');
  const rules = await rulesFactory({ profile: plan.profile });
  const before = original ? journalRecords(directory) : [];
  if (original) {
    validateEvidenceSnapshots(directory, plan, { allowMissing: before.length === 0 });
  }
  const checkpointFile = path.join(directory, 'checkpoint.json');
  const checkpoint = original && fs.existsSync(checkpointFile) ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8')) : null;
  validateHistory(before, checkpoint, games, rules, plan);
  const variantPath = path.join(directory, 'rules', `${plan.profile.variant}.ini`);
  if (original && fs.existsSync(variantPath) && fs.readFileSync(variantPath, 'utf8') !== plan.profile.config) throw new Error('Frozen rules snapshot differs.');
  const allFinished = new Set(before.filter(record => FINAL.has(record.status)).map(record => record.id)).size === plan.schedule.length;
  const native = allFinished ? original.native : await preflight({ plan, enginePath, signal, engineFactory, rulesFactory });
  if (!native || typeof native !== 'object' || Array.isArray(native)) throw new Error('Native preflight must return a diagnostic object.');
  if (original && !allFinished && !isDeepStrictEqual(native, original.native)) throw new Error('Cannot resume: recorded native diagnostic values or capabilities changed.');
  const manifest = original || { schemaVersion: 1, format: 'levelup-head-collection', runId: randomUUID(), createdAt: new Date().toISOString(),
    plan: clone(plan), jobs, identity, native, enginePath: path.resolve(enginePath), engineSha256: identity.engineSha256, configHash, rulesHash };
  const store = storeFactory({ outDir: directory, resume, manifest });
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let fatal = null, journalFailure = null, cursor = 0;
  const append = record => {
    if (journalFailure) throw journalFailure;
    try { store.append(record); }
    catch (error) {
      // A failed write/fsync may already have persisted all or part of a line.
      // No worker may append behind it; resume owns validation/tail recovery.
      journalFailure = fatal = error; controller.abort(error); throw error;
    }
  };
  const done = new Set(store.records.filter(record => FINAL.has(record.status)).map(record => record.id));
  // Keep unclaimed recovered prefixes in the aggregate checkpoint too. Another
  // resumed worker's first durable move must not erase a crash-only prefix.
  const active = new Map();
  const persist = () => store.saveCheckpoint({ schemaVersion: 1, current: Object.fromEntries(active), finishedGames: done.size });
  const progress = message => { onProgress(message); };
  const label = id => plan.roster.find(item => item.id === id)?.label || 'Ordinary army';
  const tallies = new Map();
  const addScore = record => {
    if (record.status !== 'completed') return;
    const points = record.result === '1/2-1/2' ? 0.5
      : Number((record.result === '1-0') === (record.aColor === 'w'));
    const tally = tallies.get(record.comparisonId) || { a: 0, b: 0, games: 0, wins: 0, draws: 0, losses: 0 };
    tally.a += points; tally.b += 1 - points; tally.games++;
    if (points === 0.5) tally.draws++;
    else if (points === 1) tally.wins++;
    else tally.losses++;
    tallies.set(record.comparisonId, tally);
  };
  store.records.forEach(addScore);
  const resultMessage = result => {
    const winner = result.status !== 'completed' ? 'unscored'
      : result.result === '1/2-1/2' ? 'draw'
      : `${label(result.result === '1-0' ? result.whiteDesign : result.blackDesign)} (${result.result === '1-0' ? 'White' : 'Black'}) wins`;
    const tally = tallies.get(result.comparisonId);
    const score = tally && result.kind !== 'ordinary'
      ? ` ${label(result.designA)} ${tally.a}–${tally.b} ${label(result.designB)} (${tally.games} scored games; partial pairs included). W/D/L ${tally.wins}/${tally.draws}/${tally.losses}.` : '';
    return `Finished ${result.id}: ${result.result} (${result.reason}); ${winner}.${score} ${done.size}/${plan.schedule.length} finished.`;
  };
  const response = () => ({ manifest: store.manifest, records: [...store.records], finishedGames: done.size,
    scheduledGames: plan.schedule.length, stopped: done.size < plan.schedule.length, outDir: directory,
    untilGames: prefix.count, checkpointReached: [...prefix.ids].every(id => done.has(id)) });
  try {
    if (!isDeepStrictEqual(store.manifest, manifest)) throw new Error('Frozen collection manifest changed while waiting for the run lock.');
    // Preflight runs before locking. A previous owner may have stopped while it
    // ran, so only histories re-read under this lock may seed resumed games.
    const saved = validateHistory(store.records, store.checkpoint, games, rules, plan);
    validateEvidenceSnapshots(directory, plan, { allowMissing: store.records.length === 0 });
    for (const [id, state] of saved) if (!done.has(id)) active.set(id, state);
    writeSnapshot(path.join(directory, 'collection.json'), json(store.manifest));
    if (evidence.length) fs.mkdirSync(path.join(directory, 'evidence'), { recursive: true });
    for (const item of evidence) writeSnapshot(path.join(directory, 'evidence', item.name), item.bytes);
    validateEvidenceSnapshots(directory, plan);
    fs.mkdirSync(path.join(directory, 'rules'), { recursive: true });
    writeSnapshot(variantPath, plan.profile.config);
    async function worker(workerId) {
      while (!fatal && !controller.signal.aborted && !shouldStop()) {
        const unit = prefix.units[cursor++];
        if (!unit) return;
        if (unit.gameIds.every(id => done.has(id))) continue;
        try {
          for (const id of unit.gameIds) {
            if (done.has(id)) continue;
            if (controller.signal.aborted || shouldStop() === 'game') return;
            const game = games.get(id), previous = saved.get(id), moves = previous ? [...previous.moves] : [], sans = previous ? [...previous.sans] : [];
            const attempt = Math.max(0, previous?.attempt || 0, ...store.records.filter(record => record.id === id).map(record => record.attempt)) + 1;
            const engines = [], board = rules.createBoard(game.startFen), startedAt = new Date().toISOString(), names = {}, lastInfo = {};
            for (const move of moves) if (!board.push(move)) { board.dispose(); throw new Error(`Cannot restore ${id}.`); }
            let finalized = false;
            const snapshot = () => ({ id, attempt, workerId, startFen: game.startFen, finalFen: board.fen(), moves: [...moves], sans: [...sans],
              profileHash: plan.profile.hash, registryHash: plan.registry.hash });
            const current = () => { active.set(id, snapshot()); persist(); };
            const record = (status, outcome) => ({ schemaVersion: 1, id, unitId: unit.id, pairId: unit.id, kind: game.kind,
              comparisonId: game.comparisonId, openingId: game.openingId, aColor: game.aColor,
              designA: game.designA, designB: game.designB, whiteDesign: game.whiteDesign, blackDesign: game.blackDesign,
              attempt, status, result: status === 'completed' ? outcome.result : '*', reason: outcome.reason,
              startedAt, finishedAt: new Date().toISOString(), startFen: game.startFen, finalFen: board.fen(),
              moves: [...moves], sans: [...sans], openingMoves: [], openingPlies: 0, totalPlies: moves.length, playedPlies: moves.length,
              whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, engineNames: names, lastInfo,
              engine: { nodes: plan.settings.nodes, threads: 1, hashMb: plan.settings.hashMb, maxPlies: plan.settings.maxPlies },
              variant: plan.profile.variant, royalMode: 'king', evaluationCaveat: null,
              ...(plan.profile.evaluation === undefined ? {} : { evaluation: clone(plan.profile.evaluation) }),
              profileHash: plan.profile.hash, registryHash: plan.registry.hash, registryReference: 'collection.json#plan.registry' });
            try {
              current(); progress(`Starting ${id}: ${label(game.whiteDesign)} (White) vs ${label(game.blackDesign)} (Black) (${done.size}/${plan.schedule.length} finished, attempt ${attempt}).`);
              abortIfNeeded(controller.signal);
              for (let color = 0; color < 2; color++) {
                const engine = engineFactory({ path: enginePath, variantPath, variant: plan.profile.variant,
                  options: { skill: 20, threads: 1, hash: plan.settings.hashMb } });
                engines.push(engine); await engine.start({ signal: controller.signal });
              }
              for (const [index, engine] of engines.entries()) {
                await engine.newGame({ signal: controller.signal });
                names[index === 0 ? 'w' : 'b'] = engine.metadata?.idname || native.engineName;
              }
              let outcome = board.outcome();
              while (!outcome && moves.length < plan.settings.maxPlies) {
                abortIfNeeded(controller.signal);
                const color = board.turn(), search = await engines[color === 'w' ? 0 : 1].search({ fen: game.startFen, moves: [...moves], nodes: plan.settings.nodes, signal: controller.signal });
                abortIfNeeded(controller.signal);
                if (!search.move || !board.moves().includes(search.move)) throw new Error(`Illegal or missing engine move: ${id}.`);
                const san = board.san(search.move);
                if (!board.push(search.move)) throw new Error(`Rules refused engine move: ${id}.`);
                moves.push(search.move); sans.push(san); lastInfo[color] = search.info; current(); outcome = board.outcome();
              }
              const result = record(outcome ? 'completed' : 'truncated', outcome || { reason: 'max-plies' });
              append(result); finalized = true; done.add(id); active.delete(id); persist(); addScore(result);
              progress(resultMessage(result));
            } catch (error) {
              if (finalized || journalFailure) {
                fatal ||= error; controller.abort(error); throw error;
              }
              const aborted = controller.signal.aborted || error.name === 'AbortError';
              // Stop peers before asynchronous process cleanup. Otherwise they
              // could claim another unit while this game's engines are closing.
              if (!aborted) { fatal ||= error; controller.abort(error); }
              append(record(aborted ? 'aborted' : 'error', { reason: aborted ? 'cancelled' : error.message })); current();
              if (!aborted) throw error;
              return;
            } finally { board.dispose(); await Promise.allSettled(engines.map(engine => engine.close())); }
            if (shouldStop() === 'game') return;
          }
        } catch (error) {
          if (!fatal && !controller.signal.aborted) { fatal = error; controller.abort(error); }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(jobs, prefix.units.length) }, (_, index) => worker(index + 1)));
    store.saveSummary({ schemaVersion: 1, runId: store.manifest.runId, scheduledGames: plan.schedule.length, finishedGames: done.size,
      statusCounts: Object.fromEntries([...STATUSES].map(status => [status, store.records.filter(record => record.status === status).length])) });
    if (fatal) throw fatal;
    return response();
  } finally { signal?.removeEventListener('abort', abort); store.close(); }
}

module.exports = { runHeadCollection, readHeadManifest, invocationPrefix };
