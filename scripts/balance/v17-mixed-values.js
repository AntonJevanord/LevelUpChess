'use strict';

// Declared search priors for the mixed-purchase study, never outcome-fitted values.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getDesign } = require('../../src/design-catalog');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { LEVEL1_ROSTER } = require('./reference-panel-plan');
const { getLevel2References } = require('./level2-references');
const { getOfficialReferences } = require('./official-references');
const { readSnapshot: readBaseline, getBracketValueReceipt } = require('./v17-bracket-values');
const { UciEngine } = require('./uci');

const ROOT = path.resolve(__dirname, '../..');
const FILE = 'experiments/designs/v17-mixed-values.json';
const SNAPSHOT_SHA256 = '495f4e8796b8ea4181aee3d959432a4820e87ac7641eb339e4fb25908222048e';
const DATE = '2026-11-02';
const POLICY = 'Preserve the original applied MG/EG values for the three level-one and three selected level-two pieces, and all four frozen references. Apply the unchanged W2 prior (563/635) to both three-point W2 and WD grants to isolate the jump/blocker change. Record native automatic tables separately; apply each declared pair to all six tables. No values are fitted from outcomes.';
const DIAGNOSTIC = 'levelupvalues version 1; no searches or match games';
const FIELDS = Object.freeze(['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']);
const GRANT_IDS = Object.freeze(['king.reserve-rook@1', 'king.grant-wd-level3@1']);
const GRANT_BASE_ID = 'king.grant-orthogonal-current@1';
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function assignments() {
  const selected = [...LEVEL1_ROSTER, ...getLevel2References().roster].map(reference => ({ id: reference.id,
    valuePolicy: 'preserve-applied-baseline', valueBaseId: reference.id }));
  const official = getOfficialReferences().roster.map(reference => ({ id: reference.id,
    valuePolicy: 'preserve-official-reference', valueBaseId: reference.id }));
  const grants = GRANT_IDS.map(id => ({ id, valuePolicy: 'shared-W2-prior', valueBaseId: GRANT_BASE_ID }));
  const result = [...selected, ...official, ...grants].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (selected.length !== 6 || official.length !== 4 || new Set(result.map(row => row.id)).size !== 12) throw new Error('Mixed values require three level-one, three level-two, four official and two grant designs.');
  return result;
}

