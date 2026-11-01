// Visual check: accounts view with accounts + floating widget SVG icons on a real page
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SHOT_DIR = '/tmp/render';
fs.mkdirSync(SHOT_DIR, { recursive: true });

(async () => {
  const context = await chromium.launchPersistentContext('/tmp/pw-ext-profile2', {
    headless: true,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=/home/z/my-project/plugin`,
      `--load-extension=/home/z/my-project/plugin`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  let [sw] = context.serviceWorkers();
  if (!sw) {
    try {
      await context.waitForEvent('serviceworker', { timeout: 6000 });
      [sw] = context.serviceWorkers();
    } catch {}
  }
  const extId = sw.url().split('/')[2];
  console.log('Extension ID:', extId);

  // --- 1. Accounts view via stubbed state ---
  const page = await context.newPage();
  await page.addInitScript(() => {
    chrome.runtime.sendMessage = function (payload, cb) {
      const respond = (data) => setTimeout(() => cb && cb(data), 0);
      const accounts = [
        { id: 'a1', name: 'اکانت ۱', note: 'user1@mail.com', color: '#6366f1', lastUsedAt: Date.now() - 3600e3, mailboxId: 'mb1' },
        { id: 'a2', name: 'اکانت ۲', note: '', color: '#10b981', lastUsedAt: Date.now() - 86e5, skipped: false },
        { id: 'a3', name: 'اکانت ۳ ریکاوری موقت', note: '', color: '#f59e0b', lastUsedAt: null, skipped: true }
      ];
      switch (payload?.type) {
        case 'GET_SITE_STATE':
          return respond({
            ok: true, supported: true, tabId: 1, url: 'https://example.com/', siteKey: 'example.com',
            hostname: 'example.com', isGoogleUnified: false, activeAccountId: 'a1',
            isIsolatedTab: false, isolatedAccountId: null,
            openIsolatedTabs: [{ accountId: 'a2', tabId: 42 }],
            accounts, settings: { floatingWidget: true, autoSync: true, includeStorage: true }
          });
        case 'MAIL_GET_STATE':
          return respond({ ok: true, activeMailboxId: 'mb1', mailboxes: [{ id: 'mb1', provider: 'hd', address: 'u1@tempmail.edu.pl', createdAt: Date.now() }] });
        default:
          return respond({ ok: false, error: 'stub: unhandled ' + payload?.type });
      }
    };
  });
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.waitForTimeout(900);
  const accCards = await page.locator('.acc-card').count();
  console.log('Account cards:', accCards);
  await page.screenshot({ path: path.join(SHOT_DIR, 'e32-5-accounts-view.png') });

  // settings panel open
  await page.click('#toggleSettingsBtn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, 'e32-6-settings-panel.png') });
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25CF}]/gu;
  const bad = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, 'gu');
    return [...new Set((document.body.innerText || '').match(re) || [])];
  }, emojiRe.source);
  console.log('Accounts view emojis:', bad.length ? bad : 'none');
  await page.close();

  // --- 2. Floating widget on a real page (seed storage, then visit) ---
  const seeder = await context.newPage();
  await seeder.goto(`chrome-extension://${extId}/popup.html`);
  await seeder.waitForTimeout(600);
  await seeder.evaluate(() => {
    return chrome.storage.local.set({
      domains: {
        'example.com': {
          siteKey: 'example.com',
          activeAccountId: 'a1',
          accounts: [
            { id: 'a1', name: 'اکانت ۱', note: '', color: '#6366f1', createdAt: Date.now(), lastUsedAt: Date.now() }
          ],
          settings: { floatingWidget: true, autoSync: true, includeStorage: true }
        }
      }
    });
  });
  await seeder.close();

  const site = await context.newPage();
  await site.goto('https://example.com/', { timeout: 30000 }).catch(() => site.goto('http://example.com/', { timeout: 30000 }));
  await site.waitForTimeout(2500);
  const widgetInfo = await site.evaluate(() => {
    const host = document.querySelector('[data-ai-switcher-host]');
    return { found: Boolean(host) };
  });
  console.log('Widget present:', JSON.stringify(widgetInfo));
  await site.screenshot({ path: path.join(SHOT_DIR, 'e32-7-floating-widget.png') });
  await context.close();
  console.log('VISUAL CHECK DONE');
})().catch((e) => {
  console.error('VISUAL CHECK FAILED:', e.message);
  process.exit(1);
});
