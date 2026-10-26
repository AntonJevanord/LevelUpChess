'use strict';

// New plans import this roster. Completed experiments retain their own profiles.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getDesign } = require('../../src/design-catalog');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(ROOT, 'experiments/designs/official-references-v16.json');
const INI_FILE = path.join(ROOT, 'experiments/designs/official-references-v16.ini');
const DECLARATION_SHA256 = 'a6511fa1df6ce163880d42e43cebccf8c5ecf2b75458ce4540f10bcc66c1fdb4';
const HOMES = Object.freeze({ pawn: 'a2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' });
const sha256 = value => createHash('sha256').update(value).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function declaration() {
  const protocol = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (sha256(JSON.stringify(protocol)) !== DECLARATION_SHA256) throw new Error('The frozen official reference roster changed. Declare a new roster version.');
  for (const reference of protocol.roster) {
    const design = getDesign(reference.id);
    if (!design || ['movement', 'family', 'level', 'placement'].some(field => design[field] !== reference[field])
      || design.roles.pawn || design.roles.enPassant || design.roles.castlingRook !== (reference.family === 'rook')) {
      throw new Error(`Frozen official reference behavior changed: ${reference.id}.`);
    }
  }
  return protocol;
}
function renderOfficialReferenceIni(protocol = declaration()) {
  return [
    '# Frozen version-16 reference roster. Stable design IDs are in the JSON declaration.',
    '# The w/x/y/z mapping is local to this standalone playtesting variant.',
    '# Engine material tables remain automatic; these are not fitted material prices.',
    '# Cruisader: d4-f5 is blocked by e4, not f4. Canonical tested notation: BsR2nsN.',
    `[${protocol.playtest.variant}:chess]`,
    ...protocol.roster.flatMap(reference => [
      `# ${reference.name} (${reference.family} level ${reference.level}; ${reference.id})`,
      `customPiece${reference.slot} = ${reference.letter}:${reference.movement}`,
    ]),
    'pieceToCharTable = -',
    `castlingRookPieces = ${protocol.playtest.castlingRooks}`,
    `startFen = ${protocol.playtest.startFen}`,
    '',
  ].join('\n');
}
let cached;
function getOfficialReferences() {
  const protocol = declaration(), ini = renderOfficialReferenceIni(protocol);
  if (fs.readFileSync(INI_FILE, 'utf8').replace(/\r\n/g, '\n') !== ini) throw new Error('The standalone official-reference INI does not match the frozen roster.');
  if (!cached) {
    const registry = createDesignRegistry({ schemaVersion: 2, comparisons: protocol.roster.map(reference => ({
      armyA: { upgrades: { [HOMES[reference.family]]: reference.id } }, armyB: {},
    })) });
    cached = freeze({ protocol, roster: protocol.roster, registry, profile: compileDesignProfile(registry),
      declarationSha256: DECLARATION_SHA256, ini, configFiles: [CONFIG_FILE, INI_FILE] });
  }
  return cached;
}

/** Each candidate meets all four references; candidate/candidate games are absent. */
function createOfficialComparisons(candidateIds) {
  const { roster } = getOfficialReferences();
  if (!Array.isArray(candidateIds) || !candidateIds.length || new Set(candidateIds).size !== candidateIds.length) throw new Error('Declare distinct candidate design IDs.');
  const references = new Set(roster.map(reference => reference.id));
  return freeze(candidateIds.flatMap(id => {
    const design = getDesign(id);
    if (!design || !HOMES[design.family] || references.has(id)) throw new Error(`A candidate must be a known non-reference design: ${String(id)}.`);
    return roster.map(reference => ({ id: `${id.replace(/[^a-z0-9_-]/g, '-')}-v-${reference.key}`, label: `${id} / ${reference.name}`,
      armyA: { upgrades: { [HOMES[design.family]]: id } },
      armyB: { upgrades: { [HOMES[reference.family]]: reference.id } },
    }));
  }));
}

/** Check all raw/capture/evaluation tables without assigning fitted material prices. */
async function requireOfficialReferenceValues(engine, profile, { signal } = {}) {
  const { roster } = getOfficialReferences();
  if (typeof engine?.pieceValues !== 'function') throw new Error('Official reference preflight requires the levelupvalues diagnostic.');
  const inventory = await engine.pieceValues({ signal });
  if (inventory?.version !== 1 || !inventory.pieces) throw new Error('Official reference preflight received an invalid value inventory.');
  for (const reference of roster) {
    const allocation = profile?.registry?.allocations?.find(item => item.id === reference.id);
    const definition = profile?.registry?.definitions?.find(item => item.id === reference.id);
    if (!allocation || !definition || ['movement', 'family', 'level', 'placement'].some(field => definition[field] !== reference[field])) {
      throw new Error(`Official reference preflight is missing the frozen definition: ${reference.id}.`);
    }
    for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) {
      const actual = inventory.pieces[letter];
      for (const field of ['rawMg', 'captureMg', 'evalMg', 'rawEg', 'captureEg', 'evalEg']) {
        const expected = reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg'];
        if (actual?.[field] !== expected) throw new Error(`Official reference value changed: ${reference.name} (${letter}) ${field} is ${actual?.[field] ?? 'missing'}, expected ${expected}.`);
      }
    }
  }
  return inventory;
}
module.exports = { getOfficialReferences, renderOfficialReferenceIni, createOfficialComparisons, requireOfficialReferenceValues };
