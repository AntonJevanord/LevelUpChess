'use strict';

// Offline diagnostic only: this command never imports a UCI engine or runs games.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getCampaign } = require('./balance/material-plan');
const { exportDataset } = require('./balance/material-dataset');
const { analyzeDataset } = require('./balance/material-regression');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'experiments/balance/results');
const OPENING_GROUPS = Object.freeze({
  start: 'unforced',
  'open-e-pawns': 'e-pawn', 'french-prefix': 'e-pawn',
  'scandinavian-prefix': 'e-pawn', 'pirc-prefix': 'e-pawn',
  'queen-pawns': 'd-pawn', 'queen-french-prefix': 'd-pawn', 'queen-open-e-prefix': 'd-pawn',
  'quiet-e-pawns': 'quiet-pawns', 'quiet-d-pawns': 'quiet-pawns', 'quiet-center-prefix': 'quiet-pawns',
  'ordinary-knights': 'knights', 'queenside-knights': 'knights', 'mixed-knights-prefix': 'knights',
  'opposite-knights-prefix': 'knights', 'four-knights-prefix': 'knights',
});
const TOOL_SOURCES = ['scripts/material-regression.js', 'scripts/balance/material-dataset.js',
  'scripts/balance/material-regression.js', 'scripts/balance/material-plan.js',
  'scripts/balance/plan.js', 'scripts/balance/design-profile.js',
  'scripts/balance/design-registry.js', 'scripts/balance/evaluation.js', 'src/design-catalog.js'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const number = value => Number.isFinite(value) ? value.toFixed(4) : 'unavailable';

function parseArgs(args) {
  const options = { bootstrap: 200, seed: 42 };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--help', '--out', '--archive', '--bootstrap', '--seed'].includes(flag) || seen.has(flag)) throw new Error(`Unknown or repeated option: ${flag}`);
    seen.add(flag);
    if (flag === '--help') { options.help = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    options[flag.slice(2)] = ['--bootstrap', '--seed'].includes(flag) ? Number(value) : value;
  }
  if (options.help && seen.size !== 1) throw new Error('Use --help by itself.');
  if (!options.help && !options.out) throw new Error('Specify --out with a new empty output directory.');
  if (!Number.isSafeInteger(options.bootstrap) || options.bootstrap < 0 || options.bootstrap > 1000) throw new Error('--bootstrap must be an integer from 0 to 1000.');
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error('--seed must be an unsigned 32-bit integer.');
  return options;
}

function readPilotArchive(directory = ARCHIVE) {
  const audit = JSON.parse(fs.readFileSync(path.join(directory, 'material-pilot-001.audit.json'), 'utf8'));
  const campaign = getCampaign();
  if (audit.format !== 'levelup-material-pilot-results-audit' || audit.completedGames !== 320
    || audit.identity.profileHash !== campaign.profile.hash || audit.identity.registryHash !== campaign.registry.hash) throw new Error('The archive does not match the version-16 material pilot.');
  const inputs = [], sources = [];
  for (const [id, stageId, count] of [['control', 'control', 256], ['amazon-64', 'amazon-1', 64]]) {
    const entry = audit.inputs[`${id}.games.jsonl`];
    const expectedName = `material-pilot-001.${id}.games.jsonl`;
    if (!entry || entry.file !== expectedName) throw new Error(`Missing archived journal identity: ${id}.`);
    const bytes = fs.readFileSync(path.join(directory, expectedName));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`Archived journal checksum mismatch: ${id}.`);
    if (!bytes.toString('utf8').endsWith('\n')) throw new Error(`Incomplete archived journal: ${id}.`);
    const records = bytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    const stage = campaign.stages.find(item => item.id === stageId);
    if (records.length !== count || JSON.stringify(records.map(row => row.id).sort()) !== JSON.stringify(stage.schedule.map(row => row.id).sort())) throw new Error(`Incomplete or unexpected archived stage: ${id}.`);
    inputs.push({ file: entry.file, bytes: entry.bytes, sha256: entry.sha256 });
    sources.push({ id, records, identity: {
      protocol: campaign.id, protocolRevision: audit.identity.protocolRevision,
      profileHash: campaign.profile.hash, registryHash: campaign.registry.hash,
      evaluation: 'automatic-reference', engineSettings: campaign.config.engine,
      engineIdentityVerified: false, sourceIdentityVerified: false,
    }, metadata: { runId: audit.phases[id === 'control' ? 'control' : 'amazon'].runId, openingGroups: OPENING_GROUPS } });
  }
  return { sources, profile: campaign.profile, inputs, openingGroups: OPENING_GROUPS };
}

