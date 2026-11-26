'use strict';

// Register one existing research definition inside this owned runtime only.
// This preserves its original ID, movement, purchase level and role metadata;
// no active playable catalogue or earlier cross-level snapshot changes.
const id = 'knight.level3-nz@1';
const definition = require('./balance-designs-v18-prepanel-level3').NEW_DEFINITIONS.find(row => row.id === id);
if (!definition || definition.level !== 3 || definition.movement !== 'NZ') throw new Error('Missing historical Hippogriff definition.');
module.exports = { NEW_DEFINITIONS: Object.freeze([definition]) };
