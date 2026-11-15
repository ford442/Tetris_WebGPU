/**
 * Gate for the Texture Mask Lab. Deliberately tiny and import-free: index.ts evaluates this
 * on every boot and only then pulls in the 1000-line lab (plus its bakers) as a separate,
 * lazily loaded chunk via dynamic `import()`.
 */

export function isLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.local');
}

/** `?masklab=1` or `localStorage.tetris_texture_mask_lab='1'`, on a localhost-style host only. */
export function isTextureMaskLabRequested(): boolean {
  if (typeof window === 'undefined') return false;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('tetris_texture_mask_lab');
  } catch {
    // storage blocked: only the query param can enable it
  }
  const enabled = stored === '1' || new URLSearchParams(window.location.search).get('masklab') === '1';
  return enabled && isLocalhostHost(window.location.hostname);
}
