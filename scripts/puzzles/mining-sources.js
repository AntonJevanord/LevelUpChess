'use strict';

// Broad puzzle mining has its own sampler. The original mate-tail pilot and
// its source/decision identities remain unchanged.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { positionKey, cancelled } = require('./mate-proof');

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function planMiningGames(sources, maxGames) {
  if (!Array.isArray(sources) || !sources.length || !Number.isSafeInteger(maxGames) || maxGames < 1) throw new Error('Select puzzle sources and a positive completed-game limit.');
  const seen = new Map();
  for (const source of sources) for (const context of source.contexts || []) {
    const latest = new Map();
    for (const record of context.records || []) {
      const previous = latest.get(record.id);
      if (!previous || record.attempt > previous.attempt) latest.set(record.id, record);
      else if (record.attempt === previous.attempt && !isDeepStrictEqual(previous, record)) throw new Error('Conflicting copies of a mining source attempt.');
    }
    for (const record of latest.values()) {
      if (record.status !== 'completed') continue;
      if (!RESULTS.has(record.result)) throw new Error('A completed mining source game has an invalid result.');
      const identity = [context.identity?.runId, context.identity?.stageKey, record.id, record.attempt];
      const id = hash(identity), previous = seen.get(id);
      if (previous && !isDeepStrictEqual(previous.record, record)) throw new Error('Conflicting copies of a mining source game.');
      if (!previous) seen.set(id, { id, context, record });
    }
  }
  // Bound the cross-source sample before grouping it for economical native
  // analysis. Profile ordering cannot decide which games enter the sample.
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, maxGames)
    .sort((a, b) => a.context.profile.hash.localeCompare(b.context.profile.hash) || a.id.localeCompare(b.id));
}

function evenly(rows, count) {
  if (count <= 0 || !rows.length) return [];
  if (count >= rows.length) return [...rows];
  return Array.from({ length: count }, (_, index) => rows[Math.min(rows.length - 1,
    Math.floor((index + 1) * rows.length / (count + 1)))]);
}

function sampleColor(rows, count, maxMoves) {
  const selected = new Map(), take = values => {
    for (const row of values) if (selected.size < count) selected.set(row.id, row);
  };
  if (!count) return [];
  const share = Math.max(1, Math.floor(count / 3));
  take(evenly(rows, share));
  const remaining = () => rows.filter(row => !selected.has(row.id));
  const tail = rows.slice(-Math.max(3, maxMoves * 2));
  take(evenly(tail.filter(row => !selected.has(row.id)), share));
  take(remaining().filter(row => row.tacticalScore > 0)
    .sort((a, b) => b.tacticalScore - a.tacticalScore || a.id.localeCompare(b.id)).slice(0, share));
  take(evenly(remaining(), count - selected.size));
  return [...selected.values()];
}

function selectPositions(positions, count, maxMoves) {
  if (positions.length <= count) return [...positions];
  const byColor = Object.fromEntries(['w', 'b'].map(color => [color, positions.filter(row => row.solverColor === color)]));
  const selected = [];
  // Both colors receive an equal starting quota where the bound permits it.
  // Remainders are filled from the unselected pool without weighting the
  // eventual winner or pretending that the recorded continuation is best.
  for (const color of ['w', 'b']) selected.push(...sampleColor(byColor[color], Math.floor(count / 2), maxMoves));
  const used = new Set(selected.map(row => row.id));
  const rest = positions.filter(row => !used.has(row.id));
  selected.push(...evenly(rest, count - selected.length));
  return selected.sort((a, b) => a.ply - b.ply);
}

async function candidatesForMiningGame(game, settings = {}, signal) {
  const maxMoves = settings.maxMoves ?? 3;
  const requested = settings.positionsPerGame ?? 12;
  if (!Number.isSafeInteger(maxMoves) || maxMoves < 1 || maxMoves > 8
    || !Number.isSafeInteger(requested) || requested < 1 || requested > 1000) throw new Error('Choose valid mining move and position bounds.');
  if (signal?.aborted) throw cancelled();
  const count = Math.max(requested, maxMoves), { context, record } = game;
  if (!RESULTS.has(record?.result) || record.status !== 'completed'
    || !Array.isArray(record.moves) || !Array.isArray(record.openingMoves)
    || !isDeepStrictEqual(record.moves.slice(0, record.openingMoves.length), record.openingMoves)) throw new Error('Mining requires a completed game with its unchanged forced prefix.');
  const rules = await context.rulesFactory({ profile: context.profile });
  const board = rules.createBoard(record.startFen), positions = [];
  let previousSan = '';
  try {
    for (let ply = 0; ply <= record.moves.length; ply++) {
      if (signal?.aborted) throw cancelled();
      const outcome = board.outcome();
      if (ply === record.moves.length) {
        if (board.fen() !== record.finalFen || !outcome || outcome.result !== record.result || outcome.reason !== record.reason) throw new Error(`Mining game ${record.id} does not replay to its recorded outcome.`);
        break;
      }
      if (outcome) throw new Error(`Mining game ${record.id} continues after a terminal position.`);
      const uci = record.moves[ply], san = board.san(uci);
      if (ply > record.openingMoves.length) {
        const signals = [];
        if (san.includes('x')) signals.push('recorded-capture');
        if (/[+#]$/.test(san)) signals.push('recorded-check');
        if (san.includes('=')) signals.push('recorded-promotion');
        if (previousSan.includes('x')) signals.push('after-capture');
        if (/[+#]$/.test(previousSan)) signals.push('after-check');
        const fen = board.fen();
        positions.push({ id: hash([game.id, ply, fen]), game, ply, rules, fen,
          key: `${context.profile.hash}:${positionKey(board)}`, solverColor: board.turn(), signals,
          tacticalScore: (san.includes('=') ? 6 : 0) + (san.includes('x') ? 3 : 0)
            + (/[+#]$/.test(san) ? 2 : 0) + (previousSan.includes('x') ? 1 : 0) });
      }
      if (!board.push(uci)) throw new Error(`Mining game ${record.id} contains an illegal move at ply ${ply + 1}.`);
      previousSan = san;
    }
  } finally { board.dispose(); }
  return selectPositions(positions, count, maxMoves);
}

module.exports = { planMiningGames, candidatesForMiningGame, selectPositions };
