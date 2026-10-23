'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { normalizeConfig, makeSchedule } = require('./plan');
const { createDesignRegistry } = require('./design-registry');
const { compileDesignProfile } = require('./design-profile');
const { makeLevel3Report } = require('./level3-report');
const { summarize } = require('./stats');

const ROOT = path.resolve(__dirname, '../..');
const POLICIES = Object.freeze(['auto', 'eight']);
const DIRECTORIES = Object.freeze({ auto: 'automatic', eight: 'eight-point' });
const MANIFEST = 'rook-values-campaign.json';
const FILES = Object.freeze({ roster: 'rook-values-roster.json', auto: 'rook-values-auto.json', eight: 'rook-values-eight.json' });
const FROZEN_SHA = Object.freeze({ roster: '0724881030724bbd10f6fe2cd499f9eb14c2eddcad2951290ae66f3046647e7d', auto: '71d1b54cc1eecd19e724972a3a7359ad3dd542e8b67715232c3049fcd3ca1853', eight: '8ecece4618f48fd9927baf388b75406102542238b700f5c40ef71698656dc038' });
const COORDINATOR_FILES = ['scripts/balance/parallel.js', 'scripts/balance/parallel-worker.js', 'scripts/parallel-balance.js', 'scripts/rook-values-balance.js', 'scripts/balance/rook-values-report.js'];
const hash = input => createHash('sha256').update(input).digest('hex');
const fingerprint = input => hash(JSON.stringify(input));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percent = value => value === null ? '—' : `${(100 * value).toFixed(1)}%`;

function getCampaign() {
  const loaded = Object.fromEntries(Object.entries(FILES).map(([key, file]) => {
    const filename = path.join(ROOT, 'experiments/balance', file);
    // Git can check JSON out with Windows line endings without changing rules.
    const source = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
    if (hash(source) !== FROZEN_SHA[key]) throw new Error('The frozen rook valuation cohort, policies or roster changed. Use its original checkout.');
    return [key, { value: JSON.parse(source), filename }];
  }));
  const roster = loaded.roster.value;
  const policies = Object.fromEntries(POLICIES.map(policy => {
    const config = normalizeConfig(loaded[policy].value), schedule = makeSchedule(config);
    const registry = createDesignRegistry(config), profile = compileDesignProfile(registry, config.evaluation);
    return [policy, { config, schedule, registry, profile, configFile: loaded[policy].filename }];
  }));
  if (roster.maxGames !== 400 || roster.gamesPerPolicy !== 200 || roster.openingPairs !== 20
    || policies.auto.schedule.length !== 200 || policies.eight.schedule.length !== 200
    || !isDeepStrictEqual(policies.auto.registry, policies.eight.registry)
    || policies.auto.profile.hash === policies.eight.profile.hash) throw new Error('The rook valuation campaign must retain 400 games and one allocation with distinct automatic/eight-point profiles.');
  const withoutPolicy = config => { const copy = structuredClone(config); delete copy.name; delete copy.evaluation; return copy; };
  if (!isDeepStrictEqual(withoutPolicy(policies.auto.config), withoutPolicy(policies.eight.config))) throw new Error('Only material valuation may differ between the two policies.');
  return { roster, policies };
}

