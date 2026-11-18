'use strict';

// Select exact tested identities for new playable libraries. Published panel
// declarations and every earlier profile keep their original movement meaning.
const ROSTER_FILE = 'experiments/designs/v19-roster-003.json';
const VALUES_FILE = 'experiments/designs/v19-panel-values-003.json';
const ROSTER_SHA256 = 'dcee066cd342a9d902750fa1620e21f2b702142f624b8dff1d6197b2717c9df5';
const VALUES_SHA256 = '8e7ea7dd5d664c938f9276591b431f850edd1d30972d781b7fbb2782a699c7d6';
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const promotions = [
  [require('./balance-designs-v19-trials').NEW_DEFINITIONS, 'queen.level1-wide-forward-knight@1'],
  [require('./balance-designs-v19-pawn-followup').NEW_DEFINITIONS, 'pawn.level2-forward-queen-only@1'],
];
const NEW_DEFINITIONS = freeze(promotions.map(([definitions, id]) => {
  const definition = definitions.find(row => row.id === id);
  if (!definition) throw new Error(`Missing selected research definition: ${id}.`);
  return definition;
}));
const ROSTER = freeze(require('../experiments/designs/v19-roster-003.json'));
const VALUE_POLICY = freeze(require('../experiments/designs/v19-panel-values-003.json'));
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
