#!/usr/bin/env node
/**
 * Post-build: emit versioned service worker with full precache manifest.
 * Fails the build if any precache asset is missing (no partial deploy caches).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.VITE_BASE || '/tetris-webgpu/').replace(/\/?$/, '/');

function walkFiles(dir, prefix = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkFiles(full, rel));
    } else if (!name.endsWith('.map') && name !== 'sw.js') {
      out.push(rel.replace(/\\/g, '/'));
    }
  }
  return out;
}

function toDiskRelative(url) {
  let u = url.replace(/^\//, '').replace(/^\.\//, '');
  const baseTrim = BASE.replace(/^\//, '').replace(/\/$/, '');
  if (baseTrim && (u === baseTrim || u.startsWith(`${baseTrim}/`))) {
    u = u === baseTrim ? 'index.html' : u.slice(baseTrim.length + 1);
  }
  return u;
}

function extractUrlsFromHtml(html) {
  const urls = new Set();
  const re = /(?:src|href)=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('#')) continue;
    urls.add(toDiskRelative(u));
  }
  return [...urls];
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('[generate-sw] dist/ not found — run vite build first');
    process.exit(1);
  }

  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('[generate-sw] dist/index.html missing');
    process.exit(1);
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  const fromHtml = extractUrlsFromHtml(html);
  const fromWalk = walkFiles(DIST);

  const relative = new Set([...fromHtml, ...fromWalk]);
  relative.delete('sw.js');

  const missing = [];
  const precache = [];
  for (const rel of [...relative].sort()) {
    const disk = path.join(DIST, rel);
    if (!fs.existsSync(disk)) {
      missing.push(rel);
      continue;
    }
    precache.push(`${BASE}${rel}`);
  }

  if (missing.length) {
    console.error('[generate-sw] missing precache files:', missing.join(', '));
    process.exit(1);
  }

  const buildId = crypto
    .createHash('sha256')
    .update(precache.join('\n'))
    .digest('hex')
    .slice(0, 12);

  const swSource = `/* Tetris WebGPU service worker — build ${buildId} */
const BUILD_ID = '${buildId}';
const CACHE_NAME = 'tetris-shell-' + BUILD_ID;
const BASE = '${BASE}';
const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('tetris-shell-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isPrecacheRequest(url) {
  return PRECACHE_URLS.some((entry) => {
    try {
      return new URL(entry, self.location.origin).pathname === url.pathname;
    } catch {
      return false;
    }
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(BASE + 'index.html').then((r) => r || caches.match('/index.html'))),
    );
    return;
  }

  if (isPrecacheRequest(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request)),
  );
});
`;

  fs.writeFileSync(path.join(DIST, 'sw.js'), swSource);
  fs.writeFileSync(
    path.join(DIST, 'sw-build.json'),
    JSON.stringify({ buildId, base: BASE, count: precache.length, files: precache }, null, 2),
  );

  console.log(`[generate-sw] wrote dist/sw.js (${precache.length} precache URLs, build ${buildId})`);
}

main();
