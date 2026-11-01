// ============================================================================
// AI Multi-Account Switcher + Temp Mail Client - Popup Controller (v3.0)
// ============================================================================

const COLORS = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
  '#3b82f6', '#ef4444'
];

const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toFa(val) {
  return String(val).replace(/\d/g, (d) => persianDigits[Number(d)]);
}

function formatRelativeTime(ts) {
  if (!ts) return 'استفاده‌نشده';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'هم‌اکنون';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${toFa(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${toFa(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  return `${toFa(days)} روز پیش`;
}

function sendMsg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, error: 'پاسخی دریافت نشد.' });
    });
  });
}

let state = {
  tabId: null,
  url: '',
  supported: false,
  siteKey: '',
  hostname: '',
  isGoogleUnified: false,
  activeAccountId: null,
  isIsolatedTab: false,
  isolatedAccountId: null,
  openIsolatedTabs: [],
  accounts: [],
  settings: {
    floatingWidget: true,
    autoSync: true,
    includeStorage: true
  }
};

let mailState = {
  activeMailboxId: null,
  mailboxes: [],
  messages: [],
  readingMessageId: null
};

// رابط ساخت ایمیل — دقیقا مثل اپ Instant Mail: سرویس + گروه (تصادفی/دامنه/محبوب)
const MAIL_PROVIDER_META = [
  { key: 'hd', icon: '⚡', label: 'اینسنت میل' },
  { key: 'hd_gmail', icon: '📧', label: 'جیمیل آنی' },
  { key: 'temp-mail-io', icon: '🌐', label: 'Temp-Mail.io' },
  { key: 'mail.tm', icon: '🅰', label: 'Mail.tm' },
  { key: 'mail.gw', icon: '🅱', label: 'Mail.gw' }
];

let mailUi = { provider: 'hd', group: 'domain', domain: '' };
let createCardOpen = false;
let providerDomainsCache = {}; // provider -> { domains, popular }

let currentView = 'accounts'; // 'accounts' | 'mail'
let searchQuery = '';
let pendingDeleteId = null;
let editingAccountId = null;
let editingColor = COLORS[0];
let toastTimer = null;
let inboxPollTimer = null;

const els = {
  domainBadge: document.getElementById('domainBadge'),
  countBadge: document.getElementById('countBadge'),
  isoCountBadge: document.getElementById('isoCountBadge'),
  toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  tabAccountsBtn: document.getElementById('tabAccountsBtn'),
  tabMailBtn: document.getElementById('tabMailBtn'),
  mailUnreadBadge: document.getElementById('mailUnreadBadge'),
  accountsView: document.getElementById('accountsView'),
  mailView: document.getElementById('mailView'),
  toast: document.getElementById('toast'),
  unsupportedState: document.getElementById('unsupportedState'),
  mainContent: document.getElementById('mainContent'),
  googleWarning: document.getElementById('googleWarning'),
  settingsPanel: document.getElementById('settingsPanel'),
  chkFloatingWidget: document.getElementById('chkFloatingWidget'),
  chkAutoSync: document.getElementById('chkAutoSync'),
  chkIncludeStorage: document.getElementById('chkIncludeStorage'),
  exportSiteBtn: document.getElementById('exportSiteBtn'),
  exportAllBtn: document.getElementById('exportAllBtn'),
  importBtn: document.getElementById('importBtn'),
  importFileInput: document.getElementById('importFileInput'),
  activeStatusText: document.getElementById('activeStatusText'),
  nextAccountBtn: document.getElementById('nextAccountBtn'),
  prevAccountBtn: document.getElementById('prevAccountBtn'),
  openBatchBtn: document.getElementById('openBatchBtn'),
  batchCountSelect: document.getElementById('batchCountSelect'),
  accountNameInput: document.getElementById('accountNameInput'),
  accountNoteInput: document.getElementById('accountNoteInput'),
  linkActiveMailRow: document.getElementById('linkActiveMailRow'),
  chkLinkActiveMail: document.getElementById('chkLinkActiveMail'),
  linkActiveMailLabel: document.getElementById('linkActiveMailLabel'),
  saveCurrentBtn: document.getElementById('saveCurrentBtn'),
  newSessionBtn: document.getElementById('newSessionBtn'),
  searchInput: document.getElementById('searchInput'),
  emptyAccountsState: document.getElementById('emptyAccountsState'),
  accountsList: document.getElementById('accountsList'),
  editModal: document.getElementById('editModal'),
  editNameInput: document.getElementById('editNameInput'),
  editNoteInput: document.getElementById('editNoteInput'),
  editColorPicker: document.getElementById('editColorPicker'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),

  // Mail View Elements (Instant Mail app-style UI)
  mailServiceChips: document.getElementById('mailServiceChips'),
  imDomainGrid: document.getElementById('imDomainGrid'),
  mailCreateCard: document.getElementById('mailCreateCard'),
  closeCreateCardBtn: document.getElementById('closeCreateCardBtn'),
  newMailBtn: document.getElementById('newMailBtn'),
  groupTabs: document.querySelectorAll('.im-group-tab'),
  mailCustomUser: document.getElementById('mailCustomUser'),
  createMailBtn: document.getElementById('createMailBtn'),
  activeMailboxCard: document.getElementById('activeMailboxCard'),
  mailboxHistorySelect: document.getElementById('mailboxHistorySelect'),
  deleteMailboxBtn: document.getElementById('deleteMailboxBtn'),
  currentEmailText: document.getElementById('currentEmailText'),
  copyEmailBtn: document.getElementById('copyEmailBtn'),
  fillEmailBtn: document.getElementById('fillEmailBtn'),
  inboxSection: document.getElementById('inboxSection'),
  inboxPollStatus: document.getElementById('inboxPollStatus'),
  refreshInboxBtn: document.getElementById('refreshInboxBtn'),
  emptyInboxState: document.getElementById('emptyInboxState'),
  messagesList: document.getElementById('messagesList'),

  // Mail Read Modal
  mailReadModal: document.getElementById('mailReadModal'),
  mailModalSubject: document.getElementById('mailModalSubject'),
  mailModalFrom: document.getElementById('mailModalFrom'),
  mailModalOtpBox: document.getElementById('mailModalOtpBox'),
  mailModalOtpCode: document.getElementById('mailModalOtpCode'),
  copyModalOtpBtn: document.getElementById('copyModalOtpBtn'),
  mailModalLinks: document.getElementById('mailModalLinks'),
  mailModalBody: document.getElementById('mailModalBody'),
  deleteMessageBtn: document.getElementById('deleteMessageBtn'),
  closeMailModalBtn: document.getElementById('closeMailModalBtn'),
  closeMailModalBtn2: document.getElementById('closeMailModalBtn2')
};

