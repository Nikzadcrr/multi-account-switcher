// ============================================================================
// Agent Tab — ایجنت ثبت‌نام خودکار و خزانه حساب‌ها
// به popup.js وابسته است (els, sendMsg, showToast, copyText, toFa, ...)
// ============================================================================

(() => {
  // ------------------------------------------------------------------
  // آیکون‌های جدید + تزریق مجدد آیکون‌های استاتیک تب ایجنت
  // ------------------------------------------------------------------
  Object.assign(ICON_PATHS, {
    robot:
      '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    user:
      '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    eye:
      '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    'eye-off':
      '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.15 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>'
  });
  document.querySelectorAll('span[data-icon]').forEach((el) => {
    const svg = el.querySelector('svg');
    const needsInject = !svg || !svg.innerHTML.trim();
    if (!needsInject || !ICON_PATHS[el.dataset.icon]) return;
    el.innerHTML = ic(el.dataset.icon, el.dataset.iconClass || 'ic');
    el.dataset.iconDone = '1';
  });

  // ------------------------------------------------------------------
  // المان‌ها
  // ------------------------------------------------------------------
  Object.assign(els, {
    tabAgentBtn: document.getElementById('tabAgentBtn'),
    agentVaultBadge: document.getElementById('agentVaultBadge'),
    agentView: document.getElementById('agentView'),
    agentRunPill: document.getElementById('agentRunPill'),
    agentVaultPill: document.getElementById('agentVaultPill'),
    agentVaultPillCount: document.getElementById('agentVaultPillCount'),
    agentRunPanel: document.getElementById('agentRunPanel'),
    agentVaultPanel: document.getElementById('agentVaultPanel'),
    agentSiteBadge: document.getElementById('agentSiteBadge'),
    agentStatusChip: document.getElementById('agentStatusChip'),
    agentMailSelect: document.getElementById('agentMailSelect'),
    agentNewMailBtn: document.getElementById('agentNewMailBtn'),
    agentUsernameInput: document.getElementById('agentUsernameInput'),
    agentPasswordInput: document.getElementById('agentPasswordInput'),
    agentGenUserBtn: document.getElementById('agentGenUserBtn'),
    agentShowPwBtn: document.getElementById('agentShowPwBtn'),
    agentGenPwBtn: document.getElementById('agentGenPwBtn'),
    agentAutoSubmit: document.getElementById('agentAutoSubmit'),
    agentAutoSave: document.getElementById('agentAutoSave'),
    agentStartBtn: document.getElementById('agentStartBtn'),
    agentRunActions: document.getElementById('agentRunActions'),
    agentContinueBtn: document.getElementById('agentContinueBtn'),
    agentCancelBtn: document.getElementById('agentCancelBtn'),
    agentOtpBox: document.getElementById('agentOtpBox'),
    agentOtpCode: document.getElementById('agentOtpCode'),
    agentCopyOtpBtn: document.getElementById('agentCopyOtpBtn'),
    agentLinkBox: document.getElementById('agentLinkBox'),
    agentLinksList: document.getElementById('agentLinksList'),
    agentLog: document.getElementById('agentLog'),
    agentSolverSelect: document.getElementById('agentSolverSelect'),
    agentSolverKey: document.getElementById('agentSolverKey'),
    agentSaveSolverBtn: document.getElementById('agentSaveSolverBtn'),
    agentVaultSearch: document.getElementById('agentVaultSearch'),
    agentVaultEmpty: document.getElementById('agentVaultEmpty'),
    agentVaultList: document.getElementById('agentVaultList'),
    agentExportBtn: document.getElementById('agentExportBtn')
  });

  // ------------------------------------------------------------------
  // وضعیت
  // ------------------------------------------------------------------
  let agentTab = 'run'; // 'run' | 'vault'
  let agentRun = null; // آخرین وضعیت اجرا برای تب فعلی
  let agentVault = { accounts: [], total: 0 };
  let agentPwVisible = true; // رمز پیش‌فرض نمایان است (تا کاربر ببیند چه ساخته شده)
  const AGENT_ACTIVE_STATUSES = ['running', 'waiting_captcha_manual', 'waiting_otp'];

  const AGENT_STATUS_LABEL = {
    running: ['در حال اجرا', 'run'],
    waiting_captcha_manual: ['انتظار کپچا', 'warn'],
    waiting_otp: ['انتظار کد تأیید', 'warn'],
    done: ['تمام شد', 'ok'],
    failed: ['خطا', 'err'],
    cancelled: ['لغو شد', 'err']
  };

  const AGENT_AVATAR_COLORS = [
    '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'
  ];

  // ------------------------------------------------------------------
  // سوییچ تب اصلی — بازنویسی switchView برای سه تب
  // ------------------------------------------------------------------
  const __origSwitchView = switchView;
  switchView = function (viewName) {
    currentView = viewName;
    const isAcc = viewName === 'accounts';
    const isMail = viewName === 'mail';
    const isAgent = viewName === 'agent';
    els.tabAccountsBtn.classList.toggle('active', isAcc);
    els.tabMailBtn.classList.toggle('active', isMail);
    els.tabAgentBtn.classList.toggle('active', isAgent);
    els.accountsView.classList.toggle('hidden', !isAcc);
    els.mailView.classList.toggle('hidden', !isMail);
    els.agentView.classList.toggle('hidden', !isAgent);

    clearInterval(inboxPollTimer);
    if (isMail) {
      renderMailSections();
      refreshInboxMessages();
      inboxPollTimer = setInterval(() => {
        if (mailState.activeMailboxId) {
          refreshInboxMessages(true);
        }
      }, 5000);
    }
    if (isAgent) {
      refreshAgentPanel();
    }
  };

  els.tabAgentBtn.addEventListener('click', () => switchView('agent'));

  // ------------------------------------------------------------------
  // پیل‌های پنل اجرا / خزانه
  // ------------------------------------------------------------------
  function switchAgentTab(tab) {
    agentTab = tab;
    els.agentRunPill.classList.toggle('active', tab === 'run');
    els.agentVaultPill.classList.toggle('active', tab === 'vault');
    els.agentRunPanel.classList.toggle('hidden', tab !== 'run');
    els.agentVaultPanel.classList.toggle('hidden', tab !== 'vault');
    if (tab === 'vault') renderAgentVault();
  }
  els.agentRunPill.addEventListener('click', () => switchAgentTab('run'));
  els.agentVaultPill.addEventListener('click', () => switchAgentTab('vault'));

  // ------------------------------------------------------------------
  // رندر پنل اجرا
  // ------------------------------------------------------------------
  function renderAgentSite() {
    if (state.supported && state.hostname) {
      els.agentSiteBadge.textContent = state.hostname;
    } else {
      els.agentSiteBadge.textContent = 'یک صفحه وب باز کنید';
    }
  }

  function renderAgentMailSelect() {
    const sel = els.agentMailSelect;
    const prev = sel.value;
    sel.innerHTML = '';
    if (!mailState.mailboxes.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'صندوقی ندارید — «ایمیل جدید» بزنید';
      sel.appendChild(o);
      return;
    }
    for (const mb of mailState.mailboxes) {
      const o = document.createElement('option');
      o.value = mb.id;
      o.textContent = mb.address + (mb.id === mailState.activeMailboxId ? '  (فعال)' : '');
      sel.appendChild(o);
    }
    sel.value = mailState.activeMailboxId || prev || mailState.mailboxes[0]?.id || '';
    if (!sel.value && mailState.mailboxes.length) {
      sel.value = mailState.mailboxes[0].id;
    }
  }

  function renderAgentStatusChip() {
    const chip = els.agentStatusChip;
    if (!agentRun || !agentRun.status) {
      chip.classList.add('hidden');
      return;
    }
    const [label, kind] = AGENT_STATUS_LABEL[agentRun.status] || [agentRun.status, 'run'];
    chip.textContent = label;
    chip.className = `agent-status-chip ${kind}`;
    chip.classList.remove('hidden');
  }

  function logKind(text) {
    if (/خطا|ناموفق|پیدا نشد|نگرفت/.test(text)) return 'log-err';
    if (/تمام شد|درج شد|ذخیره شد|تزریق شد|کلیک شد|ارسال شد|پیدا شد|رسید/.test(text)) return 'log-ok';
    if (/کپچا را|منتظر|در انتظار|دستی/.test(text)) return 'log-warn';
    return 'log-info';
  }

  function renderAgentLog() {
    const box = els.agentLog;
    box.innerHTML = '';
    const logs = agentRun?.log || [];
    if (!logs.length) {
      box.classList.add('empty');
      const d = document.createElement('div');
      d.className = 'agent-log-empty';
      d.textContent = 'ایجنت آماده است. صفحه ثبت‌نام سایت را باز کنید و «شروع ایجنت» را بزنید.';
      box.appendChild(d);
      return;
    }
    box.classList.remove('empty');
    for (const item of logs.slice(-30)) {
      const line = document.createElement('div');
      line.className = `agent-log-line ${logKind(item.text)}`;
      const t = document.createElement('span');
      t.className = 'log-time';
      const d = new Date(item.t);
      t.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const txt = document.createElement('span');
      txt.textContent = item.text;
      line.appendChild(t);
      line.appendChild(txt);
      box.appendChild(line);
    }
    box.scrollTop = box.scrollHeight;
  }

  function renderAgentOtpAndLinks() {
    const otp = agentRun?.otp || null;
    if (otp) {
      els.agentOtpBox.classList.remove('hidden');
      els.agentOtpCode.textContent = otp;
    } else {
      els.agentOtpBox.classList.add('hidden');
    }

    const links = agentRun?.links || [];
    if (links.length) {
      els.agentLinkBox.classList.remove('hidden');
      els.agentLinksList.innerHTML = '';
      for (const url of links.slice(0, 4)) {
        const row = document.createElement('div');
        row.className = 'agent-link-row';
        const span = document.createElement('span');
        span.className = 'agent-link-url';
        span.textContent = url;
        span.title = url;
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = 'باز کن';
        btn.addEventListener('click', () => {
          chrome.tabs.create({ url });
        });
        row.appendChild(span);
        row.appendChild(btn);
        els.agentLinksList.appendChild(row);
      }
    } else {
      els.agentLinkBox.classList.add('hidden');
      els.agentLinksList.innerHTML = '';
    }
  }

  function renderAgentRunButtons() {
    const active = agentRun && AGENT_ACTIVE_STATUSES.includes(agentRun.status);
    els.agentStartBtn.disabled = Boolean(active);
    els.agentStartBtn.querySelector('span:last-child').textContent = active
      ? 'ایجنت در حال اجرا...'
      : 'شروع ایجنت';
    els.agentRunActions.classList.toggle('hidden', !active);
    els.agentContinueBtn.classList.toggle(
      'hidden',
      agentRun?.status !== 'waiting_captcha_manual'
    );
  }

  function renderAgentRun() {
    renderAgentStatusChip();
    renderAgentLog();
    renderAgentOtpAndLinks();
    renderAgentRunButtons();
  }

  async function refreshAgentPanel() {
    renderAgentSite();
    renderAgentMailSelect();
    const res = await sendMsg({ type: 'AGENT_GET_RUN_STATE', tabId: state.tabId });
    if (res?.ok) {
      agentRun = res.run;
    }
    renderAgentRun();
  }

  // ------------------------------------------------------------------
  // رویدادها: ایمیل، اعتبارها، شروع/لغو/ادامه
  // ------------------------------------------------------------------
  els.agentNewMailBtn.addEventListener('click', async () => {
    els.agentNewMailBtn.disabled = true;
    const res = await sendMsg({
      type: 'MAIL_CREATE_INBOX',
      provider: 'hd',
      domain: '',
      customUser: ''
    });
    els.agentNewMailBtn.disabled = false;
    if (res?.ok) {
      mailState.activeMailboxId = res.activeMailboxId;
      mailState.mailboxes = res.mailboxes || mailState.mailboxes;
      renderAgentMailSelect();
      try {
        renderMailSections();
      } catch {}
      showToast(`ایمیل ساخته شد: ${res.mailbox?.address || ''}`);
    } else {
      showToast(res?.error || 'ساخت ایمیل ناموفق بود؛ از تب «ایمیل موقت» امتحان کنید.', true);
    }
  });

  async function regenerateCreds() {
    const res = await sendMsg({ type: 'AGENT_GENERATE_CREDS' });
    if (res?.ok) {
      els.agentUsernameInput.value = res.username;
      els.agentPasswordInput.value = res.password;
      if (!agentPwVisible) togglePwVisibility();
    }
  }

  els.agentGenUserBtn.addEventListener('click', regenerateCreds);
  els.agentGenPwBtn.addEventListener('click', regenerateCreds);

  function togglePwVisibility() {
    agentPwVisible = !agentPwVisible;
    els.agentPasswordInput.type = agentPwVisible ? 'text' : 'password';
    els.agentShowPwBtn.querySelector('span').innerHTML = ic(
      agentPwVisible ? 'eye' : 'eye-off',
      'ic'
    );
  }
  els.agentShowPwBtn.addEventListener('click', togglePwVisibility);

  els.agentStartBtn.addEventListener('click', async () => {
    if (!state.tabId || !state.supported) {
      showToast('ابتدا صفحه ثبت‌نام سایت مورد نظر را باز کنید.', true);
      return;
    }
    const mailboxId = els.agentMailSelect.value;
    const mb = mailState.mailboxes.find((m) => m.id === mailboxId);
    if (!mb) {
      showToast('اول یک ایمیل موقت بسازید یا از تب «ایمیل موقت» انتخابش کنید.', true);
      return;
    }

    els.agentStartBtn.disabled = true;
    const res = await sendMsg({
      type: 'AGENT_START',
      tabId: state.tabId,
      mailboxId,
      email: mb.address,
      username: els.agentUsernameInput.value.trim(),
      password: els.agentPasswordInput.value.trim(),
      autoSubmit: els.agentAutoSubmit.checked,
      autoSave: els.agentAutoSave.checked
    });

    if (!res?.ok) {
      els.agentStartBtn.disabled = false;
      showToast(res?.error || 'شروع ایجنت ناموفق بود.', true);
      return;
    }
    showToast('ایجنت شروع شد؛ پیشرفت را همین‌جا دنبال کنید.');
    agentRun = {
      tabId: state.tabId,
      hostname: state.hostname || '',
      status: 'running',
      log: [],
      otp: null,
      links: [],
      otpFilled: false,
      email: mb.address,
      startedAt: Date.now()
    };
    renderAgentRun();
  });

  els.agentContinueBtn.addEventListener('click', async () => {
    const res = await sendMsg({ type: 'AGENT_MANUAL_CONTINUE', tabId: state.tabId });
    if (res?.ok) {
      showToast('ادامه دادم؛ فرم ارسال می‌شود...');
    } else {
      showToast(res?.error || 'ادامه ممکن نشد.', true);
    }
  });

  els.agentCancelBtn.addEventListener('click', async () => {
    const res = await sendMsg({ type: 'AGENT_CANCEL', tabId: state.tabId });
    if (res?.ok) {
      showToast('ایجنت لغو شد.');
    }
  });

  els.agentCopyOtpBtn.addEventListener('click', async () => {
    if (!agentRun?.otp) return;
    await copyAndFillOtp(agentRun.otp);
  });

  // ------------------------------------------------------------------
  // رویدادهای زنده از پس‌زمینه
  // ------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'AGENT_EVENT' && msg.run && msg.run.tabId === state.tabId) {
      agentRun = msg.run;
      renderAgentRun();
      if (['done', 'failed', 'cancelled'].includes(agentRun.status)) {
        renderAgentVault();
      }
    }
  });

  // ------------------------------------------------------------------
  // تنظیمات سولور کپچا
  // ------------------------------------------------------------------
  async function loadAgentSettings() {
    const res = await sendMsg({ type: 'AGENT_GET_SETTINGS' });
    if (res?.ok) {
      els.agentSolverSelect.value = res.settings.solverProvider || 'none';
      els.agentSolverKey.value = res.settings.solverKey || '';
      els.agentAutoSubmit.checked = res.settings.autoSubmit !== false;
      els.agentAutoSave.checked = res.settings.autoSave !== false;
    }
  }

  els.agentSaveSolverBtn.addEventListener('click', async () => {
    const res = await sendMsg({
      type: 'AGENT_SAVE_SETTINGS',
      settings: {
        solverProvider: els.agentSolverSelect.value,
        solverKey: els.agentSolverKey.value.trim()
      }
    });
    if (res?.ok) {
      showToast('تنظیمات سولور ذخیره شد.');
    } else {
      showToast('ذخیره تنظیمات ناموفق بود.', true);
    }
  });

  // ------------------------------------------------------------------
  // خزانه حساب‌ها
  // ------------------------------------------------------------------
  async function renderAgentVault() {
    const res = await sendMsg({
      type: 'AGENT_GET_ACCOUNTS',
      search: els.agentVaultSearch.value.trim()
    });
    if (!res?.ok) return;
    agentVault = res;

    const total = res.total || 0;
    const countText = toFa(total);
    els.agentVaultPillCount.textContent = countText;
    els.agentVaultBadge.textContent = countText;
    els.agentVaultBadge.classList.toggle('hidden', total === 0);
    els.agentVaultPillCount.classList.toggle('hidden', total === 0);

    els.agentVaultEmpty.classList.toggle('hidden', res.accounts.length > 0);
    els.agentVaultList.innerHTML = '';

    for (const acc of res.accounts) {
      const card = document.createElement('div');
      card.className = 'agent-vault-card';

      // سر کارت: آواتار + هاست + تاریخ + حذف
      const head = document.createElement('div');
      head.className = 'agent-vault-head';

      const avatar = document.createElement('div');
      avatar.className = 'agent-vault-avatar';
      const hostInitial = (acc.hostname || '؟').replace(/^www\./, '').charAt(0);
      avatar.textContent = hostInitial;
      let hash = 0;
      for (const ch of acc.hostname || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      avatar.style.background = AGENT_AVATAR_COLORS[hash % AGENT_AVATAR_COLORS.length];

      const hostBox = document.createElement('div');
      hostBox.className = 'agent-vault-host';
      const hostName = document.createElement('div');
      hostName.className = 'agent-vault-hostname';
      hostName.textContent = acc.hostname || 'نامشخص';
      hostName.title = acc.hostname || '';
      const dateDiv = document.createElement('div');
      dateDiv.className = 'agent-vault-date';
      dateDiv.textContent = `${formatRelativeTime(acc.createdAt)} ذخیره شد`;
      hostBox.appendChild(hostName);
      hostBox.appendChild(dateDiv);

      const delBtn = document.createElement('button');
      delBtn.className = 'agent-vault-del';
      delBtn.title = 'حذف این حساب';
      delBtn.innerHTML = ic('trash', 'ic');
      let confirmTimer = null;
      delBtn.addEventListener('click', async () => {
        if (!delBtn.classList.contains('confirm')) {
          delBtn.classList.add('confirm');
          delBtn.innerHTML = ic('trash', 'ic');
          const t = document.createElement('span');
          t.textContent = ' مطمئنی؟';
          delBtn.appendChild(t);
          confirmTimer = setTimeout(() => {
            delBtn.classList.remove('confirm');
            delBtn.innerHTML = ic('trash', 'ic');
          }, 2600);
          return;
        }
        clearTimeout(confirmTimer);
        const r = await sendMsg({ type: 'AGENT_DELETE_ACCOUNT', accountId: acc.id });
        if (r?.ok) {
          showToast('حساب از خزانه حذف شد.');
          renderAgentVault();
        }
      });

      head.appendChild(avatar);
      head.appendChild(hostBox);
      head.appendChild(delBtn);
      card.appendChild(head);

      // ردیف ایمیل
      card.appendChild(buildVaultRow('ایمیل', acc.email, acc.email));
      // ردیف یوزرنیم
      if (acc.username) {
        card.appendChild(buildVaultRow('یوزرنیم', acc.username, acc.username));
      }
      // ردیف رمز (ماسک‌شده)
      if (acc.password) {
        const row = document.createElement('div');
        row.className = 'agent-vault-row';

        const key = document.createElement('span');
        key.className = 'vault-key';
        key.textContent = 'رمز';
        const val = document.createElement('span');
        val.className = 'vault-value masked';
        val.textContent = '•'.repeat(Math.min(acc.password.length, 14));
        const showBtn = document.createElement('button');
        showBtn.className = 'mini-copy-btn';
        showBtn.title = 'نمایش / پنهان';
        showBtn.innerHTML = ic('eye', 'ic');
        let shown = false;
        showBtn.addEventListener('click', () => {
          shown = !shown;
          if (shown) {
            val.textContent = acc.password;
            val.classList.remove('masked');
            showBtn.innerHTML = ic('eye-off', 'ic');
          } else {
            val.textContent = '•'.repeat(Math.min(acc.password.length, 14));
            val.classList.add('masked');
            showBtn.innerHTML = ic('eye', 'ic');
          }
        });
        const cpBtn = document.createElement('button');
        cpBtn.className = 'mini-copy-btn';
        cpBtn.title = 'کپی رمز';
        cpBtn.innerHTML = ic('copy', 'ic');
        cpBtn.addEventListener('click', async () => {
          const ok = await copyText(acc.password);
          showToast(ok ? 'رمز کپی شد.' : 'کپی ناموفق بود.', !ok);
        });

        row.appendChild(key);
        row.appendChild(val);
        row.appendChild(showBtn);
        row.appendChild(cpBtn);
        card.appendChild(row);
      }

      // یادداشت
      if (acc.note) {
        const note = document.createElement('div');
        note.className = 'agent-vault-note';
        note.textContent = acc.note;
        note.title = acc.note;
        card.appendChild(note);
      }

      els.agentVaultList.appendChild(card);
    }
  }

  function buildVaultRow(keyText, valueText, copyValue) {
    const row = document.createElement('div');
    row.className = 'agent-vault-row';

    const key = document.createElement('span');
    key.className = 'vault-key';
    key.textContent = keyText;

    const val = document.createElement('span');
    val.className = 'vault-value';
    val.textContent = valueText || '—';
    val.title = valueText || '';

    const cpBtn = document.createElement('button');
    cpBtn.className = 'mini-copy-btn';
    cpBtn.title = 'کپی';
    cpBtn.innerHTML = ic('copy', 'ic');
    cpBtn.addEventListener('click', async () => {
      const ok = await copyText(copyValue);
      showToast(ok ? `${keyText} کپی شد.` : 'کپی ناموفق بود.', !ok);
    });

    row.appendChild(key);
    row.appendChild(val);
    row.appendChild(cpBtn);
    return row;
  }

  let vaultSearchTimer = null;
  els.agentVaultSearch.addEventListener('input', () => {
    clearTimeout(vaultSearchTimer);
    vaultSearchTimer = setTimeout(renderAgentVault, 250);
  });

  els.agentExportBtn.addEventListener('click', () => {
    if (!agentVault.accounts.length) {
      showToast('حسابی برای خروجی گرفتن نیست.', true);
      return;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(`agent-accounts-${dateStr}.json`, {
      app: 'ai-account-switcher-agent',
      exportedAt: new Date().toISOString(),
      count: agentVault.accounts.length,
      accounts: agentVault.accounts
    });
    showToast('فایل خروجی حساب‌ها دانلود شد.');
  });

  // ------------------------------------------------------------------
  // شروع اولیه
  // ------------------------------------------------------------------
  (async function initAgent() {
    await loadAgentSettings();
    const g = await sendMsg({ type: 'AGENT_GENERATE_CREDS' });
    if (g?.ok) {
      els.agentUsernameInput.value = g.username;
      els.agentPasswordInput.value = g.password;
    }
    renderAgentVault();
    renderAgentSite();
  })();
})();
