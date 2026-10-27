/*! ffish-es6 0.7.10 is GPL-3.0. License: dist/ffish-LICENSE.txt.
 * Corresponding source: vendor/ffish-es6-0.7.10-source.tar.gz.
 * Upstream commit: 43b66c8abfebfcab893a3a4c349aa790d18df148.
 */
import Module from 'ffish-es6';
import wasmBase64 from 'variant-wasm';
import variantConfig from '../variants/levelup-knight.ini';
import pieceVariantConfig from '../variants/levelup.ini';
import currentVariantConfig from '../variants/levelup-v5.ini';
import designOptions from './design-options.js';
import profileFen from './profile-fen.js';

const { PLAYABLE_PROFILE, PLAYABLE_PROFILES, EXPERIMENTAL_VARIANTS, getPlayableProfile, isExperimentalVariant, getProfileSnapshot, pieceInfoForProfile, encodeProfileSnapshot, decodeProfileSnapshot } = designOptions;
const { checkedBoard, pocketLetters } = profileFen;

export const VARIANT = 'levelup-knight';
export const PIECE_VARIANT = 'levelup';
export const CURRENT_VARIANT = 'levelup-v5';
export const EXPERIMENTAL_VARIANT = PLAYABLE_PROFILE.variant;
export const SUPPORTED_VARIANTS = Object.freeze([VARIANT, PIECE_VARIANT, CURRENT_VARIANT, ...EXPERIMENTAL_VARIANTS]);
export const isPieceVariant = variant => variant === PIECE_VARIANT || variant === CURRENT_VARIANT;

const RESULTS = new Set(['*', '1-0', '0-1', '1/2-1/2']);
const SQUARE = /^[a-h][1-8]$/;
const ruleModules = new Map();
const initializing = new Map();
let initializingAll;
const configs = { [VARIANT]: variantConfig, [PIECE_VARIANT]: pieceVariantConfig, [CURRENT_VARIANT]: currentVariantConfig, ...Object.fromEntries(PLAYABLE_PROFILES.map(profile => [profile.variant, profile.config])) };

export function initVariantRules(variant) {
  // Preserve the original all-profile API for callers that explicitly need it.
  if (variant === undefined) {
    if (!initializingAll) {
      const pending = Promise.all(SUPPORTED_VARIANTS.map(initVariantRules)).then(() => ruleModules.get(VARIANT)).catch(error => {
        if (initializingAll === pending) initializingAll = undefined;
        throw error;
      });
      initializingAll = pending;
    }
    return initializingAll;
  }
  if (!SUPPORTED_VARIANTS.includes(variant)) return Promise.reject(new Error('The upgrade variant is not supported.'));
  if (initializing.has(variant)) return initializing.get(variant);
  // Fairy Stockfish shares movement tables inside each module. Initialize only
  // the requested profile, retaining a separate module and promise for each.
  const pending = Promise.resolve().then(() => Module({
    // Supplying bytes also works from file:// without fetching a WASM file.
    wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)),
  })).then(loaded => {
    loaded.loadVariantConfig(configs[variant]);
    if (!loaded.variants().split(' ').includes(variant)) throw new Error('The upgrade rules could not be loaded.');
    ruleModules.set(variant, loaded);
    return loaded;
  }).catch(error => {
    if (initializing.get(variant) === pending) initializing.delete(variant);
    throw error;
  });
  initializing.set(variant, pending);
  return pending;
}

function boardPieces(fen) {
  return fen.split(' ')[0].replace(/\[[A-Za-z]*\]$/, '').split('/').map((rank, row) => {
    const pieces = [];
    for (const character of rank) {
      if (/^[1-8]$/.test(character)) {
        for (let count = Number(character); count > 0; count--) pieces.push(null);
      } else {
        pieces.push({
          square: 'abcdefgh'[pieces.length] + (8 - row),
          type: character.toLowerCase(),
          color: character === character.toUpperCase() ? 'w' : 'b',
        });
      }
    }
    return pieces;
  });
}

function positionKey(fen, board) {
  const fields = fen.split(' ').slice(0, 4);
  if (fields[3] !== '-') {
    // Native custom initial leaps can retain several targets, including the
    // occupied landing square. Only legal en passant captures affect repetition.
    const pieces = boardPieces(fen);
    const targets = new Set(fields[3].match(/[a-h][1-8]/g));
    const legalTargets = board.legalMoves().split(' ').filter(Boolean)
      .map(uci => {
        const to = uci.slice(2, 4);
        const occupied = pieces[8 - Number(to[1])][to.charCodeAt(0) - 97];
        return targets.has(to) && !occupied && board.isCapture(uci) ? to : undefined;
      }).filter(Boolean);
    fields[3] = [...new Set(legalTargets)].sort().join('') || '-';
  }
  return fields.join(' ');
}

