'use strict';

// Loaded only into a new study's owned catalog snapshot. Active panel profiles
// and playable definitions keep their original immutable identities.
const NEW_DEFINITIONS = Object.freeze([
  ...require('./balance-designs-nightrider-focus').NEW_DEFINITIONS.filter(row => row.id === 'knight.nightrider-diagonal-capture@1'),
  ...require('./balance-designs-knight-pawn-followup').NEW_DEFINITIONS,
  ...require('./balance-designs-cataphract-followup').NEW_DEFINITIONS,
]);
module.exports = { NEW_DEFINITIONS };
