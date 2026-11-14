// تست چت واقعی درون افزونه: باز کردن تب ایجنت + ارسال «سلام» + گرفتن پاسخ مغز
const { chromium } = require('playwright');

(async () => {
  const PLUGIN = '/home/z/my-project/plugin';
  const ctx = await chromium.launchPersistentContext('/tmp/ext_chat_' + Date.now(), {
    headless: false,
    args: [
      `--disable-extensions-except=${PLUGIN}`,
      `--load-extension=${PLUGIN}`,
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900',
    ],
  });
  for (let i = 0; i < 30; i++) {
    if (ctx.serviceWorkers().some((s) => s.url().startsWith('chrome-extension://'))) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const swUrl = ctx.serviceWorkers().find((s) => s.url().startsWith('chrome-extension://'))?.url() || '';
  const extId = swUrl.split('/')[2];
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1500);

  // رفتن به تب ایجنت
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="tab"], [data-tab]'));
    const t = els.find((b) => (b.innerText || '').includes('ایجنت'));
    if (t) { t.click(); return t.innerText.trim(); }
    return null;
  });
  console.log('TAB CLICKED:', clicked);
  await page.waitForTimeout(800);

  // زیرتب «چت ایجنت»
  const sub = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="tab"], [data-sub], .subtab'));
    const t = els.find((b) => (b.innerText || '').trim() === 'چت ایجنت');
    if (t) { t.click(); return true; }
    return false;
  });
  console.log('CHAT SUBTAB:', sub);
  await page.waitForTimeout(800);

  // پیدا کردن ورودی چت
  const info = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type])')).filter((i) => i.offsetParent !== null);
    const chatBtns = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim()).filter(Boolean).slice(0, 14);
    return { inputCount: inputs.length, inputPh: inputs.map((i) => i.placeholder || '').slice(0, 4), btns: chatBtns };
  });
  console.log('CHAT UI:', JSON.stringify(info));

  // ارسال «سلام» از طریق تابع واقعی (اگر ورودی هست)
  const sent = await page.evaluate(async () => {
    const inp = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type])')).filter((i) => i.offsetParent !== null)[0];
    if (!inp) return 'no-input';
    const setter = Object.getOwnPropertyDescriptor(inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'سلام میتونی چی کارا بکنی؟');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const sendBtn = Array.from(document.querySelectorAll('button')).find((b) => /ارسال|send|➤|▶/.test(b.innerText + b.className + b.id));
    if (sendBtn) { sendBtn.click(); return 'clicked-send'; }
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    return 'enter-dispatched';
  });
  console.log('SEND:', sent);
  await page.waitForTimeout(15000);

  const chatText = await page.evaluate(() => {
    const el = document.querySelector('#chatLog, .chat-log, #agentChatLog, [class*="chat-log"], [class*="chatLog"], [class*="chat-messages"], [class*="chatMessages"]');
    return el ? el.innerText.slice(0, 500) : (document.body.innerText.slice(0, 400));
  });
  console.log('CHAT AFTER 15s:', JSON.stringify(chatText));
  await ctx.close();
  process.exit(0);
})();
