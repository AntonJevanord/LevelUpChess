'use strict';

// Separate frozen protocol: legacy collection/study sources remain unchanged.
// Planning checks browser rules only and never starts a native engine search.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { Chess } = require('chess.js');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(ROOT, 'experiments/balance/reference-panel.json');
const EXPECTED = {
  schemaVersion: 1, id: 'reference-panel-v16-001', seed: 42,
  bookPositions: 128, conditionsPerPosition: 21, totalGames: 2688, jobs: 4,
  checkpoints: [672, 1344, 2688],
  designIds: ['bishop.purple@4', 'rook.purple@2', 'knight.purple@3', 'queen.purple@1'],
  evaluation: 'automatic', engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
  strength: { skill: 20 }, sampling: { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 },
  analysis: { anchors: { pawn: 1, queen: 9 }, ridge: 0.001, bootstrap: 200, validationFolds: 5, agreementMargin: 0.5 },
  selection: 'Alternate left/right knights and rooks; alternate original bishop color complexes; preserve one member per family/color throughout each block.',
  excludeSources: [
    { file: 'experiments/balance/results/material-collection-preflight-001.json', sha256: '8ba23279d021fdf2401d5d74b49b4b72e94a33d2b109403a78abed998e6891ee' },
    { file: 'experiments/balance/results/material-study-preflight-001.json', sha256: '375e0d5b8189f04350a42f50f3d89aeff02d77a1e2f07cf502a3c4da173e312e' },
  ],
};
const ROSTER = [
  { key: 'horizontal-bishop', label: 'Horizontal bishop', id: 'bishop.purple@4', family: 'bishop', movement: 'BsR2sN' },
  { key: 'knight-capture-rook', label: 'Knight-capture rook', id: 'rook.purple@2', family: 'rook', movement: 'RcN' },
  { key: 'camel-knight', label: 'Camel knight', id: 'knight.purple@3', family: 'knight', movement: 'NC' },
  { key: 'amazon', label: 'Amazon', id: 'queen.purple@1', family: 'queen', movement: 'QN' },
];
const TYPES = { bishop: 'b', rook: 'r', knight: 'n', queen: 'q' };
const HOMES = { bishop: 'c1', rook: 'a1', knight: 'b1', queen: 'd1' };
const COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1, P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const fail = message => { throw new Error(message); };
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function getReferenceProtocol() {
  const config = source(CONFIG_FILE), protocol = JSON.parse(config);
  if (!isDeepStrictEqual(protocol, EXPECTED)) fail('The frozen four-reference protocol changed. Use its matching revision or declare a new study.');
  const snapshots = protocol.excludeSources.map((entry, index) => {
    const text = source(path.join(ROOT, entry.file));
    if (sha(text) !== entry.sha256) fail('A frozen reference exclusion source changed.');
    const snapshot = JSON.parse(text);
    const hashes = index === 0 ? snapshot.selectedOpenings?.map(opening => {
      if (sha(opening.fen.split(' ').slice(0, 4).join(' ')) !== opening.positionSha256) fail('An excluded pilot FEN differs from its digest.');
      return opening.positionSha256;
    }) : snapshot.selectedOpeningHashes;
    if (snapshot.planId !== (index === 0 ? 'material-collection-v16-pilot-001' : 'material-collection-v16-confirmation-001')
      || !Array.isArray(hashes) || hashes.length !== (index === 0 ? 32 : 384)
      || hashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
      || new Set(hashes).size !== hashes.length) fail('Malformed frozen reference exclusion snapshot.');
    return { ...entry, planId: snapshot.planId, bookSha256: snapshot.book?.sha256, count: hashes.length, hashes };
  });
  const hashes = snapshots.flatMap(snapshot => snapshot.hashes);
  if (new Set(hashes).size !== 416) fail('Reference exclusion positions must be 416 distinct physical positions.');
  const registry = createDesignRegistry({ schemaVersion: 2, comparisons: ROSTER.map(entry => ({
    armyA: { upgrades: { [HOMES[entry.family]]: entry.id } }, armyB: { upgrades: {} },
  })) });
  for (const entry of ROSTER) {
    const definition = registry.definitions.find(definition => definition.id === entry.id);
    if (definition?.movement !== entry.movement || definition.family !== entry.family
      || definition.placement !== 'replace' || definition.level !== 3) fail('A frozen reference design changed.');
  }
  const profile = compileDesignProfile(registry);
  return freeze({ protocol, settings: { seed: protocol.seed, ...protocol.engine, ...protocol.strength,
    bookPositions: protocol.bookPositions, totalGames: protocol.totalGames },
  roster: ROSTER, registry, profile, configFiles: [CONFIG_FILE, ...protocol.excludeSources.map(entry => path.join(ROOT, entry.file))],
  configSha256: sha(config), exclusions: { count: hashes.length, sources: snapshots, hashes },
  study: { jobs: protocol.jobs, checkpoints: protocol.checkpoints, analysis: protocol.analysis } });
}

