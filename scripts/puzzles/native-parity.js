'use strict';

// Legal moves form a set. Keep both inventories and their exact difference so
// engine/version disagreements can be reproduced without another search.
const MOVE = /^(?:[a-h][1-8][a-h][1-8][a-z]?|[A-Z]@[a-h][1-8])$/;
const LEGACY_ENGINE_SHA256 = '2fe12ff0fcad0295482cab7660e1fcc24259cebc4ef164839fb16c9f9cabfc99';
function assertCompatibleEngineHash(hash) {
  if (hash === LEGACY_ENGINE_SHA256) throw new Error('The legacy largeboard engine is not supported for puzzle analysis. Use --engine .\\stockfish\\fairy-stockfish-levelup_x86-64.exe (or update FAIRY_STOCKFISH_PATH) and a new output directory; keep the previous run unchanged.');
}
function nativeParity({ nativeMoves, archivedMoves, fen, profileHash }) {
  for (const moves of [nativeMoves, archivedMoves]) {
    if (!Array.isArray(moves) || moves.some(move => typeof move !== 'string' || !MOVE.test(move))) throw new Error('Invalid native or archived legal-move inventory.');
  }
  const native = [...new Set(nativeMoves)].sort(), archived = [...new Set(archivedMoves)].sort();
  const nativeSet = new Set(native), archivedSet = new Set(archived);
  const nativeOnly = native.filter(move => !archivedSet.has(move)), archivedOnly = archived.filter(move => !nativeSet.has(move));
  return { schemaVersion: 1, equal: !nativeOnly.length && !archivedOnly.length,
    fen, profileHash, nativeMoves: native, archivedMoves: archived, nativeOnly, archivedOnly };
}
function mismatchMessage(details, file) {
  const list = moves => moves.length ? moves.slice(0, 8).join(', ') + (moves.length > 8 ? ', …' : '') : 'none';
  return `Native and archived puzzle rules disagree at ${details.gameId}, ply ${details.ply}. Native-only: ${list(details.nativeOnly)}; archived-only: ${list(details.archivedOnly)}. Details: ${file}`;
}
module.exports = { nativeParity, mismatchMessage, assertCompatibleEngineHash, LEGACY_ENGINE_SHA256 };
