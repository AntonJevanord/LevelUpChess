#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getRunIdentity } = require('./balance/run');
const { runParallel } = require('./balance/parallel');
const { createProgressFormatter, readProgressHistory } = require('./balance/progress');
const { UciEngine } = require('./balance/uci');
const { createDesignRegistry } = require('./balance/design-registry');
const { compileDesignProfile } = require('./balance/design-profile');

const HELP = `Material compensation: one control and three cumulative Amazon checkpoints

  npm run balance:material -- --check
  npm run balance:material -- --out DIRECTORY --stage control [--jobs 3]
  npm run balance:material -- --out DIRECTORY --stage 1
  npm run balance:material -- --out DIRECTORY --stage 2
  npm run balance:material -- --out DIRECTORY --stage 3
  npm run balance:material -- --resume DIRECTORY [--stage control|1|2|3]
  npm run balance:material -- --report DIRECTORY

The control has 256 games; Amazon adds 64, 64 and 128, for 512 games total.
Each command starts only its requested stage. Resume continues an existing
incomplete stage; stopping never launches another. Worker count, reference
values, definitions, search settings and sources are frozen at the first launch.
q / Ctrl+C stops now; g finishes active games; p finishes active color pairs.
Game starts/results are the default. Add --log plies only for diagnostics.
--check validates all 512 assignments and native reference values without games.
Linux/macOS requires FAIRY_STOCKFISH_PATH pointing to the LevelUp native engine.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.length === 1 && args[0] === '--check') return { check: true };
  const options = {}, allowed = new Set(['out', 'stage', 'jobs', 'resume', 'report', 'log']);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    const value = args[index + 1];
    if (!allowed.has(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('Invalid material experiment arguments. Use --help.');
    options[key] = value;
  }
  if (['out', 'resume', 'report'].filter(key => options[key]).length !== 1) throw new Error('Select --check, --out, --resume, or --report.');
  if (options.out && !options.stage) throw new Error('A new stage needs --stage control, 1, 2, or 3. Stages never advance automatically.');
  if (options.stage !== undefined && (!['control', '1', '2', '3'].includes(options.stage) || options.report)) throw new Error('--stage control|1|2|3 applies only to launch or resume.');
  if (options.jobs !== undefined) {
    if (!options.out || options.stage !== 'control' || !/^(?:[1-9]|1[0-6])$/.test(options.jobs)) throw new Error('--jobs 1–16 applies only to the initial control launch; worker count is frozen afterward.');
    options.jobs = Number(options.jobs);
  }
  if (options.log !== undefined && (!['games', 'plies'].includes(options.log) || options.report)) throw new Error('--log games|plies applies only to launch or resume.');
  return options;
}

function selectedEnginePath() {
  if (process.platform !== 'win32' && !process.env.FAIRY_STOCKFISH_PATH) throw new Error('Set FAIRY_STOCKFISH_PATH to the compatible LevelUp native executable on Linux/macOS.');
  return path.resolve(process.env.FAIRY_STOCKFISH_PATH || path.join(__dirname, '../stockfish/fairy-stockfish-levelup_x86-64.exe'));
}

function installControls(controller, { input = process.stdin, events = process, onMessage = console.log } = {}) {
  let stop = null;
  const immediate = () => { stop = 'now'; controller.abort(); };
  const setStop = action => {
    if (action === 'now') { onMessage('Stopping now; saving active games.'); immediate(); }
    else if (stop !== 'now') { stop = action; onMessage(`Will stop after each active ${action}.`); }
  };
  const onKey = chunk => {
    for (const key of chunk.toString().toLowerCase()) {
      if (key === '\u0003' || key === 'q') setStop('now');
      else if (key === 'g') setStop('game');
      else if (key === 'p') setStop('pair');
    }
  };
  const interactive = Boolean(input.isTTY && typeof input.setRawMode === 'function'), wasRaw = input.isRaw;
  events.on('SIGINT', immediate); events.on('SIGTERM', immediate);
  if (interactive) { input.setRawMode(true); input.resume(); input.on('data', onKey); }
  let closed = false;
  return { shouldStop: () => stop, close() {
    if (closed) return;
    closed = true;
    events.removeListener('SIGINT', immediate); events.removeListener('SIGTERM', immediate);
    if (interactive) { input.removeListener('data', onKey); input.setRawMode(Boolean(wasRaw)); input.pause(); }
  } };
}

/** Inventory actual tables without a search before spending the control budget. */
async function checkReferenceValues(executable, options = {}) {
  const getCampaign = options.getCampaign || require('./balance/material-plan').getCampaign;
  const validate = options.validateReferenceValues || require('./balance/material-report').validateReferenceValues;
  const source = getCampaign(), profile = source.profile || compileDesignProfile(createDesignRegistry(source.config), source.config.evaluation);
  const controller = options.signal ? null : new AbortController(), signal = options.signal || controller.signal;
  const abort = () => controller?.abort();
  if (controller) { process.on('SIGINT', abort); process.on('SIGTERM', abort); }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-material-values-'));
  const variantPath = path.join(temporary, 'reference.ini'); fs.writeFileSync(variantPath, profile.config);
  const engine = new UciEngine({ path: executable, variantPath, variant: profile.variant,
    options: { skill: 20, threads: source.config.engine.threads, hash: source.config.engine.hashMb } });
  try {
    await engine.start({ signal });
    const report = await engine.pieceValues({ signal });
    validate(report);
    return report;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(`Reference-value preflight failed: ${error.message} Use the bundled version-16 engine and unchanged reference values.`, { cause: error });
  } finally {
    if (controller) { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
    try { await engine.close(); }
    finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
}

async function checkCampaign(executable, services = {}) {
  const getCampaign = services.getCampaign || require('./balance/material-plan').getCampaign;
  const controller = new AbortController(), abort = () => controller.abort();
  process.on('SIGINT', abort); process.on('SIGTERM', abort);
  try {
    const referenceValues = await (services.checkReferenceValues || checkReferenceValues)(executable, { signal: controller.signal, getCampaign });
    const validation = await (services.validateDesignConfig || require('./balance/validate-designs').validateDesignConfig)(getCampaign().config,
      { enginePath: executable, signal: controller.signal, standardOpeningSources: true, onProgress: console.log });
    console.log('Reference values verified; no games played.');
    return { validation, referenceValues };
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}

function printLiveEstimate(report, stage, output = console.log) {
  const phase = stage.phase === 'control' ? report.control : report.amazon;
  if (!phase?.estimate?.estimate) return;
  const root = phase.estimate.estimate, coverage = phase.coverage;
  const prefix = `Live ${stage.phase} estimate (${coverage.finishedGames}/${phase.plannedGames} finalized)`;
  if (root.status === 'no-data') {
    output(`${prefix}: waiting for a complete opening block; ${coverage.completePairs} color pairs finished. Each block needs all 8 handicap/layout comparisons.`);
    return;
  }
  const range = root.status === 'below-range' ? 'below 200 material cp'
    : root.status === 'above-range' ? 'above 500 material cp'
      : `${root.lowerCp}–${root.upperCp} material cp${root.pointCp === null ? ' plateau' : `; crossing about ${Math.round(root.pointCp / 10) * 10} cp`}`;
  output(`${prefix}: ${range}; ${coverage.matchedGames} matched games in ${coverage.eligibleOpeningBlocks} opening blocks. Provisional.`);
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args);
  if (options.help) { console.log(HELP); return; }
  if (options.report) {
    const saved = (services.report || require('./balance/material-report')).writeMaterialReport(options.report);
    console.log(`Material report: ${saved.files?.markdown || options.report}`);
    return saved;
  }
  const executable = services.enginePath || selectedEnginePath();
  if (options.check) return (services.checkCampaign || checkCampaign)(executable, services);
  const source = (services.getCampaign || require('./balance/material-plan').getCampaign)();
  const api = services.report || require('./balance/material-report');
  const identity = (services.getIdentity || getRunIdentity)(executable);
  const root = path.resolve(options.out || options.resume), filename = path.join(root, api.MANIFEST);
  if (!fs.existsSync(filename)) {
    if (!options.out || options.stage !== 'control') throw new Error('Start the control in a new campaign directory first.');
    if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error('Use a new empty directory for the material experiment.');
    const referenceValues = await (services.checkReferenceValues || checkReferenceValues)(executable);
    const parent = api.createCampaignManifest(options.jobs ?? 3, identity, referenceValues);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(parent, null, 2) + '\n', { flag: 'wx' });
  }
  const { campaign, runs } = api.readCampaignDirectory(root);
  api.verifyCurrentIdentity(campaign, identity);
  const report = api.makeMaterialReport(campaign, runs);
  let stage;
  if (options.resume) {
    const incomplete = source.stages.filter(item => runs[item.id] && !report.stages[item.id]?.finished);
    const requestedId = options.stage === 'control' ? 'control' : options.stage ? `amazon-${options.stage}` : null;
    stage = requestedId ? source.stages.find(item => item.id === requestedId) : incomplete.length === 1 ? incomplete[0] : null;
    if (!stage) {
      if (source.stages.every(item => report.stages[item.id]?.finished)) {
        const saved = api.writeMaterialReport(root);
        console.log('All material stages are finished; estimates are saved.');
        return { finished: true, materialReport: saved };
      }
      throw new Error('No single existing incomplete stage can be selected. Explicitly launch an unstarted stage with --out and --stage; resume never creates stages.');
    }
    if (!runs[stage.id]) throw new Error('That stage has not started. Use --out DIRECTORY --stage control|1|2|3 after its predecessor finishes.');
    if (report.stages[stage.id]?.finished) {
      const saved = api.writeMaterialReport(root);
      console.log('That stage is finished. Start the next stage explicitly; resume does not replay it.');
      return { finished: true, stage: stage.id, materialReport: saved };
    }
  } else {
    stage = source.stages.find(item => item.id === (options.stage === 'control' ? 'control' : `amazon-${options.stage}`));
    if (options.jobs !== undefined && options.jobs !== campaign.jobs) throw new Error('The campaign worker count is frozen across every stage.');
    if (runs[stage.id]) throw new Error('That stage already exists. Use --resume to continue it.');
  }
  const previous = source.stages.slice(0, source.stages.indexOf(stage));
  if (previous.some(item => !report.stages[item.id]?.finished)) throw new Error('Finish every preceding stage before explicitly starting or resuming this stage.');
  // Recover a checkpoint if a prior process finished its games but stopped
  // before reporting. The report writer keeps existing checkpoints immutable.
  if (previous.length) api.writeMaterialReport(root);
  const outDir = path.join(root, stage.directory), resume = Boolean(options.resume);
  const formatter = createProgressFormatter(stage.schedule, resume ? readProgressHistory(outDir, runs[stage.id].manifest) : []);
  const controller = new AbortController(), controls = (services.installControls || installControls)(controller);
  console.log(`${resume ? 'Resuming' : 'Starting'} ${stage.id}: ${stage.games} scheduled games; this command will not start another stage.`);
  console.log('q / Ctrl+C: stop now; g: after active games; p: after active color pairs.');
  let result, failure, saved, liveUpdate;
  const refreshLive = () => {
    if (liveUpdate) return;
    // Parallel progress arrives just before its aggregate journal is collected.
    // Yield to that collection, then refresh from durable aggregate records.
    liveUpdate = new Promise(resolve => setImmediate(() => {
      try { saved = api.writeMaterialReport(root); printLiveEstimate(saved.report, stage); }
      catch (error) { failure ||= error; controller.abort(); }
      finally { liveUpdate = null; resolve(); }
    }));
  };
  try {
    result = await (services.runParallel || runParallel)({ config: source.config, schedule: stage.schedule,
      outDir, resume, enginePath: executable, jobs: resume ? undefined : campaign.jobs,
      signal: controller.signal, shouldStop: controls.shouldStop, log: options.log || 'games',
      onProgress: message => {
        console.log(formatter(message));
        if (message.includes('Finished ')) refreshLive();
      } });
  } catch (error) { failure ||= error; }
  finally { if (liveUpdate) await liveUpdate; controls.close(); }
  try {
    saved = api.writeMaterialReport(root);
    console.log(`Material estimates saved: ${saved.files?.markdown || root}`);
  } catch (error) {
    if (!failure) throw error;
    console.error(`Could not update the partial material report: ${error.message}`);
  }
  if (failure) throw failure;
  return { ...result, stage: stage.id, materialReport: saved };
}

if (require.main === module) main().catch(error => { console.error(`Material experiment: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main, installControls, checkReferenceValues, checkCampaign, printLiveEstimate };
