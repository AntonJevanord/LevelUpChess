const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { loadExperiment } = require('../scripts/balance/v17-plan');
const { makeSchedule } = require('../scripts/balance/plan');
const { createDesignRegistry } = require('../scripts/balance/design-registry');
const { compileDesignProfile } = require('../scripts/balance/design-profile');
const { getOfficialReferences } = require('../scripts/balance/official-references');
const { writePreflight } = require('../scripts/version17-balance');
const {
  loadHistoricalReferenceEvidence, loadArchivedReferenceEvidence, buildReferencePanel,
  renderReferencePanel, renderReferencePanelCsv,
} = require('../scripts/balance/reference-panel-report');
const { parseArgs, checkedInput, writePanel, main } = require('../scripts/version17-reference-panel');
const sha = value => createHash('sha256').update(value).digest('hex');
let archived;
test.before(() => { archived = loadArchivedReferenceEvidence(); });
const options = () => ({ loadArchive: () => archived });
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-reference-panel-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

// These are labelled synthetic outcome fixtures, never saved as project evidence.
function fixture(t, experiment, { truncateFirst = false, tornTail = '' } = {}) {
  const root = temporary(t), declaration = loadExperiment(experiment), { config } = declaration;
  const schedule = makeSchedule(config), registry = createDesignRegistry(config);
  const profile = compileDesignProfile(registry, config.evaluation);
  const engineSha256 = '3'.repeat(64), rulesBundleSha256 = '2'.repeat(64);
  const runnerSources = [{ file: 'synthetic-reference-panel-fixture-only.js', sha256: '1'.repeat(64) }];
  const runnerSha256 = sha(JSON.stringify(runnerSources));
  const manifest = { schemaVersion: 1, runId: `synthetic-${experiment}`, config, schedule,
    configHash: sha(JSON.stringify({ config, schedule })), runnerSources, runnerSha256, rulesBundleSha256, engineSha256,
    rulesHash: sha(JSON.stringify({ bundleHash: rulesBundleSha256, runnerSha256,
      profiles: [{ variant: profile.variant, config: profile.config }] })),
    designRegistry: registry, designProfile: { variant: profile.variant, config: profile.config,
      hash: profile.hash, registryHash: registry.hash },
    rulesProfiles: [{ variant: profile.variant, whiteKing: 0, blackKing: 0, configSha256: sha(profile.config),
      file: `rules/${profile.variant}.ini`, royalMode: 'king', evaluationCaveat: null,
      profileHash: profile.hash, registryHash: registry.hash }],
  };
  const diagnostic = getOfficialReferences(), pieces = {};
  for (const reference of diagnostic.roster) {
    const letter = diagnostic.registry.allocations.find(item => item.id === reference.id).letter;
    for (const type of [letter, letter.toUpperCase()]) pieces[type] = Object.fromEntries(
      ['rawMg', 'rawEg', 'captureMg', 'captureEg', 'evalMg', 'evalEg']
        .map(field => [field, reference.engineValue[field.endsWith('Mg') ? 'mg' : 'eg']]));
  }
  writePreflight(root, declaration, { native: true, games: schedule.length, validatedOpenings: schedule.length,
    profileHash: profile.hash, registryHash: registry.hash, engineSha256,
    configSha256: sha(JSON.stringify(config)), referenceValues: { version: 1, pieces },
    referenceValueProfile: { variant: diagnostic.profile.variant, hash: diagnostic.profile.hash,
      registryHash: diagnostic.profile.registryHash } });
  fs.writeFileSync(path.join(root, 'run.json'), JSON.stringify(manifest));
  fs.mkdirSync(path.join(root, 'rules'));
  fs.writeFileSync(path.join(root, manifest.rulesProfiles[0].file), profile.config);
  const records = schedule.map((game, index) => ({ id: game.id, pairId: game.pairId,
    comparisonId: game.comparisonId, openingId: game.openingId, openingMoves: game.openingMoves,
    aColor: game.aColor, attempt: 1, repetition: game.repetition,
    status: truncateFirst && index === 0 ? 'truncated' : 'completed',
    result: truncateFirst && index === 0 ? '*' : game.aColor === 'w' ? '1-0' : '0-1',
    reason: truncateFirst && index === 0 ? 'max-plies' : 'synthetic-report-fixture',
    profileHash: profile.hash, registryHash: registry.hash, registryReference: 'run.json#designRegistry',
    variant: profile.variant, engine: config.engine,
    whiteStrength: game.aColor === 'w' ? game.comparison.strengthA : game.comparison.strengthB,
    blackStrength: game.aColor === 'b' ? game.comparison.strengthA : game.comparison.strengthB,
  }));
  fs.writeFileSync(path.join(root, 'games.jsonl'), records.map(record => JSON.stringify(record) + '\n').join('') + tornTail);
  return { root, declaration, manifest, records, input: checkedInput(root, experiment) };
}

