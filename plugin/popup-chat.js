// ============================================================================
// Agent Chat UI — پنل چت ایجنت در پاپ‌آپ — v5.1
// ============================================================================
(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    panel: $('agentChatPanel'),
    msgs: $('chatMsgs'),
    progress: $('chatProgress'),
    input: $('chatInput'),
    send: $('chatSendBtn'),
    cancel: $('chatCancelBtn'),
    clear: $('chatClearBtn'),
    chips: Array.from(document.querySelectorAll('.chat-chip')),
    brainProvider: $('chatBrainProvider'),
    brainKey: $('chatBrainKey'),
    brainModel: $('chatBrainModel'),
    brainSave: $('chatBrainSaveBtn')
  };
  if (!els.panel) return;

  let job = null;
  let sending = false;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function renderMsg(m) {
    const wrap = document.createElement('div');
    wrap.className = `chat-msg chat-msg-${m.role}`;
    let cls = 'chat-bubble';
    if (m.role === 'system') cls = 'chat-bubble chat-bubble-sys';
    const lines = String(m.text || '').split('\n');
    wrap.innerHTML = `<div class="${cls}">${lines.map((l) => esc(l)).join('<br/>')}</div><div class="chat-ts">${fmtTime(m.ts)}</div>`;
    els.msgs.appendChild(wrap);
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }

  function renderJob(j) {
    job = j;
    if (!j) {
      els.progress.classList.add('hidden');
      els.cancel.classList.add('hidden');
      return;
    }
    const active = !j.finishedAt && !j.pausedForHint;
    const pct = j.count ? Math.round(((j.done + j.failed) / j.count) * 100) : 0;
    const results = Array.isArray(j.results) ? j.results : [];
    const chips = results
      .map((r) => `<span class="chat-result-chip ${r.ok ? 'ok' : 'err'}" title="${esc(r.error || '')}">${r.ok ? '✓' : '✗'} #${r.index}</span>`)
      .join('');
    els.progress.innerHTML = `
      <div class="chat-progress-row">
        <span class="chat-progress-site">${esc(j.siteLabel || j.site || '')}</span>
        <span class="chat-progress-count">${j.done} موفق / ${j.failed} خطا از ${j.count}</span>
      </div>
      <div class="chat-progress-bar"><div class="chat-progress-fill" style="width:${pct}%"></div></div>
      ${chips ? `<div class="chat-progress-chips">${chips}</div>` : ''}
      ${j.pausedForHint ? '<div class="chat-hint-pause">منتظر آدرس دقیق صفحهٔ ثبت‌نام — بنویس: ادامه بده + آدرس</div>' : ''}
    `;
    els.progress.classList.remove('hidden');
    els.cancel.classList.toggle('hidden', !active);
  }

  async function loadState() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'AGENT_CHAT_STATE' });
      if (!res?.ok) return;
      if (Array.isArray(res.msgs) && res.msgs.length) {
        els.msgs.innerHTML = '';
        res.msgs.forEach(renderMsg);
      }
      renderJob(res.job || null);
      if (res.settings) {
        els.brainProvider.value = res.settings.brainProvider || 'pollinations';
        els.brainKey.value = res.settings.groqKey || res.settings.geminiKey || res.settings.openrouterKey || '';
        els.brainModel.value =
          res.settings.groqModel && res.settings.brainProvider === 'groq'
            ? res.settings.groqModel
            : res.settings.geminiModel && res.settings.brainProvider === 'gemini'
              ? res.settings.geminiModel
              : res.settings.openrouterModel && res.settings.brainProvider === 'openrouter'
                ? res.settings.openrouterModel
                : '';
      }
    } catch {}
  }

  async function send(text) {
    const t = String(text || '').trim();
    if (!t || sending) return;
    sending = true;
    els.send.disabled = true;
    renderMsg({ role: 'user', text: t, ts: Date.now() });
    try {
      await chrome.runtime.sendMessage({ type: 'AGENT_CHAT_SEND', text: t });
    } catch {}
    setTimeout(() => {
      sending = false;
      els.send.disabled = false;
    }, 800);
  }

  els.send.addEventListener('click', () => {
    const t = els.input.value;
    els.input.value = '';
    send(t);
  });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const t = els.input.value;
      els.input.value = '';
      send(t);
    }
  });
  els.chips.forEach((c) => {
    c.addEventListener('click', () => send(c.dataset.say || c.textContent));
  });
  els.cancel.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'AGENT_CHAT_CANCEL' });
    } catch {}
    els.cancel.classList.add('hidden');
  });
  els.clear.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'AGENT_CHAT_CLEAR' });
      els.msgs.innerHTML = '';
      renderJob(null);
    } catch {}
  });
  els.brainSave.addEventListener('click', async () => {
    const provider = els.brainProvider.value;
    const key = els.brainKey.value.trim();
    const model = els.brainModel.value.trim();
    const patch = { brainProvider: provider };
    if (provider === 'groq') Object.assign(patch, { groqKey: key, groqModel: model || 'llama-3.3-70b-versatile' });
    if (provider === 'gemini') Object.assign(patch, { geminiKey: key, geminiModel: model || 'gemini-2.0-flash' });
    if (provider === 'openrouter') Object.assign(patch, { openrouterKey: key, openrouterModel: model || 'meta-llama/llama-3.3-70b-instruct:free' });
    if (provider === 'pollinations') Object.assign(patch, { brainModel: model || 'openai' });
    try {
      await chrome.runtime.sendMessage({ type: 'AGENT_CHAT_SAVE_SETTINGS', settings: patch });
      els.brainSave.textContent = 'ذخیره شد ✓';
      setTimeout(() => {
        els.brainSave.textContent = 'ذخیره تنظیمات مغز';
      }, 1600);
    } catch {}
  });

  // رویدادهای زنده از background
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'AGENT_CHAT_EVENT' && msg.msg) {
        renderMsg(msg.msg);
      } else if (msg.type === 'AGENT_CHAT_JOB') {
        renderJob(msg.job || null);
      } else if (msg.type === 'AGENT_CHAT_RESET') {
        els.msgs.innerHTML = '';
        renderJob(null);
        loadState();
      }
    });
  } catch {}

  if (!els.panel.classList.contains('hidden')) loadState();
  else {
    // بار اول که کاربر پیل چت را می‌زند، state لود شود
    const pill = document.getElementById('agentChatPill');
    if (pill) {
      pill.addEventListener('click', () => {
        if (!els.panel.classList.contains('hidden')) loadState();
      });
    }
  }
})();
