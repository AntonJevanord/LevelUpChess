'use strict';

// Promote the two tested bodies without changing their immutable research IDs
// or registering the unselected alternatives in the live catalog.
const pawn = require('./balance-designs-knight-pawn-followup').NEW_DEFINITIONS
  .find(definition => definition.id === 'pawn.knight-tall-quiet@1');
const rook = require('./balance-designs-cataphract-followup').NEW_DEFINITIONS
  .find(definition => definition.id === 'rook.cataphract-no-tall-back@1');

const NEW_DEFINITIONS = Object.freeze([pawn, rook]);
module.exports = { NEW_DEFINITIONS };
