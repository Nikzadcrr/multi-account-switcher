// تست E2E منطق ایجنت چت در Node — با chrome API های ماک‌شده و مغز واقعی Pollinations
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PLUGIN = '/home/z/my-project/plugin';

// ---------- chrome mock ----------
const store = {};
const listeners = [];
const sentMessages = [];
const tabsById = new Map();
let tabSeq = 1;
// تب اولیهٔ از پیش باز
tabsById.set(1, { id: 1, url: 'https://chat.qwen.ai/auth?action=signup', status: 'complete', active: true });

global.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        const out = {};
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) if (k in store) out[k] = store[k];
        return out;
      },
      set: async (obj) => {
        Object.assign(store, obj);
      }
    }
  },
  runtime: {
    sendMessage: async (msg) => {
      sentMessages.push(msg);
      return { ok: true };
    },
    onMessage: {
      addListener: (fn) => listeners.push(fn)
    },
    getURL: (p) => `chrome-extension://test/${p}`
  },
  tabs: {
    query: async () => [{ id: tabSeq, url: 'https://chat.qwen.ai/auth?action=signup', active: true }],
    get: async (id) => tabsById.get(id),
    create: async (opts) => {
      const t = { id: tabSeq++, url: opts.url || '', status: 'complete', active: false };
      tabsById.set(t.id, t);
      return t;
    },
    update: async (id, patch) => {
      const t = tabsById.get(id);
      Object.assign(t, patch, { status: 'complete' });
      return t;
    }
  },
  scripting: { executeScript: async () => [] },
  debugger: { attach: (t, v, cb) => cb(), detach: (t, cb) => cb(), sendCommand: (t, m, p, cb) => cb({}) }
};

// ---------- ماک توابع background.js ----------
const agentRuns = new Map();
global.agentRuns = agentRuns;
global.agentSleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 30))); // شتاب‌زده
global.agentEnsureInjected = async () => true;
global.agentSendTab = async (tabId, msg) => {
  console.log('  [tab]', tabId, msg.type);
  if (msg.type === 'AGENT_SCAN') return { ok: true, hasFields: true, fields: { email: true, password: true }, captcha: null, url: tabsById.get(tabId)?.url };
  if (msg.type === 'AGENT_FILL') return { ok: true, filled: ['email', 'password'] };
  if (msg.type === 'AGENT_CLICK_SUBMIT') return { ok: true, via: 'click', label: 'ثبت‌نام' };
  if (msg.type === 'AGENT_FILL_OTP') return { ok: true };
  return { ok: true };
};
global.agentEmit = (run, patch, log) => {
  Object.assign(run, patch || {});
  if (log) run.log.push({ t: Date.now(), text: log });
};
global.agentWaitManualCaptcha = () => new Promise((r) => setTimeout(r, 10));
global.getMailState = async () => ({ mailboxes: [], activeMailboxId: null });
global.createTempMailbox = async () => ({ id: `mb_${Date.now()}`, email: `test${Math.floor(Math.random() * 9999)}@48k.marchslurp.com`, provider: 'hd' });
global.listMessagesForMailbox = async () => [];
global.agentGenUsername = () => `nik${Math.floor(Math.random() * 9999)}`;
global.agentStrongPassword = () => 'Xk2!kdD9#dKL2z';
global.getAgentAccounts = async () => [];

// runAgentFlow ماک: بعد از شروع، فلو را کامل می‌کند
global.runAgentFlow = async (tabId, opts) => {
  const run = {
    tabId, hostname: opts.hostname, status: 'running', log: [],
    email: opts.email, username: opts.username, password: opts.password,
    savedAccountId: null, otp: null, otpFilled: false, startedAt: Date.now()
  };
  agentRuns.set(tabId, run);
  await new Promise((r) => setTimeout(r, 60)); // شبیه‌سازی کار
  run.savedAccountId = `ag_${Date.now()}`;
  run.otp = '482913';
  run.otpFilled = true;
  run.status = 'done';
  run.finishedAt = Date.now();
};

// ---------- بارگذاری agent-chat.js ----------
const src = fs.readFileSync(path.join(PLUGIN, 'agent-chat.js'), 'utf8');
const ctx = vm.createContext({
  chrome: global.chrome,
  agentRuns: global.agentRuns,
  agentSleep: global.agentSleep,
  agentEnsureInjected: global.agentEnsureInjected,
  agentSendTab: global.agentSendTab,
  agentEmit: global.agentEmit,
  agentWaitManualCaptcha: global.agentWaitManualCaptcha,
  getMailState: global.getMailState,
  createTempMailbox: global.createTempMailbox,
  listMessagesForMailbox: global.listMessagesForMailbox,
  agentGenUsername: global.agentGenUsername,
  agentStrongPassword: global.agentStrongPassword,
  getAgentAccounts: global.getAgentAccounts,
  runAgentFlow: global.runAgentFlow,
  console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Promise, URL, AbortController, RegExp, Error, Infinity, isFinite, Object, Array, String, Number, Boolean, Uint32Array,
  fetch: async (url, opts) => {
    const r = await fetch(url, opts);
    if (String(url).includes('pollinations')) {
      try {
        const t = await r.clone().text();
        console.log('BRAIN RAW:', t.slice(0, 240).replace(/\n/g, ' | '));
      } catch {}
    }
    return r;
  }
});
vm.runInContext(src, ctx, { filename: 'agent-chat.js' });

// ---------- ارسال پیام و انتظار برای پایان کار ----------
async function sendChat(text) {
  const fn = listeners[listeners.length - 1];
  return new Promise((resolve) => {
    let responded = false;
    const fakeSend = (res) => { responded = true; resolve(res); };
    const keepOpen = fn({ type: 'AGENT_CHAT_SEND', text }, {}, fakeSend);
    if (!keepOpen && !responded) resolve(null);
  });
}

(async () => {
  console.log('== تست چت ایجنت: «۲ تا اکانت qwen بساز» ==');
  const t0 = Date.now();
  const res = await sendChat('۲ تا اکانت qwen بساز');
  console.log('sendChat response:', JSON.stringify(res));

  // انتظار برای اتمام job (تا ۳۰s)
  let job = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    job = store.agentChatJob;
    if (job && job.finishedAt) break;
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`job after ${dt}s:`, JSON.stringify({
    site: job?.site, count: job?.count, done: job?.done, failed: job?.failed, finished: !!job?.finishedAt
  }));

  const msgs = store.agentChatMsgs || [];
  console.log('chat messages:', msgs.length);
  for (const m of msgs.slice(0, 14)) {
    console.log(`  [${m.role}] ${String(m.text).slice(0, 80).replace(/\n/g, ' | ')}`);
  }

  const ok = job && job.done === 2 && job.count === 2;
  console.log(ok ? 'PASS ✓ — هر دو اکانت با مغز واقعی ساخته شدند' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
