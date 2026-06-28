/** Shared helpers for screenshot / capture scripts. */
export const VALID_RENDERERS = ['auto', 'webgpu', 'webgl2', 'webgpu-cpp'];

/**
 * Append or set ?renderer= on a base game URL.
 * @param {string} baseUrl
 * @param {string} [renderer] - auto | webgpu | webgl2 | webgpu-cpp
 */
export function withRendererParam(baseUrl, renderer) {
  if (!renderer || renderer === 'auto') return baseUrl;
  const normalized = String(renderer).trim();
  if (!VALID_RENDERERS.includes(normalized)) {
    console.warn(`Unknown renderer "${renderer}" — URL unchanged. Valid: ${VALID_RENDERERS.join(', ')}`);
    return baseUrl;
  }
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}renderer=${normalized}`;
}

/**
 * Resolve game URL from argv, env, or default.
 * Env: BASE_URL, RENDERER
 */
export function resolveGameUrl({ argvUrl, defaultBase, rendererEnv }) {
  if (argvUrl) return argvUrl;
  const base = process.env.BASE_URL || defaultBase;
  const renderer = rendererEnv ?? process.env.RENDERER;
  return withRendererParam(base, renderer);
}
