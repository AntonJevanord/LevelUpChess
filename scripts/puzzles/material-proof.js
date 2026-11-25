'use strict';

// Bounded tactical material certificates. Values are declared puzzle-counting
// units, not engine evaluation scores or fitted fairy-piece exchange prices.
const { setImmediate: yieldTurn } = require('node:timers/promises');
const { materialBalance, passProbeFen, validateMaterialTree } = require('../../src/puzzle-data');
const { ProofLimit, replayPosition, positionKey, cancelled } = require('./mate-proof');

function inCheck(board, rules) {
  if (typeof board.isCheck === 'function') return board.isCheck();
  let probe;
  try { probe = rules.createBoard(passProbeFen(board.fen(), false)); return false; }
  catch { return true; } // The validated original position has its inactive king safe.
  finally { probe?.dispose(); }
}
function tacticalMoves(board) { return board.moves().filter(move => board.san(move).includes('x') || /^[a-h][1-8][a-h][1-8][a-z]$/.test(move)); }
const yes = cert => ({ win: true, cert });
const no = () => ({ win: false });
const unknown = () => ({ win: null });

async function proveMaterial({ rules, profile, initialFen, initialMoves = [], fen, solverColor,
  minMoves = 1, maxMoves = 2, minimumGain = 200, settlePlies = 4,
  nodeLimit = 100000, timeLimitMs = 10000, preferredMoves = [], signal, corroborate } = {}) {
  if (!rules?.createBoard || !Array.isArray(initialMoves) || !Number.isInteger(minMoves) || !Number.isInteger(maxMoves)
    || minMoves < 1 || maxMoves < minMoves || maxMoves > 5 || !Number.isInteger(minimumGain) || minimumGain < 1
    || !Number.isInteger(settlePlies) || settlePlies < 1 || settlePlies > 8
    || !Number.isSafeInteger(nodeLimit) || nodeLimit < 1 || !Number.isSafeInteger(timeLimitMs) || timeLimitMs < 1) throw new Error('Choose a valid bounded material proof.');
  const root = replayPosition(rules, initialFen, initialMoves), started = Date.now();
  solverColor ||= root.board.turn();
  const baseline = materialBalance(root.board.fen(), solverColor, profile);
  let nodes = 0;
  const goal = moves => ({ type: 'material', moves, minimumGain, valuePolicy: 'base-plus-level-v1', settlePlies });
  const check = async () => {
    if (signal?.aborted) throw cancelled();
    if (++nodes > nodeLimit) throw new ProofLimit('proof-node-limit');
    if (Date.now() - started >= timeLimitMs) throw new ProofLimit('proof-time-limit');
    if (nodes % 128 === 0) { await yieldTurn(); if (signal?.aborted) throw cancelled(); }
  };
  const gain = board => materialBalance(board.fen(), solverColor, profile) - baseline;
  const terminal = (board, keys) => Boolean(board.outcome()) || keys.filter(key => key === keys.at(-1)).length >= 3;
  async function after(board, move, keys, callback) {
    await check();
    const child = rules.createBoard(board.fen());
    try {
      if (!child.push(move)) throw new Error('Material proof encountered a rejected legal move.');
      return await callback(child, [...keys, positionKey(child)]);
    } finally { child.dispose(); }
  }
  async function settle(board, keys, remaining) {
    await check();
    if (terminal(board, keys)) return no();
    const currentGain = gain(board), checked = inCheck(board, rules), solverTurn = board.turn() === solverColor;
    const moves = (checked ? board.moves() : tacticalMoves(board)).sort();
    const base = { fen: board.fen(), gain: currentGain };
    if (!solverTurn) {
      // Quiet enemy moves retain the current material count. Every capture,
      // promotion or check evasion is explicitly checked before acceptance.
      if (!checked && currentGain < minimumGain) return no();
      if (!moves.length) return !checked && currentGain >= minimumGain ? yes({ ...base, kind: 'settled' }) : no();
      if (!remaining) return unknown();
      let unresolved = false; const replies = [];
      for (const move of moves) {
        const result = await after(board, move, keys, (child, nextKeys) => settle(child, nextKeys, remaining - 1));
        if (result.win === false) return no();
        if (result.win === null) unresolved = true;
        else replies.push({ move, next: result.cert });
      }
      return unresolved ? unknown() : yes({ ...base, kind: 'defenses', replies });
    }
    if (!checked && currentGain >= minimumGain) {
      // A conservative static threat audit lets the opponent capture without
      // spending a solver move. It cannot manufacture a winning certificate
      // by assuming that an attacked valuable piece will simply be ignored.
      let probe;
      try {
        probe = rules.createBoard(passProbeFen(board.fen()));
        const result = await settle(probe, [...keys, positionKey(probe)], remaining);
        if (result.win === true) return yes({ ...base, kind: 'probe', next: result.cert });
      } catch (error) {
        if (error.code === 'PUZZLE_PROOF_LIMIT' || error.name === 'AbortError') throw error;
        return unknown();
      } finally { probe?.dispose(); }
    }
    if (!remaining) return checked || moves.length ? unknown() : no();
    let unresolved = false;
    for (const move of moves) {
      const result = await after(board, move, keys, (child, nextKeys) => settle(child, nextKeys, remaining - 1));
      if (result.win === true) return yes({ ...base, kind: 'choice', move, next: result.cert });
      if (result.win === null) unresolved = true;
    }
    // If material is already won but the static audit failed, a quiet saving
    // move might exist. We deliberately withhold an absence claim in that case.
    return unresolved || !checked && currentGain >= minimumGain ? unknown() : no();
  }
  async function solver(board, keys, remaining, atRoot = false) {
    await check();
    if (terminal(board, keys) || board.turn() !== solverColor) return no();
    const moves = [...board.moves()].sort((a, b) => (atRoot ? Number(preferredMoves.includes(b)) - Number(preferredMoves.includes(a)) : 0) || a.localeCompare(b));
    let winning = 0, selected, selectedAmbiguous = false, unresolved = false;
    for (const move of moves) {
      const result = await after(board, move, keys, async (defender, defenderKeys) => {
        if (terminal(defender, defenderKeys)) return no(); // Mate is a separate puzzle goal.
        let uncertain = false, ambiguous = false; const replies = [];
        for (const reply of [...defender.moves()].sort()) {
          const response = await after(defender, reply, defenderKeys, async (child, nextKeys) => {
            if (terminal(child, nextKeys)) return no();
            if (remaining > 1) return solver(child, nextKeys, remaining - 1);
            if (gain(child) < minimumGain) return no();
            const settled = await settle(child, nextKeys, settlePlies);
            return settled.win === true ? yes({ leaf: { fen: child.fen(), gain: gain(child), settlement: settled.cert } }) : settled;
          });
          if (response.win === false) return no();
          if (response.win === null) uncertain = true;
          else if (response.ambiguous) ambiguous = true;
          else replies.push({ move: reply, ...(remaining > 1 ? { next: response.cert } : response.cert) });
        }
        return uncertain ? unknown() : ambiguous ? { win: true, ambiguous: true } : yes({ move, replies });
      });
      if (result.win === null) { unresolved = true; continue; }
      if (!result.win) continue;
      if (++winning > 1) return { win: true, ambiguous: true };
      selected = result.cert;
      selectedAmbiguous = Boolean(result.ambiguous);
    }
    if (unresolved) return unknown();
    return winning ? selectedAmbiguous ? { win: true, ambiguous: true } : yes(selected) : no();
  }
  try {
    if (fen !== undefined && root.board.fen() !== fen) throw new Error('Material puzzle position differs from the replayed history.');
    if (root.board.turn() !== solverColor || root.board.outcome()) throw new Error('Material puzzle root must be a nonterminal solver turn.');
    for (let moves = 1; moves <= maxMoves; moves++) {
      const result = await solver(root.board, root.keys, moves, true);
      if (result.win === null) return { status: 'unproven', reason: 'unresolved-settling-or-core-branch', nodes, elapsedMs: Date.now() - started };
      if (!result.win) continue;
      if (moves < minMoves) return { status: 'too-short', nodes, elapsedMs: Date.now() - started };
      if (result.ambiguous) return { status: 'ambiguous', nodes, elapsedMs: Date.now() - started };
      const declared = goal(moves);
      try { validateMaterialTree(result.cert, declared); }
      catch { return { status: 'unproven', reason: 'certificate-tree-limit', nodes, elapsedMs: Date.now() - started }; }
      const receipt = typeof corroborate === 'function' ? await corroborate({ fen: root.board.fen(), goal: declared, solution: result.cert, signal }) : undefined;
      if (receipt && receipt.accepted !== true) return { status: 'unproven', reason: 'engine-corroboration-failed', corroboration: receipt, nodes, elapsedMs: Date.now() - started };
      return { status: 'proved', goal: declared, solution: result.cert, moves, minimumGain,
        nodes, elapsedMs: Date.now() - started, method: 'bounded-material-with-tactical-settling',
        valuePolicy: 'base-plus-level-v1', baseline, allLegalCoreDefenses: true,
        scope: 'All legal core defenses plus bounded capture, promotion and check-evasion settling; quiet strategic threats outside this model are not certified.',
        ...(receipt ? { corroboration: receipt } : {}) };
    }
    return { status: 'no-material-win', nodes, elapsedMs: Date.now() - started,
      scope: 'No unique qualifying material strategy within the declared core and tactical-settling model.' };
  } catch (error) {
    if (error.code === 'PUZZLE_PROOF_LIMIT') return { status: 'unproven', reason: error.message, nodes, elapsedMs: Date.now() - started };
    throw error;
  } finally { root.board.dispose(); }
}

module.exports = { proveMaterial, inCheck, tacticalMoves };
