// Receives rendered frames from the browser (POST /frame/<n>, PNG body) and
// writes them to a folder, so a WebGL page can be rendered frame by frame.
// Also serves the repo's static files, so the page and the sink share an origin.
// node tools/frame-sink.mjs <dir> [port=5321]
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wav': 'audio/wav', '.mid': 'audio/midi' };
const [dir, port = '5321'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  const m = req.url.match(/^\/frame\/(\d+)$/);
  if (req.method === 'GET') {
    const f = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', TYPES[extname(f)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); // always the latest engine code
    return res.end(readFileSync(f));
  }
  if (req.method !== 'POST' || !m) { res.statusCode = 404; return res.end(); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => { writeFileSync(`${dir}/f${m[1].padStart(5, '0')}.png`, Buffer.concat(chunks)); res.end('ok'); });
}).listen(+port, '127.0.0.1', () => console.log(`frame sink on ${port} -> ${dir}`));
