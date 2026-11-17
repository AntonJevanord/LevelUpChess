'use strict';

// The accepted roster reuses research identities instead of rewriting the
// historical catalog. This module is also bundled for the browser: keep file
// hashing and native-engine work in the campaign tooling, not this import.
const ROSTER_FILE = 'experiments/designs/v19-roster.json';
const VALUES_FILE = 'experiments/designs/v19-panel-values.json';
const ROSTER_SHA256 = '935292aa17ee8c83be98e47b9c2ffb4765f5623f217ed2b797db1155dd37eef8';
const VALUES_SHA256 = '2cf2661f504c410dc28d5bfdb03517581706666d2a8d3e8a380eef46d32bdd11';
const roster = require('../experiments/designs/v19-roster.json');
const values = require('../experiments/designs/v19-panel-values.json');

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

// Only these twelve research definitions enter the live catalog. Every other
// selected body already has its exact tested meaning in the catalog.
const promotions = [
  [require('./balance-designs-v18-l1-followup').NEW_DEFINITIONS,
    ['knight.positional-quiet-queen@1', 'bishop.hopper-full-range@1']],
  [require('./balance-designs-v18-level1').NEW_DEFINITIONS,
    ['knight.wazzap@1', 'rook.ghost-diagonal-omni@1']],
  [require('./balance-designs-v18-queen-screen').NEW_DEFINITIONS,
    ['queen.level1-forward-knight@1', 'queen.level2-side-knight@1']],
  [require('./balance-designs-v18-prepanel-queens').NEW_DEFINITIONS,
    ['queen.level1-tall-knight@1', 'queen.level2-camel-capture@1']],
  [require('./balance-designs-v18-l2-followup').NEW_DEFINITIONS,
    ['pawn.bishop-diagonal-range@1']],
  [require('./balance-designs-v18-knight-screen').NEW_DEFINITIONS,
    ['knight.nightrider-level2@1']],
  [require('./balance-designs-v18-prepanel-level2').NEW_DEFINITIONS,
    ['knight.level2-nd-quiet-orthogonal@1']],
  [require('./balance-designs-v18-prepanel-level3').NEW_DEFINITIONS,
    ['knight.level3-nad@1']],
];
const NEW_DEFINITIONS = freeze(promotions.flatMap(([definitions, ids]) => ids.map(id => {
  const definition = definitions.find(row => row.id === id);
  if (!definition) throw new Error(`Missing accepted research definition: ${id}.`);
  return definition;
})));
const ROSTER = freeze(roster);
const VALUE_POLICY = freeze(values);
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

module.exports = {
  NEW_DEFINITIONS, ROSTER, VALUE_POLICY, TIERS, ALL_BODIES,
  ROSTER_FILE, VALUES_FILE, ROSTER_SHA256, VALUES_SHA256,
  getTier, getTierRoster, getRosterReceipt, getValueReceipt,
};
