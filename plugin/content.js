// ============================================================================
// AI Multi-Account Switcher - Isolated On-Page Floating Quick Switcher
// ============================================================================

(() => {
  if (window.top !== window.self) return;

  let hostEl = null;
  let shadow = null;
  let currentState = null;
  let dropdownOpen = false;
  let isBusy = false;

  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  function toFa(n) {
    return String(n).replace(/\d/g, (d) => persianDigits[Number(d)]);
  }

  function sendMsg(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false });
            return;
          }
          resolve(res || { ok: false });
        });
      } catch {
        resolve({ ok: false });
      }
    });
  }

  // Forward storage & JS-cookie sync events from MAIN-world isolated-preload.js
  window.addEventListener('__ai_switcher_iso_sync__', (e) => {
    const detail = e?.detail;
    if (detail?.siteKey && detail?.accountId) {
      sendMsg({
        type: 'SYNC_ISOLATED_STORAGE',
        siteKey: detail.siteKey,
        accountId: detail.accountId,
        localStorage: detail.localStorage,
        sessionStorage: detail.sessionStorage
      });
    }
  });

  window.addEventListener('__ai_switcher_js_cookie__', (e) => {
    const detail = e?.detail;
    if (detail?.siteKey && detail?.accountId && detail?.name) {
      sendMsg({
        type: 'SYNC_ISOLATED_JS_COOKIE',
        siteKey: detail.siteKey,
        accountId: detail.accountId,
        name: detail.name,
        value: detail.value,
        expired: Boolean(detail.expired)
      });
    }
  });

  function unmountWidget() {
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadow = null;
    dropdownOpen = false;
  }

  function ensureMounted() {
    if (hostEl && shadow) return;

    hostEl = document.createElement('div');
    hostEl.setAttribute('data-ai-switcher-host', '1');
    hostEl.style.all = 'initial';
    hostEl.style.position = 'fixed';
    hostEl.style.zIndex = '2147483646';
    hostEl.style.bottom = '20px';
    hostEl.style.left = '20px';
    hostEl.style.direction = 'rtl';

    shadow = hostEl.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        font-family: Tahoma, "Vazirmatn", "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      .wrap {
        position: relative;
        user-select: none;
        direction: rtl;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 999px;
        padding: 5px 8px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(99, 102, 241, 0.2);
        font-size: 12px;
        line-height: 1;
        transition: opacity 0.2s ease;
      }
      .pill.isolated {
        border-color: rgba(6, 182, 212, 0.65);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 12px rgba(6, 182, 212, 0.28);
      }
      .pill.busy {
        opacity: 0.65;
        pointer-events: none;
      }
      .drag-handle {
        cursor: grab;
        color: #64748b;
        padding: 2px 3px;
        font-size: 13px;
        letter-spacing: -2px;
      }
      .drag-handle:active {
        cursor: grabbing;
      }
      .acc-selector {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(30, 41, 59, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        padding: 5px 10px;
        cursor: pointer;
        color: #e2e8f0;
        font-size: 12px;
        max-width: 175px;
        transition: background 0.15s;
      }
      .acc-selector:hover {
        background: rgba(51, 65, 85, 0.95);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .acc-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      .acc-count {
        color: #94a3b8;
        font-size: 11px;
        flex-shrink: 0;
      }
      .btn {
        border: none;
        outline: none;
        cursor: pointer;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11.5px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: transform 0.1s, filter 0.15s, background 0.15s;
        color: #fff;
      }
      .btn:active {
        transform: scale(0.95);
      }
      .btn-next {
        background: linear-gradient(135deg, #6366f1, #06b6d4);
        box-shadow: 0 2px 10px rgba(99, 102, 241, 0.4);
      }
      .btn-next:hover {
        filter: brightness(1.1);
      }
      .btn-iso {
        background: rgba(6, 182, 212, 0.2);
        border: 1px solid rgba(6, 182, 212, 0.5);
        color: #67e8f9;
      }
      .btn-iso:hover {
        background: rgba(6, 182, 212, 0.35);
        color: #fff;
      }
      .btn-save {
        background: linear-gradient(135deg, #10b981, #059669);
        box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
      }
      .btn-icon {
        background: rgba(51, 65, 85, 0.7);
        color: #cbd5e1;
        padding: 5px 8px;
        font-weight: 600;
      }
      .btn-icon:hover {
        background: rgba(71, 85, 105, 0.95);
        color: #fff;
      }
      .mini-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f46e5, #06b6d4);
        color: #fff;
        border: 2px solid rgba(255,255,255,0.25);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-weight: 700;
        font-size: 12px;
        position: relative;
      }
      .mini-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #0f172a;
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.5);
        border-radius: 999px;
        padding: 1px 5px;
        font-size: 10px;
      }
      .dropdown {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 0;
        width: 265px;
        max-height: 280px;
        overflow-y: auto;
        background: rgba(15, 23, 42, 0.97);
        backdrop-filter: blur(14px);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 14px;
        padding: 6px;
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.55);
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .dd-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .dd-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 9px;
        border-radius: 9px;
        cursor: pointer;
        color: #cbd5e1;
        font-size: 12px;
        border: none;
        background: transparent;
        text-align: right;
        flex: 1;
        min-width: 0;
      }
      .dd-item:hover {
        background: rgba(51, 65, 85, 0.75);
        color: #fff;
      }
      .dd-item.active {
        background: rgba(99, 102, 241, 0.22);
        color: #fff;
        border: 1px solid rgba(99, 102, 241, 0.45);
      }
      .dd-open-tab {
        border: 1px solid rgba(6, 182, 212, 0.35);
        background: rgba(6, 182, 212, 0.12);
        color: #67e8f9;
        border-radius: 8px;
        padding: 5px 7px;
        cursor: pointer;
        font-size: 11px;
        flex-shrink: 0;
      }
      .dd-open-tab:hover {
        background: rgba(6, 182, 212, 0.3);
        color: #fff;
      }
      .dd-left {
        display: flex;
        align-items: center;
        gap: 7px;
        overflow: hidden;
      }
      .dd-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dd-new {
        margin-top: 4px;
        border-top: 1px solid rgba(148, 163, 184, 0.15);
        padding-top: 6px;
        color: #38bdf8;
        font-weight: 600;
        justify-content: center;
      }
    `;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'wrap';
    container.id = 'root';
    shadow.appendChild(container);

    (document.body || document.documentElement).appendChild(hostEl);
    setupDrag();
  }

  function applyPosition(widgetPos) {
    if (!hostEl || !widgetPos) return;
    const maxLeft = Math.max(10, window.innerWidth - 80);
    const maxBottom = Math.max(10, window.innerHeight - 60);
    const left = Math.min(Math.max(10, Number(widgetPos.left ?? 20)), maxLeft);
    const bottom = Math.min(Math.max(10, Number(widgetPos.bottom ?? 20)), maxBottom);
    hostEl.style.left = `${left}px`;
    hostEl.style.bottom = `${bottom}px`;
  }

  function setupDrag() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 20;
    let origBottom = 20;

    shadow.addEventListener('mousedown', (e) => {
      const handle = e.target.closest?.('[data-drag="1"]');
      if (!handle) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(hostEl.style.left || '20', 10);
      origBottom = parseInt(hostEl.style.bottom || '20', 10);
      e.preventDefault();
    });

    window.addEventListener(
      'mousemove',
      (e) => {
        if (!dragging || !hostEl) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.min(Math.max(8, origLeft + dx), window.innerWidth - 70);
        const newBottom = Math.min(Math.max(8, origBottom - dy), window.innerHeight - 50);
        hostEl.style.left = `${newLeft}px`;
        hostEl.style.bottom = `${newBottom}px`;
      },
      { passive: true }
    );

    window.addEventListener('mouseup', () => {
      if (!dragging || !hostEl) return;
      dragging = false;
      const left = parseInt(hostEl.style.left || '20', 10);
      const bottom = parseInt(hostEl.style.bottom || '20', 10);
      sendMsg({
        type: 'SAVE_WIDGET_STATE',
        widgetPos: { left, bottom }
      });
    });
  }

  function render() {
    if (
      !currentState ||
      !currentState.supported ||
      !Array.isArray(currentState.accounts) ||
      currentState.accounts.length === 0 ||
      currentState.settings?.floatingWidget === false
    ) {
      unmountWidget();
      return;
    }

    ensureMounted();
    applyPosition(currentState.widgetPos);

    const root = shadow.getElementById('root');
    if (!root) return;
    root.innerHTML = '';

    const accounts = currentState.accounts;
    const isIso = Boolean(currentState.isIsolatedTab);
    const effectiveId = isIso ? currentState.isolatedAccountId : currentState.activeAccountId;
    const activeIdx = accounts.findIndex((a) => a.id === effectiveId);
    const activeAcc = activeIdx >= 0 ? accounts[activeIdx] : null;
    const minimized = Boolean(currentState.widgetPos?.minimized);

    if (minimized) {
      const mini = document.createElement('button');
      mini.className = 'mini-btn';
      mini.title = 'کلیک برای باز شدن نوار اکانت‌ها';
      mini.textContent = isIso ? '🔒' : '⚡';

      const badge = document.createElement('span');
      badge.className = 'mini-badge';
      badge.textContent = activeIdx >= 0 ? toFa(activeIdx + 1) : '+';
      mini.appendChild(badge);

      mini.addEventListener('click', async () => {
        currentState.widgetPos = { ...(currentState.widgetPos || {}), minimized: false };
        await sendMsg({ type: 'SAVE_WIDGET_STATE', widgetPos: { minimized: false } });
        render();
      });

      root.appendChild(mini);
      return;
    }

    if (dropdownOpen) {
      const dd = document.createElement('div');
      dd.className = 'dropdown';

      accounts.forEach((acc, i) => {
        const row = document.createElement('div');
        row.className = 'dd-row';

        const item = document.createElement('button');
        item.className = 'dd-item' + (acc.id === effectiveId ? ' active' : '');

        const leftBox = document.createElement('div');
        leftBox.className = 'dd-left';

        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = acc.color || '#6366f1';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'dd-name';
        nameSpan.textContent = `${toFa(i + 1)}. ${acc.name}`;

        leftBox.appendChild(dot);
        leftBox.appendChild(nameSpan);
        item.appendChild(leftBox);

        item.addEventListener('click', async () => {
          if (acc.id === effectiveId) {
            dropdownOpen = false;
            render();
            return;
          }
          isBusy = true;
          dropdownOpen = false;
          render();
          await sendMsg({ type: 'SWITCH_TO_ACCOUNT', accountId: acc.id });
        });

        const isoBtn = document.createElement('button');
        isoBtn.className = 'dd-open-tab';
        isoBtn.title = `باز کردن «${acc.name}» در تب مجزای همزمان`;
        isoBtn.textContent = '🗗 تب';
        isoBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          dropdownOpen = false;
          render();
          await sendMsg({
            type: 'OPEN_ISOLATED_TAB',
            url: window.location.href,
            accountId: acc.id,
            focusIfOpen: true
          });
        });

        row.appendChild(item);
        row.appendChild(isoBtn);
        dd.appendChild(row);
      });

      const newBtn = document.createElement('button');
      newBtn.className = 'dd-item dd-new';
      newBtn.textContent = '➕ نشست جدید (افزودن اکانت)';
      newBtn.addEventListener('click', async () => {
        isBusy = true;
        dropdownOpen = false;
        render();
        await sendMsg({ type: 'NEW_CLEAN_SESSION' });
      });
      dd.appendChild(newBtn);

      root.appendChild(dd);
    }

    const pill = document.createElement('div');
    pill.className = 'pill' + (isIso ? ' isolated' : '') + (isBusy ? ' busy' : '');

    const drag = document.createElement('span');
    drag.className = 'drag-handle';
    drag.setAttribute('data-drag', '1');
    drag.title = 'جابه‌جایی دکمه شناور';
    drag.textContent = '⋮⋮';
    pill.appendChild(drag);

    const selector = document.createElement('button');
    selector.className = 'acc-selector';
    selector.title = isIso
      ? 'این تب به‌صورت ایزوله و همزمان باز شده است'
      : 'مشاهده لیست اکانت‌ها';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = activeAcc ? activeAcc.color || '#10b981' : '#94a3b8';

    const label = document.createElement('span');
    label.className = 'acc-label';
    label.textContent = activeAcc
      ? `${isIso ? '🔒 ' : ''}${activeAcc.name}`
      : 'نشست جدید';

    const count = document.createElement('span');
    count.className = 'acc-count';
    count.textContent =
      activeIdx >= 0
        ? `(${toFa(activeIdx + 1)}/${toFa(accounts.length)})`
        : `(${toFa(accounts.length)})`;

    selector.appendChild(dot);
    selector.appendChild(label);
    selector.appendChild(count);
    selector.addEventListener('click', () => {
      dropdownOpen = !dropdownOpen;
      render();
    });
    pill.appendChild(selector);

    if (!activeAcc && !isIso) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-save';
      saveBtn.textContent = `💾 ذخیره اکانت ${toFa(accounts.length + 1)}`;
      saveBtn.addEventListener('click', async () => {
        isBusy = true;
        render();
        await sendMsg({ type: 'SAVE_CURRENT_ACCOUNT' });
        isBusy = false;
        await refreshState();
      });
      pill.appendChild(saveBtn);
    }

    if (!isIso) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-next';
      nextBtn.title = 'سوییچ در همین تب به اکانت بعدی (Alt+Shift+S)';
      nextBtn.textContent = '⚡ بعدی';
      nextBtn.addEventListener('click', async () => {
        isBusy = true;
        dropdownOpen = false;
        render();
        const res = await sendMsg({ type: 'SWITCH_CYCLE', direction: 1 });
        if (!res?.ok) {
          isBusy = false;
          render();
        }
      });
      pill.appendChild(nextBtn);
    }

    // Open Next Account in Simultaneous Isolated Tab!
    const openIsoBtn = document.createElement('button');
    openIsoBtn.className = 'btn btn-iso';
    openIsoBtn.title = 'باز کردن اکانت بعدی در تب جدید به‌صورت همزمان و ایزوله';
    openIsoBtn.textContent = '🗗 +تب همزمان';
    openIsoBtn.addEventListener('click', async () => {
      dropdownOpen = false;
      await sendMsg({
        type: 'OPEN_NEXT_ISOLATED_TAB',
        url: window.location.href
      });
      await refreshState();
    });
    pill.appendChild(openIsoBtn);

    const minBtn = document.createElement('button');
    minBtn.className = 'btn btn-icon';
    minBtn.title = 'کوچک کردن';
    minBtn.textContent = '—';
    minBtn.addEventListener('click', async () => {
      dropdownOpen = false;
      currentState.widgetPos = { ...(currentState.widgetPos || {}), minimized: true };
      await sendMsg({ type: 'SAVE_WIDGET_STATE', widgetPos: { minimized: true } });
      render();
    });
    pill.appendChild(minBtn);

    root.appendChild(pill);
  }

  async function refreshState() {
    const res = await sendMsg({
      type: 'GET_SITE_STATE',
      url: window.location.href
    });
    if (res && res.ok) {
      currentState = res;
      render();
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'REFRESH_WIDGET') {
      isBusy = false;
      refreshState();
    }
  });

  refreshState();
})();
