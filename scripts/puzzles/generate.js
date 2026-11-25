'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { UciEngine } = require('../balance/uci');
const { renameWithRetrySync } = require('../balance/files');
const { proveMate, positionKey, cancelled } = require('./mate-proof');
const { nativeParity, mismatchMessage, assertCompatibleEngineHash } = require('./native-parity');
const { getProfileSnapshot } = require('../../src/design-options');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const STANDARD = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']);
const FORMAT = 'levelup-panel-puzzle-generation-v1';
const FILES = new Set(['generation.json', 'attempts.jsonl', 'puzzles.json', 'generation-report.md', 'native-rules-mismatch.json', '.puzzle-generation.lock']);
const ANALYSIS_FILES = ['scripts/generate-puzzles.js', 'scripts/puzzles/generate.js', 'scripts/puzzles/mate-proof.js',
  'scripts/puzzles/sources.js', 'scripts/puzzles/native-parity.js', 'src/puzzle-data.js', 'dist/rules-node.cjs'];
const ROOT = path.resolve(__dirname, '../..');
function latestCompleted(records) {
  const latest = new Map();
  for (const row of records) if (!latest.has(row.id) || row.attempt > latest.get(row.id).attempt) latest.set(row.id, row);
  return [...latest.values()].filter(row => row.status === 'completed');
}
function snapshotFor(profile) {
  const snapshot = getProfileSnapshot(profile.variant);
  if (!snapshot || snapshot.hash !== profile.hash || snapshot.config !== profile.config
    || !isDeepStrictEqual(snapshot.registry, profile.registry)) throw new Error(`The archived profile ${profile.variant} is not available in this playable build. Preserve the matching build.`);
  return snapshot;
}
function sourceReceipt(sources) {
  return sources.map(source => ({ runId: source.manifest.runId, format: source.manifest.format,
    targetOpenings: source.state?.targetOpenings || source.manifest.targetOpenings || source.manifest.initialOpenings,
    files: source.files.map(row => ({ file: path.relative(source.root, row.file).split(path.sep).join('/'),
      ...(row.absent ? { absent: true } : { sha256: row.sha256 }) })).sort((a, b) => a.file.localeCompare(b.file)),
    contexts: source.contexts.map(row => ({ key: row.key, identity: row.identity, profileHash: row.profile.hash })) }));
}
function planGames(sources, limit) {
  const seen = new Map();
  for (const source of sources) for (const context of source.contexts) for (const record of latestCompleted(context.records)) {
    if (record.reason !== 'checkmate' || !['1-0', '0-1'].includes(record.result)) continue;
    const identity = [context.identity.runId, context.identity.stageKey, record.id, record.attempt];
    const id = sha(JSON.stringify(identity)), existing = seen.get(id);
    if (existing && !isDeepStrictEqual(existing.record, record)) throw new Error('Conflicting copies of a source game.');
    if (!existing) seen.set(id, { id, context, record });
  }
  // Select across sources before grouping by profile, so the bounded sample
  // does not favor a tier and one persistent engine can handle each profile.
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit)
    .sort((a, b) => a.context.profile.hash.localeCompare(b.context.profile.hash) || a.id.localeCompare(b.id));
}
async function candidatesForGame(game, settings, signal) {
  const { context, record } = game, rules = await context.rulesFactory({ profile: context.profile });
  const board = rules.createBoard(record.startFen), positions = [];
  const solverColor = record.result === '1-0' ? 'w' : 'b';
  if (!Array.isArray(record.moves) || !Array.isArray(record.openingMoves)
    || !isDeepStrictEqual(record.moves.slice(0, record.openingMoves.length), record.openingMoves)) throw new Error(`Game ${record.id} changed its forced prefix.`);
  try {
    for (let ply = 0; ply <= record.moves.length; ply++) {
      if (signal?.aborted) throw cancelled();
      if (ply > record.openingMoves.length && ply < record.moves.length
        && ply >= record.moves.length - settings.maxMoves * 2 - 6 && board.turn() === solverColor && !board.outcome()) {
        positions.push({ id: sha(JSON.stringify([game.id, ply, board.fen()])), game, ply, rules,
          fen: board.fen(), key: `${context.profile.hash}:${positionKey(board)}`, solverColor });
      }
      if (ply < record.moves.length && (board.outcome() || !board.push(record.moves[ply]))) throw new Error(`Game ${record.id} contains an illegal or post-terminal move at ply ${ply + 1}.`);
    }
    const outcome = board.outcome();
    if (board.fen() !== record.finalFen || outcome?.reason !== 'checkmate' || outcome.result !== record.result) throw new Error(`Game ${record.id} does not replay to its recorded checkmate.`);
  } finally { board.dispose(); }
  return positions.slice(-settings.positionsPerGame);
}
function atomic(file, content) {
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) throw new Error('Refusing to replace a linked puzzle output.');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, content, { flag: 'wx' }); renameWithRetrySync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function assertOutput(sourceRoots, selected, resume) {
  const out = path.resolve(selected); let ancestor = out;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const canonical = path.join(fs.realpathSync(ancestor), path.relative(ancestor, out));
  const inside = (a, b) => a === b || b.startsWith(a + path.sep);
  for (const source of sourceRoots) if (inside(source, canonical) || inside(canonical, source)) throw new Error('Puzzle output must be separate from every source campaign.');
  if (fs.existsSync(out)) {
    const stat = fs.lstatSync(out); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Choose an ordinary puzzle output directory.');
    if (!resume && fs.readdirSync(out).length) throw new Error('Choose a new or empty output folder; use --resume for an existing generation.');
    if (resume) for (const name of fs.readdirSync(out)) {
      const file = path.join(out, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile()
        || !(FILES.has(name) || /^(?:puzzles\.json|generation-report\.md|native-rules-mismatch\.json)\.[a-f0-9-]+\.tmp$/.test(name))) throw new Error('Foreign or linked puzzle output.');
    }
  } else if (resume) throw new Error('The puzzle generation directory does not exist.');
  return out;
}
function readAttempts(out) {
  const file = path.join(out, 'attempts.jsonl');
  if (!fs.existsSync(file)) return [];
  const bytes = fs.readFileSync(file), boundary = bytes.lastIndexOf(10) + 1;
  if (boundary !== bytes.length) fs.truncateSync(file, boundary); // Only our owned result journal, never source journals.
  const records = bytes.subarray(0, boundary).toString('utf8').split('\n').filter(Boolean).map(JSON.parse), seen = new Set();
  for (const row of records) {
    if (!/^[a-f0-9]{64}$/.test(row.id || '') || seen.has(row.id) || !['accepted', 'rejected', 'duplicate'].includes(row.status)) throw new Error('Invalid puzzle generation journal.');
    seen.add(row.id);
  }
  return records;
}
function summary(attempts, games, stopped) {
  const accepted = attempts.filter(row => row.status === 'accepted').length;
  return `# Puzzle generation\n\n${stopped ? 'Stopped safely; resume to continue.' : 'Bounded generation finished.'}\n\n${games} source games selected; ${attempts.length} candidate positions processed; ${accepted} verified puzzles.\n\nOnly completed checkmate games were replayed. Forced opening plies are excluded. Each accepted puzzle has an exhaustive legal-defense mate tree with one mating move per solver turn within the stated bound. Slower wins outside that bound are not ruled out. Work-limited proofs are rejected as unproven.\n\nPiece involvement includes stationary units whose removal changes the legal mate tree; this is a conservative tactical-effect tag, not a complete motif explanation. Search priors remain the source priors. No balance game or source file was changed.\n\nImport puzzles.json through the game's Puzzles menu. This pilot creates mate puzzles only; it does not assign a human difficulty rating.\n`;
}

