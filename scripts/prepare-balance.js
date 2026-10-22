#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildCampaign } = require('./balance/prepare');
const { validateDesignConfig } = require('./balance/validate-designs');

const HELP = `Prepare a future balance experiment; no matches are played

  npm run balance:prepare -- --roster FILE --out CONFIG.json [options]
  npm run balance:prepare -- --roster FILE --dry-run [options]

  --mode round-robin|reference  Every matchup, or each candidate vs reference
  --max-games N                Hard scheduled-game cap (default 2000)
  --opening-pairs N            Use the first N declared prefixes (default up to 10)
  --openings FILE              JSON array or config containing an openings array
  --nodes N                    Nodes per move (default 100000)
  --seed N                     Fixed schedule seed (default 42)
  --allow-unequal-costs         Explicitly compare differently priced purchases

The roster needs referenceId and candidates with stable design IDs. key, label
and square are optional; default squares are d2/b1/c1/a1/d1 by piece family.
Writing validates every selected army/color/opening and refuses to overwrite
either CONFIG.json or CONFIG.prepare.json. --dry-run previews static checks
without writing files or replaying openings. Review the question and cohort.
`;

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const values = {}, valued = new Set(['roster', 'out', 'mode', 'max-games', 'opening-pairs', 'nodes', 'seed', 'openings']);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const name = typeof flag === 'string' && flag.startsWith('--') ? flag.slice(2) : '';
    if (Object.hasOwn(values, name)) throw new Error(`Repeated argument: ${flag}.`);
    if (['dry-run', 'allow-unequal-costs'].includes(name)) { values[name] = true; continue; }
    if (!valued.has(name)) throw new Error(`Unknown argument: ${flag}. Use --help.`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    values[name] = value;
  }
  if (!values.roster) throw new Error('Select --roster FILE.');
  if (!values.out && !values['dry-run']) throw new Error('Select --out CONFIG.json or --dry-run.');
  for (const key of ['max-games', 'opening-pairs', 'nodes', 'seed']) if (values[key] !== undefined) {
    if (!/^\d+$/.test(values[key]) || !Number.isSafeInteger(Number(values[key]))) throw new Error(`--${key} needs a whole number.`);
    values[key] = Number(values[key]);
  }
  return values;
}

/** Both outputs are exclusive creates. Failure removes only files we created. */
function writePreparedCampaign(result, output) {
  const config = path.resolve(output);
  const preparation = config.replace(/\.json$/i, '') + '.prepare.json';
  const files = [[config, JSON.stringify(result.config, null, 2) + '\n'], [preparation, JSON.stringify(result.preparation, null, 2) + '\n']];
  for (const [file] of files) if (fs.existsSync(file)) throw new Error(`Refusing to overwrite ${file}. Choose a new preparation name.`);
  fs.mkdirSync(path.dirname(config), { recursive: true });
  const created = [];
  try {
    for (const [file, text] of files) {
      const fd = fs.openSync(file, 'wx');
      created.push(file);
      try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
    }
  } catch (error) {
    for (const file of created.reverse()) {
      try { fs.unlinkSync(file); }
      catch (cleanupError) { (error.cleanupErrors ||= []).push(cleanupError); }
    }
    throw error;
  }
  return { config, preparation };
}

async function main(args = process.argv.slice(2), { validate = validateDesignConfig, log = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) { log(HELP); return; }
  const roster = JSON.parse(fs.readFileSync(path.resolve(options.roster), 'utf8'));
  let openings;
  if (options.openings) {
    const input = JSON.parse(fs.readFileSync(path.resolve(options.openings), 'utf8'));
    openings = Array.isArray(input) ? input : input?.openings;
    if (!Array.isArray(openings)) throw new Error('--openings needs a JSON array or an object with an openings array.');
  }
  const result = buildCampaign(roster, {
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options['max-games'] === undefined ? {} : { maxGames: options['max-games'] }),
    ...(options['opening-pairs'] === undefined ? {} : { openingPairs: options['opening-pairs'] }),
    ...(options.nodes === undefined ? {} : { nodes: options.nodes }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(openings === undefined ? {} : { openings }),
    allowUnequalCosts: Boolean(options['allow-unequal-costs']),
  });
  const plan = result.preparation;
  log(`${plan.candidateCount} candidates; ${plan.matchupComparisons} matchups + ${plan.controlComparisons} controls; ${plan.openingPairs} opening pairs; ${plan.scheduledGames}/${plan.maxGames} scheduled games.`);
  if (plan.unequalCosts) log('Different purchase costs are explicitly enabled; this is a handicap comparison.');
  if (options['dry-run']) { log('Preview only: no files written and opening legality has not yet been replayed.'); return result; }
  const validation = await validate(result.config, { standardOpeningSources: true, onProgress: log });
  result.preparation.validation = validation;
  const files = writePreparedCampaign(result, options.out);
  log(`Prepared config: ${files.config}\nPreparation record: ${files.preparation}\nNo games played. Start a new run with the prepared config; keep its declared settings unchanged.`);
  return { ...result, files };
}

if (require.main === module) main().catch(error => { console.error(`Balance preparation: ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, writePreparedCampaign, main };
