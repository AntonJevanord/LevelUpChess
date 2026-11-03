'use strict';

// A prospective roster selection, separate from the getter used by historical
// and running campaigns. Reading it never registers a new live catalog ID.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getLevel2References } = require('./level2-references');
const { NEW_DEFINITIONS } = require('../../src/balance-designs-knight-pawn-followup');

const FILE = path.resolve(__dirname, '../../experiments/designs/level2-references-v17-002.json');
const DECLARATION_SHA256 = 'f594e57ecfa58be7fc191783554ccde9d14bb3f0132426e52fcbb841e51a7535';
const QUIET_ID = 'pawn.knight-tall-quiet@1';
const DEFINITION_SOURCE = 'src/balance-designs-knight-pawn-followup.js';
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function getLevel2ReferenceSelection({ read = file => fs.readFileSync(file, 'utf8') } = {}) {
  const protocol = JSON.parse(read(FILE));
  if (sha(protocol) !== DECLARATION_SHA256) throw new Error('The frozen level-two reference selection changed. Declare a new roster revision.');
  const previous = getLevel2References();
  if (protocol.supersedes !== previous.protocol.id || !isDeepStrictEqual(protocol.calibration, previous.protocol.calibration)) {
    throw new Error('The selected level-two predecessor or evaluation policy changed.');
  }
  const oldById = new Map(previous.roster.map(row => [row.id, row]));
  for (const row of protocol.roster) {
    // The new pawn is deliberately resolved from its research declaration.
    // Unchanged members retain the already-guarded old roster definitions.
    const definition = row.id === QUIET_ID ? NEW_DEFINITIONS.find(item => item.id === QUIET_ID) : oldById.get(row.id);
    const anchor = oldById.get(row.valueAnchor || row.id);
    if (!definition || !anchor || ['family', 'movement', 'placement', 'level'].some(field => row[field] !== definition[field])
      || !isDeepStrictEqual(row.roles, definition.roles) || !isDeepStrictEqual(row.engineValue, anchor.engineValue)) {
      throw new Error(`Selected level-two behavior or value anchor changed: ${row.id}.`);
    }
    if (row.id === QUIET_ID ? row.definitionSource !== DEFINITION_SOURCE || row.valueAnchor !== 'pawn.orange@3'
      : !isDeepStrictEqual(row, oldById.get(row.id))) throw new Error(`Selected level-two source or retained member changed: ${row.id}.`);
  }
  // Parsed afresh on every call: callers receive frozen detached data, never
  // shared catalog objects or a mutable reference to the previous selection.
  return freeze({ protocol, roster: protocol.roster, declarationSha256: DECLARATION_SHA256 });
}

module.exports = { FILE, DECLARATION_SHA256, getLevel2ReferenceSelection };
