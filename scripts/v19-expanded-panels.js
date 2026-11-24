#!/usr/bin/env node
'use strict';

// This entry owns an expanded roster snapshot. Original panel folders keep
// their original command, roster and reporting identity.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const panels = require('./v19-panels');
const { ensureResearchOverlay, openResearchOverlay } = require('./balance/research-overlay');
const ROOT = path.resolve(__dirname, '..');
// The five alternatives are already public playable definitions. Pin an empty
// extension marker instead of registering them again in the owned snapshot.
const OVERLAY = Object.freeze({ name: 'expanded-tier-panels-v19', entryFile: 'scripts/v19-expanded-panels.js',
  definitionFile: 'src/balance-designs-v19-panels.js' });
const REQUEST = 'runtime/expanded-request.json';
const EVIDENCE = 'runtime/reuse-source';
const HELP = `Version 19 expanded same-tier panels, immutable roster 005

  npm.cmd run balance:v19:expanded -- --tier 1 --reuse ORIGINAL_PANEL --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:expanded -- --tier 2 --reuse ORIGINAL_PANEL --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:expanded -- --tier 3 --reuse ORIGINAL_PANEL --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:expanded -- --tier N --fresh --out DIRECTORY [--openings 8]
  npm.cmd run balance:v19:expanded -- --tier N --resume DIRECTORY [--openings 16]
  npm.cmd run balance:v19:expanded -- --tier N --report DIRECTORY
  npm.cmd run balance:v19:expanded -- --tier N --check [--openings 64] [--rules-only]

Retain every roster-004 body and add BD at L1; NfhZ, RcsNcfN and QsDsNA at
L2; QsHsCsZG at L3. The expanded panels have 12 / 15 / 13 bodies. With reuse,
eight openings schedule only 176 / 624 / 192 new games (992 total).
Original roster-004 results keep their own profiles and IDs in private copied
evidence; only pairs involving new alternatives are collected. The combined
matrix labels historical-004 and new-005 contexts separately. It is not a
single uniform engine context or material fit. Missing old pairs stay unscored.
Explicit --fresh instead collects 1,056 / 1,680 / 1,248 games at eight openings.
Each army buys one same-tier upgrade. Every matchup keeps both physical
colors; fixed-reference scores remain separate from whole-roster scores.

40k nodes, Skill 20, one thread, 32 MiB hash; four workers default. Run one
panel at a time. Targets 8/16/32/64 are TOTAL openings. Completed eight-case
batches are verified and retained; extensions never start automatically.
Use new folders. --reuse requires an inactive original roster-004 tier panel,
its manifests, runtime and journals, using the same executable and rules.
Resume/report use the copied evidence without the original source path.
Earlier panel or focused-study directories cannot resume as expanded panels.

Reports refresh at batch boundaries and include the first normal post-opening
engine evaluation. --report is offline; --check starts no games. Keep each
whole run folder, including its owned runtime. q/Ctrl+C stops now; g finishes
active games; p finishes active color pairs. --engine PATH or
FAIRY_STOCKFISH_PATH selects the executable; Windows uses the bundled engine.
`;

