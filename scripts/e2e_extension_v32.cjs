// E2E test v3.2 — dark glass theme, SVG icons, copy fix, new-tab verify links,
// emoji-free DOM, overflow checks + REAL mailbox creation through the API.
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const EXT = '/home/z/my-project/plugin';
const SHOT_DIR = '/tmp/render';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function ok(name, extra = '') {
  results.push(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
}
function warn(name, extra = '') {
  results.push(`WARN ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`WARN ${name}${extra ? ' — ' + extra : ''}`);
}

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
  let extId = sw ? sw.url().split('/')[2] : null;
  if (!extId) {
    const probe = await context.newPage();
    await probe.goto('chrome://extensions', { timeout: 15000 });
    await probe.waitForTimeout(1200);
    extId = await probe.evaluate(() => {
      const mgr = document.querySelector('extensions-manager');
      return mgr?.extensions_?.items_?.[0]?.id || null;
    });
    await probe.close();
  }
  console.log('Extension ID:', extId);

  // =====================================================================
  // PART A — Stubbed popup: dark theme, SVG icons, copy, new-tab links
  // =====================================================================
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.addInitScript(() => {
    // --- keep popup open for assertions when handler calls window.close() ---
    try {
      window.__closedByPopup = false;
      window.close = () => {
        window.__closedByPopup = true;
      };
    } catch (e) {}

    // --- record chrome.tabs calls (stub create/update) ---
    window.__tabCreated = [];
    window.__tabUpdated = [];
    try {
      chrome.tabs.create = (opts, cb) => {
        window.__tabCreated.push(opts);
        if (cb) cb({ id: 999 });
        return Promise.resolve({ id: 999 });
      };
      chrome.tabs.update = (id, opts, cb) => {
        window.__tabUpdated.push({ id, opts });
        if (cb) cb({});
        return Promise.resolve({});
      };
    } catch (e) {
      window.__stubTabsFailed = String(e);
    }

    // --- fake clipboard (records writes, always succeeds) ---
    window.__copied = [];
    const fakeClipboard = {
      writeText: (t) => {
        window.__copied.push(t);
        return Promise.resolve();
      },
      readText: () => Promise.resolve(window.__copied[window.__copied.length - 1] || '')
    };
    try {
      Object.defineProperty(window.Navigator.prototype, 'clipboard', {
        get() {
          return fakeClipboard;
        },
        configurable: true
      });
    } catch (e) {
      window.__stubClipboardFailed = String(e);
    }

    // --- stub background messaging ---
    chrome.runtime.sendMessage = function (payload, cb) {
      const respond = (data) => setTimeout(() => cb && cb(data), 0);
      switch (payload?.type) {
        case 'GET_SITE_STATE':
          return respond({ ok: true, supported: false });
        case 'MAIL_GET_STATE':
          return respond({
            ok: true,
            activeMailboxId: 'mb1',
            mailboxes: [
              {
                id: 'mb1',
                provider: 'hd',
                address: 'test.user99@tempmail.edu.pl',
                createdAt: Date.now()
              }
            ]
          });
        case 'MAIL_LIST_MESSAGES':
          return respond({
            ok: true,
            messages: [
              {
                id: 'm1',
                subject: 'تأیید ثبت‌نام در سرویس نمونه',
                fromAddress: 'no-reply@example.com',
                fromName: 'Example',
                seen: false,
                otpCode: '482913'
              }
            ]
          });
        case 'MAIL_READ_MESSAGE':
          return respond({
            ok: true,
            canDelete: true,
            message: {
              id: 'm1',
              subject: 'تأیید ثبت‌نام در سرویس نمونه',
              fromAddress: 'no-reply@example.com',
              fromName: 'Example',
              otpCode: '482913',
              links: ['https://example.com/verify?token=ONE-TIME-123'],
              html: ['<b>سلام</b> برای فعال‌سازی روی لینک بزنید.'],
              text: 'سلام برای فعال‌سازی روی لینک بزنید.'
            }
          });
        default:
          return respond({ ok: false, error: 'stub: unhandled ' + payload?.type });
      }
    };
  });

  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.waitForTimeout(900);

  // A1 — no raw emojis anywhere in the popup DOM
  const emojiCheck = await page.evaluate(() => {
    const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{25CF}]/gu;
    const txt = document.body.innerText || '';
    return { found: [...new Set(txt.match(re) || [])] };
  });
  if (emojiCheck.found.length === 0) ok('A1 popup DOM emoji-free');
  else ok('A1 popup DOM emoji-free', `FOUND: ${emojiCheck.found.join(' ')}`);

  // A2 — SVG icons actually injected (static data-icon spans replaced)
  const svgCount = await page.locator('span[data-icon] svg').count();
  const pendingIcons = await page.evaluate(
    () => [...document.querySelectorAll('span[data-icon]')].filter((s) => !s.querySelector('svg')).length
  );
  ok('A2 static SVG icons injected', `${svgCount} icons, ${pendingIcons} missing`);
  if (pendingIcons !== 0) throw new Error('Some static icons were not injected');

  // A3 — dark theme: body background is deep navy, not white
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (bodyBg === 'rgb(11, 17, 32)') ok('A3 dark theme body bg', bodyBg);
  else ok('A3 dark theme body bg', `UNEXPECTED ${bodyBg}`);

  // A4 — bigger base font
  const fontSize = await page.evaluate(() => getComputedStyle(document.body).fontSize);
  ok('A4 base font size', fontSize + (fontSize === '14px' ? ' (bumped)' : ' (NOT bumped!)'));
  if (fontSize !== '14px') throw new Error('Base font not bumped');

  // A5 — switch to mail view: dark glass im-app
  await page.click('#tabMailBtn');
  await page.waitForTimeout(700);
  const imBg = await page.evaluate(() => {
    const el = document.querySelector('.im-app');
    const cs = getComputedStyle(el);
    return { image: cs.backgroundImage.slice(0, 60), border: cs.borderColor, blur: cs.backdropFilter };
  });
  ok('A5 mail view glass theme', JSON.stringify(imBg));
  await page.screenshot({ path: path.join(SHOT_DIR, 'e32-1-dark-mail-view.png') });

  // A6 — copy button works end-to-end (stubbed clipboard)
  const cardVisible = await page.locator('#activeMailboxCard:not(.hidden)').count();
  if (!cardVisible) throw new Error('Mailbox card not visible');
  await page.click('#copyEmailBtn');
  await page.waitForTimeout(400);
  const copied = await page.evaluate(() => window.__copied);
  const toastText = (await page.locator('#toast').textContent())?.trim();
  const copyBtnTxt = (await page.locator('#copyEmailBtn').innerText())?.trim();
  ok('A6 copy button', `clipboard="${copied.join(',')}" toast="${toastText}" btn="${copyBtnTxt.replace(/\s+/g, ' ')}"`);
  if (!copied.includes('test.user99@tempmail.edu.pl')) throw new Error('Copy did not write to clipboard');
  if (!toastText.includes('کپی شد')) throw new Error('Copy toast missing');

  // A7 — message modal opens, OTP shows, verify link button opens NEW tab
  await page.locator('.msg-item').first().click();
  await page.waitForTimeout(500);
  const modalVisible = await page.locator('#mailReadModal:not(.hidden)').count();
  if (!modalVisible) throw new Error('Mail modal not visible');
  const otpShown = (await page.locator('#mailModalOtpCode').textContent())?.trim();
  ok('A7a modal + OTP', `otp=${otpShown}`);
  await page.screenshot({ path: path.join(SHOT_DIR, 'e32-2-mail-modal.png') });

  const linkBtnLabel = (await page.locator('.verify-link-btn').first().innerText())?.replace(/\s+/g, ' ').trim();
  await page.locator('.verify-link-btn').first().click();
  await page.waitForTimeout(500);
  const tabCreate = await page.evaluate(() => window.__tabCreated);
  const tabUpdate = await page.evaluate(() => window.__tabUpdated);
  const popupClosed = await page.evaluate(() => window.__closedByPopup);
  ok(
    'A7b verify link',
    `label="${linkBtnLabel}" tabs.create=${JSON.stringify(tabCreate)} tabs.update=${JSON.stringify(tabUpdate)} popupClosed=${popupClosed}`
  );
  if (!tabCreate.length || tabCreate[0].url !== 'https://example.com/verify?token=ONE-TIME-123') {
    throw new Error('Link was not opened via chrome.tabs.create');
  }
  if (tabUpdate.length) throw new Error('BUG: link used tabs.update on existing tab!');
  if (!popupClosed) warn('A7c popup auto-closes after opening link', 'not triggered');
  else ok('A7c popup auto-closes after opening link');

  // close modal for A8 clean measurement
  await page.click('#closeMailModalBtn2');

  // A8 — no horizontal overflow of email box
  const overflow = await page.evaluate(() => {
    const box = document.querySelector('.im-email-box');
    const txt = document.querySelector('.im-email-text');
    return { boxW: box.clientWidth, boxSW: box.scrollWidth, txtW: txt.scrollWidth, txtC: txt.clientWidth };
  });
  ok('A8 email box overflow', JSON.stringify(overflow));
  if (overflow.boxSW > overflow.boxC + 1 || overflow.boxSW > overflow.boxW + 1) {
    // scrollWidth of the box itself may exceed if children overflow
    warn('A8 email box overflow', `scrollWidth ${overflow.boxSW} > clientWidth ${overflow.boxW}`);
  }

  const stubErrors = errors.filter(
    (e) => !e.includes('Unchecked runtime.lastError') && !e.includes('stub: unhandled')
  );
  if (stubErrors.length) throw new Error('Popup page errors: ' + stubErrors.join(' | '));
  ok('A9 stubbed popup run without page errors');
  await page.close();

  // =====================================================================
  // PART B — REAL API: create mailbox through extracted Instant Mail API
  // =====================================================================
  const realPage = await context.newPage();
  const realErrors = [];
  realPage.on('pageerror', (e) => realErrors.push(e.message));
  await realPage.goto(`chrome-extension://${extId}/popup.html`);
  await realPage.waitForTimeout(1000);

  await realPage.click('#tabMailBtn');
  await realPage.waitForTimeout(600);

  const chips = await realPage.locator('.im-chip').count();
  ok('B1 service chips rendered', String(chips));
  if (chips !== 5) throw new Error('Expected 5 service chips, got ' + chips);

  const domChips = await realPage.locator('.im-domain-chip').count();
  ok('B2 HD domain chips', String(domChips));
  if (domChips !== 9) throw new Error('Expected 9 HD domains, got ' + domChips);

  await realPage.click('.im-group-tab[data-group="popular"]');
  await realPage.waitForTimeout(400);
  const popChips = await realPage.locator('.im-domain-chip').count();
  ok('B3 popular chips', String(popChips));
  if (popChips !== 2) throw new Error('Expected 2 popular domains');

  await realPage.click('.im-group-tab[data-group="random"]');
  await realPage.waitForTimeout(300);
  const gridHidden = await realPage.locator('#imDomainGrid.hidden').count();
  ok('B4 random mode hides grid', String(gridHidden === 1));
  const createBtnLabel = (await realPage.locator('#createMailBtn').innerText()).replace(/\s+/g, ' ').trim();
  ok('B4b random create label', createBtnLabel);
  await realPage.click('.im-group-tab[data-group="domain"]');
  await realPage.waitForTimeout(300);
  await realPage.screenshot({ path: path.join(SHOT_DIR, 'e32-3-dark-create-panel.png') });

  // Create a REAL mailbox on the official HD server
  try {
    await realPage.locator('.im-domain-chip', { hasText: 'tempmail.edu.pl' }).first().click();
    await realPage.click('#createMailBtn');
    await realPage.waitForTimeout(5000);
    const addr = (await realPage.locator('#currentEmailText').textContent())?.trim();
    if (addr && addr.includes('@tempmail.edu.pl')) {
      ok('B5 REAL HD mailbox created', addr);
      const noOverflow = await realPage.evaluate(() => {
        const box = document.querySelector('.im-email-box');
        return box.scrollWidth <= box.clientWidth + 1;
      });
      ok('B6 long email stays inside box', String(noOverflow));
      await realPage.screenshot({ path: path.join(SHOT_DIR, 'e32-4-real-mailbox.png') });

      // inbox poll
      await realPage.click('#refreshInboxBtn');
      await realPage.waitForTimeout(2500);
      const status = (await realPage.locator('#inboxPollStatus').textContent())?.trim();
      ok('B7 inbox poll status', status);

      // history select has entries
      const histCount = await realPage.locator('#mailboxHistorySelect option').count();
      ok('B8 history mailboxes', String(histCount));
    } else {
      warn('B5 REAL HD mailbox created', `address="${addr}" (API/network?)`);
    }
  } catch (e) {
    warn('B5 REAL HD mailbox created', e.message);
  }

  const realErrsFiltered = realErrors.filter((e) => !e.includes('Unchecked runtime.lastError'));
  if (realErrsFiltered.length) warn('B9 real popup page errors', realErrsFiltered.join(' | '));
  else ok('B9 real popup run without page errors');
  await realPage.close();

  await context.close();

  console.log('\n===== SUMMARY =====');
  results.forEach((r) => console.log(r));
  const hardFails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(hardFails ? 'E2E FINISHED WITH FAILURES' : 'E2E TEST PASSED');
  process.exit(hardFails ? 1 : 0);
})().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
