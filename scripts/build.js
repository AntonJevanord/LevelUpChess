const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { rulesBuildOptions } = require('./rules-build');
const { buildKings } = require('./build-kings');

async function main() {
  const root = path.resolve(__dirname, '..');
  await build({
    ...rulesBuildOptions(),
    absWorkingDir: root,
    entryPoints: ['src/app.js'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/app.js',
    legalComments: 'eof',
  });
  await build({
    ...rulesBuildOptions(),
    absWorkingDir: root,
    entryPoints: ['src/variant-game.js'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/rules-node.cjs',
    legalComments: 'eof',
  });
  const template = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
  // Embed assets so downloading or previewing just index.html is sufficient.
  const html = template
    .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
    .replace('  <script defer src="dist/app.js"></script>\n', '')
    .replace('</body>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fs.copyFileSync(path.join(root, 'node_modules/chess.js/LICENSE'), path.join(root, 'dist/chess.js-LICENSE.txt'));
  fs.copyFileSync(path.join(root, 'stockfish/COPYING.txt'), path.join(root, 'dist/ffish-LICENSE.txt'));
  await buildKings(root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
