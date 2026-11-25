'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { UciEngine } = require('../balance/uci');
const { renameWithRetrySync } = require('../balance/files');
const { acquireLock } = require('../balance/storage');
const { sourceReceipt, snapshotFor } = require('./generate');
const { planMiningGames, candidatesForMiningGame } = require('./mining-sources');
const { proveMate } = require('./mate-proof');
const model = require('../../src/puzzle-data');

const ROOT = path.resolve(__dirname, '../..');
const FORMAT = 'levelup-puzzle-mining-v2';
const FILES = new Set(['mining.json', 'candidates.jsonl', 'puzzles.json', 'mining-report.md', '.puzzle-mining.lock', '.puzzle-mining.lock.reclaim']);
const ANALYSIS_FILES = ['scripts/mine-puzzles.js', 'scripts/puzzles/mining.js', 'scripts/puzzles/mining-sources.js',
  'scripts/puzzles/mate-proof.js', 'scripts/puzzles/material-proof.js', 'scripts/puzzles/variant-relevance.js',
  'scripts/puzzles/sources.js', 'scripts/puzzles/generate.js', 'scripts/balance/storage.js', 'scripts/balance/files.js', 'scripts/balance/uci.js',
  'src/puzzle-data.js', 'dist/rules-node.cjs'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function atomic(file, contents) {
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) throw new Error('Refusing to replace linked mining output.');
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(tmp, contents, { flag: 'wx' }); renameWithRetrySync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function assertOutput(sources, selected, resume) {
  const out = path.resolve(selected); let ancestor = out;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const canonical = path.join(fs.realpathSync(ancestor), path.relative(ancestor, out));
  const inside = (a, b) => a === b || b.startsWith(a + path.sep);
  for (const source of sources) {
    const root = fs.realpathSync(source.root);
    if (inside(root, canonical) || inside(canonical, root)) throw new Error('Mining output must be separate from its source panels.');
  }
  if (!fs.existsSync(out)) { if (resume) throw new Error('Mining output does not exist.'); return out; }
  const stat = fs.lstatSync(out);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Select an ordinary mining output directory.');
  for (const name of fs.readdirSync(out)) {
    const file = path.join(out, name), item = fs.lstatSync(file);
    if (!resume || !item.isFile() || item.isSymbolicLink()
      || !(FILES.has(name) || /^(?:puzzles\.json|mining-report\.md)\.[a-f0-9-]+\.tmp$/.test(name))) throw new Error('Use a new output directory or resume its original mining run.');
  }
  return out;
}
function readJournal(out) {
  const file = path.join(out, 'candidates.jsonl'); if (!fs.existsSync(file)) return [];
  const bytes = fs.readFileSync(file), boundary = bytes.lastIndexOf(10) + 1;
  if (boundary < bytes.length) fs.truncateSync(file, boundary);
  const rows = bytes.subarray(0, boundary).toString('utf8').split('\n').filter(Boolean).map(JSON.parse), seen = new Set();
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/.test(row.id || '') || seen.has(row.id)
      || !['verified', 'rejected', 'duplicate'].includes(row.status)) throw new Error('Invalid mining candidate journal.');
    if (row.status === 'verified' && !['exclusive', 'ordinary'].includes(row.puzzle?.relevance?.classification)) throw new Error('Verified mining candidate has no conclusive relevance classification.');
    seen.add(row.id);
  }
  return rows;
}
/** Select a rounded target mix without ever treating unknown as exclusive.
 * All verified overflow stays in the journal, even when it is not exported. */
