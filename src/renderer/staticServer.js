/**
 * Tiny localhost static server so ESM / import-map scenes (Three.js) load under http://
 * instead of file:// (Chromium blocks many module loads from file URLs).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

export function needsHttpScene(html) {
  return /type\s*=\s*["']module["']/.test(html) || /importmap/.test(html);
}

/**
 * @param {string} rootDir absolute directory to serve
 * @returns {Promise<{ urlFor: (fileName:string)=>string, close: ()=>Promise<void>, port:number }>}
 */
export function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      let rel = decodeURIComponent(u.pathname);
      if (rel === '/') {
        res.writeHead(404);
        res.end('missing file');
        return;
      }
      rel = rel.replace(/^\/+/, '');
      const file = path.resolve(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err.message || err));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        urlFor(fileName) {
          return `http://127.0.0.1:${port}/${String(fileName).replace(/^\/+/, '')}`;
        },
        close() {
          return new Promise((resClose) => server.close(() => resClose()));
        }
      });
    });
  });
}
