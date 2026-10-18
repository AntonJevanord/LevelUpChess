// Local-only static server and UCI bridge. Direct HTML play needs no server.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { engineRequest, createPosition, levels, variants } = require('./engine');
const root = path.resolve(__dirname, '..');
const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let busy = false;
let activeController = null;
const json = (res, status, value) => {
  if (res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  // Bind and validate the host and origin so other sites cannot control the local engine.
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
    json(res, 403, { error: 'Open the game from the address printed by npm start.' }); return;
  }
  const route = req.url.split('?')[0];
  if (route.startsWith('/api/')) {
    if (!['/api/engine/status', '/api/engine/move'].includes(route)) { json(res, 404, { error: 'Not found.' }); return; }
    const search = route.endsWith('/move');
    if (req.method !== (search ? 'POST' : 'GET')) { json(res, 405, { error: 'Method not allowed.' }); return; }
    if (busy) { json(res, 429, { error: 'Engine is busy. Please try again.' }); return; }
    let options = {};
    if (search) {
      if (req.headers['content-type'] !== 'application/json') { json(res, 415, { error: 'Expected JSON.' }); return; }
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (body.length > 4096) throw new Error('Request too large.');
        }
        const data = JSON.parse(body);
        const variant = data.variant === undefined ? 'chess' : data.variant;
        if (typeof data.fen !== 'string' || /[\r\n]/.test(data.fen) || !Object.hasOwn(levels, data.difficulty) || !variants.includes(variant)) throw new Error();
        const position = await createPosition(data.fen, variant);
        try {
          if (position.isGameOver()) throw new Error();
          options = { fen: position.fen(), difficulty: data.difficulty, variant };
        } finally { position.dispose?.(); }
      } catch { json(res, 400, { error: 'Expected a playable standard or supported upgrade FEN and easy, medium, or hard difficulty.' }); return; }
    }
    if (res.destroyed) return;
    // Variant validation initializes WASM asynchronously; another request may finish first.
    if (busy) { json(res, 429, { error: 'Engine is busy. Please try again.' }); return; }
    busy = true;
    const controller = new AbortController();
    activeController = controller;
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try { json(res, 200, await engineRequest({ ...options, signal: controller.signal })); }
    catch (error) { json(res, 503, { error: error.message }); }
    finally { busy = false; activeController = null; }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  const routes = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/dist/app.js': 'dist/app.js' };
  const file = routes[route];
  if (!file) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, file), (error, content) => {
    res.writeHead(error ? 500 : 200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : error ? 'Build the application with npm run build.' : content);
  });
});
server.on('error', error => { console.error(`Cannot start local server: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`LevelUp Chess: ${origin}\nOpen this address for Fairy Stockfish play. Keep this terminal running.`));

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  activeController?.abort();
  server.close();
});
