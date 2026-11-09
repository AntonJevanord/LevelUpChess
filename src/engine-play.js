'use strict';

// Scheduling policy only. The board's existing engine request owns cancellation,
// serial execution and move legality; viewing a piece must not change this state.
const OPPONENT_MODES = Object.freeze(['local', 'engine', 'selfplay']);
const COLORS = new Set(['w', 'b']);

function isOpponentMode(opponent) { return OPPONENT_MODES.includes(opponent); }
function isEngineMode(opponent) { return opponent === 'engine' || opponent === 'selfplay'; }

function engineControlsSide(opponent, turn, humanSide = 'w') {
  if (!COLORS.has(turn)) return false;
  return opponent === 'selfplay' || opponent === 'engine' && COLORS.has(humanSide) && turn !== humanSide;
}

function canHumanMove(opponent, turn, humanSide = 'w') {
  if (!COLORS.has(turn)) return false;
  return opponent === 'local' || opponent === 'engine' && turn === humanSide;
}

/** A one-move request bypasses only the self-play pause, never the busy guard,
 * clock, setup, promotion or terminal-state guards. Consume that request before
 * starting the async search and leave self-play paused when it completes. */
function canRequestEngineMove({ opponent, turn, humanSide = 'w', connected, busy, paused,
  pending, editingSetup, finished, canPlay, stepRequested = false } = {}) {
  if (!engineControlsSide(opponent, turn, humanSide) || !connected || busy || pending
    || editingSetup || finished || !canPlay) return false;
  return !paused || opponent === 'selfplay' && stepRequested === true;
}

module.exports = { OPPONENT_MODES, isOpponentMode, isEngineMode, engineControlsSide,
  canHumanMove, canRequestEngineMove };