function showToast(text, isError = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 3200);
}

// ----------------------------------------------------------------------------
// View Navigation
// ----------------------------------------------------------------------------

function switchView(viewName) {
  currentView = viewName;
  const isAcc = viewName === 'accounts';
  els.tabAccountsBtn.classList.toggle('active', isAcc);
  els.tabMailBtn.classList.toggle('active', !isAcc);
  els.accountsView.classList.toggle('hidden', !isAcc);
  els.mailView.classList.toggle('hidden', isAcc);

  clearInterval(inboxPollTimer);
  if (!isAcc) {
    renderMailSections();
    refreshInboxMessages();
    inboxPollTimer = setInterval(() => {
      if (mailState.activeMailboxId) {
        refreshInboxMessages(true);
      }
    }, 5000);
  }
}

els.tabAccountsBtn.addEventListener('click', () => switchView('accounts'));
els.tabMailBtn.addEventListener('click', () => switchView('mail'));

// ----------------------------------------------------------------------------
// Site & Accounts State
// ----------------------------------------------------------------------------

async function loadState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [res, mRes] = await Promise.all([
    sendMsg({ type: 'GET_SITE_STATE', tabId: tab?.id, url: tab?.url }),
    sendMsg({ type: 'MAIL_GET_STATE' })
  ]);

  if (mRes?.ok) {
    mailState.activeMailboxId = mRes.activeMailboxId;
    mailState.mailboxes = mRes.mailboxes || [];
    await loadMailUiPref();
    renderMailSections();
  }

  if (!res.ok || !res.supported) {
    state.supported = false;
    state.tabId = tab?.id || null;
    els.domainBadge.textContent = 'صفحه داخلی مرورگر';
    els.countBadge.textContent = '۰ اکانت';
    els.isoCountBadge.classList.add('hidden');
    els.unsupportedState.classList.remove('hidden');
    els.mainContent.classList.add('hidden');
    return;
  }

  state = {
    ...state,
    tabId: tab?.id || res.tabId,
    url: tab?.url || res.url,
    supported: true,
    siteKey: res.siteKey,
    hostname: res.hostname,
    isGoogleUnified: Boolean(res.isGoogleUnified),
    activeAccountId: res.activeAccountId,
    isIsolatedTab: Boolean(res.isIsolatedTab),
    isolatedAccountId: res.isolatedAccountId || null,
    openIsolatedTabs: res.openIsolatedTabs || [],
    accounts: res.accounts || [],
    settings: res.settings || state.settings
  };

  els.unsupportedState.classList.add('hidden');
  els.mainContent.classList.remove('hidden');

  const currentVal = els.accountNameInput.value.trim();
  if (!currentVal || /^اکانت\s+[۰-۹0-9]+$/.test(currentVal)) {
    els.accountNameInput.value = `اکانت ${toFa(state.accounts.length + 1)}`;
  }

  renderUI();
}

