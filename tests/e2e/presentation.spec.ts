/**
 * What the game asks the canvas context for, in a real browser: `window.webgpuProbe.presentation`,
 * the `?hdr` override, the Settings toggle round trip, and the `?capture` configuration.
 *
 * What this suite deliberately does NOT do is present a frame through an HDR or `COPY_SRC` canvas.
 * Playwright's software adapter (SwiftShader) accepts those *configurations* — `getConfiguration()`
 * reads `rgba16float` / `extended` back — but cannot create the swap-chain shared image for them
 * ("Could not find SharedImageBackingFactory … RGBA_F16 / WebgpuRead", then the page crashes). In this
 * environment no frame is presented anyway (stock Chromium rejects gpuPassTimers' `writeTimestamp`,
 * see knownIssues.ts, which ends the render loop first), so these tests assert the configuration
 * and the probe only. HDR highlights and the readback are verified by the Dawn tests
 * (`bloom-composite-hdr`, `cpp-hdr-post`, `frame-capture`) and need a real HDR display to see.
 *
 * `?hdr=1` ("try it anyway") is asserted as *either* an active HDR surface *or* a documented
 * fallback — what must never happen is a failed boot or a lie in the probe.
 */

import { expect, test, type Page } from '@playwright/test';

import { boot, collectConsole, expectConsole, FATAL_OVERLAY_ID, probe } from './app.js';
import { KNOWN_BROKEN_RENDERERS } from './knownIssues.js';

const FALLBACKS = ['tone-mapping-unsupported', 'configure-rejected'];

interface Presentation {
  format: string;
  colorSpace: string;
  toneMapping: string;
  usage: string[];
  hdr: boolean;
  hdrRequested: boolean;
  hdrSource: string;
  hdrStatus: string;
  displayHdr: boolean;
  capture: boolean;
}

async function presentation(page: Page): Promise<Presentation | null> {
  return ((await probe(page))?.presentation ?? null) as Presentation | null;
}

test.describe('TS WebGPU presentation', () => {
  test('default: SDR, standard tone mapping, nothing requested; probe reports features and limits', async ({ page }) => {
    const log = collectConsole(page);
    await boot(page, { renderer: 'webgpu' });
    const p = await probe(page);
    expect(p).toMatchObject({ ok: true, renderer: 'ts' });
    expect(await presentation(page)).toMatchObject({
      colorSpace: 'srgb',
      toneMapping: 'standard',
      hdr: false,
      hdrRequested: false,
      hdrStatus: 'off',
      capture: false,
      usage: ['RENDER_ATTACHMENT'],
    });
    expect((await presentation(page))?.format).toMatch(/^(bgra8unorm|rgba8unorm)$/);
    // Only features something uses are requested.
    expect(p?.features).toBeInstanceOf(Array);
    for (const f of p?.features as string[]) {
      expect(['timestamp-query', 'texture-compression-bc', 'rg11b10ufloat-renderable']).toContain(f);
    }
    const limits = p?.limits as { requested: Record<string, number>; adapter: Record<string, number>; granted: Record<string, number> };
    expect(limits.requested).toMatchObject({ maxStorageBuffersPerShaderStage: 4, maxBindGroups: 1 });
    expect(limits.granted.maxTextureDimension2D).toBeGreaterThanOrEqual(8192);
    await page.waitForTimeout(1000);
    expectConsole('webgpu', log);
  });

  test('?hdr=1 is HDR when the browser accepts it, otherwise a reported SDR fallback — and the game still runs', async ({ page }) => {
    const log = collectConsole(page);
    await boot(page, { renderer: 'webgpu', query: { hdr: '1' } });
    await expect(page.locator(`#${FATAL_OVERLAY_ID}`)).toHaveCount(0);
    const p = await presentation(page);
    expect(p).toMatchObject({ hdrRequested: true, hdrSource: 'url' });
    if (p?.hdr) {
      expect(p).toMatchObject({ format: 'rgba16float', colorSpace: 'display-p3', toneMapping: 'extended', hdrStatus: 'active' });
    } else {
      expect(FALLBACKS).toContain(p?.hdrStatus);
      expect(p?.format).toMatch(/^(bgra8unorm|rgba8unorm)$/);
    }
    await page.waitForTimeout(1500);
    expectConsole('webgpu', log);
  });

  test('?hdr=0 beats a persisted setting', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tetris_settings', JSON.stringify({ version: 1, quality: 'ultra', hdrOutput: true }));
    });
    await boot(page, { renderer: 'webgpu', query: { hdr: '0' } });
    expect(await presentation(page)).toMatchObject({ hdr: false, hdrRequested: false, hdrSource: 'url', hdrStatus: 'off' });
  });

  test('Settings → "HDR (if supported)" round-trips through localStorage and the probe', async ({ page }) => {
    await boot(page, { renderer: 'webgpu' });
    const toggle = page.locator('#settings-hdr');
    await expect(toggle).toHaveCount(1);
    expect(await toggle.isChecked()).toBe(false);

    // The toggle persists and reloads (the canvas format changes every pipeline target).
    await Promise.all([page.waitForNavigation(), toggle.evaluate((el: HTMLInputElement) => el.click())]);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tetris_settings') ?? '{}') as { hdrOutput?: boolean });
    expect(stored.hdrOutput).toBe(true);

    await boot(page, { renderer: 'webgpu' });
    expect(await page.locator('#settings-hdr').isChecked()).toBe(true);
    const p = await presentation(page);
    expect(p).toMatchObject({ hdrRequested: true, hdrSource: 'settings' });
    // No HDR display here: the setting alone ("if supported") must not force it.
    expect(p?.displayHdr).toBe(false);
    expect(p).toMatchObject({ hdr: false, hdrStatus: 'no-hdr-display', colorSpace: 'srgb' });
  });
});

