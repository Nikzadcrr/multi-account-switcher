// E2E test v3.3 — quick search palette, labels/pin/sort, desktop notifications
// Part A: popup UI with stubbed background  |  Part B: real background integration
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
function fail(name, extra = '') {
  results.push(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
}

const NOW = Date.now();
const STUB_ACCOUNTS = [
  { id: 'a1', name: 'اکانت ۱', note: 'user1@mail.com', email: 'user1@mail.com', color: '#6366f1', labels: ['کاری'], pinned: false, lastUsedAt: NOW - 3600e3, mailboxId: 'mb1' },
  { id: 'a2', name: 'اکانت ۲', note: '', email: '', color: '#10b981', labels: ['شخصی', 'آزمایشی'], pinned: true, lastUsedAt: NOW - 86e5 },
  { id: 'a3', name: 'اکانت ۳ ریکاوری', note: '', email: '', color: '#f59e0b', labels: ['آزمایشی'], pinned: false, lastUsedAt: NOW - 720e5, skipped: true },
  { id: 'a4', name: 'اکانت ۴', note: 'work second', email: '', color: '#ec4899', labels: ['کاری'], pinned: false, lastUsedAt: NOW - 60e3 }
];

const STUB_INIT = `
  window.__msgLog = [];
  chrome.runtime.sendMessage = function (payload, cb) {
    try { window.__msgLog.push(JSON.parse(JSON.stringify(payload))); } catch (e) {}
    const respond = (data) => { try { cb && cb(data); } catch (e) {} };
    const accounts = ${JSON.stringify(STUB_ACCOUNTS)};
    switch (payload?.type) {
      case 'GET_SITE_STATE':
        return respond({
          ok: true, supported: true, tabId: 1, url: 'https://example.com/', siteKey: 'example.com',
          hostname: 'example.com', isGoogleUnified: false, activeAccountId: 'a1',
          isIsolatedTab: false, isolatedAccountId: null,
          openIsolatedTabs: [{ accountId: 'a4', tabId: 77 }],
          accounts, settings: { floatingWidget: true, autoSync: true, includeStorage: true }
        });
      case 'MAIL_GET_STATE':
        return respond({ ok: true, activeMailboxId: 'mb1', mailboxes: [{ id: 'mb1', provider: 'hd', address: 'u1@tempmail.edu.pl', createdAt: ${NOW} }] });
      case 'GET_NOTIF_PREFS':
        return respond({ ok: true, notifPrefs: { enabled: true } });
      case 'EDIT_ACCOUNT_META':
        return respond({ ok: true, account: {} });
      case 'SET_NOTIF_ENABLED':
        return respond({ ok: true, notifPrefs: { enabled: payload.enabled } });
      case 'SWITCH_TO_ACCOUNT':
        return respond({ ok: true, accountName: 'x' });
      default:
        return respond({ ok: true });
    }
  };
`;

(async () => {
  const context = await chromium.launchPersistentContext('/tmp/pw-ext-profile-v33', {
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
      await context.waitForEvent('serviceworker', { timeout: 8000 });
      [sw] = context.serviceWorkers();
    } catch {}
  }
  const extId = sw ? sw.url().split('/')[2] : 'unknown';
  console.log('Extension ID:', extId);

  // ======================================================================
  // PART A — Popup UI (stubbed background)
  // ======================================================================
  const page = await context.newPage();
  await page.addInitScript(STUB_INIT);
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.waitForTimeout(700);

  // A1. header quick search + settings buttons exist (SVG, no emoji)
  const qsBtnCount = await page.locator('#quickSearchBtn svg').count();
  qsBtnCount > 0 ? ok('A1 دکمه جست‌وجوی سریع هدر با آیکون SVG') : fail('A1 دکمه جست‌وجوی سریع هدر', 'svg یافت نشد');

  // A2. sort select visible with accounts (total=4)
  const sortVisible = await page.locator('#sortSelect').isVisible();
  sortVisible ? ok('A2 سِلکت مرتب‌سازی نمایان است') : fail('A2 سِلکت مرتب‌سازی مخفی است');

  // A3. label filter row: «همه» + کاری + شخصی + آزمایشی
  await page.waitForTimeout(300);
  const chipTexts = await page.locator('.filter-chip span').allTextContents();
  const hasAll = chipTexts.includes('همه');
  const hasKari = chipTexts.includes('کاری');
  const hasShakhsi = chipTexts.includes('شخصی');
  const hasAzmayeshi = chipTexts.includes('آزمایشی');
  (hasAll && hasKari && hasShakhsi && hasAzmayeshi)
    ? ok('A3 چیپ‌های فیلتر برچسب (همه/کاری/شخصی/آزمایشی)')
    : fail('A3 چیپ‌های فیلتر برچسب', JSON.stringify(chipTexts));

  // A4. pinned-first ordering (sort=recent default): a2 first, then a4, a1, a3
  let names = await page.locator('.acc-card .acc-name').allTextContents();
  JSON.stringify(names.slice(0, 2)) === JSON.stringify(['اکانت ۲', 'اکانت ۴'])
    ? ok('A4 اکانت پین‌شده همیشه اول لیست', names.join(' | '))
    : fail('A4 ترتیب پین‌شده', names.join(' | '));

  // A5. pin pill visible on pinned card
  const pinPill = await page.locator('.acc-card .pill-pin').count();
  pinPill >= 1 ? ok('A5 نشان «پین» روی کارت پین‌شده') : fail('A5 نشان پین روی کارت');

  // A6. label chips on cards
  const cardLbls = await page.locator('.acc-card .pill-label').allTextContents();
  (cardLbls.includes('کاری') && cardLbls.includes('شخصی') && cardLbls.includes('آزمایشی'))
    ? ok('A6 برچسب‌ها روی کارت اکانت نمایش داده می‌شوند')
    : fail('A6 برچسب‌های روی کارت', JSON.stringify(cardLbls));

  // A7. filter by «کاری» → a1 + a4 only
  await page.locator('.filter-chip', { hasText: 'کاری' }).first().click();
  await page.waitForTimeout(250);
  names = await page.locator('.acc-card .acc-name').allTextContents();
  names.length === 2 && names.includes('اکانت ۱') && names.includes('اکانت ۴')
    ? ok('A7 فیلتر برچسب «کاری» فقط اکانت‌های دارای این برچسب')
    : fail('A7 فیلتر برچسب کاری', names.join(' | '));

  // A8. back to «همه»
  await page.locator('.filter-chip', { hasText: 'همه' }).first().click();
  await page.waitForTimeout(250);
  names = await page.locator('.acc-card .acc-name').allTextContents();
  names.length === 4 ? ok('A8 بازگشت به «همه»') : fail('A8 بازگشت به همه', String(names.length));

  // A9. sort by name: pinned first then ۱,۳,۴ (fa locale)
  await page.selectOption('#sortSelect', 'name');
  await page.waitForTimeout(250);
  names = await page.locator('.acc-card .acc-name').allTextContents();
  JSON.stringify(names) === JSON.stringify(['اکانت ۲', 'اکانت ۱', 'اکانت ۳ ریکاوری', 'اکانت ۴'])
    ? ok('A9 مرتب‌سازی بر اساس نام (پین همیشه اول)')
    : fail('A9 مرتب‌سازی نامی', names.join(' | '));

  // A10. pin toggle on a1 sends EDIT_ACCOUNT_META pinned:true
  await page.selectOption('#sortSelect', 'recent');
  await page.waitForTimeout(250);
  const a1Card = page.locator('.acc-card', { has: page.locator('.acc-name', { hasText: 'اکانت ۱' }) }).first();
  await a1Card.locator('.mini-action[title*="پین‌کردن"]').click();
  await page.waitForTimeout(400);
  const log1 = await page.evaluate(() => window.__msgLog);
  const pinMsg = log1.filter((m) => m.type === 'EDIT_ACCOUNT_META' && m.patch && m.patch.pinned === true);
  pinMsg.length >= 1 ? ok('A10 کلیک پین → EDIT_ACCOUNT_META {pinned:true}') : fail('A10 پیام پین', JSON.stringify(log1.slice(-3)));

  // A11. edit modal on a2 (labels: شخصی+آزمایشی, pinned:true): ADD «کاری» + custom label; save patch
  const a2Card = page.locator('.acc-card', { has: page.locator('.acc-name', { hasText: 'اکانت ۲' }) }).first();
  await a2Card.locator('.mini-action[title*="ویرایش"]').click();
  await page.waitForTimeout(300);
  const chipCount = await page.locator('.edit-chip').count();
  chipCount >= 4 ? ok('A11 مودال ویرایش: چیپ‌های برچسب + پین‌شده') : fail('A11 چیپ‌های مودال', String(chipCount));
  await page.locator('.edit-chip', { hasText: 'کاری' }).first().click();
  await page.locator('#editCustomLabelInput').fill('فریلنس');
  await page.locator('#addCustomLabelBtn').click();
  await page.waitForTimeout(150);
  const modalLbls = await page.locator('.edit-chip span').allTextContents();
  modalLbls.includes('فریلنس') ? ok('A12 افزودن برچسب دلخواه «فریلنس»') : fail('A12 برچسب دلخواه', JSON.stringify(modalLbls));
  await page.locator('#saveEditBtn').click();
  await page.waitForTimeout(400);
  const log2 = await page.evaluate(() => window.__msgLog);
  const editMsg = [...log2].reverse().find((m) => m.type === 'EDIT_ACCOUNT_META');
  const labelsOk = editMsg && editMsg.patch && Array.isArray(editMsg.patch.labels)
    && editMsg.patch.labels.includes('کاری') && editMsg.patch.labels.includes('فریلنس')
    && editMsg.patch.labels.includes('شخصی') && editMsg.patch.pinned === true;
  labelsOk ? ok('A13 ذخیره مودال: افزودن برچسب + حفظ پین') : fail('A13 patch مودال', JSON.stringify(editMsg));

  // A14. screenshot accounts view (before opening settings)
  await page.screenshot({ path: path.join(SHOT_DIR, 'v33-accounts-labels-pin-sort.png') });
  ok('A14 اسکرین‌شات نمای اکانت‌ها ذخیره شد');

  // A15. desktop notification toggle present & works
  await page.locator('#toggleSettingsBtn').click();
  await page.waitForTimeout(200);
  const notifVisible = await page.locator('#chkDesktopNotif').isVisible();
  notifVisible ? ok('A14 سوییچ «اعلان دسکتاپ» در تنظیمات') : fail('A14 سوییچ اعلان دسکتاپ');
  await page.locator('#chkDesktopNotif').click();
  await page.waitForTimeout(300);
  const log3 = await page.evaluate(() => window.__msgLog);
  const notifMsg = log3.find((m) => m.type === 'SET_NOTIF_ENABLED');
  notifMsg && notifMsg.enabled === false
    ? ok('A15 خاموش‌کردن اعلان → SET_NOTIF_ENABLED {enabled:false}')
    : fail('A15 پیام SET_NOTIF_ENABLED', JSON.stringify(log3.slice(-2)));

  // A16. no raw emojis anywhere in popup DOM
  const emojiScan = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;
    return { found: re.test(txt), sample: txt.match(re)?.[0] || '' };
  });
  !emojiScan.found ? ok('A16 هیچ ایموجی خامی در پاپ‌آپ نیست') : fail('A16 ایموجی خام پیدا شد', emojiScan.sample);

  // A17. font sizes: body 14px, acc-name ≥ 13px, filter-chip ≥ 12px
  const fontBody = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  const fontName = await page.evaluate(() => {
    const el = document.querySelector('.acc-name');
    return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  });
  const fontChip = await page.evaluate(() => {
    const el = document.querySelector('.filter-chip');
    return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  });
  fontBody >= 14 && fontName >= 13 && fontChip >= 12
    ? ok('A17 اندازه فونت‌ها (بدنه/نام/چیپ)', `${fontBody}/${fontName}/${fontChip}px`)
    : fail('A17 فونت ریز', `${fontBody}/${fontName}/${fontChip}px`);

  // A18. no horizontal overflow in body or account cards
  const overflow = await page.evaluate(() => {
    const b = document.body;
    const bodyBad = b.scrollWidth > b.clientWidth + 2;
    const cards = [...document.querySelectorAll('.acc-card')];
    const cardBad = cards.some((c) => c.scrollWidth > c.clientWidth + 2);
    return { bodyBad, cardBad, bw: b.scrollWidth, bc: b.clientWidth };
  });
  !overflow.bodyBad && !overflow.cardBad
    ? ok('A18 بدون سرریز افقی از کادرها')
    : fail('A18 سرریز افقی', JSON.stringify(overflow));

  // A19. settings screenshot (with desktop-notif toggle + new shortcut hints)
  await page.screenshot({ path: path.join(SHOT_DIR, 'v33-settings-notif.png') });
  ok('A19 اسکرین‌شات تنظیمات (اعلان دسکتاپ) ذخیره شد');

  // ======================================================================
  // PART B — Real background integration
  // ======================================================================
  // Seed real storage with accounts across two sites
  const seedAccounts = [
    { id: 'sa1', name: 'اکانت کاری', note: '', email: '', color: '#6366f1', labels: ['کاری'], pinned: false, lastUsedAt: NOW - 5e6, createdAt: NOW - 9e6, cookies: [{ name: 'sid', value: 'x1', domain: 'example.com', hostOnly: false, path: '/', secure: true, httpOnly: false, sameSite: 'lax', session: true }] },
    { id: 'sa2', name: 'اکانت پین‌شده', note: '', email: '', color: '#10b981', labels: [], pinned: true, lastUsedAt: NOW - 9e6, createdAt: NOW - 10e6, cookies: [] }
  ];
  await sw.evaluate(
    ([accs, now]) =>
      chrome.storage.local.set({
        domains: {
          'example.com': {
            siteKey: 'example.com',
            activeAccountId: 'sa1',
            accounts: accs,
            settings: { floatingWidget: true, autoSync: true, includeStorage: true }
          },
          'testsite.org': {
            siteKey: 'testsite.org',
            activeAccountId: null,
            accounts: [
              { id: 'tb1', name: 'اکانت سایت دیگر', note: '', email: '', color: '#f59e0b', labels: ['آزمایشی'], pinned: false, lastUsedAt: now - 2e6, createdAt: now - 3e6, cookies: [] }
            ],
            settings: { floatingWidget: true, autoSync: true, includeStorage: true }
          }
        }
      }),
    [seedAccounts, NOW]
  );

  // B1. real popup page → QUICK_SEARCH_ACCOUNTS: same-site + other-site matches
  const realPopup = await context.newPage();
  await realPopup.goto(`chrome-extension://${extId}/popup.html`);
  await realPopup.waitForTimeout(600);
  const sendQ = (query) =>
    realPopup.evaluate(
      (q) =>
        new Promise((res) =>
          chrome.runtime.sendMessage(
            { type: 'QUICK_SEARCH_ACCOUNTS', query: q, currentSiteKey: 'example.com' },
            (r) => res(r)
          )
        ),
      query
    );
  const searchRes = await sendQ('کاری');
  const searchResB = await sendQ('آزمایشی');
  const ss = searchRes?.sameSite || [];
  const osB = searchResB?.otherSites || [];
  const b1Cond =
    searchRes?.ok &&
    ss.some((r) => r.accountId === 'sa1' && r.isSameSite && r.siteUrl === 'https://example.com') &&
    osB.some((r) => r.accountId === 'tb1' && r.siteKey === 'testsite.org' && !r.isSameSite);
  b1Cond
    ? ok('B1 QUICK_SEARCH_ACCOUNTS: همین سایت + سایت دیگر')
    : fail('B1 جست‌وجوی سریع پس‌زمینه', JSON.stringify({ searchRes, osB }).slice(0, 260));

  // B2. pinned-first ordering in quick search (empty query)
  const searchRes2 = await realPopup.evaluate(
    () =>
      new Promise((res) =>
        chrome.runtime.sendMessage(
          { type: 'QUICK_SEARCH_ACCOUNTS', query: '', currentSiteKey: 'example.com' },
          (r) => res(r)
        )
      )
  );
  (searchRes2?.sameSite || [])[0]?.accountId === 'sa2'
    ? ok('B2 اکانت پین‌شده در نتایج جست‌وجو اول است')
    : fail('B2 ترتیب پین در جست‌وجو', JSON.stringify(searchRes2?.sameSite?.map((r) => r.accountId)));

  // B3. EDIT_ACCOUNT_META persists labels + pinned in real storage
  await realPopup.evaluate(
    () =>
      new Promise((res) =>
        chrome.runtime.sendMessage(
          { type: 'EDIT_ACCOUNT_META', siteKey: 'example.com', accountId: 'sa1', patch: { labels: ['کاری', 'شخصی'], pinned: true } },
          (r) => res(r)
        )
      )
  );
  const stored = await sw.evaluate(() =>
    new Promise((res) =>
      chrome.storage.local.get('domains', (d) => res(d.domains['example.com'].accounts.find((a) => a.id === 'sa1')))
    )
  );
  stored.labels?.length === 2 && stored.pinned === true
    ? ok('B3 ذخیره پایدار برچسب + پین در storage')
    : fail('B3 ذخیره برچسب/پین', JSON.stringify(stored).slice(0, 200));

  // B4. notif prefs default on → off → on
  const p1 = await realPopup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'GET_NOTIF_PREFS' }, (r) => res(r))));
  const p2 = await realPopup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'SET_NOTIF_ENABLED', enabled: false }, (r) => res(r))));
  const p3 = await realPopup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'GET_NOTIF_PREFS' }, (r) => res(r))));
  const p4 = await realPopup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'SET_NOTIF_ENABLED', enabled: true }, (r) => res(r))));
  p1?.notifPrefs?.enabled === true && p3?.notifPrefs?.enabled === false && p4?.notifPrefs?.enabled === true
    ? ok('B4 چرخه تنظیم اعلان دسکتاپ (روشن/خاموش/روشن)')
    : fail('B4 تنظیم اعلان', JSON.stringify({ p1, p3, p4 }));

  // B5. MAIL_POLL_NOW with no mailboxes → ok
  const poll0 = await realPopup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'MAIL_POLL_NOW' }, (r) => res(r))));
  poll0?.ok ? ok('B5 MAIL_POLL_NOW بدون صندوق → ok') : fail('B5 پول اعلان خالی', JSON.stringify(poll0));

  // B6. commands registered (quick-switch-search + Alt+Shift+F)
  const cmds = await sw.evaluate(() => chrome.commands.getAll());
  const qsCmd = cmds.find((c) => c.name === 'quick-switch-search');
  qsCmd && qsCmd.shortcut.includes('F')
    ? ok('B6 فرمان کیبورد جست‌وجوی سریع ثبت شد', qsCmd.shortcut)
    : fail('B6 فرمان کیبورد', JSON.stringify(cmds));

  // B7. notifications permission works (create + clear a real notification)
  const notifResult = await sw.evaluate(
    () =>
      new Promise((res) => {
        try {
          chrome.notifications.create(
            'v33-test-notif',
            {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/icon48.png'),
              title: 'تست اعلان',
              message: 'کد تأیید: ۱۲۳۴۵۶'
            },
            (id) => {
              const err = chrome.runtime.lastError?.message || null;
              if (!err) chrome.notifications.clear(id, () => {});
              res({ err, id });
            }
          );
        } catch (e) {
          res({ err: e.message });
        }
      })
  );
  !notifResult.err ? ok('B7 اعلان دسکتاپ ساخته و پاک شد') : fail('B7 ساخت اعلان', notifResult.err);

  // B8. alarm registered for periodic polling
  const alarms = await sw.evaluate(() => chrome.alarms.getAll());
  alarms.some((a) => a.name === 'mail-notif-poll')
    ? ok('B8 آلارم دوره‌ای چک ایمیل ثبت شد')
    : fail('B8 آلارم ثبت نشده', JSON.stringify(alarms));

  // B9. content-script palette opens via message on a real page
  const webPage = await context.newPage();
  await webPage.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  await webPage.waitForTimeout(1200);
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_QUICK_SWITCHER' });
  }).catch((e) => fail('B9 ارسال پیام پالت', e.message));
  await webPage.waitForTimeout(800);
  const paletteOpen = await webPage.evaluate(() => {
    const host = document.querySelector('[data-ai-switcher-palette]');
    return { exists: Boolean(host), visible: host ? host.style.display === 'block' : false };
  });
  paletteOpen.exists && paletteOpen.visible
    ? ok('B9 پالت جست‌وجوی سریع در صفحه باز شد')
    : fail('B9 پالت باز نشد', JSON.stringify(paletteOpen));
  await webPage.screenshot({ path: path.join(SHOT_DIR, 'v33-quick-palette.png') });

  // B10. real mailbox + poll pipeline (network dependent → WARN on failure)
  try {
    const mbRes = await realPopup.evaluate(
      () =>
        new Promise((res) =>
          chrome.runtime.sendMessage({ type: 'MAIL_CREATE_INBOX', provider: 'hd', domain: '', customUser: '' }, (r) => res(r))
        )
    );
    if (mbRes?.ok) {
      const pollRes = await realPopup.evaluate(
        () => new Promise((res) => chrome.runtime.sendMessage({ type: 'MAIL_POLL_NOW' }, (r) => res(r)))
      );
      const mbState = await sw.evaluate(
        () =>
          new Promise((res) =>
            chrome.storage.local.get('mailState', (d) => {
              const st = d.mailState || {};
              res({
                boxes: st.mailboxes.length,
                inited: st.mailboxes.every((m) => m.notifInit === true)
              });
            })
          )
      );
      pollRes?.ok && mbState.inited && mbState.boxes > 0
        ? ok('B10 خط لوله اعلان با صندوق واقعی', `صندوق‌ها: ${mbState.boxes}`)
        : fail('B10 خط لوله اعلان', JSON.stringify({ pollRes, mbState }));
    } else {
      warn('B10 ساخت صندوق واقعی ناموفق (شبکه؟)', JSON.stringify(mbRes).slice(0, 120));
    }
  } catch (e) {
    warn('B10 خطای صندوق واقعی', e.message);
  }

  // ======================================================================
  await context.close();

  const passCount = results.filter((r) => r.startsWith('PASS')).length;
  const failCount = results.filter((r) => r.startsWith('FAIL')).length;
  const warnCount = results.filter((r) => r.startsWith('WARN')).length;
  console.log('\n================== RESULT ==================');
  console.log(`PASS: ${passCount} | FAIL: ${failCount} | WARN: ${warnCount}`);
  fs.writeFileSync('/tmp/render/v33-results.txt', results.join('\n'));
  process.exit(failCount > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
