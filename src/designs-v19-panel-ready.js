'use strict';

// Complete the selected roster with the tested six-jump pawn. Earlier
// declarations and existing game/experiment profiles retain their identities.
const ROSTER_FILE = 'experiments/designs/v19-roster-004.json';
const VALUES_FILE = 'experiments/designs/v19-panel-values-004.json';
const ROSTER_SHA256 = '7102046d54114d80417e6b757fbc06b5b0f116d61bfa247d5d3ed8a7cc57fc0b';
const VALUES_SHA256 = '0850507b28f7d21e93d623a17d27f86375358789f26805c98814d14f509010cb';
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const sixJumpPawn = require('./balance-designs-v19-trials').NEW_DEFINITIONS
  .find(definition => definition.id === 'pawn.level3-six-knight@1');
if (!sixJumpPawn) throw new Error('Missing tested six-jump pawn definition.');
const NEW_DEFINITIONS = freeze([sixJumpPawn]);
const ROSTER = freeze(require('../experiments/designs/v19-roster-004.json'));
const VALUE_POLICY = freeze(require('../experiments/designs/v19-panel-values-004.json'));
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
