const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { rulesBuildOptions } = require('./rules-build');

async function buildKings(root = path.resolve(__dirname, '..')) {
  const directory = path.join(root, 'prototypes/kings');
  const result = await build({
    ...rulesBuildOptions(),
    absWorkingDir: root,
    entryPoints: ['prototypes/kings/app.js'],
    bundle: true,
    format: 'iife',
    legalComments: 'eof',
    write: false,
  });
  const css = fs.readFileSync(path.join(directory, 'styles.css'), 'utf8');
  const js = result.outputFiles[0].text;
  const template = fs.readFileSync(path.join(directory, 'template.html'), 'utf8');
  const html = template
    .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
    .replace('  <script defer src="app.js"></script>\n', '')
    .replace('</body>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`);
  fs.writeFileSync(path.join(directory, 'index.html'), html);
}

module.exports = { buildKings };
if (require.main === module) buildKings().catch(error => { console.error(error); process.exitCode = 1; });