function renderUI() {
  els.domainBadge.textContent = state.siteKey;
  els.countBadge.textContent = `${toFa(state.accounts.length)} اکانت`;

  const openIsoCount = state.openIsolatedTabs.length;
  els.isoCountBadge.classList.toggle('hidden', openIsoCount === 0);
  els.isoCountBadge.textContent = `🔒 ${toFa(openIsoCount)} تب باز`;

  els.googleWarning.classList.toggle('hidden', !state.isGoogleUnified);

  els.chkFloatingWidget.checked = state.settings.floatingWidget !== false;
  els.chkAutoSync.checked = state.settings.autoSync !== false;
  els.chkIncludeStorage.checked = state.settings.includeStorage !== false;

  // Link active mail indicator
  const activeMb = mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId);
  if (activeMb) {
    els.linkActiveMailRow.classList.remove('hidden');
    els.linkActiveMailLabel.textContent = `اتصال ایمیل فعال (${activeMb.address}) به این اکانت`;
  } else {
    els.linkActiveMailRow.classList.add('hidden');
  }

  const total = state.accounts.length;

  if (state.isIsolatedTab && state.isolatedAccountId) {
    const isoIdx = state.accounts.findIndex((a) => a.id === state.isolatedAccountId);
    const isoAcc = isoIdx >= 0 ? state.accounts[isoIdx] : null;
    els.activeStatusText.textContent = isoAcc
      ? `🔒 تب همزمان ایزوله: ${isoAcc.name} (${toFa(isoIdx + 1)})`
      : '🔒 تب ایزوله';
    els.activeStatusText.style.color = '#67e8f9';
  } else {
    const activeIdx = state.accounts.findIndex((a) => a.id === state.activeAccountId);
    const activeAcc = activeIdx >= 0 ? state.accounts[activeIdx] : null;

    if (activeAcc) {
      els.activeStatusText.textContent = `${activeAcc.name} (${toFa(activeIdx + 1)} از ${toFa(total)})`;
      els.activeStatusText.style.color = '#34d399';
    } else if (total > 0) {
      els.activeStatusText.textContent = 'نشست جدید (ذخیره‌نشده)';
      els.activeStatusText.style.color = '#fbbf24';
    } else {
      els.activeStatusText.textContent = 'بدون اکانت ذخیره‌شده';
      els.activeStatusText.style.color = '#94a3b8';
    }
  }

  const hasActive = state.accounts.some((a) => a.id === state.activeAccountId);
  const canCycle = total > 1 || (total === 1 && !hasActive);
  els.nextAccountBtn.disabled = !canCycle;
  els.prevAccountBtn.disabled = !canCycle;
  els.openBatchBtn.disabled = total === 0;

  els.searchInput.parentElement.classList.toggle('hidden', total < 4);
  els.emptyAccountsState.classList.toggle('hidden', total > 0);

  renderAccountsList();
}