function enPassantVictim(board, uci, pieces, movingColor) {
  // With an initial three-square leap the removed pawn can be two ranks from
  // the target. Read the engine's result instead of assuming a one-rank offset.
  if (!board.push(uci)) throw new Error('The upgrade rules rejected that capture.');
  try {
    const after = boardPieces(board.fen());
    return pieces.flat().find(piece => piece && piece.color !== movingColor
      && !after[8 - Number(piece.square[1])][piece.square.charCodeAt(0) - 97]);
  } finally {
    board.pop();
  }
}

function validStartingFen(fen, variant, rules) {
  if (typeof fen !== 'string') return false;
  const fields = fen.split(' ');
  const ep = fields[3];
  if (!ep || ep === '-') return rules.validateFen(fen, variant) === 1;
  const targets = ep.match(/[a-h][1-8]/g);
  if (!targets || targets.join('') !== ep || targets.length > 3) return false;
  const withoutEp = [...fields];
  withoutEp[3] = '-';
  if (rules.validateFen(withoutEp.join(' '), variant) !== 1) return false;
  const file = ep[0];
  const movedWhite = fields[1] === 'b';
  const movedColor = movedWhite ? 'w' : 'b';
  const step = movedWhite ? 1 : -1;
  const pieces = boardPieces(fen);
  const at = rank => pieces[8 - rank][file.charCodeAt(0) - 97];
  const validSource = rank => movedWhite
    ? rank === 2 || variant === CURRENT_VARIANT && rank === 1
    : rank === 7 || variant === CURRENT_VARIANT && rank === 8;
  if (targets.length === 1) {
    const rank = Number(ep[1]);
    const marker = at(rank);
    if (marker) {
      // An initial non-ray jump marks its occupied landing square in native
      // FEN. For S this is inert: en passant can only target an empty square.
      // Accept only the current blue queen and a plausible quiet home jump.
      if (variant !== CURRENT_VARIANT || marker.type !== 's' || marker.color !== movedColor) return false;
      const landingFile = file.charCodeAt(0) - 97;
      const homeRanks = movedWhite ? [1, 2] : [7, 8];
      return homeRanks.some(sourceRank => pieces[8 - sourceRank].some((piece, sourceFile) => {
        const files = Math.abs(landingFile - sourceFile);
        const ranks = Math.abs(rank - sourceRank);
        const jump = Math.min(files, ranks) * 10 + Math.max(files, ranks);
        return !piece && [12, 13, 23].includes(jump);
      }));
    }
    // Native single-target FEN captures the nearest opposing piece behind it.
    // Reject invented rights that would remove a royal king or another piece.
    for (let landing = rank + step; landing >= 1 && landing <= 8; landing += step) {
      const victim = at(landing);
      if (victim?.color !== movedColor) continue;
      const distance = isPieceVariant(variant) && victim.type === 'a' ? 3
        : victim.type === 'p' || isPieceVariant(variant) && victim.type === 'c' ? 2 : 0;
      const source = landing - step * distance;
      return distance > 0 && validSource(source) && !at(source)
        && (rank - source) * step > 0 && (landing - rank) * step > 0;
    }
    return false;
  }
  // The generic validator rejects native multi-target notation. Its complete
  // path includes the landing square, so verify the exact initial pawn leap.
  if (!isPieceVariant(variant)) return false;
  const ranks = targets.map(target => Number(target[1]));
  if (targets.some(target => target[0] !== file) || ranks.some((rank, i) => i && rank !== ranks[i - 1] + 1)) return false;
  const distance = targets.length;
  const landing = movedWhite ? ranks.at(-1) : ranks[0];
  const source = landing - step * distance;
  const pawn = at(landing);
  return validSource(source) && !at(source)
    && pawn?.color === movedColor && pawn.type === (distance === 3 ? 'a' : 'c')
    && (distance === 3 || !at(source + step));
}

