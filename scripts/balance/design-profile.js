'use strict';

const { createHash } = require('node:crypto');
const { restoreDesignRegistry } = require('./design-registry');
const { capabilityProbes: legacyCapabilityProbes } = require('../engine-capabilities');
const { normalizeEvaluation } = require('./evaluation');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const COMPILER_VERSION = 1;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function position(pieces, turn = 'w', castling = '-', ep = '-') {
  const placement = Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces[file + (8 - row)];
      if (!piece) { empty++; continue; }
      if (empty) rank += empty;
      empty = 0;
      rank += piece;
    }
    return rank + (empty || '');
  }).join('/');
  return `${placement} ${turn} ${castling} ${ep} 0 1`;
}

function opposite(fen) {
  const fields = fen.split(' ');
  const swapCase = value => value.replace(/[a-z]/gi, character => character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase());
  fields[0] = swapCase(fields[0].split('/').reverse().join('/'));
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  const rights = swapCase(fields[2]);
  fields[2] = [...'KQkq'].filter(character => rights.includes(character)).join('') || '-';
  if (fields[3] !== '-') fields[3] = fields[3].match(/[a-h][1-8]/g).map(square => square[0] + (9 - Number(square[1]))).sort().join('');
  return fields.join(' ');
}

function remap(fen, from, to) {
  const fields = fen.split(' ');
  fields[0] = fields[0].replace(new RegExp(from, 'gi'), character => character === character.toUpperCase() ? to.toUpperCase() : to);
  return fields.join(' ');
}

