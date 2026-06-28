/** CommonJS mirror of rendererUrl.mjs for legacy screenshot.js */
const VALID_RENDERERS = ['auto', 'webgpu', 'webgl2', 'webgpu-cpp'];

function withRendererParam(baseUrl, renderer) {
  if (!renderer || renderer === 'auto') return baseUrl;
  const normalized = String(renderer).trim();
  if (!VALID_RENDERERS.includes(normalized)) {
    console.warn(`Unknown renderer "${renderer}" — URL unchanged. Valid: ${VALID_RENDERERS.join(', ')}`);
    return baseUrl;
  }
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}renderer=${normalized}`;
}

module.exports = { VALID_RENDERERS, withRendererParam };
