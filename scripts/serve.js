// Small local development server; gameplay also works by opening index.html.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  const routes = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/dist/app.js': 'dist/app.js' };
  const file = routes[req.url.split('?')[0]];
  if (!file) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, file), (error, content) => {
    res.writeHead(error ? 500 : 200, { 'Content-Type': types[path.extname(file)] });
    res.end(error ? 'Build the application with npm run build.' : content);
  });
}).listen(4173, '127.0.0.1', () => console.log('Development server listening on port 4173'));
