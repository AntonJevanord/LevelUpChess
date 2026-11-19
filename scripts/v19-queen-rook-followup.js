#!/usr/bin/env node
'use strict';

const path = require('node:path');
const panels = require('./v19-panels');
const { ensureResearchOverlay, openResearchOverlay } = require('./balance/research-overlay');
const ROOT = path.resolve(__dirname, '..');
const OVERLAY = Object.freeze({ name: 'queen-rook-followup-v19', entryFile: 'scripts/v19-queen-rook-followup.js',
  definitionFile: 'src/balance-designs-v19-queen-rook-followup.js' });
const SELECTORS = Object.freeze({ level2: 2, queens3: 3 });
const HELP = `Version 19 focused queen and rook follow-up

  npm.cmd run balance:v19:queen-rook -- --study level2 --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:queen-rook -- --study queens3 --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:queen-rook -- --study NAME --resume DIRECTORY [--openings 16]
  npm.cmd run balance:v19:queen-rook -- --study NAME --report DIRECTORY
  npm.cmd run balance:v19:queen-rook -- --study NAME --check [--openings 8] [--rules-only]

level2: QsNfD, QsNfDfH and RcsNcfN, with fresh QsN and RcN controls, face
the three unchanged level-two references. Eight openings schedule 240 games.
queens3: QsCfC, QsZfZ, QZAG, QZH, QC and QZ, with the current
QgmQ0gcBgcsR0 Wraith control, face the four level-three references.
Eight openings schedule 448 games.
Only fixed references are opponents; no candidate-versus-candidate games.

40k nodes, Skill 20, one thread, 32 MiB hash; four workers default. Run one
study at a time. Targets 8/16/32/64 are TOTAL openings. Completed eight-case
batches are verified and retained; extension never starts automatically.
Keep the owned runtime and batch journals. Existing panel or other trial
directories cannot be resumed here. This follow-up does not update the roster
or import old games; later result reuse requires a separate compatibility audit.

Reports refresh at batch boundaries and include the first normal post-opening
engine evaluation. --report is offline; --check starts no games. q/Ctrl+C stops
now; g finishes active games; p finishes active color pairs. --engine PATH or
FAIRY_STOCKFISH_PATH selects the executable; Windows uses the bundled engine.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.includes('--tier')) throw new Error('Use --study level2 or queens3 for the queen/rook follow-up.');
  const index = args.indexOf('--study');
  if (index < 0 || args.lastIndexOf('--study') !== index || !Object.hasOwn(SELECTORS, args[index + 1])) {
    throw new Error('Choose --study level2 or queens3.');
  }
  if (args.length === 3 && ['--help', '-h'].includes(args[2])) return { help: true };
  const selector = args[index + 1], mapped = [...args];
  mapped.splice(index, 2, '--tier', String(SELECTORS[selector]));
  if ((mapped.includes('--out') || mapped.includes('--check')) && !mapped.includes('--openings')) mapped.push('--openings', '8');
  return { ...panels.parseArgs(mapped), selector, mapped };
}
function requireFollowupOverlay(overlay) {
  if (!overlay || overlay.manifest?.name !== OVERLAY.name || overlay.manifest?.entryFile !== OVERLAY.entryFile
    || overlay.manifest?.definitionFile !== OVERLAY.definitionFile
    || overlay.entry !== path.join(overlay.directory, OVERLAY.entryFile)) {
    throw new Error('This directory belongs to a different owned runtime; use its original panel/trial command.');
  }
  return overlay;
}
async function runStudy(args, dependencies = {}) {
  return panels.runStudy(args, { ...dependencies,
    planTools: dependencies.planTools || require('./balance/v19-queen-rook-followup-plan') });
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args), log = dependencies.log || console.log;
  if (options.help) { log(HELP); return; }
  let overlay;
  const ensure = dependencies.ensure || ensureResearchOverlay, open = dependencies.open || openResearchOverlay;
  return panels.main(options.mapped, { sourceRoot: dependencies.sourceRoot || ROOT, enginePath: dependencies.enginePath, log,
    ensure(settings) { overlay = requireFollowupOverlay(ensure({ ...settings, ...OVERLAY })); return overlay; },
    open(settings) { overlay = requireFollowupOverlay(open(settings)); return overlay; },
    execute(mapped, settings) {
      if (!overlay) throw new Error('Missing owned queen/rook follow-up runtime.');
      return (dependencies.execute || require(overlay.entry).runStudy)(mapped, settings);
    } });
}
if (require.main === module) main().catch(error => { console.error(`Version 19 queen/rook follow-up: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OVERLAY, SELECTORS, HELP, parseArgs, requireFollowupOverlay, runStudy, main };
