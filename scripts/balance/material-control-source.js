'use strict';

// Select already archived controls only. This adapter neither runs an engine nor
// substitutes a new registry for the original experiment's piece allocation.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getCampaign } = require('./rook-values-report');

const ROOT = path.resolve(__dirname, '../..');
const ARCHIVE = path.join(ROOT, 'experiments/balance/results');
const JOURNAL = 'rook-values-auto-001.games.jsonl';
const AUDIT = 'rook-values-auto-001.audit.json';
const CONTROL_IDS = Object.freeze(['standard-control', 'amazon-control']);
const OPENING_GROUPS = Object.freeze({
  start: 'unforced',
  'open-e-pawns': 'e-pawn', 'sicilian-prefix': 'e-pawn', 'french-prefix': 'e-pawn',
  'caro-prefix': 'e-pawn', 'modern-prefix': 'e-pawn', 'open-knights-prefix': 'e-pawn',
  'reversed-sicilian-prefix': 'english', 'symmetrical-english-prefix': 'english', 'anglo-indian-prefix': 'english',
  'kingside-fianchetto-prefix': 'fianchetto', 'fianchetto-sicilian-prefix': 'fianchetto',
  'ordinary-knights-prefix': 'knights', 'reti-e-pawn-prefix': 'knights', 'reti-sicilian-prefix': 'knights',
  'quiet-e-pawns': 'quiet-pawns', 'quiet-c-pawns': 'quiet-pawns',
  'bird-open-prefix': 'flank-pawns', 'king-pawn-step-prefix': 'flank-pawns', 'queen-rook-step-prefix': 'flank-pawns',
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = value => sha256(JSON.stringify(value));
const fail = message => { throw new Error(message); };

function validateControlRecords(records, expected = getCampaign().policies.auto) {
  const schedule = new Map(expected.schedule.map(game => [game.id, game]));
  if (!Array.isArray(records) || records.length !== 200 || new Set(records.map(row => row?.id)).size !== 200
    || !isDeepStrictEqual(records.map(row => row.id).sort(), [...schedule.keys()].sort())) fail('Automatic controls require the original complete 200-game schedule with distinct records.');
  const amazon = expected.registry.allocations.find(item => item.id === 'queen.purple@1')?.letter;
  if (!amazon) fail('The original automatic registry must retain its Amazon.');
  const selected = [];
  for (const record of records) {
    const game = schedule.get(record.id);
    if (record.attempt !== 1 || record.status !== 'completed' || !['1-0', '0-1', '1/2-1/2'].includes(record.result)) fail(`Unscored or repeated automatic game: ${record.id}.`);
    for (const key of ['pairId', 'comparisonId', 'openingId', 'aColor']) if (record[key] !== game[key]) fail(`Automatic schedule annotation ${key} differs: ${record.id}.`);
    if (record.profileHash !== expected.profile.hash || record.registryHash !== expected.registry.hash
      || record.variant !== expected.profile.variant || record.registryReference !== 'run.json#designRegistry'
      || record.royalMode !== 'king' || record.evaluationCaveat !== null || Object.hasOwn(record, 'evaluation')) fail(`Automatic profile/evaluation mismatch: ${record.id}.`);
    if (!isDeepStrictEqual(record.engine, expected.config.engine)
      || !isDeepStrictEqual(record.whiteStrength, game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB)
      || !isDeepStrictEqual(record.blackStrength, game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB)) fail(`Automatic search/strength settings differ: ${record.id}.`);
    if (!Array.isArray(record.moves) || !Array.isArray(record.sans) || record.moves.length !== record.sans.length
      || record.totalPlies !== record.moves.length || record.openingPlies !== game.openingMoves.length
      || record.playedPlies !== record.totalPlies - record.openingPlies
      || !isDeepStrictEqual(record.openingMoves, game.openingMoves)
      || !isDeepStrictEqual(record.moves.slice(0, game.openingMoves.length), game.openingMoves)) fail(`Automatic move counts or prefix differ: ${record.id}.`);
    if (!Object.hasOwn(OPENING_GROUPS, record.openingId)) fail(`Missing related-opening group: ${record.openingId}.`);
    if (!CONTROL_IDS.includes(record.comparisonId)) continue;
    const isAmazon = record.comparisonId === 'amazon-control';
    const upgrades = isAmazon ? { d1: 'queen.purple@1' } : {};
    for (const army of [game.comparison.armyA, game.comparison.armyB]) {
      if (!isDeepStrictEqual(army, { upgrades, remove: [] })) fail('Control armies must be symmetric and contain no material handicap.');
    }
    const queen = isAmazon ? amazon : 'q';
    const expectedStart = `rnb${queen}kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB${queen.toUpperCase()}KBNR w KQkq - 0 1`;
    if (record.startFen !== expectedStart) fail(`Control starting army differs: ${record.id}.`);
    selected.push(record);
  }
  if (selected.length !== 80 || CONTROL_IDS.some(id => selected.filter(row => row.comparisonId === id).length !== 40)) fail('Select exactly 40 standard and 40 Amazon controls.');
  return selected;
}

function readControlArchive(directory = ARCHIVE) {
  const auditBytes = fs.readFileSync(path.join(directory, AUDIT));
  const audit = JSON.parse(auditBytes.toString('utf8'));
  const expected = getCampaign().policies.auto;
  if (audit.format !== 'levelup-rook-values-auto-results-audit' || audit.policy !== 'auto'
    || audit.scheduledGames !== 200 || audit.totalAttempts !== 200
    || audit.expectedProtocol?.profileHash !== expected.profile.hash
    || audit.expectedProtocol.registryHash !== expected.registry.hash
    || audit.expectedProtocol.variant !== expected.profile.variant
    || audit.expectedProtocol.configSha256 !== fingerprint(expected.config)
    || audit.expectedProtocol.scheduleSha256 !== fingerprint(expected.schedule)
    || !isDeepStrictEqual(audit.expectedProtocol.definitions, expected.registry.definitions)
    || !isDeepStrictEqual(audit.expectedProtocol.engine, expected.config.engine)
    || audit.expectedProtocol.manualEvaluation !== null) fail('The archived automatic audit does not match the frozen rook-values protocol.');
  const bytes = fs.readFileSync(path.join(directory, JOURNAL));
  if (bytes.length !== audit.inputs?.journal?.bytes || sha256(bytes) !== audit.inputs?.journal?.sha256) fail('Archived automatic journal checksum mismatch.');
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) fail('The automatic journal must end in a complete line.');
  const records = text.trim().split('\n').map(line => JSON.parse(line));
  const controls = validateControlRecords(records, expected);
  const sourceId = 'rook-auto-controls';
  const historyHashes = Object.fromEntries(controls.map(record => [record.id, fingerprint({
    startFen: record.startFen, moves: record.moves, result: record.result,
    reason: record.reason, finalFen: record.finalFen,
  })]));
  const historyGroups = {};
  for (const record of controls) (historyGroups[historyHashes[record.id]] ||= []).push(record.id);
  const selection = {
    sourcePolicy: 'auto', sourceRecords: 200, selectedRecords: 80,
    comparisons: { 'standard-control': 40, 'amazon-control': 40 },
    excludedSubjectRecords: 120, materialHandicaps: false,
    historyHashFormat: 'SHA-256 of JSON.stringify({startFen,moves,result,reason,finalFen}); property order as listed',
    uniqueHistories: Object.keys(historyGroups).length,
    duplicateRecords: controls.length - Object.keys(historyGroups).length,
    historyKeys: Object.fromEntries(Object.entries(historyHashes).map(([id, value]) => [`${sourceId}:${id}`, value])),
    historyGroups,
    excludedPolicy: 'eight-point',
    excludedOtherPolicyControlRecords: 80,
    otherPolicyJournalLoaded: false,
    duplicatePolicyHandling: 'Eight-point controls are not loaded or fitted; their repeated histories are not additional evidence.',
  };
  const identity = {
    protocol: 'rook-values-v16-automatic-controls', profileHash: expected.profile.hash,
    registryHash: expected.registry.hash, evaluation: 'automatic-reference',
    engineSettings: expected.config.engine, whiteStrength: { skill: 20 }, blackStrength: { skill: 20 },
    engineIdentityVerified: false, sourceIdentityVerified: false,
  };
  return {
    sources: [{ id: sourceId, records: controls, identity, historyHashes,
      metadata: { runId: audit.runId, selection, openingGroups: OPENING_GROUPS,
        originalJournal: { file: JOURNAL, bytes: bytes.length, sha256: sha256(bytes) } } }],
    profile: expected.profile, openingGroups: OPENING_GROUPS, selection, historyHashes,
    description: 'Automatic-value ordinary/Amazon symmetric controls without material handicaps.',
    inputs: [{ file: JOURNAL, bytes: bytes.length, sha256: sha256(bytes) },
      { file: AUDIT, bytes: auditBytes.length, sha256: sha256(auditBytes) }],
    protocolConfigFiles: ['rook-values-auto.json', 'rook-values-eight.json', 'rook-values-roster.json']
      .map(file => path.join(ROOT, 'experiments/balance', file)),
  };
}

module.exports = { readControlArchive, validateControlRecords, OPENING_GROUPS };
