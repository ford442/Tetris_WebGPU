import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.argv[2] || 'https://test.1ink.us/tetris-webgpu/index.html';
const outDir = 'screenshots/live';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

const webgpu = await page.evaluate(() => !!navigator.gpu);
const blockHead = await page.evaluate(async () => {
  const base = location.href.replace(/[^/]+$/, '');
  const r = await fetch(base + 'block.png', { method: 'HEAD' });
  return { status: r.status, url: base + 'block.png' };
});

await page.click('#start-button').catch(() => {});
await page.waitForTimeout(2500);

// Drop some pieces via keyboard
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);

const theme = await page.evaluate(() => localStorage.getItem('tetris_theme_name'));
const canvas = await page.$('#canvaswebgpu');
if (canvas) {
  await canvas.screenshot({ path: `${outDir}/live-canvas.png` });
}
await page.screenshot({ path: `${outDir}/live-full.png`, fullPage: false });

const pixelSample = await page.evaluate(() => {
  const c = document.querySelector('#canvaswebgpu');
  if (!c) return null;
  const ctx = c.getContext('webgpu');
  return { w: c.width, h: c.height, hasWebGPU: !!ctx, clientW: c.clientWidth };
});

console.log(JSON.stringify({ URL, webgpu, blockHead, theme, pixelSample, logCount: logs.length }, null, 2));
console.log('--- console (last 40) ---');
logs.slice(-40).forEach((l) => console.log(l));

await browser.close();