test('the archived panel reuses twenty cells with explicit counts and keeps all new cells pending', () => {
  const panel = buildReferencePanel({}, options());
  assert.deepEqual(panel.archivedCounts, { recordedGames: 2432, pairedGames: 2424, truncatedGames: 4 });
  assert.equal(panel.plannedNewGames, 1216);
  const [primary, singles, pairs] = panel.sections;
  assert.equal(primary.roster.length, 7);
  assert.equal(primary.comparisons.length, 21);
  assert.equal(primary.comparisons.filter(row => row.score !== null).length, 20);
  assert.equal(primary.overall, null);
  assert.match(primary.reasonNoOverall, /128 book-derived.*32 short starts/);
  assert.equal(singles.roster.length, 3);
  assert.equal(pairs.roster.length, 6);
  assert.equal(singles.upgradePoints, 1);
  assert.equal(pairs.upgradePoints, 2);
  assert.ok([...singles.comparisons, ...pairs.comparisons].every(row => row.score === null && row.pairedGames === 0));
  const unicornAmazon = primary.comparisons.find(row => row.aKey === 'unicorn' && row.bKey === 'amazon');
  assert.equal(unicornAmazon.pairedGames, 254);
  assert.equal(unicornAmazon.statusCounts.truncated, 1);
  assert.deepEqual([unicornAmazon.wins, unicornAmazon.draws, unicornAmazon.losses], [115, 30, 109]);
  const level3Pairs = panel.sections[3];
  assert.equal(level3Pairs.id, 'level3-pairs');
  assert.equal(level3Pairs.upgradePoints, 6);
  assert.equal(level3Pairs.roster.length, 6);
  assert.equal(level3Pairs.comparisons.length, 15);
  assert.ok(level3Pairs.comparisons.every(row => row.pairedGames === 16 && row.score !== null));
  assert.deepEqual(panel.archivedLevel3PairCounts, { recordedGames: 240, pairedGames: 240, truncatedGames: 0 });
});

test('historical source corruption fails before a derived material table can supply outcomes', () => {
  assert.throws(() => loadHistoricalReferenceEvidence({ read(file) {
    const bytes = Buffer.from(fs.readFileSync(file)); bytes[10] ^= 1; return bytes;
  } }), /Historical reference outcome audit changed/);
  assert.throws(() => loadHistoricalReferenceEvidence({ read(file) {
    const bytes = Buffer.from(fs.readFileSync(file));
    if (file.endsWith('reference-panel-001.games.jsonl')) bytes[10] ^= 1;
    return bytes;
  } }), /Historical source changed/);
});

test('the missing triple matchup fills only its own cell with correct row perspective', t => {
  const { input } = fixture(t, 'panel-gap');
  const panel = buildReferencePanel({ gap: input }, options());
  const primary = panel.sections[0];
  const king = primary.matrix.rows.find(row => row.key === 'king-step-pawns');
  const grant = primary.matrix.rows.find(row => row.key === 'mobile-forward-grants');
  assert.equal(king.cells.find(cell => cell.columnKey === grant.key).score, 1);
  assert.equal(grant.cells.find(cell => cell.columnKey === king.key).score, 0);
  assert.equal(king.cells.find(cell => cell.columnKey === grant.key).games, 64);
  assert.deepEqual(primary.comparisons.slice(0, -1), archived.comparisons);
  assert.equal(panel.sections[1].comparisons.every(row => row.score === null), true);
  assert.equal(panel.sections[2].comparisons.every(row => row.score === null), true);
});

