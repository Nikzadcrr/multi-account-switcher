// ============================================================================
// Agent Chat — مغز گفت‌وگومحور ایجنت (v5.1)
// چت با کاربر → درک دستور (LLM رایگان + پارسر محلی) → اجرای چنداکانتی
// روی موتور موجود runAgentFlow + ایمیل موقت + حل کپچا + ذخیرهٔ خزانه
// ============================================================================

const CHAT_MAX_MSGS = 260;
const CHAT_BRAIN_TIMEOUT_MS = 14000;
const CHAT_MIN_BRAIN_GAP_MS = 9000; // جلوگیری از rate-limit پولینیشنز
const CHAT_SIGNUP_HINTS = [
  '/auth?action=signup', '/auth?action=sign-up', '/register', '/signup',
  '/sign-up', '/auth/signup', '/auth/register', '/create-account',
  '/sign_in', '/auth', '/login', '/account/register'
];

// پایگاه دانش سایت‌های شناخته‌شده (نام‌های عامیانهٔ فارسی/انگلیسی → مقصد)
const CHAT_SITE_KB = [
  { keys: ['qwen', 'کیوِن', 'کوئن', 'چت کیو', 'qwen.ai'], domain: 'chat.qwen.ai', label: 'Qwen', start: 'https://chat.qwen.ai/auth?action=signup' },
  { keys: ['chatgpt', 'چت جی پی تی', 'چت‌جی‌پی‌تی', 'gpt', 'openai'], domain: 'chatgpt.com', label: 'ChatGPT', start: 'https://auth.openai.com/log-in' },
  { keys: ['claude', 'کلاد', 'کلود'], domain: 'claude.ai', label: 'Claude', start: 'https://claude.ai/login' },
  { keys: ['gemini', 'جمنای', 'جمینای'], domain: 'gemini.google.com', label: 'Gemini', start: 'https://accounts.google.com/signup' },
  { keys: ['grok', 'گراک'], domain: 'grok.com', label: 'Grok', start: 'https://accounts.x.ai/sign-up' },
  { keys: ['poe', 'پو'], domain: 'poe.com', label: 'Poe', start: 'https://poe.com/login' },
  { keys: ['perplexity', 'پرپلکسیتی'], domain: 'perplexity.ai', label: 'Perplexity', start: 'https://www.perplexity.ai/signup' },
  { keys: ['cursor', 'کرسر'], domain: 'cursor.com', label: 'Cursor', start: 'https://authenticator.cursor.app/sign-up' },
  { keys: ['trae', 'تره'], domain: 'trae.ai', label: 'Trae', start: 'https://www.trae.ai/signup' },
  { keys: ['cerebras', 'سربراس'], domain: 'cloud.cerebras.ai', label: 'Cerebras', start: 'https://cloud.cerebras.ai/' },
  { keys: ['trae ide'], domain: 'trae.ai', label: 'Trae', start: 'https://www.trae.ai/signup' },
  { keys: ['kimi', 'کیمی'], domain: 'kimi.com', label: 'Kimi', start: 'https://www.kimi.com/' },
  { keys: ['deepseek', 'دیپ سیک', 'دیپسیک'], domain: 'chat.deepseek.com', label: 'DeepSeek', start: 'https://chat.deepseek.com/sign_up' },
  { keys: ['copilot', 'کوپایلوت'], domain: 'copilot.microsoft.com', label: 'Copilot', start: 'https://login.live.com/' },
  { keys: ['huggingface', 'هاگینگ فیس', 'هیوگینگ'], domain: 'huggingface.co', label: 'HuggingFace', start: 'https://huggingface.co/join' },
  { keys: ['github', 'گیت هاب', 'گیت‌هاب'], domain: 'github.com', label: 'GitHub', start: 'https://github.com/signup' }
];

// ----------------------------------------------------------------------------
// ذخیره‌سازی چت
// ----------------------------------------------------------------------------

