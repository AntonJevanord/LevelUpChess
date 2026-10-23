#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UciEngine } = require('./balance/uci');
const { getRunIdentity } = require('./balance/run');
const { requireManualValues } = require('./balance/evaluation');
const { POLICIES, DIRECTORIES, MANIFEST, getCampaign, createCampaignManifest, verifyCurrentIdentity, verifyPolicyManifest, readCampaignDirectory, makeRookValuesReport, writeRookValuesReport } = require('./balance/rook-values-report');

const HELP = `Blink rook material assumptions: one bounded 400-game campaign

  npm run balance:rook-values -- --check
  npm run balance:rook-values -- --out DIRECTORY --policy auto [--jobs 3]
  npm run balance:rook-values -- --out DIRECTORY --policy eight
  npm run balance:rook-values -- --resume DIRECTORY [--policy auto|eight] [--log games|plies]
  npm run balance:rook-values -- --report DIRECTORY

Start automatic valuation first, then explicitly start eight-point valuation.
Each policy has 200 games: three Blink versions, two controls, 20 color pairs.
Stopping never starts the other policy. Engine/build and jobs are frozen across
both runs. q / Ctrl+C stops now; g finishes active games; p finishes active pairs.
Eight points uses ordinary rook=5, giving MG2042/EG2208 internal units.
--check verifies both profiles and native support without playing games.
On Linux/macOS set FAIRY_STOCKFISH_PATH to the patched LevelUp engine.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  if (args.length === 1 && args[0] === '--check') return { check: true };
  const options = {}, allowed = new Set(['out', 'resume', 'report', 'policy', 'jobs', 'log']);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], key = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '', value = args[index + 1];
    if (!allowed.has(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('Invalid rook valuation arguments. Use --help.');
    options[key] = value;
  }
  if (['out', 'resume', 'report'].filter(key => options[key]).length !== 1) throw new Error('Select --check, --out, --resume, or --report.');
  if (options.out && !options.policy) throw new Error('A policy launch requires --policy auto or eight. The second policy starts only by explicit command.');
  if (options.policy !== undefined && (!POLICIES.includes(options.policy) || options.report)) throw new Error('--policy auto|eight applies only to launch or resume.');
  if (options.jobs !== undefined) {
    if (!options.out || options.policy !== 'auto' || !/^(?:[1-9]|1[0-6])$/.test(options.jobs)) throw new Error('--jobs 1–16 applies only to the initial automatic policy; it is frozen afterward.');
    options.jobs = Number(options.jobs);
  }
  if (options.log !== undefined && (!['games', 'plies'].includes(options.log) || options.report)) throw new Error('--log games|plies applies only to launch or resume.');
  return options;
}

function enginePath() {
  if (process.platform !== 'win32' && !process.env.FAIRY_STOCKFISH_PATH) throw new Error('Set FAIRY_STOCKFISH_PATH to the patched LevelUp native executable on Linux/macOS.');
  return path.resolve(process.env.FAIRY_STOCKFISH_PATH || path.join(__dirname, '../stockfish/fairy-stockfish-levelup_x86-64.exe'));
}

/** Refuse an older partial-override engine before any automatic baseline game. */
async function ensureManualSupport(executable, { signal } = {}) {
  const { profile } = getCampaign().policies.eight;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-rook-values-engine-'));
  const ini = path.join(temporary, 'eight.ini'); fs.writeFileSync(ini, profile.config);
  const engine = new UciEngine({ path: executable, variant: profile.variant, variantPath: ini, options: { skill: 20, threads: 1, hash: 32 } });
  try { await engine.start({ signal }); await requireManualValues(engine, profile, { signal }); }
  finally { try { await engine.close(); } finally { fs.rmSync(temporary, { recursive: true, force: true }); } }
}

async function checkCampaign(executable) {
  const controller = new AbortController(), abort = () => controller.abort();
  process.on('SIGINT', abort); process.on('SIGTERM', abort);
  try {
    const { policies } = getCampaign(), results = {};
    for (const policy of POLICIES) {
      console.log(`Checking ${policy} valuation; no games will be played.`);
      results[policy] = await require('./balance/validate-designs').validateDesignConfig(policies[policy].config, { enginePath: executable, signal: controller.signal, standardOpeningSources: true, onProgress: console.log });
    }
    return results;
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args);
  if (options.help) { console.log(HELP); return; }
  if (options.report) {
    const result = writeRookValuesReport(options.report);
    for (const row of result.report.comparisons) console.log(`${row.label}: ${row.automaticScore === null ? 'unscored' : (100 * row.automaticScore).toFixed(1) + '%'} automatic, ${row.eightPointScore === null ? 'unscored' : (100 * row.eightPointScore).toFixed(1) + '%'} eight-point; ${row.sharedOpenings}/20 shared openings.`);
    console.log(`Report: ${result.files.markdown}`);
    return result;
  }
  const executable = services.enginePath || enginePath();
  if (options.check) return (services.checkCampaign || checkCampaign)(executable);
  const identity = (services.getIdentity || getRunIdentity)(executable), root = path.resolve(options.out || options.resume);
  const launch = services.launch || (args => require('./parallel-balance').main(args));
  const { policies } = getCampaign();
  const filename = path.join(root, MANIFEST);
  if (!fs.existsSync(filename)) {
    if (!options.out || options.policy !== 'auto') throw new Error('Start the automatic policy in a new campaign directory first.');
    if (fs.existsSync(root) && fs.readdirSync(root).length) throw new Error('Use a new empty directory for the rook valuation campaign.');
    await (services.ensureManualSupport || ensureManualSupport)(executable);
    const campaign = createCampaignManifest(options.jobs ?? 3, identity);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(campaign, null, 2) + '\n', { flag: 'wx' });
  }
  const state = readCampaignDirectory(root), { campaign, runs } = state;
  verifyCurrentIdentity(campaign, identity);
  for (const policy of POLICIES) if (runs[policy]) verifyPolicyManifest(runs[policy].manifest, policy, campaign);
  const report = makeRookValuesReport(campaign, runs);
  const logging = options.log ? ['--log', options.log] : [];
  if (options.resume) {
    const incomplete = POLICIES.filter(policy => runs[policy] && !report.policies[policy].finished);
    const selected = options.policy || (incomplete.length === 1 ? incomplete[0] : null);
    if (!selected) {
      if (report.finished) { console.log('Both policies are finished. Generate --report to inspect results.'); return { finished: true }; }
      throw new Error(`No single existing incomplete policy can be selected. Use --policy to resume an existing run, or explicitly launch the unstarted ${runs.auto ? 'eight' : 'auto'} policy with --out.`);
    }
    if (!runs[selected]) throw new Error(`That policy has not started. Use --out DIRECTORY --policy ${selected}${selected === 'eight' ? ' after automatic completion' : ''}.`);
    if (report.policies[selected].finished) {
      console.log(`${selected} policy is finished. Generate --report or explicitly start the next policy.`);
      return { finished: true, policy: selected };
    }
    return launch(['--resume', path.join(root, DIRECTORIES[selected]), ...logging]);
  }
  const selected = options.policy;
  if (options.jobs !== undefined && options.jobs !== campaign.jobs) throw new Error('The campaign worker count is frozen across both policies.');
  if (runs[selected]) throw new Error('That policy already exists. Use --resume to continue it.');
  if (selected === 'eight' && !report.policies.auto?.finished) throw new Error('Finish the automatic policy before explicitly starting the eight-point policy.');
  console.log(`Starting ${selected}: 200 of at most 400 declared games. The other policy will not start automatically.`);
  return launch(['--config', policies[selected].configFile, '--out', path.join(root, DIRECTORIES[selected]), '--jobs', String(campaign.jobs), ...logging]);
}

if (require.main === module) main().catch(error => { console.error(`Rook valuation campaign: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, main, ensureManualSupport, checkCampaign };