function parseArgs(args) {
  const mapped = []; let reuse, fresh = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reuse') {
      if (reuse !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--reuse requires one original panel directory.');
      reuse = args[++i];
    } else if (args[i] === '--fresh') {
      if (fresh) throw new Error('Repeated --fresh option.'); fresh = true;
    } else mapped.push(args[i]);
  }
  if (reuse && fresh) throw new Error('Choose --reuse SOURCE or --fresh, not both.');
  if ((mapped.includes('--out') || mapped.includes('--check')) && !mapped.includes('--openings')) mapped.push('--openings', '8');
  const options = panels.parseArgs(mapped);
  if (options.help) return { ...options, mapped };
  if (options.out && !reuse && !fresh) throw new Error('Use --reuse ORIGINAL_PANEL to retain completed games, or explicit --fresh for a full new panel.');
  if (options.report && (reuse || fresh)) throw new Error('Offline reports use their recorded reuse/fresh context; omit --reuse and --fresh.');
  return { ...options, mapped, reuse, fresh };
}
function requireExpandedOverlay(overlay) {
  if (!overlay || overlay.manifest?.name !== OVERLAY.name || overlay.manifest?.entryFile !== OVERLAY.entryFile
    || overlay.manifest?.definitionFile !== OVERLAY.definitionFile
    || overlay.entry !== path.join(overlay.directory, OVERLAY.entryFile)) {
    throw new Error('This directory belongs to a different owned runtime; use its original panel/trial command.');
  }
  return overlay;
}
async function runStudy(args, dependencies = {}) {
  const options = parseArgs(args), reuseTools = require('./balance/v19-expanded-reuse');
  const expanded = require('./balance/v19-panel-expanded-plan');
  const identify = dependencies.identity || require('./balance/run').getRunIdentity;
  const engineSha = dependencies.enginePath ? identify(dependencies.enginePath).engineSha256 : undefined;
  let temporary, reuse;
  try {
    if (options.check) {
      if (options.reuse) {
        temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-expanded-check-'));
        reuse = await (dependencies.prepareReuse || reuseTools.prepareReuse)({ sourceRoot: options.reuse,
          evidenceRoot: path.join(temporary, 'reuse-source'), study: options.study,
          targetOpenings: options.openings, expectedEngineSha256: engineSha });
      }
    } else {
      const root = path.resolve(options.out || options.resume || options.report), file = path.join(root, REQUEST);
      let request;
      if (fs.existsSync(file)) {
        if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Invalid expanded setup receipt.');
        request = JSON.parse(fs.readFileSync(file, 'utf8'));
      } else {
        if (options.report || fs.existsSync(path.join(root, panels.MANIFEST))) throw new Error('Missing expanded setup receipt; preserve the run folder.');
        if (!options.reuse && !options.fresh) throw new Error('Setup did not record a source yet. Resume with the original --reuse SOURCE or --fresh; no games started.');
        request = { schemaVersion: 1, format: 'levelup-v19-expanded-request', study: options.study,
          mode: options.reuse ? 'reuse' : 'fresh', sourceRoot: options.reuse ? path.resolve(options.reuse) : null };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(request, null, 2) + '\n', { flag: 'wx' });
      }
      if (request.schemaVersion !== 1 || request.format !== 'levelup-v19-expanded-request' || request.study !== options.study
        || !['reuse', 'fresh'].includes(request.mode)
        || (request.mode === 'reuse' ? typeof request.sourceRoot !== 'string' || !(path.isAbsolute(request.sourceRoot) || path.win32.isAbsolute(request.sourceRoot)) : request.sourceRoot !== null)
        || options.reuse && (request.mode !== 'reuse' || path.resolve(options.reuse) !== request.sourceRoot)
        || options.fresh && request.mode !== 'fresh') throw new Error('The recorded expanded source or collection mode changed.');
      if (request.mode === 'reuse') {
        let state;
        if (fs.existsSync(path.join(root, panels.STATE))) state = JSON.parse(fs.readFileSync(path.join(root, panels.STATE), 'utf8'));
        const target = options.openings || state?.targetOpenings || dependencies.initialOpenings;
        const evidenceRoot = path.join(root, EVIDENCE);
        if (fs.existsSync(evidenceRoot)) reuse = (dependencies.readReuse || reuseTools.readReuse)(evidenceRoot,
          { study: options.study, targetOpenings: target, expectedEngineSha256: engineSha });
        else {
          if (options.report || fs.existsSync(path.join(root, panels.MANIFEST))) throw new Error('Missing copied source evidence; preserve this expanded run.');
          reuse = await (dependencies.prepareReuse || reuseTools.prepareReuse)({ sourceRoot: request.sourceRoot,
            evidenceRoot, study: options.study, targetOpenings: target, expectedEngineSha256: engineSha });
        }
      }
    }
    return await panels.runStudy(options.mapped, { ...dependencies,
      planTools: dependencies.planTools || expanded.createExpandedPlan(reuse) });
  } finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args), log = dependencies.log || console.log;
  if (options.help) { log(HELP); return; }
  if (options.out && options.reuse) {
    const source = fs.realpathSync(path.resolve(options.reuse)), out = path.resolve(options.out);
    let ancestor = out; while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const canonical = path.join(fs.realpathSync(ancestor), path.relative(ancestor, out));
    const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
    if (inside(source, canonical) || inside(canonical, source)) throw new Error('The expanded output must be outside and separate from the original source panel.');
  }
  let overlay;
  const ensure = dependencies.ensure || ensureResearchOverlay, open = dependencies.open || openResearchOverlay;
  return panels.main(options.mapped, { sourceRoot: dependencies.sourceRoot || ROOT, enginePath: dependencies.enginePath, log,
    ensure(settings) { overlay = requireExpandedOverlay(ensure({ ...settings, ...OVERLAY })); return overlay; },
    open(settings) { overlay = requireExpandedOverlay(open(settings)); return overlay; },
    execute(mapped, settings) {
      if (!overlay) throw new Error('Missing owned expanded-panel runtime.');
      const ownArgs = [...mapped];
      if (options.reuse) ownArgs.push('--reuse', options.reuse);
      if (options.fresh) ownArgs.push('--fresh');
      return (dependencies.execute || require(overlay.entry).runStudy)(ownArgs, settings);
    } });
}
if (require.main === module) main().catch(error => { console.error(`Version 19 expanded panel: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OVERLAY, REQUEST, EVIDENCE, HELP, parseArgs, requireExpandedOverlay, runStudy, main };
