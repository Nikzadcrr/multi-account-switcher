// Screenshots for Agent tab — نمای صحیح 402×600 با deviceScaleFactor=2 (خروجی 804×1200)
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const EXT = '/home/z/my-project/plugin';
const SHOTS = '/home/z/my-project/plugin/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const context = await chromium.launchPersistentContext('/tmp/pw-ext-profile-agent-shots', {
    headless: true,
    channel: 'chromium',
    deviceScaleFactor: 2,
    viewport: { width: 402, height: 600 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  let [sw] = context.serviceWorkers();
  if (!sw) {
    await context.waitForEvent('serviceworker', { timeout: 8000 });
    [sw] = context.serviceWorkers();
  }
  const extId = sw.url().split('/')[2];
  console.log('extId:', extId);

  // دیتای دمو: صندوق ایمیل + سه حساب خزانه
  const DEMO_MAILBOX = {
    id: 'demo_mb_1',
    provider: 'hd',
    address: 'r8kx4wq2v9@instmail.app',
    createdAt: Date.now() - 400000
  };
  await sw.evaluate(async (mb) => {
    const data = await chrome.storage.local.get(['mailState', 'agentAccounts']);
    const st = data.mailState || { activeMailboxId: null, mailboxes: [] };
    if (!st.mailboxes.some((m) => m.id === mb.id)) {
      st.mailboxes.unshift(mb);
      st.activeMailboxId = mb.id;
    }
    const demoAccounts = [
      {
        id: 'ag_demo_1',
        hostname: 'reddit.com',
        email: 'r8kx4wq2v9@instmail.app',
        mailboxId: mb.id,
        username: 'saravx841',
        password: 'Kw7#pZm2!qrT',
        note: 'ثبت‌نام ایجنت — reddit.com | کد تأیید: 482913',
        otpStatus: 'received',
        createdAt: Date.now() - 3600000
      },
      {
        id: 'ag_demo_2',
        hostname: 'twitch.tv',
        email: 'm3pb7hnq1c@instmail.app',
        mailboxId: mb.id,
        username: 'liamqz293',
        password: 'Vr9$tNk4@wsE',
        note: 'ثبت‌نام ایجنت — twitch.tv',
        otpStatus: 'received',
        createdAt: Date.now() - 86400000
      },
      {
        id: 'ag_demo_3',
        hostname: 'notion.so',
        email: 'x9jd2fw6r5@instmail.app',
        mailboxId: mb.id,
        username: 'emmapt517',
        password: 'Qs5%hBn8&yuc',
        note: 'ثبت‌نام ایجنت — notion.so',
        otpStatus: 'email_only',
        createdAt: Date.now() - 2 * 86400000
      }
    ];
    await chrome.storage.local.set({
      mailState: st,
      agentAccounts: demoAccounts
    });
  }, DEMO_MAILBOX);

  const tabId = await sw.evaluate(async () => {
    const tab = await chrome.tabs.create({ url: 'https://www.reddit.com/' });
    return tab.id;
  });
  await new Promise((r) => setTimeout(r, 800));

  const TAB_STUB = {
    tabId,
    demoRun: {
      tabId,
      hostname: 'reddit.com',
      status: 'waiting_otp',
      email: 'r8kx4wq2v9@instmail.app',
      username: 'saravx841',
      password: '',
      otp: '482913',
      otpFilled: false,
      links: [],
      fields: { email: { type: 'email' }, username: {}, password: { type: 'password' }, confirm: {} },
      captcha: { type: 'recaptcha_v2', sitekey: '6L...' },
      log: [
        { t: Date.now() - 52000, text: 'ایجنت شروع شد.' },
        { t: Date.now() - 51000, text: 'در حال تشخیص فرم ثبت‌نام در صفحه...' },
        { t: Date.now() - 49000, text: 'فرم شناسایی شد (ایمیل، نام کاربری، رمز، تکرار رمز).' },
        { t: Date.now() - 48000, text: 'کپچای reCAPTCHA روی صفحه هست.' },
        { t: Date.now() - 46000, text: 'فیلدها پر شد (ایمیل، username، password، confirm، terms).' },
        { t: Date.now() - 42000, text: 'در حال حل کپچا با CapSolver...' },
        { t: Date.now() - 31000, text: 'توکن کپچا ساخته و در صفحه تزریق شد.' },
        { t: Date.now() - 30000, text: 'دکمه «Sign Up» کلیک شد.' },
        { t: Date.now() - 28000, text: 'حساب در خزانه ایجنت ذخیره شد.' },
        { t: Date.now() - 24000, text: 'در انتظار ایمیل تأیید (تا ۳ دقیقه)...' },
        { t: Date.now() - 9000, text: 'کد تأیید در ایمیل پیدا شد: 482913' }
      ],
      startedAt: Date.now() - 55000,
      finishedAt: null,
      savedAccountId: 'ag_demo_1',
      error: null
    }
  };

  // شات ۱ — پنل اجرای ایجنت
  const shot1 = await context.newPage();
  await shot1.addInitScript(
    (args) => {
      const origQuery = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (q, cb) => {
        if (q && q.active && q.currentWindow) {
          const res = [{ id: args.tabId, url: 'https://www.reddit.com/register/' }];
          if (cb) {
            cb(res);
            return;
          }
          return Promise.resolve(res);
        }
        return origQuery(q, cb);
      };
      const origSend = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (payload, cb) => {
        if (payload && payload.type === 'AGENT_GET_RUN_STATE') {
          const res = { ok: true, run: args.demoRun };
          if (cb) {
            setTimeout(() => cb(res), 20);
            return;
          }
          return Promise.resolve(res);
        }
        return origSend(payload, cb);
      };
    },
    TAB_STUB
  );
  await shot1.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await shot1.waitForTimeout(1500);
  await shot1.click('#tabAgentBtn');
  await shot1.waitForTimeout(900);
  await shot1.screenshot({ path: path.join(SHOTS, 'agent-run.png') });
  console.log('saved agent-run.png');

  // شات ۲ — خزانه حساب‌ها
  const shot2 = await context.newPage();
  await shot2.addInitScript(
    (args) => {
      const origQuery = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (q, cb) => {
        if (q && q.active && q.currentWindow) {
          const res = [{ id: args.tabId, url: 'https://www.reddit.com/register/' }];
          if (cb) {
            cb(res);
            return;
          }
          return Promise.resolve(res);
        }
        return origQuery(q, cb);
      };
    },
    TAB_STUB
  );
  await shot2.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await shot2.waitForTimeout(1500);
  await shot2.click('#tabAgentBtn');
  await shot2.waitForTimeout(600);
  await shot2.click('#agentVaultPill');
  await shot2.waitForTimeout(900);
  await shot2.screenshot({ path: path.join(SHOTS, 'agent-vault.png') });
  console.log('saved agent-vault.png');

  // شات ۳ — پنل اجرا در حالت آماده (بدون اجرا) برای تنوع
  const shot3 = await context.newPage();
  await shot3.addInitScript(
    (args) => {
      const origQuery = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (q, cb) => {
        if (q && q.active && q.currentWindow) {
          const res = [{ id: args.tabId, url: 'https://www.twitch.tv/signup' }];
          if (cb) {
            cb(res);
            return;
          }
          return Promise.resolve(res);
        }
        return origQuery(q, cb);
      };
    },
    TAB_STUB
  );
  await shot3.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await shot3.waitForTimeout(1500);
  await shot3.click('#tabAgentBtn');
  await shot3.waitForTimeout(900);
  await shot3.screenshot({ path: path.join(SHOTS, 'agent-panel.png') });
  console.log('saved agent-panel.png');

  // پاکسازی تب دمو
  await sw.evaluate(async (id) => {
    await chrome.tabs.remove(id).catch(() => {});
  }, tabId);

  await context.close();
  console.log('DONE');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
