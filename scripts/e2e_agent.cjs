// E2E Agent test — ثبت‌نام خودکار: اسکن، پر کردن، ارسال، OTP، خزانه و UI پاپ‌آپ
// + تولید اسکرین‌شات‌های تب ایجنت برای README
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const EXT = '/home/z/my-project/plugin';
const SHOTS = '/home/z/my-project/plugin/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function ok(name, extra = '') {
  results.push(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
}
function fail(name, extra = '') {
  results.push(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
}
function assert(cond, name, extra = '') {
  if (cond) ok(name, extra);
  else fail(name, extra);
}

// ---------------------------------------------------------------------
// سرور محلی: صفحه ثبت‌نام فیک با مرحله OTP
// ---------------------------------------------------------------------
const REGISTER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>TestSite — Sign Up</title>
<style>body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px}
input{display:block;width:100%;padding:8px;margin:8px 0;box-sizing:border-box}
button{padding:10px 18px}label{font-size:14px}</style></head><body>
<h1>Create your account</h1>
<p>Join TestSite today — registration is free.</p>
<form id="reg">
  <input name="username" id="username" type="text" placeholder="Username" autocomplete="username">
  <input name="email" id="email" type="email" placeholder="Email address" autocomplete="email">
  <input name="password" id="password" type="password" placeholder="Password">
  <input name="password2" id="password2" type="password" placeholder="Confirm password">
  <label><input type="checkbox" id="terms"> I agree to the Terms of Service</label>
  <button type="submit" id="submitBtn">Sign Up</button>
</form>
<div id="otpStage" style="display:none">
  <h2>Verify your email</h2>
  <p>We sent a 6-digit verification code to your inbox.</p>
  <input id="otp" name="otp_code" type="text" maxlength="6" placeholder="Enter code" inputmode="numeric">
  <button id="verifyBtn" onclick="doVerify()">Verify</button>
