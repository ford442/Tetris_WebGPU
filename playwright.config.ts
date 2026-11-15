import { defineConfig, devices } from '@playwright/test';

/**
 * E2E + visual regression: boots the *production build* in Chromium on a software WebGPU adapter
 * (SwiftShader), then compares deterministic frames to goldens. No GPU hardware involved.
 *
 *   npm run build && npm run e2e            # run
 *   UPDATE_GOLDENS=1 npm run e2e            # (re)write goldens
 *
 * `@playwright/test` is pinned to an exact version on purpose: each release ships one Chromium
 * revision, and the goldens are pixels from that revision's SwiftShader. Bumping Playwright means
 * regenerating goldens in the same change. See docs/gpu-testing.md.
 *
 * Screenshots and diffs go to `test-results/` (gitignored, uploaded as a CI artifact) — never to
 * `.playwright-mcp/`.
 */

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  // One software GPU, one page at a time: parallel pages would fight over SwiftShader and make
  // frame timing depend on load.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/tetris-webgpu/`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    trace: 'off',
    // `chromium` channel = the new headless mode (full Chrome), which is what WebGPU needs.
    channel: 'chromium',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--use-webgpu-adapter=swiftshader',
        '--use-angle=swiftshader',
        '--enable-features=Vulkan',
        '--ignore-gpu-blocklist',
        // The container's user namespace rarely allows Chrome's sandbox.
        ...(process.env.CI || process.env.E2E_NO_SANDBOX ? ['--no-sandbox'] : []),
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      // Desktop Chrome's own 1280x720 viewport and DPR 1 are what BOARD_CLIP in tests/e2e/app.ts assumes.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, channel: 'chromium' },
    },
  ],
  webServer: {
    command: `node tests/e2e/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/tetris-webgpu/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