test.describe('?capture', () => {
  test('adds COPY_SRC to the canvas texture usage and creates the readback path', async ({ page }) => {
    await boot(page, { renderer: 'webgpu', query: { capture: '1' } });
    expect(await presentation(page)).toMatchObject({ capture: true, usage: ['RENDER_ATTACHMENT', 'COPY_SRC'] });
    expect(await page.evaluate(() => (window as unknown as { view: { canCaptureFrame: boolean } }).view.canCaptureFrame)).toBe(true);
  });

  test('without ?capture there is no readback path and the usage is unchanged', async ({ page }) => {
    await boot(page, { renderer: 'webgpu' });
    expect(await presentation(page)).toMatchObject({ capture: false, usage: ['RENDER_ATTACHMENT'] });
    const msg = await page.evaluate(async () => {
      try {
        await (window as unknown as { view: { captureFrame(): Promise<Blob> } }).view.captureFrame();
        return 'resolved';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(msg).toContain('capture-disabled');
  });
});

test.describe('C++ renderer presentation', () => {
  test('?hdr=1 reaches the C++ surface and the probe tells the truth', async ({ page }) => {
    await boot(page, { renderer: 'webgpu-cpp', query: { hdr: '1' } });
    if (KNOWN_BROKEN_RENDERERS['webgpu-cpp']) {
      test.skip(true, 'webgpu-cpp is a known-broken renderer in this environment');
    }
    expect(await probe(page)).toMatchObject({ ok: true, renderer: 'cpp' });
    const p = await presentation(page);
    expect(p).toMatchObject({ hdrRequested: true, hdrSource: 'url' });
    if (p?.hdr) {
      expect(p).toMatchObject({ format: 'rgba16float', colorSpace: 'display-p3', toneMapping: 'extended' });
    } else {
      expect(FALLBACKS).toContain(p?.hdrStatus);
    }
  });

  test('default stays SDR', async ({ page }) => {
    await boot(page, { renderer: 'webgpu-cpp' });
    if (KNOWN_BROKEN_RENDERERS['webgpu-cpp']) test.skip(true, 'webgpu-cpp is a known-broken renderer in this environment');
    expect(await presentation(page)).toMatchObject({ hdr: false, hdrRequested: false, hdrStatus: 'off', colorSpace: 'srgb' });
  });
});