function formatReport(report) {
  const { analysis, dataset } = report;
  const { fit, rank, validation, bootstrap, normalized } = analysis;
  const lines = ['# Offline material regression: pilot diagnostic', '',
    '**Exploratory outcome prediction on selected handicap games; no calibrated material values are established.**', '',
    `Replayed ${dataset.games.length} games; retained ${dataset.sampleCount} sparse positions. `
      + `Related openings are grouped into ${analysis.coverage.groups} families. Draws remain scored as 0.5.`, '',
    'This analysis starts no engine games, trains no NNUE network and changes no playing values. '
      + 'The closed 320-game pilot remains closed.', '',
    '## Coverage and fit', '',
    `- Games contributing samples: ${analysis.coverage.games}; sampled draws: ${analysis.coverage.drawGames ?? 'unavailable'}.`,
    `- Source games without accepted samples: ${dataset.coverage?.gamesWithoutSamples ?? 'unavailable'}.`,
    `- Pairs with samples in both games: ${dataset.coverage?.sampledCompletePairs ?? 'unavailable'}; with only one sampled game: ${dataset.coverage?.sampledPartialPairs ?? 'unavailable'}.`,
    `- Feature rank: ${rank.rank}/${rank.columns}; full rank: ${rank.fullRank}.`,
    `- Fit converged: ${fit.converged}; iterations: ${fit.iterations}.`,
    `- Training expected-score Brier error: ${number(fit.metrics.brier)}.`,
    `- Fitted intercept: ${number(fit.intercept)}.`, '',
    '| Feature | Raw coefficient | Conditional bootstrap range | Games with nonzero feature | Families with nonzero feature |',
    '| --- | ---: | --- | ---: | ---: |'];
  for (const feature of analysis.coverage.features) {
    const interval = bootstrap.coefficientIntervals?.[feature.name];
    const band = interval && Number.isFinite(interval.lower) && Number.isFinite(interval.upper)
      ? `${number(interval.lower)} to ${number(interval.upper)}` : 'unavailable';
    lines.push(`| ${feature.name} | ${number(fit.coefficients[feature.name])} | ${band} | ${feature.nonzeroGames} | ${feature.groupsWithNonzero} |`);
  }
  lines.push('', 'Raw coefficients use the fitted logistic scale, not centipawns. '
    + 'Each accepted game has equal total sample weight. The method, ridge penalty and reporting gates are recorded in JSON.', '',
  '## Grouped validation and stability', '',
  `- Held-out-family validation available: ${validation.available}${validation.reason ? ` (${validation.reason})` : ''}.`,
  `- Held-out Brier error: ${number(validation.metrics?.brier)}; training-only constant baseline: ${number(validation.baselineMetrics?.brier)}.`,
  `- Held-out log loss: ${number(validation.metrics?.logLoss)}; constant baseline: ${number(validation.baselineMetrics?.logLoss)}.`,
  `- Bootstrap available: ${bootstrap.available}${bootstrap.reason ? ` (${bootstrap.reason})` : ''}; requested ${bootstrap.requested}, completed ${bootstrap.completed}.`,
  `- Resample exclusions: ${bootstrap.rankDeficient ?? 0} rank-deficient, ${bootstrap.nonconverged ?? 0} nonconverged; ${bootstrap.pawnNonpositive ?? 0} with nonpositive pawn coefficient.`,
  `- Resampled fits flagged for possible separation: ${bootstrap.possibleSeparation ?? 0}.`,
  `- Pawn-normalized estimates available: ${normalized.available}${normalized.reason ? ` (${normalized.reason})` : ''}.`, '',
  'Lower validation errors indicate better prediction of these recorded outcomes, not a validated exchange-price scale. '
    + 'Whole families, including both colors and all comparisons, remain together in holdouts and resampling. '
    + `Conditional bootstrap ranges from ${analysis.coverage.groups} selected families do not establish general accuracy. `
    + 'Ranges condition on usable fits; exclusion counts remain visible. The eight-family normalization gate is a conservative reporting rule, not an accuracy guarantee.', '');
  if (normalized.available) {
    lines.push('## Conditional pawn-normalized coefficients', '', '| Feature | Pawn units |', '| --- | ---: |');
    for (const [name, value] of Object.entries(normalized.values)) lines.push(`| ${name} | ${number(value)} |`);
    lines.push('');
  }
  const pawn = fit.coefficients.pawn;
  if (rank.fullRank && fit.converged && pawn > 1e-6 && Number.isFinite(fit.coefficients.queen) && Number.isFinite(fit.coefficients.rook)) {
    lines.push('## Ordinary-material sanity check', '',
      `For inspection only, dividing raw slopes by the pawn slope gives queen ${number(fit.coefficients.queen / pawn)}, `
        + `rook ${number(fit.coefficients.rook / pawn)} and queen-minus-rook ${number((fit.coefficients.queen - fit.coefficients.rook) / pawn)}. `
        + 'These arithmetic ratios are not a released material-value table. Compare them with broad ordinary-chess evidence before interpreting an upgrade coefficient.', '',
      'Accurate outcome prediction on selected handicap games does not establish transferable material prices. '
        + 'Neither adding positions from these same games nor renaming opening families resolves that issue.', '');
  }
  lines.push('## Limits and decision', '');
  for (const warning of [...new Set([...dataset.limitations, ...analysis.warnings])]) lines.push(`- ${warning}`);
  lines.push('', 'Use this export and fit as a method diagnostic. Keep authoritative piece values and the next game budget undecided. '
    + 'Do not tune an evaluator toward a preferred coefficient, resume the remaining pilot stages or treat row count as independent evidence.', '',
  'The dataset, source checksums, sampling rules, grouping, tool hashes and detailed coefficients/folds are saved beside this report.', '');
  return lines.join('\n');
}

