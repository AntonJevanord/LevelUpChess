// A loaded variant name does not prove that an older engine understands all
// configuration fields. Check the relevant behavior before searching a game.
const ROOK = {
  name: 'upgraded-rook castling and capture jumps',
  fen: '4k3/8/8/8/8/5p2/6P1/R3K2O w KQ - 0 1',
  required: ['e1g1', 'e1c1', 'h1f3'],
  forbidden: ['h1f2', 'h1g3'],
};

const PAWNS = [
  {
    name: 'mandatory standard promotion for every upgraded pawn',
    fen: '8/1A1C1D2/7k/8/8/8/8/K7 w - - 0 1',
    required: ['b7b8', 'd7d8', 'f7f8'].flatMap(move => ['q', 'r', 'b', 'n'].map(piece => move + piece)),
    forbidden: ['b7b8', 'd7d8', 'f7f8', 'b7b8a', 'd7d8c', 'f7f8d'],
  },
  {
    name: 'upgraded-pawn en passant with multiple targets',
    fen: '7k/8/5d2/3A4/2a1c3/8/8/7K b - d3d4d5 0 1',
    required: ['c4d3', 'e4d3', 'f6d4'],
    forbidden: ['c4d4'],
  },
  {
    name: 'en passant king safety and orange quiet movement',
    // Removing the blue pawn on d5 would expose the black king to Bb7.
    // Orange moving quietly to d3 leaves that shield intact.
    fen: '7K/1B6/5d2/3Aa3/2c5/8/8/7k b - d3d4d5 0 1',
    required: ['c4d3'],
    forbidden: ['e5d4', 'f6d4'],
  },
];

const HOME_RANKS = [
  {
    name: 'blue-piece quiet jumps on the home two ranks',
    fen: '7k/8/8/8/8/P3p3/LPp5/3S3K w - - 0 1',
    required: ['a2a4', 'd1c3', 'd1g2', 'd1f4'],
    forbidden: ['a2c2', 'd1e3'],
  },
  {
    name: 'blue-piece movement outside the home ranks',
    fen: '8/7k/8/P7/LPpS4/8/8/7K w - - 0 1',
    required: ['a4a3'],
    forbidden: ['a4a6', 'd4f5', 'd4g5', 'd4f7'],
  },
];
const ORANGE_ROOK = {
  name: 'orange-rook screen captures',
  fen: 'k7/3n4/8/3P4/n1PMP2n/3P4/8/1K1n4 w - - 0 1',
  required: ['d4d7', 'd4d1', 'd4a4', 'd4h4'],
  forbidden: ['d4d6', 'd4f4'],
};
const OTHER_ROOKS = {
  name: 'blue and orange rook castling',
  fen: '4k3/8/8/8/7n/8/P6P/L3K2M w KQ - 0 1',
  required: ['e1g1', 'e1c1', 'a1a3', 'h1h4'],
  forbidden: ['h1h3'],
};

function capabilityProbes(fen, variant) {
  if (!['levelup', 'levelup-v5'].includes(variant) || typeof fen !== 'string') return [];
  const placement = fen.trim().split(/\s+/)[0];
  const probes = [];
  if (/o/i.test(placement)) probes.push(ROOK);
  if (/[acd]/i.test(placement)) probes.push(...PAWNS);
  if (variant === 'levelup-v5' && /[lm]/i.test(placement)) probes.push(OTHER_ROOKS);
  if (variant === 'levelup-v5' && /[ls]/i.test(placement)) probes.push(...HOME_RANKS);
  if (variant === 'levelup-v5' && /m/i.test(placement)) probes.push(ORANGE_ROOK);
  return probes.map(probe => ({ ...probe, required: [...probe.required], forbidden: [...probe.forbidden] }));
}

module.exports = { capabilityProbes };
