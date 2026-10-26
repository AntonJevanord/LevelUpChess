'use strict';

// A focused extension. Closed collectors and their declared schedules stay intact.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { Chess } = require('chess.js');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { getSimpleProtocol } = require('./simple-plan');
const { getBishopSource } = require('./bishop-source');
const ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(ROOT, 'experiments/balance/bishop-references.json');
const EXPECTED = {
  "schemaVersion": 1,
  "id": "bishop-references-v16-001",
  "seed": 42,
  "bookPositions": 128,
  "conditionsPerPosition": 10,
  "totalGames": 1280,
  "jobs": 4,
  "checkpoints": [
    320,
    640,
    1280
  ],
  "designIds": [
    "bishop.purple@4",
    "rook.purple@2",
    "bishop.purple@10",
    "rook.purple@9",
    "rook.purple@10",
    "rook.purple@11",
    "knight.purple@3",
    "queen.purple@1",
    "bishop.purple@7",
    "bishop.purple@9",
    "bishop.purple@11",
    "bishop.purple@12"
  ],
  "evaluation": {
    "pieceValues": {
      "rook.purple@9": {
        "mg": 2538,
        "eg": 2682
      }
    }
  },
  "engine": {
    "nodes": 20000,
    "threads": 1,
    "hashMb": 32,
    "maxPlies": 400
  },
  "strength": {
    "skill": 20
  },
  "sampling": {
    "minPly": 16,
    "stride": 5,
    "stableBefore": 2,
    "stableAfter": 2
  },
  "analysis": {
    "anchors": {
      "pawn": 1,
      "queen": 9
    },
    "ridge": 0.001,
    "bootstrap": 200,
    "validationFolds": 5,
    "agreementMargin": 0.5
  },
  "selection": "Reuse the exact 128 original positions and all 5760 original/simple records; append only five bishop candidates against the forward-bishop rook in both colors.",
  "referenceIds": [
    "rook.purple@10"
  ],
  "parent": {
    "manifestFile": "experiments/balance/results/reference-panel-001.collection.json",
    "manifestSha256": "534dd8c8688899b555757978fcf8a36fabd700416e6dd78b18e6e858d6871417",
    "journalFile": "experiments/balance/results/reference-panel-001.games.jsonl",
    "journalSha256": "3aaa7ea9dd70cb555e368849897d6c1dc67d6240b0091c5da5092fcb9b64ba49"
  },
  "simpleSource": {
    "manifestFile": "experiments/balance/results/simple-reference-001.replay-source.json",
    "manifestSha256": "c7313eb0330d637ea5105d2e44ad8dc93e11e26895ee59e828946dfcec0edd82",
    "journalFile": "experiments/balance/results/simple-reference-001.games.jsonl",
    "journalSha256": "8de913ef53c3023f525c80da572e6ad153d83d2651a96d3ccbbad10f5eea2b84",
    "originalManifestSupplied": false
  }
};
const NEW_BISHOPS = [
  { key: 'short-side-bishop', label: 'Bishop: short side', id: 'bishop.purple@7', family: 'bishop', movement: 'BsWsN', role: 'candidate' },
  { key: 'forward-jump-bishop', label: 'Bishop: forward jump', id: 'bishop.purple@9', family: 'bishop', movement: 'BsR2fsN', role: 'candidate' },
  { key: 'hurdle-rank-bishop', label: 'Rank bishop: short quiet hop', id: 'bishop.purple@11', family: 'bishop', movement: 'BsRgmsR', role: 'candidate' },
  { key: 'through-rank-bishop', label: 'Rank bishop: long quiet hop', id: 'bishop.purple@12', family: 'bishop', movement: 'BsRgmsR0', role: 'candidate' },
];
const HOMES = { bishop: 'c1', rook: 'a1', knight: 'b1', queen: 'd1' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
let cached;
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function getBishopProtocol() {
  const config = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/\r\n/g, '\n'), protocol = JSON.parse(config);
  if (!isDeepStrictEqual(protocol, EXPECTED)) fail('The frozen bishop protocol changed. Declare a new experiment instead.');
  const source = getBishopSource(), original = getSimpleProtocol();
  if (cached) return cached;
  const roster = [...source.sourceManifest.plan.roster.map(entry => ({ ...entry,
    role: entry.id === 'bishop.purple@4' ? 'candidate' : ['rook.purple@10', 'knight.purple@3', 'queen.purple@1'].includes(entry.id) ? 'reference' : 'historical' })), ...NEW_BISHOPS];
  if (!isDeepStrictEqual(roster.map(entry => entry.id), protocol.designIds)) fail('The bishop roster differs from the declaration.');
  const registry = createDesignRegistry({ schemaVersion: 2, comparisons: roster.map(entry => ({
    armyA: { upgrades: { [HOMES[entry.family]]: entry.id } }, armyB: { upgrades: {} },
  })) });
  for (const entry of roster) {
    const definition = registry.definitions.find(item => item.id === entry.id);
    if (definition?.movement !== entry.movement || definition.family !== entry.family
      || definition.placement !== 'replace' || definition.level !== 3) fail('A frozen bishop design changed.');
  }
  for (const allocation of source.sourceManifest.plan.registry.allocations) {
    if (!isDeepStrictEqual(allocation, registry.allocations.find(item => item.id === allocation.id))) fail('A historical simple allocation changed.');
  }
  const profile = compileDesignProfile(registry, protocol.evaluation);
  return cached = freeze({ protocol, settings: { seed: protocol.seed, ...protocol.engine, ...protocol.strength,
    bookPositions: protocol.bookPositions, totalGames: protocol.totalGames },
    roster, activeRoster: roster.filter(entry => entry.role !== 'historical'), registry, profile,
    configFiles: [...new Set([CONFIG_FILE, ...original.configFiles, ...source.configFiles])],
    configSha256: sha(config), parent: original.parent, parentManifest: original.parentManifest,
    parentRecords: original.parentRecords, simpleSource: source.simpleSource,
    sourceManifest: source.sourceManifest, sourceRecords: source.sourceRecords,
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
  const schedule = [], units = [], prefix = opening.id.replace(/^reference-/, 'bishop-');
  const reference = library.roster.find(entry => entry.id === 'rook.purple@10');
  for (const entry of library.roster.filter(entry => entry.role === 'candidate')) {
    const key = `${entry.key}-v-${reference.key}`, unitId = `${prefix}-${key}`;
    const gameIds = ['w', 'b'].map(aColor => {
      const whiteDesign = aColor === 'w' ? entry.id : reference.id;
      const blackDesign = aColor === 'w' ? reference.id : entry.id;
      const id = `${unitId}-${aColor}`;
      schedule.push({ id, unitId, pairId: unitId, kind: 'head', aColor,
        openingId: opening.id, groupId: opening.id, comparisonId: key,
        startFen: upgradedFen(opening.fen, opening.members, whiteDesign, blackDesign, library),
        openingMoves: [], designA: entry.id, designB: reference.id, whiteDesign, blackDesign });
      return id;
    });
    units.push({ id: unitId, kind: 'head', gameIds });
  }
  return { schedule, units };
}
// Base chess legality is already established; test every newly added capture
// direction for both kings, including the side that is not on move.
function quietRejection(fen, members, library) {
  let board;
  try { board = new Chess(fen); } catch { return 'invalid-position'; }
  const pieces = piecesOf(fen);
  const kings = Object.fromEntries(['w', 'b'].map(color => [color,
    [...pieces].find(([, piece]) => piece === (color === 'w' ? 'K' : 'k'))[0]]));
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
  for (const entry of library.activeRoster) for (const color of ['w', 'b']) {
    const from = members[color][entry.family], to = kings[color === 'w' ? 'b' : 'w'];
    const dx = Math.abs(from.charCodeAt(0) - to.charCodeAt(0)), dy = Math.abs(Number(from[1]) - Number(to[1]));
    const forward = (Number(to[1]) - Number(from[1])) * (color === 'w' ? 1 : -1) > 0;
    const knight = Math.min(dx, dy) === 1 && Math.max(dx, dy) === 2;
    let attack = entry.family === 'knight' ? Math.min(dx, dy) === 1 && Math.max(dx, dy) === 3
      : entry.family === 'queen' ? knight : false;
    if (entry.family === 'bishop') {
      const sideRange = entry.id === 'bishop.purple@7' ? 1 : ['bishop.purple@4', 'bishop.purple@9'].includes(entry.id) ? 2 : 7;
      const wideKnight = dx === 2 && dy === 1
        && (entry.id === 'bishop.purple@4' || entry.id === 'bishop.purple@7' || entry.id === 'bishop.purple@9' && forward);
      attack = wideKnight || dy === 0 && dx > 0 && dx <= sideRange && clear(from, to);
    }
    if (entry.id === 'rook.purple@10') attack = dx > 0 && dx === dy && forward && clear(from, to);
    if (attack) return 'upgrade-creates-check';
  }
  return null;
}
async function createBishopPlan(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => key !== 'rulesFactory')) fail('Unsupported bishop planning options.');
  const library = getBishopProtocol();
  const rules = await (options.rulesFactory || require('../../dist/balance-rules.cjs').createMatchRules)({ profile: library.profile });
  const openings = JSON.parse(JSON.stringify(library.parentManifest.plan.openings));
  const schedule = [], units = [];
  for (const opening of openings) {
    if (quietRejection(opening.fen, opening.members, library)) fail(`A bishop creates check in ${opening.id}; no inherited position may be silently replaced.`);
    const block = blockFor(opening, library);
    for (const game of block.schedule) {
      let board;
      try { board = rules.createBoard(game.startFen); if (board.outcome() !== null) fail('Terminal start.'); }
      catch (error) { fail(`Invalid bishop condition ${game.id}: ${error.message}`); }
      finally { board?.dispose(); }
    }
    schedule.push(...block.schedule); units.push(...block.units);
  }
  return freeze({ schemaVersion: 1, id: library.protocol.id, protocol: library.protocol,
    settings: library.settings, roster: library.roster, activeRoster: library.activeRoster,
    registry: library.registry, profile: library.profile, configFiles: library.configFiles,
    configSha256: library.configSha256, parent: library.parent, simpleSource: library.simpleSource,
    inheritedGames: 5760, study: library.study,
    book: JSON.parse(JSON.stringify(library.parentManifest.plan.book)), openings, schedule, units,
    totalGames: schedule.length, linkedTotalGames: 5760 + schedule.length,
    grouping: { unit: 'inherited opening position', unknownOpeningFamilies: true,
      interpretation: 'Original, simple and bishop conditions retain one shared position group and separate source contexts.' } });
}
function validateBishopPlan(plan) {
  const library = getBishopProtocol();
  if (!plan || plan.schemaVersion !== 1 || plan.id !== library.protocol.id || plan.totalGames !== 1280
    || plan.linkedTotalGames !== 7040 || plan.inheritedGames !== 5760) fail('An intact frozen 1,280-game bishop plan is required.');
  for (const field of ['protocol', 'settings', 'roster', 'activeRoster', 'registry', 'profile', 'configSha256', 'study', 'parent', 'simpleSource']) {
    if (!isDeepStrictEqual(plan[field], library[field])) fail(`The frozen bishop ${field} differs.`);
  }
  if (!isDeepStrictEqual(plan.openings, library.parentManifest.plan.openings)
    || !isDeepStrictEqual(plan.book, library.parentManifest.plan.book)
    || plan.schedule?.length !== 1280 || plan.units?.length !== 640) fail('Bishop plans require exactly 128 inherited positions and ten new games per position.');
  const schedule = [], units = [];
  for (const opening of plan.openings) {
    if (quietRejection(opening.fen, opening.members, library)) fail('A bishop checks an inherited king at the start.');
    const block = blockFor(opening, library); schedule.push(...block.schedule); units.push(...block.units);
  }
  if (!isDeepStrictEqual(plan.schedule, schedule) || !isDeepStrictEqual(plan.units, units)) fail('The frozen bishop schedule differs.');
  return plan;
}
module.exports = { CONFIG_FILE, getBishopProtocol, createBishopPlan, validateBishopPlan };
