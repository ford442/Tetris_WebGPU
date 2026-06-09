import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/tetris-webgpu/';
const outDir = process.argv[3] || '/opt/cursor/artifacts/screenshots';
const renderer = process.argv[4] || 'webgl2';
const theme = process.argv[5] || 'imageSampled';

await mkdir(outDir, { recursive: true });

const sep = baseUrl.includes('?') ? '&' : '?';
const url = `${baseUrl}${sep}renderer=${renderer}`;

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#canvaswebgpu', { timeout: 30000 });
await page.waitForTimeout(1500);

const themeButtons = {
  imageSampled: '#image-sampled-theme',
  gold: '#gold-theme',
  glass: '#glass-theme',
};
if (themeButtons[theme]) {
  await page.locator(themeButtons[theme]).click();
  await page.waitForTimeout(800);
}

await page.locator('#start-button').click();
await page.waitForTimeout(2000);
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  await page.keyboard.press(' ');
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1500);

const pagePath = `${outDir}/tetris-${renderer}-${theme}.png`;
const canvasPath = `${outDir}/tetris-${renderer}-${theme}-canvas.png`;
await page.screenshot({ path: pagePath });
await page.locator('#canvaswebgpu').screenshot({ path: canvasPath });

const stats = await page.evaluate(() => ({
  renderer: window.view?.rendererName,
  filled: window.game?.playfield?.filter?.((v) => v > 0).length ?? 0,
  theme: window.view?.currentTheme?.materialTheme,
}));
console.log(JSON.stringify({ url, stats, pagePath, canvasPath }, null, 2));

await browser.close();
