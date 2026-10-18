/*! ffish-es6 0.7.10 is GPL-3.0. License: dist/ffish-LICENSE.txt.
 * Corresponding source: vendor/ffish-es6-0.7.10-source.tar.gz.
 * Upstream commit: 43b66c8abfebfcab893a3a4c349aa790d18df148.
 */
import Module from 'ffish-es6';
import wasmBase64 from 'variant-wasm';
import variantConfig from '../variants/levelup-knight.ini';
import pieceVariantConfig from '../variants/levelup.ini';

export const VARIANT = 'levelup-knight';
export const PIECE_VARIANT = 'levelup';
export const SUPPORTED_VARIANTS = Object.freeze([VARIANT, PIECE_VARIANT]);

const RESULTS = new Set(['*', '1-0', '0-1', '1/2-1/2']);
const SQUARE = /^[a-h][1-8]$/;
let ruleModules;
let initializing;

export function initVariantRules() {
  if (!initializing) {
    const configs = { [VARIANT]: variantConfig, [PIECE_VARIANT]: pieceVariantConfig };
    // Fairy Stockfish shares movement tables across boards inside one module.
    // Isolate rule versions so opening an old game cannot change a current one.
    initializing = Promise.all(SUPPORTED_VARIANTS.map(async variant => {
      const loaded = await Module({
        // Supplying bytes also works from file:// without fetching a WASM file.
        wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)),
      });
      loaded.loadVariantConfig(configs[variant]);
      if (!loaded.variants().split(' ').includes(variant)) throw new Error('The upgrade rules could not be loaded.');
      return [variant, loaded];
    })).then(entries => {
      ruleModules = Object.fromEntries(entries);
      return ruleModules[VARIANT];
    }).catch(error => {
      ruleModules = undefined;
      initializing = undefined;
      throw error;
    });
  }
  return initializing;
}