function piecesOf(fen) {
  const pieces = new Map();
  fen.split(' ')[0].split('/').forEach((rank, row) => {
    let file = 0;
    for (const piece of rank) {
      if (/[1-8]/.test(piece)) file += Number(piece);
      else { pieces.set('abcdefgh'[file] + (8 - row), piece); file++; }
    }
  });
  return pieces;
}
function placement(pieces) {
  return Array.from({ length: 8 }, (_, row) => {
    let text = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = pieces.get(file + (8 - row));
      if (!piece) { empty++; continue; }
      if (empty) text += empty;
      text += piece; empty = 0;
    }
    return text + (empty || '');
  }).join('/');
}
function parseBookFen(line) {
  const fields = line.split(';', 1)[0].trim().split(/\s+/);
  if (fields.length !== 6 || !['w', 'b'].includes(fields[1]) || !/^\d+$/.test(fields[4])
    || !/^[1-9]\d*$/.test(fields[5]) || !Number.isSafeInteger(Number(fields[4]))
    || !Number.isSafeInteger(Number(fields[5]))) return { reason: 'invalid-fen' };
  const ranks = fields[0].split('/'), counts = {};
  if (ranks.length !== 8 || fields[2] !== '-' && (!/^[KQkq]+$/.test(fields[2]) || new Set(fields[2]).size !== fields[2].length)
    || fields[3] !== '-' && !/^[a-h][36]$/.test(fields[3])) return { reason: 'invalid-fen' };
  for (const [row, rank] of ranks.entries()) {
    let squares = 0;
    for (const piece of rank) {
      if (/^[1-8]$/.test(piece)) squares += Number(piece);
      else if (/^[pnbrqk]$/i.test(piece)) {
        squares++; counts[piece] = (counts[piece] || 0) + 1;
        if ((row === 0 || row === 7) && /p/i.test(piece)) return { reason: 'invalid-pawn-rank' };
      } else return { reason: 'invalid-fen' };
    }
    if (squares !== 8) return { reason: 'invalid-fen' };
  }
  if (!isDeepStrictEqual(counts, COUNTS)) return { reason: 'material-not-full-standard' };
  fields[0] = ranks.map(rank => rank.replace(/[1-8]/g, digit => '.'.repeat(Number(digit)))
    .replace(/\.+/g, empty => String(empty.length))).join('/');
  fields[2] = [...'KQkq'].filter(flag => fields[2].includes(flag)).join('') || '-';
  return { fen: fields.join(' '), key: fields.slice(0, 4).join(' ') };
}
function shuffle(values, seed) {
  const result = [...values]; let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  };
  for (let index = result.length - 1; index > 0; index--) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}
