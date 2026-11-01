// E2E test: loads the unpacked extension in Chromium, opens the popup,
// walks through the Instant Mail create-email UI and creates real mailboxes.
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const path = require('path');

const EXT = '/home/z/my-project/plugin';
const SHOT_DIR = '/tmp/render';
const fs = require('fs');
fs.mkdirSync(SHOT_DIR, { recursive: true });

(async () => {
  const context = await chromium.launchPersistentContext('/tmp/pw-ext-profile', {
    headless: true,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
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
  let extId;
  if (sw) {
    extId = sw.url().split('/')[2];
  } else {
    // Unpacked extension ids are derived from the install path (SHA256 → a..p)
    const crypto = require('crypto');
    extId = crypto
      .createHash('sha256')
      .update(EXT)
      .digest('hex')
      .slice(0, 32)
      .split('')
      .map((c) => String.fromCharCode(parseInt(c, 16) + 97))
      .join('');
  }
  // Verify the id actually works; otherwise scrape chrome://extensions
  let ok = false;
  try {
    const probe = await context.newPage();
    const resp = await probe.goto(`chrome-extension://${extId}/manifest.json`, { timeout: 8000 });
    ok = resp && resp.status() === 200;
    await probe.close();
  } catch {}
  if (!ok) {
    const extPage = await context.newPage();
    await extPage.goto('chrome://extensions', { timeout: 15000 });
    await extPage.waitForTimeout(1500);
    extId = await extPage.evaluate(() => {
      const mgr = document.querySelector('extensions-manager');
      return mgr?.extensions_?.items_?.[0]?.id || null;
    });
    await extPage.close();
  }
  console.log('Extension ID:', extId);

  const errors = [];
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.waitForTimeout(1200);

  // 1. Switch to mail tab
  await page.click('#tabMailBtn');
  await page.waitForTimeout(600);
  const chips = await page.locator('.im-chip').count();
  console.log('Service chips rendered:', chips); // expect 5
  if (chips !== 5) throw new Error('Expected 5 service chips');
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1-create-panel.png') });

  // 2. Default provider = hd, group = domain → domain grid should show 9 domains
  const domChips = await page.locator('.im-domain-chip').count();
  console.log('HD domain chips:', domChips); // expect 9
  if (domChips !== 9) throw new Error('Expected 9 HD domains, got ' + domChips);

  // 3. Test popular group
  await page.click('.im-group-tab[data-group="popular"]');
  await page.waitForTimeout(400);
  const popChips = await page.locator('.im-domain-chip').count();
  console.log('HD popular chips:', popChips); // expect 2
  if (popChips !== 2) throw new Error('Expected 2 popular domains');

  // 4. Test random group
  await page.click('.im-group-tab[data-group="random"]');
  await page.waitForTimeout(300);
  const gridHidden = await page.locator('#imDomainGrid.hidden').count();
  console.log('Random mode hides grid:', gridHidden === 1);
  await page.click('.im-group-tab[data-group="domain"]');
  await page.waitForTimeout(300);

  // 5. Create HD mailbox on selected domain (tempmail.edu.pl)
  await page.locator('.im-domain-chip', { hasText: 'tempmail.edu.pl' }).click();
  await page.click('#createMailBtn');
  await page.waitForTimeout(4000); // network
  const addr = (await page.locator('#currentEmailText').textContent())?.trim();
  console.log('Created HD mailbox:', addr);
  if (!addr || !addr.includes('@tempmail.edu.pl')) throw new Error('HD mailbox not created: ' + addr);
  const cardVisible = await page.locator('#activeMailboxCard:not(.hidden)').count();
  if (!cardVisible) throw new Error('Email card not visible after create');
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-2-mailbox-created.png') });

  // 6. Inbox section visible + empty state text
  const emptyInbox = await page.locator('#emptyInboxState').textContent();
  console.log('Empty inbox text:', emptyInbox?.trim().split('\n')[0]);

  // 7. Switch provider to hd_gmail and create
  await page.click('#newMailBtn');
  await page.waitForTimeout(300);
  await page.locator('.im-chip', { hasText: 'جیمیل آنی' }).click();
  await page.waitForTimeout(600);
  const gChips = await page.locator('.im-domain-chip').count();
  console.log('Gmail domain chips:', gChips); // expect 2
  await page.click('#createMailBtn');
  await page.waitForTimeout(4000);
  const gAddr = (await page.locator('#currentEmailText').textContent())?.trim();
  console.log('Created HD_GMAIL mailbox:', gAddr);
  if (!gAddr || !gAddr.includes('@gmail.com')) throw new Error('Gmail mailbox not created: ' + gAddr);
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-3-gmail-created.png') });

  // 8. temp-mail.io provider (dynamic domains)
  await page.click('#newMailBtn');
  await page.waitForTimeout(300);
  await page.locator('.im-chip', { hasText: 'Temp-Mail.io' }).click();
  await page.waitForTimeout(1500);
  const ioChips = await page.locator('.im-domain-chip').count();
  console.log('IO domain chips:', ioChips); // expect ~7
  if (ioChips < 1) throw new Error('IO domains not loaded');
  await page.click('#createMailBtn');
  await page.waitForTimeout(4000);
  const ioAddr = (await page.locator('#currentEmailText').textContent())?.trim();
  console.log('Created IO mailbox:', ioAddr);
  if (!ioAddr) throw new Error('IO mailbox not created');

  // 9. Mailbox history select should list 3 mailboxes
  const histCount = await page.locator('#mailboxHistorySelect option').count();
  console.log('History mailboxes:', histCount); // expect 3
  if (histCount !== 3) throw new Error('Expected 3 mailboxes in history');

  // 10. Refresh inbox works without error (IO active)
  await page.click('#refreshInboxBtn');
  await page.waitForTimeout(2500);
  const statusText = (await page.locator('#inboxPollStatus').textContent())?.trim();
  console.log('Poll status after refresh:', statusText);
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-4-final.png') });

  // 11. Persistence: reopen popup → mailbox card still visible
  await page.reload();
  await page.waitForTimeout(1500);
  const addrAfterReload = (await page.locator('#currentEmailText').textContent())?.trim();
  console.log('After reload, active mailbox:', addrAfterReload);
  if (addrAfterReload !== ioAddr) throw new Error('Mailbox state not persisted');

  const realErrors = errors.filter((e) => !e.includes('Unchecked runtime.lastError'));
  console.log('\nConsole/page errors:', realErrors.length ? realErrors : 'none');

  await context.close();
  console.log('\nE2E TEST PASSED ✅');
  process.exit(realErrors.length ? 2 : 0);
})().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
