'use strict';

// Add the selected alternatives without changing any earlier playable or
// experiment identity. Browser imports keep hashing in the build tooling.
const ROSTER_FILE = 'experiments/designs/v19-roster-005.json';
const VALUES_FILE = 'experiments/designs/v19-panel-values-005.json';
const ROSTER_SHA256 = 'd783c56718408dfe874f0ed2d57f4f73bcfe3323386d18dd6cf924a0abd1282a';
const VALUES_SHA256 = '4bef262c4a6c4e9308c55056e47e759d23c82fb07e37347b0a54629174a57974';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

const promotions = [
  [require('./balance-designs-v19-minor-followup').NEW_DEFINITIONS,
    ['bishop.level1-dabbaba@1', 'knight.level2-forward-zebra@1']],
  [require('./balance-designs-v19-queen-rook-followup').NEW_DEFINITIONS,
    ['rook.level2-no-tall-back-capture-knight@1']],
  [require('./balance-designs-v19-sideways-followup').NEW_DEFINITIONS,
    ['queen.level2-side-knight-side-dabbaba-alfil@1', 'queen.level3-side-threeleap-camel-zebra-tripper@1']],
];
const NEW_DEFINITIONS = freeze(promotions.flatMap(([definitions, ids]) => ids.map(id => {
  const definition = definitions.find(row => row.id === id);
  if (!definition) throw new Error(`Missing tested expanded-roster definition: ${id}.`);
  return definition;
})));

const ROSTER = freeze(require('../experiments/designs/v19-roster-005.json'));
const VALUE_POLICY = freeze(require('../experiments/designs/v19-panel-values-005.json'));
const TIERS = ROSTER.tiers;
const ALL_BODIES = freeze(TIERS.flatMap(tier => tier.bodies));
const ALTERNATIVE_TO = freeze(Object.fromEntries(ALL_BODIES.filter(row => row.alternativeTo)
  .map(row => [row.id, row.alternativeTo])));

function getTier(level) {
  const tier = TIERS.find(row => row.level === Number(level));
  if (!tier) throw new Error('Select version-19 tier 1, 2 or 3.');
  return tier;
}
function getTierRoster(level) { return getTier(level).bodies; }
function getRosterReceipt() { return { file: ROSTER_FILE, sha256: ROSTER_SHA256, id: ROSTER.id }; }
function getValueReceipt() { return { file: VALUES_FILE, sha256: VALUES_SHA256, id: VALUE_POLICY.id, policy: VALUE_POLICY.policy }; }

module.exports = { NEW_DEFINITIONS, ROSTER, VALUE_POLICY, TIERS, ALL_BODIES, ALTERNATIVE_TO,
  ROSTER_FILE, VALUES_FILE, ROSTER_SHA256, VALUES_SHA256,
  getTier, getTierRoster, getRosterReceipt, getValueReceipt };
