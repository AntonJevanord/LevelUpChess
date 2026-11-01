'use strict';

const { NEW_DEFINITIONS } = require('../../src/balance-designs-v17');
const ids = new Set(NEW_DEFINITIONS.map(definition => definition.id));

/** New IDs only: do not change the capability lists of archived profiles. */
function bracketProbes(definition, type, position) {
  if (!ids.has(definition.id)) return [];
  const king = { h1: 'K', h7: 'k' };
  const frames = [
    { name: 'bracket capture directions versus quiet movement', fen: position({ ...king, d4: type,
      c3: 'p', d3: 'p', e3: 'p', c4: 'p', e4: 'p', c5: 'p', d5: 'p', e5: 'p', b3: 'p', f5: 'p', c2: 'p', e6: 'p' }) },
    { name: 'bracket jumps and sliding paths around friendly blockers', fen: position({ ...king, d4: type,
      c3: 'P', d3: 'P', e3: 'P', c4: 'P', e4: 'P', c5: 'P', d5: 'P', e5: 'P', b2: 'p', f6: 'p', a3: 'p', g5: 'p' }) },
  ];
  if (definition.roles.pawn) frames.push(
    { name: 'bracket clear home double and capture range', fen: position({ ...king, d2: type, c3: 'p', f4: 'p' }) },
    { name: 'bracket home double blocked on its intermediate square', fen: position({ ...king, d2: type, d3: 'P', e3: 'p' }) },
    { name: 'bracket actual en passant removal or quiet overlapping visit', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
  );
  if (/hopping/.test(definition.id)) frames.push(
    { name: 'bracket quiet diagonal hopping beyond one hurdle', fen: position({ ...king, d4: type, e5: 'P', c3: 'P' }) },
    { name: 'bracket quiet hopping cannot capture beyond a hurdle', fen: position({ ...king, d4: type, e5: 'P', f6: 'p', g7: 'p' }) },
  );
  if (/ghost/.test(definition.id)) frames.push(
    { name: 'bracket quiet orthogonal and diagonal hopping beyond hurdles', fen: position({ ...king, d4: type, d5: 'P', c4: 'P', d3: 'P', e4: 'P', e5: 'P' }) },
    { name: 'bracket quiet hopper cannot capture the landing target', fen: position({ ...king, d4: type, d5: 'P', d6: 'p', e5: 'P', f6: 'p' }) },
  );
  if (definition.family === 'queen') for (const rank of [1, 2, 3]) frames.push(
    { name: `bracket queen home-zone availability on rank ${rank}`, fen: position({ h1: 'K', h8: 'k', ['d' + rank]: type }) },
  );
  if (definition.placement === 'reserve') frames.push(
    { name: 'bracket clear two/three-square grant range', fen: position({ ...king, d4: type, d7: 'p', g4: 'p', g7: 'p', a7: 'p' }) },
    { name: 'bracket grant range blocked by adjacent piece', fen: position({ ...king, d4: type, d5: 'P', e5: 'P', c5: 'P', e4: 'P', d6: 'p', f6: 'p', b6: 'p', f4: 'p' }) },
    { name: 'bracket non-pawn grant reaches final rank without promotion', fen: position({ h1: 'K', h6: 'k', b7: type }) },
    { name: 'bracket non-pawn grant cannot remove an en-passant victim', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
  );
  return frames;
}

module.exports = { bracketProbes };
