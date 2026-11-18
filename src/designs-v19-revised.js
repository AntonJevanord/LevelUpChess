'use strict';

// A new roster receipt preserves the first version-19 declaration and every
// historical piece meaning. Only the already-tested Wraith enters the catalog.
const ROSTER_FILE = 'experiments/designs/v19-roster-002.json';
const VALUES_FILE = 'experiments/designs/v19-panel-values-002.json';
const ROSTER_SHA256 = '080ac76fdaff15c32ef425bff375d8bf8bf7adf47f16553de49f024d2522e612';
const VALUES_SHA256 = '0daafa2b00b5afa8f72091daaca8789aab3585f2da9a96262744602a9d59fbc7';
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const wraith = require('./balance-designs-v18-wraith').NEW_DEFINITIONS
  .find(definition => definition.id === 'queen.wraith-side-through@1');
if (!wraith) throw new Error('Missing tested long-sideways Wraith definition.');
const NEW_DEFINITIONS = freeze([wraith]);
const ROSTER = freeze(require('../experiments/designs/v19-roster-002.json'));
const VALUE_POLICY = freeze(require('../experiments/designs/v19-panel-values-002.json'));
const TIERS = ROSTER.tiers;
const ALL_BODIES = freeze(TIERS.flatMap(tier => tier.bodies));
function getTier(level) {
  const tier = TIERS.find(row => row.level === Number(level));
  if (!tier) throw new Error('Select version-19 tier 1, 2 or 3.');
  return tier;
}
function getTierRoster(level) { return getTier(level).bodies; }
function getRosterReceipt() { return { file: ROSTER_FILE, sha256: ROSTER_SHA256, id: ROSTER.id }; }
function getValueReceipt() { return { file: VALUES_FILE, sha256: VALUES_SHA256, id: VALUE_POLICY.id, policy: VALUE_POLICY.policy }; }
module.exports = { NEW_DEFINITIONS, ROSTER, VALUE_POLICY, TIERS, ALL_BODIES,
  ROSTER_FILE, VALUES_FILE, ROSTER_SHA256, VALUES_SHA256,
  getTier, getTierRoster, getRosterReceipt, getValueReceipt };