function membersFor(fen, block) {
  const pieces = piecesOf(fen), members = { w: {}, b: {} }, odd = block % 2 === 1;
  for (const color of ['w', 'b']) for (const family of ['bishop', 'rook', 'knight', 'queen']) {
    const type = color === 'w' ? TYPES[family].toUpperCase() : TYPES[family];
    const squares = [...pieces].filter(([, piece]) => piece === type).map(([square]) => square);
    if (family === 'bishop') {
      const dark = odd ? color === 'w' : color === 'b';
      const chosen = squares.filter(square => ((square.charCodeAt(0) - 97 + Number(square[1]) - 1) % 2 === 0) === dark);
      if (chosen.length !== 1) fail('The book must retain one original bishop on each color complex.');
      members[color][family] = chosen[0];
    } else {
      const direction = odd ? 1 : -1;
      squares.sort((a, b) => direction * (a.charCodeAt(0) - b.charCodeAt(0))
        || (color === 'w' ? 1 : -1) * (Number(a[1]) - Number(b[1])));
      if (squares.length !== (family === 'queen' ? 1 : 2)) fail('The book must retain the full ordinary army.');
      members[color][family] = squares[0];
    }
  }
  return members;
}
function upgradedFen(fen, members, whiteDesign, blackDesign, library) {
  const pieces = piecesOf(fen), fields = fen.split(' ');
  for (const [color, id] of [['w', whiteDesign], ['b', blackDesign]]) {
    if (!id) continue;
    const entry = library.roster.find(entry => entry.id === id);
    const letter = library.registry.allocations.find(allocation => allocation.id === id).letter;
    pieces.set(members[color][entry.family], color === 'w' ? letter.toUpperCase() : letter);
  }
  fields[0] = placement(pieces); return fields.join(' ');
}
function blockFor(opening, library) {
  const schedule = [], units = [];
  const add = (key, kind, aColor, designA, designB, unitId) => {
    const whiteDesign = aColor === 'w' ? designA : designB;
    const blackDesign = aColor === 'w' ? designB : designA;
    const id = `${opening.id}-${key}`;
    schedule.push({ id, unitId, pairId: unitId, kind, aColor, openingId: opening.id,
      groupId: opening.id, comparisonId: kind === 'ordinary' ? 'ordinary-control' : key.replace(/-[wb]$/, ''),
      startFen: upgradedFen(opening.fen, opening.members, whiteDesign, blackDesign, library),
      openingMoves: [], designA, designB, whiteDesign, blackDesign });
    return id;
  };
  const ordinary = `${opening.id}-ordinary`;
  units.push({ id: ordinary, kind: 'ordinary', gameIds: [add('ordinary', 'ordinary', 'w', null, null, ordinary)] });
  for (const entry of library.roster) {
    const key = `${entry.key}-v-ordinary`, unitId = `${opening.id}-${key}`;
    units.push({ id: unitId, kind: 'single', gameIds: ['w', 'b'].map(color => add(`${key}-${color}`, 'single', color, entry.id, null, unitId)) });
  }
  for (let a = 0; a < library.roster.length; a++) for (let b = a + 1; b < library.roster.length; b++) {
    const first = library.roster[a], second = library.roster[b];
    const key = `${first.key}-v-${second.key}`, unitId = `${opening.id}-${key}`;
    units.push({ id: unitId, kind: 'head', gameIds: ['w', 'b'].map(color => add(`${key}-${color}`, 'head', color, first.id, second.id, unitId)) });
  }
  return { schedule, units };
}
function quietRejection(fen, members, library) {
  let board;
  try { board = new Chess(fen); } catch { return 'invalid-or-terminal-position'; }
  const pieces = piecesOf(fen);
  const kings = Object.fromEntries(['w', 'b'].map(color => [color, [...pieces].find(([, piece]) => piece === (color === 'w' ? 'K' : 'k'))[0]]));
  if (board.isAttacked(kings.w, 'b') || board.isAttacked(kings.b, 'w')) return 'initial-check';
  for (const entry of library.roster) for (const color of ['w', 'b']) {
    const from = members[color][entry.family], to = kings[color === 'w' ? 'b' : 'w'];
    const dx = Math.abs(from.charCodeAt(0) - to.charCodeAt(0)), dy = Math.abs(Number(from[1]) - Number(to[1]));
    const knight = Math.min(dx, dy) === 1 && Math.max(dx, dy) === 2;
    const camel = Math.min(dx, dy) === 1 && Math.max(dx, dy) === 3;
    let check = entry.family === 'knight' ? camel : entry.family === 'bishop' ? dx === 2 && dy === 1 : knight;
    if (entry.family === 'bishop' && dy === 0 && dx > 0 && dx <= 2) {
      const step = Math.sign(to.charCodeAt(0) - from.charCodeAt(0));
      check = dx === 1 || !pieces.has(String.fromCharCode(from.charCodeAt(0) + step) + from[1]);
    }
    if (check) return 'upgrade-creates-check';
  }
  return null;
}