</div>
<div id="done" style="display:none"></div>
<script>
document.getElementById('reg').addEventListener('submit', function(e){
  e.preventDefault();
  window.__submitted = {
    username: document.getElementById('username').value,
    email: document.getElementById('email').value,
    password: document.getElementById('password').value,
    confirm: document.getElementById('password2').value,
    terms: document.getElementById('terms').checked
  };
  document.getElementById('reg').style.display='none';
  document.getElementById('otpStage').style.display='block';
});
function doVerify(){
  const v = document.getElementById('otp').value;
  if(!v) return;
  window.__otpSubmitted = v;
  document.getElementById('otpStage').style.display='none';
  const d = document.getElementById('done');
  d.style.display='block';
  d.textContent = 'Welcome ' + (window.__submitted ? window.__submitted.username : '') +
    ' — account created for ' + (window.__submitted ? window.__submitted.email : '');
}
</script></body></html>`;

async function startServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(REGISTER_HTML);
  });
  await new Promise((r) => server.listen(18877, '127.0.0.1', r));
  return server;
}

(async () => {
  const server = await startServer();

  const context = await chromium.launchPersistentContext('/tmp/pw-ext-profile-agent', {
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
  const extId = sw ? sw.url().split('/')[2] : null;
  assert(Boolean(extId), 'service worker بالا آمد', extId || '');
  if (!extId) {
    console.log(results.join('\n'));
    process.exit(1);
  }

  // =====================================================================
  // TEST A — اسکریپت محتوایی: اسکن / پر کردن / ارسال / OTP
  // =====================================================================
  const pageA = await context.newPage();
  await pageA.goto('http://127.0.0.1:18877/register', { waitUntil: 'load' });
  const tabIdA = await (await pageA.evaluate(() => null, null).catch(() => null), 0) || null;
  // گرفتن tabId از خود سرویس‌ورکر (تب فعال)
  const tabA = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    return tabs[0] ? { id: tabs[0].id, url: tabs[0].url } : null;
  }, 'http://127.0.0.1:18877/*');
  assert(Boolean(tabA), 'تب سایت فیک پیدا شد', tabA ? `tabId=${tabA.id}` : '');

  // اسکن
  const scan = await sw.evaluate(async (tabId) => {
    await agentEnsureInjected(tabId);
    return await agentSendTab(tabId, { type: 'AGENT_SCAN' });
  }, tabA.id);
  assert(scan && scan.ok, 'AGENT_SCAN پاسخ داد');
  assert(scan?.hasFields, 'فیلدهای فرم شناسایی شدند');
  assert(scan?.fields?.email?.type === 'email', 'فیلد ایمیل درست شناسایی شد', JSON.stringify(scan?.fields?.email || {}));
  assert(Boolean(scan?.fields?.username), 'فیلد نام کاربری شناسایی شد', JSON.stringify(scan?.fields?.username || {}));
  assert(Boolean(scan?.fields?.password), 'فیلد رمز شناسایی شد');
  assert(Boolean(scan?.fields?.confirm), 'فیلد تکرار رمز شناسایی شد');
  assert(scan?.hasSubmit, 'دکمه ثبت‌نام شناسایی شد', `label=${scan?.submitText}`);
  assert(scan?.hasTerms, 'چک‌باکس قوانین شناسایی شد');
  assert(scan?.captcha === null, 'کپچای غیرموجود = null', JSON.stringify(scan?.captcha));

  // پر کردن
  const fillRes = await sw.evaluate(async (tabId) => {
    return await agentSendTab(tabId, {
      type: 'AGENT_FILL',
      payload: { email: 'agent-e2e@example.com', username: 'e2euser42', password: 'T3st!Pass#9' }
    });
  }, tabA.id);
  assert(fillRes?.ok, 'AGENT_FILL انجام شد', JSON.stringify(fillRes?.filled || []));
  for (const k of ['email', 'username', 'password', 'confirm', 'terms']) {
    assert((fillRes?.filled || []).includes(k), `فیلد ${k} پر شد`);
  }
  const domVals = await pageA.evaluate(() => ({
    email: document.getElementById('email').value,
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    confirm: document.getElementById('password2').value,
    terms: document.getElementById('terms').checked
  }));
  assert(domVals.email === 'agent-e2e@example.com', 'مقدار ایمیل در DOM درج شد', domVals.email);
  assert(domVals.username === 'e2euser42', 'مقدار یوزرنیم در DOM درج شد', domVals.username);
  assert(domVals.password === domVals.confirm && domVals.password === 'T3st!Pass#9', 'رمز و تکرارش یکسان درج شدند');
  assert(domVals.terms === true, 'چک‌باکس قوانین تیک خورد');

  // ارسال فرم
  const subRes = await sw.evaluate(async (tabId) => {
    return await agentSendTab(tabId, { type: 'AGENT_CLICK_SUBMIT' });
  }, tabA.id);
  assert(subRes?.ok, 'AGENT_CLICK_SUBMIT کلیک کرد', JSON.stringify(subRes || {}));
  await pageA.waitForTimeout(400);
  const stage = await pageA.evaluate(() => ({
    submitted: window.__submitted || null,
    otpVisible: document.getElementById('otpStage').style.display !== 'none'
  }));
  assert(stage.submitted !== null, 'فرم واقعاً submit شد', JSON.stringify(stage.submitted || {}));
  assert(stage.otpVisible, 'صفحه به مرحله کد تأیید رفت');

  // تشخیص و پر کردن OTP
  const otpDetect = await sw.evaluate(async (tabId) => {
    return await agentSendTab(tabId, { type: 'AGENT_DETECT_OTP' });
  }, tabA.id);
  assert(otpDetect?.ok && otpDetect?.otp === true, 'فیلد OTP تشخیص داده شد');
  const otpFill = await sw.evaluate(async (tabId) => {
    return await agentSendTab(tabId, { type: 'AGENT_FILL_OTP', code: '482913' });
  }, tabA.id);
  assert(otpFill?.ok, 'AGENT_FILL_OTP انجام شد', JSON.stringify(otpFill || {}));
  const otpVal = await pageA.evaluate(() => document.getElementById('otp').value);
  assert(otpVal === '482913', 'کد تأیید در صفحه درج شد', otpVal);

  // =====================================================================
  // TEST B — اجرای کامل فلو از پس‌زمینه + ذخیره در خزانه
  // =====================================================================
  const pageB = await context.newPage();
  await pageB.goto('http://127.0.0.1:18877/register', { waitUntil: 'load' });
  const tabB = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    return tabs.map((t) => t.id).sort((a, b) => b - a)[0];
  }, 'http://127.0.0.1:18877/*');

  await sw.evaluate(async (tabId) => {
    await runAgentFlow(tabId, {
      email: 'agent-flow@example.com',
      mailboxId: '__no_such_mailbox__',
      username: 'flowuser7',
      password: 'Fl0w!Pass#7',
      autoSubmit: true,
      autoSave: true,
      baselineIds: [],
      hostname: 'testsite.local'
    });
  }, tabB);

  // منتظر اتمام فلو (حداکثر ۲۵ ثانیه)
  let flowRun = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    flowRun = await sw.evaluate(async (tabId) => {
      const run = agentRuns.get(tabId);
      return run ? agentPublicRun(run) : null;
    }, tabB);
    if (flowRun && ['done', 'failed', 'cancelled'].includes(flowRun.status)) break;
  }
  assert(flowRun?.status === 'done', 'فلو ایجنت تا انتها اجرا شد', `status=${flowRun?.status}`);
  assert(
    (flowRun?.log || []).some((l) => l.text.includes('فرم شناسایی شد')),
    'لاگ: فرم شناسایی شد'
  );
  assert(
    (flowRun?.log || []).some((l) => l.text.includes('فیلدها پر شد')),
    'لاگ: فیلدها پر شدند'
  );
  assert(
    (flowRun?.log || []).some((l) => l.text.includes('کلیک شد')),
    'لاگ: دکمه ثبت‌نام کلیک شد'
  );
  assert(
    (flowRun?.log || []).some((l) => l.text.includes('ذخیره شد')),
    'لاگ: حساب در خزانه ذخیره شد'
  );

  const vault = await sw.evaluate(async () => {
    const data = await chrome.storage.local.get('agentAccounts');
    return data.agentAccounts || [];
  });
  assert(vault.length >= 1, 'خزانه حساب‌ها پر شد', `${vault.length} حساب`);
  const saved = vault.find((a) => a.email === 'agent-flow@example.com');
  assert(Boolean(saved), 'حساب فلو با ایمیل درست ذخیره شد', JSON.stringify(saved || {}));
  assert(saved?.hostname === 'testsite.local', 'هاست حساب درست است', saved?.hostname);
  assert(saved?.username === 'flowuser7', 'یوزرنیم حساب درست است', saved?.username);
  assert(saved?.password === 'Fl0w!Pass#7', 'رمز حساب درست است');

  // چک تولیدکننده رمز قوی
  const gen = await sw.evaluate(async () => {
    return await new Promise((resolve) => {
      const handler = (msg) => {
        if (msg.type === 'AGENT_GENERATE_CREDS') resolve({ password: agentStrongPassword(), username: agentGenUsername() });
      };
      resolve({ password: agentStrongPassword(), username: agentGenUsername() });
    });
  });
  const pw = gen.password;
  assert(
    /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[!@#$%&*?_-]/.test(pw) && pw.length >= 10,
    'رمز قوی شامل حروف کوچک/بزرگ/عدد/نماد است',
    pw
  );

  // =====================================================================
  // TEST C — UI پاپ‌آپ: سه تب، پنل ایجنت، خزانه
  // =====================================================================
  const popup = await context.newPage();
  const popupErrors = [];
  popup.on('pageerror', (e) => popupErrors.push(e.message));
  popup.on('console', (m) => {
    if (m.type() === 'error') popupErrors.push('console: ' + m.text());
  });
  await popup.addInitScript(
    (args) => {
      const origQuery = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (q, cb) => {
        if (q && q.active && q.currentWindow) {
          const res = [{ id: args.tabId, url: 'https://testsite.local/register' }];
          if (cb) {
            cb(res);
            return;
          }
          return Promise.resolve(res);
        }
        return origQuery(q, cb);
      };
    },
    { tabId: tabA.id }
  );
  await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await popup.waitForTimeout(1200);

  const navCount = await popup.evaluate(() => document.querySelectorAll('.nav-tab').length);
  assert(navCount === 3, 'سه تب ناوبری داریم', `count=${navCount}`);

  const creds = await popup.evaluate(() => ({
    username: document.getElementById('agentUsernameInput').value,
    password: document.getElementById('agentPasswordInput').value
  }));
  assert(creds.username.length > 3, 'یوزرنیم خودکار در UI ساخته شد', creds.username);
  assert(
    /[a-z]/.test(creds.password) && /[A-Z]/.test(creds.password) && /\d/.test(creds.password),
    'رمز قوی در UI ساخته شد',
    creds.password
  );

  await popup.click('#tabAgentBtn');
  await popup.waitForTimeout(600);
  const agentVisible = await popup.evaluate(() => !document.getElementById('agentView').classList.contains('hidden'));
  assert(agentVisible, 'تب ایجنت باز می‌شود');
  const siteBadge = await popup.evaluate(() => document.getElementById('agentSiteBadge').textContent);
  assert(siteBadge.includes('testsite.local'), 'بج سایت هدف درست است', siteBadge);

  // خزانه: باید حساب تست B را نشان بدهد
  await popup.click('#agentVaultPill');
  await popup.waitForTimeout(800);
  const vaultCards = await popup.evaluate(() => ({
    count: document.querySelectorAll('.agent-vault-card').length,
    hosts: Array.from(document.querySelectorAll('.agent-vault-hostname')).map((e) => e.textContent),
    badge: document.getElementById('agentVaultPillCount').textContent
  }));
  assert(vaultCards.count >= 1, 'خزانه در UI حداقل یک کارت دارد', JSON.stringify(vaultCards));
  assert(vaultCards.hosts.some((h) => h.includes('testsite.local')), 'هاست ذخیره‌شده در UI دیده می‌شود');
  assert(vaultCards.badge !== '۰', 'بج تعداد خزانه به‌روز است', vaultCards.badge);

  // جست‌وجوی خزانه
  await popup.fill('#agentVaultSearch', 'nomatch-xyz');
  await popup.waitForTimeout(600);
  const searchEmpty = await popup.evaluate(
    () => document.querySelectorAll('.agent-vault-card').length
  );
  assert(searchEmpty === 0, 'جست‌وجوی بی‌نتیجه خزانه را خالی نشان می‌دهد');
  await popup.fill('#agentVaultSearch', 'testsite');
  await popup.waitForTimeout(600);
  const searchHit = await popup.evaluate(
    () => document.querySelectorAll('.agent-vault-card').length
  );
  assert(searchHit >= 1, 'جست‌وجو نتیجه می‌دهد');

  // برگردیم به پنل اجرا و مطمئن شویم دکمه شروع فعال است
  await popup.click('#agentRunPill');
  await popup.waitForTimeout(400);
  const startEnabled = await popup.evaluate(
    () => !document.getElementById('agentStartBtn').disabled
  );
  assert(startEnabled, 'دکمه شروع ایجنت فعال است (بدون اجرای فعال)');

  const overflowCheck = await popup.evaluate(() => {
    const app = document.querySelector('.app');
    return { scrollW: app.scrollWidth, clientW: app.clientWidth };
  });
  assert(overflowCheck.scrollW <= overflowCheck.clientW + 2, 'بدون سرریز افقی', JSON.stringify(overflowCheck));

  assert(popupErrors.length === 0, 'بدون خطای جاوااسکریپت در پاپ‌آپ', popupErrors.join(' | ').slice(0, 300));

  // =====================================================================
  // اسکرین‌شات‌های تب ایجنت (دیتای دموی خوانا برای README)
  // =====================================================================
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
        note: 'ثبت‌نام ایجنت — reddit.com',
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
    const real = data.agentAccounts || [];
    await chrome.storage.local.set({
      mailState: st,
      agentAccounts: [...demoAccounts, ...real]
    });
  }, DEMO_MAILBOX);

  // صفحه اسکرین‌شات ۱: پنل اجرا با وضعیت اجرای دمو
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
      const origStorageGet = chrome.storage.local.get.bind(chrome.storage.local);
      chrome.storage.local.get = (keys, cb) => {
        if (Array.isArray(keys) && keys.includes('agentRuns')) {
          const p = origStorageGet(keys).then((data) => {
            data.agentRuns = [];
            return data;
          });
          if (cb) {
            p.then((d) => cb(d));
            return;
          }
          return p;
        }
        return origStorageGet(keys, cb);
      };
    },
    {
      tabId: tabA.id,
      demoRun: {
        tabId: tabA.id,
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
    }
  );
  await shot1.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await shot1.waitForTimeout(1400);
  await shot1.click('#tabAgentBtn');
  await shot1.waitForTimeout(900);
  await shot1.screenshot({
    path: path.join(SHOTS, 'agent-run.png'),
    clip: { x: 0, y: 0, width: 402, height: 600 },
    scale: 'css'
  });
  console.log('SHOT agent-run.png saved');

  // صفحه اسکرین‌شات ۲: خزانه
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
    { tabId: tabA.id }
  );
  await shot2.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
  await shot2.waitForTimeout(1400);
  await shot2.click('#tabAgentBtn');
  await shot2.waitForTimeout(600);
  await shot2.click('#agentVaultPill');
  await shot2.waitForTimeout(900);
  await shot2.screenshot({
    path: path.join(SHOTS, 'agent-vault.png'),
    clip: { x: 0, y: 0, width: 402, height: 600 },
    scale: 'css'
  });
  console.log('SHOT agent-vault.png saved');

  // پاکسازی دیتای دمو از پروفایل تست
  await sw.evaluate(async (mbId) => {
    const data = await chrome.storage.local.get(['mailState', 'agentAccounts']);
    const st = data.mailState;
    if (st) {
      st.mailboxes = st.mailboxes.filter((m) => m.id !== mbId);
      await chrome.storage.local.set({ mailState: st });
    }
  }, DEMO_MAILBOX.id);

  await context.close();
  server.close();

  console.log('\n===== SUMMARY =====');
  const pass = results.filter((r) => r.startsWith('PASS')).length;
  const fails = results.filter((r) => r.startsWith('FAIL'));
  console.log(`PASS: ${pass} | FAIL: ${fails.length}`);
  if (fails.length) {
    console.log(fails.join('\n'));
    process.exit(1);
  }
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
