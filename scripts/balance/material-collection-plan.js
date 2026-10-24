'use strict';

// A fixed, capped collection plan. Book import and browser-rules checks do not
// start a native engine, search a move or infer any material value.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { Chess } = require('chess.js');

const CONFIG_FILE = path.resolve(__dirname, '../../experiments/balance/material-collection.json');
const EXPECTED = {
  schemaVersion: 1, id: 'material-collection-v16-pilot-001', seed: 42,
  bookPositions: 32, totalGames: 96, designId: 'queen.purple@1', evaluation: 'automatic',
  engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
  strength: { skill: 20 }, sampling: { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 },
};
const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1,
  P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
const sha256 = value => createHash('sha256').update(value).digest('hex');

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function getCollectionProtocol() {
  const source = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/\r\n/g, '\n');
  const protocol = JSON.parse(source);
  if (!isDeepStrictEqual(protocol, EXPECTED)) throw new Error('The fixed 96-game material collection protocol changed. Use its matching revision or declare a new study.');
  const registry = createDesignRegistry({ schemaVersion: 2, comparisons: [{
    armyA: { upgrades: { d1: protocol.designId } }, armyB: { upgrades: {} },
  }] });
  if (registry.definitions.length !== 1 || registry.definitions[0].movement !== 'QN'
    || registry.definitions[0].family !== 'queen') throw new Error('The material collection requires the unchanged queen.purple@1 Amazon.');
  const profile = compileDesignProfile(registry);
  return freeze({ protocol, registry, profile, configFiles: [CONFIG_FILE], configSha256: sha256(source),
    settings: { seed: protocol.seed, ...protocol.engine, ...protocol.strength,
      bookPositions: protocol.bookPositions, totalGames: protocol.totalGames } });
}

function parseBookFen(line) {
  const source = line.split(';', 1)[0].trim();
  const fields = source.split(/\s+/);
  if (fields.length !== 6 || !['w', 'b'].includes(fields[1]) || !/^\d+$/.test(fields[4])
    || !/^[1-9]\d*$/.test(fields[5]) || !Number.isSafeInteger(Number(fields[4]))
    || !Number.isSafeInteger(Number(fields[5]))) return { reason: 'invalid-fen' };
  const ranks = fields[0].split('/'), counts = {};
  if (ranks.length !== 8 || (fields[2] !== '-' && (!/^[KQkq]+$/.test(fields[2])
    || new Set(fields[2]).size !== fields[2].length))
    || (fields[3] !== '-' && !/^[a-h][36]$/.test(fields[3]))) return { reason: 'invalid-fen' };
  for (let index = 0; index < ranks.length; index++) {
    let squares = 0;
    for (const piece of ranks[index]) {
      if (/^[1-8]$/.test(piece)) squares += Number(piece);
      else if (/^[pnbrqk]$/i.test(piece)) {
        squares++; counts[piece] = (counts[piece] || 0) + 1;
        if ((index === 0 || index === 7) && /p/i.test(piece)) return { reason: 'invalid-pawn-rank' };
      } else return { reason: 'invalid-fen' };
    }
    if (squares !== 8) return { reason: 'invalid-fen' };
  }
  if (!isDeepStrictEqual(counts, START_COUNTS)) return { reason: 'material-not-full-standard' };
  // Normalize an equivalent ordering of castling flags for physical deduplication.
  fields[2] = [...'KQkq'].filter(right => fields[2].includes(right)).join('') || '-';
  return { fen: fields.join(' '), key: fields.slice(0, 4).join(' ') };
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  };
}

function shuffled(values, seed) {
  const output = [...values], random = randomSource(seed);
  for (let index = output.length - 1; index > 0; index--) {
    const selected = Math.floor(random() * (index + 1));
    [output[index], output[selected]] = [output[selected], output[index]];
  }
  return output;
}

function replaceQueen(fen, color, letter) {
  const fields = fen.split(' ');
  fields[0] = fields[0].replace(color === 'w' ? 'Q' : 'q', color === 'w' ? letter.toUpperCase() : letter);
  return fields.join(' ');
}

function quietStartRejection(fen) {
  let ordinary;
  try { ordinary = new Chess(fen); }
  catch { return 'invalid-or-terminal-position'; }
  const pieces = ordinary.board().flat().filter(Boolean);
  const square = (color, type) => pieces.find(piece => piece.color === color && piece.type === type).square;
  if (ordinary.isAttacked(square('w', 'k'), 'b') || ordinary.isAttacked(square('b', 'k'), 'w')) return 'initial-check';
  for (const [color, opponent] of [['w', 'b'], ['b', 'w']]) {
    const queen = square(color, 'q'), king = square(opponent, 'k');
    const dx = Math.abs(queen.charCodeAt(0) - king.charCodeAt(0)), dy = Math.abs(Number(queen[1]) - Number(king[1]));
    if (Math.min(dx, dy) === 1 && Math.max(dx, dy) === 2) return 'upgrade-creates-check';
  }
  return null;
}

