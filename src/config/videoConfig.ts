/**
 * Reactive video background asset configuration.
 * Supports optional CDN base URL (Vite env or localStorage override).
 */

/** Technical spec for authored level background clips. */
export const VIDEO_ASSET_SPEC = {
  /** Portal aspect ~0.5 (board is taller than wide); 720×1280 is a good authoring target. */
  width: 720,
  height: 1280,
  /** H.264 + AAC in MP4 for broad browser support. */
  container: 'mp4' as const,
  videoCodec: 'h264' as const,
  audioCodec: 'none' as const,
  /** Looped backgrounds — keep clips short. */
  durationSeconds: { min: 8, max: 30 },
  /** Target for 720p looped BG (authoring guideline). */
  maxBitrateKbps: 2500,
  /** Seamless loop required. */
  loop: true,
  /** Muted autoplay — no audio track needed. */
  muted: true,
  pixelFormat: 'yuv420p',
} as const;

export const LEVEL_VIDEO_COUNT = 15;

/** Relative paths served from `public/` (Vite copies `public/assets/video/`). */
export function levelVideoPath(index: number): string {
  const i = Math.max(1, Math.min(index, LEVEL_VIDEO_COUNT));
  return `./assets/video/bg${i}.mp4`;
}

export function allLevelVideoPaths(): string[] {
  return Array.from({ length: LEVEL_VIDEO_COUNT }, (_, n) => levelVideoPath(n + 1));
}

const STORAGE_CDN_KEY = 'tetris_video_cdn';

/**
 * Optional CDN / static host prefix for large MP4s.
 * Priority: `import.meta.env.VITE_VIDEO_CDN_BASE` → localStorage → same-origin relative.
 */
export function getVideoAssetBaseUrl(): string {
  const envBase = typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: { VITE_VIDEO_CDN_BASE?: string } }).env?.VITE_VIDEO_CDN_BASE
    : undefined;
  if (envBase && envBase.trim()) {
    return envBase.trim().replace(/\/$/, '');
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_CDN_KEY);
    if (stored && stored.trim()) {
      return stored.trim().replace(/\/$/, '');
    }
  }
  return '';
}

export function setVideoAssetBaseUrl(url: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem(STORAGE_CDN_KEY);
  } else {
    localStorage.setItem(STORAGE_CDN_KEY, url.trim().replace(/\/$/, ''));
  }
}

/** Resolve a repo-relative video path against optional CDN base. */
export function resolveVideoUrl(relativePath: string): string {
  const normalized = relativePath.replace(/^\.\//, '');
  const base = getVideoAssetBaseUrl();
  if (!base) return relativePath;
  return `${base}/${normalized}`;
}

export interface VideoManifest {
  version: 1;
  basePath: string;
  files: string[];
  generated: boolean;
  builtAt?: string;
}

export const VIDEO_MANIFEST_PATH = './assets/video/manifest.json';

/** Map game level (0-based) to bg index (1-based, capped at 15). */
export function levelToVideoIndex(level: number): number {
  return Math.min(level + 1, LEVEL_VIDEO_COUNT);
}

export function videoPathForLevel(level: number): string {
  return levelVideoPath(levelToVideoIndex(level));
}
