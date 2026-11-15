/**
 * Page helpers shared by the E2E specs: boot a renderer, collect console errors, force "no WebGPU
 * adapter", inject the simulator-derived board, and capture the board canvas.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type BrowserContext, type Page } from '@playwright/test';

import type { FrameFixture } from './frameFixture.js';
import { classifyConsole, type RendererId } from './knownIssues.js';

export const FATAL_OVERLAY_ID = 'tetris-fatal-webgpu-overlay';
export const RENDERER_BADGE_ID = 'renderer-badge';

export const FRAME_FIXTURE: FrameFixture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'frame.json'), 'utf8'),
) as FrameFixture;

export interface BootOptions {
  /** `?renderer=` value, or omitted for the default `auto`. */
  renderer?: RendererId | 'auto';
  /** Append `?deterministic&seed=` and drive time from `page.clock`. */
  deterministic?: boolean;
  /** Make the browser report no WebGPU at all (`navigator.gpu` missing). */
  noGpu?: boolean;
  /** Make `requestAdapter()` resolve null (a browser that has WebGPU but no adapter). */
  nullAdapter?: boolean;
}

export interface ConsoleLog {
  errors: string[];
}

/** Collect console errors and uncaught page errors. */
export function collectConsole(page: Page): ConsoleLog {
  const log: ConsoleLog = { errors: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') log.errors.push(m.text());
  });
  page.on('pageerror', (e) => log.errors.push(e.message));
  return log;
}

/** Assert against the known-issue baseline (strict both ways); see knownIssues.ts. */
export function expectConsole(renderer: RendererId, log: ConsoleLog): void {
  const { unexpected, stale } = classifyConsole(renderer, log.errors);
  expect(unexpected, 'unexpected console errors').toEqual([]);
  expect(
    stale.map((k) => `${k.pattern} (${k.why}) no longer occurs — delete it from tests/e2e/knownIssues.ts`),
    'stale known-issue entries',
  ).toEqual([]);
}

export function bootUrl(options: BootOptions, seed = FRAME_FIXTURE.seed): string {
  const params = new URLSearchParams();
  if (options.renderer && options.renderer !== 'auto') params.set('renderer', options.renderer);
  if (options.deterministic) {
    params.set('deterministic', '1');
    params.set('seed', String(seed));
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

export async function boot(page: Page, options: BootOptions = {}): Promise<void> {
  if (options.noGpu) {
    await page.addInitScript(() => {
      // A browser without WebGPU: `'gpu' in navigator` is false and navigator.gpu is undefined.
      delete (Navigator.prototype as unknown as Record<string, unknown>).gpu;
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
  }
  if (options.nullAdapter) {
    await page.addInitScript(() => {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      if (gpu) gpu.requestAdapter = async () => null;
    });
  }
  if (options.deterministic) {
    // Fake time is part of the frame (shader `time`, piece bob, particle dt are all derived from
    // performance.now), so it must be identical on every run. Pause it at a fixed instant BEFORE
    // boot: the app's async boot (fetch, WebGPU) proceeds on real time without moving the fake
    // clock, so the view's start time is always the same fake instant, and every later frame is
    // reached by a fixed sequence of `runFor` steps.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1);
  }
  await page.goto(bootUrl(options));
  await waitForBoot(page);
}

/**
 * Poll `predicate` in the page until it is truthy, sleeping on a real timer. Deliberately not
 * `page.waitForFunction`: its rAF polling never fires while `page.clock` has animation frames
 * frozen. Never ticks the fake clock — that would make fake time depend on how long boot took.
 */
export async function until<A>(
  page: Page,
  predicate: (arg: A) => unknown,
  arg: A,
  { timeoutMs = 60_000, what = 'condition' }: { timeoutMs?: number; what?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate(predicate as never, arg as never)) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await page.waitForTimeout(50);
  }
}

/** Resolves once the game is wired up (`window.game`) or the fatal overlay replaced the page. */
export async function waitForBoot(page: Page): Promise<void> {
  await until(
    page,
    (overlayId: string) => !!(window as unknown as { game?: unknown }).game || !!document.getElementById(overlayId),
    FATAL_OVERLAY_ID,
    { what: 'the game to boot or the fatal overlay to appear' },
  );
}

export async function probe(page: Page): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(() => (window as unknown as { webgpuProbe?: Record<string, unknown> }).webgpuProbe);
}

export async function rendererName(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as { view?: { rendererName?: string } }).view?.rendererName);
}

export async function badgeText(page: Page): Promise<string | null> {
  return page.locator(`#${RENDERER_BADGE_ID}`).textContent();
}

/** Advance the fake clock in frame-sized steps, giving the GPU real time to finish each frame. */
export async function advance(page: Page, ms: number, stepMs = 100): Promise<void> {
  for (let t = 0; t < ms; t += stepMs) {
    await page.clock.runFor(stepMs);
    await page.waitForTimeout(40);
  }
}

/** Wait until every `<video>` background shows a decoded frame (frozen on frame 0 by ?deterministic). */
export async function waitForVideoFrames(page: Page): Promise<void> {
  await until(
    page,
    // The background keeps a spare, source-less <video> for the next level; ignore elements with no src.
    () => Array.from(document.querySelectorAll('video')).filter((v) => v.currentSrc).every((v) => v.readyState >= 2),
    null,
    { timeoutMs: 30_000, what: 'background video frames' },
  );
}

/** Put the simulator-derived board (or an empty one) into the live game and redraw. */
export async function showBoard(page: Page, board: 'fixture' | 'empty'): Promise<void> {
  await page.evaluate(
    ({ fixture, which }) => {
      const w = window as unknown as {
        game: { reset(o: { seed: number }): void; playfield: Int8Array; activPiece: Record<string, unknown> };
        controller: { updateView(): void };
      };
      w.game.reset({ seed: fixture.seed });
      w.game.playfield.fill(0);
      if (which === 'fixture') {
        w.game.playfield.set(fixture.playfield);
        Object.assign(w.game.activPiece, {
          type: fixture.piece.type,
          x: fixture.piece.x,
          y: fixture.piece.y,
          rotation: fixture.piece.rotation,
          blocks: fixture.piece.blocks,
          _bounds: undefined,
        });
      }
      w.controller.updateView();
    },
    { fixture: FRAME_FIXTURE, which: board },
  );
}

/**
 * The playfield, in CSS px at the suite's fixed 1280x720 viewport, DPR 1 (playwright.config.ts).
 * Every renderer lays the board out through the same render metrics, so one rect serves all three.
 * Frames are clipped to it because the surrounding HUD is live DOM (timer, score, T-spin banner)
 * and the canvas itself spans the whole window.
 */
export const BOARD_CLIP = { x: 478, y: 36, width: 324, height: 648 } as const;

/**
 * Boot deterministically in a fresh page, draw `board`, let it settle, and return the board rect
 * as a PNG — or `null` when the renderer hard-failed to boot (fatal overlay, no game). A fresh page
 * per frame keeps frames independent (and lets one test take several).
 */
export async function captureFrame(
  context: BrowserContext,
  renderer: RendererId,
  board: 'fixture' | 'empty',
): Promise<Buffer | null> {
  const page = await context.newPage();
  try {
    await boot(page, { renderer, deterministic: true });
    if ((await page.locator(`#${FATAL_OVERLAY_ID}`).count()) > 0) return null;
    await waitForVideoFrames(page);
    await showBoard(page, board);
    await advance(page, 1500);
    return await page.screenshot({ clip: BOARD_CLIP, animations: 'disabled' });
  } finally {
    await page.close();
  }
}