async function chatGetState() {
  const data = await chrome.storage.local.get(['agentChatMsgs', 'agentChatJob', 'agentChatSettings']);
  return {
    msgs: Array.isArray(data.agentChatMsgs) ? data.agentChatMsgs : [],
    job: data.agentChatJob || null,
    settings: Object.assign(
      {
        brainProvider: 'pollinations',
        brainModel: 'openai',
        groqKey: '',
        groqModel: 'llama-3.3-70b-versatile',
        geminiKey: '',
        geminiModel: 'gemini-2.0-flash',
        openrouterKey: '',
        openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        mailProvider: 'hd',
        freshMailPerAccount: true
      },
      data.agentChatSettings || {}
    )
  };
}

async function chatSaveMsgs(msgs) {
  await chrome.storage.local.set({ agentChatMsgs: msgs.slice(-CHAT_MAX_MSGS) });
}

async function chatPush(role, text, extra = {}) {
  const st = await chatGetState();
  const msg = {
    id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role, // user | agent | system
    text: String(text || ''),
    ts: Date.now(),
    ...extra
  };
  const msgs = st.msgs.concat([msg]);
  await chatSaveMsgs(msgs);
  try {
    const p = chrome.runtime.sendMessage({ type: 'AGENT_CHAT_EVENT', msg });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
  return msg;
}

async function chatSetJob(job) {
  await chrome.storage.local.set({ agentChatJob: job });
  try {
    const p = chrome.runtime.sendMessage({ type: 'AGENT_CHAT_JOB', job });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

async function chatSaveSettings(patch) {
  const st = await chatGetState();
  const next = { ...st.settings, ...(patch || {}) };
  await chrome.storage.local.set({ agentChatSettings: next });
  return next;
}

function chatBroadcastReset() {
  try {
    const p = chrome.runtime.sendMessage({ type: 'AGENT_CHAT_RESET' });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

// ----------------------------------------------------------------------------
// مغز ایجنت — LLM رایگان + پارسر محلی
// ----------------------------------------------------------------------------

const CHAT_SYSTEM_PROMPT = `تو «مغز» یک ایجنت ثبت‌نام خودکار داخل افزونهٔ کروم هستی.
کاربر به فارسی یا انگلیسی درخواست می‌دهد تا در سایتی اکانت بسازی (با ایمیل موقت).
تو خودت ثبت‌نام انجام نمی‌دهی؛ فقط باید یک JSON دقیق برگردانی تا موتور اجرا کند.

قالب پاسخ — فقط و فقط JSON، بدون هیچ متن اضافه، بدون markdown:
{"intent":"register|status|cancel|help|talk","site":"دامنه یا خالی","count":عدد,"freshMail":true|false,"reply":"جواب کوتاه دوستانه به فارسی"}

قوانین:
- intent=register وقتی کاربر می‌خواهد اکانت ساخته شود. site را از درخواست استخراج کن (مثل chat.qwen.ai، qwen، github، chatgpt...). اگر سایت نامشخص است site خالی و در reply بپرس.
- count پیش‌فرض ۱ است؛ «۲ تا/دوتا/two» یعنی ۲ (بین ۱ تا ۲۰).
- freshMail=true یعنی برای هر اکانت یک ایمیل موقت تازه بساز (پیش‌فرض true).
- intent=status: کاربر وضعیت/پیشرفت می‌خواهد. intent=cancel: توقف کار. intent=help: آموزش کوتاه. intent=talk: هر چیز دیگر.
- reply همیشه فارسی، کوتاه، صمیمی و بدون ادعای انجام کار در آینده‌ی دور.
- هیچ متن بیرون از JSON ننویس.`;

let chatLastBrainAt = 0;
let chatJobActive = false;

function chatExtractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function chatBrainCall(userText, contextLines) {
  const st = await chatGetState();
  const s = st.settings;
  const sys = CHAT_SYSTEM_PROMPT + '\n\nوضعیت فعلی:\n' + contextLines.join('\n');
  const history = st.msgs.slice(-10).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.text || '').slice(0, 600)
  }));

  // فاصلهٔ حداقلی برای پولینیشنز
  const waitMs = chatLastBrainAt + CHAT_MIN_BRAIN_GAP_MS - Date.now();
  if (s.brainProvider === 'pollinations' && waitMs > 0) {
    await agentSleep(Math.min(waitMs, 20000));
  }
  chatLastBrainAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_BRAIN_TIMEOUT_MS);
  try {
    let text = '';
    if (s.brainProvider === 'groq' && s.groqKey) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.groqKey}` },
        body: JSON.stringify({
          model: s.groqModel || 'llama-3.3-70b-versatile',
          temperature: 0.2,
          max_tokens: 400,
          messages: [{ role: 'system', content: sys }, ...history]
        })
      });
      const j = await res.json();
      text = j?.choices?.[0]?.message?.content || '';
    } else if (s.brainProvider === 'gemini' && s.geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel || 'gemini-2.0-flash'}:generateContent?key=${s.geminiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            generationConfig: { temperature: 0.2, maxOutputTokens: 400 }
          })
        }
      );
      const j = await res.json();
      text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    } else if (s.brainProvider === 'openrouter' && s.openrouterKey) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.openrouterKey}` },
        body: JSON.stringify({
          model: s.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
          max_tokens: 400,
          messages: [{ role: 'system', content: sys }, ...history]
        })
      });
      const j = await res.json();
      text = j?.choices?.[0]?.message?.content || '';
    } else {
      // پیش‌فرض: Pollinations — رایگان و بدون کلید
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: s.brainModel || 'openai',
          messages: [{ role: 'system', content: sys }, ...history]
        })
      });
      text = await res.text();
    }
    clearTimeout(timer);
    return { raw: text, json: chatExtractJson(text) };
  } catch (e) {
    clearTimeout(timer);
    return { raw: '', json: null, error: e?.message || 'brain_error' };
  }
}

