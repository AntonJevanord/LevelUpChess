const { capabilityProbes } = require('../engine-capabilities');

const ROYALS = ['v', 'w', 'x', 'y'];

function cancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Balance capability checks cancelled.');
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  throw error;
}

function royalFen(fen, rules, whiteKing, blackKing) {
  if (rules.royalMode !== 'pseudo-royal') return fen;
  const fields = fen.split(' ');
  fields[0] = fields[0].replace(/K/g, ROYALS[whiteKing].toUpperCase()).replace(/k/g, ROYALS[blackKing]);
  return fields.join(' ');
}

const KING_PROBES = [
  { name: 'White royal captures and quiet movement', fen: 'k7/8/3p1p2/5p2/3K1p2/8/8/8 w - - 0 1' },
  { name: 'Black royal captures and quiet movement', fen: '8/8/8/3k1P2/5P2/3P1P2/8/K7 b - - 0 1' },
  ...['w', 'b'].map(turn => ({
    name: `${turn === 'w' ? 'White' : 'Black'} royal castling`,
    fen: `r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1`,
  })),
];

/** Check later-only abilities before collecting any game outcomes. */
async function checkCapabilities({ engine, rules, startFens, whiteKing, blackKing, signal }) {
  if (!Array.isArray(startFens) || !startFens.length || startFens.some(fen => typeof fen !== 'string')) throw new Error('Capability checks require the profile starting FENs.');
  if (![whiteKing, blackKing].every(level => Number.isInteger(level) && level >= 0 && level <= 3)) throw new Error('Capability checks require valid king levels.');
  const probes = new Map();
  if (Array.isArray(rules.capabilityProbes)) {
    // Dynamic profiles supply fixtures bound to their own design IDs/letters.
    // The legacy probe table deliberately retains the old revision semantics.
    for (const probe of rules.capabilityProbes) probes.set(probe.fen, probe.name);
  } else {
    for (const fen of startFens) {
      for (const probe of capabilityProbes(fen, 'levelup-v5')) {
        const adapted = royalFen(probe.fen, rules, whiteKing, blackKing);
        if (!probes.has(adapted)) probes.set(adapted, probe.name);
      }
    }
  }
  for (const probe of KING_PROBES) probes.set(royalFen(probe.fen, rules, whiteKing, blackKing), probe.name);
  for (const [fen, name] of probes) {
    cancelled(signal);
    let board;
    try {
      board = rules.createBoard(fen);
      const expected = [...board.moves()].sort();
      const actual = await engine.perft({ fen, signal });
      cancelled(signal);
      if (!Array.isArray(actual) || JSON.stringify([...actual].sort()) !== JSON.stringify(expected)) {
        throw new Error(`Native engine and rules disagree while checking ${name}. Use the bundled compatible engine.`);
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`Capability preflight failed for ${rules.variant} (${name}): ${error.message}`, { cause: error });
    } finally { board?.dispose(); }
  }
  return { probes: probes.size };
}

module.exports = { checkCapabilities };
