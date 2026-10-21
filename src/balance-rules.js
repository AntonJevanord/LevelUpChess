/*! ffish-es6 0.7.10 is GPL-3.0. License: dist/ffish-LICENSE.txt.
 * Corresponding source: vendor/ffish-es6-0.7.10-source.tar.gz.
 */
import Module from 'ffish-es6';
import wasmBase64 from 'variant-wasm';
import currentConfig from '../variants/levelup-v5.ini';
import pieceSetup from './piece-setup.js';
import pieceCatalog from './piece-catalog.js';
import profileFen from './profile-fen.js';
import designDeployment from './design-deployment.js';

const { pieceSetupFromLevels } = pieceSetup;
const { PIECE_SLOTS } = pieceCatalog;
const ARMY_SQUARES = new Set([...PIECE_SLOTS.filter(slot => slot.color === 'w').map(slot => slot.square), 'e1']);
const { ROYALS, pieceMap, placementFromMap, checkedBoard } = profileFen;
const { deployDesignArmies } = designDeployment;
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

async function loadProfileModule(variant, config, cacheKey) {
  let pending = profileCache.get(cacheKey);
  if (!pending) {
    pending = Module({ wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)) }).then(module => {
      module.loadVariantConfig(config);
      if (!module.variants().split(' ').includes(variant)) throw new Error('The balance rules could not be loaded.');
      return module;
    });
    profileCache.set(cacheKey, pending);
    while (profileCache.size > 2) profileCache.delete(profileCache.keys().next().value);
    pending.catch(() => { if (profileCache.get(cacheKey) === pending) profileCache.delete(cacheKey); });
  } else {
    profileCache.delete(cacheKey);
    profileCache.set(cacheKey, pending);
  }
  return pending;
}

function designArmyChoices(input, definitions) {
  const army = input && Object.hasOwn(input, 'upgrades') ? input : { upgrades: input };
  const upgrades = army.upgrades === undefined ? {} : army.upgrades;
  if (!upgrades || typeof upgrades !== 'object' || Array.isArray(upgrades)) throw new Error('A design army must map starting squares to design IDs.');
  const choices = [];
  let cost = 0;
  for (const [square, id] of Object.entries(upgrades).sort(([a], [b]) => a.localeCompare(b))) {
    const slot = PIECE_SLOTS.find(candidate => candidate.color === 'w' && candidate.square === square);
    const definition = definitions.get(id)?.definition;
    if (square === 'e1') throw new Error('Dynamic design experiments use ordinary kings.');
    if (!slot || !definition || definition.family !== slot.family) throw new Error(`Choose a registered ${slot?.family || 'piece'} design for ${square}.`);
    choices.push({ square, ...definitions.get(id) });
    cost += definition.level;
  }
  if (cost > 6) throw new Error('A dynamic design army may spend at most 6 upgrade points.');
  const remove = army.remove === undefined ? [] : army.remove;
  if (!Array.isArray(remove) || remove.some(square => !ARMY_SQUARES.has(square) || square === 'e1') || new Set(remove).size !== remove.length) throw new Error('Removed material must list distinct non-king starting squares.');
  if (remove.some(square => Object.hasOwn(upgrades, square))) throw new Error('A removed starting piece cannot also be upgraded.');
  return { choices, remove };
}

async function designMatchRules(input) {
  if (!input || typeof input !== 'object' || typeof input.config !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(input.variant) || !Array.isArray(input.registry?.allocations) || !input.roles || !input.definitionsByLetter) throw new Error('A compiled dynamic design profile is required.');
  // Capture the entire snapshot: a reused variant label must never select a
  // module compiled for a different mapping, movement, or role definition.
  const cacheKey = JSON.stringify(input);
  const profile = JSON.parse(cacheKey);
  const { variant, config, registry, roles } = profile;
  const module = await loadProfileModule(variant, config, cacheKey);
  const definitions = new Map(registry.allocations.map(allocation => [allocation.id, {
    definition: profile.definitionsByLetter[allocation.letter], letter: allocation.letter,
  }]));
  return {
    variant,
    config,
    profile,
    profileHash: profile.hash,
    registryHash: profile.registryHash,
    roles,
    capabilityProbes: profile.capabilityProbes,
    royalMode: 'king',
    evaluationCaveat: null,
    startingFen(whiteArmy = {}, blackArmy = {}) {
      const white = designArmyChoices(whiteArmy, definitions);
      const black = designArmyChoices(blackArmy, definitions);
      const pieces = deployDesignArmies(profile, white, black);
      const castleRook = square => roles.castlingRooks.includes(pieces.get(square)?.toLowerCase());
      const rights = [['K', 'h1'], ['Q', 'a1'], ['k', 'h8'], ['q', 'a8']].filter(([, square]) => castleRook(square)).map(([right]) => right).join('') || '-';
      return placementFromMap(pieces) + ` w ${rights} - 0 1`;
    },
    createBoard(fen) { return wrapBoard(checkedBoard(module, variant, fen, 0, 0, roles), 0, 0); },
  };
}

export async function createMatchRules({ whiteKing = 0, blackKing = 0, profile } = {}) {
  if (profile !== undefined) {
    if (whiteKing !== 0 || blackKing !== 0) throw new Error('Dynamic design experiments use ordinary kings.');
    return designMatchRules(profile);
  }
  if (![whiteKing, blackKing].every(level => Number.isInteger(level) && level >= 0 && level <= 3)) throw new Error('King levels must be whole numbers from 0 to 3.');
  const variant = `levelup-balance-${whiteKing}-${blackKing}`;
  const config = profileConfig(variant, whiteKing, blackKing);
  const module = await loadProfileModule(variant, config, variant + '\n' + config);
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