function chatLocalParse(userText) {
  const t = String(userText || '').toLowerCase().trim();
  const out = { intent: 'talk', site: '', count: 1, freshMail: true, reply: '', _local: true };

  if (/(لغو|نگه|متوقف|stop|cancel|بس کن)/.test(t)) {
    out.intent = 'cancel';
    return out;
  }
  if (/(وضعیت|چقدر مونده|status|progress|کجا رسید)/.test(t)) {
    out.intent = 'status';
    return out;
  }
  if (/(کمک|راهنما|چطوری|help|چطور کار)/.test(t)) {
    out.intent = 'help';
    return out;
  }

  // تشخیص قصد ثبت‌نام: «بساز/ثبت‌نام/اکانت/reg»
  const wantsRegister = /(بساز|ثبت[‌‌ ]?نام|اکانت[‌‌ ]?(بساز|بگیر)|ساخت اکانت|reg(ister)?|account|signup|sign up)/.test(t);

  // سایت: KB + دامنهٔ صریح
  let site = '';
  for (const item of CHAT_SITE_KB) {
    if (item.keys.some((k) => t.includes(k))) {
      site = item.domain;
      break;
    }
  }
  if (!site) {
    const url = t.match(/([a-z0-9-]+\.(?:com|ai|io|net|org|app|dev|co|me)[a-z0-9./-]*)/i);
    if (url) site = url[1].replace(/\/+$/, '');
  }

  // تعداد
  let count = 1;
  const numMap = { یک: 1, دو: 2, دوتا: 2, سه: 3, سه‌تا: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10 };
  const m2 = t.match(/(\d+)\s*(تا|عدد|اکانت|account)?/);
  const m3 = t.match(/([\u06F0-\u06F9]{1,2})/);
  if (m2 && parseInt(m2[1], 10) > 0) count = Math.min(20, parseInt(m2[1], 10));
  else if (m3) {
    const fa = m3[1].replace(/[\u06F0-\u06F9]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const v = parseInt(fa, 10);
    if (v > 0) count = Math.min(20, v);
  } else {
    for (const [w, v] of Object.entries(numMap)) {
      if (new RegExp(`${w}(\\s*(تا|عدد|اکانت|account))`).test(t)) {
        count = v;
        break;
      }
    }
  }

  if (wantsRegister || site) out.intent = 'register';
  out.site = site;
  out.count = count;
  return out;
}

async function chatBuildContextLines() {
  const lines = [];
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    lines.push(`- تب‌های باز: ${tabs.length}`);
    const cur = tabs.find((t) => t.active) || tabs[0];
    if (cur?.url) lines.push(`- تب فعال: ${cur.url.slice(0, 120)}`);
  } catch {}
  const accs = await getAgentAccounts();
  lines.push(`- حساب‌های ذخیره‌شدهٔ خزانه: ${accs.length}`);
  const st = await chatGetState();
  if (st.job) {
    lines.push(`- کار فعال: ${st.job.siteLabel || st.job.site || '?'} — پیشرفت ${st.job.done}/${st.job.count}`);
  }
  return lines;
}

