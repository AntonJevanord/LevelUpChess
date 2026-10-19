/*! ffish-es6 0.7.10 is GPL-3.0. License: dist/ffish-LICENSE.txt.
 * Corresponding source: vendor/ffish-es6-0.7.10-source.tar.gz.
 */
import Module from 'ffish-es6';
import wasmBase64 from 'variant-wasm';
import currentConfig from '../variants/levelup-v5.ini';
import pieceSetup from './piece-setup.js';
import pieceCatalog from './piece-catalog.js';

const { pieceSetupFromLevels } = pieceSetup;
const { PIECE_SLOTS } = pieceCatalog;
const ARMY_SQUARES = new Set([...PIECE_SLOTS.filter(slot => slot.color === 'w').map(slot => slot.square), 'e1']);
const ROYALS = ['v', 'w', 'x', 'y'];
const ROYAL_MOVES = ['K', 'KcsD', 'KcD', 'KcDcA'];
// Each module owns global movement tables. Cache only two profiles; existing
// boards retain their own module even after its cache entry has been evicted.
const profileCache = new Map();

/** Relative White-side starting squares are used for either army. */
export function normalizeArmy(map = {}) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('An army must be an object mapping starting squares to levels.');
  const upgrades = {};
  for (const square of Object.keys(map).sort()) {
    if (!ARMY_SQUARES.has(square)) throw new Error(`Unknown army square: ${square}. Use White-side starting squares for both armies.`);
    const level = map[square];
    if (!Number.isInteger(level) || level < 0 || level > 3) throw new Error(`The level on ${square} must be a whole number from 0 to 3.`);
    if (level) upgrades[square] = level;
  }
  return { upgrades, cost: Object.values(upgrades).reduce((total, level) => total + level, 0), kingLevel: upgrades.e1 || 0 };
}

function armyChoices(army) {
  // Re-normalize instead of trusting recorded cost/kingLevel metadata.
  const descriptor = army && Object.hasOwn(army, 'upgrades');
  const normalized = normalizeArmy(descriptor ? army.upgrades : army);
  const remove = descriptor && army.remove !== undefined ? army.remove : [];
  if (!Array.isArray(remove) || remove.some(square => !ARMY_SQUARES.has(square) || square === 'e1') || new Set(remove).size !== remove.length) throw new Error('Removed material must list distinct non-king starting squares.');
  if (remove.some(square => normalized.upgrades[square])) throw new Error('A removed starting piece cannot also be upgraded.');
  return { ...normalized, remove };
}

function profileConfig(variant, whiteKing, blackKing) {
  const symmetric = whiteKing === blackKing;
  const whiteRoyal = symmetric ? 'k' : ROYALS[whiteKing];
  const blackRoyal = symmetric ? 'k' : ROYALS[blackKing];
  const config = currentConfig
    .replace(/^\[levelup-v5:chess\]/m, `[${variant}:chess]`)
    .replace(/^pieceToCharTable\s*=.*$/m, 'pieceToCharTable = -')
    .replace(/^startFen\s*=.*$/m, `startFen = rnbq${blackRoyal}bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ${whiteRoyal.toUpperCase()}BNR w KQkq - 0 1`);
  // Keeping the actual KING type preserves native king safety evaluation.
  // Independent movement requires pseudo-royals only for unequal king tiers.
  if (symmetric) return config + `\nking = k:${ROYAL_MOVES[whiteKing]}\n`;
  return config + '\n# Independent royal types preserve each side\'s selected capture ability.\n'
    + 'king = -\n'
    + ROYAL_MOVES.map((movement, index) => `customPiece${index + 16} = ${ROYALS[index]}:${movement}`).join('\n') + '\n'
    + 'extinctionPseudoRoyal = true\nextinctionPieceTypes = vwxy\nextinctionValue = loss\n'
    + `castlingKingPieceWhite = ${ROYALS[whiteKing]}\ncastlingKingPieceBlack = ${ROYALS[blackKing]}\n`;
}

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

