'use strict';

// Filter each builder through the actual profile, then keep one copy of each
// position. Only revision-005 profiles receive this expanded inventory.
function revisionProbes(profile) {
  const probes = [
    ...require('./v19-panel-ready-capability-probes').revisionProbes(profile),
    ...require('./balance-designs-v19-minor-followup').revisionProbes(profile),
    ...require('./balance-designs-v19-queen-rook-followup').revisionProbes(profile),
    ...require('./balance-designs-v19-sideways-followup').revisionProbes(profile),
  ];
  return [...new Map(probes.map(probe => [probe.fen, probe])).values()];
}
module.exports = { revisionProbes };
