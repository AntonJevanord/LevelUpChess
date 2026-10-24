'use strict';

// Dedicated collection runner. Existing experiment runners and their identities
// remain unchanged. All durable writes use the established run-store recovery.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getRunIdentity } = require('./run');
const { openStore } = require('./storage');
const { renameWithRetrySync, unlinkWithRetrySync } = require('./files');
const { UciEngine } = require('./uci');
const { checkCapabilities } = require('./capabilities');

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

function validatePlan(plan) {
  if (!plan?.profile?.config || !plan.registry || plan.profile.registryHash !== plan.registry.hash
    || !isDeepStrictEqual(plan.profile.registry, plan.registry) || !Array.isArray(plan.schedule) || !plan.schedule.length
    || plan.schedule.length > 96 || !Array.isArray(plan.units) || !plan.units.length) throw new Error('An intact bounded collection plan is required.');
  const settings = plan.settings;
  for (const key of ['nodes', 'threads', 'hashMb', 'maxPlies']) if (!Number.isSafeInteger(settings?.[key]) || settings[key] < 1) throw new Error(`Invalid collection ${key}.`);
  if (settings.threads !== 1 || settings.skill !== 20) throw new Error('Collection uses one search thread and equal Skill 20 engines.');
  const games = new Map();
  for (const game of plan.schedule) {
    if (!game || typeof game.id !== 'string' || !game.id || games.has(game.id) || typeof game.unitId !== 'string'
      || !['ordinary', 'amazon'].includes(game.kind) || !['w', 'b'].includes(game.aColor)
      || typeof game.startFen !== 'string' || typeof game.openingId !== 'string' || typeof game.comparisonId !== 'string'
      || !Array.isArray(game.openingMoves) || game.openingMoves.length) throw new Error('Malformed collection game.');
    games.set(game.id, game);
  }
  const assigned = new Set(), units = new Set();
  for (const unit of plan.units) {
    if (!unit || typeof unit.id !== 'string' || units.has(unit.id) || !['ordinary', 'amazon'].includes(unit.kind)
      || !Array.isArray(unit.gameIds) || unit.gameIds.length !== (unit.kind === 'ordinary' ? 1 : 2)) throw new Error('Malformed collection unit.');
    units.add(unit.id);
    const members = unit.gameIds.map(id => games.get(id));
    if (members.some(game => !game || assigned.has(game.id) || game.unitId !== unit.id || game.kind !== unit.kind)
      || new Set(members.map(game => game.openingId)).size !== 1
      || unit.kind === 'amazon' && new Set(members.map(game => game.aColor)).size !== 2) throw new Error('Collection units must contain their own complete color partners.');
    members.forEach(game => assigned.add(game.id));
  }
  if (assigned.size !== games.size) throw new Error('Every collection game must belong to one unit.');
  return games;
}

function collectionIdentity(enginePath) {
  const sources = ['scripts/material-collect.js', 'scripts/balance/material-collection-plan.js',
    'scripts/balance/material-collection-run.js', 'scripts/balance/material-collection-report.js',
    'scripts/balance/material-dataset.js', 'scripts/balance/material-regression.js',
    'experiments/balance/material-collection.json'];
  const collectorSources = sources.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) }));
  return { ...getRunIdentity(enginePath), collectorSources, collectorSha256: fingerprint(collectorSources) };
}

function readCollectionManifest(directory) {
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const run = read('run.json');
  if (run.format !== 'levelup-material-collection' || run.schemaVersion !== 1) throw new Error('This is not a material collection directory.');
  if (fs.existsSync(path.join(directory, 'collection.json')) && !isDeepStrictEqual(run, read('collection.json'))) throw new Error('Collection and run manifests disagree.');
  validatePlan(run.plan);
  return run;
}

function writeSnapshot(file, content) {
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8') !== content) throw new Error(`Frozen snapshot differs: ${path.basename(file)}.`);
    return;
  }
  const directory = path.dirname(file), temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx'); fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    renameWithRetrySync(temporary, file);
    try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
    catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error; }
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { unlinkWithRetrySync(temporary); }
  }
}

function validateValues(values, profile) {
  if (values?.version !== 1 || !values.pieces) throw new Error('Collection requires the compatible levelupvalues diagnostic.');
  const amazon = profile.registry.allocations.find(item => item.id === 'queen.purple@1')?.letter;
  if (!amazon) throw new Error('Collection must retain its Amazon reference.');
  for (const [letter, mg, eg] of [['p', 126, 208], ['n', 781, 854], ['b', 825, 915], ['r', 1276, 1380], ['q', 2538, 2682], ['k', 0, 0], [amazon, 3738, 3875]]) {
    for (const piece of [letter, letter.toUpperCase()]) for (const field of ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']) {
      if (values.pieces[piece]?.[field] !== (field.endsWith('Mg') ? mg : eg)) throw new Error(`Frozen automatic reference ${piece} ${field} changed.`);
    }
  }
}

