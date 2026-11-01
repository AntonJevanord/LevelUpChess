'use strict';

// A declared engine prior, not a fitted material value or a purchase price.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { getDesign } = require('../../src/design-catalog');
const { L1_BRACKETS, L2_PAWN_BRACKETS, L2_GRANT_BRACKETS, L3_NEW } = require('../../src/balance-designs-v17');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { UciEngine } = require('./uci');
const { getOfficialReferences } = require('./official-references');
const { LEVEL1_ROSTER } = require('./reference-panel-plan');

const ROOT = path.resolve(__dirname, '../..');
const FILE = 'experiments/designs/v17-bracket-values.json';
const SNAPSHOT_SHA256 = '205709189dcec631970253dbdf826669262e412c325764f47880acbfbd96d2f9';
const POLICY = 'Current-design automatic raw MG/EG values, applied consistently to all six engine tables for every sibling. Shared diagonal grants use F as their common anchor. Existing references remain fixed. No values are fitted from game outcomes.';
const L3_IDS = ['pawn.purple@12', 'pawn.purple@7', 'pawn.purple@13', 'knight.purple@4', 'knight.purple@5', 'knight.purple@6', 'bishop.purple@16', 'bishop.purple@18', 'bishop.purple@19', 'rook.purple@12', 'rook.purple@14', 'queen.purple@6', 'queen.purple@7', 'queen.purple@8'];
const FIELDS = ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg'];
const sha = value => createHash('sha256').update(value).digest('hex');
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function assignments() {
  const entries = new Map();
  const assign = (id, valueGroup, baseId) => {
    const value = { id, valueGroup, baseId };
    if (entries.has(id) && !isDeepStrictEqual(entries.get(id), value)) throw new Error(`Conflicting bracket value policy for ${id}.`);
    entries.set(id, value);
  };
  for (const bracket of [...L1_BRACKETS, ...L2_PAWN_BRACKETS, ...L2_GRANT_BRACKETS]) {
    for (const variant of bracket.variants) assign(variant.id, bracket.valueGroup, bracket.valueBaseId || bracket.baseId);
  }
  for (const id of L3_IDS) {
    const alternate = L3_NEW.find(row => row.baseId === id);
    assign(id, alternate?.valueGroup || `level3:${id}`, id);
  }
  for (const row of L3_NEW) assign(row.id, row.valueGroup, row.baseId);
  for (const row of LEVEL1_ROSTER) assign(row.id, `baseline:${row.id}`, row.id);
  for (const row of getOfficialReferences().roster) assign(row.id, `official:${row.id}`, row.id);
  return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

function registryFor(ids) {
  const homes = { pawn: 'c2', knight: 'b1', bishop: 'c1', rook: 'a1', queen: 'd1' };
  return createDesignRegistry({ schemaVersion: 3, comparisons: ids.map(id => ({ armyA: getDesign(id).placement === 'reserve'
    ? { upgrades: {}, reserve: [{ id, count: 1 }] } : { upgrades: { [homes[getDesign(id).family]]: id } }, armyB: { upgrades: {} } })) });
}

async function calibrate(enginePath) {
  const rows = assignments(), inventory = new Map(), contexts = [];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-bracket-calibration-'));
  let engine;
  try {
    for (let start = 0; start < rows.length; start += 20) {
      const ids = rows.slice(start, start + 20).map(row => row.id), registry = registryFor(ids), profile = compileDesignProfile(registry);
      const variantPath = path.join(directory, `calibration-${start}.ini`);
      fs.writeFileSync(variantPath, profile.config);
      engine = new UciEngine({ path: enginePath, variantPath, variant: profile.variant, options: { skill: 20, threads: 1, hash: 32 } });
      await engine.start();
      const values = await engine.pieceValues();
      if (values.version !== 1) throw new Error('Unsupported automatic value inventory.');
      for (const allocation of registry.allocations) {
        const lower = values.pieces[allocation.letter], upper = values.pieces[allocation.letter.toUpperCase()];
        if (!lower || !upper || FIELDS.some(field => !Number.isSafeInteger(lower[field]) || lower[field] < 0 || lower[field] !== upper[field])) throw new Error(`Invalid automatic value inventory for ${allocation.id}.`);
        inventory.set(allocation.id, { automatic: { mg: lower.rawMg, eg: lower.rawEg }, automaticTables: Object.fromEntries(FIELDS.map(field => [field, lower[field]])), context: contexts.length });
      }
      contexts.push({ variant: profile.variant, profileHash: profile.hash, registryHash: registry.hash, config: profile.config, ids });
      await engine.close(); engine = undefined;
    }
    const official = new Map(getOfficialReferences().roster.map(row => [row.id, row.engineValue]));
    return {
      schemaVersion: 1, format: 'levelup-v17-bracket-values', calibratedDate: '2026-11-01', policy: POLICY,
      provenance: { engineSha256: sha(fs.readFileSync(enginePath)), platform: process.platform, diagnostic: 'levelupvalues version 1; no searches or match games', contexts },
      values: rows.map(row => {
        const measured = inventory.get(row.id), anchor = inventory.get(row.baseId).automatic;
        const applied = official.get(row.id) || anchor;
        if (!applied || ![applied.mg, applied.eg].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 10000)) throw new Error(`Invalid applied value for ${row.id}.`);
        const design = getDesign(row.id);
        return { ...row, movement: design.movement, level: design.level, placement: design.placement, ...measured, applied: { ...applied } };
      }),
    };
  } finally { await engine?.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

function validateSnapshot(snapshot) {
  const expected = assignments();
  if (snapshot?.schemaVersion !== 1 || snapshot.format !== 'levelup-v17-bracket-values' || snapshot.policy !== POLICY
    || !/^[a-f0-9]{64}$/.test(snapshot.provenance?.engineSha256 || '') || !Array.isArray(snapshot.provenance.contexts)
    || !Array.isArray(snapshot.values) || snapshot.values.length !== expected.length) throw new Error('The bracket calibration declaration changed.');
  const byId = new Map(snapshot.values.map(row => [row.id, row]));
  const official = new Map(getOfficialReferences().roster.map(row => [row.id, row.engineValue]));
  for (const entry of expected) {
    const row = byId.get(entry.id), design = getDesign(entry.id), anchor = byId.get(entry.baseId);
    if (!row || ['id', 'baseId', 'valueGroup'].some(field => row[field] !== entry[field])
      || row.movement !== design.movement || row.level !== design.level || row.placement !== design.placement
      || !isDeepStrictEqual(row.applied, official.get(row.id) || anchor?.automatic)
      || ![row.applied?.mg, row.applied?.eg].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 10000)
      || FIELDS.some(field => !Number.isSafeInteger(row.automaticTables?.[field]) || row.automaticTables[field] < 0)
      || row.automatic?.mg !== row.automaticTables.rawMg || row.automatic?.eg !== row.automaticTables.rawEg) throw new Error(`Bracket calibration changed for ${entry.id}.`);
    const context = snapshot.provenance.contexts[row.context];
    if (!context?.ids?.includes(row.id) || !/^[a-f0-9]{64}$/.test(context.profileHash || '') || !/^[a-f0-9]{64}$/.test(context.registryHash || '')) throw new Error('Bracket calibration context is missing.');
  }
  if (byId.size !== expected.length) throw new Error('Bracket calibration repeats a design.');
  return freeze(snapshot);
}

function readSnapshot() {
  const bytes = fs.readFileSync(path.join(ROOT, FILE));
  if (sha(bytes) !== SNAPSHOT_SHA256) throw new Error('The frozen bracket calibration changed. Declare a new policy instead of replacing this snapshot.');
  return validateSnapshot(JSON.parse(bytes.toString('utf8')));
}
function getBracketValueReceipt() { const snapshot = readSnapshot(); return freeze({ file: FILE, sha256: sha(fs.readFileSync(path.join(ROOT, FILE))), policy: snapshot.policy }); }
function select(ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Select distinct bracket value IDs.');
  const snapshot = readSnapshot(), byId = new Map(snapshot.values.map(row => [row.id, row]));
  const values = [...ids].sort().map(id => { if (!byId.has(id)) throw new Error(`Missing bracket calibration for ${id}.`); return byId.get(id); });
  return { snapshot, values };
}
function getBracketEvaluation(ids) { return freeze({ pieceValues: Object.fromEntries(select(ids).values.map(row => [row.id, { ...row.applied }])) }); }
function getBracketValueAudit(ids) {
  const { snapshot, values } = select(ids);
  return freeze({ provenance: { ...getBracketValueReceipt(), engineSha256: snapshot.provenance.engineSha256, calibratedDate: snapshot.calibratedDate, diagnostic: snapshot.provenance.diagnostic },
    values: values.map(row => ({ ...row, automatic: { ...row.automatic }, applied: { ...row.applied } })) });
}

async function main(args = process.argv.slice(2)) {
  if (args.length === 3 && args[0] === '--engine' && args[2] === '--write') {
    const snapshot = await calibrate(path.resolve(args[1])); validateSnapshot(snapshot);
    const content = JSON.stringify(snapshot, null, 2) + '\n';
    if (sha(content) !== SNAPSHOT_SHA256) throw new Error('This engine or declaration produces a different calibration. The frozen snapshot was not replaced; create a new policy.');
    if (fs.existsSync(path.join(ROOT, FILE))) {
      if (fs.readFileSync(path.join(ROOT, FILE), 'utf8') !== content) throw new Error('Refusing to replace the existing calibration snapshot.');
    } else fs.writeFileSync(path.join(ROOT, FILE), content, { flag: 'wx' });
    console.log(`Calibrated ${snapshot.values.length} designs without searches or match games: ${FILE}`);
    return;
  }
  if (args.length) throw new Error('Use --engine PATH --write to explicitly regenerate, or no arguments to verify.');
  const snapshot = readSnapshot(); console.log(`Verified ${snapshot.values.length} declared bracket values.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { FILE, SNAPSHOT_SHA256, POLICY, L3_IDS, assignments, registryFor, calibrate, validateSnapshot, readSnapshot, getBracketEvaluation, getBracketValueAudit, getBracketValueReceipt, main };
