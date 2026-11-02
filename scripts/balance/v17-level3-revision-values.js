'use strict';

// Frozen search priors only. No position search, match result or material fit
// contributes to this declaration.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { TRIALS } = require('../../src/balance-designs-v17-revisions');
const { getDesign } = require('../../src/design-catalog');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { getOfficialReferences } = require('./official-references');
const { readSnapshot: readBaseline, getBracketValueReceipt } = require('./v17-bracket-values');
const { UciEngine } = require('./uci');

const ROOT = path.resolve(__dirname, '../..');
const FILE = 'experiments/designs/v17-level3-revision-values.json';
const SNAPSHOT_SHA256 = '9507dbc13aec08c22562433852ffdb3bc5dea572835dab2ee342cf5729f0358f';
const DATE = '2026-11-02';
const POLICY = 'Preserve the prior applied baseline for movement revisions and the three-step orthogonal grant. New three-point king-step and knight grants use their custom-piece automatic raw MG/EG values. Apply each declared pair to all six engine tables, preserving all four official reference pairs. No values are fitted from outcomes.';
const DIAGNOSTIC = 'levelupvalues version 1; no searches or match games';
const FIELDS = Object.freeze(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']);
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function assignments() {
  const trials = TRIALS.map(trial => ({ id: trial.id, valuePolicy: trial.valuePolicy, valueBaseId: trial.valueBaseId }));
  const official = getOfficialReferences().roster.map(reference => ({ id: reference.id,
    valuePolicy: 'preserve-official-reference', valueBaseId: reference.id }));
  const result = [...trials, ...official].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (trials.length !== 6 || official.length !== 4 || new Set(result.map(row => row.id)).size !== 10) throw new Error('The revision calibration requires six trials and four distinct official references.');
  return result;
}

function registryFor(ids = assignments().map(row => row.id)) {
  const homes = { pawn: 'c2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
  return createDesignRegistry({ schemaVersion: 3, comparisons: ids.map(id => {
    const design = getDesign(id);
    if (!design) throw new Error(`Unknown revision calibration design: ${id}.`);
    return { armyA: design.placement === 'reserve'
      ? { upgrades: {}, reserve: [{ id, count: 1 }] }
      : { upgrades: { [homes[design.family]]: id } }, armyB: { upgrades: {} } };
  }) });
}

function contextFor() {
  const ids = assignments().map(row => row.id), registry = registryFor(ids), profile = compileDesignProfile(registry);
  return { ids, registry, profile, context: { variant: profile.variant, profileHash: profile.hash,
    registryHash: registry.hash, config: profile.config, ids } };
}

function automaticTables(inventory, allocation) {
  const lower = inventory?.pieces?.[allocation.letter], upper = inventory?.pieces?.[allocation.letter.toUpperCase()];
  if (inventory?.version !== 1 || !lower || !upper || FIELDS.some(field => !Number.isSafeInteger(lower[field])
    || lower[field] < 0 || lower[field] !== upper[field])) throw new Error(`Invalid automatic six-table inventory for ${allocation.id}.`);
  return Object.fromEntries(FIELDS.map(field => [field, lower[field]]));
}

function appliedFor(entry, automatic) {
  if (entry.valuePolicy === 'measured-automatic-raw') {
    if (entry.valueBaseId !== null) throw new Error(`A measured revision must not inherit another piece: ${entry.id}.`);
    return { ...automatic };
  }
  if (entry.valuePolicy === 'preserve-official-reference') {
    const reference = getOfficialReferences().roster.find(row => row.id === entry.id);
    if (!reference || entry.valueBaseId !== reference.id) throw new Error(`Invalid official revision value: ${entry.id}.`);
    return { ...reference.engineValue };
  }
  if (entry.valuePolicy === 'preserve-applied-baseline') {
    const base = readBaseline().values.find(row => row.id === entry.valueBaseId);
    if (!base) throw new Error(`Missing frozen revision baseline: ${entry.valueBaseId}.`);
    return { ...base.applied };
  }
  throw new Error(`Unknown revision value policy: ${entry.valuePolicy}.`);
}

async function calibrate(enginePath) {
  const { registry, profile, context } = contextFor();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-revision-values-'));
  let engine;
  try {
    const variantPath = path.join(directory, 'automatic-profile.ini'); fs.writeFileSync(variantPath, profile.config);
    engine = new UciEngine({ path: enginePath, variantPath, variant: profile.variant, options: { skill: 20, threads: 1, hash: 32 } });
    await engine.start();
    const inventory = await engine.pieceValues();
    const values = assignments().map(entry => {
      const allocation = registry.allocations.find(row => row.id === entry.id), design = getDesign(entry.id);
      const tables = automaticTables(inventory, allocation), automatic = { mg: tables.rawMg, eg: tables.rawEg };
      return { ...entry, movement: design.movement, family: design.family, level: design.level, placement: design.placement,
        roles: { ...design.roles }, context: 0, automatic, automaticTables: tables, applied: appliedFor(entry, automatic) };
    });
    return { schemaVersion: 1, format: 'levelup-v17-level3-revision-values', calibratedDate: DATE, policy: POLICY,
      baseline: getBracketValueReceipt(), provenance: { engineSha256: hash(fs.readFileSync(enginePath)), platform: process.platform,
        diagnostic: DIAGNOSTIC, contexts: [{ ...context, inventory }] }, values };
  } finally {
    try { await engine?.close(); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
}

function validateSnapshot(snapshot) {
  const entries = assignments(), { registry, context } = contextFor();
  if (snapshot?.schemaVersion !== 1 || snapshot.format !== 'levelup-v17-level3-revision-values'
    || snapshot.calibratedDate !== DATE || snapshot.policy !== POLICY || !isDeepStrictEqual(snapshot.baseline, getBracketValueReceipt())
    || !digest(snapshot.provenance?.engineSha256) || typeof snapshot.provenance.platform !== 'string'
    || !snapshot.provenance.platform || snapshot.provenance.diagnostic !== DIAGNOSTIC
    || !Array.isArray(snapshot.provenance.contexts) || snapshot.provenance.contexts.length !== 1
    || !Array.isArray(snapshot.values) || snapshot.values.length !== 10) throw new Error('The frozen level-three revision calibration declaration changed.');
  const recorded = snapshot.provenance.contexts[0], { inventory, ...recordedContext } = recorded;
  if (!isDeepStrictEqual(recordedContext, context) || inventory?.version !== 1 || !inventory.pieces) throw new Error('The revision automatic-value context changed.');
  for (const letter of 'pnbrqkPNBRQK') {
    const tables = inventory.pieces[letter];
    if (!tables || FIELDS.some(field => !Number.isSafeInteger(tables[field]) || tables[field] < 0)) throw new Error('The revision context lost its ordinary-piece inventory.');
  }
  if (!isDeepStrictEqual(snapshot.values.map(row => row.id), entries.map(entry => entry.id))) throw new Error('The revision inventory IDs or their canonical order changed.');
  for (const entry of entries) {
    const row = snapshot.values.find(value => value.id === entry.id), design = getDesign(entry.id);
    const allocation = registry.allocations.find(value => value.id === entry.id), tables = automaticTables(inventory, allocation);
    const automatic = { mg: tables.rawMg, eg: tables.rawEg };
    if (row.valuePolicy !== entry.valuePolicy || row.valueBaseId !== entry.valueBaseId || row.context !== 0
      || ['movement', 'family', 'level', 'placement'].some(field => row[field] !== design[field])
      || !isDeepStrictEqual(row.roles, design.roles) || !isDeepStrictEqual(row.automaticTables, tables)
      || !isDeepStrictEqual(row.automatic, automatic) || !isDeepStrictEqual(row.applied, appliedFor(entry, automatic))
      || ![row.applied?.mg, row.applied?.eg].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 10000)) {
      throw new Error(`Frozen revision calibration changed: ${entry.id}.`);
    }
  }
  return freeze(snapshot);
}

function readSnapshot() {
  const bytes = fs.readFileSync(path.join(ROOT, FILE));
  if (hash(bytes) !== SNAPSHOT_SHA256) throw new Error('The frozen revision calibration bytes changed; declare a new policy instead of replacing this snapshot.');
  return validateSnapshot(JSON.parse(bytes.toString('utf8')));
}
function getReceipt() { const snapshot = readSnapshot(); return freeze({ file: FILE, sha256: SNAPSHOT_SHA256,
  policy: snapshot.policy, baseline: { ...snapshot.baseline } }); }
function select(ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Select distinct revision calibration IDs.');
  const snapshot = readSnapshot(), byId = new Map(snapshot.values.map(row => [row.id, row]));
  return { snapshot, values: [...ids].sort().map(id => { if (!byId.has(id)) throw new Error(`Missing revision calibration: ${id}.`); return byId.get(id); }) };
}
function getEvaluation(ids) { return freeze({ pieceValues: Object.fromEntries(select(ids).values.map(row => [row.id, { ...row.applied }])) }); }
function getValueAudit(ids) { const { snapshot, values } = select(ids); return freeze({ provenance: { ...getReceipt(),
  engineSha256: snapshot.provenance.engineSha256, calibratedDate: snapshot.calibratedDate, diagnostic: snapshot.provenance.diagnostic },
  values: structuredClone(values) }); }

async function main(args = process.argv.slice(2)) {
  if (args.length === 3 && args[0] === '--engine' && args[2] === '--write') {
    const snapshot = validateSnapshot(await calibrate(path.resolve(args[1]))), content = JSON.stringify(snapshot, null, 2) + '\n';
    if (hash(content) !== SNAPSHOT_SHA256) throw new Error('This engine or context produces different revision values; the frozen snapshot was not replaced.');
    const file = path.join(ROOT, FILE);
    if (fs.existsSync(file)) {
      if (!fs.readFileSync(file).equals(Buffer.from(content))) throw new Error('Refusing to replace the existing revision calibration.');
    } else fs.writeFileSync(file, content, { flag: 'wx' });
    console.log('Verified ten revision/reference priors through levelupvalues; no searches or games.'); return;
  }
  if (args.length) throw new Error('Use no arguments to verify, or --engine PATH --write to reproduce the exact frozen snapshot.');
  console.log(`Verified ${readSnapshot().values.length} frozen revision/reference priors; no engine or games started.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { FILE, SNAPSHOT_SHA256, POLICY, DATE, FIELDS, assignments, registryFor, calibrate, validateSnapshot,
  readSnapshot, getEvaluation, getReceipt, getValueAudit, main };