function coordinatorSources() { return COORDINATOR_FILES.map(file => ({ file, sha256: hash(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')) })); }

function createCampaignManifest(jobs, engineIdentity) {
  const { policies } = getCampaign();
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Use 1–16 workers.');
  return {
    schemaVersion: 1, format: 'levelup-rook-values-campaign', campaignId: randomUUID(), createdAt: new Date().toISOString(),
    scheduledGames: 400, gamesPerPolicy: 200, openingPairs: 20, jobs,
    configHashes: Object.fromEntries(POLICIES.map(policy => [policy, fingerprint(policies[policy].config)])),
    registryHash: policies.auto.registry.hash,
    profileHashes: Object.fromEntries(POLICIES.map(policy => [policy, policies[policy].profile.hash])),
    engineIdentity, coordinatorSources: coordinatorSources(),
  };
}

function verifyCampaignRoot(manifest) {
  const { policies } = getCampaign();
  if (!manifest || manifest.schemaVersion !== 1 || manifest.format !== 'levelup-rook-values-campaign'
    || typeof manifest.campaignId !== 'string' || !manifest.campaignId || manifest.scheduledGames !== 400
    || manifest.gamesPerPolicy !== 200 || manifest.openingPairs !== 20
    || !Number.isSafeInteger(manifest.jobs) || manifest.jobs < 1 || manifest.jobs > 16
    || manifest.registryHash !== policies.auto.registry.hash
    || !isDeepStrictEqual(manifest.configHashes, Object.fromEntries(POLICIES.map(p => [p, fingerprint(policies[p].config)])))
    || !isDeepStrictEqual(manifest.profileHashes, Object.fromEntries(POLICIES.map(p => [p, policies[p].profile.hash])))) throw new Error('This is not the frozen 400-game rook valuation campaign.');
  for (const key of ['engineSha256', 'rulesBundleSha256', 'runnerSha256']) {
    if (!/^[a-f0-9]{64}$/.test(manifest.engineIdentity?.[key])) throw new Error('The rook campaign must preserve its engine/build identity.');
  }
  if (!Array.isArray(manifest.engineIdentity.runnerSources) || !manifest.engineIdentity.runnerSources.length
    || !Array.isArray(manifest.coordinatorSources) || manifest.coordinatorSources.length !== COORDINATOR_FILES.length
    || !isDeepStrictEqual(manifest.coordinatorSources.map(item => item.file), COORDINATOR_FILES)
    || manifest.coordinatorSources.some(item => !/^[a-f0-9]{64}$/.test(item.sha256))) throw new Error('The rook campaign source identities are missing.');
  return manifest;
}

function verifyCurrentIdentity(manifest, identity) {
  verifyCampaignRoot(manifest);
  if (!isDeepStrictEqual(manifest.engineIdentity, identity) || !isDeepStrictEqual(manifest.coordinatorSources, coordinatorSources())) throw new Error('Cannot continue: the rook campaign engine, rules, runner or coordinator changed. Keep the matching build for both policies.');
}

function verifyPolicyManifest(manifest, policy, campaign) {
  if (!POLICIES.includes(policy)) throw new Error('Select policy auto or eight.');
  const expected = getCampaign().policies[policy];
  if (!manifest || !isDeepStrictEqual(normalizeConfig(manifest.config), expected.config) || !isDeepStrictEqual(manifest.schedule, expected.schedule)) throw new Error(`This is not the complete frozen 200-game ${policy} policy.`);
  if (campaign) {
    verifyCampaignRoot(campaign);
    for (const key of ['engineSha256', 'rulesBundleSha256', 'runnerSha256', 'runnerSources']) {
      if (!isDeepStrictEqual(manifest[key], campaign.engineIdentity[key])) throw new Error('Both rook policies must use the same frozen engine, rules bundle and runner.');
    }
    if (manifest.parallel?.jobs !== campaign.jobs
      || !isDeepStrictEqual(manifest.parallel?.sources, campaign.coordinatorSources.slice(0, 3))) throw new Error('Rook policy worker count or coordinator differs from the frozen campaign.');
  }
  return expected;
}

function readJournal(directory) {
  let input;
  try { input = fs.readFileSync(path.join(directory, 'games.jsonl'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return input.slice(0, input.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(JSON.parse);
}

// Count observable exchanges from complete paired histories. This is not a move
// legality audit and never claims a trade was forced, mistaken or causal.
function exchangePatterns(records) {
  let analyzedGames = 0, amazonTakesBlinkThenRecaptured = 0, blinkCapturesAmazon = 0;
  for (const record of records) {
    if (!Array.isArray(record.moves) || !record.moves.length || record.moves.length !== record.totalPlies
      || record.moves.some(move => typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move))) continue;
    analyzedGames++;
    const blinkWhite = record.aColor === 'w';
    let blink = blinkWhite ? 'a1' : 'a8', amazon = blinkWhite ? 'd8' : 'd1', pending = null;
    let traded = false, captured = false;
    for (let ply = 0; ply < record.moves.length; ply++) {
      const move = record.moves[ply], from = move.slice(0, 2), to = move.slice(2, 4), blinkTurn = (ply % 2 === 0) === blinkWhite;
      const isBlink = blinkTurn && from === blink, isAmazon = !blinkTurn && from === amazon;
      const amazonTaken = blinkTurn && amazon !== null && to === amazon;
      if (amazonTaken) {
        if (isBlink) captured = true;
        if (pending && pending.ply === ply - 1 && pending.square === to) traded = true;
        amazon = null;
      }
      pending = null;
      if (!blinkTurn && blink !== null && to === blink) {
        blink = null;
        if (isAmazon) pending = { ply, square: to };
      }
      if (isBlink) blink = to;
      if (isAmazon) amazon = to;
      const rank = blinkWhite ? '1' : '8';
      if (blinkTurn && from === 'e' + rank && to === 'c' + rank && blink === 'a' + rank) blink = 'd' + rank;
    }
    if (traded) amazonTakesBlinkThenRecaptured++;
    if (captured) blinkCapturesAmazon++;
  }
  return { analyzedGames, amazonTakesBlinkThenRecaptured, blinkCapturesAmazon,
    interpretation: 'Observed move-history patterns only; no proof of legal replay, forced trades, engine mistakes or causation.' };
}

function pairedHistories(records, comparisonId) {
  const latest = new Map();
  for (const record of records) if (record.comparisonId === comparisonId && record.status === 'completed' && ['1-0', '0-1', '1/2-1/2'].includes(record.result)) latest.set(record.id, record);
  const pairs = new Map();
  for (const record of latest.values()) { if (!pairs.has(record.pairId)) pairs.set(record.pairId, []); pairs.get(record.pairId).push(record); }
  return [...pairs.values()].filter(pair => pair.length === 2 && pair[0].aColor !== pair[1].aColor).flat();
}

function policyReport(manifest, records, policy, campaign) {
  const expected = verifyPolicyManifest(manifest, policy, campaign), { roster } = getCampaign();
  const base = makeLevel3Report(manifest, records, roster);
  const aggregates = new Map(summarize(records).comparisons.map(row => [row.comparisonId, row]));
  const candidates = roster.candidates.filter(candidate => candidate.id !== roster.referenceId).map(candidate => {
    const matchup = base.matrix[candidate.id][roster.referenceId], aggregate = aggregates.get(matchup.comparisonId);
    return { id: candidate.id, label: candidate.label, comparisonId: matchup.comparisonId, score: matchup.score,
      complete: matchup.scoredGames === matchup.scheduledGames, completePairs: matchup.completePairs, plannedPairs: 20,
      wins: aggregate?.paired.wins || 0, draws: aggregate?.paired.draws || 0, losses: aggregate?.paired.losses || 0,
      openingClusters: matchup.openingClusters, statusCounts: matchup.statusCounts,
      exchanges: exchangePatterns(pairedHistories(records, matchup.comparisonId)) };
  });
  return { policy, runId: manifest.runId, scheduledGames: 200, profileHash: expected.profile.hash, registryHash: expected.registry.hash,
    evaluation: expected.config.evaluation || null, engineSha256: manifest.engineSha256,
    finished: base.timing.remainingGames === 0, complete: candidates.every(row => row.complete) && base.controls.every(row => row.scoredGames === row.scheduledGames),
    statusCounts: base.statusCounts, totalAttempts: base.totalAttempts, controls: base.controls, candidates, timing: base.timing };
}

function makeRookValuesReport(campaign, runs) {
  verifyCampaignRoot(campaign);
  const { roster } = getCampaign();
  const policies = Object.fromEntries(POLICIES.map(policy => [policy, runs[policy] ? policyReport(runs[policy].manifest, runs[policy].records, policy, campaign) : null]));
  const comparisons = roster.candidates.filter(candidate => candidate.id !== roster.referenceId).map(candidate => {
    const a = policies.auto?.candidates.find(row => row.id === candidate.id), b = policies.eight?.candidates.find(row => row.id === candidate.id);
    const maps = [a, b].map(row => new Map((row?.openingClusters || []).map(opening => [opening.openingId, opening.score])));
    const shared = [...maps[0].keys()].filter(key => maps[1].has(key)).sort();
    const automaticScore = mean(shared.map(key => maps[0].get(key))), eightPointScore = mean(shared.map(key => maps[1].get(key)));
    return { id: candidate.id, label: candidate.label, sharedOpenings: shared.length, plannedOpenings: 20,
      automaticScore, eightPointScore, scoreDifference: automaticScore === null ? null : eightPointScore - automaticScore,
      complete: Boolean(a?.complete && b?.complete), assessment: !shared.length ? 'unscored' : a?.complete && b?.complete ? 'descriptive-comparison' : 'provisional-comparison',
      openingScores: shared.map(openingId => ({ openingId, automatic: maps[0].get(openingId), eightPoint: maps[1].get(openingId) })) };
  });
  return { schemaVersion: 1, format: 'levelup-rook-values-report', campaignId: campaign.campaignId, scheduledGames: 400,
    fixedTotalPoints: 8, pointScale: roster.pointScale, policies, comparisons,
    finished: POLICIES.every(policy => policies[policy]?.finished), complete: POLICIES.every(policy => policies[policy]?.complete),
    interpretation: 'Compare the two policies on shared, fully scored color-swapped opening pairs. Positive change means the Blink army scored more points under the eight-point setting. Both engines use the same policy in each game. This measures sensitivity to engine material assumptions, not intrinsic material strength, calibrated engine Elo or proof of statistical significance. Related fixed openings and one search budget limit generalization. No automatic additional run follows.' };
}

function readCampaignDirectory(directory) {
  const root = path.resolve(directory), campaign = verifyCampaignRoot(JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'))), runs = {};
  for (const policy of POLICIES) {
    const dir = path.join(root, DIRECTORIES[policy]);
    try { runs[policy] = { manifest: JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8')), records: readJournal(dir) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { root, campaign, runs };
}

function render(report) {
  const rows = report.comparisons.map(row => `| ${row.label} | ${percent(row.automaticScore)} | ${percent(row.eightPointScore)} | ${row.scoreDifference === null ? '—' : `${row.scoreDifference >= 0 ? '+' : ''}${(100 * row.scoreDifference).toFixed(1)} pp`} | ${row.sharedOpenings}/20 | ${row.assessment} |`).join('\n');
  const policyDetails = POLICIES.map(policy => {
    const state = report.policies[policy];
    if (!state) return `## ${policy === 'auto' ? 'Automatic' : 'Eight-point'} policy\n\nNot started. No evidence available.\n`;
    const candidates = state.candidates.map(row => `- ${row.label}: ${percent(row.score)}, ${row.completePairs}/20 complete pairs; W/D/L ${row.wins}/${row.draws}/${row.losses}; ${row.statusCounts.truncated} truncated, ${row.statusCounts.error} error attempts. Recorded paired histories: ${row.exchanges.analyzedGames}; Amazon takes Blink and is immediately recaptured: ${row.exchanges.amazonTakesBlinkThenRecaptured}; Blink captures Amazon: ${row.exchanges.blinkCapturesAmazon}.`).join('\n');
    const controls = state.controls.map(row => `- ${row.label}: A ${percent(row.scoreA)}, ${row.completePairs}/20 complete pairs; physical White ${row.physicalColors.whiteWins} wins / ${row.physicalColors.draws} draws / ${row.physicalColors.blackWins} losses.`).join('\n');
    return `## ${policy === 'auto' ? 'Automatic' : 'Eight-point'} policy\n\n${state.complete ? 'Fully scored.' : state.finished ? 'Finished with unscored pairs; inspect coverage.' : 'Incomplete; scores are provisional.'}\n\n${candidates}\n\n### Controls\n\n${controls}\n\nExchange counts describe recorded histories; they do not establish forced moves, mistakes or causation. Controls exercise scoring and completion, not true material calibration.\n`;
  }).join('\n');
  return `# Blink rook: automatic versus eight-point valuation\n\n${report.complete ? 'All 400 scheduled games are scored.' : report.finished ? 'All games finished; unscored pairs remain.' : 'Campaign incomplete; inspect policy and shared-opening coverage.'}\n\n${report.interpretation}\n\nEight points uses ordinary rook = five: middlegame 2,042 and endgame 2,208 internal engine units. This is a declared target assumption, not a measured eight-pawn value. Amazon and ordinary-piece defaults are unchanged.\n\n| Design | Automatic points | Eight-point points | Change | Shared openings | Coverage |\n| --- | ---: | ---: | ---: | ---: | --- |\n${rows}\n\n${policyDetails}\nCampaign: ${report.campaignId}. No automatic keep/revise/park decision or follow-up experiment is made.\n`;
}

function writeRookValuesReport(directory) {
  const { root, campaign, runs } = readCampaignDirectory(directory), report = makeRookValuesReport(campaign, runs);
  const files = { json: path.join(root, 'rook-values-report.json'), markdown: path.join(root, 'rook-values-report.md'), csv: path.join(root, 'rook-values-scores.csv') };
  fs.writeFileSync(files.json, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(files.markdown, render(report));
  const rows = [['design_id', 'design', 'automatic_shared_score', 'eight_point_shared_score', 'difference', 'shared_openings', 'assessment'], ...report.comparisons.map(row => [row.id, row.label, row.automaticScore, row.eightPointScore, row.scoreDifference, row.sharedOpenings, row.assessment])];
  fs.writeFileSync(files.csv, rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n');
  return { report, files };
}

module.exports = { POLICIES, DIRECTORIES, MANIFEST, getCampaign, createCampaignManifest, verifyCampaignRoot, verifyCurrentIdentity, verifyPolicyManifest, coordinatorSources, readCampaignDirectory, makeRookValuesReport, writeRookValuesReport, exchangePatterns, fingerprint };