async function createCollectionPlan(bookBytes, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['bookName', 'rulesFactory'].includes(key))) throw new Error('Unsupported material collection planning options.');
  if (!(typeof bookBytes === 'string' || bookBytes instanceof Uint8Array)) throw new Error('An opening book must be UTF-8 bytes or text.');
  const bytes = Buffer.from(bookBytes);
  if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new Error('The opening book must contain 1 byte to 32 MiB.');
  const bookName = options.bookName === undefined ? 'book.epd' : options.bookName;
  if (typeof bookName !== 'string' || !bookName.trim() || bookName.length > 512 || /[\u0000-\u001f\u007f]/.test(bookName)) throw new Error('The opening book needs a valid name.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('The opening book must be valid UTF-8.'); }
  const library = getCollectionProtocol(), candidates = [], seen = new Set(), rejections = [];
  const lines = text.split(/\r?\n/);
  let nonemptyLines = 0;
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    nonemptyLines++;
    const parsed = line.length > 4096 ? { reason: 'line-too-long' } : parseBookFen(line);
    if (parsed.reason) { rejections.push({ line: index + 1, reason: parsed.reason }); return; }
    if (seen.has(parsed.key)) { rejections.push({ line: index + 1, reason: 'duplicate-physical-position' }); return; }
    seen.add(parsed.key); candidates.push({ line: index + 1, fen: parsed.fen });
  });
  const rules = await (options.rulesFactory || require('../../dist/balance-rules.cjs').createMatchRules)({ profile: library.profile });
  const amazon = library.registry.allocations.find(item => item.id === library.protocol.designId).letter;
  const openings = [], schedule = [], units = [];
  let examined = 0;
  for (const candidate of shuffled(candidates, library.settings.seed)) {
    examined++;
    const quietRejection = quietStartRejection(candidate.fen);
    if (quietRejection) { rejections.push({ line: candidate.line, reason: quietRejection }); continue; }
    const starts = [candidate.fen, replaceQueen(candidate.fen, 'w', amazon), replaceQueen(candidate.fen, 'b', amazon)];
    let invalid = false;
    for (let condition = 0; condition < starts.length; condition++) {
      let board;
      try {
        board = rules.createBoard(starts[condition]);
        if (board.outcome() !== null) throw new Error('The starting position is already terminal.');
      } catch (error) {
        rejections.push({ line: candidate.line, reason: 'invalid-or-terminal-position',
          condition: ['ordinary', 'amazon-white', 'amazon-black'][condition], detail: error.message });
        invalid = true;
      } finally { board?.dispose(); }
      if (invalid) break;
    }
    if (invalid) continue;
    const id = `book-${String(openings.length + 1).padStart(3, '0')}`;
    openings.push({ id, line: candidate.line, fen: candidate.fen,
      positionSha256: sha256(candidate.fen.split(' ').slice(0, 4).join(' ')) });
    const ordinaryUnit = `${id}-ordinary`, amazonUnit = `${id}-amazon`;
    const add = (suffix, kind, aColor, unitId, startFen, difference) => {
      const gameId = `${id}-${suffix}`;
      schedule.push({ id: gameId, unitId, pairId: unitId, kind, aColor,
        openingId: id, groupId: id, startFen, comparisonId: kind === 'ordinary' ? 'ordinary-control' : 'amazon-v-queen',
        openingMoves: [], initialUpgradeDifference: difference });
      return gameId;
    };
    units.push({ id: ordinaryUnit, kind: 'ordinary', gameIds: [add('ordinary', 'ordinary', 'w', ordinaryUnit, starts[0], 0)] });
    units.push({ id: amazonUnit, kind: 'amazon', gameIds: [
      add('amazon-w', 'amazon', 'w', amazonUnit, starts[1], 1),
      add('amazon-b', 'amazon', 'b', amazonUnit, starts[2], -1),
    ] });
    if (openings.length === library.settings.bookPositions) break;
  }
  const reasonCounts = {};
  for (const rejection of rejections) reasonCounts[rejection.reason] = (reasonCounts[rejection.reason] || 0) + 1;
  const book = { name: path.basename(bookName.replace(/\\/g, '/')), bytes: bytes.length, sha256: sha256(bytes),
    nonemptyLines, uniqueFullMaterialCandidates: candidates.length, candidatesExamined: examined,
    selectedPositions: openings.length, unexaminedCandidates: candidates.length - examined,
    reasonCounts, rejections, selection: 'Seeded shuffle of unique full-material candidates; accept only quiet positions legal and nonterminal under all three conditions, without either upgrade creating check.' };
  if (openings.length !== library.settings.bookPositions) {
    const error = new Error(`Opening book supplies only ${openings.length} usable positions; this pilot requires ${library.settings.bookPositions} distinct positions legal in all three conditions.`);
    error.book = book;
    throw error;
  }
  return freeze({ schemaVersion: 1, id: library.protocol.id, protocol: library.protocol,
    settings: library.settings, registry: library.registry, profile: library.profile,
    configFiles: library.configFiles, configSha256: library.configSha256, book,
    openings, schedule, units, totalGames: schedule.length,
    grouping: { unit: 'selected opening position', unknownOpeningFamilies: true,
      interpretation: 'The ordinary game and both upgraded games share a group. Different book positions may still share opening ancestry.' } });
}

module.exports = { CONFIG_FILE, getCollectionProtocol, createCollectionPlan };
