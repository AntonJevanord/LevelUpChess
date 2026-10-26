#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createDecisionPlan } = require('./balance/bishop-decision-plan');
const { checkDecisionCampaign, runDecisionCampaign, readDecisionManifest,
  writeDecisionCampaignReport, printDecisionScores } = require('./balance/bishop-decision-run');
const { installControls, selectedEnginePath } = require('./material-collect');

const HELP = `LevelUp bishop decision: at most 1,472 new games, four jobs

  npm run balance:bishop-decision -- --check [--revisions DIRECTORY-or-journal]
  npm run balance:bishop-decision -- --out NEW_DIRECTORY [--jobs 4] [--revisions DIRECTORY-or-journal]
  npm run balance:bishop-decision -- --resume DIRECTORY
  npm run balance:bishop-decision -- --report DIRECTORY

Restores only absent historical short-side bishop/Camel/Amazon cells (0–192
games) under their original ten-type automatic profile. Reuses at least 832
completed source games. A stopped revision journal can supply more restored
cells; its exact bytes are retained in the new campaign.

Then compares BsWsN, long quiet-hop BsRgmsR0 and blocked wide-knight BsR2nsN
bishops with fixed RfB, Camel and Amazon references. Both colors, 128 inherited
positions; 1,280 new comparison games under the expanded thirteen-type profile.
Existing short-side and long quiet-hop bishop/RfB games are reused.
Only the queen-moving rook uses queen-equivalent native values; other expanded
types retain automatic values. RfB retains castling. Skill 20, 20,000 nodes per
move, one thread, 32 MB hash and 400 plies are fixed.

Restoration completes before comparison. Comparison checkpoints at 320, 640
and 1,280 games save paired points scores for all nine candidate/reference
matchups. The schedule closes at the cap; no automatic redesign batch follows.
q / Ctrl+C stops now; g finishes active games; p finishes active pairs.
Immediate stop saves histories; --report refreshes scores afterward.
--check validates both stages and source histories without searches or output.
--report works offline without an engine. Raw source outputs remain intact.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--check', '--out', '--jobs', '--resume', '--report', '--revisions'].includes(flag)) throw new Error(`Unknown option ${flag}. Use --help.`);
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`Repeated option ${flag}.`);
    if (key === 'check') { options.check = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    options[key] = value;
  }
  if (['check', 'out', 'resume', 'report'].filter(key => options[key]).length !== 1) throw new Error('Choose --check, --out, --resume or --report.');
  if ((options.check || options.resume || options.report) && options.jobs !== undefined) throw new Error('--jobs applies only to a new campaign.');
  if ((options.resume || options.report) && options.revisions) throw new Error('Resume/report use the frozen campaign; do not supply --revisions.');
  if (options.jobs !== undefined && options.jobs !== '4') throw new Error('The bishop decision uses exactly four jobs.');
  if (options.jobs) options.jobs = 4;
  return options;
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args), log = services.log || console.log;
  if (options.help) { log(HELP); return { help: true }; }
  // Offline reporting must not select a native engine, load rules, or leave
  // terminal controls attached. The report wrapper owns the campaign lock.
  if (options.report) {
    const result = await (services.writeDecisionCampaignReport || writeDecisionCampaignReport)(path.resolve(options.report));
    printDecisionScores(result.report, log);
    log(`Bishop decision report: ${result.files.markdown}`);
    return result;
  }
  const enginePath = services.enginePath || (services.selectedEnginePath || selectedEnginePath)();
  const controller = new AbortController();
  const controls = (services.installControls || installControls)(controller, { log });
  try {
    const plan = options.resume
      ? (services.readDecisionManifest || readDecisionManifest)(path.resolve(options.resume)).plan
      : await (services.createDecisionPlan || createDecisionPlan)({ revisions: options.revisions && path.resolve(options.revisions), signal: controller.signal });
    if (plan?.id !== 'bishop-decision-v16-001') throw new Error('This is not the declared bishop decision campaign.');
    const retained = plan.sourceEvidence?.find(item => item.name === 'retained-revisions.games.jsonl');
    if (retained) log(`Retained revision journal: ${retained.file}; ${plan.stages.find(stage => stage.key === 'restore').plan.schedule.length} restoration games remain.`);
    if (options.check) {
      const result = await (services.checkDecisionCampaign || checkDecisionCampaign)({ plan, enginePath, signal: controller.signal, onProgress: log });
      log('Bishop decision preflight passed for every nonempty stage; no searches, games or output started.');
      return { ...result, checked: true };
    }
    log('q / Ctrl+C: stop now; g: after active games; p: after active pairs.');
    return await (services.runDecisionCampaign || runDecisionCampaign)({ plan, outDir: path.resolve(options.out || options.resume),
      jobs: options.jobs ?? 4, enginePath, resume: Boolean(options.resume), signal: controller.signal,
      shouldStop: controls.shouldStop, onProgress: log });
  } catch (error) {
    if (!controller.signal.aborted || (error.name !== 'AbortError' && error.code !== 'ABORT_ERR')) throw error;
    log('Bishop decision stopped; recorded histories are preserved.');
    return { stopped: true };
  } finally { controls.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Bishop decision failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main };
