#!/usr/bin/env node
'use strict';

// Reuse the tested batch/lease/cancellation machinery, but own a different
// pinned entry and definitions. A normal tier panel cannot be resumed here.
const path = require('node:path');
const panels = require('./v19-panels');
const { ensureResearchOverlay, openResearchOverlay } = require('./balance/research-overlay');
const ROOT = path.resolve(__dirname, '..');
const OVERLAY = Object.freeze({ name: 'focused-pawn-queen-trials-v19', entryFile: 'scripts/v19-trials.js', definitionFile: 'src/balance-designs-v19-trials.js' });
const SELECTORS = Object.freeze({ queens: 1, pawns2: 2, pawns3: 3 });
const HELP = `Version 19 focused pawn and queen trials

  npm.cmd run balance:v19:trials -- --study queens --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:trials -- --study pawns2 --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:trials -- --study pawns3 --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:trials -- --study NAME --resume DIRECTORY [--openings 16]
  npm.cmd run balance:v19:trials -- --study NAME --report DIRECTORY
  npm.cmd run balance:v19:trials -- --study NAME --check [--openings 8] [--rules-only]

Eight shared openings schedule 192 queen games, 96 level-two pawn games and
320 level-three pawn/Wraith games (608 total). Run one study at a time. Only fixed
same-tier references are opponents. QfN/QvN and Herald are fresh controls.
Search uses 40k nodes, Skill 20, one thread and 32 MiB hash; four workers default.

P = ifmnDfmWfceF. QfsN implements the requested two wide-forward jumps;
QsfN is ignored by the engines. See the report for expanded movement strings,
matched family priors and en-passant conventions. Trials stay research-only.

Targets 8/16/32/64 are TOTAL openings. Completed eight-case batches are retained
and verified on resume; no extension starts automatically. Keep the entire
folder and its owned runtime. Reports are panel-report.md/json, with completed
targets under reports/openings-N. --report is offline; --check starts no games.
q/Ctrl+C stops now; g finishes active games; p finishes active color pairs.
--engine PATH or FAIRY_STOCKFISH_PATH selects a compatible executable; Windows
uses the bundled engine by default. --log plies adds moves; default logs games.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.includes('--tier')) throw new Error('Use --study queens, pawns2 or pawns3 for focused trials.');
  const index = args.indexOf('--study');
  if (index < 0 || args.lastIndexOf('--study') !== index || !Object.hasOwn(SELECTORS, args[index + 1])) throw new Error('Choose --study queens, pawns2 or pawns3.');
  if (args.length === 3 && ['--help', '-h'].includes(args[2])) return { help: true };
  const selector = args[index + 1], mapped = [...args]; mapped.splice(index, 2, '--tier', String(SELECTORS[selector]));
  if ((mapped.includes('--out') || mapped.includes('--check')) && !mapped.includes('--openings')) mapped.push('--openings', '8');
  return { ...panels.parseArgs(mapped), selector, mapped };
}
function requireTrialOverlay(overlay) {
  if (!overlay || overlay.manifest?.name !== OVERLAY.name || overlay.manifest?.entryFile !== OVERLAY.entryFile
    || overlay.manifest?.definitionFile !== OVERLAY.definitionFile
    || overlay.entry !== path.join(overlay.directory, OVERLAY.entryFile)) throw new Error('This directory belongs to a different owned runtime; use the original panel/trial command.');
  return overlay;
}
async function runStudy(args, dependencies = {}) {
  return panels.runStudy(args, { ...dependencies, planTools: dependencies.planTools || require('./balance/v19-trial-plan') });
}
async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args), log = dependencies.log || console.log;
  if (options.help) { log(HELP); return; }
  let overlay;
  const ensure = dependencies.ensure || ensureResearchOverlay, open = dependencies.open || openResearchOverlay;
  return panels.main(options.mapped, { sourceRoot: dependencies.sourceRoot || ROOT, enginePath: dependencies.enginePath, log,
    ensure(settings) { overlay = requireTrialOverlay(ensure({ ...settings, ...OVERLAY })); return overlay; },
    open(settings) { overlay = requireTrialOverlay(open(settings)); return overlay; },
    execute(mapped, settings) {
      if (!overlay) throw new Error('Missing owned trial runtime.');
      return (dependencies.execute || require(overlay.entry).runStudy)(mapped, settings);
    } });
}
if (require.main === module) main().catch(error => { console.error(`Version 19 trials: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OVERLAY, SELECTORS, HELP, parseArgs, requireTrialOverlay, runStudy, main };
