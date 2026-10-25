'use strict';

// The confirmation is a separate frozen protocol. The completed pilot's
// definitions and selected physical positions remain independently preserved.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getCollectionProtocol, createPlanForProtocol } = require('./material-collection-plan');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_FILE = path.join(ROOT, 'experiments/balance/material-study.json');
const EXCLUSION_FILE = path.join(ROOT, 'experiments/balance/results/material-collection-preflight-001.json');
const EXPECTED = {
  schemaVersion: 1, id: 'material-collection-v16-confirmation-001', seed: 42,
  bookPositions: 384, totalGames: 1152, jobs: 4, checkpoints: [384, 768, 1152],
  designId: 'queen.purple@1', evaluation: 'automatic',
  engine: { nodes: 20000, threads: 1, hashMb: 32, maxPlies: 400 },
  strength: { skill: 20 }, sampling: { minPly: 16, stride: 5, stableBefore: 2, stableAfter: 2 },
  analysis: { anchors: { pawn: 1, queen: 9 }, ridge: 0.001, bootstrap: 200, validationFolds: 5 },
  excludePilot: { file: 'experiments/balance/results/material-collection-preflight-001.json',
    sha256: '8ba23279d021fdf2401d5d74b49b4b72e94a33d2b109403a78abed998e6891ee' },
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const source = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function getStudyProtocol() {
  const config = source(CONFIG_FILE), protocol = JSON.parse(config);
  if (!isDeepStrictEqual(protocol, EXPECTED)) throw new Error('The fixed 1152-game material study protocol changed. Use its matching revision or declare a new study.');
  const exclusionSource = source(EXCLUSION_FILE);
  if (sha256(exclusionSource) !== protocol.excludePilot.sha256) throw new Error('The frozen pilot-position exclusion source changed.');
  const pilot = JSON.parse(exclusionSource);
  if (pilot.planId !== 'material-collection-v16-pilot-001' || !Array.isArray(pilot.selectedOpenings)
    || pilot.selectedOpenings.length !== 32 || typeof pilot.book?.sha256 !== 'string') throw new Error('The pilot-position exclusion snapshot is malformed.');
  const positions = pilot.selectedOpenings.map(opening => {
    if (!opening || typeof opening.id !== 'string' || typeof opening.fen !== 'string'
      || sha256(opening.fen.split(' ').slice(0, 4).join(' ')) !== opening.positionSha256) throw new Error('A frozen pilot-position digest differs from its FEN.');
    return { id: opening.id, fen: opening.fen, positionSha256: opening.positionSha256 };
  });
  if (new Set(positions.map(position => position.positionSha256)).size !== 32) throw new Error('The pilot exclusion positions must be distinct.');
  const original = getCollectionProtocol();
  const exclusions = { source: protocol.excludePilot.file, sourceSha256: protocol.excludePilot.sha256,
    sourcePlanId: pilot.planId, originalBookSha256: pilot.book.sha256, count: 32, positions };
  return freeze({ protocol, registry: original.registry, profile: original.profile,
    configFiles: [CONFIG_FILE, EXCLUSION_FILE], configSha256: sha256(config),
    settings: { seed: protocol.seed, ...protocol.engine, ...protocol.strength,
      bookPositions: protocol.bookPositions, totalGames: protocol.totalGames },
    openingPrefix: 'fresh', exclusions,
    study: { jobs: protocol.jobs, checkpoints: protocol.checkpoints, analysis: protocol.analysis } });
}

async function createStudyPlan(bookBytes, options = {}) {
  return createPlanForProtocol(bookBytes, getStudyProtocol(), options);
}

module.exports = { CONFIG_FILE, EXCLUSION_FILE, getStudyProtocol, createStudyPlan };
