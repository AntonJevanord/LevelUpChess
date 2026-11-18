'use strict';

// Only the new libraries receive these probes. Earlier profile serializations
// and running experiments retain their own probe inventories and source rules.
function revisionProbes(profile) {
  const probes = [
    ...require('./v19-revised-capability-probes').revisionProbes(profile),
    ...require('./balance-designs-v19-trials').revisionProbes(profile),
    ...require('./balance-designs-v19-pawn-followup').revisionProbes(profile),
  ];
  return [...new Map(probes.map(probe => [probe.fen, probe])).values()];
}
module.exports = { revisionProbes };
