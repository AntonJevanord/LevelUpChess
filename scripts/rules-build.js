const fs = require('node:fs');
const path = require('node:path');

function rulesBuildOptions() {
  const wasmPath = path.join(path.dirname(require.resolve('ffish-es6')), 'ffish.wasm');
  return {
    loader: { '.ini': 'text' },
    define: { 'import.meta.url': '""' },
    plugins: [{
      name: 'embedded-variant-wasm',
      setup(build) {
        build.onResolve({ filter: /^variant-wasm$/ }, () => ({ path: wasmPath, namespace: 'embedded-wasm' }));
        build.onLoad({ filter: /.*/, namespace: 'embedded-wasm' }, args => ({ contents: `export default ${JSON.stringify(fs.readFileSync(args.path).toString('base64'))};`, loader: 'js' }));
      },
    }],
  };
}
module.exports = { rulesBuildOptions };
