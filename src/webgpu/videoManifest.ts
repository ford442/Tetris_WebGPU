import {
  VIDEO_MANIFEST_PATH,
  allLevelVideoPaths,
  levelToVideoIndex,
  levelVideoPath,
  resolveVideoUrl,
  type VideoManifest,
} from '../config/videoConfig.js';

let cachedManifest: VideoManifest | null = null;
let manifestPromise: Promise<VideoManifest | null> | null = null;

export async function loadVideoManifest(): Promise<VideoManifest | null> {
  if (cachedManifest) return cachedManifest;
  if (manifestPromise) return manifestPromise;

  manifestPromise = (async () => {
    try {
      const res = await fetch(resolveVideoUrl(VIDEO_MANIFEST_PATH), { cache: 'no-cache' });
      if (!res.ok) return null;
      const raw = await res.json() as VideoManifest;
      if (raw.version !== 1 || !Array.isArray(raw.files)) return null;
      cachedManifest = raw;
      return raw;
    } catch {
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

export function resolveLevelVideoSrc(level: number, available: Set<string> | null): string | null {
  const preferred = levelVideoPath(levelToVideoIndex(level));
  const preferredName = preferred.split('/').pop()!;
  if (!available || available.size === 0) {
    return null;
  }
  if (available.has(preferredName)) {
    return resolveVideoUrl(preferred);
  }
  if (available.has('bg1.mp4')) {
    return resolveVideoUrl(levelVideoPath(1));
  }
  return null;
}