function registryFor(ids = assignments().map(row => row.id)) {
  const homes = { pawn: 'c2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
  return createDesignRegistry({ schemaVersion: 3, comparisons: ids.map(id => {
    const design = getDesign(id);
    if (!design) throw new Error(`Unknown mixed-value design: ${id}.`);
    return { armyA: design.placement === 'reserve' ? { upgrades: {}, reserve: [{ id, count: 1 }] }
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
    || lower[field] < 0 || lower[field] !== upper[field])) throw new Error(`Invalid mixed-value six-table inventory: ${allocation.id}.`);
  return Object.fromEntries(FIELDS.map(field => [field, lower[field]]));
}

function appliedFor(entry) {
  if (entry.valuePolicy === 'preserve-official-reference') {
    const reference = getOfficialReferences().roster.find(row => row.id === entry.id);
    if (!reference || entry.valueBaseId !== reference.id) throw new Error('Invalid mixed official value policy.');
    return { ...reference.engineValue };
  }
  const baseline = readBaseline().values.find(row => row.id === entry.valueBaseId);
  if (!baseline) throw new Error(`Missing mixed-value baseline: ${entry.valueBaseId}.`);
  if (entry.valuePolicy === 'preserve-applied-baseline' && entry.valueBaseId === entry.id) return { ...baseline.applied };
  if (entry.valuePolicy === 'shared-W2-prior' && GRANT_IDS.includes(entry.id) && entry.valueBaseId === GRANT_BASE_ID
    && isDeepStrictEqual(baseline.applied, { mg: 563, eg: 635 })) return { ...baseline.applied };
  throw new Error(`Invalid mixed value policy for ${entry.id}.`);
}

async function calibrate(enginePath) {
  const { registry, profile, context } = contextFor();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-mixed-values-'));
  let engine;
  try {
    const variantPath = path.join(directory, 'automatic-profile.ini'); fs.writeFileSync(variantPath, profile.config);
    engine = new UciEngine({ path: enginePath, variantPath, variant: profile.variant, options: { skill: 20, threads: 1, hash: 32 } });
    await engine.start();
    const inventory = await engine.pieceValues();
    const values = assignments().map(entry => {
      const allocation = registry.allocations.find(row => row.id === entry.id), design = getDesign(entry.id);
      const tables = automaticTables(inventory, allocation);
      return { ...entry, movement: design.movement, family: design.family, level: design.level, placement: design.placement,
        roles: { ...design.roles }, context: 0, automatic: { mg: tables.rawMg, eg: tables.rawEg },
        automaticTables: tables, applied: appliedFor(entry) };
    });
    return { schemaVersion: 1, format: 'levelup-v17-mixed-values', calibratedDate: DATE, policy: POLICY,
      baseline: getBracketValueReceipt(), provenance: { engineSha256: hash(fs.readFileSync(enginePath)), platform: process.platform,
        diagnostic: DIAGNOSTIC, contexts: [{ ...context, inventory }] }, values };
  } finally {
    try { await engine?.close(); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
}

function validateSnapshot(snapshot) {
  const entries = assignments(), { registry, context } = contextFor();
  if (snapshot?.schemaVersion !== 1 || snapshot.format !== 'levelup-v17-mixed-values'
    || snapshot.calibratedDate !== DATE || snapshot.policy !== POLICY || !isDeepStrictEqual(snapshot.baseline, getBracketValueReceipt())
    || !digest(snapshot.provenance?.engineSha256) || typeof snapshot.provenance.platform !== 'string' || !snapshot.provenance.platform
    || snapshot.provenance.diagnostic !== DIAGNOSTIC || !Array.isArray(snapshot.provenance.contexts)
    || snapshot.provenance.contexts.length !== 1 || !Array.isArray(snapshot.values) || snapshot.values.length !== 12) {
    throw new Error('The frozen mixed-value declaration changed.');
  }
  const { inventory, ...recordedContext } = snapshot.provenance.contexts[0];
  if (!isDeepStrictEqual(recordedContext, context) || inventory?.version !== 1 || !inventory.pieces) throw new Error('The mixed automatic-value context changed.');
  for (const letter of 'pnbrqkPNBRQK') {
    if (!inventory.pieces[letter] || FIELDS.some(field => !Number.isSafeInteger(inventory.pieces[letter][field])
      || inventory.pieces[letter][field] < 0)) throw new Error('The mixed context lost its ordinary-piece inventory.');
  }
  if (!isDeepStrictEqual(snapshot.values.map(row => row.id), entries.map(row => row.id))) throw new Error('The mixed inventory IDs or canonical order changed.');
  for (const entry of entries) {
    const row = snapshot.values.find(value => value.id === entry.id), design = getDesign(entry.id);
    const tables = automaticTables(inventory, registry.allocations.find(value => value.id === entry.id));
    if (row.valuePolicy !== entry.valuePolicy || row.valueBaseId !== entry.valueBaseId || row.context !== 0
      || ['movement', 'family', 'level', 'placement'].some(field => row[field] !== design[field])
      || !isDeepStrictEqual(row.roles, design.roles) || !isDeepStrictEqual(row.automaticTables, tables)
      || !isDeepStrictEqual(row.automatic, { mg: tables.rawMg, eg: tables.rawEg }) || !isDeepStrictEqual(row.applied, appliedFor(entry))
      || ![row.applied?.mg, row.applied?.eg].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 10000)) {
      throw new Error(`Frozen mixed calibration changed: ${entry.id}.`);
    }
  }
  return freeze(snapshot);
}

function readSnapshot() {
  const bytes = fs.readFileSync(path.join(ROOT, FILE));
  if (hash(bytes) !== SNAPSHOT_SHA256) throw new Error('The frozen mixed-value bytes changed; declare a new policy instead of replacing the receipt.');
  return validateSnapshot(JSON.parse(bytes.toString('utf8')));
}
function getReceipt() { const snapshot = readSnapshot(); return freeze({ file: FILE, sha256: SNAPSHOT_SHA256,
  policy: snapshot.policy, baseline: { ...snapshot.baseline } }); }
function select(ids = assignments().map(row => row.id)) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Select distinct mixed-value IDs.');
  const snapshot = readSnapshot(), byId = new Map(snapshot.values.map(row => [row.id, row]));
  return { snapshot, values: [...ids].sort().map(id => { if (!byId.has(id)) throw new Error(`Missing mixed calibration: ${id}.`); return byId.get(id); }) };
}
function getEvaluation(ids) { return freeze({ pieceValues: Object.fromEntries(select(ids).values.map(row => [row.id, { ...row.applied }])) }); }
function getValueAudit(ids) { const { snapshot, values } = select(ids); return freeze({ provenance: { ...getReceipt(),
  engineSha256: snapshot.provenance.engineSha256, calibratedDate: snapshot.calibratedDate, diagnostic: snapshot.provenance.diagnostic },
  values: structuredClone(values) }); }

async function main(args = process.argv.slice(2)) {
  if (args.length === 3 && args[0] === '--engine' && args[2] === '--write') {
    const snapshot = validateSnapshot(await calibrate(path.resolve(args[1]))), content = JSON.stringify(snapshot, null, 2) + '\n';
    if (hash(content) !== SNAPSHOT_SHA256) throw new Error('This engine or context produces different mixed values; the frozen receipt was not replaced.');
    const file = path.join(ROOT, FILE);
    if (fs.existsSync(file)) {
      if (!fs.readFileSync(file).equals(Buffer.from(content))) throw new Error('Refusing to replace the existing mixed calibration.');
    } else fs.writeFileSync(file, content, { flag: 'wx' });
    console.log('Verified twelve mixed/reference priors through levelupvalues; no searches or games.'); return;
  }
  if (args.length) throw new Error('Use no arguments to verify, or --engine PATH --write to reproduce the exact frozen receipt.');
  console.log(`Verified ${readSnapshot().values.length} frozen mixed/reference priors; no engine or games started.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { FILE, SNAPSHOT_SHA256, POLICY, DATE, FIELDS, GRANT_IDS, GRANT_BASE_ID,
  assignments, registryFor, calibrate, validateSnapshot, readSnapshot, getEvaluation, getReceipt, getValueAudit, main };
