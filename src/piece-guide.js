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
let activeJumpEngine;

function inspectionSource(variant) {
  const source = variant === 'chess' ? '' : getPlayableProfile(variant)?.config || legacyConfigs[variant];
  if (source === undefined) throw new Error('This ruleset has no piece guide.');
  return source;
}

/** This private profile changes only royal safety and game-end constraints.
 * Every movement component remains the engine's original definition. Kings
 * become ordinary commoners so pins, checks and whose turn it is cannot hide
 * a piece's movement abilities. The actual game never loads this profile. */
export function inspectionConfig(variant = 'chess') {
  const source = inspectionSource(variant);
  if (/^\s*king\s*=\s*[^\r\n]*:/m.test(source)) throw new Error('This royal movement needs its own inspection profile.');
  const body = source.replace(/^\s*\[[^\]\r\n]+\]\s*$/m, '').replace(/^\s*king\s*=.*$/gm, '');
  // COMMONER is a built-in nonroyal king-step type, not another custom slot.
  return `[levelup-piece-guide:chess]\n${body}\nking = -\ncommoner = k\ncastling = false\nchecking = true\nextinctionValue = none\nextinctionPseudoRoyal = false\nmustCapture = false\npieceDrops = false\n`;
}

async function inspectionEngine(variant, jumpConfig) {
  const config = jumpConfig || inspectionConfig(variant);
  const active = jumpConfig ? activeJumpEngine : activeEngine;
  if (!active || active.config !== config) {
    const entry = { config };
    entry.promise = Module({ wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)) })
      .then(engine => {
        engine.loadVariantConfig(config);
        if (!engine.variants().split(' ').includes('levelup-piece-guide')) throw new Error('The piece inspection rules could not be loaded.');
        return engine;
      })
      .catch(error => {
        if (jumpConfig ? activeJumpEngine === entry : activeEngine === entry) {
          if (jumpConfig) activeJumpEngine = undefined; else activeEngine = undefined;
        }
        throw error;
      });
    // Keep just the latest module. Old modules can be collected after their
    // temporary boards close; browsing archived libraries does not retain one
    // additional WASM heap for every profile.
    if (jumpConfig) activeJumpEngine = entry; else activeEngine = entry;
    return entry.promise;
  }
  return active.promise;
}

function snapshot(value) {
  return { ...value, quiet: [...value.quiet], capture: [...value.capture], legal: [...value.legal],
    legalQuiet: [...value.legalQuiet], legalCapture: [...value.legalCapture],
    jumpQuiet: [...value.jumpQuiet], jumpCapture: [...value.jumpCapture],
    legalJumpQuiet: [...value.legalJumpQuiet], legalJumpCapture: [...value.legalJumpCapture] };
}

/** Select native Betza components for annotation, never to decide legality.
 * A/D/N/C/Z/H/G are leaps, including repeated leapers such as N0. A native n
 * modifier makes a component nonjumping. g/p components need a hurdle and
 * remain fully interpreted by the rules engine, with their original modifiers.
 * One-square W/F/K steps and ordinary sliding rays do not receive jump marks. */
export function jumpingConfig(variant, type) {
  const source = inspectionSource(variant);
  const line = source.match(new RegExp(`^(\\s*[A-Za-z][A-Za-z0-9]*\\s*=\\s*${type}\\s*:)\\s*([a-z]*[A-Z][A-Za-z0-9]*)`, 'm'));
  const movement = line?.[2] || { p: 'fmWfceFifmnD', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }[type];
  if (!movement) throw new Error('This piece has no inspectable movement definition.');
  const components = movement.match(/[a-z]*[A-Z][0-9]*/g) || [];
  if (components.join('') !== movement) throw new Error('This piece movement cannot be classified for jump marks.');
  const jumps = components.filter(component => {
    const [, modifiers, atom] = component.match(/^([a-z]*)([A-Z])/);
    return !modifiers.includes('n') && (/[gp]/.test(modifiers) || 'ADNCHZG'.includes(atom));
  }).join('');
  if (!jumps) return null;
  if (jumps === movement) return inspectionConfig(variant);
  if (!line) throw new Error('A mixed native movement needs an explicit inspection definition.');
  return inspectionConfig(variant).replace(line[0], `${line[1]}${jumps}`);
}

function hasMove(board, fen, from, to, capture) {
  board.setFen(fen);
  return board.legalMoves().split(' ').some(move => move.startsWith(from + to) && board.isCapture(move) === capture);
}

// A hopper requires a hurdle even in a movement diagram. Supply one on each
// possible intermediate point of a straight/diagonal path and let the engine
// decide whether the component can use it. This never retains a real blocker
// or bypasses the engine's direction, range or landing rules.
function hurdleSquares(from, to) {
  const dx = to.charCodeAt(0) - from.charCodeAt(0), dy = Number(to[1]) - Number(from[1]);
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return [];
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  return Array.from({ length: Math.max(0, distance - 1) }, (_, i) =>
    String.fromCharCode(from.charCodeAt(0) + Math.sign(dx) * (i + 1)) + (Number(from[1]) + Math.sign(dy) * (i + 1)));
}