/** Native preflight performs diagnostics/perft only, never go nodes/movetime. */
async function checkCollection({ plan, enginePath, signal, engineFactory = options => new UciEngine(options),
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules, capabilityCheck = checkCapabilities } = {}) {
  validatePlan(plan); abortIfNeeded(signal);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-material-preflight-'));
  const variantPath = path.join(directory, 'collection.ini');
  fs.writeFileSync(variantPath, plan.profile.config);
  const engine = engineFactory({ path: enginePath, variantPath, variant: plan.profile.variant,
    options: { skill: 20, threads: 1, hash: plan.settings.hashMb } });
  try {
    const rules = await rulesFactory({ profile: plan.profile });
    const metadata = await engine.start({ signal });
    const pieceValues = await engine.pieceValues({ signal });
    validateValues(pieceValues, plan.profile);
    const starts = [...new Set(plan.schedule.map(game => game.startFen))];
    const capabilities = await capabilityCheck({ engine, rules, startFens: starts, whiteKing: 0, blackKing: 0, signal });
    for (const fen of starts) {
      abortIfNeeded(signal);
      const board = rules.createBoard(fen);
      try {
        if (board.outcome()) throw new Error('A collection starting position is terminal.');
        const expected = [...board.moves()].sort(), actual = await engine.perft({ fen, signal });
        if (!isDeepStrictEqual([...actual].sort(), expected)) throw new Error('Native and browser legal moves disagree at a collection start.');
      } finally { board.dispose(); }
    }
    return { engineName: metadata?.idname || null, pieceValues, capabilityProbes: capabilities.probes, startingPositions: starts.length, searchesStarted: 0 };
  } finally { await engine.close(); fs.rmSync(directory, { recursive: true, force: true }); }
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
      || record.aColor !== game.aColor || record.openingId !== game.openingId || record.comparisonId !== game.comparisonId
      || !isDeepStrictEqual(record.engine, settings) || !isDeepStrictEqual(record.whiteStrength, { skill: 20 })
      || !isDeepStrictEqual(record.blackStrength, { skill: 20 }) || record.royalMode !== 'king' || record.evaluationCaveat !== null
      || record.evaluation !== undefined || record.totalPlies !== record.moves?.length || record.playedPlies !== record.moves?.length
      || record.openingPlies !== 0 || !isDeepStrictEqual(record.openingMoves, [])
      || prior && (FINAL.has(prior.status) || record.attempt <= prior.attempt
        || prior.moves.some((move, index) => record.moves[index] !== move))) throw new Error('Saved journal does not match the collection schedule or history.');
    const board = replay(rules, game, record);
    try {
      if (record.status === 'completed' ? !isDeepStrictEqual(board.outcome(), { result: record.result, reason: record.reason }) : record.result !== '*') throw new Error('Saved outcome does not match replayed history.');
    } finally { board.dispose(); }
    latest.set(game.id, record);
  }
  const active = checkpoint?.current || {};
  if (!active || typeof active !== 'object' || Array.isArray(active)) throw new Error('Invalid collection checkpoint.');
  const recovered = new Map();
  for (const [id, state] of Object.entries(active)) {
    const game = games.get(id), prior = latest.get(id);
    if (!game || state.id !== id || state.profileHash !== plan.profile.hash || state.registryHash !== plan.registry.hash) throw new Error('Checkpoint does not match collection identities.');
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

async function runCollection({ plan, outDir, enginePath, jobs, resume = false, signal,
  shouldStop = () => null, onProgress = () => {}, engineFactory = options => new UciEngine(options),
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules,
  getIdentity = collectionIdentity, preflight = checkCollection, storeFactory = openStore } = {}) {
  const games = validatePlan(plan);
  const directory = path.resolve(outDir), original = resume ? readCollectionManifest(directory) : null;
  jobs ??= original?.jobs ?? 3;
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Collection jobs must be an integer from 1 to 16.');
  const identity = getIdentity(enginePath);
  const configHash = fingerprint({ plan, jobs, collectorSha256: identity.collectorSha256 });
  const rulesHash = fingerprint({ bundle: identity.rulesBundleSha256, profile: plan.profile, registry: plan.registry });
  if (!resume && fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('Use a new empty collection directory.');
  if (original && (original.jobs !== jobs || !isDeepStrictEqual(original.plan, plan) || !isDeepStrictEqual(original.identity, identity)
    || original.configHash !== configHash || original.rulesHash !== rulesHash)) throw new Error('Cannot resume: frozen collection settings, source, rules or executable changed.');
  const rules = await rulesFactory({ profile: plan.profile });
  const before = original ? journalRecords(directory) : [];
  const checkpointFile = path.join(directory, 'checkpoint.json');
  const checkpoint = original && fs.existsSync(checkpointFile) ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8')) : null;
  validateHistory(before, checkpoint, games, rules, plan);
  const variantPath = path.join(directory, 'rules', `${plan.profile.variant}.ini`);
  if (original && fs.existsSync(variantPath) && fs.readFileSync(variantPath, 'utf8') !== plan.profile.config) throw new Error('Frozen rules snapshot differs.');
  const allFinished = new Set(before.filter(record => FINAL.has(record.status)).map(record => record.id)).size === plan.schedule.length;
  const native = allFinished ? original.native : await preflight({ plan, enginePath, signal, engineFactory, rulesFactory });
  const manifest = original || { schemaVersion: 1, format: 'levelup-material-collection', runId: randomUUID(), createdAt: new Date().toISOString(),
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
  const response = () => ({ manifest: store.manifest, records: [...store.records], finishedGames: done.size,
    scheduledGames: plan.schedule.length, stopped: done.size < plan.schedule.length, outDir: directory });
  try {
    if (!isDeepStrictEqual(store.manifest, manifest)) throw new Error('Frozen collection manifest changed while waiting for the run lock.');
    // Preflight runs before locking. A previous owner may have stopped while it
    // ran, so only histories re-read under this lock may seed resumed games.
    const saved = validateHistory(store.records, store.checkpoint, games, rules, plan);
    for (const [id, state] of saved) if (!done.has(id)) active.set(id, state);
    writeSnapshot(path.join(directory, 'collection.json'), json(store.manifest));
    fs.mkdirSync(path.join(directory, 'rules'), { recursive: true });
    writeSnapshot(variantPath, plan.profile.config);
    async function worker(workerId) {
      while (!fatal && !controller.signal.aborted && !shouldStop()) {
        const unit = plan.units[cursor++];
        if (!unit) return;
        if (unit.gameIds.every(id => done.has(id))) continue;
        const engines = [];
        try {
          for (const id of unit.gameIds) {
            if (done.has(id)) continue;
            if (controller.signal.aborted || shouldStop() === 'game') return;
            const game = games.get(id), previous = saved.get(id), moves = previous ? [...previous.moves] : [], sans = previous ? [...previous.sans] : [];
            const attempt = Math.max(0, previous?.attempt || 0, ...store.records.filter(record => record.id === id).map(record => record.attempt)) + 1;
            const board = rules.createBoard(game.startFen), startedAt = new Date().toISOString(), names = {}, lastInfo = {};
            for (const move of moves) if (!board.push(move)) { board.dispose(); throw new Error(`Cannot restore ${id}.`); }
            let finalized = false;
            const snapshot = () => ({ id, attempt, workerId, startFen: game.startFen, finalFen: board.fen(), moves: [...moves], sans: [...sans],
              profileHash: plan.profile.hash, registryHash: plan.registry.hash });
            const current = () => { active.set(id, snapshot()); persist(); };
            const record = (status, outcome) => ({ schemaVersion: 1, id, unitId: unit.id, pairId: unit.id, kind: game.kind,
              comparisonId: game.comparisonId, openingId: game.openingId, aColor: game.aColor,
              attempt, status, result: status === 'completed' ? outcome.result : '*', reason: outcome.reason,
              startedAt, finishedAt: new Date().toISOString(), startFen: game.startFen, finalFen: board.fen(),
              moves: [...moves], sans: [...sans], openingMoves: [], openingPlies: 0, totalPlies: moves.length, playedPlies: moves.length,
              whiteStrength: { skill: 20 }, blackStrength: { skill: 20 }, engineNames: names, lastInfo,
              engine: { nodes: plan.settings.nodes, threads: 1, hashMb: plan.settings.hashMb, maxPlies: plan.settings.maxPlies },
              variant: plan.profile.variant, royalMode: 'king', evaluationCaveat: null,
              profileHash: plan.profile.hash, registryHash: plan.registry.hash, registryReference: 'collection.json#plan.registry' });
            try {
              current(); progress(`Starting ${id} (${done.size}/${plan.schedule.length} finished, attempt ${attempt}).`);
              abortIfNeeded(controller.signal);
              if (!engines.length) for (let color = 0; color < 2; color++) {
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
              append(result); finalized = true; done.add(id); active.delete(id); persist();
              progress(`Finished ${id}: ${result.result} (${result.reason}); ${done.size}/${plan.schedule.length} finished.`);
            } catch (error) {
              if (finalized || journalFailure) throw error;
              const aborted = controller.signal.aborted || error.name === 'AbortError';
              append(record(aborted ? 'aborted' : 'error', { reason: aborted ? 'cancelled' : error.message })); current();
              if (!aborted) throw error;
              return;
            } finally { board.dispose(); }
            if (shouldStop() === 'game') return;
          }
        } catch (error) {
          if (!fatal && !controller.signal.aborted) { fatal = error; controller.abort(error); }
        } finally { await Promise.allSettled(engines.map(engine => engine.close())); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(jobs, plan.units.length) }, (_, index) => worker(index + 1)));
    store.saveSummary({ schemaVersion: 1, runId: store.manifest.runId, scheduledGames: plan.schedule.length, finishedGames: done.size,
      statusCounts: Object.fromEntries([...STATUSES].map(status => [status, store.records.filter(record => record.status === status).length])) });
    if (fatal) throw fatal;
    return response();
  } finally { signal?.removeEventListener('abort', abort); store.close(); }
}

module.exports = { runCollection, checkCollection, readCollectionManifest, collectionIdentity, validateValues, validatePlan };