// ----------------------------------------------------------------------------
// حل‌کنندهٔ سایت و تب
// ----------------------------------------------------------------------------

function chatFindKB(text) {
  const t = String(text || '').toLowerCase();
  for (const item of CHAT_SITE_KB) {
    if (item.keys.some((k) => t.includes(k))) return item;
  }
  return null;
}

function chatNormalizeSite(site) {
  let s = String(site || '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

// نام‌های عامیانه (qwen، chatgpt...) را به دامنه تبدیل می‌کند
function chatResolveSite(site) {
  const n = chatNormalizeSite(site);
  if (n) return n;
  const kb = chatFindKB(site);
  if (kb) return kb.domain;
  return null;
}

async function chatFindSiteTab(domain) {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  return (
    tabs.find((t) => {
      try {
        return new URL(t.url).hostname.replace(/^www\./, '') === domain;
      } catch {
        return false;
      }
    }) || null
  );
}

async function chatWaitTabComplete(tabId, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return tab;
    } catch {
      return null;
    }
    await agentSleep(500);
  }
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function chatScanForForm(tabId) {
  await agentEnsureInjected(tabId);
  return agentSendTab(tabId, { type: 'AGENT_SCAN' });
}

async function chatEnsureSignupPage(tabId, run, domain, startUrl) {
  // اگر تب روی دامنه است، از همان صفحه شروع کن؛ وگرنه مقصد را باز کن
  let tab = await chrome.tabs.get(tabId).catch(() => null);
  let onDomain = false;
  try {
    onDomain = tab && new URL(tab.url).hostname.replace(/^www\./, '') === domain;
  } catch {}

  const candidates = [];
  if (startUrl) candidates.push(startUrl);
  if (onDomain && tab.url && !candidates.includes(tab.url)) candidates.unshift(tab.url);
  if (domain && !candidates.some((u) => u.startsWith('https://'))) {
    candidates.push(`https://${domain}/`);
  }
  for (const h of CHAT_SIGNUP_HINTS) candidates.push(`https://${domain}${h}`);

  for (let i = 0; i < Math.min(candidates.length, 7); i++) {
    if (run.cancelled) return null;
    const url = candidates[i];
    if (!onDomain || i > 0) {
      chatPush('system', `رفتن به ${url}`);
      try {
        await chrome.tabs.update(tabId, { url });
      } catch {
        return null;
      }
      tab = await chatWaitTabComplete(tabId, 22000);
      if (!tab) return null;
      onDomain = true;
    }
    await agentSleep(700);
    const scan = await chatScanForForm(tabId);
    if (scan?.ok && scan.hasFields) {
      return { ok: true, scan, url: tab.url };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// حل‌کنندهٔ اسلایدر (پیاده‌سازی در agent-slider.js) و کپچا (agent-captcha.js)
// اینجا فقط wrapper امن
// ----------------------------------------------------------------------------

async function chatTrySlider(run, tabId) {
  try {
    if (typeof agentSolveAliyunSlider !== 'function') return false;
    return await agentSolveAliyunSlider(tabId, run);
  } catch (e) {
    chatPush('system', `حل اسلایدر خطا داد: ${e?.message || 'نامشخص'}`);
    return false;
  }
}

// ----------------------------------------------------------------------------
// دور زدن چالش WAF پس از submit (اسلایدر علی‌بابا)
// ----------------------------------------------------------------------------

async function chatPostSubmitChallenge(run, tabId) {
  try {
    const found = typeof agentDetectSliderPresence === 'function' ? await agentDetectSliderPresence(tabId) : false;
    if (!found) return false;
    chatPush('system', 'چالش اسلایدر شناسایی شد؛ در حال حل خودکار…');
    const solved = await chatTrySlider(run, tabId);
    if (solved) {
      chatPush('system', 'اسلایدر حل شد ✓ — دوباره فرم ارسال می‌شود.');
      await agentSleep(1200);
      // اگر صفحهٔ چالش مستقل بود، بعد از حل برمی‌گردد؛ فرم را دوباره پر و بفرست
      try {
        await agentSendTab(tabId, { type: 'AGENT_CLICK_SUBMIT' });
      } catch {}
      return true;
    }
    chatPush('system', 'حل خودکار اسلایدر کامل نشد؛ یک بار دستی حل کن و «ادامه» را نزن — خودم چک می‌کنم.');
    return false;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// اجرای یک اکانت (wrap روی runAgentFlow)
// ----------------------------------------------------------------------------

function chatWaitRun(tabId, timeoutMs = 420000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timer = setInterval(async () => {
      const run = typeof agentRuns !== 'undefined' ? agentRuns.get(tabId) : null;
      if (!run) {
        clearInterval(timer);
        return resolve({ status: 'failed', error: 'run_missing' });
      }
      if (['done', 'failed', 'cancelled'].includes(run.status)) {
        clearInterval(timer);
        return resolve({ status: run.status, run });
      }
      if (Date.now() - t0 > timeoutMs) {
        clearInterval(timer);
        run.status = 'cancelled';
        return resolve({ status: 'timeout', run });
      }
    }, 900);
  });
}

async function chatRegisterOneAccount(job, index) {
  const domain = chatResolveSite(job.site) || chatNormalizeSite(job.site);
  if (!domain) {
    await chatPush('agent', 'دامنهٔ سایت معتبر نیست. مثل «chat.qwen.ai» بنویس.');
    return { ok: false, error: 'bad_site' };
  }

  const kb = chatFindKB(job.site) || null;
  await chatPush('system', `— اکانت ${index}/${job.count}: ${kb?.label || domain}`);

  // ۱) تب مقصد
  let tab = await chatFindSiteTab(domain);
  if (!tab) {
    tab = await chrome.tabs
      .create({ url: kb?.start || `https://${domain}/`, active: false })
      .then((t) => chrome.tabs.get(t.id))
      .catch(() => null);
  }
  if (!tab?.id) {
    await chatPush('agent', 'تب سایت باز نشد.');
    return { ok: false, error: 'no_tab' };
  }
  await chatWaitTabComplete(tab.id, 20000);
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});

  // ۲) پیدا کردن فرم ثبت‌نام
  const found = await chatEnsureSignupPage(tab.id, job, domain, kb?.start);
  if (!found) {
    await chatPush(
      'agent',
      `فرم ثبت‌نام در ${kb?.label || domain} پیدا نشد. یک بار دستی صفحهٔ ثبت‌نام را باز کن و بگو «ادامه بده» — یا آدرس دقیق صفحه را بفرست.`
    );
    job.awaitingUrlHint = true;
    await chatSetJob(job);
    return { ok: false, error: 'no_form', needsHint: true };
  }

  // ۳) ایمیل موقت تازه برای هر اکانت
  let mailbox = null;
  const mailState = await getMailState();
  if (job.freshMail === false && mailState.activeMailboxId) {
    mailbox = mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId) || null;
  }
  if (!mailbox) {
    try {
      mailbox = await createTempMailbox(job.mailProvider || 'hd');
      await chatPush('system', `ایمیل موقت ساخته شد: ${mailbox.email}`);
    } catch (e) {
      await chatPush('agent', `ساخت ایمیل موقت شکست خورد: ${e?.message || '?'}`);
      return { ok: false, error: 'mail_fail' };
    }
  }

  // baseline برای تشخیص ایمیل تازه
  let baselineIds = [];
  try {
    const baseMsgs = await listMessagesForMailbox(mailbox);
    baselineIds = (baseMsgs || []).map((m) => String(m.id));
  } catch {}

  // ۴) اجرای فلو اصلی
  const hostname = domain;
  await runAgentFlow(tab.id, {
    email: mailbox.email,
    mailboxId: mailbox.id,
    username: agentGenUsername(),
    password: agentStrongPassword(),
    autoSubmit: true,
    autoSave: true,
    baselineIds,
    hostname,
    _chatJob: job.id
  });

  const result = await chatWaitRun(tab.id);

  // ۵) پس از submit: چالش اسلایدر را چک و حل کن و دوباره فرم بفرست
  if (result.status === 'running' || result.status === 'waiting_otp' || result.status === 'done') {
    await chatPostSubmitChallenge(result.run || { cancelled: false }, tab.id);
  }

  const finalRun = (typeof agentRuns !== 'undefined' ? agentRuns.get(tab.id) : null) || result.run || {};
  const ok = finalRun.status === 'done' && (finalRun.savedAccountId || finalRun.otpFilled || finalRun.otp);
  return {
    ok,
    status: finalRun.status,
    email: finalRun.email,
    password: finalRun.password,
    savedAccountId: finalRun.savedAccountId || null,
    otp: finalRun.otp || null,
    error: finalRun.error || null
  };
}

// ----------------------------------------------------------------------------
// کار اصلی چنداکانتی
// ----------------------------------------------------------------------------

async function chatStartJob(plan) {
  if (chatJobActive) {
    await chatPush('agent', 'یک کار فعال در جریان است؛ اول با «لغو کن» تمامش کن.');
    return { ok: false, error: 'busy' };
  }
  const domain = chatResolveSite(plan.site);
  if (!domain) {
    await chatPush('agent', 'سایت را دقیق‌تر بگو — مثلاً: «۲ تا اکانت qwen بساز» یا آدرس کامل بده.');
    return { ok: false, error: 'no_site' };
  }

  const kb = chatFindKB(domain) || { domain, label: domain, start: null };
  const job = {
    id: `job_${Date.now()}`,
    site: domain,
    siteLabel: kb.label,
    startUrl: kb.start,
    count: Math.max(1, Math.min(20, plan.count || 1)),
    done: 0,
    failed: 0,
    attempts: {},
    freshMail: plan.freshMail !== false,
    mailProvider: plan.mailProvider || (await chatGetState()).settings.mailProvider || 'hd',
    cancelled: false,
    startedAt: Date.now(),
    results: []
  };
  chatJobActive = true;
  await chatSetJob(job);
  await chatPush(
    'agent',
    `باشه! شروع می‌کنم: ${job.count} اکانت روی ${kb.label} با ایمیل موقت. هر مرحله را همین‌جا می‌گویم. 🚀`
  );

  runChatJob(job).finally(() => {
    chatJobActive = false;
  });
  return { ok: true };
}

async function runChatJob(job) {
  try {
    for (let i = job.done + job.failed + 1; i <= job.count && !job.cancelled; i++) {
      let attempt = 0;
      let result = null;
      while (attempt < 3 && !job.cancelled) {
        attempt++;
        job.attempts[i] = attempt;
        await chatSetJob(job);
        result = await chatRegisterOneAccount(job, i);
        if (result.ok) break;
        if (result.needsHint) {
          // منتظر راهنمای URL از کاربر — حلقهٔ بیرونی هم باید بایستد
          job.pausedForHint = i;
          await chatSetJob(job);
          await chatPush('system', 'کار متوقف شد تا آدرس دقیق صفحهٔ ثبت‌نام را بدهی. بنویس: «ادامه بده <آدرس>»');
          return;
        }
        if (attempt < 3) {
          await chatPush('system', `تلاش ${attempt} ناموفق بود؛ با ایمیل تازه دوباره…`);
          await agentSleep(2500);
        }
      }
      if (job.cancelled) break;

      if (result && result.ok) {
        job.done++;
        job.results.push({ index: i, ok: true, email: result.email, password: result.password, otp: result.otp });
        await chatPush('agent', `✅ اکانت ${i} ساخته شد: ${result.email} — رمز در خزانه ذخیره شد.`);
        if (result.otp) await chatPush('system', `کد تأیید: ${result.otp}`);
      } else {
        job.failed++;
        job.results.push({ index: i, ok: false, error: result?.error || 'unknown' });
        await chatPush('agent', `❌ اکانت ${i} بعد از ۳ تلاش نشد${result?.error ? ` (${result.error})` : ''}. بقیه را ادامه می‌دهم.`);
      }
      await chatSetJob(job);
      await agentSleep(1800);
    }

    const totalOk = job.done;
    if (job.cancelled) {
      await chatPush('agent', `کار لغو شد. تا اینجا: ${totalOk} موفق از ${job.done + job.failed} اجرا.`);
    } else if (job.done + job.failed >= job.count) {
      const summary = job.results
        .filter((r) => r.ok)
        .map((r) => `• ${r.email}${r.otp ? ` (کد: ${r.otp})` : ''}`)
        .join('\n');
      await chatPush(
        'agent',
        summary
          ? `تمام شد! ${totalOk}/${job.count} اکانت ساخته و در خزانه ذخیره شد:\n${summary}`
          : `متأسفانه هیچ‌کدام از ${job.count} اکانت ساخته نشد. می‌خوای دوباره امتحان کنیم؟`
      );
    }
    job.finishedAt = Date.now();
    await chatSetJob(job);
  } catch (e) {
    await chatPush('agent', `خطای غیرمنتظره: ${e?.message || e}`);
    job.finishedAt = Date.now();
    await chatSetJob(job);
  }
}

// ----------------------------------------------------------------------------
// پردازش پیام کاربر
// ----------------------------------------------------------------------------

async function agentChatSend(userText, forceUrlHint) {
  const text = String(userText || '').trim();
  if (!text) return { ok: false, error: 'empty' };
  await chatPush('user', text);

  const st = await chatGetState();

  // حالت انتظار آدرس دقیق صفحهٔ ثبت‌نام
  if (st.job?.pausedForHint || forceUrlHint) {
    const url = text.match(/https?:\/\/[^\s]+/);
    if (/ادامه|برو|همین|اینو|این\b/.test(text.toLowerCase()) || url) {
      const job = st.job;
      const hintUrl = url ? url[0] : null;
      if (hintUrl) {
        job.startUrl = hintUrl;
        job.site = chatNormalizeSite(new URL(hintUrl).hostname) || job.site;
        chatFindKB(job.site) && (job.siteLabel = chatFindKB(job.site).label);
      }
      const pausedIndex = job.pausedForHint || (job.done + job.failed + 1);
      job.pausedForHint = null;
      await chatSetJob(job);
      chatJobActive = true;
      runChatJob(job, { resumeIndex: pausedIndex, startUrl: hintUrl }).finally(() => {
        chatJobActive = false;
      });
      await chatPush('agent', 'برگشتم سر کار! ادامه می‌دهم…');
      return { ok: true };
    }
  }

  const ctx = await chatBuildContextLines();
  let plan = null;
  try {
    const brain = await chatBrainCall(text, ctx);
    if (brain.json && brain.json.intent) plan = brain.json;
    else if (brain.raw && brain.raw.length > 4) {
      // LLM جواب داده ولی JSON نبود → برای register دوباره محلی پارس می‌کنیم
      plan = chatLocalParse(text);
      if (plan.intent === 'talk') {
        await chatPush('agent', String(brain.raw).slice(0, 500));
        return { ok: true };
      }
    }
  } catch {}

  if (!plan) plan = chatLocalParse(text);

  switch (plan.intent) {
    case 'register': {
      // اگر مغز سایت را نداد، از پارسر محلی کمک بگیر
      if (!plan.site) {
        const lp = chatLocalParse(text);
        if (lp.site) {
          plan.site = lp.site;
          if (!plan.count || plan.count < 1) plan.count = lp.count;
        }
        if (!plan.site) {
          await chatPush('agent', 'روی کدوم سایت اکانت بسازم؟ اسم یا آدرسش را بنویس (مثلاً qwen یا chat.qwen.ai).');
          return { ok: true };
        }
      }
      if (!plan.count || plan.count < 1) plan.count = 1;
      return chatStartJob(plan);
    }
    case 'status': {
      const job = st.job;
      if (!job || job.finishedAt) await chatPush('agent', 'در حال حاضر کاری در جریان نیست. بنویس «کمک» تا شروع کنیم.');
      else
        await chatPush(
          'agent',
          `کار «${job.siteLabel || job.site}»: ${job.done} موفق، ${job.failed} ناموفق از ${job.count} — ${job.pausedForHint ? 'منتظر آدرس صفحهٔ ثبت‌نام از تو هستم' : 'در جریان است'}.`
        );
      return { ok: true };
    }
    case 'cancel': {
      const job = st.job;
      job && (job.cancelled = true) && (await chatSetJob(job));
      for (const [tabId, run] of typeof agentRuns !== 'undefined' ? agentRuns : []) {
        if (['running', 'waiting_captcha_manual', 'waiting_otp'].includes(run.status)) {
          run.status = 'cancelled';
          if (run._manualResolve) run._manualResolve();
        }
      }
      await chatPush('agent', 'لغو شد. هر وقت خواستی دوباره بگو.');
      return { ok: true };
    }
    case 'help': {
      await chatPush(
        'agent',
        'راهنما: کافیست بنویسی مثلاً «۲ تا اکانت qwen بساز» یا «chat.qwen.ai — ۳ اکانت». من صفحهٔ ثبت‌نام را باز می‌کنم، ایمیل موقت می‌سازم، فرم را پر می‌کنم، کپچا/اسلایدر را حل می‌کنم و کد تأیید را از ایمیل می‌گیرم. حساب‌ها در «خزانه» ذخیره می‌شوند. وسط کار می‌توانی «وضعیت» یا «لغو کن» بگویی.'
      );
      return { ok: true };
    }
    default: {
      if (plan.reply) await chatPush('agent', plan.reply);
      else
        await chatPush(
          'agent',
          'شنیدم! اگر می‌خواهی اکانت بسازم بنویس مثل: «۳ اکانت qwen بساز» — یا «کمک» برای راهنما.'
        );
      return { ok: true };
    }
  }
}

// ----------------------------------------------------------------------------
// listener پیام‌های چت
// ----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('AGENT_CHAT_')) return false;
  (async () => {
    try {
      switch (msg.type) {
        case 'AGENT_CHAT_SEND':
          return sendResponse(await agentChatSend(msg.text, msg.forceUrlHint));
        case 'AGENT_CHAT_STATE': {
          const st = await chatGetState();
          return sendResponse({ ok: true, ...st, active: chatJobActive });
        }
        case 'AGENT_CHAT_SAVE_SETTINGS':
          return sendResponse({ ok: true, settings: await chatSaveSettings(msg.settings || {}) });
        case 'AGENT_CHAT_CANCEL': {
          const st = await chatGetState();
          if (st.job) {
            st.job.cancelled = true;
            await chatSetJob(st.job);
          }
          for (const [tabId, run] of typeof agentRuns !== 'undefined' ? agentRuns : []) {
            if (['running', 'waiting_captcha_manual', 'waiting_otp'].includes(run.status)) {
              run.status = 'cancelled';
              if (run._manualResolve) run._manualResolve();
            }
          }
          chatJobActive = false;
          await chatPush('agent', 'لغو شد ✓');
          return sendResponse({ ok: true });
        }
        case 'AGENT_CHAT_CLEAR': {
          await chatSaveMsgs([]);
          await chatSetJob(null);
          chatBroadcastReset();
          await chatPush('agent', 'چت تمیز شد. بگو چی بسازم! 😊');
          return sendResponse({ ok: true });
        }
        default:
          return sendResponse({ ok: false, error: 'unknown_chat_msg' });
      }
    } catch (e) {
      try {
        sendResponse({ ok: false, error: e?.message || 'chat_error' });
      } catch {}
    }
  })();
  return true; // async sendResponse
});
