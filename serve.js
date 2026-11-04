const http = require('http');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self';"
};

const server = http.createServer((req, res) => {
  // Only allow GET and HEAD requests for static file serving
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Method Not Allowed');
  }

  // Parse and normalize path
  const parsedUrl = req.url.split('?')[0];
  const decodedPath = decodeURIComponent(parsedUrl === '/' ? '/index.html' : parsedUrl);
  const normalizedPath = path.normalize(decodedPath);
  const resolvedPath = path.resolve(__dirname, '.' + normalizedPath);

  // 1. Path traversal protection: Path must be strictly within workspace root
  if (!resolvedPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('403 Forbidden');
  }

  // 2. Block access to hidden files and internal directories (.git, .agents, .github, etc.)
  const pathParts = normalizedPath.split(path.sep).filter(Boolean);
  if (pathParts.some(part => part.startsWith('.'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('403 Forbidden');
  }

  // 3. Block access to internal server code and test files
  const baseName = path.basename(resolvedPath).toLowerCase();
  if (baseName === 'serve.js' || baseName.startsWith('test-') || baseName.endsWith('.md')) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('403 Forbidden');
  }

  // 4. Verify file extension is allowed
  const ext = String(path.extname(resolvedPath)).toLowerCase();
  const contentType = mimeTypes[ext];
  if (!contentType) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('404 Not Found');
  }

  // 5. Stat and read file safely
  fs.stat(resolvedPath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      return res.end('404 Not Found');
    }

    fs.readFile(resolvedPath, (err, content) => {
      if (err) {
        console.error('File read error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
        return res.end('500 Internal Server Error');
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        ...SECURITY_HEADERS
      });
      res.end(content);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running with security headers at http://localhost:${PORT}/`);
});
