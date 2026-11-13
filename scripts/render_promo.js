const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 2050 },
    deviceScaleFactor: 2,
  });
  await page.goto('file:///home/z/my-project/scripts/promo.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/home/z/my-project/scripts/promo_raw.png', fullPage: false });
  await browser.close();
  console.log('rendered: scripts/promo_raw.png');
})();
