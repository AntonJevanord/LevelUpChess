#!/usr/bin/env node
'use strict';

// A separate entry and owned snapshot keep the completed first trials intact.
const path = require('node:path');
const panels = require('./v19-panels');
const { ensureResearchOverlay, openResearchOverlay } = require('./balance/research-overlay');
const ROOT = path.resolve(__dirname, '..');
const OVERLAY = Object.freeze({ name: 'pawn-range-followup-v19', entryFile: 'scripts/v19-pawn-followup.js',
  definitionFile: 'src/balance-designs-v19-pawn-followup.js' });
const HELP = `Version 19 level-two pawn follow-up

  npm.cmd run balance:v19:pawn-followup -- --out DIRECTORY [--openings 8] [--jobs 4]
  npm.cmd run balance:v19:pawn-followup -- --resume DIRECTORY [--openings 32]
  npm.cmd run balance:v19:pawn-followup -- --report DIRECTORY
  npm.cmd run balance:v19:pawn-followup -- --check [--openings 8] [--rules-only]

fQ2 and mvQ2fceB2 face the unchanged Knight pawn, Rank pawn and Bishop grant.
Both new pawns use the previous L2 trial prior of 536 MG / 592 EG.
40k nodes, Skill 20, one thread, 32 MiB hash; four workers default.
Eight shared openings schedule 96 games; 32 schedule 384. Targets 8/16/32/64
are TOTAL openings. Old queen/pawn trial folders cannot be resumed here.
Keep the owned runtime and every batch journal. Reports refresh at batch
boundaries and include the first normal post-opening engine evaluations.
q/Ctrl+C stops now; g finishes active games; p finishes active color pairs.
--check plays no games; --report is offline. --engine PATH or
FAIRY_STOCKFISH_PATH selects the executable; Windows uses the bundled engine.
`;
function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.includes('--tier') || args.includes('--study')) throw new Error('This command runs only the level-two pawn follow-up; omit --tier and --study.');
  const mapped = ['--tier', '2', ...args];
  if ((mapped.includes('--out') || mapped.includes('--check')) && !mapped.includes('--openings')) mapped.push('--openings', '8');
  return { ...panels.parseArgs(mapped), mapped };
}
function requireFollowupOverlay(overlay) {
  if (!overlay || overlay.manifest?.name !== OVERLAY.name || overlay.manifest?.entryFile !== OVERLAY.entryFile
    || overlay.manifest?.definitionFile !== OVERLAY.definitionFile
    || overlay.entry !== path.join(overlay.directory, OVERLAY.entryFile)) throw new Error('This folder belongs to a different owned runtime. Use its original trial/panel command.');
  return overlay;
}
async function runStudy(args, dependencies = {}) {
  return panels.runStudy(args, { ...dependencies, planTools: dependencies.planTools || require('./balance/v19-pawn-followup-plan') });
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
      if (!overlay) throw new Error('Missing owned pawn follow-up runtime.');
      return (dependencies.execute || require(overlay.entry).runStudy)(mapped, settings);
    } });
}
if (require.main === module) main().catch(error => { console.error(`Version 19 pawn follow-up: ${error.message}`); process.exitCode = 1; });
module.exports = { ROOT, OVERLAY, HELP, parseArgs, requireFollowupOverlay, runStudy, main };
