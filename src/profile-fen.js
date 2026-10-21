'use strict';

// Role-aware validation shared by experiments and the playable design profile.
const ROYALS = ['v', 'w', 'x', 'y'];

function pieceMap(fen) {
  const placement = fen.split(' ')[0].split('/');
  if (placement.length !== 8) throw new Error('Invalid balance starting FEN.');
  const pieces = new Map();
  placement.forEach((row, index) => {
    let file = 0;
    for (const character of row) {
      if (/^[1-8]$/.test(character)) file += Number(character);
      else if (/^[a-z]$/i.test(character)) {
        if (file >= 8) throw new Error('Invalid balance starting FEN.');
        pieces.set('abcdefgh'[file++] + (8 - index), character);
      } else throw new Error('Invalid balance starting FEN.');
    }
    if (file !== 8) throw new Error('Invalid balance starting FEN.');
  });
  return pieces;
}

function placementFromMap(pieces) {
  return Array.from({ length: 8 }, (_, row) => {
    let result = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces.get(file + (8 - row));
      if (!piece) { empty++; continue; }
      if (empty) result += empty;
      empty = 0;
      result += piece;
    }
    return result + (empty || '');
  }).join('/');
}

function validEp(fen, pieces, roles) {
  const fields = fen.split(' ');
  const ep = fields[3];
  if (ep === '-') return true;
  const targets = ep.match(/[a-h][1-8]/g);
  if (!targets || targets.join('') !== ep || targets.length > 3) return false;
  const file = ep[0];
  const movedWhite = fields[1] === 'b';
  const step = movedWhite ? 1 : -1;
  const colored = type => movedWhite ? type.toUpperCase() : type;
  const validSource = rank => movedWhite ? rank === 1 || rank === 2 : rank === 7 || rank === 8;
  const at = rank => pieces.get(file + rank);
  const initialLeap = type => roles ? roles.initialPawnLeaps[type] || 0 : type === 'a' ? 3 : ['p', 'c'].includes(type) ? 2 : 0;
  if (targets.length === 1) {
    const rank = Number(ep[1]);
    if (at(rank)) {
      // Initial blue-queen jumps produce an inert occupied landing marker.
      const marker = at(rank);
      const leaps = roles ? roles.initialLandingLeaps[marker.toLowerCase()] || [] : marker === colored('s') ? [12, 13, 23] : [];
      if (!leaps.length || (marker === marker.toUpperCase()) !== movedWhite) return false;
      return (movedWhite ? [1, 2] : [7, 8]).some(sourceRank => [...'abcdefgh'].some(sourceFile => {
        const files = Math.abs(file.charCodeAt(0) - sourceFile.charCodeAt(0));
        const ranks = Math.abs(rank - sourceRank);
        const leap = Math.min(files, ranks) * 10 + Math.max(files, ranks);
        return !pieces.has(sourceFile + sourceRank) && leaps.includes(leap);
      }));
    }
    for (let landing = rank + step; landing >= 1 && landing <= 8; landing += step) {
      const victim = at(landing);
      if (!victim || (victim === victim.toUpperCase()) !== movedWhite) continue;
      const distance = initialLeap(victim.toLowerCase());
      const source = landing - step * distance;
      return distance > 0 && validSource(source) && !at(source)
        && (rank - source) * step > 0 && (landing - rank) * step > 0;
    }
    return false;
  }
  const ranks = targets.map(target => Number(target[1]));
  if (targets.some(target => target[0] !== file) || ranks.some((rank, i) => i && rank !== ranks[i - 1] + 1)) return false;
  const distance = targets.length;
  const landing = movedWhite ? ranks.at(-1) : ranks[0];
  const source = landing - step * distance;
  const marker = at(landing);
  const correctPawn = roles ? marker && marker === colored(marker.toLowerCase()) && marker.toLowerCase() !== 'p' && initialLeap(marker.toLowerCase()) === distance
    : marker === colored(distance === 3 ? 'a' : 'c');
  return validSource(source) && !at(source) && correctPawn
    && (distance === 3 || !at(source + step));
}

function checkedBoard(module, variant, input, whiteKing, blackKing, roles) {
  if (typeof input !== 'string') throw new Error('Invalid balance starting FEN.');
  const fen = input.trim().split(/\s+/).join(' ');
  const fields = fen.split(' ');
  if (fields.length !== 6 || !['w', 'b'].includes(fields[1]) || !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) throw new Error('Invalid balance starting FEN.');
  const pieces = pieceMap(fen);
  // The generic pseudo-royal FEN validator accepts missing/extra royal pieces.
  // A balance position must have exactly its selected royal for each color.
  const royals = [...pieces.values()].filter(piece => roles ? roles.royalTypes.includes(piece.toLowerCase()) : /[kvwxy]/i.test(piece));
  const symmetric = whiteKing === blackKing;
  if (royals.length !== 2 || !royals.includes(symmetric ? 'K' : ROYALS[whiteKing].toUpperCase()) || !royals.includes(symmetric ? 'k' : ROYALS[blackKing])) throw new Error('A balance position must contain exactly one selected royal king per side.');
  const noEp = [...fields];
  noEp[3] = '-';
  if (module.validateFen(noEp.join(' '), variant) !== 1 || !validEp(fen, pieces, roles)) throw new Error('Invalid balance starting FEN.');
  const inactiveFields = [...noEp];
  inactiveFields[1] = fields[1] === 'w' ? 'b' : 'w';
  const inactive = new module.Board(variant, inactiveFields.join(' '));
  try {
    if (inactive.isCheck()) throw new Error('The balance starting position already checks the inactive king.');
  } finally { inactive.delete(); }
  return new module.Board(variant, fen);
}

module.exports = { ROYALS, pieceMap, placementFromMap, checkedBoard };
