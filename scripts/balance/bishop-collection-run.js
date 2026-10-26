'use strict';

// Dedicated linked bishop-reference collector; inherited games stay separate. Earlier frozen collectors and identities
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
const { validateBishopPlan, getBishopProtocol } = require('./bishop-plan');
const { checkBishopCompatibility } = require('./bishop-compatibility');

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
  validateBishopPlan(plan);
  return new Map(plan.schedule.map(game => [game.id, game]));
}

function invocationPrefix(plan, untilGames) {
  const count = untilGames ?? plan.schedule.length;
  if (!Number.isSafeInteger(count) || count < 1 || count > plan.schedule.length) throw new Error('untilGames must select a bounded scheduled prefix.');
  if (!plan.study.checkpoints.includes(count)) throw new Error('The bishop-reference study stops only at its declared game checkpoints.');
  const ids = new Set(plan.schedule.slice(0, count).map(game => game.id));
  const openingMembership = new Map();
  for (const game of plan.schedule) {
    const membership = ids.has(game.id), prior = openingMembership.get(game.openingId);
    if (prior !== undefined && prior !== membership) throw new Error('untilGames cannot split an opening block.');
    openingMembership.set(game.openingId, membership);
  }
  const units = plan.units.filter(unit => {
    const membership = unit.gameIds.map(id => ids.has(id));
    if (membership.some(Boolean) && !membership.every(Boolean)) throw new Error('untilGames cannot split a collection unit.');
    return membership[0];
  });
  return { count, ids, units };
}

function bishopIdentity(enginePath) {
  const sources = ['scripts/bishop-references.js', 'scripts/balance/bishop-run.js',
    'scripts/balance/bishop-plan.js', 'scripts/balance/bishop-collection-run.js',
    'scripts/balance/bishop-report.js', 'scripts/balance/bishop-dataset.js',
    'scripts/balance/bishop-source.js', 'scripts/balance/bishop-compatibility.js',
    'scripts/balance/bishop-analysis.js', 'scripts/balance/revision-compatibility.js',
    'scripts/balance/simple-plan.js', 'scripts/balance/simple-dataset.js',
    'scripts/balance/reference-plan.js', 'scripts/balance/reference-dataset.js',
    'scripts/balance/reference-report.js', 'experiments/balance/reference-panel.json',
    'scripts/balance/reference-regression.js', 'scripts/balance/reference-analysis.js',
    'scripts/balance/material-dataset.js', 'scripts/balance/material-regression.js',
    'scripts/material-collect.js',
    ...getBishopProtocol().configFiles.map(file => path.relative(ROOT, file).split(path.sep).join('/'))];
  const bishopSources = [...new Set(sources)].map(file => ({ file,
    sha256: sha256(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) }));
  return { ...getRunIdentity(enginePath), bishopSources, collectorSha256: fingerprint(bishopSources),
    bishopSha256: fingerprint(bishopSources) };
}