function renderAccountsList() {
  els.accountsList.innerHTML = '';
  const q = searchQuery.trim().toLowerCase();

  const openTabByAccId = new Map();
  for (const item of state.openIsolatedTabs) {
    openTabByAccId.set(item.accountId, item.tabId);
  }

  state.accounts.forEach((acc, idx) => {
    if (q) {
      const hay = `${acc.name} ${acc.note || ''} ${acc.email || ''} ${idx + 1} ${toFa(idx + 1)}`.toLowerCase();
      if (!hay.includes(q)) return;
    }

    const effectiveCurrentId = state.isIsolatedTab
      ? state.isolatedAccountId
      : state.activeAccountId;
    const isActiveHere = acc.id === effectiveCurrentId;
    const openIsoTabId = openTabByAccId.get(acc.id);

    const card = document.createElement('div');
    card.className =
      'acc-card' +
      (isActiveHere ? ' active' : '') +
      (acc.skipped ? ' skipped' : '');

    const main = document.createElement('div');
    main.className = 'acc-main';
    main.title = `کلیک برای سوییچ در همین تب به «${acc.name}»`;

    const indexBadge = document.createElement('div');
    indexBadge.className = 'acc-index';
    indexBadge.style.background = acc.color || '#6366f1';
    indexBadge.textContent = toFa(idx + 1);

    const info = document.createElement('div');
    info.className = 'acc-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'acc-title-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'acc-name';
    nameEl.textContent = acc.name;
    titleRow.appendChild(nameEl);

    if (isActiveHere) {
      const activePill = document.createElement('span');
      activePill.className = 'pill-badge pill-active';
      activePill.textContent = state.isIsolatedTab ? 'این تب' : 'فعال';
      titleRow.appendChild(activePill);
    }

    if (openIsoTabId) {
      const isoPill = document.createElement('span');
      isoPill.className = 'pill-badge pill-iso';
      isoPill.title = 'کلیک برای رفتن به تب بازِ این اکانت';
      isoPill.textContent = '🟢 تب باز';
      isoPill.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.tabs.update(openIsoTabId, { active: true }).catch(() => {});
        window.close();
      });
      titleRow.appendChild(isoPill);
    }

    if (acc.skipped) {
      const skipPill = document.createElement('span');
      skipPill.className = 'pill-badge pill-skip';
      skipPill.textContent = 'توقف';
      titleRow.appendChild(skipPill);
    }

    const meta = document.createElement('div');
    meta.className = 'acc-meta';
    const parts = [];
    if (acc.note) parts.push(acc.note);
    parts.push(`${formatRelativeTime(acc.lastUsedAt)}`);
    meta.textContent = parts.join(' • ');

    info.appendChild(titleRow);
    info.appendChild(meta);

    main.appendChild(indexBadge);
    main.appendChild(info);

    main.addEventListener('click', async () => {
      await handleSwitchTo(acc.id);
    });

    const actions = document.createElement('div');
    actions.className = 'acc-actions';

    // Jump to linked Temp-Mail Inbox if linked!
    if (acc.mailboxId && mailState.mailboxes.some((m) => m.id === acc.mailboxId)) {
      const mailBtn = document.createElement('button');
      mailBtn.className = 'mini-action';
      mailBtn.title = `باز کردن صندوق پیام ایمیل این اکانت (${acc.email || ''})`;
      mailBtn.textContent = '📧';
      mailBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await sendMsg({ type: 'MAIL_SELECT_INBOX', mailboxId: acc.mailboxId });
        mailState.activeMailboxId = acc.mailboxId;
        renderMailUI();
        switchView('mail');
      });
      actions.appendChild(mailBtn);
    }

    // Open in Simultaneous Isolated Tab
    const isoBtn = document.createElement('button');
    isoBtn.className = 'mini-action iso-btn';
    isoBtn.title = openIsoTabId
      ? `رفتن به تب باز «${acc.name}»`
      : `باز کردن همزمان «${acc.name}» در یک تب جدید و ایزوله`;
    isoBtn.textContent = '🗗';
    isoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await sendMsg({
        type: 'OPEN_ISOLATED_TAB',
        tabId: state.tabId,
        url: state.url,
        accountId: acc.id,
        focusIfOpen: true
      });
      if (res.ok) {
        window.close();
      } else {
        showToast(res.error || 'خطا در باز کردن تب همزمان', true);
      }
    });

    // Update cookies
    const updateBtn = document.createElement('button');
    updateBtn.className = 'mini-action';
    updateBtn.title = 'بروزرسانی کوکی‌های این اکانت با نشست فعلی تب';
    updateBtn.textContent = '🔄';
    updateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await sendMsg({
        type: 'UPDATE_ACCOUNT_SESSION',
        tabId: state.tabId,
        accountId: acc.id
      });
      if (res.ok) {
        showToast(`نشست «${acc.name}» بروزرسانی شد.`);
        await loadState();
      } else {
        showToast(res.error || 'خطا در بروزرسانی', true);
      }
    });

    // Skip in rotation
    const skipBtn = document.createElement('button');
    skipBtn.className = 'mini-action';
    skipBtn.title = acc.skipped ? 'برگرداندن به چرخش' : 'رد شدن موقت در چرخش';
    skipBtn.textContent = acc.skipped ? '▶️' : '⏸';
    skipBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendMsg({
        type: 'EDIT_ACCOUNT_META',
        siteKey: state.siteKey,
        accountId: acc.id,
        patch: { skipped: !acc.skipped }
      });
      await loadState();
    });

    // Edit
    const editBtn = document.createElement('button');
    editBtn.className = 'mini-action';
    editBtn.title = 'ویرایش نام، یادداشت و رنگ';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(acc);
    });

    // Delete
    const delBtn = document.createElement('button');
    const isConfirming = pendingDeleteId === acc.id;
    delBtn.className = 'mini-action' + (isConfirming ? ' confirm-del' : '');
    delBtn.title = 'حذف اکانت';
    delBtn.textContent = isConfirming ? 'حذف؟' : '🗑️';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (pendingDeleteId !== acc.id) {
        pendingDeleteId = acc.id;
        renderAccountsList();
        setTimeout(() => {
          if (pendingDeleteId === acc.id) {
            pendingDeleteId = null;
            renderAccountsList();
          }
        }, 3000);
        return;
      }
      pendingDeleteId = null;
      const res = await sendMsg({
        type: 'DELETE_ACCOUNT',
        siteKey: state.siteKey,
        accountId: acc.id
      });
      if (res.ok) {
        showToast(`«${acc.name}» حذف شد.`);
        await loadState();
      }
    });

    actions.appendChild(isoBtn);
    actions.appendChild(updateBtn);
    actions.appendChild(skipBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(main);
    card.appendChild(actions);
    els.accountsList.appendChild(card);
  });
}

// ----------------------------------------------------------------------------
// Temp Mail & Live Inbox Controller
// ----------------------------------------------------------------------------

// ---------------- Instant Mail app-style create UI ----------------

async function ensureProviderDomains(provider) {
  if (!providerDomainsCache[provider]) {
    const res = await sendMsg({ type: 'MAIL_FETCH_DOMAINS', provider });
    providerDomainsCache[provider] = {
      domains: res.ok && Array.isArray(res.domains) ? res.domains : [],
      popular: res.ok && Array.isArray(res.popular) ? res.popular : []
    };
  }
  return providerDomainsCache[provider];
}

