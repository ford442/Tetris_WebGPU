#!/usr/bin/env node
/**
 * Desktop (Tauri) frontend build: `vite build` with relative asset URLs (VITE_BASE=./) and
 * no service worker. Cross-platform stand-in for `VITE_BASE=./ npm run build`, which cmd.exe
 * cannot run. Wired as tauri.conf.json `beforeBuildCommand`.
 */
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: process.env.VITE_BASE || './' },
});
process.exit(result.status ?? 1);
