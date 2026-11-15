/**
 * Boot policy, in a real browser: which renderer wins, what `window.webgpuProbe` says, and when the
 * fatal overlay replaces the page. This is the most recently changed code in the repo and, until
 * now, only had mocked unit tests (docs/webgpu-boot-probe.md).
 */

import { expect, test } from '@playwright/test';

import { badgeText, boot, collectConsole, expectConsole, FATAL_OVERLAY_ID, probe, rendererName } from './app.js';
import { KNOWN_BROKEN_RENDERERS } from './knownIssues.js';

test.describe('working adapter', () => {
  test('auto boots the TS WebGPU renderer and records a successful probe', async ({ page }) => {
    const log = collectConsole(page);
    await boot(page, { renderer: 'auto' });

    const p = await probe(page);
    expect(p).toMatchObject({ ok: true, renderer: 'ts', reason: null, browser: 'chrome' });
    expect(typeof p?.adapter).toBe('string');
    expect(p?.adapterAttempt).toMatch(/^(power-preference|default|compatibility)$/);
    expect(await rendererName(page)).toBe('webgpu');
    expect(await badgeText(page)).toBe('WebGPU');
    await expect(page.locator(`#${FATAL_OVERLAY_ID}`)).toHaveCount(0);

    // Let a few frames run so draw-time validation errors (not just setup ones) are collected.
    await page.waitForTimeout(1500);
    expectConsole('webgpu', log);
  });

  test('?renderer=webgl2 is an explicit choice and boots WebGL2', async ({ page }) => {
    const log = collectConsole(page);
    await boot(page, { renderer: 'webgl2' });
    expect(await rendererName(page)).toBe('webgl2');
    expect(await badgeText(page)).toBe('WebGL2');
    await page.waitForTimeout(1000);
    expectConsole('webgl2', log);
  });

  test('?renderer=webgpu-cpp boots the C++ renderer', async ({ page }) => {
    await boot(page, { renderer: 'webgpu-cpp' });
    const broken = KNOWN_BROKEN_RENDERERS['webgpu-cpp'];
    if (broken) {
      // Recorded failure: assert it is still *this* failure, so a fix fails loudly (delete the entry).
      expect(
        await probe(page),
        `webgpu-cpp is in KNOWN_BROKEN_RENDERERS (${broken}) but it booted - delete the entry in tests/e2e/knownIssues.ts`,
      ).toMatchObject({ ok: false, renderer: 'cpp', reason: expect.stringContaining('cpp-') });
      await expect(page.locator(`#${FATAL_OVERLAY_ID}`)).toBeVisible();
      return;
    }
    expect(await probe(page)).toMatchObject({ ok: true, renderer: 'cpp' });
    expect(await rendererName(page)).toBe('webgpu-cpp');
    await expect(page.locator(`#${FATAL_OVERLAY_ID}`)).toHaveCount(0);
  });
});

test.describe('no WebGPU adapter', () => {
  test('auto falls back to WebGL2 and says so on the badge', async ({ page }) => {
    await boot(page, { renderer: 'auto', noGpu: true });

    expect(await rendererName(page)).toBe('webgl2');
    expect(await badgeText(page)).toBe('WebGL2 (no WebGPU)');
    expect(await page.locator('#renderer-badge').getAttribute('title')).toContain('WebGPU unavailable');
    // The board still plays: the game was constructed, no overlay.
    expect(await page.evaluate(() => !!(window as unknown as { game?: unknown }).game)).toBe(true);
    await expect(page.locator(`#${FATAL_OVERLAY_ID}`)).toHaveCount(0);
  });

  test('auto also falls back when requestAdapter() resolves null', async ({ page }) => {
    await boot(page, { renderer: 'auto', nullAdapter: true });
    expect(await rendererName(page)).toBe('webgl2');
    expect(await badgeText(page)).toBe('WebGL2 (no WebGPU)');
  });

  for (const renderer of ['webgpu', 'webgpu-cpp'] as const) {
    test(`explicit ?renderer=${renderer} hard-fails: probe + blocking overlay, game never built`, async ({ page }) => {
      await boot(page, { renderer, noGpu: true });

      const overlay = page.locator(`#${FATAL_OVERLAY_ID}`);
      await expect(overlay).toBeVisible();
      await expect(overlay).toHaveAttribute('role', 'alertdialog');

      const p = await probe(page);
      expect(p).toMatchObject({ ok: false, renderer: renderer === 'webgpu' ? 'ts' : 'cpp' });
      expect(typeof p?.reason).toBe('string');
      expect(String(p?.reason).length).toBeGreaterThan(0);

      // No WebGL2 rescue and no half-built game behind the overlay.
      expect(await page.evaluate(() => !!(window as unknown as { game?: unknown }).game)).toBe(false);
      expect(await page.locator('#renderer-badge').count()).toBe(0);
    });
  }
});