function readBishopManifest(directory) {
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const run = read('run.json');
  if (run.format !== 'levelup-bishop-collection' || run.schemaVersion !== 1) throw new Error('This is not a material collection directory.');
  if (fs.existsSync(path.join(directory, 'collection.json')) && !isDeepStrictEqual(run, read('collection.json'))) throw new Error('Collection and run manifests disagree.');
  validatePlan(run.plan);
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

function parentBytes(plan) {
  const parent = plan.parent;
  const manifest = fs.readFileSync(path.join(ROOT, parent.manifestFile));
  const journal = fs.readFileSync(path.join(ROOT, parent.journalFile));
  if (sha256(manifest) !== parent.manifestSha256 || sha256(journal) !== parent.journalSha256) {
    throw new Error('Frozen parent source hashes changed.');
  }
  return { manifest, journal };
}

function validateParentSnapshots(directory, parent, { allowMissing = false } = {}) {
  for (const [name, expected] of [['collection.json', parent.manifestSha256], ['games.jsonl', parent.journalSha256]]) {
    const file = path.join(directory, 'parent', name);
    if (!fs.existsSync(file)) {
      if (allowMissing) continue;
      throw new Error(`Missing frozen parent snapshot: ${name}.`);
    }
    if (sha256(fs.readFileSync(file)) !== expected) throw new Error(`Frozen parent snapshot changed: ${name}.`);
  }
}

function simpleBytes(plan) {
  const source = plan.simpleSource;
  const manifest = fs.readFileSync(path.join(ROOT, source.manifestFile));
  const journal = fs.readFileSync(path.join(ROOT, source.journalFile));
  if (sha256(manifest) !== source.manifestSha256 || sha256(journal) !== source.journalSha256) {
    throw new Error('Frozen simple replay source hashes changed.');
  }
  return { manifest, journal };
}

function validateSimpleSnapshots(directory, source, { allowMissing = false } = {}) {
  for (const [name, expected] of [['replay-source.json', source.manifestSha256], ['games.jsonl', source.journalSha256]]) {
    const file = path.join(directory, 'simple-source', name);
    if (!fs.existsSync(file)) {
      if (allowMissing) continue;
      throw new Error(`Missing frozen simple replay snapshot: ${name}.`);
    }
    if (sha256(fs.readFileSync(file)) !== expected) throw new Error(`Frozen simple replay snapshot changed: ${name}.`);
  }
}

function validateValues(values, profile) {
  if (values?.version !== 1 || !values.pieces) throw new Error('Bishop-reference study requires the compatible levelupvalues diagnostic.');
  const definitions = profile.registry.definitions;
  const policy = { pieceValues: { 'rook.purple@9': { mg: 2538, eg: 2682 } } };
  if (!isDeepStrictEqual(profile.evaluation, policy) || definitions.length !== 12
    || !['bishop.purple@4', 'bishop.purple@7', 'bishop.purple@9', 'bishop.purple@10', 'bishop.purple@11', 'bishop.purple@12', 'rook.purple@2', 'rook.purple@9', 'rook.purple@10', 'rook.purple@11', 'knight.purple@3', 'queen.purple@1'].every(id => definitions.some(definition => definition.id === id))) {
    throw new Error('Bishop-reference study requires five bishop candidates, the inherited eight-type roster and only the queen-equivalent override.');
  }
  const fields = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];
  const letters = ['p', 'n', 'b', 'r', 'q', 'k', ...profile.registry.allocations.map(item => item.letter)];
  for (const letter of letters) {
    for (const field of fields) {
      const white = values.pieces[letter.toUpperCase()]?.[field], black = values.pieces[letter]?.[field];
      if (!Number.isSafeInteger(white) || white < 0 || white !== black
        || letter !== 'k' && white === 0) throw new Error(`Invalid or asymmetric native value: ${letter} ${field}.`);
    }
  }
  // The queen-moving rook inherits the ordinary queen's prior because its
  // movement is identical. No desired balance score enters this policy.
  const letterOf = id => profile.registry.allocations.find(item => item.id === id).letter;
  const fixed = [['p', 126, 208], ['n', 781, 854], ['b', 825, 915], ['r', 1276, 1380], ['q', 2538, 2682], ['k', 0, 0],
    [letterOf('queen.purple@1'), 3738, 3875], [letterOf('knight.purple@3'), 1663, 1877],
    [letterOf('bishop.purple@4'), 1858, 1903], [letterOf('rook.purple@2'), 1904, 1959],
    [letterOf('rook.purple@9'), 2538, 2682]];
  for (const [letter, mg, eg] of fixed) for (const piece of [letter, letter.toUpperCase()]) for (const field of fields) {
    if (values.pieces[piece][field] !== (field.endsWith('Mg') ? mg : eg)) throw new Error(`Frozen native value ${piece} ${field} changed.`);
  }
}

const PROMOTION_PROBES = [
  { name: 'White mandatory ordinary promotion', fen: '8/1P6/7k/8/8/8/8/K7 w - - 0 1' },
  { name: 'Black mandatory ordinary promotion', fen: 'k7/8/8/8/8/7K/1p6/8 b - - 0 1' },
];