test('single and double purchase outcomes stay separate from the triple panel and one another', t => {
  const singles = fixture(t, 'panel-level1'), pairs = fixture(t, 'panel-level1-pairs');
  const panel = buildReferencePanel({ singles: singles.input, pairs: pairs.input }, options());
  assert.equal(panel.sections[0].comparisons.at(-1).score, null);
  assert.equal(panel.sections[1].progress.pairedGames, 192);
  assert.equal(panel.sections[2].progress.pairedGames, 960);
  assert.ok(panel.sections[1].comparisons.every(row => row.score === 1 && row.pairedGames === 64));
  assert.ok(panel.sections[2].comparisons.every(row => row.score === 1 && row.pairedGames === 64));
  assert.ok(panel.sections[1].overall.rows.every(row => row.openingCoverage.shared === 32 && row.games === 128));
  assert.ok(panel.sections[2].overall.rows.every(row => row.openingCoverage.shared === 32 && row.games === 320));
});

test('partial pairs and torn journal tails never become draws or claim complete shared coverage', t => {
  const { input } = fixture(t, 'panel-level1-pairs', { truncateFirst: true, tornTail: '{"incomplete"' });
  assert.equal(input.source.tornTailIgnored, true);
  const panel = buildReferencePanel({ pairs: input }, options());
  const pairs = panel.sections[2];
  assert.equal(pairs.progress.completedGames, 959);
  assert.equal(pairs.progress.pairedGames, 958);
  assert.equal(pairs.comparisons.filter(row => row.statusCounts.truncated === 1).length, 1);
  assert.equal(pairs.overall.rows.filter(row => row.openingCoverage.shared === 31).length, 2);
  assert.equal(pairs.overall.rows.filter(row => row.openingCoverage.shared === 32).length, 4);
});

test('changed records, contexts and missing native proofs are rejected before report generation', t => {
  const value = fixture(t, 'panel-gap');
  const records = [...value.input.records]; records[0] = { ...records[0], result: records[0].result === '1-0' ? '0-1' : '1-0' };
  assert.throws(() => buildReferencePanel({ gap: { ...value.input, records } }, options()), /changed its observed outcome records/);
  assert.throws(() => buildReferencePanel({ singles: value.input }, options()), /wrong experiment/);
  const proofFile = path.join(value.root, 'v17-preflight.json'), proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
  proof.validation.referenceValueProfile.hash = 'foreign'; fs.writeFileSync(proofFile, JSON.stringify(proof));
  assert.throws(() => checkedInput(value.root, 'panel-gap'), /reference value profile/);
  fs.unlinkSync(proofFile);
  assert.throws(() => checkedInput(value.root, 'panel-gap'), /ENOENT/);
});

test('owned reports can add run inputs but cannot silently replace or forget existing source runs', t => {
  const root = temporary(t), run = fixture(t, 'panel-gap');
  writePanel(root, buildReferencePanel({}, options()));
  const panel = buildReferencePanel({ gap: run.input }, options());
  writePanel(root, panel);
  const before = fs.readFileSync(path.join(root, 'reference-panel.json'));
  assert.throws(() => writePanel(root, buildReferencePanel({}, options())), /another roster or source run/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'reference-panel.json')), before);
  const other = fixture(t, 'panel-gap'); other.input.manifest.runId += '-different';
  assert.throws(() => writePanel(root, buildReferencePanel({ gap: other.input }, options())), /another roster or source run/);
  const foreign = temporary(t); fs.writeFileSync(path.join(foreign, 'notes.txt'), 'keep');
  assert.throws(() => writePanel(foreign, panel), /new empty directory/);
  assert.equal(fs.readFileSync(path.join(foreign, 'notes.txt'), 'utf8'), 'keep');
});

test('the CLI only reads explicit run folders and writes an offline panel with inspectable counts', t => {
  const gap = fixture(t, 'panel-gap'), root = temporary(t), seen = [];
  const result = main(['--gap', gap.root, '--out', root], { loadArchive: () => archived, log: () => {},
    read: (directory, declaration) => { seen.push([directory, declaration.experiment]); return gap.input; } });
  assert.deepEqual(seen, [[gap.root, 'panel-gap']]);
  assert.equal(result.panel.ownership.gap.runId, gap.manifest.runId);
  const rendered = renderReferencePanel(result.panel);
  assert.match(rendered, /Two-point teams face only other two-point teams/);
  assert.match(rendered, /never starts engines or games/);
  assert.equal(renderReferencePanelCsv(result.panel).trimEnd().split('\n').length, 55);
  assert.ok(fs.existsSync(result.files.markdown));
  assert.throws(() => parseArgs(['--run']), /Unknown argument/);
  assert.throws(() => parseArgs(['--out', 'x', '--out', 'y']), /Repeated argument/);
  assert.throws(() => parseArgs([]), /Supply --out/);
});
