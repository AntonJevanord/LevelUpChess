'use strict';

// Add only to the revised edition, so the first three version-19 profiles keep
// their serialized probe inventories as well as their movement identities.
function revisionProbes(profile) {
  const probes = [
    ...require('./v19-capability-probes').revisionProbes(profile),
    ...require('./balance-designs-v18-wraith').revisionProbes(profile),
  ];
  return [...new Map(probes.map(probe => [probe.fen, probe])).values()];
}
module.exports = { revisionProbes };
