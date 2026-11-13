const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
(async () => {
  const context = await chromium.launchPersistentContext('/tmp/pw-ext-profile-agent', {
    headless: true,
    channel: 'chromium',
    args: ['--disable-extensions-except=/home/z/my-project/plugin', '--load-extension=/home/z/my-project/plugin', '--no-sandbox', '--disable-dev-shm-usage']
  });
  let [sw] = context.serviceWorkers();
  if (!sw) { await context.waitForEvent('serviceworker', { timeout: 8000 }); [sw] = context.serviceWorkers(); }
  const extId = sw.url().split('/')[2];
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  await page.addInitScript(() => {
    const origQuery = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (q, cb) => {
      if (q && q.active && q.currentWindow) {
        const res = [{ id: 1, url: 'https://www.reddit.com/register/' }];
        if (cb) { cb(res); return; }
        return Promise.resolve(res);
      }
      return origQuery(q, cb);
    };
  });
  await page.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const app = document.querySelector('.app');
    const header = document.querySelector('.header');
    const r = header ? header.getBoundingClientRect() : null;
    return {
      appExists: !!app,
      appRect: app ? app.getBoundingClientRect() : null,
      headerRect: r,
      bodyScroll: document.body.scrollHeight,
      visibles: {
        header: header ? getComputedStyle(header).display : 'none',
        navTabs: document.querySelector('.nav-tabs') ? getComputedStyle(document.querySelector('.nav-tabs')).display : 'none'
      },
      tabAgentExists: !!document.getElementById('tabAgentBtn'),
      bodyClass: document.body.className
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.click('#tabAgentBtn');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/render/debug-full.png' });
  console.log('full screenshot saved (viewport-sized)');
  await context.close();
})().catch(e => { console.error(e); process.exit(1); });