function renderServiceChips() {
  els.mailServiceChips.innerHTML = '';
  MAIL_PROVIDER_META.forEach((p) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className =
      'im-chip' + (mailUi.provider === p.key ? ' selected' : '');
    chip.innerHTML = `<span>${p.icon}</span> ${p.label}`;
    chip.addEventListener('click', async () => {
      if (mailUi.provider === p.key) return;
      mailUi.provider = p.key;
      mailUi.domain = '';
      providerDomainsCache[p.key] = providerDomainsCache[p.key] || null;
      saveMailUiPref();
      renderServiceChips();
      await renderDomainGrid();
    });
    els.mailServiceChips.appendChild(chip);
  });
}

function renderGroupTabs() {
  els.groupTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.group === mailUi.group);
  });
}

async function renderDomainGrid() {
  els.imDomainGrid.innerHTML = '';

  if (mailUi.group === 'random') {
    els.imDomainGrid.classList.add('hidden');
    els.mailCustomUser.classList.add('hidden');
    els.createMailBtn.innerHTML = '🎲 ساخت ایمیل تصادفی';
    return;
  }

  const { domains, popular } = await ensureProviderDomains(mailUi.provider);
  const list = mailUi.group === 'popular'
    ? (popular.length ? popular : domains.slice(0, 3))
    : domains;

  els.imDomainGrid.classList.remove('hidden');
  els.mailCustomUser.classList.remove('hidden');
  els.createMailBtn.innerHTML = '✨ ساخت ایمیل جدید';

  if (!list.length) {
    const err = document.createElement('div');
    err.className = 'im-domain-error';
    err.textContent = 'دریافت دامنه‌ها ناموفق بود؛ دوباره تلاش کنید.';
    els.imDomainGrid.appendChild(err);
    return;
  }

  if (!mailUi.domain || !list.includes(mailUi.domain)) {
    mailUi.domain = list[0];
    saveMailUiPref();
  }

  list.forEach((d) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'im-domain-chip' + (d === mailUi.domain ? ' selected' : '');
    chip.textContent = `@${d}`;
    chip.title = `ساخت ایمیل روی دامنه ${d}`;
    chip.addEventListener('click', () => {
      mailUi.domain = d;
      saveMailUiPref();
      renderDomainGrid();
    });
    els.imDomainGrid.appendChild(chip);
  });
}

function renderMailSections() {
  const hasBoxes = mailState.mailboxes.length > 0;

  els.activeMailboxCard.classList.toggle('hidden', !hasBoxes);
  els.inboxSection.classList.toggle('hidden', !hasBoxes);
  els.mailCreateCard.classList.toggle('hidden', hasBoxes && !createCardOpen);
  els.closeCreateCardBtn.classList.toggle('hidden', !hasBoxes);

  renderServiceChips();
  renderGroupTabs();
  renderDomainGrid();
  renderMailUI();
}

async function loadMailUiPref() {
  try {
    const data = await chrome.storage.local.get('mailUiPref');
    if (data.mailUiPref && MAIL_PROVIDER_META.some((p) => p.key === data.mailUiPref.provider)) {
      mailUi = { ...mailUi, ...data.mailUiPref };
    }
  } catch {}
}

function saveMailUiPref() {
  chrome.storage.local.set({ mailUiPref: mailUi }).catch(() => {});
}

els.groupTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    mailUi.group = btn.dataset.group;
    saveMailUiPref();
    renderGroupTabs();
    renderDomainGrid();
  });
});

