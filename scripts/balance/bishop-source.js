'use strict';

// The user supplied a journal and analysis artifacts, not collection.json.
// Preserve that distinction: this descriptor is a derived replay input only.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { validateSimplePlan } = require('./simple-plan');
const { latestRecords } = require('./simple-dataset');
const ROOT = path.resolve(__dirname, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE = Object.freeze({
  manifestFile: 'experiments/balance/results/simple-reference-001.replay-source.json',
  manifestSha256: 'c7313eb0330d637ea5105d2e44ad8dc93e11e26895ee59e828946dfcec0edd82',
  journalFile: 'experiments/balance/results/simple-reference-001.games.jsonl',
  journalSha256: '8de913ef53c3023f525c80da572e6ad153d83d2651a96d3ccbbad10f5eea2b84',
  datasetFile: 'experiments/balance/results/simple-reference-001.uploaded-dataset.json',
  datasetSha256: '00813eed16ac43f1193d3d26924cfd272d25a6348cc3610c8561e59077100696',
  reportFile: 'experiments/balance/results/simple-reference-001.uploaded-report.json',
  reportSha256: 'c83a26ca3cf0ab33306bc7ad2481076b6585786538c6d90d7342e0b8f2c4c4dd',
  runId: '1827bb06-2ab9-444c-9606-45d7ad70ab11',
  profileHash: 'b2aac772a3a6846b7738defbb33877f8dd44ade01d8b7b461010693d437340cd',
  registryHash: 'df1a941c5140f0e51668e3a1dcbd21fd147ace005e48ca169fb9fcbfafbd26e7',
  scheduledGames: 3072, completedGames: 3072,
  inheritedGames: 2688, linkedGames: 5760,
  originalManifestSupplied: false,
  historicalNativeInventoryVerified: false,
  interpretation: 'The pinned descriptor reconstructs the canonical plan and declared identity for replay. It is not the historical collection manifest; its checksum and original native inventory remain unverified.',
});
let cached;
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function asSimpleReplayManifest(source) {
  if (source?.schemaVersion !== 1 || source.format !== 'levelup-simple-replay-source'
    || source.runId !== SOURCE.runId || source.jobs !== 4
    || source.provenance?.originalManifestSupplied !== false
    || source.provenance?.historicalNativeInventoryVerified !== false
    || source.provenance?.originalManifestSha256 !== null) throw new Error('An explicitly derived simple replay source is required.');
  validateSimplePlan(source.plan);
  if (source.plan.profile.hash !== SOURCE.profileHash || source.plan.registry.hash !== SOURCE.registryHash) throw new Error('Simple replay profile differs from the supplied evidence.');
  // This in-memory adapter satisfies the frozen extractor's shape. Never write
  // it as an original collection manifest or claim native attestation from it.
  return { schemaVersion: 1, format: 'levelup-simple-collection', runId: source.runId,
    jobs: source.jobs, plan: source.plan, identity: source.identity,
    provenance: source.provenance };
}
function getBishopSource() {
  const bytes = {};
  for (const key of ['manifest', 'journal', 'dataset', 'report']) {
    bytes[key] = fs.readFileSync(path.join(ROOT, SOURCE[`${key}File`]));
    if (sha(bytes[key]) !== SOURCE[`${key}Sha256`]) throw new Error(`Pinned simple ${key} evidence changed.`);
  }
  if (cached) return cached;
  const descriptor = JSON.parse(bytes.manifest), sourceManifest = asSimpleReplayManifest(descriptor);
  const dataset = JSON.parse(bytes.dataset), report = JSON.parse(bytes.report), text = bytes.journal.toString('utf8');
  if (!text.endsWith('\n')) throw new Error('The completed simple journal has an incomplete tail.');
  const sourceRecords = text.trim().split('\n').map(JSON.parse);
  const latest = latestRecords(sourceManifest.plan, sourceRecords);
  if (latest.size !== SOURCE.scheduledGames || sourceRecords.length !== SOURCE.scheduledGames
    || sourceRecords.some(record => record.status !== 'completed' || record.attempt !== 1)
    || report.coveredGames !== 3072 || report.runId !== SOURCE.runId || dataset.identity.runId !== SOURCE.runId
    || report.inputs.selectedJournalSha256 !== SOURCE.journalSha256
    || !isDeepStrictEqual(dataset.profile.registry, sourceManifest.plan.registry)
    || !isDeepStrictEqual(dataset.identity.manifestIdentity, descriptor.identity)) throw new Error('The completed simple source metadata or schedule is inconsistent.');
  return cached = freeze({ simpleSource: SOURCE, sourceManifest, sourceRecords,
    configFiles: ['manifest', 'journal', 'dataset', 'report'].map(key => path.join(ROOT, SOURCE[`${key}File`])) });
}
module.exports = { getBishopSource, asSimpleReplayManifest, SOURCE };
