'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');

const CONFIG_FILE = path.resolve(__dirname, '../../experiments/balance/material-estimate.json');
const CONFIG_SHA256 = 'f34e004ad941ed1eba36869e7fe2ef84abbcea8e42c120691a012b4e1356ac00';
const CHECKPOINT_GAMES = Object.freeze([64, 128, 256]);
const LAYOUTS = Object.freeze([
  Object.freeze({ id: 'left', rookSquare: 'a1', pawnOrder: Object.freeze(['a2', 'b2', 'c2', 'f2', 'g2']) }),
  Object.freeze({ id: 'right', rookSquare: 'h1', pawnOrder: Object.freeze(['h2', 'g2', 'f2', 'c2', 'b2']) }),
]);

/** One frozen library and complete-pair schedule for the control and all three
 * increments. Subsets retain every declared comparison in their config. */
function getCampaign() {
  // A Windows Git checkout may convert JSON to CRLF without changing the plan.
  const source = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/\r\n/g, '\n');
  if (createHash('sha256').update(source).digest('hex') !== CONFIG_SHA256) {
    throw new Error('The frozen material-estimate protocol changed. Retain its original configuration and checkout.');
  }
  const config = normalizeConfig(JSON.parse(source));
  const schedule = makeSchedule(config);
  if (config.schemaVersion !== 2 || config.repetitions !== 1 || config.seed !== 42
    || config.openings.length !== 16 || config.comparisons.length !== 16 || schedule.length !== 512
    || !isDeepStrictEqual(config.engine, { nodes: 100000, threads: 1, hashMb: 32, maxPlies: 400 })
    || config.evaluation !== undefined) {
    throw new Error('The material pilot must retain 512 games, ordinary/Amazon evaluation and its fixed effort.');
  }
  const metadata = [];
  for (const phase of ['control', 'amazon']) for (const layout of LAYOUTS) for (const pawnCount of [2, 3, 4, 5]) {
    const comparisonId = `${phase}-${layout.id}-h${pawnCount}`;
    const comparison = config.comparisons.find(row => row.id === comparisonId);
    const armyA = {
      upgrades: phase === 'amazon' ? { d1: 'queen.purple@1' } : {},
      remove: [...(phase === 'control' ? [layout.rookSquare] : []), ...layout.pawnOrder.slice(0, pawnCount)].sort(),
    };
    const armyB = { upgrades: {}, remove: phase === 'control' ? ['d1'] : [] };
    if (!comparison || !isDeepStrictEqual(comparison.armyA, armyA) || !isDeepStrictEqual(comparison.armyB, armyB)
      || !isDeepStrictEqual(comparison.strengthA, { skill: 20 }) || !isDeepStrictEqual(comparison.strengthB, { skill: 20 })) {
      throw new Error('The material pilot must retain its declared ordinary-material compensation and equal strengths.');
    }
    metadata.push({ comparisonId, phase, layout: layout.id, compensationCp: pawnCount * 100 });
  }
  const registry = createDesignRegistry(config);
  const profile = compileDesignProfile(registry, config.evaluation);
  const allOpenings = config.openings.map(opening => opening.id);
  const stageDefinitions = [
    { id: 'control', phase: 'control', number: 0, directory: 'control', openingIds: allOpenings, games: 256, cumulativeGames: 256 },
    { id: 'amazon-1', phase: 'amazon', number: 1, directory: 'amazon-stage-1', openingIds: allOpenings.slice(0, 4), games: 64, cumulativeGames: 64 },
    { id: 'amazon-2', phase: 'amazon', number: 2, directory: 'amazon-stage-2', openingIds: allOpenings.slice(4, 8), games: 64, cumulativeGames: 128 },
    { id: 'amazon-3', phase: 'amazon', number: 3, directory: 'amazon-stage-3', openingIds: allOpenings.slice(8), games: 128, cumulativeGames: 256 },
  ];
  const byComparison = new Map(metadata.map(row => [row.comparisonId, row]));
  const stages = stageDefinitions.map(stage => ({
    ...stage,
    // Finish comparable opening blocks early enough to provide live estimates.
    // The seeded comparison order and adjacent color pairs remain intact.
    schedule: schedule.filter(game => byComparison.get(game.comparisonId).phase === stage.phase && stage.openingIds.includes(game.openingId))
      .sort((a, b) => stage.openingIds.indexOf(a.openingId) - stage.openingIds.indexOf(b.openingId)),
  }));
  for (const stage of stages) if (stage.schedule.length !== stage.games) throw new Error('A material checkpoint does not contain its complete frozen block.');
  return { id: 'material-estimate-v16', totalGames: 512, configFile: CONFIG_FILE,
    config, schedule, registry, profile, metadata, layouts: LAYOUTS, stages };
}

module.exports = { CONFIG_FILE, CONFIG_SHA256, CHECKPOINT_GAMES, LAYOUTS, getCampaign };
