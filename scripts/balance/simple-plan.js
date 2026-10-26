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
const CONFIG_FILE = path.join(ROOT, 'experiments/balance/simple-references.json');
const EXPECTED = {
  schemaVersion: 1, id: 'simple-references-v16-001', seed: 42,
  bookPositions: 128, conditionsPerPosition: 24, totalGames: 3072, jobs: 4,
  checkpoints: [768, 1536, 3072],
  designIds: ['bishop.purple@4', 'rook.purple@2', 'bishop.purple@10', 'rook.purple@9', 'rook.purple@10', 'rook.purple@11', 'knight.purple@3', 'queen.purple@1'],
  referenceIds: ['knight.purple@3', 'queen.purple@1'],
  evaluation: { pieceValues: { 'rook.purple@9': { mg: 2538, eg: 2682 } } }, engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
  strength: { skill: 20 }, sampling: { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 },
  analysis: { anchors: { pawn: 1, queen: 9 }, ridge: 0.001, bootstrap: 200, validationFolds: 5, agreementMargin: 0.5 },
  selection: 'Reuse the exact 128 original positions, selected family members and opening IDs; append only the four simple candidates against ordinary armies and the two unchanged references.',
  parent: {
    "manifestFile": "experiments/balance/results/reference-panel-001.collection.json",
    "manifestSha256": "534dd8c8688899b555757978fcf8a36fabd700416e6dd78b18e6e858d6871417",
    "journalFile": "experiments/balance/results/reference-panel-001.games.jsonl",
    "journalSha256": "3aaa7ea9dd70cb555e368849897d6c1dc67d6240b0091c5da5092fcb9b64ba49"
  },
};
const ROSTER = [
  { key: 'horizontal-bishop', label: 'Horizontal bishop (original)', id: 'bishop.purple@4', family: 'bishop', movement: 'BsR2sN', role: 'historical' },
  { key: 'knight-capture-rook', label: 'Knight-capture rook (original)', id: 'rook.purple@2', family: 'rook', movement: 'RcN', role: 'historical' },
  { key: 'rank-bishop', label: 'Rank bishop', id: 'bishop.purple@10', family: 'bishop', movement: 'BsR', role: 'candidate' },
  { key: 'queen-rook', label: 'Queen-moving rook', id: 'rook.purple@9', family: 'rook', movement: 'RB', role: 'candidate' },
  { key: 'forward-bishop-rook', label: 'Forward-bishop rook', id: 'rook.purple@10', family: 'rook', movement: 'RfB', role: 'candidate' },
  { key: 'short-bishop-rook', label: 'Short-bishop rook', id: 'rook.purple@11', family: 'rook', movement: 'RB2', role: 'candidate' },
  { key: 'camel-knight', label: 'Camel knight', id: 'knight.purple@3', family: 'knight', movement: 'NC', role: 'reference' },
  { key: 'amazon', label: 'Amazon', id: 'queen.purple@1', family: 'queen', movement: 'QN', role: 'reference' },
];
const HOMES = { bishop: 'c1', rook: 'a1', knight: 'b1', queen: 'd1' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const fail = message => { throw new Error(message); };
let cachedLibrary;
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function getSimpleProtocol() {
  const config = source(CONFIG_FILE), protocol = JSON.parse(config);
  if (!isDeepStrictEqual(protocol, EXPECTED)) fail('The frozen linked simple protocol changed. Use its matching checkout or declare a new study.');
  const manifestBytes = fs.readFileSync(path.join(ROOT, protocol.parent.manifestFile));
  const journalBytes = fs.readFileSync(path.join(ROOT, protocol.parent.journalFile));
  if (sha(manifestBytes) !== protocol.parent.manifestSha256 || sha(journalBytes) !== protocol.parent.journalSha256) {
    fail('A frozen parent manifest or journal changed. Preserve the completed source evidence unchanged.');
  }
  // Recheck raw source hashes on every access, but parse and freeze the pinned
  // multi-megabyte evidence only once per process. The returned graph is immutable.
  if (cachedLibrary) return cachedLibrary;
  const parentManifest = JSON.parse(manifestBytes), journal = journalBytes.toString('utf8');
  if (!journal.endsWith('\n')) fail('The frozen parent journal has an incomplete tail.');
  const parentRecords = journal.trim().split('\n').map(JSON.parse), old = parentManifest.plan;
  if (parentManifest.schemaVersion !== 1 || parentManifest.format !== 'levelup-reference-collection'
    || parentManifest.runId !== 'fdbc7887-daf3-4ce6-b33b-98e95bcfe7a9' || parentManifest.jobs !== 4
    || old?.id !== 'reference-panel-v16-001' || old.openings?.length !== 128 || old.schedule?.length !== 2688
    || parentRecords.length !== 2688 || new Set(parentRecords.map(record => record.id)).size !== 2688
    || parentRecords.filter(record => record.status === 'completed').length !== 2687
    || parentRecords.filter(record => record.status === 'truncated').length !== 1) fail('The completed parent study is malformed.');
  if (!isDeepStrictEqual(compileDesignProfile(old.registry), old.profile)) fail('The frozen original definitions no longer match their canonical profile.');
  const parent = { ...protocol.parent, runId: parentManifest.runId, profileHash: old.profile.hash,
    registryHash: old.registry.hash, engineSha256: parentManifest.engineSha256,
    scheduledGames: 2688, completedGames: 2687, truncatedGames: 1 };
  const registry = createDesignRegistry({ schemaVersion: 2, comparisons: ROSTER.map(entry => ({
    armyA: { upgrades: { [HOMES[entry.family]]: entry.id } }, armyB: { upgrades: {} },
  })) });
  for (const entry of ROSTER) {
    const definition = registry.definitions.find(definition => definition.id === entry.id);
    if (definition?.movement !== entry.movement || definition.family !== entry.family
      || definition.placement !== 'replace' || definition.level !== 3) fail('A frozen simple design changed.');
  }
  for (const allocation of old.registry.allocations) {
    if (!isDeepStrictEqual(allocation, registry.allocations.find(item => item.id === allocation.id))) fail('The linked registry changed a historical letter or slot.');
  }
  const profile = compileDesignProfile(registry, protocol.evaluation);
  return cachedLibrary = freeze({ protocol, settings: { seed: protocol.seed, ...protocol.engine, ...protocol.strength,
    bookPositions: protocol.bookPositions, totalGames: protocol.totalGames },
    roster: ROSTER, activeRoster: ROSTER.filter(entry => entry.role !== 'historical'), registry, profile,
    configFiles: [CONFIG_FILE, path.join(ROOT, parent.manifestFile), path.join(ROOT, parent.journalFile)],
    configSha256: sha(config), parent, parentManifest, parentRecords,
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
  const schedule = [], units = [], prefix = opening.id.replace(/^reference-/, 'simple-');
  const add = (key, kind, aColor, designA, designB, unitId) => {
    const whiteDesign = aColor === 'w' ? designA : designB;
    const blackDesign = aColor === 'w' ? designB : designA;
    const id = `${prefix}-${key}`;
    schedule.push({ id, unitId, pairId: unitId, kind, aColor, openingId: opening.id,
      groupId: opening.id, comparisonId: kind === 'ordinary' ? 'ordinary-control' : key.replace(/-[wb]$/, ''),
      startFen: upgradedFen(opening.fen, opening.members, whiteDesign, blackDesign, library),
      openingMoves: [], designA, designB, whiteDesign, blackDesign });
    return id;
  };
  for (const entry of library.roster.filter(entry => entry.role === 'candidate')) {
    const key = `${entry.key}-v-ordinary`, unitId = `${prefix}-${key}`;
    units.push({ id: unitId, kind: 'single', gameIds: ['w', 'b'].map(color => add(`${key}-${color}`, 'single', color, entry.id, null, unitId)) });
  }
  const candidates = library.roster.filter(entry => entry.role === 'candidate');
  const references = library.roster.filter(entry => entry.role === 'reference');
  const pairs = candidates.flatMap(candidate => references.map(reference => [candidate, reference]));
  for (const [first, second] of pairs) {
    const key = `${first.key}-v-${second.key}`, unitId = `${prefix}-${key}`;
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
  const clear = (from, to) => {
    const dx = Math.sign(to.charCodeAt(0) - from.charCodeAt(0)), dy = Math.sign(Number(to[1]) - Number(from[1]));
    let file = from.charCodeAt(0) + dx, rank = Number(from[1]) + dy;
    while (file !== to.charCodeAt(0) || rank !== Number(to[1])) {
      if (pieces.has(String.fromCharCode(file) + rank)) return false;
      file += dx; rank += dy;
    }
    return true;
  };
  for (const entry of library.activeRoster || library.roster.filter(entry => entry.role !== 'historical')) for (const color of ['w', 'b']) {
    const from = members[color][entry.family], to = kings[color === 'w' ? 'b' : 'w'];
    const dx = Math.abs(from.charCodeAt(0) - to.charCodeAt(0)), dy = Math.abs(Number(from[1]) - Number(to[1]));
    const knight = Math.min(dx, dy) === 1 && Math.max(dx, dy) === 2;
    const camel = Math.min(dx, dy) === 1 && Math.max(dx, dy) === 3;
    const forward = (Number(to[1]) - Number(from[1])) * (color === 'w' ? 1 : -1) > 0;
    let attack = entry.family === 'knight' ? camel : entry.family === 'queen' ? knight : false;
    if (entry.id === 'bishop.purple@10') attack = dy === 0 && dx > 0 && clear(from, to);
    if (entry.family === 'rook') {
      const diagonal = dx > 0 && dx === dy;
      attack = diagonal && (entry.id !== 'rook.purple@10' || forward)
        && (entry.id !== 'rook.purple@11' || dx <= 2) && clear(from, to);
    }
    if (attack) return 'upgrade-creates-check';
  }
  return null;
}

async function createSimplePlan(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['rulesFactory'].includes(key))) fail('Unsupported linked simple planning options.');
  const library = getSimpleProtocol();
  const rules = await (options.rulesFactory || require('../../dist/balance-rules.cjs').createMatchRules)({ profile: library.profile });
  const openings = JSON.parse(JSON.stringify(library.parentManifest.plan.openings));
  const schedule = [], units = [];
  for (const opening of openings) {
    if (quietRejection(opening.fen, opening.members, library)) fail(`New moves introduce check in inherited position ${opening.id}; the linked plan cannot silently drop or replace it.`);
    const block = blockFor(opening, library);
    for (const game of block.schedule) {
      let board;
      try { board = rules.createBoard(game.startFen); if (board.outcome() !== null) fail('The starting position is terminal.'); }
      catch (error) { fail(`Invalid inherited simple condition ${game.id}: ${error.message}`); }
      finally { board?.dispose(); }
    }
    schedule.push(...block.schedule); units.push(...block.units);
  }
  return freeze({ schemaVersion: 1, id: library.protocol.id, protocol: library.protocol,
    settings: library.settings, roster: library.roster, activeRoster: library.activeRoster,
    registry: library.registry, profile: library.profile,
    configFiles: library.configFiles, configSha256: library.configSha256, parent: library.parent,
    study: library.study, book: JSON.parse(JSON.stringify(library.parentManifest.plan.book)),
    openings, schedule, units, totalGames: schedule.length,
    linkedTotalGames: library.parent.scheduledGames + schedule.length,
    grouping: { unit: 'inherited opening position', unknownOpeningFamilies: true,
      interpretation: 'Original 21 conditions and new 24 conditions share the same position group; historical source contexts remain recorded separately.' } });
}

function validateSimplePlan(plan) {
  const library = getSimpleProtocol();
  if (!plan || plan.schemaVersion !== 1 || plan.id !== library.protocol.id || plan.totalGames !== 3072
    || plan.linkedTotalGames !== 5760) fail('An intact frozen 3,072-game linked simple plan is required.');
  for (const field of ['protocol', 'settings', 'roster', 'activeRoster', 'registry', 'profile', 'configSha256', 'study', 'parent']) {
    if (!isDeepStrictEqual(plan[field], library[field])) fail(`The frozen simple ${field} differs.`);
  }
  if (!isDeepStrictEqual(plan.openings, library.parentManifest.plan.openings)
    || !isDeepStrictEqual(plan.book, library.parentManifest.plan.book)
    || !Array.isArray(plan.schedule) || plan.schedule.length !== 3072
    || !Array.isArray(plan.units) || plan.units.length !== 1536) fail('Simple plans require the exact 128 inherited positions and 24 new games per position.');
  const schedule = [], units = [];
  for (const opening of plan.openings) {
    if (quietRejection(opening.fen, opening.members, library)) fail('A new candidate checks an inherited king at the start.');
    const block = blockFor(opening, library); schedule.push(...block.schedule); units.push(...block.units);
  }
  if (!isDeepStrictEqual(plan.schedule, schedule) || !isDeepStrictEqual(plan.units, units)) fail('The linked simple schedule, substitutions or units differ.');
  return plan;
}

module.exports = { CONFIG_FILE, getSimpleProtocol, createSimplePlan, validateSimplePlan };