function definitionProbes(definition, letter) {
  const type = letter.toUpperCase();
  const frames = [
    { name: 'open movement and range', fen: position({ a1: 'K', h7: 'k', d4: type }) },
    { name: 'blocked movement and capture jumps', fen: position({ a1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', b4: 'p', f4: 'p', d2: 'p', d6: 'p', b6: 'p', f6: 'p' }) },
  ];
  if (definition.movement.includes('i')) frames.push({
    name: 'initial movement across home-rank blockers',
    fen: definition.family === 'pawn'
      ? position({ h1: 'K', h7: 'k', d2: type, d3: 'P', c3: 'p', e3: 'p' })
      : position({ h1: 'K', h7: 'k', d1: type, d2: 'P', c1: 'P', e1: 'P', e3: 'p' }),
  });
  if (definition.roles.pawn) frames.push({ name: 'mandatory standard promotion', fen: position({ a1: 'K', h6: 'k', b7: type }) });
  // New pawn candidates need fixtures for the abilities that distinguish them;
  // keep earlier registries' probe lists unchanged for archived experiments.
  if (definition.family === 'pawn' && definition.revision >= 3 && !['pawn.blue@4', 'pawn.blue@5', 'pawn.blue@6', 'pawn.blue@7', 'pawn.purple@13'].includes(definition.id)) {
    frames.push({ name: definition.revision === 5 ? 'quiet forward visit to an en passant target' : 'standard en passant capture', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') });
    if (definition.revision === 3) frames.push({
      name: 'forward capture range and forbidden backward captures',
      fen: position({ a1: 'K', h7: 'k', d4: type, b6: 'p', g7: 'p', c3: 'p', e3: 'p' }),
    });
    if (definition.revision === 4) frames.push({
      name: 'rank captures and forbidden forward capture',
      fen: position({ a1: 'K', h7: 'k', d4: type, a4: 'p', h4: 'p', d5: 'p', c5: 'p', e5: 'p' }),
    });
    if (definition.revision === 5) frames.push(
      {
        name: 'forward captures and quiet-only backward rays',
        fen: position({ h1: 'K', h7: 'k', d4: type, b6: 'p', d6: 'p', f6: 'p', b2: 'p', d2: 'p', f2: 'p', a4: 'p', h4: 'p' }),
      },
      {
        name: 'quiet backward visit to an en passant target',
        fen: position({ h1: 'K', h8: 'k', c7: type, d5: 'p' }, 'w', '-', 'd6'),
      },
    );
    if (definition.revision === 6) frames.push(
      { name: 'repeatable quiet jump crosses a friendly blocker', fen: position({ a1: 'K', h7: 'k', d4: type, d5: 'P', c5: 'p', e5: 'p' }) },
      { name: 'repeatable quiet jump cannot capture forward', fen: position({ a1: 'K', h7: 'k', d4: type, d5: 'P', d6: 'p', c5: 'p', e5: 'p' }) },
    );
  }
  // Add fixtures by immutable ID so archived registries keep their exact probes.
  if (definition.id === 'pawn.orange@2') frames.push(
    { name: 'lower-cost twin en passant', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'repeatable quiet twin jump crosses a friendly blocker', fen: position({ a1: 'K', h7: 'k', d4: type, d5: 'P', c5: 'p', e5: 'p' }) },
    { name: 'quiet twin jump cannot capture forward', fen: position({ a1: 'K', h7: 'k', d4: type, d5: 'P', d6: 'p' }) },
  );
  if (['knight.orange@2', 'knight.purple@3'].includes(definition.id)) frames.push({
    name: 'camel captures across blockers',
    fen: position({ a1: 'K', h7: 'k', d4: type, d5: 'P', e4: 'P', e7: 'p', g5: 'p', c1: 'p', a3: 'p' }),
  });
  if (definition.id === 'bishop.purple@2') frames.push({
    name: 'sideways quiet slides and wide knight captures',
    fen: position({ a1: 'K', h7: 'k', d4: type, c4: 'p', f4: 'p', b3: 'p', b5: 'p', f3: 'p', f5: 'p' }),
  });
  if (definition.id === 'rook.purple@3') frames.push({
    name: 'quiet blink jumps cannot capture diagonally',
    fen: position({ a1: 'K', h7: 'k', d4: type, c4: 'P', d3: 'P', d5: 'P', e4: 'P', b2: 'p', f6: 'p', g7: 'p', b5: 'p', g5: 'p' }),
  });
  if (definition.id === 'queen.purple@2') frames.push({
    name: 'short queen range and blocked rays',
    fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P', d5: 'P', b6: 'p', d7: 'p', g4: 'p' }),
  });
  if (definition.id === 'queen.purple@3') frames.push({
    name: 'companion is capturable and may move through attacked squares',
    fen: position({ a1: 'K', h8: 'k', d4: type, e8: 'r', b3: 'b' }),
  });
  // Rebalance fixtures are tied to their new IDs; archived probe lists stay fixed.
  if (definition.id === 'pawn.purple@7') frames.push(
    { name: 'ranging capture limit and unrestricted quiet rook lines', fen: position({ h1: 'K', h8: 'k', d4: type, b6: 'p', g7: 'p', b2: 'p', g1: 'p' }) },
    { name: 'quiet sideways visit to an en passant target', fen: position({ h1: 'K', h8: 'k', a6: type, d5: 'p' }, 'w', '-', 'd6') },
  );
  if (definition.id === 'pawn.purple@8') frames.push(
    { name: 'unlimited forward diagonal captures and no backward movement', fen: position({ h1: 'K', h8: 'k', d4: type, a7: 'p', g7: 'p', b2: 'p', f2: 'p' }) },
    { name: 'forward diagonals cannot cross blockers', fen: position({ h1: 'K', h8: 'k', d4: type, e5: 'P', g7: 'p', c5: 'p', a7: 'p' }) },
  );
  if (definition.id === 'pawn.purple@9') frames.push(
    { name: 'wide forward jumps cross blockers and capture', fen: position({ h1: 'K', h8: 'k', d4: type, c4: 'P', e4: 'P', d5: 'P', b5: 'p', f5: 'p', c5: 'p', e5: 'p' }) },
    { name: 'wide quiet jump to an en passant target', fen: position({ h1: 'K', h8: 'k', b5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'clear initial double step', fen: position({ h1: 'K', h8: 'k', d2: type, c4: 'p' }) },
  );
  if (definition.id === 'bishop.purple@3') frames.push({
    name: 'quiet knight jumps cross blockers but do not capture',
    fen: position({ a1: 'K', h7: 'k', d4: type, c4: 'P', d5: 'P', e4: 'P', d3: 'P', b3: 'p', f5: 'p', c2: 'P' }),
  });
  if (definition.id === 'bishop.purple@4') frames.push({
    name: 'two-square horizontal captures stop at blockers',
    fen: position({ a1: 'K', h7: 'k', d4: type, b4: 'p', f4: 'p', a4: 'p', g4: 'p', b5: 'p', f5: 'p' }),
  });
  if (definition.id === 'rook.purple@4') frames.push(
    { name: 'adjacent diagonal captures and quiet-only longer blink jumps', fen: position({ h1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', c3: 'p', e5: 'p', b2: 'p', f6: 'p', g7: 'p' }) },
    { name: 'adjacent diagonal check forbids castling', fen: position({ e1: 'K', h1: 'R', a1: 'N', e8: 'k', d2: letter }, 'w', 'K') },
  );
  if (definition.id === 'queen.purple@4') frames.push(
    { name: 'companion captures diagonally but steps quietly orthogonally', fen: position({ a1: 'K', h8: 'k', d4: type, c3: 'p', e5: 'p', c4: 'p', d5: 'p' }) },
    { name: 'companion is capturable and nonroyal', fen: position({ a1: 'K', h8: 'k', d4: type, d8: 'r', e8: 'r' }, 'b') },
  );
  // Alternative fixtures are exact-ID additions; earlier profiles keep their probes.
  if (definition.id === 'pawn.purple@10') frames.push(
    { name: 'wide forward knight and camel captures cross blockers', fen: position({ h1: 'K', h8: 'k', d4: type, c4: 'P', e4: 'P', d5: 'P', a5: 'p', b5: 'p', c5: 'p', e5: 'p', f5: 'p', g5: 'p' }) },
    { name: 'quiet camel visit to an en passant target', fen: position({ h1: 'K', h8: 'k', a5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'wide camel promotion', fen: position({ h1: 'K', h6: 'k', d7: type, g8: 'r' }) },
    { name: 'clear initial double step', fen: position({ h1: 'K', h8: 'k', d2: type, c4: 'p' }) },
  );
  if (definition.id === 'bishop.purple@5') frames.push(
    { name: 'tall knight captures cross blockers without wide knight moves', fen: position({ h1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', c2: 'p', e2: 'p', c6: 'p', e6: 'p', b3: 'p', f5: 'p' }) },
  );
  if (definition.id === 'bishop.purple@6') frames.push(
    { name: 'unlimited horizontal captures stop at blockers', fen: position({ h1: 'K', h7: 'k', d4: type, a4: 'p', h4: 'p', b5: 'p', f5: 'p' }) },
    { name: 'horizontal rays cannot cross friendly pieces', fen: position({ h1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', a4: 'p', h4: 'p' }) },
  );
  if (definition.id === 'rook.purple@5') frames.push(
    { name: 'clear two-square diagonal captures and quiet-only longer jumps', fen: position({ h1: 'K', h8: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', b2: 'p', f6: 'p', g7: 'p' }) },
    { name: 'diagonal captures cannot jump blockers', fen: position({ h1: 'K', h8: 'k', d4: type, c3: 'P', e5: 'P', b2: 'p', f6: 'p' }) },
    { name: 'two-square diagonal check forbids castling', fen: position({ e1: 'K', h1: 'R', a1: 'N', e8: 'k', c3: letter }, 'w', 'K') },
  );
  if (definition.id === 'queen.purple@5') frames.push(
    { name: 'forward and sideways captures but quiet-only backward steps', fen: position({ a1: 'K', h8: 'k', d4: type, c3: 'p', d3: 'p', e3: 'p', c4: 'p', e4: 'p', c5: 'p', d5: 'p', e5: 'p' }) },
    { name: 'quiet backward steps across attacked squares remain nonroyal', fen: position({ a1: 'K', h8: 'k', d4: type, c8: 'r', d8: 'r', e8: 'r' }) },
    { name: 'companion is capturable and nonroyal', fen: position({ a1: 'K', h8: 'k', d4: type, d8: 'r', e8: 'r' }, 'b') },
  );
  // The linked revision screen adds exact-ID fixtures without changing any
  // earlier profile's movement probes or archived definitions.
  if (['bishop.purple@7', 'bishop.purple@8', 'bishop.purple@9'].includes(definition.id)) frames.push(
    { name: 'wide knight capture directions and horizontal range', fen: position({ a1: 'K', h7: 'k', d4: type, b3: 'p', f3: 'p', b5: 'p', f5: 'p', c4: 'p', f4: 'p' }) },
    { name: 'sideways slides stop at a friendly blocker', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P', f4: 'p' }) },
  );
  if (['rook.purple@6', 'rook.purple@7', 'rook.purple@8'].includes(definition.id)) frames.push(
    { name: 'adjacent diagonal and knight capture permissions', fen: position({ a1: 'K', h7: 'k', d4: type, c3: 'p', e5: 'p', b5: 'p', f5: 'p', c2: 'p', e2: 'p' }) },
    { name: 'quiet diagonal and knight jumps across blockers', fen: position({ a1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P' }) },
  );
  if (definition.id === 'bishop.purple@10') frames.push(
    { name: 'unlimited horizontal lines and bishop diagonals', fen: position({ a1: 'K', h7: 'k', d4: type, a4: 'p', h4: 'p', b2: 'p', f6: 'p' }) },
    { name: 'horizontal blockers and no vertical rook movement', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P', g4: 'p', d6: 'p' }) },
  );
  if (['bishop.purple@11', 'bishop.purple@12'].includes(definition.id)) frames.push(
    { name: 'friendly horizontal hurdle and landing distance', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P' }) },
    { name: 'enemy hurdle remains capturable by an ordinary slide', fen: position({ a1: 'K', h7: 'k', d4: type, c4: 'p', f4: 'p' }) },
    { name: 'quiet hops cannot capture or pass a second blocker', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P', g4: 'p', c4: 'P', b4: 'P' }) },
    { name: 'diagonal blockers and forbidden vertical motion', fen: position({ a1: 'K', h7: 'k', d4: type, e5: 'P', d5: 'P', c4: 'P' }) },
  );
  if (definition.id === 'bishop.purple@13') frames.push(
    { name: 'first sideways leg blocks both wide knight directions', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'P', c4: 'P', f5: 'p', b3: 'p' }) },
    { name: 'second sideways square is not the lame knight leg', fen: position({ a1: 'K', h7: 'k', d4: type, f4: 'P', b4: 'P', f5: 'p', b3: 'p' }) },
    { name: 'enemy first leg can be captured sideways but blocks knight continuation', fen: position({ a1: 'K', h7: 'k', d4: type, e4: 'p', f5: 'p' }) },
    { name: 'horizontal slides retain a two-square clear limit', fen: position({ a1: 'K', h7: 'k', d4: type, a4: 'p', f4: 'p' }) },
  );
  if (['rook.purple@9', 'rook.purple@10', 'rook.purple@11'].includes(definition.id)) frames.push(
    { name: 'forward and backward diagonal ranges', fen: position({ a1: 'K', h7: 'k', d4: type, a7: 'p', g7: 'p', b2: 'p', f2: 'p' }) },
    { name: 'diagonal slides cannot cross blockers', fen: position({ a1: 'K', h7: 'k', d4: type, e5: 'P', f6: 'p', c3: 'p', b2: 'p' }) },
  );
  // Follow-up definitions receive exact-ID fixtures so archived profiles retain
  // their original probes and hashes when the research catalog grows.
  if (definition.id === 'pawn.purple@13') frames.push(
    { name: 'standard forward en passant capture', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'unlimited forward captures but quiet-only backward movement', fen: position({ h1: 'K', h8: 'k', d4: type, a7: 'p', g7: 'p', b2: 'p', f2: 'p' }) },
    { name: 'forward diagonal captures require a clear path', fen: position({ h1: 'K', h8: 'k', d4: type, c5: 'P', e5: 'P', b6: 'p', f6: 'p' }) },
  );
  if (definition.id === 'pawn.blue@4') frames.push(
    { name: 'backward diagonal steps are quiet only', fen: position({ h1: 'K', h8: 'k', d4: type, c3: 'p', e3: 'p', c5: 'p', e5: 'p' }) },
    { name: 'quiet forward diagonal EP visit leaves the bypassed pawn', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'initial forward double cannot jump its intermediate blocker', fen: position({ h1: 'K', h8: 'k', d2: type, d3: 'P' }) },
  );
  if (definition.id === 'pawn.blue@5') frames.push(
    { name: 'standard forward en passant capture', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'repeatable clear double advance and two-square forward captures', fen: position({ h1: 'K', h8: 'k', d4: type, b6: 'p', f6: 'p', b2: 'p', f2: 'p', g7: 'p' }) },
    { name: 'both two-square paths stop at intermediate blockers', fen: position({ h1: 'K', h8: 'k', d4: type, d5: 'P', c5: 'P', e5: 'P', b6: 'p', f6: 'p' }) },
  );
  if (definition.id === 'bishop.purple@17') frames.push(
    { name: 'orthogonal steps and knight leaps capture only', fen: position({ h1: 'K', h7: 'k', d4: type, c4: 'p', e4: 'p', d3: 'p', d5: 'p', b3: 'p', f5: 'p' }) },
    { name: 'removed dabbaba and alfil captures remain forbidden', fen: position({ h1: 'K', h7: 'k', d4: type, c3: 'P', e5: 'P', d2: 'p', f4: 'p', b2: 'p', f6: 'p' }) },
  );
  if (definition.id === 'bishop.purple@18') frames.push(
    { name: 'vertical steps and tall knight leaps without zebra reach', fen: position({ h1: 'K', h7: 'k', d4: type, c2: 'p', e6: 'p', b1: 'p', f7: 'p', b3: 'p', f5: 'p' }) },
  );
  if (definition.id === 'rook.purple@14') frames.push(
    { name: 'wide camel jumps are quiet while wide knight jumps capture', fen: position({ h1: 'K', h8: 'k', d4: type, a3: 'p', g5: 'p', b3: 'p', f5: 'p', c3: 'p', e5: 'p' }) },
    { name: 'quiet wide camel relocation crosses friendly blockers', fen: position({ h1: 'K', h8: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P' }) },
  );
  if (definition.id === 'king.reserve-pawn@2') frames.push(
    { name: 'deployed forward diagonal guard captures without straight movement', fen: position({ h1: 'K', h8: 'k', d4: type, c5: 'p', e5: 'p', d5: 'p', c3: 'p', e3: 'p' }) },
  );
  if (definition.id === 'bishop.purple@19') frames.push(
    { name: 'colorbound orthogonal and camel captures cross blockers', fen: position({ h1: 'K', h7: 'k', d4: type, c4: 'P', e4: 'P', d3: 'P', d5: 'P', b4: 'p', f4: 'p', c1: 'p', e7: 'p', a3: 'p', g5: 'p' }) },
    { name: 'bishop slides need clear diagonals while camel jumps remain available', fen: position({ h1: 'K', h7: 'k', d4: type, c3: 'P', e5: 'P', b2: 'p', f6: 'p', c7: 'p', g3: 'p' }) },
  );
  if (definition.id === 'king.reserve-pawn@3') frames.push(
    { name: 'forward one or two steps move and capture along clear paths', fen: position({ h1: 'K', h8: 'k', d4: type, d6: 'p', c5: 'p', e5: 'p', d3: 'p' }) },
    { name: 'forward two-square guard cannot jump an intermediate blocker', fen: position({ h1: 'K', h8: 'k', d4: type, d5: 'P', d6: 'p' }) },
  );
  if (definition.id === 'king.reserve-pawn@4') frames.push(
    { name: 'pawn guard captures diagonally but cannot capture or retreat straight', fen: position({ h1: 'K', h8: 'k', d4: type, c5: 'p', e5: 'p', d5: 'p', c3: 'p', e3: 'p' }) },
    { name: 'non-pawn grant cannot capture en passant', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'non-pawn grant never promotes on the final rank', fen: position({ h1: 'K', h6: 'k', b7: type }) },
  );
  if (definition.id === 'pawn.blue@6') frames.push(
    { name: 'all four diagonal steps capture but the forward file remains quiet only', fen: position({ h1: 'K', h8: 'k', d4: type, c3: 'p', e3: 'p', c5: 'p', e5: 'p', d5: 'p' }) },
    { name: 'initial forward double cannot jump its intervening blocker', fen: position({ h1: 'K', h8: 'k', d2: type, d3: 'P' }) },
    { name: 'quiet diagonal EP visit leaves the bypassed pawn', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
  );
  if (['king.reserve-pawn@5', 'king.reserve-pawn@6'].includes(definition.id)) frames.push(
    { name: 'forward capture only with quiet forward diagonal relocation', fen: position({ h1: 'K', h8: 'k', d4: type, d5: 'p', c5: 'p', e5: 'p', d3: 'p' }) },
    { name: 'quiet diagonal relocation cannot jump blockers or capture en passant', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
    { name: 'clear quiet forward step differs between grant alternatives', fen: position({ h1: 'K', h8: 'k', d4: type }) },
    { name: 'non-pawn grant never promotes on a diagonal last-rank visit', fen: position({ h1: 'K', h6: 'k', b7: type }) },
  );
  if (definition.id === 'pawn.blue@7') frames.push(
    { name: 'king-like quiet steps retain only diagonal captures', fen: position({ h1: 'K', h8: 'k', d4: type, d5: 'p', c4: 'p', e4: 'p', d3: 'p', c3: 'p', e3: 'p', c5: 'p', e5: 'p' }) },
    { name: 'clear home-rank forward double and forbidden sideways double', fen: position({ h1: 'K', h8: 'k', d2: type }) },
    { name: 'home-rank double cannot jump its intermediate blocker', fen: position({ h1: 'K', h8: 'k', d2: type, d3: 'P' }) },
    { name: 'quiet diagonal EP visit retains the bypassed pawn', fen: position({ h1: 'K', h8: 'k', c5: type, d5: 'p' }, 'w', '-', 'd6') },
  );
  if (definition.roles.castlingRook) frames.push({ name: 'both castling sides', fen: position({ e8: 'k', a1: type, e1: 'K', h1: type }, 'w', 'KQ') });
  // These new allocation hints have no historical movement identity. In
  // particular, l used to denote a rook; its castling fixtures do not apply
  // to a bishop that now borrows that free letter.
  const inheritedProbes = definition.inheritLegacyProbes === false || definition.family === 'king' || ['bishop.purple@11', 'bishop.purple@12', 'bishop.purple@13'].includes(definition.id)
    ? [] : legacyCapabilityProbes(definition.legacyType, 'levelup-v5');
  for (const legacy of inheritedProbes) {
    // Repeatable Twin jumps do not create initial-double en passant rights.
    if (definition.id === 'pawn.orange@2' && legacy.name === 'orange-pawn vulnerability to en passant') continue;
    frames.push({ name: legacy.name, fen: remap(legacy.fen, definition.legacyType, letter) });
  }
  return frames.flatMap(frame => [
    { name: `${definition.id}: White ${frame.name}`, fen: frame.fen },
    { name: `${definition.id}: Black ${frame.name}`, fen: opposite(frame.fen) },
  ]);
}

/** Compile a trusted, archived run-wide registry without mutating older rules. */
function compileDesignProfile(input, evaluation) {
  const registry = restoreDesignRegistry(input);
  const policy = normalizeEvaluation(evaluation, registry.definitions.map(definition => definition.id));
  const variant = `levelup-design-${sha256(JSON.stringify({ compiler: COMPILER_VERSION, registry, ...(policy ? { evaluation: policy } : {}) })).slice(0, 20)}`;
  const byId = Object.fromEntries(registry.definitions.map(definition => [definition.id, definition]));
  const definitionsByLetter = Object.fromEntries(registry.allocations.map(({ id, letter }) => [letter, byId[id]]));
  const lettersFor = role => registry.allocations.filter(({ id }) => byId[id].roles[role]).map(({ letter }) => letter).sort();
  const roles = {
    pawnTypes: ['p', ...lettersFor('pawn')],
    enPassantTypes: ['p', ...lettersFor('enPassant')],
    castlingRooks: ['r', ...lettersFor('castlingRook')],
    royalTypes: ['k'],
    initialPawnLeaps: { p: 2 },
    initialLandingLeaps: {},
  };
  const reserveTypes = registry.allocations.filter(({ id }) => byId[id].placement === 'reserve').map(({ letter }) => letter).sort();
  if (reserveTypes.length) roles.reserveTypes = reserveTypes;
  for (const { id, letter } of registry.allocations) {
    const definition = byId[id];
    if (definition.roles.pawn) {
      if (definition.movement.includes('ifmH')) roles.initialPawnLeaps[letter] = 3;
      else if (definition.movement.includes('ifmnD')) roles.initialPawnLeaps[letter] = 2;
    }
    const leaps = [['imN', 12], ['imC', 13], ['imZ', 23]].filter(([movement]) => definition.movement.includes(movement)).map(([, leap]) => leap);
    if (leaps.length) roles.initialLandingLeaps[letter] = leaps;
  }
  const config = [
    '# Dynamic experiment profile. Meanings belong to the archived registry.',
    `[${variant}:chess]`,
    ...registry.allocations.slice().sort((a, b) => a.slot - b.slot).map(({ id, letter, slot }) => `customPiece${slot} = ${letter}:${byId[id].movement}`),
    ...(policy ? ['mg', 'eg'].map(phase => `pieceValue${phase === 'mg' ? 'Mg' : 'Eg'} = ${registry.allocations.filter(({ id }) => Object.hasOwn(policy.pieceValues, id)).map(({ id, letter }) => `${letter}:${policy.pieceValues[id][phase]}`).join(' ')}`) : []),
    'pieceToCharTable = -',
    `castlingRookPiece = ${roles.castlingRooks.join('')}`,
    'doubleStepRegionWhite = *1 *2',
    'doubleStepRegionBlack = *7 *8',
    `pawnTypes = ${roles.pawnTypes.join('')}`,
    `enPassantTypes = ${roles.enPassantTypes.join('')}`,
    'promotionPieceTypes = nbrq',
    ...(reserveTypes.length ? [
      '# Finite nonroyal king grants: deployment spends a turn; captures disappear.',
      'twoBoards = false',
      'pieceDrops = true',
      'capturesToHand = false',
      'mustDrop = false',
      'dropChecks = false',
      'dropRegionWhite = *1 *2 *3 *4',
      'dropRegionBlack = *5 *6 *7 *8',
    ] : []),
    `startFen = ${START_FEN}`,
    '',
  ].join('\n');
  const probes = registry.allocations.flatMap(({ id, letter }) => definitionProbes(byId[id], letter));
  if (reserveTypes.length) for (const letter of reserveTypes) {
    for (const [turn, type] of [['w', letter.toUpperCase()], ['b', letter]]) probes.push({ name: `${byId[registry.allocations.find(a => a.letter === letter).id].id}: finite ${turn} reserve deployment`, fen: `7k/8/8/8/8/8/8/K7[${type}] ${turn} - - 0 1` });
  }
  for (const turn of ['w', 'b']) probes.push({ name: `ordinary ${turn === 'w' ? 'White' : 'Black'} king castling`, fen: `r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1` });
  const capabilityProbes = [...new Map(probes.map(probe => [probe.fen, probe])).values()];
  return freeze({
    schemaVersion: 1,
    variant,
    config,
    registry,
    registryHash: registry.hash,
    hash: sha256(JSON.stringify({ config, registry })),
    roles,
    definitionsByLetter,
    capabilityProbes,
    ...(policy ? { evaluation: policy } : {}),
  });
}

module.exports = { compileDesignProfile };
