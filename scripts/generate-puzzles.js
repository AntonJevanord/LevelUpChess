#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { assertCompatibleEngineHash, LEGACY_ENGINE_SHA256 } = require('./puzzles/native-parity');
const { loadPuzzleSources } = require('./puzzles/sources');
const { generate, planGames, assertOutput } = require('./puzzles/generate');
const DEFAULTS = Object.freeze({ minMoves: 1, maxMoves: 2, maxGames: 200, maxPositions: 600,
  maxPuzzles: 30, positionsPerGame: 3, nodes: 160000, proofNodes: 50000, proofMs: 5000, timeoutMs: 60000, variantOnly: true });
const HELP = `Generate verified mate puzzles from inactive version-19 panels

  npm.cmd run puzzles:generate -- --run PANEL_DIRECTORY --out NEW_DIRECTORY
  npm.cmd run puzzles:generate -- --run PANEL_DIRECTORY --resume OUTPUT_DIRECTORY
  npm.cmd run puzzles:generate -- --run PANEL_DIRECTORY --check

Repeat --run to include several original or expanded panels. Expanded reuse
keeps historical004 and new005 journals under their original profiles. The
whole run folder, ownership snapshot and journals are required. Stop its
workers first; this command never changes balance results or source files.

Options for a new output:
  --min-moves N        Minimum solver moves (default 1)
  --max-moves N        Maximum solver moves, 1–3 (default 2)
  --max-games N        Bound replayed completed checkmate games (default 200)
  --max-positions N    Bound analyzed candidate positions (default 600)
  --max-puzzles N      Stop after this many accepted puzzles (default 30)
  --positions-per-game N  Tail positions per game (default 3)
  --nodes N           Native candidate-screen budget (default 160000)
  --proof-nodes N     Exhaustive proof work cap per position (default 50000)
  --proof-ms N        Exhaustive proof time cap per position (default 5000)
  --all-pieces        Include puzzles without a tagged upgrade contribution
  --engine PATH       Compatible Fairy-Stockfish; or FAIRY_STOCKFISH_PATH

The pilot finds unique bounded mates, not general material-gain puzzles.
Each accepted solution includes every legal defense and one mating solver
move within the remaining bound. Slower wins outside it are not excluded.
Work-limited proofs remain unproven, never accepted. Source game history is
retained for repetition/draw checks. Stationary tactical-effect tags include
supports and blockers; they do not merely mean a piece appears on the board.

Generation uses one engine and does not start match games. Resume keeps its
original limits, engine and source evidence; repeat --run and omit limits.
Ctrl+C pauses safely. Import OUTPUT_DIRECTORY/puzzles.json in the Puzzles
menu. --check verifies source ownership and available games without an engine,
output files or puzzle generation. Keep the output folder for resume.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = { runs: [], settings: { ...DEFAULTS } }, seen = new Set();
  const numeric = { 'min-moves': ['minMoves', 1, 3], 'max-moves': ['maxMoves', 1, 3],
    'max-games': ['maxGames', 1, 1000000], 'max-positions': ['maxPositions', 1, 1000000],
    'max-puzzles': ['maxPuzzles', 1, 1000], 'positions-per-game': ['positionsPerGame', 1, 20],
    nodes: ['nodes', 1000, 100000000], 'proof-nodes': ['proofNodes', 1, 10000000], 'proof-ms': ['proofMs', 1, 600000] };
  let customSettings = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], key = flag?.slice(2);
    if (typeof flag !== 'string' || !flag.startsWith('--') || seen.has(key) && key !== 'run') throw new Error('Use each option once; --run may repeat. See --help.');
    seen.add(key);
    if (key === 'check') { options.check = true; continue; }
    if (key === 'all-pieces') { options.settings.variantOnly = false; customSettings = true; continue; }
    if (!['run', 'out', 'resume', 'engine', ...Object.keys(numeric)].includes(key)) throw new Error(`Unknown puzzle option: ${flag}.`);
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
    if (key === 'run') options.runs.push(value);
    else if (numeric[key]) {
      const [name, min, max] = numeric[key];
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`${flag} must be ${min}–${max}.`);
      options.settings[name] = Number(value); customSettings = true;
    } else options[key] = value;
  }
  if (!options.runs.length || [options.out, options.resume, options.check].filter(Boolean).length !== 1) throw new Error('Select --run and exactly one of --out, --resume or --check.');
  if (options.settings.minMoves > options.settings.maxMoves) throw new Error('--min-moves cannot exceed --max-moves.');
  if (options.resume && customSettings) throw new Error('Resume retains the original settings; omit generation limits.');
  if (options.check && (options.engine || customSettings)) throw new Error('--check uses source evidence only; omit engine and generation limits.');
  return options;
}
function resolveEngine(explicit, { platform = process.platform, env = process.env, root = path.resolve(__dirname, '..') } = {}) {
  const selected = explicit || env.FAIRY_STOCKFISH_PATH || (platform === 'win32' ? path.join(root, 'stockfish/fairy-stockfish-levelup_x86-64.exe') : null);
  if (!selected) throw new Error('Set FAIRY_STOCKFISH_PATH or pass --engine for the compatible native executable.');
  const engine = path.resolve(selected);
  if (!fs.statSync(engine).isFile()) throw new Error('Select a native engine executable file.');
  assertCompatibleEngineHash(createHash('sha256').update(fs.readFileSync(engine)).digest('hex'));
  return engine;
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args), log = dependencies.log || console.log;
  if (options.help) { log(HELP); return; }
  const controller = new AbortController(), abort = () => controller.abort();
  process.on('SIGINT', abort);
  try {
    const sources = options.runs.map(directory => (dependencies.load || loadPuzzleSources)(directory));
    if (options.check) {
      sources.forEach(source => source.verify());
      const games = planGames(sources, Number.MAX_SAFE_INTEGER);
      log(`Verified ${sources.length} inactive panel sources; ${games.length} distinct completed checkmate games available. No engines, puzzles or output files started.`);
      return { sources: sources.length, games: games.length };
    }
    assertOutput(sources.map(source => source.root), options.out || options.resume, Boolean(options.resume));
    const model = dependencies.model || require('../src/puzzle-data');
    const native = dependencies.rules || require('../dist/rules-node.cjs');
    const initialized = new Set();
    const createGame = async (fen, variant) => {
      if (!initialized.has(variant)) { await native.initVariantRules(variant); initialized.add(variant); }
      return new native.VariantGame(fen, variant);
    };
    return await (dependencies.generate || generate)({ sources, out: options.out || options.resume,
      resume: Boolean(options.resume), settings: options.settings, enginePath: resolveEngine(options.engine),
      signal: controller.signal, log, derive: model.derivePuzzlePieces, validate: model.validatePuzzlePack, createGame });
  } finally { process.removeListener('SIGINT', abort); }
}
if (require.main === module) main().catch(error => { console.error(`Puzzle generation: ${error.message}`); process.exitCode = 1; });
module.exports = { DEFAULTS, HELP, parseArgs, resolveEngine, assertCompatibleEngineHash, LEGACY_ENGINE_SHA256, main };
