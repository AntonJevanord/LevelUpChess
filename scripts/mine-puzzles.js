#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { loadPuzzleSources } = require('./puzzles/sources');
const { resolveEngine } = require('./generate-puzzles');
const DEFAULTS = Object.freeze({ minMoves: 2, maxMoves: 3, goals: ['mate', 'material'], variantShare: 90,
  maxGames: 400, maxPositions: 1200, maxPuzzles: 30, positionsPerGame: 12,
  nodes: 320000, proofNodes: 500000, proofMs: 15000, timeoutMs: 60000,
  minimumGain: 200, settlePlies: 4 });
const HELP = `Mine longer mates and material tactics from completed version-19 panels

  npm.cmd run puzzles:mine -- --run PANEL --out NEW_DIRECTORY
  npm.cmd run puzzles:mine -- --run PANEL --out NEW_DIRECTORY --goals mate --min-moves 3 --max-moves 4
  npm.cmd run puzzles:mine -- --run PANEL --resume OUTPUT_DIRECTORY
  npm.cmd run puzzles:mine -- --run PANEL --check

Repeat --run for several original/expanded panels. Sources stay read only;
stop their workers first. Reused games retain their original profiles.

New-run options:
  --goals mate,material   Both types by default; or mate / material
  --min-moves N          Minimum solver moves (default 2)
  --max-moves N          Maximum solver moves, 1–5 (default 3)
  --variant-share N      Target percent requiring upgraded movement (default 90)
  --minimum-gain N       Material-point gain, in hundredths (default 200)
  --max-games N          Completed games sampled (default 400)
  --max-positions N      Candidate analysis cap (default 1200)
  --max-puzzles N        Exported pack cap (default 30, maximum 1000)
  --positions-per-game N Candidate sample across both colors (default 12)
  --nodes N             Skill-20 screening budget (default 320000)
  --proof-nodes N        Work cap per proof/counterfactual (default 500000)
  --proof-ms N           Time cap per proof (default 15000)
  --engine PATH         Or FAIRY_STOCKFISH_PATH; Windows uses bundled engine

Each accepted puzzle has a legal-defense certificate. Material certificates
use a declared base-plus-level counting scale and a bounded capture/check
settling audit, not measured fairy-piece values or a proof against every
future strategic threat. Longer proofs can remain unproven on their caps.

Variant relevance is tested by replacing upgraded movement with ordinary
family movement at the same position. A conventional ladder mate counts as
ordinary. Unknown counterfactuals never count as exclusive. Finite pack
quotas are rounded; shortages are reported, not filled by relabeling puzzles.
Verified overflow candidates remain in the mining journal.

Ctrl+C pauses safely; resume retains original limits, code, engine and sources.
Import OUTPUT_DIRECTORY/puzzles.json through Menu → Puzzles. --check starts
no engine searches or output files. This command never collects balance games.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = { runs: [], settings: { ...DEFAULTS, goals: [...DEFAULTS.goals] } }, seen = new Set();
  const numbers = { 'min-moves': ['minMoves', 1, 5], 'max-moves': ['maxMoves', 1, 5],
    'variant-share': ['variantShare', 0, 100], 'minimum-gain': ['minimumGain', 100, 3000],
    'max-games': ['maxGames', 1, 1000000], 'max-positions': ['maxPositions', 1, 1000000],
    'max-puzzles': ['maxPuzzles', 1, 1000], 'positions-per-game': ['positionsPerGame', 1, 64],
    nodes: ['nodes', 1000, 100000000], 'proof-nodes': ['proofNodes', 1, 10000000], 'proof-ms': ['proofMs', 1, 600000] };
  let changed = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], key = flag?.slice(2);
    if (!flag?.startsWith('--') || seen.has(key) && key !== 'run') throw new Error('Invalid or repeated mining option. See --help.');
    seen.add(key);
    if (key === 'check') { options.check = true; continue; }
    if (!['run', 'out', 'resume', 'engine', 'goals', ...Object.keys(numbers)].includes(key)) throw new Error(`Unknown option ${flag}.`);
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
    if (key === 'run') options.runs.push(value);
    else if (numbers[key]) {
      const [name, min, max] = numbers[key];
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`${flag} must be ${min}–${max}.`);
      options.settings[name] = Number(value); changed = true;
    } else if (key === 'goals') {
      const goals = value.split(',');
      if (!goals.length || new Set(goals).size !== goals.length || goals.some(goal => !['mate', 'material'].includes(goal))) throw new Error('Choose --goals mate,material, mate or material.');
      options.settings.goals = goals; changed = true;
    } else options[key] = value;
  }
  if (!options.runs.length || [options.out, options.resume, options.check].filter(Boolean).length !== 1) throw new Error('Select --run and exactly one of --out, --resume or --check.');
  if (options.settings.minMoves > options.settings.maxMoves) throw new Error('Minimum moves exceed maximum moves.');
  if (options.resume && changed) throw new Error('Resume keeps its original mining settings; omit new limits.');
  if (options.check && (changed || options.engine)) throw new Error('--check only reads the sources; omit analysis settings.');
  return options;
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args), log = dependencies.log || console.log;
  if (options.help) { log(HELP); return; }
  const sources = options.runs.map(root => (dependencies.load || loadPuzzleSources)(root));
  if (options.check) {
    sources.forEach(source => source.verify());
    const games = require('./puzzles/mining-sources').planMiningGames(sources, Number.MAX_SAFE_INTEGER);
    log(`Verified ${sources.length} inactive sources; ${games.length} distinct completed games, including draws. No output or searches started.`);
    return { games: games.length };
  }
  const controller = new AbortController(), stop = () => controller.abort();
  process.on('SIGINT', stop);
  try {
    const native = dependencies.native || require('../dist/rules-node.cjs'), initialized = new Set();
    const createGame = async (fen, variant) => {
      if (variant === 'chess') return new (require('chess.js').Chess)(fen);
      if (!initialized.has(variant)) { await native.initVariantRules(variant); initialized.add(variant); }
      return new native.VariantGame(fen, variant);
    };
    return await (dependencies.mine || require('./puzzles/mining').mine)({ sources, out: options.out || options.resume,
      resume: Boolean(options.resume), settings: options.settings, enginePath: resolveEngine(options.engine),
      signal: controller.signal, log, createGame });
  } finally { process.removeListener('SIGINT', stop); }
}
if (require.main === module) main().catch(error => { console.error(`Puzzle mining: ${error.message}`); process.exitCode = 1; });
module.exports = { DEFAULTS, HELP, parseArgs, main };
