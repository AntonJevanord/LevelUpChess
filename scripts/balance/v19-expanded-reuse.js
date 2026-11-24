'use strict';

// Roster-004 results remain in their original immutable source context. Only
// analysis views enter the expanded matrix; no old record becomes a 005 game.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { loadPanel, verifySource } = require('../v19-panel-material');
const { openResearchOverlay } = require('./research-overlay');
const { renameWithRetrySync } = require('./files');

const FORMAT = 'levelup-v19-expanded-reuse-evidence';
const COMPOSITE_FORMAT = 'levelup-v19-expanded-composite-report-005';
const RECEIPT = 'reuse-receipt.json';
const TARGETS = [8, 16, 32, 64];
const FINAL = new Set(['completed', 'truncated']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Expanded reuse: ${message}`); };
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const plain = file => { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) fail(`expected an ordinary file: ${file}.`); return stat; };
const directory = file => { const stat = fs.lstatSync(file); if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`expected an ordinary directory: ${file}.`); };
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
function relative(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || path.posix.isAbsolute(file)
    || file.split('/').some(part => !part || part === '.' || part === '..')) fail('invalid evidence path.');
  return file;
}
function latest(records) {
  const rows = new Map();
  for (const record of records) if (!rows.has(record.id) || record.attempt > rows.get(record.id).attempt) rows.set(record.id, record);
  return [...rows.values()];
}
function uniqueAttempts(records) {
  const seen = new Map();
  for (const record of records) {
    const key = JSON.stringify([record.id, record.attempt]);
    if (seen.has(key) && !isDeepStrictEqual(seen.get(key), record)) fail('conflicting duplicate attempt in composite source.');
    if (!seen.has(key)) seen.set(key, record);
  }
  return [...seen.values()];
}
function assertTarget(value) { if (!TARGETS.includes(value)) fail('choose 8, 16, 32 or 64 total openings.'); }
function sourceCoverage(input) {
  let available = 0;
  for (const descriptor of input.manifest.stages.slice().sort((a, b) => a.batchIndex - b.batchIndex)) {
    if (descriptor.batchIndex !== available / 8) break;
    const stage = input.stages.find(row => row.key === descriptor.id);
    if (!stage) break;
    const run = json(path.join(input.root, descriptor.directory, 'run.json'));
    const ids = new Set(latest(stage.records).map(row => row.id));
    // Known failed/truncated attempts remain holes in the scored table. An
    // unattempted source schedule is not silently filled by the new collector.
    if (!run.schedule.every(row => ids.has(row.id))) break;
    available += 8;
  }
  return available;
}
function checkInput(input, { study, targetOpenings, expectedEngineSha256 } = {}) {
  if (input.manifest.format !== 'levelup-v19-tier-panels-004') fail('reuse requires an owned roster-004 tier panel.');
  if (study && input.manifest.study !== study) fail('source tier differs from the expanded tier.');
  if (expectedEngineSha256 && input.manifest.identity.engineSha256 !== expectedEngineSha256) fail('the source executable differs from the new run executable.');
  const available = sourceCoverage(input);
  if (targetOpenings !== undefined) { assertTarget(targetOpenings); if (targetOpenings > available) fail(`source covers ${available} attempted openings; ${targetOpenings} requested.`); }
  const expectedCount = { level1: 11, level2: 12, level3: 12 }[input.manifest.study];
  if (input.roster.length !== expectedCount) fail('source does not contain the declared roster-004 bodies.');
  return available;
}
async function replayPrefixes(input) {
  const rulesFactory = require(path.join(input.overlay.directory, 'dist/balance-rules.cjs')).createMatchRules;
  const armies = new Map(input.roster.map(row => [row.id, row.army]));
  let games = 0, plies = 0;
  for (const stage of input.stages) {
    const rules = await rulesFactory({ profile: stage.profile });
    const cells = new Map(stage.comparisons.map(row => [row.id, row]));
    for (const record of latest(stage.records).filter(row => FINAL.has(row.status))) {
      if (!Array.isArray(record.moves) || !Array.isArray(record.openingMoves)
        || !isDeepStrictEqual(record.moves.slice(0, record.openingMoves.length), record.openingMoves)) fail('a retained source game changed its forced prefix.');
      const cell = cells.get(record.comparisonId), a = armies.get(cell?.designA), b = armies.get(cell?.designB);
      if (!a || !b || rules.startingFen(record.aColor === 'w' ? a : b, record.aColor === 'b' ? a : b) !== record.startFen) fail('source starting position differs from its declared armies.');
      const board = rules.createBoard(record.startFen);
      try {
        for (const move of record.openingMoves) { if (!board.push(move)) fail(`illegal source prefix ${record.id}.`); plies++; }
        if (record.openingEvaluation?.available && board.fen() !== record.openingEvaluation.fen) fail('source opening observation differs from its replayed position.');
        games++;
      } finally { board.dispose(); }
    }
  }
  return { scope: 'forced prefixes of latest completed/truncated source games; no full-game or outcome replay', games, plies };
}
function receiptIdentity(receipt) {
  return { format: FORMAT, hash: receipt.hash, sourceRunId: receipt.source.runId,
    sourceStudy: receipt.source.study, availableOpenings: receipt.availableOpenings,
    engineSha256: receipt.source.engineSha256, oldIds: [...receipt.oldIds] };
}
function checkReceipt(receipt) {
  const { hash: stored, ...payload } = receipt || {};
  if (payload.schemaVersion !== 1 || payload.format !== FORMAT || stored !== hash(JSON.stringify(payload))
    || !Array.isArray(payload.files) || !payload.files.length || !Array.isArray(payload.oldIds)
    || !Number.isInteger(payload.availableOpenings) || payload.availableOpenings < 8 || payload.availableOpenings > 64) fail('reuse ownership receipt changed.');
  const names = new Set();
  for (const row of payload.files) {
    relative(row?.file);
    if (!row.file.startsWith('source/') || names.has(row.file) || !/^[a-f0-9]{64}$/.test(row.sha256 || '') || !Number.isSafeInteger(row.bytes) || row.bytes < 0) fail('invalid reuse file inventory.');
    names.add(row.file);
  }
  return receipt;
}
function verifyEvidence(root, receipt) {
  directory(root); const expected = new Set([RECEIPT, ...receipt.files.map(row => row.file)]), found = new Set();
  const allowedDirectories = new Set(['']);
  for (const name of expected) { const parts = name.split('/'); parts.pop(); for (let i = 1; i <= parts.length; i++) allowedDirectories.add(parts.slice(0, i).join('/')); }
  function walk(relativeRoot = '') {
    directory(path.join(root, relativeRoot));
    for (const name of fs.readdirSync(path.join(root, relativeRoot))) {
      const file = relativeRoot ? `${relativeRoot}/${name}` : name, absolute = path.join(root, file), stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail('linked reuse evidence is not allowed.');
      if (stat.isDirectory()) { if (!allowedDirectories.has(file)) fail(`undeclared evidence directory ${file}.`); walk(file); }
      else { if (!stat.isFile() || !expected.has(file)) fail(`undeclared evidence file ${file}.`); found.add(file); }
    }
  }
  walk(); if (found.size !== expected.size) fail('reuse evidence is incomplete.');
  for (const row of receipt.files) { const file = path.join(root, row.file); plain(file); const bytes = fs.readFileSync(file); if (bytes.length !== row.bytes || hash(bytes) !== row.sha256) fail(`copied source file changed: ${row.file}.`); }
}
function readReuse(evidenceRoot, options = {}) {
  const root = path.resolve(evidenceRoot); plain(path.join(root, RECEIPT));
  const receipt = checkReceipt(json(path.join(root, RECEIPT))); verifyEvidence(root, receipt);
  const input = (options.load || loadPanel)(path.join(root, 'source'));
  const available = checkInput(input, options);
  if (available !== receipt.availableOpenings || input.manifest.runId !== receipt.source.runId
    || input.profile.hash !== receipt.source.profileHash || input.profile.registryHash !== receipt.source.registryHash
    || input.manifest.identity.engineSha256 !== receipt.source.engineSha256
    || input.manifest.identity.rulesBundleSha256 !== receipt.source.rulesBundleSha256
    || input.manifest.identity.runnerSha256 !== receipt.source.runnerSha256
    || input.manifest.book?.sha256 !== receipt.source.openingBookSha256
    || !isDeepStrictEqual(input.roster.map(row => row.id), receipt.oldIds)) fail('copied source differs from its reuse receipt.');
  return { root, receipt, identity: receiptIdentity(receipt), input, oldIds: [...receipt.oldIds], stages: input.stages, availableOpenings: available };
}
async function prepareReuse({ sourceRoot, evidenceRoot, study, targetOpenings, expectedEngineSha256,
  load = loadPanel, replay = replayPrefixes } = {}) {
  if (!sourceRoot || !evidenceRoot) fail('select source and private evidence directories.');
  assertTarget(targetOpenings);
  const out = path.resolve(evidenceRoot);
  if (fs.existsSync(out)) return readReuse(out, { study, targetOpenings, expectedEngineSha256, load });
  const source = fs.realpathSync(path.resolve(sourceRoot));
  let ancestor = path.dirname(out); while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const canonicalOut = path.join(fs.realpathSync(ancestor), path.relative(ancestor, out));
  if (inside(source, canonicalOut) || inside(canonicalOut, source)) fail('reuse evidence must be outside the source panel.');
  const input = load(source), availableOpenings = checkInput(input, { study, targetOpenings, expectedEngineSha256 });
  const replayProof = await replay(input);
  verifySource(input.files); openResearchOverlay({ directory: input.overlay.directory, manifestSha256: input.overlay.manifestSha256 });
  const selected = new Set(input.files.filter(row => !row.absent).map(row => row.file));
  selected.add(path.join(input.overlay.directory, '.research-overlay.json'));
  for (const row of input.overlay.manifest.files) selected.add(path.join(input.overlay.directory, row.file));
  const files = [...selected].map(file => {
    plain(file); const name = path.relative(source, file).split(path.sep).join('/'); relative(name);
    if (name.startsWith('../')) fail('source inventory escapes the owned panel.');
    const bytes = fs.readFileSync(file); return { file: `source/${name}`, bytes: bytes.length, sha256: hash(bytes), content: bytes };
  }).sort((a, b) => a.file.localeCompare(b.file));
  verifySource(input.files); openResearchOverlay({ directory: input.overlay.directory, manifestSha256: input.overlay.manifestSha256 });
  const payload = { schemaVersion: 1, format: FORMAT, createdAt: new Date().toISOString(),
    source: { runId: input.manifest.runId, study: input.manifest.study, format: input.manifest.format,
      engineSha256: input.manifest.identity.engineSha256, rulesBundleSha256: input.manifest.identity.rulesBundleSha256,
      runnerSha256: input.manifest.identity.runnerSha256, openingBookSha256: input.manifest.book?.sha256,
      profileHash: input.profile.hash, registryHash: input.profile.registryHash, overlaySha256: input.overlay.manifestSha256 },
    availableOpenings, oldIds: input.roster.map(row => row.id), replay: replayProof,
    files: files.map(({ content, ...row }) => row) };
  const receipt = { ...payload, hash: hash(JSON.stringify(payload)) };
  fs.mkdirSync(path.dirname(out), { recursive: true }); directory(path.dirname(out));
  const temporary = `${out}.tmp-${randomUUID()}`; fs.mkdirSync(temporary); let moved = false;
  try {
    // The inventory enforces immutability. Do not add read-only OS attributes:
    // on Windows they can prevent cleanup of an interrupted private copy.
    for (const row of files) { const file = path.join(temporary, row.file); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, row.content, { flag: 'wx' }); }
    fs.writeFileSync(path.join(temporary, RECEIPT), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    verifyEvidence(temporary, receipt); verifySource(input.files);
    openResearchOverlay({ directory: input.overlay.directory, manifestSha256: input.overlay.manifestSha256 });
    renameWithRetrySync(temporary, out); moved = true;
  } finally { if (!moved) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
  return readReuse(out, { study, targetOpenings, expectedEngineSha256, load });
}
function verifyBodies(reuse, roster) {
  for (const old of reuse.input.roster) {
    const next = roster.find(row => row.id === old.id);
    if (!next) fail(`expanded roster removed ${old.id}.`);
    for (const key of ['family', 'level', 'movement', 'roles', 'placement', 'prior', 'army', 'count', 'upgradePoints']) if (!isDeepStrictEqual(old[key], next[key])) fail(`expanded body changed ${old.id} ${key}.`);
  }
}
function verifyProtocol(reuse, plan) {
  const input = reuse.input, study = reuse.identity.sourceStudy;
  if (!isDeepStrictEqual(input.manifest.nodes, [plan.NODES]) || input.manifest.book?.sha256 !== plan.OPENINGS_SHA256) fail('source search budget or opening book differs from the expanded protocol.');
  const key = row => JSON.stringify([row.designA, row.designB].sort());
  for (const stage of reuse.stages) {
    const descriptor = input.manifest.stages.find(row => row.id === stage.key);
    if (!descriptor || descriptor.nodes !== plan.NODES || stage.nodes !== plan.NODES) fail('source stage search budget differs from the expanded protocol.');
    const declaration = plan.getBatchDeclaration(study, descriptor.batchIndex, descriptor.nodes);
    const cells = new Map(declaration.metadata.comparisons.map(row => [key(row), row]));
    const settings = new Map(declaration.config.comparisons.map(row => [row.id, row]));
    const openings = new Map(declaration.config.openings.map(row => [row.id, row.moves]));
    const original = new Map(stage.comparisons.map(row => [row.id, row]));
    for (const record of stage.records) {
      const old = original.get(record.comparisonId), cell = old && cells.get(key(old)), config = cell && settings.get(cell.id);
      if (!config) fail('source comparison is absent from the expanded protocol.');
      const white = record.aColor === 'w' ? old.designA : old.designB;
      if (!isDeepStrictEqual(record.engine, declaration.config.engine)
        || !isDeepStrictEqual(record.whiteStrength, white === cell.designA ? config.strengthA : config.strengthB)
        || !isDeepStrictEqual(record.blackStrength, white === cell.designA ? config.strengthB : config.strengthA)
        || !isDeepStrictEqual(record.openingMoves, openings.get(record.openingId))) fail('source engine, strength or opening prefix differs from the expanded protocol.');
    }
  }
}
function gameScore(record) { return record.result === '1/2-1/2' ? 0.5 : Number((record.result === '1-0') === (record.aColor === 'w')); }
function buildCompositeReport({ report, reuse, planTools, manifest, stages } = {}) {
  if (!reuse || !report || !planTools || !manifest || !Array.isArray(stages)) fail('composite reporting requires validated source and delta contexts.');
  const target = report.targetOpenings; assertTarget(target);
  if (target > reuse.availableOpenings || reuse.receipt.source.study !== manifest.study
    || reuse.receipt.source.engineSha256 !== manifest.identity.engineSha256) fail('source coverage, tier or executable is incompatible with the expanded report.');
  if (reuse.receipt.source.rulesBundleSha256 !== manifest.identity.rulesBundleSha256) fail('source and delta adjudication bundles differ.');
  if (planTools.OPENINGS_SHA256 && reuse.receipt.source.openingBookSha256 !== planTools.OPENINGS_SHA256) fail('source and delta opening books differ.');
  const roster = planTools.candidates(manifest.study); verifyBodies(reuse, roster);
  const bodies = new Map(roster.map(row => [row.id, row])), oldIds = new Set(reuse.oldIds);
  const ids = planTools.OPENINGS.slice(0, target).map(row => row.id), wanted = new Set(ids), pairs = [], attempts = [], seenPairs = new Set();
  function add(records, comparisons, cohort, sourceRunId, stageKey) {
    const filtered = uniqueAttempts(records.filter(row => wanted.has(row.openingId))), metadata = { comparisons };
    const byId = new Map(comparisons.map(row => [row.id, row]));
    for (const record of filtered) {
      const cell = byId.get(record.comparisonId); if (!cell || !bodies.has(cell.designA) || !bodies.has(cell.designB)) fail('source cell is outside the expanded roster.');
      if (cohort === 'new-005' && oldIds.has(cell.designA) && oldIds.has(cell.designB)) fail('a delta journal repeats an old-versus-old matchup.');
      attempts.push({ record, cell, cohort, sourceRunId, stageKey });
    }
    for (const pair of planTools.completePairs(filtered, metadata)) {
      const a = bodies.get(pair.designA), b = bodies.get(pair.designB);
      const identity = JSON.stringify([sourceRunId, stageKey, pair.records[0].pairId]);
      if (seenPairs.has(identity)) fail('duplicate source pair in composite.'); seenPairs.add(identity);
      pairs.push({ ...pair, aKey: a.key, bKey: b.key, aLabel: a.label, bLabel: b.label,
        cohort, source: { runId: sourceRunId, stageKey, pairId: pair.records[0].pairId,
          games: pair.records.map(row => ({ id: row.id, attempt: row.attempt, profileHash: row.profileHash, registryHash: row.registryHash })) } });
    }
  }
  for (const stage of reuse.stages) add(stage.records, stage.comparisons, 'legacy-004', reuse.receipt.source.runId, stage.key);
  for (const stage of stages) {
    const declaration = planTools.getBatchDeclaration(manifest.study, stage.batchIndex, stage.nodes);
    add(stage.records, declaration.metadata.comparisons, 'new-005', manifest.runId, `batch-${stage.batchIndex}`);
  }
  const rowsFor = (openingIds, salt) => roster.map(row => ({ ...row,
    allOpponents: planTools.summarize(row, roster.filter(other => other.key !== row.key), pairs, openingIds, `${salt}:all:${row.key}`),
    fixedReferences: planTools.summarize(row, roster.filter(other => other.reference && other.key !== row.key), pairs, openingIds, `${salt}:refs:${row.key}`),
    cells: roster.map(other => other.key === row.key ? { key: other.key, label: other.label, self: true, score: null, games: 0 }
      : { key: other.key, label: other.label, ...planTools.summarize(row, [other], pairs, openingIds, `${salt}:cell:${row.key}:${other.key}`),
        cohorts: [...new Set(pairs.filter(pair => [pair.aKey, pair.bKey].includes(row.key) && [pair.aKey, pair.bKey].includes(other.key) && openingIds.includes(pair.openingId)).map(pair => pair.cohort))] }) }));
  const rows = rowsFor(ids, `expanded-composite:${target}`), comparisons = [];
  for (let i = 0; i < roster.length; i++) for (const b of roster.slice(i + 1)) {
    const a = roster[i], selected = pairs.filter(pair => [pair.aKey, pair.bKey].includes(a.key) && [pair.aKey, pair.bKey].includes(b.key));
    const values = selected.flatMap(pair => pair.records.map(record => pair.aKey === a.key ? gameScore(record) : 1 - gameScore(record)));
    const raw = attempts.filter(row => [row.cell.designA, row.cell.designB].includes(a.id) && [row.cell.designA, row.cell.designB].includes(b.id));
    const counts = { completed: 0, truncated: 0, aborted: 0, error: 0, unknown: 0 }; for (const row of raw) counts[Object.hasOwn(counts, row.record.status) ? row.record.status : 'unknown']++;
    comparisons.push({ id: `${a.key}-v-${b.key}`, aKey: a.key, bKey: b.key, aLabel: a.label, bLabel: b.label,
      pairedGames: values.length, completePairs: selected.length, wins: values.filter(x => x === 1).length,
      draws: values.filter(x => x === 0.5).length, losses: values.filter(x => x === 0).length,
      score: values.length ? values.reduce((x, y) => x + y, 0) / values.length : null, statusCounts: counts,
      cohorts: [...new Set(raw.map(row => row.cohort))] });
  }
  const legacyAttempts = attempts.filter(row => row.cohort === 'legacy-004'), legacyLatest = latest(legacyAttempts.map(row => ({ ...row.record, id: `${row.stageKey}:${row.record.id}` })));
  const reusedProgress = { attempts: legacyAttempts.length, finalizedGames: legacyLatest.filter(row => FINAL.has(row.status)).length,
    completedGames: legacyLatest.filter(row => row.status === 'completed').length,
    completePairs: pairs.filter(row => row.cohort === 'legacy-004').length,
    pairedGames: pairs.filter(row => row.cohort === 'legacy-004').length * 2 };
  return { ...report, format: COMPOSITE_FORMAT, rows, comparisons,
    cohorts: Array.from({ length: target / 8 }, (_, batchIndex) => ({ batchIndex,
      openingIds: ids.slice(batchIndex * 8, batchIndex * 8 + 8), rows: rowsFor(ids.slice(batchIndex * 8, batchIndex * 8 + 8), `expanded-composite:b${batchIndex}`) })),
    reuse: { identity: reuse.identity, mode: 'explicit historical-004 plus new-005 composite; not one uniform engine-type context',
      sourceProfileHash: reuse.receipt.source.profileHash, sourceRegistryHash: reuse.receipt.source.registryHash,
      oldIds: [...reuse.oldIds], originalRecordsPreserved: true, sourceCoverage: reuse.availableOpenings,
      materialFitEligible: false, pairSources: pairs.map(pair => ({ cohort: pair.cohort, openingId: pair.openingId, aKey: pair.aKey, bKey: pair.bKey, ...pair.source })) },
    reusedProgress,
    combinedProgress: { finalizedGames: report.progress.finalizedGames + reusedProgress.finalizedGames,
      completedGames: report.progress.completedGames + reusedProgress.completedGames,
      completePairs: pairs.length, pairedGames: pairs.length * 2,
      scheduledGames: roster.length * (roster.length - 1) * target } };
}
function renderCompositeReport(report) {
  if (report.format !== COMPOSITE_FORMAT || !report.reuse) fail('not an expanded composite report.');
  const pct = x => x === null ? 'pending' : `${(100 * x).toFixed(2)}%`;
  const ci = x => x?.available ? `${pct(x.lower)}–${pct(x.upper)}` : 'pending';
  const lines = [`# Version 19 expanded level ${report.tier}: historical and new-game composite`, '',
    `${report.targetOpenings} shared opening targets. New roster-005 collection: ${report.progress.finalizedGames}/${report.scheduledGames} finalized games.`,
    `Reused roster-004 evidence: ${report.reusedProgress.finalizedGames} finalized games and ${report.reusedProgress.completePairs} scored color pairs.`,
    `Combined matrix: ${report.combinedProgress.completePairs} scored pairs; ${report.combinedProgress.finalizedGames}/${report.combinedProgress.scheduledGames} finalized cells. Draws count half a point.`, '',
    'Old-versus-old cells retain their original roster-004 type mappings and engine context; cells involving alternatives use roster 005. This is an explicit mixed-context descriptive matrix, not a uniform new experiment or a single-context material fit. Conditional ranges do not account for cohort/engine bias.', '',
    '| Design | Whole roster | Fixed references | White | Black | Conditional 95% range | Shared cases |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: |',
    ...report.rows.map(row => `| ${row.label}${row.reference ? ' [reference]' : ''} | ${pct(row.allOpponents.score)} | ${pct(row.fixedReferences.score)} | ${pct(row.allOpponents.physicalColors[0].score)} | ${pct(row.allOpponents.physicalColors[1].score)} | ${ci(row.allOpponents.conditionalRange)} | ${row.allOpponents.openingCoverage.shared}/${report.targetOpenings} |`), '',
    '| Row / opponent | ' + report.rows.map(row => row.label).join(' | ') + ' |',
    '| --- | ' + report.rows.map(() => '---:').join(' | ') + ' |',
    ...report.rows.map(row => `| ${row.label} | ${row.cells.map(cell => cell.self ? '—' : pct(cell.score)).join(' | ')} |`), '',
    '| Matchup | Cohort | Scored games | W / D / L | A score | Truncated attempts | Errors |',
    '| --- | --- | ---: | :--- | ---: | ---: | ---: |',
    ...report.comparisons.map(row => `| ${row.aLabel} / ${row.bLabel} | ${row.cohorts.join(', ') || 'pending'} | ${row.pairedGames} | ${row.wins} / ${row.draws} / ${row.losses} | ${pct(row.score)} | ${row.statusCounts.truncated} | ${row.statusCounts.error} |`), '',
    'Raw source records retain their original IDs, attempts, profiles and provenance in the private copied evidence. Truncations, incomplete pairs, errors and aborted attempts do not become draws and are not automatically replayed.', '',
    'Opening observations below cover only the new roster-005 collection. Original roster-004 observations remain in the copied source journals.', '',
    require('./opening-evaluation-report').renderOpeningEvaluationReport(report.openingEvaluations), '',
    'No source game, rule definition, search prior or original report was modified. This report is not eligible for the uniform roster-005 material command.', ''];
  return lines.join('\n');
}

module.exports = { FORMAT, COMPOSITE_FORMAT, RECEIPT, receiptIdentity, prepareReuse, readReuse,
  replayPrefixes, sourceCoverage, verifyBodies, verifyProtocol, buildCompositeReport, renderCompositeReport };