els.newMailBtn.addEventListener('click', () => {
  createCardOpen = true;
  renderMailSections();
  els.mailCreateCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

els.closeCreateCardBtn.addEventListener('click', () => {
  createCardOpen = false;
  renderMailSections();
});

function renderMailUI() {
  const hasBoxes = mailState.mailboxes.length > 0;
  els.activeMailboxCard.classList.toggle('hidden', !hasBoxes);
  els.inboxSection.classList.toggle('hidden', !hasBoxes);

  if (!hasBoxes) return;

  els.mailboxHistorySelect.innerHTML = '';
  mailState.mailboxes.forEach((m, idx) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${idx + 1}. ${m.address}`;
    if (m.id === mailState.activeMailboxId) opt.selected = true;
    els.mailboxHistorySelect.appendChild(opt);
  });

  const active =
    mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId) ||
    mailState.mailboxes[0];
  if (active) {
    mailState.activeMailboxId = active.id;
    els.currentEmailText.textContent = active.address;
  }
}

els.createMailBtn.addEventListener('click', async () => {
  els.createMailBtn.disabled = true;
  const originalLabel = els.createMailBtn.innerHTML;
  els.createMailBtn.innerHTML = '⏳ در حال ساخت...';

  const isRandom = mailUi.group === 'random';
  const res = await sendMsg({
    type: 'MAIL_CREATE_INBOX',
    provider: mailUi.provider,
    domain: isRandom ? '' : mailUi.domain,
    customUser: isRandom ? '' : els.mailCustomUser.value.trim()
  });

  els.createMailBtn.disabled = false;
  els.createMailBtn.innerHTML = originalLabel;

  if (res.ok) {
    els.mailCustomUser.value = '';
    createCardOpen = false;
    mailState.activeMailboxId = res.activeMailboxId;
    mailState.mailboxes = res.mailboxes || [];
    mailState.messages = [];
    renderMailSections();
    renderMessagesList();
    renderUI();

    try {
      await navigator.clipboard.writeText(res.mailbox.address);
      showToast(`ایمیل ساخته و کپی شد: ${res.mailbox.address}`);
    } catch {
      showToast(`ایمیل جدید ساخته شد ✅`);
    }
  } else {
    showToast(res.error || 'خطا در ساخت ایمیل', true);
  }
});

els.mailboxHistorySelect.addEventListener('change', async (e) => {
  const id = e.target.value;
  await sendMsg({ type: 'MAIL_SELECT_INBOX', mailboxId: id });
  mailState.activeMailboxId = id;
  mailState.messages = [];
  renderMailUI();
  renderMessagesList();
  renderUI();
  await refreshInboxMessages();
});

els.deleteMailboxBtn.addEventListener('click', async () => {
  if (!mailState.activeMailboxId) return;
  const res = await sendMsg({
    type: 'MAIL_DELETE_INBOX',
    mailboxId: mailState.activeMailboxId
  });
  if (res.ok) {
    mailState.activeMailboxId = res.activeMailboxId;
    mailState.mailboxes = res.mailboxes || [];
    mailState.messages = [];
    renderMailUI();
    renderMessagesList();
    renderUI();
    showToast('ایمیل از لیست حذف شد.');
    if (mailState.activeMailboxId) {
      refreshInboxMessages();
    }
  }
});

els.copyEmailBtn.addEventListener('click', async () => {
  const active = mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId);
  if (!active) return;
  await navigator.clipboard.writeText(active.address).catch(() => {});
  showToast('آدرس ایمیل کپی شد 📋');
});

els.fillEmailBtn.addEventListener('click', async () => {
  const active = mailState.mailboxes.find((m) => m.id === mailState.activeMailboxId);
  if (!active) return;
  await navigator.clipboard.writeText(active.address).catch(() => {});
  const res = await sendMsg({
    type: 'MAIL_FILL_IN_PAGE',
    tabId: state.tabId,
    value: active.address,
    fieldKind: 'email'
  });
  if (res.ok) {
    showToast('آدرس ایمیل در کادر سایت درج شد ✍️');
  } else {
    showToast(res.error || 'ایمیل کپی شد (دستی Paste کنید).', true);
  }
});

async function refreshInboxMessages(silent = false) {
  if (!mailState.activeMailboxId) return;
  if (!silent) {
    els.refreshInboxBtn.disabled = true;
    els.inboxPollStatus.textContent = '⏳ در حال بررسی...';
  }

  const res = await sendMsg({
    type: 'MAIL_LIST_MESSAGES',
    mailboxId: mailState.activeMailboxId
  });

  els.refreshInboxBtn.disabled = false;
  els.inboxPollStatus.textContent = '● زنده';

  if (res.ok) {
    mailState.messages = res.messages || [];
    const unseenCount = mailState.messages.filter((m) => !m.seen).length;
    els.mailUnreadBadge.classList.toggle('hidden', unseenCount === 0);
    els.mailUnreadBadge.textContent = toFa(unseenCount);
    renderMessagesList();
  } else if (!silent) {
    showToast(res.error || 'خطا در دریافت پیام‌ها', true);
  }
}

els.refreshInboxBtn.addEventListener('click', () => refreshInboxMessages(false));

function renderMessagesList() {
  els.messagesList.innerHTML = '';
  const list = mailState.messages || [];
  els.emptyInboxState.classList.toggle('hidden', list.length > 0);

  list.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'msg-item' + (!m.seen ? ' unseen' : '');

    const top = document.createElement('div');
    top.className = 'msg-top';

    const subj = document.createElement('div');
    subj.className = 'msg-subject';
    subj.textContent = m.subject;
    top.appendChild(subj);

    const from = document.createElement('div');
    from.className = 'msg-from';
    from.textContent = m.fromAddress || m.fromName;

    item.appendChild(top);
    item.appendChild(from);

    if (m.otpCode) {
      const otpBtn = document.createElement('button');
      otpBtn.className = 'msg-otp-btn';
      otpBtn.textContent = `🔑 کپی و درج کد تأیید: ${m.otpCode}`;
      otpBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await copyAndFillOtp(m.otpCode);
      });
      item.appendChild(otpBtn);
    }

    item.addEventListener('click', () => openMessageModal(m.id));
    els.messagesList.appendChild(item);
  });
}

async function copyAndFillOtp(code) {
  await navigator.clipboard.writeText(code).catch(() => {});
  const res = await sendMsg({
    type: 'MAIL_FILL_IN_PAGE',
    tabId: state.tabId,
    value: code,
    fieldKind: 'otp'
  });
  if (res.ok) {
    showToast(`کد ${code} کپی و در سایت درج شد! ✅`);
  } else {
    showToast(`کد ${code} کپی شد! (Ctrl+V بزنید)`);
  }
}

function htmlToCleanText(htmlArr, fallbackText) {
  if (fallbackText && fallbackText.trim()) return fallbackText.trim();
  if (!Array.isArray(htmlArr) || !htmlArr.length) return '(پیام بدون متن)';
  try {
    const doc = new DOMParser().parseFromString(htmlArr.join('\n'), 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe, object').forEach((el) => el.remove());
    return (doc.body?.innerText || doc.body?.textContent || '').trim() || '(پیام بدون متن)';
  } catch {
    return '(خطا در نمایش متن پیام)';
  }
}

async function openMessageModal(messageId) {
  const res = await sendMsg({
    type: 'MAIL_READ_MESSAGE',
    mailboxId: mailState.activeMailboxId,
    messageId
  });
  if (!res.ok) {
    showToast(res.error || 'خطا در باز کردن پیام', true);
    return;
  }

  const msg = res.message;
  mailState.readingMessageId = msg.id;
  els.mailModalSubject.textContent = msg.subject;
  els.mailModalFrom.textContent = `From: ${msg.fromName ? msg.fromName + ' <' + msg.fromAddress + '>' : msg.fromAddress}`;
  els.deleteMessageBtn.classList.toggle('hidden', res.canDelete === false);

  // OTP Banner
  if (msg.otpCode) {
    els.mailModalOtpBox.classList.remove('hidden');
    els.mailModalOtpCode.textContent = msg.otpCode;
    els.copyModalOtpBtn.onclick = () => copyAndFillOtp(msg.otpCode);
  } else {
    els.mailModalOtpBox.classList.add('hidden');
  }

  // Verification Links
  els.mailModalLinks.innerHTML = '';
  if (Array.isArray(msg.links) && msg.links.length > 0) {
    els.mailModalLinks.classList.remove('hidden');
    msg.links.slice(0, 3).forEach((url, idx) => {
      const btn = document.createElement('button');
      btn.className = 'verify-link-btn';
      btn.textContent =
        idx === 0
          ? '🔗 باز کردن لینک تأیید در تب فعلی'
          : `🔗 باز کردن لینک ${toFa(idx + 1)}`;
      btn.title = url;
      btn.addEventListener('click', async () => {
        if (state.tabId) {
          await chrome.tabs.update(state.tabId, { url });
        } else {
          await chrome.tabs.create({ url });
        }
        window.close();
      });
      els.mailModalLinks.appendChild(btn);
    });
  } else {
    els.mailModalLinks.classList.add('hidden');
  }

  els.mailModalBody.textContent = htmlToCleanText(msg.html, msg.text);
  els.mailReadModal.classList.remove('hidden');

  // Refresh unseen status
  refreshInboxMessages(true);
}

els.closeMailModalBtn.addEventListener('click', () => {
  els.mailReadModal.classList.add('hidden');
});
els.closeMailModalBtn2.addEventListener('click', () => {
  els.mailReadModal.classList.add('hidden');
});
els.deleteMessageBtn.addEventListener('click', async () => {
  if (!mailState.readingMessageId) return;
  await sendMsg({
    type: 'MAIL_DELETE_MESSAGE',
    mailboxId: mailState.activeMailboxId,
    messageId: mailState.readingMessageId
  });
  els.mailReadModal.classList.add('hidden');
  showToast('پیام حذف شد.');
  refreshInboxMessages(true);
});

// ----------------------------------------------------------------------------
// Account Switcher Event Listeners
// ----------------------------------------------------------------------------

async function handleSwitchTo(accountId) {
  els.nextAccountBtn.disabled = true;
  els.prevAccountBtn.disabled = true;
  const res = await sendMsg({
    type: 'SWITCH_TO_ACCOUNT',
    tabId: state.tabId,
    accountId
  });
  if (res.ok) {
    showToast(`در حال ورود به «${res.accountName}»...`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در جابه‌جایی اکانت', true);
    await loadState();
  }
}

els.nextAccountBtn.addEventListener('click', async () => {
  els.nextAccountBtn.disabled = true;
  const res = await sendMsg({
    type: 'SWITCH_CYCLE',
    tabId: state.tabId,
    direction: 1
  });
  if (res.ok) {
    showToast(`جابه‌جایی به «${res.accountName}» انجام شد ⚡`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در جابه‌جایی', true);
    await loadState();
  }
});

els.prevAccountBtn.addEventListener('click', async () => {
  els.prevAccountBtn.disabled = true;
  const res = await sendMsg({
    type: 'SWITCH_CYCLE',
    tabId: state.tabId,
    direction: -1
  });
  if (res.ok) {
    showToast(`بازگشت به «${res.accountName}» انجام شد`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در جابه‌جایی', true);
    await loadState();
  }
});

els.openBatchBtn.addEventListener('click', async () => {
  const countVal = els.batchCountSelect.value;
  els.openBatchBtn.disabled = true;
  const res = await sendMsg({
    type: 'OPEN_BATCH_ISOLATED_TABS',
    tabId: state.tabId,
    url: state.url,
    count: countVal
  });
  if (res.ok) {
    showToast(`در حال باز کردن همزمان ${toFa(res.openingCount)} تب مجزا... 🚀`);
    setTimeout(() => window.close(), 650);
  } else {
    els.openBatchBtn.disabled = false;
    showToast(res.error || 'خطا در باز کردن تب‌ها', true);
  }
});

async function saveCurrentAccount() {
  const name = els.accountNameInput.value.trim();
  const note = els.accountNoteInput.value.trim();
  const autoLinkActiveMail =
    Boolean(mailState.activeMailboxId) && els.chkLinkActiveMail.checked;

  els.saveCurrentBtn.disabled = true;

  const res = await sendMsg({
    type: 'SAVE_CURRENT_ACCOUNT',
    tabId: state.tabId,
    name,
    note,
    autoLinkActiveMail
  });

  els.saveCurrentBtn.disabled = false;
  if (res.ok) {
    els.accountNameInput.value = '';
    els.accountNoteInput.value = '';
    showToast(`«${res.account.name}» با موفقیت ذخیره شد ✅`);
    await loadState();
  } else {
    showToast(res.error || 'خطا در ذخیره اکانت', true);
  }
}

els.saveCurrentBtn.addEventListener('click', saveCurrentAccount);
els.accountNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveCurrentAccount();
});
els.accountNoteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveCurrentAccount();
});

els.newSessionBtn.addEventListener('click', async () => {
  els.newSessionBtn.disabled = true;
  const res = await sendMsg({
    type: 'NEW_CLEAN_SESSION',
    tabId: state.tabId
  });
  els.newSessionBtn.disabled = false;

  if (res.ok) {
    showToast('نشست پاک شد! اکنون اکانت بعدی را لاگین و ذخیره کنید.');
    await loadState();
  } else {
    showToast(res.error || 'خطا در ایجاد نشست جدید', true);
  }
});

els.searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value || '';
  renderAccountsList();
});

els.toggleSettingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});
els.closeSettingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.add('hidden');
});

async function updateSetting(patch) {
  if (!state.siteKey) return;
  const res = await sendMsg({
    type: 'UPDATE_SETTINGS',
    siteKey: state.siteKey,
    patch
  });
  if (res.ok) {
    state.settings = res.settings;
    showToast('تنظیمات ذخیره شد.');
  }
}

els.chkFloatingWidget.addEventListener('change', (e) => {
  updateSetting({ floatingWidget: e.target.checked });
});
els.chkAutoSync.addEventListener('change', (e) => {
  updateSetting({ autoSync: e.target.checked });
});
els.chkIncludeStorage.addEventListener('change', (e) => {
  updateSetting({ includeStorage: e.target.checked });
});

function downloadJson(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

els.exportSiteBtn.addEventListener('click', async () => {
  const res = await sendMsg({
    type: 'EXPORT_DATA',
    scope: 'site',
    siteKey: state.siteKey
  });
  if (res.ok) {
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(`accounts-${state.siteKey || 'site'}-${dateStr}.json`, res.backup);
    showToast('فایل بکاپ دانلود شد.');
  }
});

els.exportAllBtn.addEventListener('click', async () => {
  const res = await sendMsg({
    type: 'EXPORT_DATA',
    scope: 'all'
  });
  if (res.ok) {
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(`all-accounts-and-mails-${dateStr}.json`, res.backup);
    showToast('فایل بکاپ کامل دانلود شد.');
  }
});

els.importBtn.addEventListener('click', () => {
  els.importFileInput.value = '';
  els.importFileInput.click();
});

els.importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const res = await sendMsg({
      type: 'IMPORT_DATA',
      backup: parsed,
      mode: 'merge'
    });
    if (res.ok) {
      showToast('بکاپ اکانت‌ها و ایمیل‌ها با موفقیت بازیابی شد!');
      await loadState();
    } else {
      showToast(res.error || 'فایل نامعتبر است.', true);
    }
  } catch {
    showToast('خطا در خواندن فایل JSON.', true);
  }
});

function openEditModal(acc) {
  editingAccountId = acc.id;
  editingColor = acc.color || COLORS[0];
  els.editNameInput.value = acc.name;
  els.editNoteInput.value = acc.note || '';
  renderColorSwatches();
  els.editModal.classList.remove('hidden');
  els.editNameInput.focus();
}

function renderColorSwatches() {
  els.editColorPicker.innerHTML = '';
  COLORS.forEach((c) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === editingColor ? ' selected' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      editingColor = c;
      renderColorSwatches();
    });
    els.editColorPicker.appendChild(sw);
  });
}

els.cancelEditBtn.addEventListener('click', () => {
  editingAccountId = null;
  els.editModal.classList.add('hidden');
});

els.saveEditBtn.addEventListener('click', async () => {
  if (!editingAccountId) return;
  const name = els.editNameInput.value.trim();
  const note = els.editNoteInput.value.trim();
  if (!name) {
    showToast('نام اکانت نمی‌تواند خالی باشد.', true);
    return;
  }

  await sendMsg({
    type: 'EDIT_ACCOUNT_META',
    siteKey: state.siteKey,
    accountId: editingAccountId,
    patch: { name, note, color: editingColor }
  });

  editingAccountId = null;
  els.editModal.classList.add('hidden');
  showToast('مشخصات اکانت ویرایش شد.');
  await loadState();
});

loadState();