function validEp(fen, pieces) {
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
  if (targets.length === 1) {
    const rank = Number(ep[1]);
    if (at(rank)) {
      // Initial blue-queen jumps produce an inert occupied landing marker.
      if (at(rank) !== colored('s')) return false;
      return (movedWhite ? [1, 2] : [7, 8]).some(sourceRank => [...'abcdefgh'].some(sourceFile => {
        const files = Math.abs(file.charCodeAt(0) - sourceFile.charCodeAt(0));
        const ranks = Math.abs(rank - sourceRank);
        const leap = Math.min(files, ranks) * 10 + Math.max(files, ranks);
        return !pieces.has(sourceFile + sourceRank) && [12, 13, 23].includes(leap);
      }));
    }
    for (let landing = rank + step; landing >= 1 && landing <= 8; landing += step) {
      const victim = at(landing);
      if (!victim || (victim === victim.toUpperCase()) !== movedWhite) continue;
      const distance = victim.toLowerCase() === 'a' ? 3 : ['p', 'c'].includes(victim.toLowerCase()) ? 2 : 0;
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
  return validSource(source) && !at(source) && at(landing) === colored(distance === 3 ? 'a' : 'c')
    && (distance === 3 || !at(source + step));
}

function checkedBoard(module, variant, input, whiteKing, blackKing) {
  if (typeof input !== 'string') throw new Error('Invalid balance starting FEN.');
  const fen = input.trim().split(/\s+/).join(' ');
  const fields = fen.split(' ');
  if (fields.length !== 6 || !['w', 'b'].includes(fields[1]) || !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) throw new Error('Invalid balance starting FEN.');
  const pieces = pieceMap(fen);
  // The generic pseudo-royal FEN validator accepts missing/extra royal pieces.
  // A balance position must have exactly its selected royal for each color.
  const royals = [...pieces.values()].filter(piece => /[kvwxy]/i.test(piece));
  const symmetric = whiteKing === blackKing;
  if (royals.length !== 2 || !royals.includes(symmetric ? 'K' : ROYALS[whiteKing].toUpperCase()) || !royals.includes(symmetric ? 'k' : ROYALS[blackKing])) throw new Error('A balance position must contain exactly one selected royal king per side.');
  const noEp = [...fields];
  noEp[3] = '-';
  if (module.validateFen(noEp.join(' '), variant) !== 1 || !validEp(fen, pieces)) throw new Error('Invalid balance starting FEN.');
  const inactiveFields = [...noEp];
  inactiveFields[1] = fields[1] === 'w' ? 'b' : 'w';
  const inactive = new module.Board(variant, inactiveFields.join(' '));
  try {
    if (inactive.isCheck()) throw new Error('The balance starting position already checks the inactive king.');
  } finally { inactive.delete(); }
  return new module.Board(variant, fen);
}

function positionKey(board) {
  const fields = board.fen().split(' ').slice(0, 4);
  if (fields[3] !== '-') {
    const pieces = pieceMap(board.fen());
    const targets = new Set(fields[3].match(/[a-h][1-8]/g));
    // Include only legal en passant captures, including custom multi-target
    // pawn leaps. Inert landing markers and pinned captures do not count.
    fields[3] = [...new Set(board.legalMoves().split(' ').filter(Boolean)
      .filter(uci => targets.has(uci.slice(2, 4)) && !pieces.has(uci.slice(2, 4)) && board.isCapture(uci))
      .map(uci => uci.slice(2, 4)))].sort().join('') || '-';
  }
  return fields.join(' ');
}

function wrapBoard(raw, whiteKing, blackKing) {
  const repetitions = new Map();
  const remember = () => {
    const key = positionKey(raw);
    repetitions.set(key, (repetitions.get(key) || 0) + 1);
  };
  remember();
  const alive = () => { if (!raw) throw new Error('This balance board has been disposed.'); return raw; };
  return {
    fen() { return alive().fen(); },
    turn() { return alive().turn() ? 'w' : 'b'; },
    moves() { return alive().legalMoves().split(' ').filter(Boolean); },
    push(uci) {
      if (typeof uci !== 'string' || !this.moves().includes(uci)) return false;
      if (!alive().push(uci)) return false;
      remember();
      return true;
    },
    san(uci) {
      if (!this.moves().includes(uci)) throw new Error(`Illegal balance move: ${uci}.`);
      const board = alive();
      const san = board.sanMove(uci).replace(/[+#]$/, '');
      // Upstream SAN does not annotate checks from pseudo-royal pieces.
      // Inspect the actual resulting position, without recording history.
      if (!board.push(uci)) throw new Error(`Illegal balance move: ${uci}.`);
      try { return san + (board.isCheck() ? board.numberLegalMoves() === 0 ? '#' : '+' : ''); }
      finally { board.pop(); }
    },
    outcome() {
      const board = alive();
      // Mating positions must win even when the upstream ordinary-king
      // material heuristic would incorrectly call the position a draw.
      if (board.numberLegalMoves() === 0) return board.isCheck()
        ? { result: board.turn() ? '0-1' : '1-0', reason: 'checkmate' }
        : { result: '1/2-1/2', reason: 'stalemate' };
      if (whiteKing === blackKing && pieceMap(board.fen()).size === 2) return { result: '1/2-1/2', reason: 'insufficient-material' };
      if ((repetitions.get(positionKey(board)) || 0) >= 3) return { result: '1/2-1/2', reason: 'threefold-repetition' };
      if (board.halfmoveClock() >= 100) return { result: '1/2-1/2', reason: 'fifty-move-rule' };
      return null;
    },
    dispose() { if (raw) raw.delete(); raw = null; },
  };
}

export async function createMatchRules({ whiteKing = 0, blackKing = 0 } = {}) {
  if (![whiteKing, blackKing].every(level => Number.isInteger(level) && level >= 0 && level <= 3)) throw new Error('King levels must be whole numbers from 0 to 3.');
  const variant = `levelup-balance-${whiteKing}-${blackKing}`;
  const config = profileConfig(variant, whiteKing, blackKing);
  let pending = profileCache.get(variant);
  if (!pending) {
    pending = Module({ wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)) }).then(module => {
      module.loadVariantConfig(config);
      if (!module.variants().split(' ').includes(variant)) throw new Error('The balance rules could not be loaded.');
      return module;
    });
    profileCache.set(variant, pending);
    while (profileCache.size > 2) profileCache.delete(profileCache.keys().next().value);
    pending.catch(() => { if (profileCache.get(variant) === pending) profileCache.delete(variant); });
  } else {
    profileCache.delete(variant);
    profileCache.set(variant, pending);
  }
  const module = await pending;
  return {
    variant,
    config,
    royalMode: whiteKing === blackKing ? 'king' : 'pseudo-royal',
    evaluationCaveat: whiteKing === blackKing ? null : 'Unequal king levels use pseudo-royal pieces; the native engine omits its ordinary king safety evaluation. Treat these games as exploratory, and do not compare their engine strength directly with ordinary-king controls.',
    startingFen(whiteArmy = {}, blackArmy = {}) {
      const white = armyChoices(whiteArmy);
      const black = armyChoices(blackArmy);
      if (white.kingLevel !== whiteKing || black.kingLevel !== blackKing) throw new Error('Army king levels must match the selected balance rules.');
      const levels = Object.fromEntries(PIECE_SLOTS.map(slot => {
        const choices = slot.color === 'w' ? white.upgrades : black.upgrades;
        const relativeSquare = slot.color === 'w' ? slot.square : slot.square[0] + (9 - Number(slot.square[1]));
        return [slot.square, choices[relativeSquare] || 0];
      }));
      const pieces = pieceMap(pieceSetupFromLevels(levels, 45).fen);
      for (const square of white.remove) pieces.delete(square);
      for (const square of black.remove) pieces.delete(square[0] + (9 - Number(square[1])));
      pieces.set('e1', whiteKing === blackKing ? 'K' : ROYALS[whiteKing].toUpperCase());
      pieces.set('e8', whiteKing === blackKing ? 'k' : ROYALS[blackKing]);
      const rights = [...'KQkq'].filter(right => !({ K: white.remove.includes('h1'), Q: white.remove.includes('a1'), k: black.remove.includes('h1'), q: black.remove.includes('a1') })[right]).join('') || '-';
      return placementFromMap(pieces) + ` w ${rights} - 0 1`;
    },
    createBoard(fen) {
      return wrapBoard(checkedBoard(module, variant, fen, whiteKing, blackKing), whiteKing, blackKing);
    },
  };
}