function opponentInCheck(fen, variant, rules) {
  // The library's FEN validator does not reject every impossible custom-piece
  // position. A legal starting position cannot already check the inactive king.
  const fields = fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  const opponent = new rules.Board(variant, fields.join(' '));
  try { return opponent.isCheck(); }
  finally { opponent.delete(); }
}
const copyMove = move => move ? { ...move } : null;
const escapeHeader = value => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const canonicalSan = san => san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O').replace(/[!?]+$/, '');

function stripComments(text) {
  let result = '';
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '{') {
      const end = text.indexOf('}', index + 1);
      if (end < 0 || text.slice(index + 1, end).includes('{')) throw new Error('The PGN has an unfinished or nested comment.');
      index = end;
      result += ' ';
    } else if (character === ';') {
      const end = text.indexOf('\n', index + 1);
      index = end < 0 ? text.length : end;
      result += ' ';
    } else {
      if (character === '(' || character === ')') throw new Error('Upgrade PGNs support the main line only. Remove variations before importing.');
      if (character === '}') throw new Error('The PGN has an unmatched comment marker.');
      result += character;
    }
  }
  return result;
}

function readHeaders(text) {
  const headers = {};
  let body = text.replace(/^\uFEFF/, '').trimStart();
  while (body.startsWith('[')) {
    const match = body.match(/^\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:[^"\\\r\n]|\\["\\])*)"\s*\]/);
    if (!match || Object.hasOwn(headers, match[1])) throw new Error('The PGN headers are invalid or repeated.');
    headers[match[1]] = match[2].replace(/\\(["\\])/g, '$1');
    body = body.slice(match[0].length).trimStart();
  }
  return { headers, body };
}

/** A small chess.js-shaped facade over the same rules used by the native engine. */
export class VariantGame {
  constructor(fen, variant = VARIANT) {
    if (!SUPPORTED_VARIANTS.includes(variant)) throw new Error('The upgrade variant is not supported.');
    const rules = ruleModules.get(variant);
    if (!rules) throw new Error('Call initVariantRules() for this variant before creating an upgrade game.');
    const supplied = fen === undefined ? rules.startingFen(variant) : fen;
    const start = typeof supplied === 'string' ? supplied.trim().split(/\s+/).join(' ') : supplied;
    const experimental = isExperimentalVariant(variant);
    if (!experimental && !validStartingFen(start, variant, rules)) throw new Error('The upgrade starting position is invalid.');
    if (!experimental && opponentInCheck(start, variant, rules)) throw new Error('The upgrade starting position already checks the inactive king.');
    this._variant = variant;
    this._board = experimental ? checkedBoard(rules, variant, start, 0, 0, getPlayableProfile(variant).roles) : new rules.Board(variant, start);
    this._startFen = this._board.fen();
    this._records = [];
    this._positions = [positionKey(this._startFen, this._board)];
    this._headers = { Variant: this.variant, SetUp: '1', FEN: this._startFen, Result: '*' };
    if (experimental) this._headers.LevelUpProfile = encodeProfileSnapshot(getProfileSnapshot(variant));
  }

  get variant() { return this._variant; }
  get profile() { return isExperimentalVariant(this.variant) ? getPlayableProfile(this.variant) : undefined; }
  pieceInfo(type) { return pieceInfoForProfile(this.profile, type); }
  fen() { return this._board.fen(); }
  turn() { return this._board.turn() ? 'w' : 'b'; }
  board() { return boardPieces(this.fen()); }
  pockets() {
    const result = { w: [], b: [] };
    for (const character of pocketLetters(this.fen())) {
      const color = character === character.toUpperCase() ? 'w' : 'b';
      const type = character.toLowerCase();
      const existing = result[color].find(piece => piece.type === type);
      if (existing) existing.count++;
      else result[color].push({ type, color, count: 1 });
    }
    return result;
  }

  get(square) {
    if (!SQUARE.test(square)) return undefined;
    return this.board()[8 - Number(square[1])][square.charCodeAt(0) - 97] || undefined;
  }

  moves({ square, drop, verbose = false } = {}) {
    if (square !== undefined && !SQUARE.test(square)) return [];
    if (drop !== undefined && !/^[a-z]$/i.test(drop)) return [];
    const before = this.fen();
    const pieces = boardPieces(before);
    const at = location => pieces[8 - Number(location[1])][location.charCodeAt(0) - 97];
    return this._board.legalMoves().split(' ').filter(Boolean)
      .filter(uci => square === undefined || uci.slice(0, 2) === square)
      .filter(uci => drop === undefined || uci[1] === '@' && uci[0].toLowerCase() === drop.toLowerCase())
      .map(uci => {
        const san = this._board.sanMove(uci);
        if (!verbose) return san;
        if (uci[1] === '@') {
          const type = uci[0].toLowerCase();
          return { color: this.turn(), piece: type, from: type + '@', to: uci.slice(2, 4), drop: type, uci, san, before, flags: 'd' };
        }
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const piece = at(from);
        let captured = at(to);
        const promotion = uci[4];
        const enPassant = !captured && this._board.isCapture(uci);
        if (enPassant) captured = enPassantVictim(this._board, uci, pieces, piece.color);
        let flags = captured ? 'c' : 'n';
        if (enPassant) flags = 'e';
        else if (/^O-O/.test(san)) flags = /^O-O-O/.test(san) ? 'q' : 'k';
        else if (piece.type === 'p' && Math.abs(Number(from[1]) - Number(to[1])) === 2) flags = 'b';
        if (promotion) flags = flags.replace('n', '') + 'p';
        return {
          color: piece.color, piece: piece.type, from, to, uci, san, before, flags,
          ...(promotion ? { promotion } : {}),
          ...(captured ? { captured: captured.type } : {}),
        };
      });
  }

  move(request) {
    const legal = this.moves({ verbose: true });
    const move = typeof request === 'string'
      ? legal.find(candidate => candidate.san === canonicalSan(request) || candidate.uci === request)
      : legal.find(candidate => (request?.drop ? candidate.drop === request.drop.toLowerCase() : candidate.from === request?.from) && candidate.to === request?.to && candidate.promotion === request?.promotion);
    if (!move) throw new Error('That move is not legal in this position.');
    const uci = move.uci;
    if (!this._board.push(uci)) throw new Error('The upgrade rules rejected that move.');
    const recorded = { ...move, after: this.fen() };
    this._records.push(recorded);
    this._positions.push(positionKey(recorded.after, this._board));
    return copyMove(recorded);
  }

  history({ verbose = false } = {}) {
    return this._records.map(move => verbose ? copyMove(move) : move.san);
  }

  undo() {
    if (!this._records.length) return null;
    this._board.pop();
    this._positions.pop();
    return copyMove(this._records.pop());
  }

  reset() {
    this._board.setFen(this._startFen);
    this._records = [];
    this._positions = [positionKey(this._startFen, this._board)];
    this._headers = { Variant: this.variant, SetUp: '1', FEN: this._startFen, Result: '*' };
    if (this.profile) this._headers.LevelUpProfile = encodeProfileSnapshot(getProfileSnapshot(this.variant));
  }

  isCheck() { return this._board.isCheck(); }
  isCheckmate() { return this.isCheck() && this._board.numberLegalMoves() === 0; }
  isStalemate() { return !this.isCheck() && this._board.numberLegalMoves() === 0; }
  isInsufficientMaterial() {
    // The experiment profile deliberately keeps uncommon minor-piece endings
    // playable: ordinary material heuristics can miss new mating attacks.
    if (this.profile) return !this.isCheckmate() && this.board().flat().filter(Boolean).length === 2 && !pocketLetters(this.fen());
    if (this._board.isInsufficientMaterial()) return true;
    // Fairy Stockfish conservatively treats custom pieces as mating material.
    // E attacks exactly like N, and H like B: their extra steps cannot capture.
    // Legacy G (Dabbaba) cannot cover the adjacent escapes needed for mate.
    // Current G also has W attacks, and can mate: Kc2/Ga3 against Ka1.
    // F can mate: Kc2/Fc1 against Ka1 is a checkmate position.
    const material = this.board().flat().filter(piece => piece && piece.type !== 'k');
    return material.length === 1 && (material[0].type === 'e'
      || isPieceVariant(this.variant) && material[0].type === 'h'
      || this.variant === VARIANT && material[0].type === 'g');
  }
  isThreefoldRepetition() {
    const current = this._positions.at(-1);
    return this._positions.filter(key => key === current).length >= 3;
  }
  isDraw() {
    if (this.profile) return !this.isCheckmate() && (this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this._board.halfmoveClock() >= 100);
    return this.isInsufficientMaterial() || this.isThreefoldRepetition() || this._board.result(true) === '1/2-1/2';
  }
  isGameOver() { return this.profile ? this.isCheckmate() || this.isDraw() : this.isInsufficientMaterial() || this.isThreefoldRepetition() || this._board.isGameOver(true); }

  getHeaders() { return { ...this._headers, ...(this.profile ? { LevelUpProfile: encodeProfileSnapshot(getProfileSnapshot(this.variant)) } : {}) }; }
  setHeader(key, value) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || /[\r\n\x00-\x1f]/.test(value)) throw new Error('The PGN header is invalid.');
    if (key === 'Result' && !RESULTS.has(value)) throw new Error('The PGN result is invalid.');
    if (key === 'LevelUpProfile') {
      if (!this.profile) throw new Error('A design profile requires its experimental variant.');
      if (decodeProfileSnapshot(value).variant !== this.variant) throw new Error('The design profile does not match the PGN variant.');
    }
    this._headers[key] = value;
    return this.getHeaders();
  }
  removeHeader(key) { delete this._headers[key]; }

  pgn({ maxWidth = 80 } = {}) {
    const headers = { ...this.getHeaders(), Variant: this.variant, SetUp: '1', FEN: this._startFen };
    const result = headers.Result || '*';
    const tokens = [];
    this._records.forEach((move, index) => {
      const fullmove = move.before.split(' ')[5];
      if (move.color === 'w') tokens.push(`${fullmove}.`);
      else if (index === 0) tokens.push(`${fullmove}...`);
      tokens.push(move.san);
    });
    tokens.push(result);
    const lines = [''];
    for (const token of tokens) {
      const last = lines.length - 1;
      if (maxWidth > 0 && lines[last] && lines[last].length + 1 + token.length > maxWidth) lines.push(token);
      else lines[last] += (lines[last] ? ' ' : '') + token;
    }
    return Object.entries(headers).map(([key, value]) => `[${key} "${escapeHeader(value)}"]`).join('\n') + '\n\n' + lines.join('\n');
  }

  loadPgn(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 256 * 1024) throw new Error('Enter a PGN game up to 256 KB.');
    const { headers, body } = readHeaders(text);
    const variant = headers.Variant?.toLowerCase();
    if (!SUPPORTED_VARIANTS.includes(variant)) throw new Error(`This game requires a supported upgrade PGN variant: ${SUPPORTED_VARIANTS.join(', ')}.`);
    if (isExperimentalVariant(variant)) {
      if (!headers.LevelUpProfile) throw new Error('The experimental PGN is missing its design profile.');
      if (decodeProfileSnapshot(headers.LevelUpProfile).variant !== variant) throw new Error('The design profile does not match the PGN variant.');
    } else if (headers.LevelUpProfile) throw new Error('A design profile requires its experimental variant.');
    if (headers.SetUp !== undefined && !['0', '1'].includes(headers.SetUp)) throw new Error('The PGN setup header is invalid.');
    if (headers.SetUp === '1' && !headers.FEN || headers.SetUp === '0' && headers.FEN) throw new Error('The PGN setup and starting position do not agree.');
    let candidate;
    try {
      candidate = new VariantGame(headers.FEN, variant);
      for (const [key, value] of Object.entries(headers)) candidate.setHeader(key, key === 'Variant' ? variant : value);
      let result;
      for (const token of stripComments(body).split(/\s+/).filter(Boolean)) {
        if (/^\$\d+$/.test(token)) continue;
        if (result !== undefined) throw new Error('The PGN contains moves or text after its result.');
        const number = token.match(/^(\d+)\.(\.\.)?/);
        let san = token;
        if (number) {
          if (Number(number[1]) !== Number(candidate.fen().split(' ')[5]) || Boolean(number[2]) !== (candidate.turn() === 'b')) throw new Error('A PGN move number does not match the position.');
          san = token.slice(number[0].length);
          if (!san) continue;
        }
        if (RESULTS.has(san)) { result = san; continue; }
        candidate.move(canonicalSan(san));
      }
      if (headers.Result && result !== undefined && headers.Result !== result) throw new Error('The PGN result header and move text do not agree.');
      candidate.setHeader('Result', result || headers.Result || '*');
      this._board.delete();
      this._board = candidate._board;
      this._variant = candidate.variant;
      this._startFen = candidate._startFen;
      this._records = candidate._records;
      this._positions = candidate._positions;
      this._headers = candidate._headers;
      candidate._board = null;
    } finally {
      candidate?.dispose();
    }
  }

  dispose() {
    if (this._board) this._board.delete();
    this._board = null;
  }
}
