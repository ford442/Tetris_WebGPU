/**
 * The one place the deployment base path is decided. Shared by vite.config.ts (asset URLs)
 * and scripts/generate-sw.mjs (service-worker precache URLs) so they can never disagree.
 *
 *   VITE_BASE unset, production build → '/tetris-webgpu/'   (GitHub Pages / the 1ink mirror)
 *   VITE_BASE unset, dev server       → '/'
 *   VITE_BASE=./                      → relative assets: the Tauri shell, `vite preview` under
 *                                       any prefix, a static host that is not at /tetris-webgpu/
 *   VITE_BASE=/anything               → '/anything/'  (a trailing slash is added)
 */

export const PAGES_BASE = '/tetris-webgpu/';

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {boolean} [isProduction]
 * @returns {string}
 */
export function resolveBase(env = process.env, isProduction = env.NODE_ENV === 'production') {
  const raw = (env.VITE_BASE ?? '').trim();
  if (raw === '') return isProduction ? PAGES_BASE : '/';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw.replace(/\/*$/, '/'); // CDN URL
  if (raw === '.' || raw === './') return './';
  return raw.replace(/\/*$/, '/');
}

/** A relative base ('./', '../x/') has no fixed URL prefix, so there is nothing to precache by. */
export function isRelativeBase(base) {
  return base.startsWith('.');
}
