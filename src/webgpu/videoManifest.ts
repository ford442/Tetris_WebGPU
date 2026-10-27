import {
  VIDEO_MANIFEST_PATH,
  allLevelVideoPaths,
  levelToVideoIndex,
  levelVideoPath,
  resolveVideoUrl,
  type VideoManifest,
} from '../config/videoConfig.js';
import { gameLogger } from '../utils/logger.js';

let cachedManifest: VideoManifest | null = null;
let manifestPromise: Promise<VideoManifest | null> | null = null;

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

export function validateManifest(raw: any): VideoManifest {
  if (!raw || typeof raw !== 'object') {
    throw new ManifestValidationError('Manifest must be an object');
  }

  if (raw.version !== 1 && raw.version !== 2) {
    throw new ManifestValidationError('Manifest must have version 1 or 2');
  }

  if (!Array.isArray(raw.files)) {
    throw new ManifestValidationError('Manifest must have a files array');
  }

  const manifest = raw as VideoManifest;

  // v1 to v2 migration
  if (manifest.version === 1) {
    manifest.version = 2;
    manifest.themePackId = 'default-v1-migrated';
    manifest.fallbackBehavior = 'bg1';
  }

  return manifest;
}

export async function loadVideoManifest(): Promise<VideoManifest | null> {
  if (cachedManifest) return cachedManifest;
  if (manifestPromise) return manifestPromise;

  manifestPromise = (async () => {
    try {
      const res = await fetch(resolveVideoUrl(VIDEO_MANIFEST_PATH), { cache: 'no-cache' });
      if (!res.ok) return null;
      const raw = await res.json();

      const manifest = validateManifest(raw);
      cachedManifest = manifest;
      return manifest;
    } catch (e) {
      if (e instanceof ManifestValidationError) {
        gameLogger.error?.(`Invalid video manifest: ${e.message}`);
      }
      return null;
    } finally {
      manifestPromise = null;
    }
  })();

  return manifestPromise;
}

/** Returns filenames known to exist (from manifest) or probes bg1 via HEAD. */
export async function probeVideoAvailability(): Promise<Set<string>> {
  const manifest = await loadVideoManifest();
  if (manifest?.files?.length) {
    return new Set(manifest.files);
  }

  const available = new Set<string>();
  const probe = async (filename: string): Promise<boolean> => {
    const url = resolveVideoUrl(`./assets/video/${filename}`);
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
      return res.ok;
    } catch {
      return false;
    }
  };

  if (await probe('bg1.mp4')) {
    available.add('bg1.mp4');
    await Promise.all(
      allLevelVideoPaths().map(async (p) => {
        const name = p.split('/').pop()!;
        if (name !== 'bg1.mp4' && await probe(name)) {
          available.add(name);
        }
      }),
    );
  }
  return available;
}

export function resolveLevelVideoSrc(level: number, available: Set<string> | null, manifest: VideoManifest | null = null): string | null {
  const preferred = levelVideoPath(levelToVideoIndex(level));
  const preferredName = preferred.split('/').pop()!;
  if (!available || available.size === 0) {
    return null;
  }
  if (available.has(preferredName)) {
    return resolveVideoUrl(preferred);
  }

  const fallback = manifest?.fallbackBehavior ?? 'bg1';
  if (fallback === 'bg1' && available.has('bg1.mp4')) {
    return resolveVideoUrl(levelVideoPath(1));
  }

  return null;
}