async function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args), log = services.log || console.log;
  if (options.help) {
    log('Usage: npm run balance:regression -- --out DIRECTORY [--archive DIRECTORY] [--bootstrap 0..1000] [--seed UINT32]\n'
      + 'Offline export and expected-score regression of the archived 320-game version-16 pilot. No engine required.');
    return { help: true };
  }
  const destination = path.resolve(options.out);
  if (fs.existsSync(destination) && (!fs.statSync(destination).isDirectory() || fs.readdirSync(destination).length)) throw new Error('Use a new empty output directory; existing results are never replaced.');
  const source = (services.readPilotArchive || readPilotArchive)(options.archive ? path.resolve(options.archive) : undefined);
  log('Offline export: replaying 320 archived games and checking sparse material samples.');
  const dataset = await (services.exportDataset || exportDataset)({ sources: source.sources, profile: source.profile, openingGroups: source.openingGroups });
  log(`Retained ${dataset.samples.length} positions; fitting and validating by whole opening families.`);
  const analysis = (services.analyzeDataset || analyzeDataset)(dataset, { bootstrap: options.bootstrap, seed: options.seed });
  const { samples, ...metadata } = dataset;
  metadata.sampleCount = samples.length;
  const sampleBytes = samples.map(row => JSON.stringify(row)).join('\n') + '\n';
  const report = { schemaVersion: 1, format: 'levelup-material-regression-diagnostic', dataset: metadata, analysis };
  const manifest = { schemaVersion: 1, format: 'levelup-material-regression-analysis',
    engineGamesStarted: 0, inputs: source.inputs, profileHash: source.profile.hash, registryHash: source.profile.registryHash,
    actualEngineAndSourceIdentityVerified: false, openingGroups: source.openingGroups,
    sampling: dataset.sampling, bootstrap: options.bootstrap, seed: options.seed,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    replayRulesBundleSha256: sha256(fs.readFileSync(path.join(ROOT, 'dist/balance-rules.cjs'))),
    protocolConfigSha256: sha256(fs.readFileSync(path.join(ROOT, 'experiments/balance/material-estimate.json'), 'utf8').replace(/\r\n/g, '\n')),
    tools: TOOL_SOURCES.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) })),
    datasetSha256: sha256(json(metadata)), samplesSha256: sha256(sampleBytes), reportSha256: sha256(json(report)),
  };
  const outputs = { 'dataset.json': json(metadata), 'samples.jsonl': sampleBytes,
    'regression-report.json': json(report), 'regression-report.md': formatReport(report), 'analysis-manifest.json': json(manifest) };
  // Compute/validate before touching output. Exclusive writes preserve prior evidence.
  fs.mkdirSync(destination, { recursive: true });
  for (const [name, bytes] of Object.entries(outputs)) fs.writeFileSync(path.join(destination, name), bytes, { flag: 'wx' });
  log(`Offline analysis finished: ${dataset.games.length} games, ${analysis.coverage.groups} opening families.`);
  log(`Pawn-normalized estimates: ${analysis.normalized.available ? 'available with stated limits' : `unavailable (${analysis.normalized.reason})`}.`);
  log(`Report: ${path.join(destination, 'regression-report.md')}`);
  return { report, manifest, directory: destination };
}

if (require.main === module) main().catch(error => { console.error(`Offline material analysis failed: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, readPilotArchive, formatReport, main, OPENING_GROUPS };