function boardPieces(fen) {
  return fen.split(' ')[0].split('/').map((rank, row) => {
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
  const fields = fen.trim().split(/\s+/);
  const ep = fields[3];
  if (!ep || ep === '-') return rules.validateFen(fen, variant) === 1;
  if (ep.length <= 2) {
    if (rules.validateFen(fen, variant) !== 1 || !/^[a-h][1-8]$/.test(ep)) return false;
    const pieces = boardPieces(fen);
    const file = ep.charCodeAt(0) - 97;
    const rank = Number(ep[1]);
    const movedWhite = fields[1] === 'b';
    const movedColor = movedWhite ? 'w' : 'b';
    const at = squareRank => pieces[8 - squareRank][file];
    if (at(rank) || at(movedWhite ? 2 : 7)) return false;
    // Single-target native FEN takes the nearest opposing piece behind the
    // target as its victim. A forged target must never let it capture a king
    // or another non-pawn. Preserve ordinary and custom pawn target subsets.
    const step = movedWhite ? 1 : -1;
    for (let victimRank = rank + step; victimRank >= 1 && victimRank <= 8; victimRank += step) {
      const victim = at(victimRank);
      if (victim?.color !== movedColor) continue;
      const double = rank === (movedWhite ? 3 : 6) && victimRank === (movedWhite ? 4 : 5)
        && (victim.type === 'p' || variant === PIECE_VARIANT && victim.type === 'c');
      const triple = variant === PIECE_VARIANT && victim.type === 'a'
        && victimRank === (movedWhite ? 5 : 4)
        && (movedWhite ? rank === 3 || rank === 4 : rank === 5 || rank === 6);
      return double || triple;
    }
    return false;
  }
  // The library rejects its own multi-target FEN syntax in its generic
  // validator. Validate every other field, then check these exact native rights.
  if (variant !== PIECE_VARIANT || !/^(?:[a-h][1-8]){2,3}$/.test(ep)) return false;
  const withoutEp = [...fields];
  withoutEp[3] = '-';
  if (rules.validateFen(withoutEp.join(' '), variant) !== 1) return false;
  const file = ep[0];
  const movedWhite = fields[1] === 'b';
  const orangeTargets = movedWhite ? [3, 4] : [5, 6];
  const blueTargets = movedWhite ? [3, 4, 5] : [4, 5, 6];
  const blue = ep === blueTargets.map(rank => file + rank).join('');
  if (!blue && ep !== orangeTargets.map(rank => file + rank).join('')) return false;
  const pieces = boardPieces(fen);
  const at = rank => pieces[8 - rank][file.charCodeAt(0) - 97];
  const landing = movedWhite ? blue ? 5 : 4 : blue ? 4 : 5;
  const pawn = at(landing);
  return pawn?.type === (blue ? 'a' : 'c')
    && pawn.color === (movedWhite ? 'w' : 'b')
    && !at(movedWhite ? 2 : 7)
    && (blue || !at(movedWhite ? 3 : 6));
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
    if (!ruleModules) throw new Error('Call initVariantRules() before creating an upgrade game.');
    if (!SUPPORTED_VARIANTS.includes(variant)) throw new Error('The upgrade variant is not supported.');
    const rules = ruleModules[variant];
    const supplied = fen === undefined ? rules.startingFen(variant) : fen;
    const start = typeof supplied === 'string' ? supplied.trim().split(/\s+/).join(' ') : supplied;
    if (!validStartingFen(start, variant, rules)) throw new Error('The upgrade starting position is invalid.');
    if (opponentInCheck(start, variant, rules)) throw new Error('The upgrade starting position already checks the inactive king.');
    this._variant = variant;
    this._board = new rules.Board(variant, start);
    this._startFen = this._board.fen();
    this._records = [];
    this._positions = [positionKey(this._startFen, this._board)];
    this._headers = { Variant: this.variant, SetUp: '1', FEN: this._startFen, Result: '*' };
  }

  get variant() { return this._variant; }
  fen() { return this._board.fen(); }
  turn() { return this._board.turn() ? 'w' : 'b'; }
  board() { return boardPieces(this.fen()); }

  get(square) {
    if (!SQUARE.test(square)) return undefined;
    return this.board()[8 - Number(square[1])][square.charCodeAt(0) - 97] || undefined;
  }

  moves({ square, verbose = false } = {}) {
    if (square !== undefined && !SQUARE.test(square)) return [];
    const before = this.fen();
    const pieces = boardPieces(before);
    const at = location => pieces[8 - Number(location[1])][location.charCodeAt(0) - 97];
    return this._board.legalMoves().split(' ').filter(Boolean)
      .filter(uci => square === undefined || uci.slice(0, 2) === square)
      .map(uci => {
        const san = this._board.sanMove(uci);
        if (!verbose) return san;
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
          color: piece.color, piece: piece.type, from, to, san, before, flags,
          ...(promotion ? { promotion } : {}),
          ...(captured ? { captured: captured.type } : {}),
        };
      });
  }

  move(request) {
    const legal = this.moves({ verbose: true });
    const move = typeof request === 'string'
      ? legal.find(candidate => candidate.san === canonicalSan(request))
      : legal.find(candidate => candidate.from === request?.from && candidate.to === request?.to && candidate.promotion === request?.promotion);
    if (!move) throw new Error('That move is not legal in this position.');
    const uci = move.from + move.to + (move.promotion || '');
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
  }

  isCheck() { return this._board.isCheck(); }
  isCheckmate() { return this.isCheck() && this._board.numberLegalMoves() === 0; }
  isStalemate() { return !this.isCheck() && this._board.numberLegalMoves() === 0; }
  isInsufficientMaterial() {
    if (this._board.isInsufficientMaterial()) return true;
    // Fairy Stockfish conservatively treats custom pieces as mating material.
    // E attacks exactly like N, and H like B: their extra steps cannot capture.
    // Legacy G (Dabbaba) cannot cover the adjacent escapes needed for mate.
    // Current G also has W attacks, and can mate: Kc2/Ga3 against Ka1.
    // F can mate: Kc2/Fc1 against Ka1 is a checkmate position.
    const material = this.board().flat().filter(piece => piece && piece.type !== 'k');
    return material.length === 1 && (material[0].type === 'e'
      || this.variant === PIECE_VARIANT && material[0].type === 'h'
      || this.variant === VARIANT && material[0].type === 'g');
  }
  isThreefoldRepetition() {
    const current = this._positions.at(-1);
    return this._positions.filter(key => key === current).length >= 3;
  }
  isDraw() { return this.isInsufficientMaterial() || this.isThreefoldRepetition() || this._board.result(true) === '1/2-1/2'; }
  isGameOver() { return this.isInsufficientMaterial() || this.isThreefoldRepetition() || this._board.isGameOver(true); }

  getHeaders() { return { ...this._headers }; }
  setHeader(key, value) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || /[\r\n\x00-\x1f]/.test(value)) throw new Error('The PGN header is invalid.');
    if (key === 'Result' && !RESULTS.has(value)) throw new Error('The PGN result is invalid.');
    this._headers[key] = value;
    return this.getHeaders();
  }
  removeHeader(key) { delete this._headers[key]; }

  pgn({ maxWidth = 80 } = {}) {
    const headers = { ...this._headers, Variant: this.variant, SetUp: '1', FEN: this._startFen };
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