function selectMix(rows, share, maximum) {
  const candidates = rows.filter(row => row.status === 'verified').map(row => row.puzzle);
  const exclusive = candidates.filter(puzzle => puzzle.relevance.classification === 'exclusive');
  const ordinary = candidates.filter(puzzle => puzzle.relevance.classification === 'ordinary');
  for (let count = Math.min(maximum, candidates.length); count >= 0; count--) {
    const wanted = Math.round(count * share / 100), plain = count - wanted;
    if (exclusive.length >= wanted && ordinary.length >= plain) {
      // Interleave the two classes deterministically rather than placing all
      // ordinary puzzles together at the end of a generated pack.
      const selected = []; let e = 0, o = 0;
      for (let i = 0; i < count; i++) {
        const nextExclusive = Math.round((i + 1) * wanted / count) > e;
        selected.push(nextExclusive ? exclusive[e++] : ordinary[o++]);
      }
      return { puzzles: selected, available: { exclusive: exclusive.length, ordinary: ordinary.length },
        selected: { exclusive: wanted, ordinary: plain }, requestedShare: share,
        actualShare: count ? wanted * 100 / count : null, target: maximum,
        shortage: count < maximum };
    }
  }
  throw new Error('The mining mix could not be constructed.');
}
function renderReport(rows, mix, gameCount, stopped) {
  const reasons = new Map();
  for (const row of rows.filter(row => row.status !== 'verified')) reasons.set(row.reason || row.status, (reasons.get(row.reason || row.status) || 0) + 1);
  const goals = new Map(); for (const puzzle of mix.puzzles) {
    const key = `${puzzle.goal.type}, ${puzzle.goal.moves} solver moves`; goals.set(key, (goals.get(key) || 0) + 1);
  }
  return `# Puzzle mining\n\n${stopped ? 'Paused safely; resume to continue.' : 'Bounded mining finished.'}\n\n`
    + `${gameCount} completed games selected; ${rows.length} candidates processed; ${mix.puzzles.length}/${mix.target} puzzles exported.\n\n`
    + `Requested variant-specific share: ${mix.requestedShare}%. Exported: ${mix.selected.exclusive} exclusive / ${mix.selected.ordinary} ordinary (${mix.actualShare === null ? 'no pack yet' : mix.actualShare.toFixed(1) + '% exclusive'}). Counts are rounded for the finite pack.\n\n`
    + `Verified bank: ${mix.available.exclusive} exclusive / ${mix.available.ordinary} ordinary. ${mix.shortage ? 'The target mix is not filled; overflow is retained and unknown checks are never relabeled to fill it.' : 'Target pack filled.'}\n\n`
    + (mix.sizeLimited ? `The ${model.MAX_PACK_BYTES / 1024 / 1024} MiB browser import cap limits this export; verified overflow remains in the journal.\n\n` : '')
    + '| Exported goal | Puzzles |\n| --- | ---: |\n' + [...goals].map(([goal, count]) => `| ${goal} | ${count} |`).join('\n')
    + '\n\n| Other candidate decisions | Count |\n| --- | ---: |\n' + [...reasons].map(([reason, count]) => `| ${reason} | ${count} |`).join('\n')
    + '\n\nMate certificates test every legal defense within the declared bound. Material certificates use the declared base-plus-level counting scale and bounded tactical settling; quiet strategic threats beyond that audit are not certified. Native screening is Skill 20 regardless of source playing skill.\n\n'
    + 'Variant-specific means the stated goal fails with ordinary family movement at the same root position under the recorded comparison assumptions and bounds. Stationary effects can matter. An ordinary ladder mate remains ordinary; grant packages without a defined ordinary counterpart and work-limited comparisons remain unknown. This is not a claim about eventual game value.\n\n'
    + 'No balance outcomes, search priors or source files changed. Import puzzles.json through Menu → Puzzles.\n';
}
function hasTacticalPv(candidate, pv, limit) {
  if (!Array.isArray(pv)) return false;
  const board = candidate.rules.createBoard(candidate.fen);
  try {
    for (const move of pv.slice(0, limit)) {
      if (!board.moves().includes(move)) break;
      if (board.san(move).includes('x') || /^[a-h][1-8][a-h][1-8][a-z]$/.test(move)) return true;
      if (!board.push(move) || board.outcome()) break;
    }
    return false;
  } finally { board.dispose(); }
}
// Proof work may exceed the viewer's portable-certificate limit. Reject just
// that candidate before replay/tagging rather than treating an otherwise
// expected long proof as a fatal mining error. Other validation errors remain
// fatal. Count exactly the solver/core and settling nodes used by puzzle-data.
function certificateExceedsLimit(puzzle) {
  const stack = [{ node: puzzle.solution, kind: puzzle.goal.type === 'mate' ? 'mate' : 'core' }];
  let count = 0;
  while (stack.length) {
    const { node, kind } = stack.pop();
    if (++count > model.MAX_TREE_NODES) return true;
    if (!node || typeof node !== 'object') continue; // Normal validation reports malformed proofs.
    if (kind === 'mate') {
      for (const reply of node.replies || []) stack.push({ node: reply.next, kind });
    } else if (kind === 'core') {
      for (const reply of node.replies || []) {
        if (reply.next) stack.push({ node: reply.next, kind });
        else if (reply.leaf) stack.push({ node: reply.leaf.settlement, kind: 'settlement' });
      }
    } else if (node.kind === 'probe' || node.kind === 'choice') stack.push({ node: node.next, kind });
    else if (node.kind === 'defenses') for (const reply of node.replies || []) stack.push({ node: reply.next, kind });
  }
  return false;
}
async function mine({ sources, out, resume = false, settings, enginePath, signal, createGame, log = console.log,
  Engine = UciEngine, mateProof = proveMate,
  materialProof = (...args) => require('./material-proof').proveMaterial(...args),
  classify = (...args) => require('./variant-relevance').classifyVariantRelevance(...args),
  derive = model.derivePuzzlePieces, validate = model.validatePuzzlePack } = {}) {
  if (!sources?.length || typeof createGame !== 'function') throw new Error('Mining needs source panels and a trusted replay factory.');
  sources.forEach(source => source.verify()); out = assertOutput(sources, out, resume);
  const identity = { format: FORMAT, engineSha256: sha(fs.readFileSync(enginePath)), sources: sourceReceipt(sources),
    analysis: ANALYSIS_FILES.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(ROOT, file))) })),
    privateRules: [require.resolve('ffish-es6'), path.join(path.dirname(require.resolve('ffish-es6')), 'ffish.wasm')]
      .map(file => ({ file: path.relative(ROOT, file).split(path.sep).join('/'), sha256: sha(fs.readFileSync(file)) })) };
  let owner;
  if (resume) {
    owner = json(path.join(out, 'mining.json')); const { hash, ...payload } = owner;
    if (owner.schemaVersion !== 1 || hash !== sha(JSON.stringify(payload)) || !isDeepStrictEqual(owner.identity, identity)) throw new Error('Mining source, engine, code or ownership changed; preserve this output and start a new run.');
    settings = owner.settings;
  } else {
    const payload = { schemaVersion: 1, identity, settings, createdAt: new Date().toISOString() };
    owner = { ...payload, hash: sha(JSON.stringify(payload)) };
  }
  const games = planMiningGames(sources, settings.maxGames);
  if (!games.length) throw new Error('No completed source games are available.');
  fs.mkdirSync(out, { recursive: true });
  const unlock = acquireLock(out, owner.hash, '.puzzle-mining.lock');
  let engine, temporary, stopped = false, rows;
  function exportPack() {
    sources.forEach(source => source.verify());
    const construct = mix => {
      const profiles = {};
      for (const puzzle of mix.puzzles) profiles[puzzle.variant] = model.getProfileSnapshot(puzzle.variant);
      const pack = { schemaVersion: 1, format: model.FORMAT, profiles, puzzles: mix.puzzles,
        mining: { requestedVariantShare: settings.variantShare, actualVariantShare: mix.actualShare,
          selected: mix.selected, available: mix.available, target: settings.maxPuzzles } };
      return { pack, content: JSON.stringify(pack, null, 2) + '\n' };
    };
    let mix = selectMix(rows, settings.variantShare, settings.maxPuzzles), built = construct(mix);
    if (Buffer.byteLength(built.content) > model.MAX_PACK_BYTES) {
      // Both class prefixes grow with the quota. Binary search keeps the
      // largest importable rounded mix without repeatedly serializing a huge
      // bank or discarding any accepted certificate from the journal.
      let low = 0, high = mix.puzzles.length - 1, best;
      while (low <= high) {
        const cap = Math.floor((low + high) / 2), trial = selectMix(rows, settings.variantShare, cap), value = construct(trial);
        if (Buffer.byteLength(value.content) <= model.MAX_PACK_BYTES) { best = { mix: trial, built: value }; low = cap + 1; }
        else high = cap - 1;
      }
      if (!best) throw new Error('The mining pack metadata exceeds the browser import cap.');
      mix = { ...best.mix, target: settings.maxPuzzles, shortage: true, sizeLimited: true }; built = best.built;
    }
    const { pack, content } = built;
    validate(pack);
    atomic(path.join(out, 'puzzles.json'), content);
    atomic(path.join(out, 'mining-report.md'), renderReport(rows, mix, games.length, stopped));
    return pack;
  }
  try {
    if (!resume) fs.writeFileSync(path.join(out, 'mining.json'), JSON.stringify(owner, null, 2) + '\n', { flag: 'wx' });
    rows = readJournal(out); const done = new Set(rows.map(row => row.id)), positions = new Set(rows.map(row => row.positionKey));
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-puzzle-mining-')); let activeProfile;
    outer: for (const game of games) {
      if (signal?.aborted) { stopped = true; break; }
      if (rows.length >= settings.maxPositions || selectMix(rows, settings.variantShare, settings.maxPuzzles).puzzles.length >= settings.maxPuzzles) break;
      const candidates = await candidatesForMiningGame(game, settings, signal);
      for (const candidate of candidates) {
        if (done.has(candidate.id)) continue;
        if (signal?.aborted) { stopped = true; break outer; }
        if (rows.length >= settings.maxPositions || selectMix(rows, settings.variantShare, settings.maxPuzzles).puzzles.length >= settings.maxPuzzles) break outer;
        for (const source of sources) for (const file of source.files) if (file.absent && /(?:^|[\\/])(?:\.v19-panel\.lock|run\.lock)$/.test(file.file) && fs.existsSync(file.file)) throw new Error('Stop source workers before continuing puzzle mining.');
        const { context, record } = game; let row = { id: candidate.id, positionKey: candidate.key, status: 'rejected' };
        if (positions.has(candidate.key)) row = { ...row, status: 'duplicate', reason: 'duplicate-position' };
        else {
          snapshotFor(context.profile);
          if (activeProfile !== context.profile.hash) {
            await engine?.close(); engine = undefined;
            const ini = path.join(temporary, context.profile.variant + '.ini'); fs.writeFileSync(ini, context.profile.config);
            engine = new Engine({ path: enginePath, variantPath: ini, variant: context.profile.variant,
              options: { skill: 20, threads: 1, hash: 32, timeoutMs: settings.timeoutMs } });
            await engine.start({ signal }); activeProfile = context.profile.hash;
          }
          log(`Mining candidate ${rows.length + 1}/${settings.maxPositions}: ${record.id}, ply ${candidate.ply}.`);
          const native = await engine.perft({ fen: candidate.fen, signal }), board = candidate.rules.createBoard(candidate.fen);
          try { if (!isDeepStrictEqual([...native].sort(), [...board.moves()].sort())) throw new Error('Native and archived puzzle rules disagree.'); }
          finally { board.dispose(); }
          const initialMoves = record.moves.slice(0, candidate.ply);
          const search = await engine.search({ fen: record.startFen, moves: initialMoves, nodes: settings.nodes, signal });
          const info = search.scoreInfo || search.info, score = info?.score, pv = info?.pv || [];
          row.search = { score, nodes: settings.nodes, pv };
          const base = { rules: candidate.rules, profile: context.profile, initialFen: record.startFen, initialMoves,
            fen: candidate.fen, solverColor: candidate.solverColor, minMoves: settings.minMoves, maxMoves: settings.maxMoves,
            nodeLimit: settings.proofNodes, timeLimitMs: settings.proofMs, signal,
            preferredMoves: search.move ? [search.move] : [], pv: pv.slice(0, 32) };
          let proof, goal;
          if (settings.goals.includes('mate') && score?.type === 'mate' && !score.bound && score.value > 0 && score.value <= settings.maxMoves) {
            proof = await mateProof(base);
            if (proof.status === 'proved') goal = { type: 'mate', moves: proof.moves };
          } else if (settings.goals.includes('material') && score?.type === 'cp' && !score.bound && hasTacticalPv(candidate, pv, settings.maxMoves * 2)) {
            proof = await materialProof({ ...base, minimumGain: settings.minimumGain, settlePlies: settings.settlePlies });
            if (proof.status === 'proved') goal = proof.goal;
          }
          row.reason = proof?.status || 'no-tactical-screen';
          if (goal) {
            const puzzle = { id: `mined-${sha(JSON.stringify([context.profile.hash, candidate.fen, goal, proof.solution])).slice(0, 24)}`,
              title: goal.type === 'mate' ? `Mate in ${goal.moves}` : `Win at least ${goal.minimumGain / 100} material points`,
              variant: context.profile.variant, initialFen: record.startFen, initialMoves, fen: candidate.fen,
              solverColor: candidate.solverColor, goal, solution: proof.solution,
              provenance: { kind: 'panel', runId: context.identity.runId, stageKey: context.identity.stageKey,
                cohort: context.identity.cohort, gameId: record.id, attempt: record.attempt, ply: candidate.ply,
                sourceProfileHash: context.profile.hash, sourceRegistryHash: context.profile.registryHash,
                sourceEngineSha256: context.identity.engineSha256, analysisEngineSha256: identity.engineSha256,
                searchNodes: settings.nodes, proof, openingId: record.openingId } };
            if (certificateExceedsLimit(puzzle)) row.reason = 'certificate-tree-limit';
            else {
              puzzle.pieces = await derive(puzzle, { createGame });
              puzzle.relevance = await classify({ puzzle, profile: context.profile, rulesFactory: context.rulesFactory,
                nodeLimit: settings.proofNodes, timeLimitMs: settings.proofMs, signal });
              if (['exclusive', 'ordinary'].includes(puzzle.relevance.classification)) row = { ...row, status: 'verified', reason: 'verified', puzzle };
              else row.reason = 'unknown-variant-relevance';
              row.relevance = puzzle.relevance;
            }
          }
        }
        fs.appendFileSync(path.join(out, 'candidates.jsonl'), JSON.stringify(row) + '\n');
        rows.push(row); done.add(row.id); positions.add(row.positionKey);
        if (row.status === 'verified') {
          const pack = exportPack();
          log(`Verified ${row.puzzle.goal.type} (${row.puzzle.relevance.classification}); pack ${pack.puzzles.length}/${settings.maxPuzzles}, bank ${rows.filter(item => item.status === 'verified').length}.`);
        }
      }
    }
    const pack = exportPack(); log(`${stopped ? 'Paused' : 'Finished'}: ${pack.puzzles.length} puzzles in ${path.join(out, 'puzzles.json')}.`);
    return { pack, rows, stopped, out };
  } catch (error) {
    if (error.name !== 'AbortError' && !signal?.aborted) throw error;
    stopped = true; if (rows) exportPack();
    log('Mining paused safely. Resume the same output to continue.'); return { stopped: true, out };
  } finally {
    try { await engine?.close(); }
    finally {
      try { if (temporary) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
      finally { unlock(); }
    }
  }
}
module.exports = { FORMAT, FILES, ANALYSIS_FILES, assertOutput, readJournal, selectMix, renderReport, hasTacticalPv, certificateExceedsLimit, mine };
