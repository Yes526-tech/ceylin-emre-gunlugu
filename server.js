const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Ensure local data store directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// In-memory local database cached from disk
let localDB = {};
try {
  if (fs.existsSync(DB_FILE)) {
    localDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{}');
  }
} catch (e) {
  localDB = {};
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(localDB, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local db:', e);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:' + PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // =========================================================================
  // 1. BUILT-IN LOCAL JSON SYNC API (/api/sync)
  // =========================================================================
  if (pathname === '/api/sync' || pathname === '/.netlify/functions/sync') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          const key = json.key;
          const data = json.data;
          if (!key) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Key is required' }));
            return;
          }
          const now = Date.now();
          localDB[key] = { data: data, updatedAt: now };
          if (!localDB._timestamps) localDB._timestamps = { data: {}, updatedAt: now };
          localDB._timestamps.data[key] = now;
          saveDB();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, key: key, updatedAt: now }));
        } catch (parseErr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: parseErr.message }));
        }
      });
      return;
    } else {
      const q = Object.fromEntries(parsedUrl.searchParams.entries());

      if (q.timestamps === '1' || q.meta === '1') {
        const ts = (localDB._timestamps && localDB._timestamps.data) || {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, timestamps: ts }));
        return;
      }

      if (q.keys) {
        const reqKeys = q.keys.split(',').map(k => k.trim()).filter(Boolean);
        const results = {};
        for (const k of reqKeys) {
          if (localDB[k]) results[k] = localDB[k];
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, data: results }));
        return;
      }

      if (q.all === '1' || q.all === 'true') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, all: true, data: localDB }));
        return;
      }

      const key = q.key;
      if (!key) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, all: true, data: localDB }));
        return;
      }

      const item = localDB[key];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        key: key,
        data: item ? item.data : null,
        updatedAt: item ? item.updatedAt : null
      }));
      return;
    }
  }

  // =========================================================================
  // 2. STATIC ASSETS & STREAMING (With Range support for MP3 audio)
  // =========================================================================
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  } else if (pathname === '/playlist') {
    pathname = '/playlist.html';
  }

  let filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT' && !path.extname(filePath)) {
        const altPath = filePath + '.html';
        if (fs.existsSync(altPath)) {
          serveFile(altPath, fs.statSync(altPath), req, res);
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      fs.stat(filePath, (err2, stats2) => {
        if (err2 || !stats2.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        serveFile(filePath, stats2, req, res);
      });
      return;
    }

    serveFile(filePath, stats, req, res);
  });
});

function serveFile(filePath, stats, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const totalSize = stats.size;

  // Crucial: HTTP 206 Range requests for HTML5 Audio (Safari/Chrome seek support)
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`
      });
      res.end();
      return;
    }

    const chunksize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': totalSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✨ Ceylin & Emre Günlüğü 2.0 Sunucusu Yayında:`);
  console.log(`   👉 Yerel Masaüstü: http://localhost:${PORT}`);
  console.log(`   👉 iPhone & Ağ:    http://0.0.0.0:${PORT}`);
});