async function generate({ sources, out, resume = false, settings, enginePath, signal, log = console.log,
  Engine = UciEngine, prove = proveMate, derive, validate, createGame } = {}) {
  if (!sources?.length) throw new Error('Select at least one completed panel source.');
  sources.forEach(source => source.verify());
  out = assertOutput(sources.map(source => fs.realpathSync(source.root)), out, resume);
  const engineSha256 = sha(fs.readFileSync(enginePath));
  assertCompatibleEngineHash(engineSha256);
  const identity = { format: FORMAT, sources: sourceReceipt(sources), engineSha256,
    analysis: ANALYSIS_FILES.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(ROOT, file))) })) };
  let owner;
  if (resume) {
    owner = JSON.parse(fs.readFileSync(path.join(out, 'generation.json'), 'utf8'));
    const { hash, ...payload } = owner;
    if (owner.schemaVersion !== 1 || hash !== sha(JSON.stringify(payload))) throw new Error('Puzzle generation ownership or settings changed.');
    if (!isDeepStrictEqual(owner.identity, identity)) throw new Error('Source evidence, engine or puzzle generator changed; preserve this run and use a new output.');
    settings = owner.settings;
  } else {
    const payload = { schemaVersion: 1, identity, settings, createdAt: new Date().toISOString() };
    owner = { ...payload, hash: sha(JSON.stringify(payload)) };
  }
  const games = planGames(sources, settings.maxGames);
  if (!games.length) throw new Error('No completed checkmate games are available in these sources.');
  fs.mkdirSync(out, { recursive: true });
  const lock = path.join(out, '.puzzle-generation.lock'); const fd = fs.openSync(lock, 'wx'); fs.closeSync(fd);
  let engine, temporary, stopped = false;
  try {
    if (!resume) fs.writeFileSync(path.join(out, 'generation.json'), JSON.stringify(owner, null, 2) + '\n', { flag: 'wx' });
    const attempts = readAttempts(out), done = new Set(attempts.map(row => row.id)), positions = new Set(attempts.map(row => row.positionKey));
    const profiles = {}, pack = () => ({ schemaVersion: 1, format: 'levelup-puzzle-pack', profiles,
      puzzles: attempts.filter(row => row.status === 'accepted').map(row => row.puzzle) });
    for (const attempt of attempts.filter(row => row.status === 'accepted')) profiles[attempt.puzzle.variant] = snapshotFor(sources.flatMap(row => row.contexts).find(row => row.profile.variant === attempt.puzzle.variant)?.profile || {});
    const exportPack = () => {
      sources.forEach(source => source.verify());
      const value = pack(); validate(value);
      atomic(path.join(out, 'puzzles.json'), JSON.stringify(value, null, 2) + '\n');
      atomic(path.join(out, 'generation-report.md'), summary(attempts, games.length, stopped));
    };
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-puzzle-engine-'));
    let activeProfile;
    outer: for (const game of games) {
      if (signal?.aborted) { stopped = true; break; }
      const candidates = await candidatesForGame(game, settings, signal);
      for (const candidate of candidates) {
        if (done.has(candidate.id)) continue;
        if (signal?.aborted) { stopped = true; break outer; }
        // The parsed source context stays fixed in memory. Avoid rereading
        // large USB journals on every rejected candidate; cheap lock checks
        // catch resumed collectors, and exports reverify the complete source.
        for (const source of sources) for (const file of source.files) if (file.absent
          && /(?:^|[\\/])(?:\.v19-panel\.lock|run\.lock)$/.test(file.file) && fs.existsSync(file.file)) throw new Error('Stop the resumed source panel before puzzle generation.');
        if (attempts.length >= settings.maxPositions || pack().puzzles.length >= settings.maxPuzzles) break outer;
        const { context, record } = game;
        let row;
        if (positions.has(candidate.key)) row = { id: candidate.id, positionKey: candidate.key, status: 'duplicate' };
        else {
          const snapshot = snapshotFor(context.profile);
          if (activeProfile !== context.profile.hash) {
            await engine?.close(); engine = undefined;
            const ini = path.join(temporary, `${context.profile.variant}.ini`); fs.writeFileSync(ini, context.profile.config);
            engine = new Engine({ path: enginePath, variantPath: ini, variant: context.profile.variant,
              options: { skill: 20, threads: 1, hash: 32, timeoutMs: settings.timeoutMs } });
            await engine.start({ signal }); activeProfile = context.profile.hash;
          }
          log(`Puzzle candidate ${attempts.length + 1}/${settings.maxPositions}: ${record.id}, ply ${candidate.ply}.`);
          const initialMoves = record.moves.slice(0, candidate.ply);
          const nativeMoves = await engine.perft({ fen: candidate.fen, signal });
          const board = candidate.rules.createBoard(candidate.fen);
          try {
            const parity = nativeParity({ nativeMoves, archivedMoves: board.moves(), fen: candidate.fen, profileHash: context.profile.hash });
            if (!parity.equal) {
              const details = { ...parity, candidateId: candidate.id, gameId: record.id, attempt: record.attempt, ply: candidate.ply,
                variant: context.profile.variant, profile: snapshot, source: context.identity, analysisEngineSha256: engineSha256,
                initialFen: record.startFen, initialMoves };
              const file = path.join(out, 'native-rules-mismatch.json');
              atomic(file, JSON.stringify(details, null, 2) + '\n');
              throw new Error(mismatchMessage(details, file));
            }
          }
          finally { board.dispose(); }
          const search = await engine.search({ fen: record.startFen, moves: initialMoves, nodes: settings.nodes, signal });
          const score = search.scoreInfo?.score || search.info?.score;
          row = { id: candidate.id, positionKey: candidate.key, status: 'rejected', reason: 'no-exact-mate-screen', search: { score, nodes: settings.nodes } };
          if (score?.type === 'mate' && !score.bound && score.value > 0 && score.value <= settings.maxMoves) {
            const proof = await prove({ rules: candidate.rules, initialFen: record.startFen, initialMoves, fen: candidate.fen,
              solverColor: candidate.solverColor, minMoves: settings.minMoves, maxMoves: settings.maxMoves,
              nodeLimit: settings.proofNodes, timeLimitMs: settings.proofMs, signal });
            row.reason = proof.status;
            if (proof.status === 'proved') {
              const puzzle = { id: `panel-${candidate.id.slice(0, 24)}`, title: `Mate in ${proof.moves}`, variant: context.profile.variant,
                initialFen: record.startFen, initialMoves, fen: candidate.fen, solverColor: candidate.solverColor,
                goal: { type: 'mate', moves: proof.moves }, solution: proof.solution,
                provenance: { kind: 'panel', runId: context.identity.runId, stageKey: context.identity.stageKey,
                  cohort: context.identity.cohort, gameId: record.id, attempt: record.attempt, ply: candidate.ply,
                  sourceProfileHash: context.profile.hash, sourceRegistryHash: context.profile.registryHash,
                  sourceEngineSha256: context.identity.engineSha256, analysisEngineSha256: engineSha256,
                  searchNodes: settings.nodes, proof, openingId: record.openingId } };
              puzzle.pieces = await derive(puzzle, { createGame });
              if (settings.variantOnly && !puzzle.pieces.involved.some(id => !STANDARD.has(id))) row.reason = 'no-tagged-upgrade-involvement';
              else { profiles[puzzle.variant] = snapshot; row = { ...row, status: 'accepted', reason: 'proved', puzzle }; }
            }
          }
        }
        fs.appendFileSync(path.join(out, 'attempts.jsonl'), JSON.stringify(row) + '\n');
        attempts.push(row); done.add(row.id); positions.add(row.positionKey);
        if (row.status === 'accepted') { exportPack(); log(`Verified puzzle ${pack().puzzles.length}/${settings.maxPuzzles}: ${row.puzzle.title}.`); }
      }
    }
    exportPack();
    log(`${stopped ? 'Paused' : 'Finished'}: ${pack().puzzles.length} verified puzzles in ${path.join(out, 'puzzles.json')}.`);
    return { out, pack: pack(), attempts, stopped };
  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) {
      stopped = true;
      const attempts = readAttempts(out), profiles = {};
      for (const row of attempts.filter(row => row.status === 'accepted')) profiles[row.puzzle.variant] = getProfileSnapshot(row.puzzle.variant);
      sources.forEach(source => source.verify());
      atomic(path.join(out, 'puzzles.json'), JSON.stringify({ schemaVersion: 1, format: 'levelup-puzzle-pack', profiles,
        puzzles: attempts.filter(row => row.status === 'accepted').map(row => row.puzzle) }, null, 2) + '\n');
      atomic(path.join(out, 'generation-report.md'), summary(attempts, games.length, true));
      log('Paused safely. Resume the same output to continue.'); return { out, stopped: true };
    }
    throw error;
  } finally {
    await engine?.close();
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    fs.unlinkSync(lock);
  }
}

module.exports = { FORMAT, ANALYSIS_FILES, latestCompleted, snapshotFor, sourceReceipt, planGames, candidatesForGame,
  assertOutput, readAttempts, generate, summary };
