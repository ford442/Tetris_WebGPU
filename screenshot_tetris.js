import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const URL = process.argv[2] || 'http://localhost:4174/tetris-webgpu/';
const OUT = process.argv[3] || '/content/tetris_webgpu/screenshots/screenshot.png';

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

  // Wait for WebGPU init / first frame.
  console.log('Waiting 6s for initial render...');
  await new Promise(r => setTimeout(r, 6000));

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