function movementDiagram(engine, fen, square, piece) {
  const original = pieceMap(fen), empty = new Map([[square, original.get(square)]]);
  const fields = fen.split(/\s+/);
  const probeFen = pieces => `${placementFromMap(pieces)} ${piece.color} - - 0 ${fields[5] || 1}`;
  const quiet = new Set(), capture = new Set();
  const board = new engine.Board('levelup-piece-guide', probeFen(empty), false);
  try {
    const actual = board.legalMoves().split(' ').filter(move => move.startsWith(square));
    const actualQuiet = new Set(actual.filter(move => !board.isCapture(move)).map(move => move.slice(2, 4)));
    for (const target of SQUARES) {
      if (target === square) continue;
      const pieces = new Map(empty);
      if (actualQuiet.has(target)) quiet.add(target);
      pieces.set(target, piece.color === 'w' ? 'p' : 'P');
      if (hasMove(board, probeFen(pieces), square, target, true)) capture.add(target);
      if (!quiet.has(target) || !capture.has(target)) for (const hurdle of hurdleSquares(square, target)) {
        pieces.delete(target);
        pieces.set(hurdle, piece.color === 'w' ? 'P' : 'p');
        if (!quiet.has(target) && hasMove(board, probeFen(pieces), square, target, false)) quiet.add(target);
        pieces.set(target, piece.color === 'w' ? 'p' : 'P');
        if (!capture.has(target) && hasMove(board, probeFen(pieces), square, target, true)) capture.add(target);
        pieces.delete(hurdle);
        if (quiet.has(target) && capture.has(target)) break;
      }
    }
    // Actual-board jump routes differ from the blocker-free diagram: a g
    // component cannot jump without a real hurdle. Preserve EP, but no castling
    // rights, since castling is a special royal move rather than a leap.
    const actualFen = `${placementFromMap(new Map(original))} ${piece.color} - ${piece.color === fields[1] ? fields[3] : '-'} ${fields[4] || 0} ${fields[5] || 1}`;
    board.setFen(actualFen);
    const actualMoves = board.legalMoves().split(' ').filter(move => move.startsWith(square));
    return { quiet, capture,
      currentQuiet: new Set(actualMoves.filter(move => !board.isCapture(move)).map(move => move.slice(2, 4))),
      currentCapture: new Set(actualMoves.filter(move => board.isCapture(move)).map(move => move.slice(2, 4))) };
  } finally { board.delete(); }
}

/** Piece movement diagram, ignoring other pieces, checks/pins and turn order.
 * The selected piece keeps its actual square, color and initial-rank rules.
 * Empty/enemy landing probes distinguish quiet and capture components; a
 * minimal hypothetical hurdle also exposes hopper components. Occupied
 * destinations stay visible in this diagram. `legal` remains the real game's
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
  const diagram = movementDiagram(engine, fen, square, piece), { quiet, capture } = diagram;
  const config = jumpingConfig(variant, piece.type);
  // A distinct module is essential: custom movement tables are global within
  // a WASM instance, so loading an altered component profile alongside the
  // full one could overwrite its rules. Pure jump pieces can reuse the full
  // private profile without another heap.
  const jumps = !config ? { quiet: new Set(), capture: new Set(), currentQuiet: new Set(), currentCapture: new Set() }
    : config === inspectionConfig(variant) ? diagram
      : movementDiagram(await inspectionEngine(variant, config), fen, square, piece);
  // Castling and en passant depend on real position rights rather than the
  // hypothetical landing-square probes. Keep actual legal instances visible.
  for (const target of legalQuiet) quiet.add(target);
  for (const target of legalCapture) capture.add(target);
  const value = { square, color: piece.color, type: piece.type, fen, variant, mode: 'abilities', ignoresBlockers: true,
    quiet: [...quiet].sort(), capture: [...capture].sort(),
    legal: [...new Set(moves.map(move => move.to))].sort(),
    legalQuiet: [...legalQuiet].sort(), legalCapture: [...legalCapture].sort(),
    jumpQuiet: [...jumps.quiet].sort(), jumpCapture: [...jumps.capture].sort(),
    legalJumpQuiet: [...legalQuiet].filter(target => jumps.currentQuiet.has(target)).sort(),
    legalJumpCapture: [...legalCapture].filter(target => jumps.currentCapture.has(target)).sort() };
  resultCache.set(key, value);
  if (resultCache.size > 96) resultCache.delete(resultCache.keys().next().value);
  return snapshot(value);
}
