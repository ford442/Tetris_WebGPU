/**
 * Headless WebGPU for tests and scripts: Dawn's Node bindings (`webgpu` npm package)
 * on a *software* Vulkan driver. No GPU hardware, no browser.
 *
 * Adapter discovery, in order:
 *   1. `VK_ICD_FILENAMES` / `VK_DRIVER_FILES` already set -> respected as-is.
 *   2. A system Vulkan ICD (mesa lavapipe from `mesa-vulkan-drivers`, or a real GPU driver).
 *   3. SwiftShader as shipped inside Playwright's Chromium (`libvk_swiftshader.so`), so a
 *      machine that can run the E2E job can also run these tests with no extra packages.
 *
 * Nothing here ever *silently* passes: when no adapter can be had, `acquireDawn()` resolves
 * `{ ok: false, reason }` and every caller either skips with that reason printed or, when
 * `TETRIS_REQUIRE_GPU=1` (set in CI), fails.
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type * as DawnModule from 'webgpu';

export interface DawnGpu {
  device: GPUDevice;
  /** Human-readable adapter line, printed once per run so a log shows what executed the kernels. */
  description: string;
}

export type DawnAcquire = { ok: true; gpu: DawnGpu } | { ok: false; reason: string };

/** CI sets this so a missing adapter is a failure, not a skip. */
export function gpuRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TETRIS_REQUIRE_GPU === '1' || env.TETRIS_REQUIRE_GPU === 'true';
}

const SYSTEM_ICD_DIRS = ['/usr/share/vulkan/icd.d', '/etc/vulkan/icd.d', '/usr/local/share/vulkan/icd.d'];

function hasSystemIcd(): boolean {
  return SYSTEM_ICD_DIRS.some((dir) => {
    try {
      return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.json'));
    } catch {
      return false;
    }
  });
}

/** Find `vk_swiftshader_icd.json` under the usual Playwright browser roots. */
export function findPlaywrightSwiftShaderIcd(env: NodeJS.ProcessEnv = process.env): string | null {
  const roots = [env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), '.cache', 'ms-playwright')]
    .filter((r): r is string => !!r && r !== '0' && existsSync(r));
  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/^chromium/.test(entry)) continue;
      const base = join(root, entry);
      let subs: string[] = [];
      try {
        subs = readdirSync(base);
      } catch {
        continue; // not a directory
      }
      for (const sub of subs) {
        const icd = join(base, sub, 'vk_swiftshader_icd.json');
        if (existsSync(icd)) return icd;
      }
    }
  }
  return null;
}

/** Mesa's software rasterizer ICD (`lvp_icd*.json`, from `mesa-vulkan-drivers`), if installed. */
export function findLavapipeIcd(dirs: readonly string[] = SYSTEM_ICD_DIRS): string | null {
  for (const dir of dirs) {
    try {
      const hit = readdirSync(dir).find((f) => /^lvp_icd.*\.json$/.test(f));
      if (hit) return join(dir, hit);
    } catch {
      /* directory absent */
    }
  }
  return null;
}

/**
 * Point the Vulkan loader at a software ICD when the machine did not configure one.
 * Preference: preset env > lavapipe > any system ICD > Playwright's SwiftShader.
 *
 * Lavapipe first because it is what CI installs (`mesa-vulkan-drivers`) and what the docs name; both
 * drivers pass the whole suite. SwiftShader is the fallback so these tests still run anywhere
 * Playwright's Chromium is installed.
 */
export function configureSoftwareVulkan(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VK_ICD_FILENAMES || env.VK_DRIVER_FILES) return 'VK_ICD_FILENAMES (preset)';
  const lvp = findLavapipeIcd();
  if (lvp) {
    env.VK_ICD_FILENAMES = lvp;
    return `lavapipe (${lvp})`;
  }
  if (hasSystemIcd()) return 'system Vulkan ICD';
  const icd = findPlaywrightSwiftShaderIcd(env);
  if (icd) {
    env.VK_ICD_FILENAMES = icd;
    return `SwiftShader (${icd})`;
  }
  return 'none found';
}

let cached: Promise<DawnAcquire> | null = null;

/**
 * The Dawn instance and adapter must stay reachable for the life of the process. Dawn-node frees
 * the native instance when its JS wrapper is garbage-collected, while its event-polling timer
 * keeps calling `InstanceBase::ProcessEvents()` on it — a use-after-free that shows up as random
 * SIGSEGV / `std::system_error` / "futex facility returned an unexpected error code" aborts,
 * whenever a GC happens to land mid-run. (Found with gdb: crash in `RefCounted::AddRef` called
 * from `ProcessEvents` on the main thread.) Holding the references here makes it deterministic.
 */
const pinned: unknown[] = [];

/** One device per process. */
export function acquireDawn(): Promise<DawnAcquire> {
  cached ??= doAcquire();
  return cached;
}

async function doAcquire(): Promise<DawnAcquire> {
  const icd = configureSoftwareVulkan();
  let mod: typeof DawnModule;
  try {
    mod = await import('webgpu');
  } catch (err) {
    return { ok: false, reason: `the "webgpu" (Dawn Node) package failed to load: ${errText(err)}` };
  }
  try {
    // Expose GPUBufferUsage & friends the way a browser does, for code under test.
    Object.assign(globalThis, mod.globals);
    const gpu = mod.create([]);
    pinned.push(gpu);
    const adapter = await gpu.requestAdapter();
    pinned.push(adapter);
    if (!adapter) return { ok: false, reason: `requestAdapter() returned null (Vulkan: ${icd})` };
    const device = (await adapter.requestDevice()) as unknown as GPUDevice;
    pinned.push(device);
    const info = adapter.info as unknown as Partial<Record<'vendor' | 'architecture' | 'device' | 'description', string>>;
    const description = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ');
    return { ok: true, gpu: { device, description: `${description || 'unnamed adapter'} via ${icd}` } };
  } catch (err) {
    return { ok: false, reason: `Dawn could not create a device (Vulkan: ${icd}): ${errText(err)}` };
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message.split('\n')[0] : String(err);
}

/**
 * Message for a skipped suite. Always printed so a skip is visible in the log,
 * and always names how to make the suite run.
 */
export function skipMessage(suite: string, reason: string): string {
  return (
    `[gpu-skip] ${suite}: ${reason}. ` +
    'Install mesa-vulkan-drivers (lavapipe) or `npx playwright install chromium` (SwiftShader), ' +
    'or set TETRIS_REQUIRE_GPU=1 to make this a failure.'
  );
}

/** Copy a GPU buffer back to the CPU. */
export async function readBuffer(device: GPUDevice, src: GPUBuffer, byteLength: number): Promise<ArrayBuffer> {
  const staging = device.createBuffer({
    size: Math.max(4, Math.ceil(byteLength / 4) * 4),
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(src, 0, staging, 0, staging.size);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const out = staging.getMappedRange().slice(0, byteLength);
  staging.unmap();
  staging.destroy();
  return out;
}
