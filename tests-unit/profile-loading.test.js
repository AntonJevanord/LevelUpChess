const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');

test('an explicit profile loads alone, reuses its module, and stays isolated when others load', { timeout: 30000 }, () => {
  const source = `
    const assert = require('node:assert/strict');
    const { PLAYABLE_PROFILE, PLAYABLE_PROFILES, getProfileSnapshot } = require(${JSON.stringify(require.resolve('../src/design-options'))});
    const { initVariantRules, VariantGame, VARIANT, CURRENT_VARIANT, EXPERIMENTAL_VARIANT, SUPPORTED_VARIANTS } = require(process.argv[1]);
    (async () => {
      const first = initVariantRules(EXPERIMENTAL_VARIANT);
      assert.equal(initVariantRules(EXPERIMENTAL_VARIANT), first);
      const experimentalModule = await first;
      for (const variant of SUPPORTED_VARIANTS.filter(value => value !== EXPERIMENTAL_VARIANT)) {
        assert.throws(() => new VariantGame(undefined, variant), /Call initVariantRules/);
      }
      const pawn = PLAYABLE_PROFILE.registry.allocations.find(allocation => allocation.id === 'pawn.purple@5').letter.toUpperCase();
      const experimental = new VariantGame('8/7k/8/8/3' + pawn + '4/8/8/K7 w - - 0 1', EXPERIMENTAL_VARIANT);
      const targets = game => game.moves({ square: 'd4', verbose: true }).map(move => move.to);
      assert.ok(targets(experimental).includes('d6'));
      assert.ok(!targets(experimental).includes('d7'));
      const secondProfile = PLAYABLE_PROFILES.find(profile => profile.variant !== EXPERIMENTAL_VARIANT);
      assert.ok(secondProfile, 'the original library stays available');
      const secondModule = await initVariantRules(secondProfile.variant);
      assert.notEqual(secondModule, experimentalModule);
      const second = new VariantGame(undefined, secondProfile.variant);
      assert.equal(second.profile.hash, secondProfile.hash);
      assert.equal(second.profile.variant, secondProfile.variant);
      const otherSnapshot = Buffer.from(JSON.stringify(getProfileSnapshot(EXPERIMENTAL_VARIANT))).toString('base64');
      assert.throws(() => second.setHeader('LevelUpProfile', otherSnapshot), /does not match/);
      assert.throws(() => second.loadPgn(second.pgn().replace(second.getHeaders().LevelUpProfile, otherSnapshot)), /does not match/);
      second.reset();
      assert.equal(JSON.parse(Buffer.from(second.getHeaders().LevelUpProfile, 'base64').toString()).variant, secondProfile.variant);
      second.dispose();
      const currentModule = await initVariantRules(CURRENT_VARIANT);
      assert.notEqual(currentModule, experimentalModule);
      const current = new VariantGame('7k/8/8/8/3G4/8/8/K7 w - - 0 1', CURRENT_VARIANT);
      assert.ok(targets(current).includes('d5'));
      assert.equal(await initVariantRules(EXPERIMENTAL_VARIANT), experimentalModule);
      await assert.rejects(initVariantRules('unsupported-profile'), /not supported/);
      assert.throws(() => new VariantGame(undefined, 'unsupported-profile'), /not supported/);
      const all = initVariantRules();
      assert.equal(initVariantRules(), all);
      assert.equal(await all, await initVariantRules(VARIANT));
      for (const variant of SUPPORTED_VARIANTS) {
        const game = new VariantGame(undefined, variant);
        assert.equal(game.moves().length, 20);
        game.dispose();
      }
      assert.ok(targets(current).includes('d5'));
      assert.ok(!targets(experimental).includes('d7'));
      current.dispose(); experimental.dispose();
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const child = spawnSync(process.execPath, ['-e', source, require.resolve('../dist/rules-node.cjs')], { encoding: 'utf8', timeout: 25000 });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test('failed module and all-profile promises are shared, evicted, and retried', { timeout: 15000 }, async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'levelup-profile-loading-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'rules.cjs');
  const variants = ['levelup-knight', 'levelup', 'levelup-v5', ...require('../src/design-options').EXPERIMENTAL_VARIANTS].join(' ');
  const trace = { attempts: 0, configs: [], failNext: true };
  globalThis.__levelupProfileLoadingTest = trace;
  t.after(() => { delete globalThis.__levelupProfileLoadingTest; });
  await build({
    entryPoints: [path.resolve(__dirname, '../src/variant-game.js')],
    bundle: true, platform: 'node', format: 'cjs', outfile: output,
    loader: { '.ini': 'text' },
    plugins: [{
      name: 'profile-loading-boundary',
      setup(builder) {
        builder.onResolve({ filter: /^(ffish-es6|variant-wasm)$/ }, args => ({ path: args.path, namespace: 'profile-loading-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'profile-loading-test' }, args => ({ loader: 'js', contents: args.path === 'variant-wasm' ? 'export default "";' : `
          export default async function() {
            const trace = globalThis.__levelupProfileLoadingTest;
            trace.attempts++;
            if (trace.failNext) { trace.failNext = false; throw new Error('Injected initialization failure'); }
            return { loadVariantConfig(config) { trace.configs.push(config); }, variants() { return ${JSON.stringify(variants)}; } };
          }
        ` }));
      },
    }],
  });
  const { initVariantRules, CURRENT_VARIANT } = require(output);
  const first = initVariantRules(CURRENT_VARIANT);
  assert.equal(initVariantRules(CURRENT_VARIANT), first);
  await assert.rejects(first, /Injected initialization failure/);
  assert.equal(trace.attempts, 1);
  const retry = initVariantRules(CURRENT_VARIANT);
  assert.notEqual(retry, first);
  const module = await retry;
  assert.equal(trace.attempts, 2);
  assert.equal(trace.configs.length, 1);
  assert.match(trace.configs[0], /\[levelup-v5:chess\]/);
  assert.equal(initVariantRules(CURRENT_VARIANT), retry);
  assert.equal(await initVariantRules(CURRENT_VARIANT), module);
  await assert.rejects(initVariantRules('unknown'), /not supported/);
  assert.equal(trace.attempts, 2);
  trace.failNext = true;
  const failedAll = initVariantRules();
  assert.equal(initVariantRules(), failedAll);
  await assert.rejects(failedAll, /Injected initialization failure/);
  const attemptsBeforeRetry = trace.attempts;
  const allRetry = initVariantRules();
  assert.notEqual(allRetry, failedAll);
  assert.equal(initVariantRules(), allRetry);
  assert.equal(await allRetry, await initVariantRules('levelup-knight'));
  assert.equal(trace.attempts, attemptsBeforeRetry + 1, 'retry only the failed profile, keeping successful siblings');
  assert.equal(trace.configs.length, 3 + require('../src/design-options').EXPERIMENTAL_VARIANTS.length);
});
