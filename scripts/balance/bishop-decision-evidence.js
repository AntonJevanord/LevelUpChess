'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getDecisionProtocol, validateDecisionPlan } = require('./bishop-decision-plan');
const { recoverRevisionRecords } = require('./reference-matrix');
const ROOT = path.resolve(__dirname, '../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
function aborted(signal) {
  if (signal?.aborted) { const error = new Error('Decision source validation cancelled.'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; throw error; }
}
function journal(bytes) {
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) fail('A decision evidence journal has an incomplete tail.');
  return text.split('\n').filter(Boolean).map(JSON.parse);
}
function validateDecisionEvidence(plan, { directory } = {}) {
  validateDecisionPlan(plan);
  const byName = new Map();
  for (const item of plan.sourceEvidence) {
    const file = directory ? path.join(path.resolve(directory), 'evidence', item.name) : path.resolve(ROOT, item.file);
    const bytes = fs.readFileSync(file);
    if (sha(bytes) !== item.sha256) fail(`Decision evidence changed: ${item.name}.`);
    byName.set(item.name, { file, bytes });
  }
  const source = byName.get('recovered-revisions.games.jsonl');
  const sources = [{ file: source.file, records: journal(source.bytes) }];
  const extra = byName.get('retained-revisions.games.jsonl');
  if (extra) sources.push({ file: extra.file, records: journal(extra.bytes) });
  const recovered = recoverRevisionRecords(sources).records.filter(row => ['completed', 'truncated'].includes(row.status));
  if (!isDeepStrictEqual(recovered, plan.restoredRecords)) fail('Embedded recovered histories differ from their frozen raw source.');
  const bishop = journal(byName.get('bishop.games.jsonl').bytes)
    .filter(row => ['bishop.purple@7', 'bishop.purple@12'].includes(row.designA));
  if (!isDeepStrictEqual(bishop, plan.inheritedBishopRecords)) fail('Embedded bishop histories differ from their frozen raw source.');
  return { hashesMatch: true, selectedHistoriesMatchRawSources: true,
    restoredGames: recovered.length, inheritedBishopGames: bishop.length };
}
async function validateDecisionSourceHistories({ plan, directory, signal, onProgress = () => {},
  rulesFactory = require('../../dist/balance-rules.cjs').createMatchRules } = {}) {
  aborted(signal);
  const evidence = validateDecisionEvidence(plan, { directory }), library = getDecisionProtocol(), sources = [];
  for (const [context, records, profile] of [
    ['inherited-bishop', plan.inheritedBishopRecords, library.old.profile],
    ['restored-revision', plan.restoredRecords, library.revision.profile],
  ]) {
    const rules = await rulesFactory({ profile }); let plies = 0;
    for (let index = 0; index < records.length; index++) {
      aborted(signal); const row = records[index], board = rules.createBoard(row.startFen);
      try {
        if (row.moves.length !== row.sans.length) fail('Source SAN and move counts disagree.');
        for (let ply = 0; ply < row.moves.length; ply++) {
          if (board.outcome() || board.san(row.moves[ply]) !== row.sans[ply] || !board.push(row.moves[ply])) fail(`Invalid inherited history: ${row.id}, ply ${ply + 1}.`);
        }
        if (board.fen() !== row.finalFen) fail(`Inherited final FEN changed: ${row.id}.`);
        const outcome = board.outcome();
        if (row.status === 'completed' ? !isDeepStrictEqual(outcome, { result: row.result, reason: row.reason }) : row.result !== '*' || outcome) fail(`Inherited outcome changed: ${row.id}.`);
        plies += row.moves.length;
      } finally { board.dispose(); }
      if ((index + 1) % 64 === 0 || index + 1 === records.length) {
        onProgress(`Source validation: ${context} ${index + 1}/${records.length} histories replayed; no games played.`);
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    sources.push({ context, games: records.length, plies, profileHash: profile.hash,
      recordsSha256: sha(JSON.stringify(records)) });
  }
  aborted(signal);
  return { ...evidence, sources, searchesStarted: 0,
    historicalProcessManifestsSupplied: false,
    interpretation: 'Legal replay verifies saved moves, SAN, positions and results under their canonical profiles; historical native process identities remain unverified.' };
}
module.exports = { validateDecisionEvidence, validateDecisionSourceHistories };
