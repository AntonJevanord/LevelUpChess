#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./balance/plan');
const { selectComparisons } = require('./balance');
const { summarize } = require('./balance/stats');
const roster = require('../experiments/balance/level3-roster.json');

const root = path.resolve(__dirname, '..');
const configFor = stage => normalizeConfig(require(path.join(root, 'experiments/balance', roster[stage === 'screen' ? 'screen' : 'holdout'])));
const CLAIM_FILE = 'level3-confirmation.json';
const selectedEnginePath = () => path.resolve(process.env.FAIRY_STOCKFISH_PATH || path.join(root, 'stockfish/fairy-stockfish-levelup_x86-64.exe'));
const HELP = `Level-3 campaign: 1860 screening games, at most 140 selected holdout games

  npm run balance:level3 -- --check
  npm run balance:level3 -- --stage screen --out DIRECTORY [--log games|plies]
  npm run balance:level3 -- --report DIRECTORY
  npm run balance:level3 -- --resume DIRECTORY [--log games|plies]
  npm run balance:level3 -- --stage confirm --from SCREEN_DIRECTORY --comparisons ID,ID --out DIRECTORY

Confirmation must include camel-knight-v-amazon and standard-control, with at
most five additional comparisons. Declare one selection after the screen;
resume that run instead of creating another confirmation directory.
q / Ctrl+C stops now; g stops after the game; p stops after its color pair.
Use p after the first 10–20 games to check runtime, then --report and --resume.
Game starts and results are printed by default; --log plies adds move progress.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.length === 1 && args[0] === '--check') return { check: true };
  const allowed = new Set(['stage', 'out', 'from', 'comparisons', 'report', 'resume', 'log']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index].startsWith('--') ? args[index].slice(2) : '';
    const value = args[index + 1];
    if (!allowed.has(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('Invalid campaign arguments. Use --help.');
    options[key] = value;
  }
  const modes = ['stage', 'report', 'resume'].filter(key => options[key]);
  if (modes.length !== 1) throw new Error('Select --check, --stage, --report, or --resume.');
  if (options.log !== undefined && (!['games', 'plies'].includes(options.log) || !['stage', 'resume'].includes(modes[0]))) throw new Error('--log games|plies applies only to new or resumed runs.');
  if (!options.stage) {
    if (Object.keys(options).some(key => ![modes[0], 'log'].includes(key))) throw new Error('--report and --resume take only a directory and optional run logging.');
    return options;
  }
  if (!['screen', 'confirm'].includes(options.stage) || !options.out) throw new Error('Select --stage screen or confirm and --out DIRECTORY.');
  if (options.stage === 'screen' && (options.from || options.comparisons)) throw new Error('Screening always runs the complete declared schedule.');
  if (options.stage === 'confirm' && (!options.from || !options.comparisons)) throw new Error('Confirmation needs --from SCREEN_DIRECTORY and explicit --comparisons ID,ID.');
  return options;
}

function confirmationSelection(input) {
  const ids = Array.isArray(input) ? [...input] : typeof input === 'string' ? input.split(',').map(id => id.trim()) : [];
  if (ids.length < roster.mandatoryConfirmationComparisons.length || ids.length > roster.maxConfirmationComparisons || new Set(ids).size !== ids.length) throw new Error('Select 2–7 distinct confirmation comparisons, including Camel versus Amazon and ordinary control.');
  for (const id of roster.mandatoryConfirmationComparisons) if (!ids.includes(id)) throw new Error(`Confirmation must include ${id}.`);
  const config = configFor('confirm');
  const schedule = selectComparisons(config, makeSchedule(config), ids);
  if (schedule.length > roster.holdoutGamesMax || roster.screenGames + schedule.length > roster.maxGames) throw new Error('The campaign would exceed 2000 scheduled games.');
  return { ids: ids.sort(), config, schedule };
}

function readJournal(directory) {
  const input = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8');
  return input.slice(0, input.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
}

/** Resume only a full screen or the bounded, complete-pair holdout schedule. */
function verifyCampaignManifest(manifest) {
  const actual = normalizeConfig(manifest.config);
  let expected, schedule, stage;
  if (isDeepStrictEqual(actual, configFor('screen'))) {
    stage = 'screen'; expected = configFor(stage); schedule = makeSchedule(expected);
  } else if (isDeepStrictEqual(actual, configFor('confirm'))) {
    stage = 'confirm';
    const selected = confirmationSelection([...new Set((manifest.schedule || []).map(game => game.comparisonId))]);
    expected = selected.config; schedule = selected.schedule;
  } else throw new Error('This directory does not contain the frozen level-3 campaign. Use its original checkout and the general balance command.');
  if (!isDeepStrictEqual(manifest.schedule, schedule)) throw new Error('The campaign schedule differs from its declared full color pairs.');
  return { stage, config: expected, schedule };
}

/** Reserve the one optional confirmation before starting its native engines. */
function reserveConfirmation(screenDirectory, outDirectory, input, { enginePath = selectedEnginePath() } = {}) {
  const from = path.resolve(screenDirectory), outDir = path.resolve(outDirectory);
  if (from === outDir) throw new Error('Confirmation needs a new output directory.');
  if (fs.existsSync(outDir) && (!fs.statSync(outDir).isDirectory() || fs.readdirSync(outDir).length)) throw new Error('The confirmation output already exists. Use --resume for an existing run, or choose an empty directory before reserving confirmation.');
  const manifest = JSON.parse(fs.readFileSync(path.join(from, 'run.json'), 'utf8'));
  if (verifyCampaignManifest(manifest).stage !== 'screen') throw new Error('--from must name the completed screening run.');
  const identity = require('./balance/run').getRunIdentity(enginePath);
  for (const [field, value] of Object.entries(identity)) {
    if (!isDeepStrictEqual(manifest[field], value)) throw new Error(`Confirmation ${field} differs from screening. Keep the original engine, runner, and built rules for both stages.`);
  }
  const records = readJournal(from);
  // Also verify identities, scheduled records, and army orientation before
  // trusting completion or allowing a second stage to spend the budget.
  require('./balance/level3-report').makeLevel3Report(manifest, records);
  const final = new Set(records.filter(record => ['completed', 'truncated'].includes(record.status)).map(record => record.id));
  if (manifest.schedule.some(game => !final.has(game.id))) throw new Error('Finish or resume the full screening schedule before selecting confirmation.');
  const selected = confirmationSelection(input);
  const summary = summarize(records);
  for (const id of selected.ids) {
    const comparison = summary.comparisons.find(item => item.comparisonId === id);
    if (comparison?.paired.completePairs !== 10 || comparison.primaryEstimate.uniqueOpenings !== 10) throw new Error(`${id} needs ten complete screening opening pairs before confirmation.`);
  }
  const declaration = { schemaVersion: 1, screenRunId: manifest.runId, screenConfigHash: manifest.configHash,
    profileHash: manifest.designProfile.hash, engineSha256: identity.engineSha256, rulesBundleSha256: identity.rulesBundleSha256,
    runnerSha256: identity.runnerSha256, comparisons: selected.ids, outDir, scheduledGames: selected.schedule.length };
  const claimPath = path.join(from, CLAIM_FILE);
  try {
    fs.writeFileSync(claimPath, JSON.stringify(declaration, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!isDeepStrictEqual(JSON.parse(fs.readFileSync(claimPath, 'utf8')), declaration)) throw new Error('This campaign already reserved its one confirmation run. Resume that directory; no third run is scheduled.');
  }
  return { ...selected, outDir };
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const logging = options.log ? ['--log', options.log] : [];
  if (options.help) { console.log(HELP); return; }
  if (options.report) {
    const result = require('./balance/level3-report').writeLevel3Report(options.report);
    const { report, files } = result;
    console.log(`${report.statusCounts.completed} completed attempts; ${report.statusCounts.truncated} truncated; ${report.statusCounts.error} errors. Scores use complete color pairs.`);
    if (report.timing.meanSeconds !== null) console.log(`${report.timing.sampleGames} timed first-attempt games: mean ${report.timing.meanSeconds.toFixed(1)} seconds; rough remaining ${(report.timing.estimatedRemainingSeconds / 3600).toFixed(1)} hours.${report.timing.smallSample ? ' Fewer than 20 samples; estimate is preliminary.' : ''}`);
    console.log(`Report: ${files.markdown}\nStandings: ${files.standings}\nMatchup matrix: ${files.matrix}\nScores compare upgrade packages, not piece material or Elo.`);
    return result;
  }
  if (options.check) {
    const enginePath = selectedEnginePath();
    const { validateDesignConfig } = require('./balance/validate-designs');
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.on('SIGINT', abort); process.on('SIGTERM', abort);
    try {
      for (const stage of ['screen', 'confirm']) {
        console.log(`Checking all ${stage === 'screen' ? 'screening' : 'possible holdout'} armies and openings; no games will be played.`);
        const result = await validateDesignConfig(configFor(stage), { enginePath, signal: controller.signal, standardOpeningSources: true, onProgress: console.log });
        console.log(`${stage}: ${result.games} legal scheduled positions; ${result.definitions} designs; ${result.movementChecks} movement checks; ${result.nativePositionChecks} exact native position checks.`);
      }
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
    return;
  }
  if (options.resume) {
    verifyCampaignManifest(JSON.parse(fs.readFileSync(path.join(path.resolve(options.resume), 'run.json'), 'utf8')));
    return require('./balance').main(['--resume', options.resume, ...logging]);
  }
  if (options.stage === 'screen') {
    const games = makeSchedule(configFor('screen')).length;
    if (games !== roster.screenGames || games + roster.holdoutGamesMax > roster.maxGames || roster.maxGames > 2000) throw new Error('The declared screen and reserve no longer fit the fixed 2000-game campaign.');
    return require('./balance').main(['--config', path.join(root, 'experiments/balance', roster.screen), '--out', options.out, ...logging]);
  }
  const selected = reserveConfirmation(options.from, options.out, options.comparisons);
  return require('./balance').main(['--config', path.join(root, 'experiments/balance', roster.holdout), '--comparisons', selected.ids.join(','), '--out', selected.outDir, ...logging]);
}

if (require.main === module) main().catch(error => { console.error(`Level-3 campaign: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, confirmationSelection, verifyCampaignManifest, reserveConfirmation, main, CLAIM_FILE };
