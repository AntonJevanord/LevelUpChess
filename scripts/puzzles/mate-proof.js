'use strict';

// Exhaustive bounded mate proof. Engine principal variations may nominate a
// position, but never replace the legal-defense tree recorded here.
const { setImmediate: yieldTurn } = require('node:timers/promises');
const { pieceMap } = require('../../src/profile-fen');

class ProofLimit extends Error {
  constructor(reason) { super(reason); this.code = 'PUZZLE_PROOF_LIMIT'; }
}
function cancelled() { const error = new Error('Puzzle generation cancelled.'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; return error; }
function positionKey(board) {
  const fields = board.fen().split(/\s+/).slice(0, 4);
  if (fields[3] !== '-') {
    const pieces = pieceMap(board.fen()), targets = new Set(fields[3].match(/[a-h][1-8]/g));
    fields[3] = [...new Set(board.moves().filter(move => move[1] !== '@' && targets.has(move.slice(2, 4))
      && !pieces.has(move.slice(2, 4)) && board.san(move).includes('x')).map(move => move.slice(2, 4)))].sort().join('') || '-';
  }
  return fields.join(' ');
}
function replayPosition(rules, initialFen, moves) {
  const board = rules.createBoard(initialFen), keys = [positionKey(board)];
  try {
    for (const move of moves) {
      if (board.outcome() || !board.push(move)) throw new Error('The source history cannot be replayed legally.');
      keys.push(positionKey(board));
    }
    return { board, keys };
  } catch (error) { board.dispose(); throw error; }
}

async function proveMate({ rules, initialFen, initialMoves = [], fen, solverColor,
  minMoves = 1, maxMoves = 2, nodeLimit = 50000, timeLimitMs = 5000, signal,
  preferredMoves = [], pv = [] } = {}) {
  if (!rules?.createBoard || !Array.isArray(initialMoves) || !Number.isInteger(minMoves) || !Number.isInteger(maxMoves)
    || minMoves < 1 || maxMoves < minMoves || maxMoves > 5 || !Number.isSafeInteger(nodeLimit) || nodeLimit < 1
    || !Number.isSafeInteger(timeLimitMs) || timeLimitMs < 1
    || !Array.isArray(preferredMoves) || preferredMoves.length > 512 || preferredMoves.some(move => typeof move !== 'string')
    || !Array.isArray(pv) || pv.length > 32 || pv.some(move => typeof move !== 'string')) throw new Error('Choose a valid bounded mate proof.');
  const root = replayPosition(rules, initialFen, initialMoves), started = Date.now();
  const rootFen = root.board.fen(), hints = new Map();
  let nodes = 0;
  const check = async () => {
    if (signal?.aborted) throw cancelled();
    if (++nodes > nodeLimit) throw new ProofLimit('proof-node-limit');
    if (Date.now() - started >= timeLimitMs) throw new ProofLimit('proof-time-limit');
    if (nodes % 128 === 0) { await yieldTurn(); if (signal?.aborted) throw cancelled(); }
  };
  const loss = () => ({ win: false, unique: false, tree: null, distance: null });
  function orderedMoves(board) {
    const current = board.fen(), moves = [...board.moves()];
    const preferred = [...(hints.has(current) ? [hints.get(current)] : []), ...(current === rootFen ? preferredMoves : [])];
    const order = new Map(); preferred.forEach((move, index) => { if (!order.has(move)) order.set(move, index); });
    const pieces = pieceMap(current);
    const tactical = move => (move.length === 5 ? 2 : 0) + (move[1] !== '@' && pieces.has(move.slice(2, 4)) ? 1 : 0);
    return moves.sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity)
      || tactical(b) - tactical(a) || a.localeCompare(b));
  }
  async function visit(board, keys, remaining) {
    await check();
    const outcome = board.outcome();
    if (outcome) return outcome.reason === 'checkmate' && outcome.result === (solverColor === 'w' ? '1-0' : '0-1')
      ? { win: true, unique: true, tree: null, distance: 0 } : loss();
    if (keys.filter(key => key === keys.at(-1)).length >= 3 || !remaining) return loss();
    const moves = orderedMoves(board), solverTurn = board.turn() === solverColor;
    // Exact SAN is produced by the same rules through push/pop, including
    // custom checks. At the final solver ply only actual checkmates can win.
    if (solverTurn && remaining === 1) {
      const mates = [];
      for (const move of moves) {
        await check();
        if (board.san(move).endsWith('#')) {
          const child = rules.createBoard(board.fen());
          try { if (!child.push(move) || child.outcome()?.reason !== 'checkmate') throw new Error('Mate SAN and rules outcome disagree.'); }
          finally { child.dispose(); }
          mates.push(move);
          if (mates.length > 1) return { win: true, unique: false, tree: null, distance: 1 };
        }
      }
      return mates.length ? { win: true, unique: true, tree: { move: mates[0], replies: [] }, distance: 1 } : loss();
    }
    let winning = 0, selected, unique = true, longest = 0;
    const replies = [];
    for (const move of moves) {
      await check();
      const child = rules.createBoard(board.fen());
      let result;
      try {
        if (!child.push(move)) throw new Error('Mate proof encountered a rejected legal move.');
        result = await visit(child, [...keys, positionKey(child)], remaining - 1);
      } finally { child.dispose(); }
      if (solverTurn) {
        if (!result.win) continue;
        if (++winning > 1) return { win: true, unique: false, tree: null, distance: 1 + Math.min(selected.distance, result.distance) };
        selected = { ...result, move };
      } else {
        if (!result.win) return loss(); // One legal defense refutes the claim.
        unique &&= result.unique;
        longest = Math.max(longest, result.distance);
        replies.push({ move, next: result.tree });
      }
    }
    if (solverTurn) return winning ? { win: true, unique: selected.unique,
      tree: selected.unique ? { move: selected.move, replies: selected.tree?.replies === undefined ? [] : selected.tree.replies } : null,
      // A solver child is a defender node, whose tree is a replies container.
      distance: selected.distance + 1 } : loss();
    return { win: true, unique, tree: unique ? { replies } : null, distance: longest + 1 };
  }
  try {
    // PVs are hints only. Keep their legal prefix and ignore a stale or
    // incompatible suffix; never prune an unlisted move from the exact proof.
    if (pv.length) {
      const preview = rules.createBoard(rootFen);
      try {
        for (const move of pv) {
          if (signal?.aborted) throw cancelled();
          if (preview.outcome() || !preview.moves().includes(move)) break;
          hints.set(preview.fen(), move);
          if (!preview.push(move)) break;
        }
      } finally { preview.dispose(); }
    }
    if (fen !== undefined && root.board.fen() !== fen) throw new Error('Puzzle position differs from the replayed source history.');
    solverColor ||= root.board.turn();
    if (root.board.turn() !== solverColor || root.board.outcome()) throw new Error('Puzzle root must be a nonterminal solver turn.');
    for (let moves = 1; moves <= maxMoves; moves++) {
      const result = await visit(root.board, root.keys, moves * 2 - 1);
      if (!result.win) continue;
      if (moves < minMoves) return { status: 'too-short', nodes, elapsedMs: Date.now() - started };
      if (!result.unique) return { status: 'ambiguous', nodes, elapsedMs: Date.now() - started };
      return { status: 'proved', solution: result.tree, moves: Math.ceil(result.distance / 2), nodes,
        elapsedMs: Date.now() - started, method: 'exhaustive-bounded-mate', allLegalDefenses: true,
        uniqueness: 'one solver move mates within the remaining bound at every solver turn; slower wins outside the bound are not excluded' };
    }
    return { status: 'no-forced-mate', nodes, elapsedMs: Date.now() - started };
  } catch (error) {
    if (error.code === 'PUZZLE_PROOF_LIMIT') return { status: 'unproven', reason: error.message, nodes, elapsedMs: Date.now() - started };
    throw error;
  } finally { root.board.dispose(); }
}

module.exports = { ProofLimit, positionKey, replayPosition, proveMate, cancelled };
