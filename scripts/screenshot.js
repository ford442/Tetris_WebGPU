const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  console.log('Opening page...');
  // Use IPv6 loopback where Vite is listening in this environment
  await page.goto('http://[::1]:5173/', { waitUntil: 'networkidle' });

  // Wait for canvas to be ready
  await page.waitForSelector('#canvaswebgpu', { timeout: 10000 });

  // Ensure game started so blocks appear
  await page.click('#start-button').catch((err) => {
    console.log('Note: Start button not found or not clickable:', err.message);
  });
  await page.waitForTimeout(800);

  const themes = [
    { id: 'neon-theme', name: 'neon' },
    { id: 'pastel-theme', name: 'pastel' },
    { id: 'futuristic-theme', name: 'future' }
  ];

  for (const t of themes) {
    console.log('Switching theme:', t.name);
    await page.click(`#${t.id}`).catch((err) => {
      console.log(`Warning: Could not switch to theme ${t.name}:`, err.message);
    });
    // give it some time to settle and render
    await page.waitForTimeout(800);

    // Make sure a frame is rendered
    await page.waitForTimeout(100);

    const canvas = await page.$('#canvaswebgpu');
    const path = `screenshots/${t.name}.png`;
    if (canvas) {
      await canvas.screenshot({ path });
      console.log('Saved', path);
    } else {
      // fallback to full page screenshot
      await page.screenshot({ path: `screenshots/${t.name}_full.png`, fullPage: false });
      console.log('Saved full page fallback for', t.name);
    }
  }

  // Also take a full page screenshot
  await page.screenshot({ path: 'screenshots/fullpage.png', fullPage: true });

  await browser.close();
  console.log('Done.');
})();