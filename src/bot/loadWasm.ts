/**
 * Fetches release.wasm for a BotCore. Kept apart from BotCore so a Worker (which cannot resolve the
 * page's relative URLs) is handed an absolute URL by the main thread, and tests inject bytes directly.
 */

/** Absolute-ish URL of release.wasm for the current page (honours the Vite base path). */
export function defaultBotWasmUrl(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}release.wasm`;
}

/** Fetch + sanity-check the wasm binary. Throws a descriptive error instead of returning junk. */
export async function fetchBotWasm(url: string = defaultBotWasmUrl()): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bot wasm ${url}: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const magic = new Uint8Array(bytes, 0, 4);
  if (magic[0] !== 0x00 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6d) {
    throw new Error(`bot wasm ${url}: not a WebAssembly binary`);
  }
  return bytes;
}
