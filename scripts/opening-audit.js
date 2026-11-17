#!/usr/bin/env node
'use strict';

// Read recorded definitions as data. Never load a completed run's JavaScript,
// rewrite its journals, select a new opening book or score another match.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { isDeepStrictEqual } = require('node:util');
const ROOT = path.resolve(__dirname, '..');
const FORMAT = 'levelup-opening-audit-report';
const HELP = `Completed-game opening diagnostic\n\n  npm.cmd run balance:opening-audit -- --run DIRECTORY --out NEW_DIRECTORY\n  npm.cmd run balance:opening-audit -- --archive v18-queen32-001 --out NEW_DIRECTORY\n  Add --evaluate [--engine PATH] [--nodes 10000] for fresh native searches.\n\nThe default replays forced prefixes and inspects checks, royal-shield pins and\nlegal capture/recapture candidates without native searches. Output must be a\nnew empty directory outside every input directory. All source files remain\nunchanged. Evaluations are diagnostics, not opening selection or material values.\n`;
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function fail(message) { throw new Error(`Opening audit: ${message}`); }
function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index]?.slice(2);
    if (!args[index]?.startsWith('--') || !['run', 'archive', 'out', 'evaluate', 'engine', 'nodes'].includes(key)
      || Object.hasOwn(options, key)) fail(`unknown or repeated option ${args[index]}.`);
    if (key === 'evaluate') { options.evaluate = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) fail(`--${key} requires a value.`);
    options[key] = value;
  }
  if (Number(Boolean(options.run)) + Number(Boolean(options.archive)) !== 1 || !options.out) fail('choose --run or --archive and provide --out.');
  if (!options.evaluate && (options.engine || options.nodes)) fail('--engine and --nodes require --evaluate.');
  if (options.nodes !== undefined && (!/^\d+$/.test(options.nodes) || !Number.isSafeInteger(Number(options.nodes)) || Number(options.nodes) < 1 || Number(options.nodes) > 100000000)) fail('--nodes must be an integer from 1 to 100000000.');
  options.nodes = Number(options.nodes || 10000);
  if (options.archive && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(options.archive)) fail('archive must be a simple local evidence prefix.');
  return options;
}
function regular(file, directory = false) {
  const absolute = path.resolve(file), parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(`symbolic input/output path is unsupported: ${cursor}.`);
  }
  const stat = fs.lstatSync(absolute);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail(`expected an ordinary ${directory ? 'directory' : 'file'}: ${absolute}.`);
  return absolute;
}
function readBytes(file) { return fs.readFileSync(regular(file)); }
function readJson(file) { return JSON.parse(readBytes(file).toString('utf8')); }
function journal(bytes, name) {
  if (!bytes.length) return [];
  if (bytes.at(-1) !== 10) fail(`journal has an incomplete final line: ${name}.`);
  return bytes.toString('utf8').trimEnd().split('\n').filter(Boolean).map(line => JSON.parse(line));
}
function hydrateProfile(input, registry, evaluation) {
  if (!input || typeof input.config !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(input.variant || '')
    || !registry || registry.schemaVersion !== 1 || !Array.isArray(registry.definitions) || !Array.isArray(registry.allocations)) fail('a recorded dynamic design profile and registry are required.');
  const payload = { schemaVersion: registry.schemaVersion, definitions: registry.definitions, allocations: registry.allocations };
  if (registry.hash !== sha(JSON.stringify(payload))) fail('recorded registry hash differs from its contents.');
  if (input.registryHash !== registry.hash || input.hash !== sha(JSON.stringify({ config: input.config, registry }))) fail('recorded profile hash differs from its config/registry.');
  if (input.registry && !isDeepStrictEqual(input.registry, registry)) fail('profile and manifest registries disagree.');
  const definitions = new Map(registry.definitions.map(definition => [definition.id, definition]));
  if (definitions.size !== registry.definitions.length || registry.allocations.length !== definitions.size) fail('registry definitions/allocations are not unique.');
  const letters = new Set(), slots = new Set(), allocatedIds = new Set();
  const definitionsByLetter = {};
  for (const allocation of registry.allocations) {
    if (!definitions.has(allocation.id) || allocatedIds.has(allocation.id) || !/^[a-z]$/.test(allocation.letter) || 'pnbrqk'.includes(allocation.letter)
      || letters.has(allocation.letter) || !Number.isSafeInteger(allocation.slot) || allocation.slot < 1 || allocation.slot > 25 || slots.has(allocation.slot)) fail('invalid recorded custom-piece allocation.');
    letters.add(allocation.letter); slots.add(allocation.slot); allocatedIds.add(allocation.id);
    const definition = definitions.get(allocation.id);
    const declaration = new RegExp(`^customPiece${allocation.slot}\\s*=\\s*${allocation.letter}:([^\\r\\n]+)$`, 'm').exec(input.config);
    if (!declaration || declaration[1].trim() !== definition.movement || !definition.roles) fail('recorded INI movement differs from its semantic definition.');
    definitionsByLetter[allocation.letter] = definition;
  }
  const types = key => ['p', ...registry.allocations.filter(row => definitions.get(row.id).roles[key]).map(row => row.letter).sort()];
  const roles = { pawnTypes: types('pawn'), enPassantTypes: types('enPassant'),
    castlingRooks: ['r', ...registry.allocations.filter(row => definitions.get(row.id).roles.castlingRook).map(row => row.letter).sort()],
    royalTypes: ['k'], initialPawnLeaps: { p: 2 }, initialLandingLeaps: {} };
  const reserve = registry.allocations.filter(row => definitions.get(row.id).placement === 'reserve').map(row => row.letter).sort();
  if (reserve.length) roles.reserveTypes = reserve;
  for (const [letter, definition] of Object.entries(definitionsByLetter)) {
    if (definition.roles.pawn) {
      if (definition.movement.includes('ifmH')) roles.initialPawnLeaps[letter] = 3;
      else if (definition.movement.includes('ifmnD')) roles.initialPawnLeaps[letter] = 2;
    }
    const leaps = [['imN', 12], ['imC', 13], ['imZ', 23]].filter(([code]) => definition.movement.includes(code)).map(([, distance]) => distance);
    if (leaps.length) roles.initialLandingLeaps[letter] = leaps;
  }
  if (input.roles && !isDeepStrictEqual(input.roles, roles)) fail('recorded profile roles differ from registry semantics.');
  if (input.definitionsByLetter && !isDeepStrictEqual(input.definitionsByLetter, definitionsByLetter)) fail('recorded letter meanings differ from registry semantics.');
  if (input.evaluation !== undefined && !isDeepStrictEqual(input.evaluation, evaluation)) fail('recorded profile evaluation differs from manifest.');
  return { ...clone(input), registry: clone(registry), roles, definitionsByLetter,
    capabilityProbes: input.capabilityProbes || [], ...(evaluation ? { evaluation: clone(evaluation) } : {}) };
}
function sourceManifest(manifest) {
  const value = clone(manifest);
  value.designProfile = hydrateProfile(value.designProfile, value.designRegistry, value.config?.evaluation);
  return value;
}
function loadRun(directory) {
  const root = regular(directory, true), metadata = [], sources = [];
  const readStage = stageDir => {
    const manifestFile = path.join(stageDir, 'run.json'), journalFile = path.join(stageDir, 'games.jsonl');
    const manifestBytes = readBytes(manifestFile), bytes = readBytes(journalFile);
    sources.push({ id: stageDir, manifest: sourceManifest(JSON.parse(manifestBytes.toString('utf8'))), records: journal(bytes, journalFile) });
    metadata.push({ directory: stageDir, manifestSha256: sha(manifestBytes), journalSha256: sha(bytes), originalEngineSha256: sources.at(-1).manifest.engineSha256 || null });
  };
  if (fs.existsSync(path.join(root, 'screen.json'))) {
    const screen = readJson(path.join(root, 'screen.json'));
    if (!Array.isArray(screen.stages)) fail('screen manifest has no stage list.');
    const seen = new Set();
    for (const stage of screen.stages) {
      if (typeof stage.directory !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(stage.directory) || seen.has(stage.directory)) fail('invalid or repeated screen stage directory.');
      seen.add(stage.directory);
      const stageDir = path.join(root, stage.directory);
      if (!fs.existsSync(stageDir)) continue;
      regular(stageDir, true);
      if (fs.existsSync(path.join(stageDir, 'run.json'))) readStage(stageDir);
    }
  } else readStage(root);
  if (!sources.length) fail('no started dynamic stages were found.');
  return { sources, inputDirectories: [root], provenance: { kind: 'recorded run manifests and aggregate stage journals', root, stages: metadata } };
}
function pinned(directory, pin) {
  if (!pin || typeof pin.archiveFile !== 'string' || path.basename(pin.archiveFile) !== pin.archiveFile || !/^[a-f0-9]{64}$/.test(pin.archivedSha256 || '') || !/^[a-f0-9]{64}$/.test(pin.sha256 || '')) fail('invalid archive pin.');
  const bytes = readBytes(path.join(directory, pin.archiveFile));
  if (sha(bytes) !== pin.archivedSha256) fail(`archive hash changed: ${pin.archiveFile}.`);
  const original = gunzipSync(bytes);
  if (original.length !== pin.bytes || sha(original) !== pin.sha256) fail(`original upload changed: ${pin.archiveFile}.`);
  return original;
}
function loadArchive(prefix, directory = path.join(ROOT, 'experiments/balance/results')) {
  const root = regular(directory, true), file = path.join(root, `${prefix}.sources.json`), sourceBytes = readBytes(file), pins = JSON.parse(sourceBytes.toString('utf8'));
  const descriptors = JSON.parse(pinned(root, pins.declarations).toString('utf8'));
  if (!Array.isArray(descriptors.stages) || !pins.studies || typeof pins.studies !== 'object') fail('archive lacks declaration stages or journals.');
  const sources = [], seen = new Set();
  for (const [study, source] of Object.entries(pins.studies)) for (const pin of source.journals || []) {
    const descriptor = descriptors.stages.find(row => row.study === study && row.nodes === pin.nodes && row.batchIndex === pin.batchIndex);
    const key = `${study}:${pin.nodes}:${pin.batchIndex}`;
    if (!descriptor || seen.has(key)) fail('archive journal has an unknown or repeated stage.');
    seen.add(key);
    sources.push({ id: `${prefix}:${key}`, manifest: sourceManifest(descriptor.manifest), records: journal(pinned(root, pin), pin.archiveFile) });
  }
  if (!sources.length || sources.length !== descriptors.stages.length) fail('archive is missing journal stages.');
  return { sources, inputDirectories: [root], provenance: { kind: 'pinned uploads and reconstructed compatibility descriptors', prefix,
    sourcesSha256: sha(sourceBytes.toString('utf8').replace(/\r\n/g, '\n')), baseTag: descriptors.baseTag || null,
    originalManifestsSupplied: false, engineBinaryAttested: false } };
}
function inside(parent, child) { const relative = path.relative(parent, child); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); }
function prepareOutput(directory, inputDirectories) {
  const target = path.resolve(directory);
  if (inputDirectories.some(input => inside(input, target) || inside(target, input))) fail('output must be outside every input directory.');
  let existing = target;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  regular(existing, true);
  if (fs.existsSync(target)) {
    regular(target, true);
    if (fs.readdirSync(target).length) fail('output directory must be new or empty.');
  }
  return target;
}
async function createEvaluator(enginePath, { Engine = require('./balance/uci').UciEngine } = {}) {
  const executable = path.resolve(enginePath), identity = sha(fs.readFileSync(executable));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-opening-eval-'));
  const metadata = { enginePath: executable, engineSha256: identity, nodes: null, threads: 1, hashMb: 32, skill: 20, profiles: [] };
  let engine, profileKey;
  try {
    return {
      metadata, identity,
      async evaluate({ profile, fen, nodes, signal }) {
        if (profile.hash !== profileKey) {
          await engine?.close(); engine = null;
          const variantPath = path.join(directory, 'profile.ini'); fs.writeFileSync(variantPath, profile.config);
          engine = new Engine({ path: executable, variantPath, variant: profile.variant, options: { skill: 20, threads: 1, hash: 32 } });
          const native = await engine.start({ signal });
          if (profile.evaluation?.pieceValues) {
            const tables = await engine.pieceValues({ signal });
            if (tables?.version !== 1) fail('native engine lacks the supported manual-value diagnostic.');
            for (const [id, expected] of Object.entries(profile.evaluation.pieceValues)) {
              const allocation = profile.registry.allocations.find(row => row.id === id);
              if (!allocation) fail(`manual value has no allocated piece: ${id}.`);
              for (const letter of [allocation.letter, allocation.letter.toUpperCase()]) for (const field of ['rawMg', 'captureMg', 'evalMg', 'rawEg', 'captureEg', 'evalEg']) {
                if (tables.pieces?.[letter]?.[field] !== (field.endsWith('Mg') ? expected.mg : expected.eg)) fail(`native manual value mismatch: ${id} ${letter} ${field}.`);
              }
            }
          }
          profileKey = profile.hash;
          metadata.profiles.push({ profileHash: profile.hash, variant: profile.variant, engineName: native?.idname || engine.metadata?.idname || null, manualValuesVerified: Boolean(profile.evaluation?.pieceValues) });
        }
        metadata.nodes = nodes;
        await engine.newGame({ signal });
        return engine.search({ fen, nodes, signal });
      },
      async close() { try { await engine?.close(); } finally { fs.rmSync(directory, { recursive: true, force: true }); } },
    };
  } catch (error) { await engine?.close(); fs.rmSync(directory, { recursive: true, force: true }); throw error; }
}
function renderReport(report) {
  const audit = report.audit, rows = audit.positions || [];
  const counts = audit.counts || {};
  const captures = rows.filter(row => row.events?.captures?.length);
  const changed = rows.filter(row => row.upgradedPieces?.some(piece => ['captured', 'promoted'].includes(piece.status)));
  const pins = rows.filter(row => row.tactics?.after?.upgradedPieces?.some(piece => piece.royalShieldPin?.exposesCheck));
  const threats = rows.filter(row => row.tactics?.after?.upgradedPieces?.some(piece => piece.captureThreats?.length));
  const exposed = rows.filter(row => row.tactics?.after?.upgradedPieces?.some(piece => piece.captureThreats?.some(threat => threat.unrecapturedCandidate)));
  const inspectedPieces = row => row.tactics?.after?.pieces || row.tactics?.after?.upgradedPieces || [];
  const allPins = rows.filter(row => inspectedPieces(row).some(piece => piece.royalShieldPin?.exposesCheck));
  const allThreats = rows.filter(row => inspectedPieces(row).some(piece => piece.captureThreats?.length));
  const allExposed = rows.filter(row => inspectedPieces(row).some(piece => piece.captureThreats?.some(threat => threat.unrecapturedCandidate)));
  const unavailable = rows.filter(row => !row.tactics?.after || !Array.isArray(row.tactics.after.pieces));
  const flagged = rows.filter(row => row.events?.captures?.length || row.events?.promotions?.length || row.events?.drops?.length
    || row.endInCheck || row.terminalAfter || inspectedPieces(row).some(piece => piece.royalShieldPin?.exposesCheck || piece.captureThreats?.length));
  const fmtScore = value => {
    const score = value?.scoreWhite || value?.whiteScore || value?.score;
    return score ? score.type === 'cp' ? `${score.value} cp${score.bound ? ` (${score.bound})` : ''}` : `mate ${score.value}${score.bound ? ` (${score.bound})` : ''}` : 'unavailable';
  };
  return ['# Completed-game opening audit', '',
    `${counts.inputAttempts ?? 0} recorded attempts; ${counts.eligibleGames ?? 0} eligible latest games; ${rows.length} distinct comparison/opening/color positions. Only forced prefixes were replayed.`, '',
    '| Diagnostic after the prefix | Positions flagged |', '| --- | ---: |',
    `| Prefix captures | ${captures.length} |`, `| Upgraded pieces captured or promoted during prefix | ${changed.length} |`,
    `| Royal-shield pin candidates, any piece | ${allPins.length} |`,
    `| Legal or hypothetical capture threats, any piece | ${allThreats.length} |`,
    `| Capture candidates without immediate recapture, any piece | ${allExposed.length} |`,
    `| Royal-shield pin candidates, upgrades only | ${pins.length} |`, `| Legal or hypothetical capture threats against upgrades | ${threats.length} |`,
    `| Capture candidates without an immediate legal recapture | ${exposed.length} |`,
    `| Positions without available tactical inspection | ${unavailable.length} |`, '',
    ...(flagged.length ? ['| Flagged comparison / opening / A color | Prefix events | After-prefix piece flags |', '| --- | --- | --- |',
      ...flagged.map(row => {
        const events = ['captures', 'promotions', 'drops'].filter(kind => row.events?.[kind]?.length).map(kind => `${kind}: ${row.events[kind].length}`);
        const flags = inspectedPieces(row).flatMap(piece => [
          ...(piece.royalShieldPin?.exposesCheck ? [`${piece.designId || piece.letter}@${piece.square}: royal shield`] : []),
          ...(piece.captureThreats?.length ? [`${piece.designId || piece.letter}@${piece.square}: ${piece.captureThreats.map(threat => threat.move + (threat.actualTurn ? ' [current turn]' : ' [hypothetical turn]')).join(', ')}`] : []),
        ]);
        if (row.endInCheck) flags.push('side to move is in check');
        if (row.terminalAfter) flags.push('terminal prefix position');
        return `| ${row.comparisonId} / ${row.openingId} / ${row.aColor} | ${events.join('; ') || 'none'} | ${flags.join('; ') || 'none'} |`;
      }), ''] : []),
    'Capture threats from the side not to move are hypothetical and allow no intervening reply. An attacked piece or an unrecaptured capture candidate is not proof of a forced material loss. Royal-shield pins mean removing that piece exposes its king; some moves along the pin may remain legal. Exact diagnostic details and limitations are retained in JSON.', '',
    report.engine ? `Fresh native evaluation: ${report.engine.nodes} nodes, Skill 20, one thread, 32 MiB hash. Scores below are White POV; mate scores and bounds remain separate. Fresh engine identity: ${report.engine.engineSha256}.` : 'Native evaluation was not requested; this report contains no engine searches.', '',
    ...(report.engine ? ['| Comparison / opening / A color | Before | After | Change (White cp) |', '| --- | ---: | ---: | ---: |',
      ...rows.map(row => `| ${row.comparisonId} / ${row.openingId} / ${row.aColor} | ${fmtScore(row.evaluation?.before)} | ${fmtScore(row.evaluation?.after)} | ${row.evaluation?.deltaCpWhite ?? 'unavailable'} |`), ''] : []),
    'This diagnostic does not choose, exclude or rank openings for a new book. Matchup-specific near-zero selection would condition on the tested upgrade and change the opening distribution between cells. More games do not remove that selection bias. Keep a shared diverse book and use these results for explicit review.', '',
    'Input manifests, journals and archived evidence were not modified. The report makes no new match result, piece Elo or material-value claim.', ''].join('\n');
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args), log = dependencies.log || console.log;
  if (options.help) { log(HELP); return; }
  const input = options.run ? (dependencies.loadRun || loadRun)(options.run) : (dependencies.loadArchive || loadArchive)(options.archive);
  const out = prepareOutput(options.out, input.inputDirectories);
  const controller = new AbortController(), signals = dependencies.signals || process;
  const cancel = () => controller.abort(); signals.once('SIGINT', cancel);
  let evaluator;
  const inspectors = new Map();
  try {
    if (options.evaluate) {
      const enginePath = options.engine || dependencies.enginePath || process.env.FAIRY_STOCKFISH_PATH || (process.platform === 'win32' ? path.join(ROOT, 'stockfish/fairy-stockfish-levelup_x86-64.exe') : null);
      if (!enginePath) fail('set FAIRY_STOCKFISH_PATH or --engine for native evaluation.');
      evaluator = await (dependencies.createEvaluator || createEvaluator)(enginePath);
    }
    const inspect = async ({ profile, fen, signal }) => {
      if (signal?.aborted) throw new Error('Opening audit cancelled.');
      let inspector = inspectors.get(profile.hash);
      if (!inspector) {
        if (inspectors.size >= 2) { const [oldKey, old] = inspectors.entries().next().value; await old.close?.(); inspectors.delete(oldKey); }
        inspector = await (dependencies.createInspector || require('./balance/opening-threats').createOpeningInspector)(profile);
        inspectors.set(profile.hash, inspector);
      }
      return inspector.inspect(fen, { signal });
    };
    const audit = await (dependencies.auditGames || require('./balance/opening-audit').auditGames)(input.sources, {
      nodes: options.nodes, signal: controller.signal, onProgress: value => log(typeof value === 'string' ? value : JSON.stringify(value)),
      inspectPosition: inspect,
      ...(evaluator ? { evaluate: request => evaluator.evaluate(request), evaluationIdentity: evaluator.identity } : {}),
    });
    const originalEngines = [...new Set(input.sources.map(source => source.manifest.engineSha256).filter(Boolean))];
    const report = { schemaVersion: 1, format: FORMAT, createdAt: new Date().toISOString(), input: input.provenance,
      originalEngineSha256: originalEngines, engine: evaluator ? { ...evaluator.metadata,
        matchesRecordedEngine: originalEngines.length ? originalEngines.every(hash => hash === evaluator.identity) : null } : null, audit };
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'opening-audit.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(out, 'opening-audit.md'), renderReport(report), { flag: 'wx' });
    log(`Opening audit written: ${path.join(out, 'opening-audit.md')}`);
    return report;
  } finally {
    signals.removeListener('SIGINT', cancel);
    try { await evaluator?.close(); } finally { for (const inspector of inspectors.values()) await inspector.close?.(); }
  }
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { ROOT, FORMAT, HELP, parseArgs, hydrateProfile, sourceManifest, loadRun, loadArchive, prepareOutput, createEvaluator, renderReport, main };
