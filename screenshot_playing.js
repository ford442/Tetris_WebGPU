import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const URL = process.argv[2] || 'http://localhost:4174/tetris-webgpu/?renderer=webgl2';
const OUT = process.argv[3] || '/content/tetris_webgpu/screenshots/playing.png';

const chromeArgs = [
  '--no-sandbox',
  '--headless=new',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-unsafe-webgpu',
  '--enable-features=WebGPU',
  '--disable-search-engine-choice-screen',
  '--ash-no-nudges',
  '--no-first-run',
  '--disable-features=Translate',
  '--no-default-browser-check',
  '--window-size=1280,720',
  '--hide-scrollbars',
];

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    ignoreDefaultArgs: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    args: chromeArgs,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(`[console] ${text}`);
    console.log(text);
  });
  page.on('pageerror', err => {
    const stack = err.stack || '';
    logs.push(`[pageerror] ${err.message}\n${stack}`);
    console.error('Page error:', err.message, stack);
  });
  page.on('requestfailed', req => {
    const entry = `[requestfailed] ${req.url()}: ${req.failure()?.errorText}`;
    logs.push(entry);
    console.error(entry);
  });

  console.log(`Navigating to ${URL} ...`);
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });

  console.log('Waiting 4s for renderer init...');
  await new Promise(r => setTimeout(r, 4000));

  // Click the START button if present.
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const start = buttons.find(b => b.textContent.trim().toUpperCase() === 'START');
    if (start) {
      start.click();
      return true;
    }
    return false;
  });
  console.log('Start button clicked:', clicked);

  // Let a few pieces fall.
  await new Promise(r => setTimeout(r, 8000));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, fullPage: false });
  console.log(`Screenshot saved to ${OUT}`);

  fs.writeFileSync(OUT.replace(/\.png$/i, '.log.txt'), logs.join('\n'));

  await browser.close();
}

run().catch(err => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
