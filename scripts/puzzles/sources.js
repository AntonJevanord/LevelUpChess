'use strict';

// Puzzle extraction reads journals under their own frozen rule modules. It
// never calls a source controller's run/report entry points or stageState:
// even stageState may clean abandoned temporary files in a balance folder.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const material = require('../v19-panel-material');
const { openResearchOverlay } = require('../balance/research-overlay');

const hash = value => createHash('sha256').update(value).digest('hex');
const LOCKS = ['.v19-panel.lock', 'run.lock', '.v17-report.lock'];
function ordinary(file, directory = false) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) throw new Error(`Puzzle source requires an ordinary ${directory ? 'directory' : 'file'}: ${file}.`);
}
function json(file) { ordinary(file); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function inactive(root) {
  for (const name of LOCKS) if (fs.existsSync(path.join(root, name))) throw new Error('Stop the source panel and its workers before generating puzzles; source locks are never removed.');
}
function ancestors(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Puzzle source inventory escapes its panel.');
  let current = path.dirname(file);
  while (current !== root) { ordinary(current, true); current = path.dirname(current); }
}
function addFile(files, file) { ordinary(file); files.push({ file, sha256: hash(fs.readFileSync(file)) }); }
function addLocks(files, root) { inactive(root); for (const name of LOCKS) files.push({ file: path.join(root, name), absent: true }); }
function identityMatches(manifest, overlay) {
  const inventory = new Map(overlay.manifest.files.map(row => [row.file, row.sha256]));
  if (manifest.identity?.rulesBundleSha256 !== inventory.get('dist/balance-rules.cjs')
    || !Array.isArray(manifest.identity.runnerSources)
    || hash(JSON.stringify(manifest.identity.runnerSources)) !== manifest.identity.runnerSha256) throw new Error('Puzzle source runtime inventory differs from its panel identity.');
  for (const row of manifest.identity.runnerSources) if (inventory.get(path.posix.normalize(`scripts/balance/${row.file}`)) !== row.sha256) throw new Error('Puzzle source runner sources changed.');
}
function contextFor(input, stage, cohort) {
  return { key: `${input.manifest.runId}:${stage.key}`, profile: stage.profile, records: stage.records,
    rulesFactory: require(path.join(input.overlay.directory, 'dist/balance-rules.cjs')).createMatchRules,
    identity: { runId: input.manifest.runId, sourceRunId: input.manifest.runId, stageKey: stage.key,
      study: input.manifest.study, cohort, engineSha256: input.manifest.identity.engineSha256,
      rulesBundleSha256: input.manifest.identity.rulesBundleSha256,
      profileHash: stage.profile.hash, registryHash: stage.profile.registryHash },
    journal: path.join(input.root, stage.key, 'games.jsonl') };
}
function uniqueFiles(files) {
  const result = new Map();
  for (const row of files) {
    if (result.has(row.file) && !isDeepStrictEqual(result.get(row.file), row)) throw new Error('Conflicting puzzle source file inventory.');
    result.set(row.file, row);
  }
  return [...result.values()].sort((a, b) => a.file.localeCompare(b.file));
}
function original(directory) {
  const input = material.loadPanel(directory);
  if (input.manifest.format !== 'levelup-v19-tier-panels-004') throw new Error('Puzzle generation supports original roster-004 or expanded roster-005 panels.');
  const files = [...input.files];
  addLocks(files, input.root);
  for (const descriptor of input.manifest.stages) {
    const root = path.join(input.root, descriptor.directory);
    if (fs.existsSync(root)) { ordinary(root, true); addLocks(files, root); }
  }
  return { ...input, files, contexts: input.stages.map(stage => contextFor(input, stage, 'original-004')),
    overlays: [input.overlay], reused: [] };
}
function expanded(root, owner, overlay) {
  const owned = file => require(path.join(overlay.directory, file));
  const entry = owned('scripts/v19-expanded-panels.js');
  entry.requireExpandedOverlay(overlay);
  const controller = owned('scripts/v19-panels.js'), manifest = json(path.join(root, 'screen.json'));
  const state = json(path.join(root, 'panel-state.json'));
  if (manifest.study !== owner.study || manifest.jobs !== owner.jobs || manifest.initialOpenings !== owner.initialOpenings
    || state.runId !== manifest.runId || !controller.TARGETS.includes(state.targetOpenings)) throw new Error('Puzzle source ownership, study or target state changed.');
  const requestFile = path.join(root, entry.REQUEST), request = json(requestFile);
  if (request.schemaVersion !== 1 || request.format !== 'levelup-v19-expanded-request'
    || request.study !== manifest.study || !['reuse', 'fresh'].includes(request.mode)
    || (request.mode === 'fresh' ? request.sourceRoot !== null : typeof request.sourceRoot !== 'string'
      || !(path.isAbsolute(request.sourceRoot) || path.win32.isAbsolute(request.sourceRoot)))) throw new Error('Invalid expanded puzzle source request receipt.');
  const reuseTools = owned('scripts/balance/v19-expanded-reuse.js');
  const evidence = path.join(root, entry.EVIDENCE);
  const reuse = request.mode === 'reuse' ? reuseTools.readReuse(evidence,
    { study: manifest.study, targetOpenings: state.targetOpenings, expectedEngineSha256: manifest.identity?.engineSha256 }) : undefined;
  const plan = owned('scripts/balance/v19-panel-expanded-plan.js').createExpandedPlan(reuse);
  controller.validateManifest(manifest, plan, owner.manifestSha256, null);
  controller.validateRoot(root, manifest, plan); identityMatches(manifest, overlay);
  const files = [], contexts = [], sourceStages = [], overlays = [overlay], reused = [];
  addLocks(files, root);
  for (const name of ['panel-runtime.json', 'screen.json', 'panel-state.json', entry.REQUEST]) addFile(files, path.join(root, name));
  if (reuse) {
    const old = reuse.input;
    // Private evidence is authoritative; the original path is only provenance
    // and may no longer exist. Every old game retains its original profile.
    contexts.push(...old.stages.map(stage => contextFor(old, stage, 'reused-004')));
    files.push(...old.files);
    for (const item of reuse.receipt.files) files.push({ file: path.join(evidence, item.file), sha256: item.sha256 });
    addFile(files, path.join(evidence, reuseTools.RECEIPT));
    overlays.push(old.overlay); reused.push({ evidence, tools: reuseTools, identity: reuse.identity });
  }
  const read = owned('scripts/version17-balance.js').readReportInput;
  const compile = owned('scripts/balance/design-profile.js').compileDesignProfile;
  for (const descriptor of plan.selectedStages(state.targetOpenings, manifest)) {
    const stageRoot = path.join(root, descriptor.directory);
    if (!fs.existsSync(stageRoot)) { files.push({ file: stageRoot, absent: true }); continue; }
    ordinary(stageRoot, true); addLocks(files, stageRoot);
    const runFile = path.join(stageRoot, 'run.json');
    if (!fs.existsSync(runFile)) { files.push({ file: runFile, absent: true }); continue; }
    const declaration = plan.getBatchDeclaration(manifest.study, descriptor.batchIndex, descriptor.nodes);
    for (const name of ['run.json', 'v17-preflight.json', 'games.jsonl']) if (fs.existsSync(path.join(stageRoot, name))) ordinary(path.join(stageRoot, name));
    const input = read(stageRoot, declaration);
    for (const field of ['engineSha256', 'runnerSha256', 'runnerSources', 'rulesBundleSha256']) if (!isDeepStrictEqual(input.manifest[field], manifest.identity[field])) throw new Error('An expanded puzzle source stage changed runtime identity.');
    const profile = material.restorePanelProfile(input.manifest, compile);
    for (const name of ['run.json', 'v17-preflight.json', input.manifest.rulesProfiles[0].file]) addFile(files, path.join(stageRoot, name));
    if (fs.existsSync(path.join(stageRoot, 'games.jsonl'))) addFile(files, path.join(stageRoot, 'games.jsonl'));
    else files.push({ file: path.join(stageRoot, 'games.jsonl'), absent: true });
    sourceStages.push({ ...descriptor, manifest: input.manifest, records: input.records, source: input.source });
    contexts.push(contextFor({ root, overlay, manifest }, { key: descriptor.id, profile, records: input.records }, 'expanded-005'));
  }
  plan.reportStudy({ ...manifest, targetOpenings: state.targetOpenings }, sourceStages);
  return { root, overlay, manifest, state, files, contexts, overlays, reused };
}

function loadPuzzleSources(directory) {
  const root = path.resolve(directory); ordinary(root, true); inactive(root);
  const owner = json(path.join(root, 'panel-runtime.json'));
  if (owner.schemaVersion !== 1 || owner.format !== 'levelup-v19-panel-runtime-owner'
    || !['level1', 'level2', 'level3'].includes(owner.study) || !/^runtime\/[a-z0-9-]+$/.test(owner.directory || '')
    || !/^[a-f0-9]{64}$/.test(owner.manifestSha256 || '')) throw new Error('Puzzle generation needs an intact owned version-19 panel folder.');
  ancestors(root, path.join(root, owner.directory, '.research-overlay.json'));
  const overlay = openResearchOverlay({ directory: path.join(root, owner.directory), manifestSha256: owner.manifestSha256 });
  let input;
  if (overlay.manifest.name === 'tier-panels-v19' && overlay.manifest.entryFile === 'scripts/v19-panels.js') input = original(root);
  else if (overlay.manifest.name === 'expanded-tier-panels-v19' && overlay.manifest.entryFile === 'scripts/v19-expanded-panels.js') input = expanded(root, owner, overlay);
  else throw new Error('This puzzle source belongs to an unsupported experiment.');
  const files = uniqueFiles(input.files);
  for (const row of files) { ancestors(root, row.file); if (!row.absent) ordinary(row.file); }
  function verify() {
    inactive(root);
    for (const row of files) ancestors(root, row.file);
    material.verifySource(files);
    for (const snapshot of input.overlays) openResearchOverlay({ directory: snapshot.directory, manifestSha256: snapshot.manifestSha256 });
    for (const old of input.reused) {
      const check = old.tools.readReuse(old.evidence);
      if (!isDeepStrictEqual(check.identity, old.identity)) throw new Error('Copied puzzle source identity changed.');
    }
    return true;
  }
  verify();
  return { root, manifest: input.manifest, state: input.state, contexts: input.contexts, files, verify };
}

module.exports = { loadPuzzleSources, inactive };
