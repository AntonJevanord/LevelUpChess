import { Chess } from 'chess.js';
import { VariantGame, initVariantRules } from './variant-game';
import puzzleData from './puzzle-data';

const { validatePuzzlePack, derivePuzzlePieces, createPuzzleGame, playUci, uciOf } = puzzleData;

export async function puzzleGameFactory(fen, variant) {
  if (variant === 'chess') return new Chess(fen);
  await initVariantRules(variant);
  return new VariantGame(fen, variant);
}

function depth(node) { return node ? 1 + Math.max(0, ...node.replies.map(reply => reply.next ? depth(reply.next) : 0)) : 0; }

/** A puzzle has its own game. Keeping the live game outside this session lets
 * the application leave puzzles without replacing or saving over that game. */
export async function createPuzzleSession(pack, puzzleId, { createGame = puzzleGameFactory } = {}) {
  validatePuzzlePack(pack);
  const puzzle = pack.puzzles.find(row => row.id === puzzleId);
  if (!puzzle) throw new Error('That puzzle is not in this library.');
  const derived = await derivePuzzlePieces(puzzle, { createGame });
  for (const key of ['present', 'moved', 'involved', 'stationary']) {
    if (JSON.stringify([...derived[key]].sort()) !== JSON.stringify([...puzzle.pieces[key]].sort())) throw new Error('This puzzle has inconsistent piece participation tags.');
  }
  let game = await createPuzzleGame(puzzle, createGame), node = puzzle.solution;
  let status = 'playing', solverMovesPlayed = 0, shownHint = '', played = [], disposed = false, revision = 0, retrying = false;
  const ensure = () => { if (disposed) throw new Error('The puzzle session is closed.'); };
  const state = () => ({ id: puzzle.id, title: puzzle.title, variant: puzzle.variant,
    solverColor: puzzle.solverColor, goal: { ...puzzle.goal }, status,
    solverMovesPlayed, solverMovesTotal: puzzle.goal.moves, hint: shownHint,
    solution: [...played], pieces: puzzle.pieces, provenance: puzzle.provenance,
    canMove: !disposed && !retrying && status === 'playing' && game.turn() === puzzle.solverColor });
  function advance() {
    const moves = [], solver = playUci(game, node.move);
    moves.push(solver); played.push(solver.san); solverMovesPlayed++; shownHint = '';
    if (game.isCheckmate()) { status = 'solved'; return moves; }
    // Show the longest proved defense, with stable UCI tie breaking. Every
    // other legal defense was already checked by the full tree replay.
    const reply = [...node.replies].sort((a, b) => depth(b.next) - depth(a.next) || a.move.localeCompare(b.move))[0];
    const defense = playUci(game, reply.move); moves.push(defense); played.push(defense.san); node = reply.next;
    if (reply.leaf) status = 'solved';
    return moves;
  }
  const session = {
    get game() { ensure(); return game; },
    get puzzle() { return puzzle; },
    state,
    tryMove(request) {
      ensure();
      if (retrying || status !== 'playing' || game.turn() !== puzzle.solverColor) return { accepted: false, reason: retrying ? 'The puzzle is restarting.' : 'This puzzle is finished.', moves: [], state: state() };
      const legal = game.moves({ verbose: true }).find(row => typeof request === 'string'
        ? uciOf(row) === request || row.san === request
        : (request?.drop ? row.drop === request.drop.toLowerCase() : row.from === request?.from)
          && row.to === request?.to && row.promotion === request?.promotion);
      if (!legal) return { accepted: false, reason: 'That move is not legal.', moves: [], state: state() };
      if (uciOf(legal) !== node.move) return { accepted: false, reason: puzzle.goal.type === 'mate' ? 'Try another move in the mating line.' : 'Try another move that wins the required material.', moves: [], state: state() };
      const moves = advance();
      return { accepted: true, moves, state: state() };
    },
    async retry() {
      ensure(); const operation = ++revision; retrying = true;
      try {
        const replacement = await createPuzzleGame(puzzle, createGame);
        if (disposed || operation !== revision) { replacement.dispose?.(); throw new Error('The puzzle restart was cancelled.'); }
        game.dispose?.(); game = replacement; node = puzzle.solution;
        status = 'playing'; solverMovesPlayed = 0; shownHint = ''; played = [];
      } finally { if (operation === revision) retrying = false; }
      return state();
    },
    hint() {
      ensure();
      if (status === 'playing') {
        const move = game.moves({ verbose: true }).find(row => uciOf(row) === node.move);
        shownHint = `Try ${move.san}.`;
      }
      return state();
    },
    reveal() {
      ensure(); const moves = [];
      if (status === 'playing') {
        while (status === 'playing') moves.push(...advance());
        status = 'revealed'; shownHint = 'Solution shown. Retry to solve it yourself.';
      }
      return { moves, state: state() };
    },
    dispose() { if (!disposed) { revision++; game.dispose?.(); disposed = true; } },
  };
  return session;
}
