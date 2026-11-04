const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const outDir = path.join(__dirname, '..', 'out');
const publicHeadersPath = path.join(__dirname, '..', 'public', '_headers');
const outHeadersPath = path.join(outDir, '_headers');

if (!fs.existsSync(outDir)) {
  console.log('[generate-csp] out directory does not exist, skipping.');
  process.exit(0);
}

// Find all HTML files recursively in out/
function findHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findHtmlFiles(fullPath));
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

const htmlFiles = findHtmlFiles(outDir);
const allHashes = new Set();
const perFileHashes = new Map();

for (const filePath of htmlFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileHashes = new Set();
  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    const scriptContent = match[1];
    const hash = crypto.createHash('sha256').update(scriptContent, 'utf8').digest('base64');
    const hashFormatted = `'sha256-${hash}'`;
    fileHashes.add(hashFormatted);
    allHashes.add(hashFormatted);
  }
  perFileHashes.set(filePath, fileHashes);
}

const rawApiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL ? process.env.NEXT_PUBLIC_API_BASE_URL.trim() : '';
const connectSrc = rawApiOrigin ? `'self' ${rawApiOrigin}` : "'self'";
const hashList = Array.from(allHashes).sort().join(' ');

// Formulate strict production CSP without 'unsafe-inline' or 'unsafe-eval', and connect-src strictly to exact API origin or 'self'
const cspHeader = `default-src 'self'; script-src 'self' ${hashList}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; connect-src ${connectSrc}; font-src 'self' https://fonts.gstatic.com data:; object-src 'none';`;

console.log(`[generate-csp] Collected ${allHashes.size} unique script hashes across ${htmlFiles.length} HTML files.`);
console.log(`[generate-csp] Setting connect-src to: ${connectSrc}`);

// 1. Update HTML files meta tag with exact hashes
for (const filePath of htmlFiles) {
  let html = fs.readFileSync(filePath, 'utf8');
  const metaRegex = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["'][^"']*["']\s*\/?>/i;
  const newMeta = `<meta http-equiv="Content-Security-Policy" content="${cspHeader}"/>`;
  if (metaRegex.test(html)) {
    html = html.replace(metaRegex, newMeta);
    fs.writeFileSync(filePath, html, 'utf8');
  }
}

// 2. Update public/_headers and out/_headers
function updateHeadersFile(headersPath) {
  if (fs.existsSync(headersPath)) {
    let headersContent = fs.readFileSync(headersPath, 'utf8');
    const cspRegex = /Content-Security-Policy:.*$/m;
    if (cspRegex.test(headersContent)) {
      headersContent = headersContent.replace(cspRegex, `Content-Security-Policy: ${cspHeader}`);
      fs.writeFileSync(headersPath, headersContent, 'utf8');
      console.log(`[generate-csp] Updated ${headersPath}`);
    }
  }
}

updateHeadersFile(publicHeadersPath);
updateHeadersFile(outHeadersPath);
console.log('[generate-csp] CSP hardening completed successfully.');