async function createReferencePlan(bookBytes, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['bookName', 'rulesFactory'].includes(key))) fail('Unsupported reference planning options.');
  if (!(typeof bookBytes === 'string' || bookBytes instanceof Uint8Array)) fail('An opening book must be UTF-8 bytes or text.');
  const bytes = Buffer.from(bookBytes);
  if (!bytes.length || bytes.length > 32 * 1024 * 1024) fail('The opening book must contain 1 byte to 32 MiB.');
  const bookName = options.bookName === undefined ? 'book.epd' : options.bookName;
  if (typeof bookName !== 'string' || !bookName.trim() || bookName.length > 512 || /[\u0000-\u001f\u007f]/.test(bookName)) fail('The opening book needs a valid name.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('The opening book must be valid UTF-8.'); }
  const library = getReferenceProtocol(), excluded = new Set(library.exclusions.hashes);
  const seen = new Set(), candidates = [], rejections = [];
  let nonemptyLines = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    nonemptyLines++;
    const parsed = line.length > 4096 ? { reason: 'line-too-long' } : parseBookFen(line);
    if (parsed.reason) { rejections.push({ line: index + 1, reason: parsed.reason }); return; }
    if (seen.has(parsed.key)) { rejections.push({ line: index + 1, reason: 'duplicate-physical-position' }); return; }
    seen.add(parsed.key);
    if (excluded.has(sha(parsed.key))) { rejections.push({ line: index + 1, reason: 'excluded-completed-position' }); return; }
    candidates.push({ line: index + 1, fen: parsed.fen });
  });
  const rules = await (options.rulesFactory || require('../../dist/balance-rules.cjs').createMatchRules)({ profile: library.profile });
  const openings = [], schedule = [], units = [];
  let examined = 0;
  for (const candidate of shuffle(candidates, library.settings.seed)) {
    examined++;
    let members;
    try { members = membersFor(candidate.fen, openings.length + 1); }
    catch (error) { rejections.push({ line: candidate.line, reason: 'invalid-family-members', detail: error.message }); continue; }
    const rejection = quietRejection(candidate.fen, members, library);
    if (rejection) { rejections.push({ line: candidate.line, reason: rejection }); continue; }
    const opening = { id: `reference-${String(openings.length + 1).padStart(3, '0')}`, ...candidate,
      positionSha256: sha(candidate.fen.split(' ').slice(0, 4).join(' ')), members };
    const block = blockFor(opening, library);
    let invalid = false;
    for (const game of block.schedule) {
      let board;
      try { board = rules.createBoard(game.startFen); if (board.outcome() !== null) fail('The starting position is terminal.'); }
      catch (error) { rejections.push({ line: candidate.line, reason: 'invalid-or-terminal-condition', condition: game.id, detail: error.message }); invalid = true; }
      finally { board?.dispose(); }
      if (invalid) break;
    }
    if (invalid) continue;
    openings.push(opening); schedule.push(...block.schedule); units.push(...block.units);
    if (openings.length === library.settings.bookPositions) break;
  }
  const reasonCounts = {};
  for (const rejection of rejections) reasonCounts[rejection.reason] = (reasonCounts[rejection.reason] || 0) + 1;
  const book = { name: path.basename(bookName.replace(/\\/g, '/')), bytes: bytes.length, sha256: sha(bytes), nonemptyLines,
    uniqueFullMaterialCandidates: candidates.length + (reasonCounts['excluded-completed-position'] || 0),
    eligibleAfterExclusions: candidates.length, excludedPositionsFound: reasonCounts['excluded-completed-position'] || 0,
    candidatesExamined: examined, selectedPositions: openings.length, unexaminedCandidates: candidates.length - examined,
    reasonCounts, rejections, selection: 'Seeded shuffle after excluding 416 frozen physical positions; accept quiet legal nonterminal full-army starts in all 21 matched conditions; alternate selected family members by accepted block parity.' };
  if (openings.length !== library.settings.bookPositions) {
    const error = new Error(`Opening book supplies only ${openings.length} usable positions; this reference study requires 128 distinct positions legal in all 21 conditions.`);
    error.book = book; throw error;
  }
  return freeze({ schemaVersion: 1, id: library.protocol.id, protocol: library.protocol,
    settings: library.settings, roster: library.roster, registry: library.registry, profile: library.profile,
    configFiles: library.configFiles, configSha256: library.configSha256, exclusions: library.exclusions,
    study: library.study, book, openings, schedule, units, totalGames: schedule.length,
    grouping: { unit: 'selected opening position', unknownOpeningFamilies: true,
      interpretation: 'All 21 conditions share a group; different selected FENs may share broader opening ancestry.' } });
}

