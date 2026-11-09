'use strict';

// Build the playable page and its engine-bridge facade without rewriting the
// frozen balance bundle used by running scientific experiments.
// Curated profile JSON/INI files are committed separately from browser assets.
const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { rulesBuildOptions } = require('./rules-build');

async function buildPlayable(root = path.resolve(__dirname, '..')) {
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
  const css = ['styles.css', 'src/board-appearance.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const js = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
  const html = template
    .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
    .replace('  <script defer src="dist/app.js"></script>\n', '')
    .replace('</body>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`);
  fs.writeFileSync(path.join(root, 'index.html'), html);
}

if (require.main === module) buildPlayable().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildPlayable };
