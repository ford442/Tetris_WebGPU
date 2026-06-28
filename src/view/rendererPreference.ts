export type RendererPreference = 'auto' | 'webgpu' | 'webgl2' | 'webgpu-cpp';

const VALID_PREFS: RendererPreference[] = ['auto', 'webgpu', 'webgl2', 'webgpu-cpp'];

export function parseRendererPreference(value: string | null): RendererPreference | null {
  if (value && (VALID_PREFS as string[]).includes(value)) {
    return value as RendererPreference;
  }
  return null;
}

export function getRendererPreference(): RendererPreference {
  const param = parseRendererPreference(new URLSearchParams(window.location.search).get('renderer'));
  if (param && param !== 'auto') return param;
  const stored = parseRendererPreference(window.localStorage.getItem('tetris_renderer'));
  if (stored && stored !== 'auto') return stored;
  return 'auto';
}

export function setRendererPreference(pref: RendererPreference): void {
  if (pref === 'auto') {
    window.localStorage.removeItem('tetris_renderer');
  } else {
    window.localStorage.setItem('tetris_renderer', pref);
  }
}
