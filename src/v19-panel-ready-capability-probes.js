'use strict';

// These generic probe builders filter on the actual definitions in a profile.
// The new L3 edition therefore includes six-jump pawn checks without changing
// any earlier profile's serialized probe inventory.
function revisionProbes(profile) {
  return require('./v19-current-capability-probes').revisionProbes(profile);
}
module.exports = { revisionProbes };
