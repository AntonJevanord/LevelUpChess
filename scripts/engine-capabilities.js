// A loaded variant name does not prove that an older engine understands all
// configuration fields. Probe only the upgraded types present in this game:
// an unrelated piece must not reject or crash an otherwise compatible engine.
const ROOK = {
  name: 'purple-rook castling and capture jumps',
  fen: '4k3/8/8/8/8/5p2/6P1/O3K2O w KQ - 0 1',
  required: ['e1g1', 'e1c1', 'h1f3'],
  forbidden: ['h1f2', 'h1g3'],
};

function promotion(piece, color) {
  return {
    name: `mandatory standard promotion for ${color} pawns`,
    fen: `8/1${piece}6/7k/8/8/8/8/K7 w - - 0 1`,
    required: ['q', 'r', 'b', 'n'].map(type => 'b7b8' + type),
    forbidden: ['b7b8', 'b7b8' + piece.toLowerCase()],
  };
}

const PAWNS = {
  a: [
    promotion('A', 'blue'),
    {
      name: 'blue-pawn standard en passant captures',
      fen: '7k/8/8/8/2aP4/8/8/7K b - d3 0 1',
      required: ['c4d3'],
      forbidden: ['c4d4'],
    },
    {
      name: 'blue-pawn en passant with multiple targets',
      fen: '7k/8/8/3Ap3/2p5/8/8/7K b - d3d4d5 0 1',
      required: ['c4d3', 'e5d4'],
      forbidden: ['c4d4'],
    },
    {
      name: 'blue-pawn en passant king safety',
      // Removing Ad5 would expose the black king to Bb7.
      fen: '7K/1B6/8/3Aa3/8/8/8/7k b - d3d4d5 0 1',
      required: ['e5e4'],
      forbidden: ['e5d4'],
    },
  ],
  c: [
    promotion('C', 'orange'),
    {
      name: 'orange-pawn vulnerability to en passant',
      fen: '7k/8/8/8/3Cp3/8/8/7K b - d3 0 1',
      required: ['e4d3'],
      forbidden: [],
    },
    {
      name: 'orange-pawn quiet moves onto en passant targets',
      // Orange's move to d3 leaves Pd4 shielding its king from Ba7.
      fen: '7K/B7/8/8/3Pc3/8/8/6k1 b - d3 0 1',
      required: ['e4d3'],
      forbidden: [],
    },
  ],
  d: [
    promotion('D', 'purple'),
    {
      name: 'purple-pawn diagonal en passant captures',
      fen: '7k/8/8/5d2/3P4/8/8/7K b - d3 0 1',
      required: ['f5d3'],
      forbidden: ['f5e4'],
    },
    {
      name: 'purple-pawn en passant king safety',
      fen: '7K/B7/8/5d2/3P4/8/8/6k1 b - d3 0 1',
      required: ['f5f4'],
      forbidden: ['f5d3'],
    },
  ],
};

const HOME_RANKS = {
  l: [
    {
      name: 'blue-rook quiet jumps on the home two ranks',
      fen: '7k/8/8/8/8/P3p3/LPp5/7K w - - 0 1',
      required: ['a2a4'],
      forbidden: ['a2c2'],
    },
    {
      name: 'blue-rook movement outside the home ranks',
      fen: '8/7k/8/P7/LPp5/8/8/7K w - - 0 1',
      required: ['a4a3'],
      forbidden: ['a4a6'],
    },
  ],
  s: [
    {
      name: 'blue-queen quiet jumps on the home two ranks',
      fen: '7k/8/8/8/8/4p3/1Pp5/3S3K w - - 0 1',
      required: ['d1c3', 'd1g2', 'd1f4'],
      forbidden: ['d1e3'],
    },
    {
      name: 'blue-queen movement outside the home ranks',
      fen: '8/7k/8/8/3S4/8/8/7K w - - 0 1',
      required: ['d4d3'],
      forbidden: ['d4f5', 'd4g5', 'd4f7'],
    },
  ],
};
const ORANGE_ROOK = {
  name: 'orange-rook screen captures',
  fen: 'k7/3n4/8/3P4/n1PMP2n/3P4/8/1K1n4 w - - 0 1',
  required: ['d4d7', 'd4d1', 'd4a4', 'd4h4'],
  forbidden: ['d4d6', 'd4f4'],
};

function castling(piece, color) {
  return {
    name: `${color}-rook castling`,
    fen: `4k3/8/8/8/8/8/8/${piece}3K2${piece} w KQ - 0 1`,
    required: ['e1g1', 'e1c1'],
    forbidden: [],
  };
}

function capabilityProbes(fen, variant) {
  if (!['levelup', 'levelup-v5'].includes(variant) || typeof fen !== 'string') return [];
  const placement = fen.trim().split(/\s+/)[0].toLowerCase();
  const probes = [];
  if (placement.includes('o')) probes.push(ROOK);
  for (const type of ['a', 'c', 'd']) if (placement.includes(type)) probes.push(...PAWNS[type]);
  if (variant === 'levelup-v5') {
    if (placement.includes('l')) probes.push(castling('L', 'blue'), ...HOME_RANKS.l);
    if (placement.includes('m')) probes.push(castling('M', 'orange'), ORANGE_ROOK);
    if (placement.includes('s')) probes.push(...HOME_RANKS.s);
  }
  return probes.map(probe => ({ ...probe, required: [...probe.required], forbidden: [...probe.forbidden] }));
}

module.exports = { capabilityProbes };
