/*! ffish-es6 0.7.10 is GPL-3.0. License: dist/ffish-LICENSE.txt.
 * Corresponding source: vendor/ffish-es6-0.7.10-source.tar.gz.
 * Upstream commit: 43b66c8abfebfcab893a3a4c349aa790d18df148.
 */
import Module from 'ffish-es6';
import wasmBase64 from 'variant-wasm';
import variantConfig from '../variants/levelup-knight.ini';

export const VARIANT = 'levelup-knight';

const RESULTS = new Set(['*', '1-0', '0-1', '1/2-1/2']);
const SQUARE = /^[a-h][1-8]$/;
let rules;
let initializing;

export function initVariantRules() {
  if (!initializing) {
    initializing = Module({
      // Supplying the bytes also works from file://, without fetching a WASM file.
      wasmBinary: Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0)),
    }).then(loaded => {
      loaded.loadVariantConfig(variantConfig);
      if (!loaded.variants().split(' ').includes(VARIANT)) throw new Error('The upgrade rules could not be loaded.');
      rules = loaded;
      return loaded;
    }).catch(error => {
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
    // The native FEN can retain a target when its only capturer is pinned.
    // Repetition depends on legal moves, so such a target changes no rights.
    const pieces = boardPieces(fen);
    const legalCapture = board.legalMoves().split(' ').filter(Boolean).some(uci => {
      if (uci.slice(2, 4) !== fields[3] || uci[0] === uci[2]) return false;
      return pieces[8 - Number(uci[1])][uci.charCodeAt(0) - 97]?.type === 'p';
    });
    if (!legalCapture) fields[3] = '-';
  }
  return fields.join(' ');
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
  constructor(fen) {
    if (!rules) throw new Error('Call initVariantRules() before creating an upgrade game.');
    const start = fen === undefined ? rules.startingFen(VARIANT) : fen;
    if (typeof start !== 'string' || rules.validateFen(start, VARIANT) !== 1) throw new Error('The upgrade starting position is invalid.');
    this._board = new rules.Board(VARIANT, start);
    this._startFen = this._board.fen();
    this._records = [];
    this._positions = [positionKey(this._startFen, this._board)];
    this._headers = { Variant: VARIANT, SetUp: '1', FEN: this._startFen, Result: '*' };
  }

  get variant() { return VARIANT; }
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
        const captured = at(to);
        const promotion = uci[4];
        const enPassant = piece.type === 'p' && from[0] !== to[0] && !captured;
        let flags = captured ? 'c' : 'n';
        if (enPassant) flags = 'e';
        else if (piece.type === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) flags = to[0] === 'g' ? 'k' : 'q';
        else if (piece.type === 'p' && Math.abs(Number(from[1]) - Number(to[1])) === 2) flags = 'b';
        if (promotion) flags = flags.replace('n', '') + 'p';
        return {
          color: piece.color, piece: piece.type, from, to, san, before, flags,
          ...(promotion ? { promotion } : {}),
          ...(captured || enPassant ? { captured: captured?.type || 'p' } : {}),
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
    this._headers = { Variant: VARIANT, SetUp: '1', FEN: this._startFen, Result: '*' };
  }

  isCheck() { return this._board.isCheck(); }
  isCheckmate() { return this.isCheck() && this._board.numberLegalMoves() === 0; }
  isStalemate() { return !this.isCheck() && this._board.numberLegalMoves() === 0; }
  isInsufficientMaterial() {
    if (this._board.isInsufficientMaterial()) return true;
    // Fairy Stockfish conservatively treats custom pieces as mating material.
    // E attacks exactly like N: its extra orthogonal steps cannot capture.
    // A lone G (Dabbaba) cannot cover the adjacent escapes needed for mate.
    // F can mate: Kc2/Fc1 against Ka1 is a checkmate position.
    const material = this.board().flat().filter(piece => piece && piece.type !== 'k');
    return material.length === 1 && ['e', 'g'].includes(material[0].type);
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
    const headers = { ...this._headers, Variant: VARIANT, SetUp: '1', FEN: this._startFen };
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
    if (headers.Variant?.toLowerCase() !== VARIANT) throw new Error(`This game requires the ${VARIANT} PGN variant.`);
    if (headers.SetUp !== undefined && !['0', '1'].includes(headers.SetUp)) throw new Error('The PGN setup header is invalid.');
    if (headers.SetUp === '1' && !headers.FEN || headers.SetUp === '0' && headers.FEN) throw new Error('The PGN setup and starting position do not agree.');
    let candidate;
    try {
      candidate = new VariantGame(headers.FEN);
      for (const [key, value] of Object.entries(headers)) candidate.setHeader(key, value);
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
