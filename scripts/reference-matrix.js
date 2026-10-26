#!/usr/bin/env node
'use strict';
const { writeReferenceMatrix } = require('./balance/reference-matrix');
const HELP = `Four-reference matchup matrix (offline; no games or material fits)

  npm run material:matrix -- --out DIRECTORY
  npm run material:matrix -- --bishop BISHOP-DIRECTORY-OR-REPORT --out DIRECTORY
  npm run material:matrix -- --bishop BISHOP-DIRECTORY-OR-REPORT --revisions REVISION-DIRECTORY-OR-JOURNAL --out DIRECTORY

Defaults display the completed 1,280-game bishop study and preserve the
full historical bishop/QN/NC reported scores separately from recovered raw data.
--revisions searches retained journals for missing original games, without
replaying them. The gap inventory is not a launchable campaign. No engine,
Python, EPD export or running-study edit is involved. A tool-owned matrix output
can be refreshed; choose an output outside source/running-study directories.
`;
function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--bishop', '--revisions', '--out'].includes(flag)) throw new Error(`Unknown option ${flag}. Use --help.`);
    const key = flag.slice(2), value = args[++index];
    if (Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error(`Repeated option or missing value for ${flag}.`);
    options[key] = value;
  }
  if (!options.out) throw new Error('--out DIRECTORY is required.');
  return options;
}
function main(args = process.argv.slice(2), services = {}) {
  const options = parseArgs(args), log = services.log || console.log;
  if (options.help) { log(HELP); return { help: true }; }
  const result = (services.writeReferenceMatrix || writeReferenceMatrix)(options);
  log(`Reference matrix: ${result.files['matrix.md']}`);
  log(`Recovered ${result.gapPlan.recoveredCompletedGames}/512 original bishop/QN/NC games; ${result.gapPlan.remainingGames} absent or unfinished. No games started.`);
  return result;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(`Reference matrix failed: ${error.message}`); process.exitCode = 1; }
}
module.exports = { parseArgs, main };