function validateReferencePlan(plan) {
  const library = getReferenceProtocol();
  if (!plan || plan.schemaVersion !== 1 || plan.id !== library.protocol.id || plan.totalGames !== 2688) fail('An intact frozen 2,688-game reference plan is required.');
  for (const field of ['protocol', 'settings', 'roster', 'registry', 'profile', 'configSha256', 'study', 'exclusions']) {
    if (!isDeepStrictEqual(plan[field], library[field])) fail(`The frozen reference ${field} differs.`);
  }
  if (!Array.isArray(plan.openings) || plan.openings.length !== 128 || !Array.isArray(plan.schedule)
    || plan.schedule.length !== 2688 || !Array.isArray(plan.units) || plan.units.length !== 1408) fail('Reference plans require 128 complete 21-game blocks.');
  const hashes = new Set(), excluded = new Set(library.exclusions.hashes), schedule = [], units = [];
  for (const [index, opening] of plan.openings.entries()) {
    const parsed = opening && typeof opening.fen === 'string' ? parseBookFen(opening.fen) : null;
    if (!parsed || parsed.reason || parsed.fen !== opening.fen || opening.id !== `reference-${String(index + 1).padStart(3, '0')}`
      || sha(parsed.key) !== opening.positionSha256 || excluded.has(opening.positionSha256)
      || hashes.has(opening.positionSha256)) fail('Malformed, duplicate or excluded reference opening.');
    hashes.add(opening.positionSha256);
    const members = membersFor(opening.fen, index + 1);
    if (!isDeepStrictEqual(opening.members, members) || quietRejection(opening.fen, members, library)) fail('Reference member selection or quiet-start policy differs.');
    const block = blockFor(opening, library); schedule.push(...block.schedule); units.push(...block.units);
  }
  if (!isDeepStrictEqual(plan.schedule, schedule) || !isDeepStrictEqual(plan.units, units)) fail('The complete reference schedule, substitutions or units differ.');
  if (!plan.book || typeof plan.book.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(plan.book.sha256)
    || plan.book.selectedPositions !== 128 || plan.book.bytes < 1) fail('Reference book identity is missing.');
  return plan;
}

module.exports = { CONFIG_FILE, getReferenceProtocol, createReferencePlan, validateReferencePlan };