/** Native preflight performs diagnostics/perft only, never go nodes/movetime. */
async function checkBishopCollection({ plan, enginePath, signal, engineFactory = options => new UciEngine(options),
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules, capabilityCheck = checkCapabilities,
  compatibilityCheck = checkBishopCompatibility } = {}) {
  validatePlan(plan); abortIfNeeded(signal);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-bishop-preflight-'));
  const variantPath = path.join(directory, 'collection.ini');
  fs.writeFileSync(variantPath, plan.profile.config);
  const engine = engineFactory({ path: enginePath, variantPath, variant: plan.profile.variant,
    options: { skill: 20, threads: 1, hash: plan.settings.hashMb } });
  try {
    const rules = await rulesFactory({ profile: plan.profile });
    const metadata = await engine.start({ signal });
    const pieceValues = await engine.pieceValues({ signal });
    validateValues(pieceValues, plan.profile);
    const library = getBishopProtocol();
    const parentCompatibility = await compatibilityCheck({ engine, newProfile: plan.profile,
      parentManifest: library.parentManifest, parentRecords: library.parentRecords, pieceValues,
      simpleManifest: library.sourceManifest, simpleRecords: library.sourceRecords,
      enginePath, engineFactory, rulesFactory, signal });
    if (parentCompatibility?.passed !== true) throw new Error('Parent compatibility checks did not pass.');
    const starts = [...new Set(plan.schedule.map(game => game.startFen))];
    const capabilities = await capabilityCheck({ engine, rules, startFens: starts, whiteKing: 0, blackKing: 0, signal });
    for (const fen of [...starts, ...PROMOTION_PROBES.map(probe => probe.fen)]) {
      abortIfNeeded(signal);
      const board = rules.createBoard(fen);
      try {
        if (board.outcome()) throw new Error('A collection starting position is terminal.');
        const expected = [...board.moves()].sort(), actual = await engine.perft({ fen, signal });
        if (!isDeepStrictEqual([...actual].sort(), expected)) throw new Error('Native and browser legal moves disagree at a collection start.');
      } finally { board.dispose(); }
    }
    return { engineName: metadata?.idname || null, pieceValues, parentCompatibility, capabilityProbes: capabilities.probes + PROMOTION_PROBES.length, roleProbes: PROMOTION_PROBES.length, startingPositions: starts.length, searchesStarted: 0 };
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
      || ['designA', 'designB', 'whiteDesign', 'blackDesign'].some(field => record[field] !== game[field])
      || record.pairId !== game.pairId || record.aColor !== game.aColor || record.openingId !== game.openingId || record.comparisonId !== game.comparisonId
      || !isDeepStrictEqual(record.engine, settings) || !isDeepStrictEqual(record.whiteStrength, { skill: 20 })
      || !isDeepStrictEqual(record.blackStrength, { skill: 20 }) || record.royalMode !== 'king' || record.evaluationCaveat !== null
      || !isDeepStrictEqual(record.evaluation, plan.profile.evaluation) || record.totalPlies !== record.moves?.length || record.playedPlies !== record.moves?.length
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

async function runBishopCollection({ plan, outDir, enginePath, jobs, resume = false, signal, untilGames,
  shouldStop = () => null, onProgress = () => {}, engineFactory = options => new UciEngine(options),
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules,
  getIdentity = bishopIdentity, preflight = checkBishopCollection, storeFactory = openStore } = {}) {
  const games = validatePlan(plan), parent = parentBytes(plan), simple = simpleBytes(plan);
  const prefix = invocationPrefix(plan, untilGames);
  const directory = path.resolve(outDir), original = resume ? readBishopManifest(directory) : null;
  jobs ??= original?.jobs ?? 4;
  if (jobs !== 4) throw new Error('The declared bishop-reference study uses four workers.');
  const identity = getIdentity(enginePath);
  const configHash = fingerprint({ plan, jobs, collectorSha256: identity.collectorSha256 });
  const rulesHash = fingerprint({ bundle: identity.rulesBundleSha256, profile: plan.profile, registry: plan.registry });
  if (!resume && fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('Use a new empty collection directory.');
  if (original && (original.jobs !== jobs || !isDeepStrictEqual(original.plan, plan) || !isDeepStrictEqual(original.identity, identity)
    || original.configHash !== configHash || original.rulesHash !== rulesHash)) throw new Error('Cannot resume: frozen collection settings, source, rules or executable changed.');
  const rules = await rulesFactory({ profile: plan.profile });
  const before = original ? journalRecords(directory) : [];
  if (original) {
    validateParentSnapshots(directory, plan.parent, { allowMissing: before.length === 0 });
    validateSimpleSnapshots(directory, plan.simpleSource, { allowMissing: before.length === 0 });
  }
  const checkpointFile = path.join(directory, 'checkpoint.json');
  const checkpoint = original && fs.existsSync(checkpointFile) ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8')) : null;
  validateHistory(before, checkpoint, games, rules, plan);
  const variantPath = path.join(directory, 'rules', `${plan.profile.variant}.ini`);
  if (original && fs.existsSync(variantPath) && fs.readFileSync(variantPath, 'utf8') !== plan.profile.config) throw new Error('Frozen rules snapshot differs.');
  const allFinished = new Set(before.filter(record => FINAL.has(record.status)).map(record => record.id)).size === plan.schedule.length;
  const native = allFinished ? original.native : await preflight({ plan, enginePath, signal, engineFactory, rulesFactory });
  if (native?.parentCompatibility?.passed !== true) throw new Error('Cannot collect: parent compatibility checks did not pass.');
  if (original && !allFinished && !isDeepStrictEqual(native, original.native)) throw new Error('Cannot resume: recorded native diagnostic values or capabilities changed.');
  const manifest = original || { schemaVersion: 1, format: 'levelup-bishop-collection', runId: randomUUID(), createdAt: new Date().toISOString(),
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
    const tally = tallies.get(record.comparisonId) || { a: 0, b: 0, games: 0 };
    tally.a += points; tally.b += 1 - points; tally.games++;
    tallies.set(record.comparisonId, tally);
  };
  store.records.forEach(addScore);
  const resultMessage = result => {
    const winner = result.status !== 'completed' ? 'unscored'
      : result.result === '1/2-1/2' ? 'draw'
      : `${label(result.result === '1-0' ? result.whiteDesign : result.blackDesign)} (${result.result === '1-0' ? 'White' : 'Black'}) wins`;
    const tally = tallies.get(result.comparisonId);
    const score = tally && result.kind !== 'ordinary'
      ? ` ${label(result.designA)} ${tally.a}–${tally.b} ${label(result.designB)} (${tally.games} scored games; partial pairs included).` : '';
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
    for (const [id, state] of saved) if (!done.has(id)) active.set(id, state);
    writeSnapshot(path.join(directory, 'collection.json'), json(store.manifest));
    fs.mkdirSync(path.join(directory, 'parent'), { recursive: true });
    writeSnapshot(path.join(directory, 'parent', 'collection.json'), parent.manifest);
    writeSnapshot(path.join(directory, 'parent', 'games.jsonl'), parent.journal);
    validateParentSnapshots(directory, plan.parent);
    // This is a derived replay source, not an uploaded historical collection manifest.
    fs.mkdirSync(path.join(directory, 'simple-source'), { recursive: true });
    writeSnapshot(path.join(directory, 'simple-source', 'replay-source.json'), simple.manifest);
    writeSnapshot(path.join(directory, 'simple-source', 'games.jsonl'), simple.journal);
    validateSimpleSnapshots(directory, plan.simpleSource);
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
              variant: plan.profile.variant, royalMode: 'king', evaluationCaveat: null, evaluation: clone(plan.profile.evaluation),
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

module.exports = { runBishopCollection, checkBishopCollection, readBishopManifest, bishopIdentity, validateValues, validatePlan, invocationPrefix, PROMOTION_PROBES };
