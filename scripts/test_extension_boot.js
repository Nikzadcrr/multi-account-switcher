// تست بوت واقعی افزونه در کروم: لود extension + باز شدن popup چت + چک سرویس‌ورکر
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const PLUGIN = '/home/z/my-project/plugin';
  const ctx = await chromium.launchPersistentContext('/tmp/ext_profile_' + Date.now(), {
    headless: false,
    args: [
      `--disable-extensions-except=${PLUGIN}`,
      `--load-extension=${PLUGIN}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,900',
    ],
  });

  let swOk = false, popupOk = false, errors = [];
  ctx.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)); });
  ctx.on('page', (p) => p.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 150))));

  // ۱) سرویس‌ورکر MV3
  for (let i = 0; i < 30; i++) {
    const sws = ctx.serviceWorkers().filter((s) => s.url().startsWith('chrome-extension://'));
    if (sws.length) { swOk = true; console.log('SERVICE WORKER:', sws[0].url()); break; }
    await new Promise((r) => setTimeout(r, 500));
  }

  // ۲) باز کردن پاپ‌آپ در تب (popup.html)
  const extId = (ctx.serviceWorkers().find((s) => s.url().startsWith('chrome-extension://'))?.url() || '').split('/')[2];
  console.log('EXT ID:', extId);
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2500);

  const title = await page.title();
  const hasChat = await page.evaluate(() => !!document.querySelector('#agentChatPanel, #chatPanel, .agent-chat, [class*="chat"]'));
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-tab], .tab, nav button, [role="tab"]')).map((b) => b.innerText.trim()).filter(Boolean).slice(0, 10));
  console.log('POPUP TITLE:', title);
  console.log('CHAT WIDGET:', hasChat);
  console.log('TABS:', JSON.stringify(tabs));

  // ۳) رفتن به تب چت و فرستادن یک پیام خوش‌آمد؟ (فقط UI چک — بدون شروع کار)
  const chatVisible = await page.evaluate(() => {
    const el = document.querySelector('#chatLog, .chat-log, #agentChatLog, [class*="chat-log"], [class*="chatLog"]');
    return el ? el.innerText.slice(0, 200) : null;
  });
  console.log('CHAT LOG SAMPLE:', JSON.stringify(chatVisible));

  popupOk = !!title;
  console.log('RESULT:', swOk && popupOk ? 'BOOT OK ✓' : 'BOOT FAIL');
  console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none');
  await ctx.close();
  process.exit(swOk && popupOk && errors.length === 0 ? 0 : 1);
})();
