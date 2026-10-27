'use strict';

const openings = require('../../experiments/balance/v17-openings.json');
const { normalizeConfig } = require('./plan');
const { getOfficialReferences } = require('./official-references');

const homes = { knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
const pawnArmy = id => ({ upgrades: { c2: id, d2: id, e2: id } });
const bundles = [
  { key: 'bishop-pawns', label: 'Three Bishop pawns', army: pawnArmy('pawn.blue@2') },
  { key: 'returning-pawns', label: 'Three Returning pawns', army: pawnArmy('pawn.blue@3') },
  { key: 'pawn-grants', label: 'Three pawn grants', army: { upgrades: {}, reserve: [{ id: 'king.reserve-pawn@1', count: 3 }] } },
];
const references = getOfficialReferences().roster.map(reference => ({
  key: reference.key, label: reference.name,
  army: { upgrades: { [homes[reference.family]]: reference.id } },
}));
const cells = bundles.flatMap(bundle => references.map(reference => [bundle, reference]));
for (let a = 0; a < bundles.length; a++) for (let b = a + 1; b < bundles.length; b++) cells.push([bundles[a], bundles[b]]);

const pawnGrantMetadata = Object.freeze(cells.map(([a, b]) => Object.freeze({
  id: `${a.key}-v-${b.key}`, aKey: a.key, aLabel: a.label, bKey: b.key, bLabel: b.label,
})));

/** Equal three-point packages; preparation never plays games. */
function createPawnGrantConfig() {
  return normalizeConfig({
    schemaVersion: 3,
    name: 'Version 17: level-1 pawn and pawn-grant bundles',
    seed: 20261028,
    repetitions: 1,
    engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
    openings,
    comparisons: cells.map(([a, b]) => ({
      id: `${a.key}-v-${b.key}`,
      label: `${a.label} versus ${b.label}`,
      armyA: a.army,
      armyB: b.army,
      strengthA: { skill: 20 },
      strengthB: { skill: 20 },
    })),
  });
}

module.exports = { createPawnGrantConfig, pawnGrantMetadata };
