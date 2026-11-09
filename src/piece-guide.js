import Module from 'ffish-es6';
import wasmBase64 from 'variant-wasm';
import knightConfig from '../variants/levelup-knight.ini';
import pieceConfig from '../variants/levelup.ini';
import currentConfig from '../variants/levelup-v5.ini';
import designOptions from './design-options.js';
import profileFen from './profile-fen.js';

const { getPlayableProfile } = designOptions;
const { pieceMap, placementFromMap } = profileFen;
const legacyConfigs = { 'levelup-knight': knightConfig, levelup: pieceConfig, 'levelup-v5': currentConfig };
const SQUARES = [...'abcdefgh'].flatMap(file => [...'12345678'].map(rank => file + rank));
const resultCache = new Map();
let activeEngine;

/** This private profile changes only royal safety and game-end constraints.
 * Every movement component remains the engine's original definition. Kings
 * become ordinary commoners so pins, checks and whose turn it is cannot hide
 * a piece's movement abilities. The actual game never loads this profile. */
export function inspectionConfig(variant = 'chess') {
  const source = variant === 'chess' ? '' : getPlayableProfile(variant)?.config || legacyConfigs[variant];
  if (source === undefined) throw new Error('This ruleset has no piece guide.');
  if (/^\s*king\s*=\s*[^\r\n]*:/m.test(source)) throw new Error('This royal movement needs its own inspection profile.');
  const body = source.replace(/^\s*\[[^\]\r\n]+\]\s*$/m, '').replace(/^\s*king\s*=.*$/gm, '');
  // COMMONER is a built-in nonroyal king-step type, not another custom slot.
  return `[levelup-piece-guide:chess]\n${body}\nking = -\ncommoner = k\ncastling = false\nchecking = true\nextinctionValue = none\nextinctionPseudoRoyal = false\nmustCapture = false\npieceDrops = false\n`;
}

async function inspectionEngine(variant) {
  const config = inspectionConfig(variant);
  if (!activeEngine || activeEngine.config !== config) {
    const entry = { config };
    entry.promise = Module({ wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)) })
      .then(engine => {
        engine.loadVariantConfig(config);
        if (!engine.variants().split(' ').includes('levelup-piece-guide')) throw new Error('The piece inspection rules could not be loaded.');
        return engine;
      })
      .catch(error => { if (activeEngine === entry) activeEngine = undefined; throw error; });
    // Keep just the latest module. Old modules can be collected after their
    // temporary boards close; browsing archived libraries does not retain one
    // additional WASM heap for every profile.
    activeEngine = entry;
  }
  return activeEngine.promise;
}

function snapshot(value) {
  return { ...value, quiet: [...value.quiet], capture: [...value.capture], legal: [...value.legal],
    legalQuiet: [...value.legalQuiet], legalCapture: [...value.legalCapture] };
}

function hasMove(board, fen, from, to, capture) {
  board.setFen(fen);
  return board.legalMoves().split(' ').some(move => move.startsWith(from + to) && board.isCapture(move) === capture);
}

/** Piece abilities on the current board, ignoring checks/pins and turn order.
 * Only the destination is made hypothetically empty/enemy to distinguish a
 * quiet component from a capture component. Other blockers stay in place.
 * Friendly occupied destinations are omitted. `legal` remains the real game's
 * side-to-move legal destinations; it is never inferred from this guide.
 * Clock, promotion-dialog and controller restrictions remain the UI's concern.
 */
export async function getPieceGuide(game, { square } = {}) {
  if (!/^[a-h][1-8]$/.test(square || '')) throw new Error('Choose a board square to inspect.');
  const fen = game.fen(), variant = game.variant || 'chess';
  const piece = game.get(square);
  if (!piece) return null;
  const key = `${variant}\0${fen}\0${square}`;
  if (resultCache.has(key)) return snapshot(resultCache.get(key));
  // Read all real-game data before awaiting initialization. An engine move may
  // happen in the meantime; callers compare the returned FEN before drawing.
  const moves = game.turn() === piece.color ? game.moves({ square, verbose: true }) : [];
  const legalQuiet = new Set(moves.filter(move => !move.captured).map(move => move.to));
  const legalCapture = new Set(moves.filter(move => move.captured).map(move => move.to));
  const engine = await inspectionEngine(variant);
  const original = pieceMap(fen);
  original.pocket = '';
  const fields = fen.split(/\s+/);
  const probeFen = pieces => `${placementFromMap(pieces)} ${piece.color} - - 0 ${fields[5] || 1}`;
  const quiet = new Set(), capture = new Set();
  const board = new engine.Board('levelup-piece-guide', probeFen(original), false);
  try {
    // Ordinary empty quiet destinations and occupied captures need no probe.
    // Reuse one private board for the remaining hypothetical destinations.
    const actual = board.legalMoves().split(' ').filter(move => move.startsWith(square));
    const actualQuiet = new Set(actual.filter(move => !board.isCapture(move)).map(move => move.slice(2, 4)));
    const actualCapture = new Set(actual.filter(move => board.isCapture(move)).map(move => move.slice(2, 4)));
    for (const target of SQUARES) {
      if (target === square) continue;
      const occupant = original.get(target);
      if (occupant && (occupant === occupant.toUpperCase() ? 'w' : 'b') === piece.color) continue;
      const pieces = new Map(original);
      pieces.delete(target);
      if (occupant ? hasMove(board, probeFen(pieces), square, target, false) : actualQuiet.has(target)) quiet.add(target);
      pieces.set(target, piece.color === 'w' ? 'p' : 'P');
      if (occupant ? actualCapture.has(target) : hasMove(board, probeFen(pieces), square, target, true)) capture.add(target);
    }
  } finally { board.delete(); }
  // Castling and en passant depend on real position rights rather than the
  // hypothetical landing-square probes. Keep actual legal instances visible.
  for (const target of legalQuiet) quiet.add(target);
  for (const target of legalCapture) capture.add(target);
  const value = { square, color: piece.color, type: piece.type, fen, variant, mode: 'abilities',
    quiet: [...quiet].sort(), capture: [...capture].sort(),
    legal: [...new Set(moves.map(move => move.to))].sort(),
    legalQuiet: [...legalQuiet].sort(), legalCapture: [...legalCapture].sort() };
  resultCache.set(key, value);
  if (resultCache.size > 96) resultCache.delete(resultCache.keys().next().value);
  return snapshot(value);
}
