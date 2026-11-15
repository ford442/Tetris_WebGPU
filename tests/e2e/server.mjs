#!/usr/bin/env node
/**
 * Static server for the E2E suite: serves the production build (`dist/`) exactly as
 * `vite preview` would under the `/tetris-webgpu/` base, plus one alias:
 *
 *   /cpp/*  ->  dist/cpp/*
 *
 * The alias exists because `src/viewCpp/CppRendererLoader.ts` probes absolute `/cpp/...` URLs
 * and ignores Vite's base, so `?renderer=webgpu-cpp` cannot load its glue from a build served
 * under a sub-path. That is an app bug (see docs/gpu-testing.md); the alias lets the suite still
 * exercise the C++ renderer instead of reporting every run as "glue missing".
 *
 *   node tests/e2e/server.mjs [port]
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const BASE = '/tetris-webgpu/';
const port = Number(process.argv[2] ?? process.env.E2E_PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json',
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[e2e-server] dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}

function resolvePath(urlPath) {
  let rel;
  if (urlPath.startsWith(BASE)) rel = urlPath.slice(BASE.length);
  else if (urlPath.startsWith('/cpp/')) rel = urlPath.slice(1); // alias, see header
  else return null;
  const file = normalize(join(DIST, rel === '' ? 'index.html' : rel));
  if (!file.startsWith(DIST)) return null; // path traversal
  if (existsSync(file) && statSync(file).isDirectory()) return join(file, 'index.html');
  return file;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = resolvePath(decodeURIComponent(url.pathname));
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`[e2e-server] http://127.0.0.1:${port}${BASE}`));
