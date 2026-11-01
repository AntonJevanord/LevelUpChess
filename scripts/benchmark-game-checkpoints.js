#!/usr/bin/env node
'use strict';

// Synthetic storage work only. This does not start an engine, play games or
// estimate full-campaign throughput. Results depend on the selected filesystem.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { openStore } = require('./balance/storage');

const HELP = `Checkpoint storage benchmark (no engines or scored games)

  node scripts/benchmark-game-checkpoints.js [--directory EXISTING_PARENT]
       [--games 4] [--plies 40] [--rounds 2] [--json]

Creates and removes one uniquely named scratch child under the selected parent.
Existing files are never used as output. Pause active disk-heavy work first for
an interpretable measurement. Both patterns retain identical durable results;
only the checkpoint frequency differs. This measures I/O, not whole-run speed.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const values = { directory: os.tmpdir(), games: 4, plies: 40, rounds: 2, json: false }, seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--directory', '--games', '--plies', '--rounds', '--json'].includes(flag) || seen.has(flag)) throw new Error('Unknown or repeated benchmark argument. Use --help.');
    seen.add(flag);
    if (flag === '--json') { values.json = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    if (flag === '--directory') values.directory = path.resolve(value);
    else {
      const maximum = flag === '--games' ? 100 : flag === '--plies' ? 400 : 10;
      if (!/^[1-9][0-9]*$/.test(value) || Number(value) > maximum) throw new Error(`${flag} must be an integer from 1 to ${maximum}.`);
      values[flag.slice(2)] = Number(value);
    }
  }
  return values;
}

function instrument(directory, operation) {
  const names = ['openSync', 'closeSync', 'writeFileSync', 'fsyncSync', 'renameSync'];
  const original = Object.fromEntries(names.map(name => [name, fs[name]])), handles = new Map();
  const counters = { checkpointReplacements: 0, checkpointBytes: 0, writes: 0, bytesWritten: 0, fileSyncs: 0, directorySyncs: 0 };
  const owns = file => file === directory || file.startsWith(directory + path.sep);
  fs.openSync = function(file, ...args) {
    const fd = original.openSync.call(fs, file, ...args);
    if (typeof file === 'string' && owns(path.resolve(file))) handles.set(fd, path.resolve(file));
    return fd;
  };
  fs.closeSync = function(fd) { const value = original.closeSync.call(fs, fd); handles.delete(fd); return value; };
  fs.writeFileSync = function(target, data, ...args) {
    const value = original.writeFileSync.call(fs, target, data, ...args);
    const file = typeof target === 'number' ? handles.get(target) : typeof target === 'string' ? path.resolve(target) : null;
    if (file && owns(file)) {
      const bytes = Buffer.byteLength(data);
      counters.writes++; counters.bytesWritten += bytes;
      if (path.basename(file).startsWith('.checkpoint.json.')) counters.checkpointBytes += bytes;
    }
    return value;
  };
  fs.fsyncSync = function(fd) {
    const value = original.fsyncSync.call(fs, fd);
    if (handles.has(fd)) counters[fs.fstatSync(fd).isDirectory() ? 'directorySyncs' : 'fileSyncs']++;
    return value;
  };
  fs.renameSync = function(from, to) {
    const value = original.renameSync.call(fs, from, to);
    if (path.resolve(to) === path.join(directory, 'checkpoint.json')) counters.checkpointReplacements++;
    return value;
  };
  const start = process.hrtime.bigint();
  try {
    const result = operation();
    return { ...counters, elapsedMs: Number(process.hrtime.bigint() - start) / 1e6, ...result };
  } finally { for (const name of names) fs[name] = original[name]; }
}

function measurePattern(directory, { games, plies, pattern }) {
  if (!['per-move', 'game-boundary'].includes(pattern)) throw new Error('Unknown checkpoint pattern.');
  fs.mkdirSync(directory);
  const manifest = { schemaVersion: 1, runId: 'synthetic-checkpoint-storage',
    configHash: 'synthetic-only', rulesHash: 'synthetic-only', engineSha256: 'no-engine', synthetic: true };
  const result = instrument(directory, () => {
    const store = openStore({ outDir: directory, manifest });
    const pgns = [];
    try {
      for (let game = 0; game < games; game++) {
        const moves = [], sans = [], current = { id: `synthetic-${game + 1}`, attempt: 1,
          startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves, sans };
        if (pattern === 'per-move') store.saveCheckpoint({ schemaVersion: 1, nextIndex: game, current });
        for (let ply = 0; ply < plies; ply++) {
          // Repetitions are intentional byte fixtures, not legal game evidence.
          moves.push(['g1f3', 'g8f6', 'f3g1', 'f6g8'][ply % 4]);
          sans.push(['Nf3', 'Nf6', 'Ng1', 'Ng8'][ply % 4]);
          if (pattern === 'per-move') store.saveCheckpoint({ schemaVersion: 1, nextIndex: game, current });
        }
        store.append({ ...current, status: 'truncated', result: '*', reason: 'synthetic-storage-benchmark', synthetic: true });
        store.saveCheckpoint({ schemaVersion: 1, nextIndex: game + 1, current: null });
        store.saveSummary({ synthetic: true, finalizedGames: game + 1, statusCounts: { truncated: game + 1 } });
        pgns.push(`[Event "Synthetic storage benchmark; not played"]\n\n${sans.join(' ')} *\n`);
        store.savePgn(pgns.join('\n'));
      }
    } finally { store.close(); }
    const journal = fs.readFileSync(path.join(directory, 'games.jsonl'));
    return { resultBytes: journal.length, resultSha256: createHash('sha256').update(journal).digest('hex') };
  });
  return { pattern, ...result };
}

function median(values) { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function benchmark({ directory = os.tmpdir(), games = 4, plies = 40, rounds = 2 } = {}) {
  for (const [name, value, maximum] of [['games', games, 100], ['plies', plies, 400], ['rounds', rounds, 10]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} is outside the benchmark bound.`);
  }
  const parent = path.resolve(directory);
  if (!fs.statSync(parent).isDirectory()) throw new Error('Select an existing parent directory.');
  const scratch = fs.mkdtempSync(path.join(parent, '.levelup-checkpoint-benchmark-'));
  const measurements = [];
  try {
    for (let round = 0; round < rounds; round++) {
      const order = round % 2 ? ['game-boundary', 'per-move'] : ['per-move', 'game-boundary'];
      for (const pattern of order) measurements.push({ round: round + 1,
        ...measurePattern(path.join(scratch, `${round + 1}-${pattern}`), { games, plies, pattern }) });
    }
    if (new Set(measurements.map(row => row.resultSha256)).size !== 1) throw new Error('The storage patterns did not retain identical result journals.');
    const summaries = ['per-move', 'game-boundary'].map(pattern => {
      const selected = measurements.filter(row => row.pattern === pattern), first = selected[0];
      return { pattern, checkpointReplacements: first.checkpointReplacements, checkpointBytes: first.checkpointBytes,
        fileSyncs: first.fileSyncs, directorySyncs: first.directorySyncs, bytesWritten: first.bytesWritten,
        medianElapsedMs: median(selected.map(row => row.elapsedMs)) };
    });
    return { schemaVersion: 1, format: 'levelup-checkpoint-storage-benchmark', synthetic: true,
      measurementsOnly: 'Actual filesystem I/O with synthetic histories; no engine searches, played games or whole-campaign speed claim.',
      settings: { directory: parent, games, plies, rounds }, summaries, measurements,
      checkpointReductionPercent: 100 * (1 - summaries[1].checkpointReplacements / summaries[0].checkpointReplacements),
      fileSyncReductionPercent: 100 * (1 - summaries[1].fileSyncs / summaries[0].fileSyncs),
      ioOnlyElapsedReductionPercent: 100 * (1 - summaries[1].medianElapsedMs / summaries[0].medianElapsedMs),
      scratchRemoved: true };
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}

function main(args = process.argv.slice(2), log = console.log) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const report = benchmark(options);
  if (options.json) log(JSON.stringify(report, null, 2));
  else {
    log(`Synthetic checkpoint I/O: ${options.games} games × ${options.plies} plies; ${options.rounds} alternating rounds.`);
    for (const row of report.summaries) log(`${row.pattern}: ${row.checkpointReplacements} checkpoint replacements, ${row.fileSyncs} file flushes, ${row.bytesWritten} written bytes; median ${row.medianElapsedMs.toFixed(1)} ms.`);
    log(`Checkpoint writes reduced ${report.checkpointReductionPercent.toFixed(1)}%; measured I/O-only elapsed time reduced ${report.ioOnlyElapsedReductionPercent.toFixed(1)}%.`);
    log('This does not measure full-game speed or guarantee the same improvement on another drive. Scratch files removed.');
  }
  return report;
}
if (require.main === module) { try { main(); } catch (error) { console.error(`Checkpoint benchmark: ${error.message}`); process.exitCode = 1; } }
module.exports = { HELP, parseArgs, measurePattern, benchmark, main };
