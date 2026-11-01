// E2E v3.4 — «جیمیل من (الیاس)» feature:
//  Part A: popup UI flow with stubbed background (chip → wizard → connect → alias → inbox → OTP → new-tab link)
//  Part B: REAL background router (GMAIL_GET_STATUS / alias create via storage / error paths / manifest)
//  Screenshots → /tmp/render → copied to download/

const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const EXT = '/home/z/my-project/plugin';
const SHOT_DIR = '/tmp/render';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function ok(name, extra = '') {
  results.push(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
}
function fail(name, extra = '') {
  results.push(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
  console.error(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
}
function warn(name, extra = '') {
  results.push(`WARN ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`WARN ${name}${extra ? ' — ' + extra : ''}`);
}

const MSG1 = {
  id: 'gm1',
  fromAddress: 'no-reply@whatsapp.com',
  fromName: 'WhatsApp',
  subject: 'Your WhatsApp code is 123-456',
  intro: 'Two-step verification code',
  seen: false,
  createdAt: new Date(Date.now() - 60000).toISOString(),
  otpCode: '123456'
};
const MSG2 = {
  id: 'gm2',
  fromAddress: 'no-reply@linkedin.com',
  fromName: 'LinkedIn',
  subject: 'Confirm your email',
  intro: 'Welcome! Please confirm your address to finish signing up.',
  seen: true,
  createdAt: new Date(Date.now() - 3600000).toISOString()
};
const READ1 = {
  id: 'gm1',
  fromAddress: 'no-reply@whatsapp.com',
  fromName: 'WhatsApp',
  subject: 'Your WhatsApp code is 123-456',
  text: 'Your WhatsApp code is 123-456. Open https://whatsapp.com/verify?token=abc123 to confirm your account.',
  html: [],
  otpCode: '123456',
  links: ['https://whatsapp.com/verify?token=abc123'],
  createdAt: MSG1.createdAt
};

(async () => {
  const context = await chromium.launchPersistentContext('/tmp/pw-gmail-profile', {
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
  if (!extId) {
    fail('extension-loaded (service worker not found)');
    await context.close();
    process.exit(1);
  }
  ok('extension-loaded', `id=${extId}`);

  // ====================================================================
  // PART A — UI flow with stubbed background
  // ====================================================================
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.addInitScript(() => {
    window.close = () => { window.__closedByPopup = true; };

    // ---- fixtures (باید داخل مرورگر تعریف شوند) ----
    const MSG1 = {
      id: 'gm1',
      fromAddress: 'no-reply@whatsapp.com',
      fromName: 'WhatsApp',
      subject: 'Your WhatsApp code is 123-456',
      intro: 'Two-step verification code',
      seen: false,
      createdAt: new Date(Date.now() - 60000).toISOString(),
      otpCode: '123456'
    };
    const MSG2 = {
      id: 'gm2',
      fromAddress: 'no-reply@linkedin.com',
      fromName: 'LinkedIn',
      subject: 'Confirm your email',
      intro: 'Welcome! Please confirm your address to finish signing up.',
      seen: true,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    };
    const READ1 = {
      id: 'gm1',
      fromAddress: 'no-reply@whatsapp.com',
      fromName: 'WhatsApp',
      subject: 'Your WhatsApp code is 123-456',
      text: 'Your WhatsApp code is 123-456. Open https://whatsapp.com/verify?token=abc123 to confirm your account.',
      html: [],
      otpCode: '123456',
      links: ['https://whatsapp.com/verify?token=abc123'],
      createdAt: MSG1.createdAt
    };

    window.__tabCreated = [];
    chrome.tabs.create = (opts, cb) => {
      window.__tabCreated.push(opts);
      if (cb) cb({ id: 999 });
      return Promise.resolve({ id: 999 });
    };

    window.__copied = [];
    try {
      Object.defineProperty(window.Navigator.prototype, 'clipboard', {
        get() {
          return {
            writeText: (t) => { window.__copied.push(t); return Promise.resolve(); },
            readText: () => Promise.resolve(window.__copied.slice(-1)[0] || '')
          };
        },
        configurable: true
      });
    } catch (e) {}

    // ---- stateful stub of the background message router ----
    const st = {
      gmailConnected: false,
      gmailEmail: 'e2e.user@gmail.com',
      mailboxes: [],
      activeMailboxId: null,
      aliasCreated: null
    };
    window.__mailStub = st;

    chrome.runtime.sendMessage = function (payload, cb) {
      const respond = (data) => setTimeout(() => cb && cb(data), 0);
      const t = payload?.type;
      switch (t) {
        case 'GET_SITE_STATE':
          return respond({ ok: true, supported: false });
        case 'MAIL_GET_STATE':
          return respond({
            ok: true,
            activeMailboxId: st.activeMailboxId,
            mailboxes: st.mailboxes
          });
        case 'GMAIL_GET_STATUS':
          return respond({
            ok: true,
            connected: st.gmailConnected,
            email: st.gmailConnected ? st.gmailEmail : '',
            clientId: st.gmailConnected ? '111-x.apps.googleusercontent.com' : '',
            extensionId: 'stubextid0000000000000000000000000',
            redirectUri: 'https://stubextid0000000000000000000000000.chromiumapp.org/'
          });
        case 'GMAIL_CONNECT':
          st.gmailConnected = true;
          return respond({
            ok: true,
            email: st.gmailEmail,
            connected: true,
            clientId: payload.clientId,
            extensionId: 'stubextid0000000000000000000000000',
            redirectUri: 'https://stubextid0000000000000000000000000.chromiumapp.org/'
          });
        case 'GMAIL_DISCONNECT':
          st.gmailConnected = false;
          return respond({ ok: true, connected: false });
        case 'MAIL_CREATE_INBOX': {
          if (payload.provider === 'gmail_real') {
            const addr = `e2e.user+${payload.customUser || 'x'}@gmail.com`;
            const mb = {
              id: 'mbg1',
              provider: 'gmail_real',
              ptype: 'gmail',
              address: addr,
              tag: payload.customUser || 'x',
              createdAt: Date.now()
            };
            st.aliasCreated = mb;
            st.mailboxes.unshift(mb);
            st.activeMailboxId = mb.id;
            return respond({
              ok: true,
              mailbox: mb,
              activeMailboxId: st.activeMailboxId,
              mailboxes: st.mailboxes
            });
          }
          return respond({ ok: false, error: 'stub: only gmail_real' });
        }
        case 'MAIL_LIST_MESSAGES':
          if (payload.mailboxId === 'mbg1') return respond({ ok: true, messages: [MSG1, MSG2] });
          return respond({ ok: true, messages: [] });
        case 'MAIL_READ_MESSAGE':
          return respond({ ok: true, canDelete: false, message: READ1 });
        case 'MAIL_FILL_IN_PAGE':
          return respond({ ok: false, error: 'stub: no page' });
        case 'GET_NOTIF_PREFS':
          return respond({ ok: true, notifPrefs: { enabled: true } });
        default:
          return respond({ ok: false, error: 'stub default' });
      }
    };
  });

  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.waitForTimeout(500);

  // go to mail tab
  await page.click('#tabMailBtn');
  await page.waitForTimeout(300);

  // 1) gmail chip exists with SVG (no emoji)
  const chipInfo = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#mailServiceChips .im-chip')];
    const first = chips[0];
    return {
      count: chips.length,
      firstLabel: first?.textContent.trim() || '',
      firstHasSvg: Boolean(first?.querySelector('svg')),
      firstSelected: first?.classList.contains('selected')
    };
  });
  if (chipInfo.count === 6 && chipInfo.firstHasSvg) {
    ok('gmail chip first + SVG icon', chipInfo.firstLabel);
  } else {
    fail('gmail chip first + SVG icon', JSON.stringify(chipInfo));
  }

  // 2) select gmail provider → connect box, no group tabs / domain grid
  await page.click('#mailServiceChips .im-chip:first-child');
  await page.waitForTimeout(400);
  const boxState = await page.evaluate(() => ({
    aliasBoxVisible: !document.getElementById('gmailAliasBox').classList.contains('hidden'),
    connectBoxVisible: !document.getElementById('gmailConnectBox').classList.contains('hidden'),
    connectedBoxHidden: document.getElementById('gmailConnectedBox').classList.contains('hidden'),
    groupTabsHidden: document.getElementById('imGroupTabsBox').classList.contains('hidden'),
    domainGridHidden: document.getElementById('imDomainGrid').classList.contains('hidden'),
    createLabel: document.getElementById('createMailBtn').textContent.trim()
  }));
  if (
    boxState.aliasBoxVisible &&
    boxState.connectBoxVisible &&
    boxState.connectedBoxHidden &&
    boxState.groupTabsHidden &&
    boxState.domainGridHidden
  ) {
    ok('disconnected state renders connect box', `createBtn="${boxState.createLabel}"`);
  } else {
    fail('disconnected state renders connect box', JSON.stringify(boxState));
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'gmail-1-disconnected.png') });

  // 3) wizard opens with extension id + redirect uri + copy works
  await page.click('#openGmailWizardBtn');
  await page.waitForTimeout(250);
  const wiz = await page.evaluate(async () => {
    const modal = document.getElementById('gmailWizardModal');
    const extId = document.getElementById('gwExtId').textContent.trim();
    const redirect = document.getElementById('gwRedirect').textContent.trim();
    document.getElementById('gwCopyExtIdBtn').click();
    await new Promise((r) => setTimeout(r, 120));
    const copied = await navigator.clipboard.readText();
    const buttons = {
      console: !document.getElementById('gwOpenConsoleBtn').disabled,
      api: !document.getElementById('gwOpenApiBtn').disabled
    };
    return {
      visible: !modal.classList.contains('hidden'),
      extId,
      redirect,
      copied,
      steps: document.querySelectorAll('.gw-steps > li').length,
      buttons
    };
  });
  if (
    wiz.visible &&
    wiz.extId === 'stubextid0000000000000000000000000' &&
    wiz.redirect.includes('.chromiumapp.org') &&
    wiz.copied === wiz.extId &&
    wiz.steps === 5
  ) {
    ok('wizard shows ext id + redirect + copy', `steps=${wiz.steps}`);
  } else {
    fail('wizard shows ext id + redirect + copy', JSON.stringify(wiz));
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'gmail-2-wizard.png') });

  // 4) connect with client id → connected box with email
  await page.fill('#gwClientIdInput', '1234567890-abc123.apps.googleusercontent.com');
  await page.click('#gwConnectBtn');
  await page.waitForTimeout(450);
  const conn = await page.evaluate(() => ({
    wizardClosed: document.getElementById('gmailWizardModal').classList.contains('hidden'),
    connectedVisible: !document.getElementById('gmailConnectedBox').classList.contains('hidden'),
    connectBoxHidden: document.getElementById('gmailConnectBox').classList.contains('hidden'),
    email: document.getElementById('gmailStatusEmail').textContent.trim(),
    previewLocal: document.getElementById('gmailAliasPreviewLocal').textContent.trim()
  }));
  if (conn.wizardClosed && conn.connectedVisible && conn.email === 'e2e.user@gmail.com' && conn.previewLocal === 'e2e.user') {
    ok('connect flow shows connected account', conn.email);
  } else {
    fail('connect flow shows connected account', JSON.stringify(conn));
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'gmail-3-connected.png') });

  // 5) create alias → active mailbox card + updated meta
  await page.fill('#gmailTagInput', 'netflix');
  await page.click('#createMailBtn');
  await page.waitForTimeout(500);
  const created = await page.evaluate(() => ({
    address: document.getElementById('currentEmailText').textContent.trim(),
    meta: document.getElementById('activeMailMeta').textContent.trim(),
    historyFirst: document.getElementById('mailboxHistorySelect').options[0]?.textContent || '',
    tagCleared: document.getElementById('gmailTagInput').value === '',
    toast: document.getElementById('toast').textContent
  }));
  if (created.address === 'e2e.user+netflix@gmail.com' && created.meta.includes('واقعی')) {
    ok('alias created + gmail meta text', `${created.address} | history="${created.historyFirst}"`);
  } else {
    fail('alias created + gmail meta text', JSON.stringify(created));
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'gmail-4-alias-inbox.png') });

  // 6) inbox messages with OTP button
  await page.waitForSelector('#messagesList .msg-item', { timeout: 6000 });
  await page.waitForTimeout(300);
  const inbox = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#messagesList .msg-item')];
    return {
      count: items.length,
      firstSubject: items[0]?.querySelector('.msg-subject')?.textContent.trim() || '',
      otpBtn: items[0]?.querySelector('.msg-otp-btn')?.textContent.trim() || ''
    };
  });
  if (inbox.count === 2 && inbox.otpBtn.includes('123456')) {
    ok('gmail inbox renders 2 messages + OTP button', inbox.firstSubject);
  } else {
    fail('gmail inbox renders 2 messages + OTP button', JSON.stringify(inbox));
  }

  // 7) open modal → OTP banner + verify link → opens NEW TAB
  await page.click('#messagesList .msg-item:first-child');
  await page.waitForTimeout(400);
  const modalState = await page.evaluate(() => ({
    open: !document.getElementById('mailReadModal').classList.contains('hidden'),
    otpVisible: !document.getElementById('mailModalOtpBox').classList.contains('hidden'),
    otp: document.getElementById('mailModalOtpCode').textContent.trim(),
    linkBtns: document.querySelectorAll('#mailModalLinks .verify-link-btn').length,
    deleteHidden: document.getElementById('deleteMessageBtn').classList.contains('hidden'),
    from: document.getElementById('mailModalFrom').textContent
  }));
  if (modalState.open && modalState.otpVisible && modalState.otp === '123456' && modalState.linkBtns === 1 && modalState.deleteHidden) {
    ok('read modal: OTP banner + verify link + no delete for gmail', modalState.from);
  } else {
    fail('read modal: OTP banner + verify link + no delete for gmail', JSON.stringify(modalState));
  }

  await page.click('#mailModalLinks .verify-link-btn');
  await page.waitForTimeout(300);
  const linkClick = await page.evaluate(() => ({
    created: window.__tabCreated,
    closedByPopup: window.__closedByPopup === true
  }));
  if (
    linkClick.created.length === 1 &&
    linkClick.created[0].url === 'https://whatsapp.com/verify?token=abc123' &&
    linkClick.created[0].active !== false
  ) {
    ok('verify link opens in NEW TAB (not current)', JSON.stringify(linkClick.created[0]));
  } else {
    fail('verify link opens in NEW TAB (not current)', JSON.stringify(linkClick));
  }

  // 8) copy OTP from modal
  await page.click('#copyModalOtpBtn');
  await page.waitForTimeout(250);
  const copiedOtp = await page.evaluate(async () => {
    const c = await navigator.clipboard.readText();
    return c;
  });
  if (copiedOtp === '123456') ok('OTP copy works', copiedOtp);
  else fail('OTP copy works', copiedOtp);

  await page.screenshot({ path: path.join(SHOT_DIR, 'gmail-5-message-modal.png') });

  // 9) no raw emojis anywhere in mail view
  const emojiCheck = await page.evaluate(() => {
    const el = document.getElementById('mailView');
    const text = el.innerText + el.innerHTML;
    const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    return { clean: !re.test(text) };
  });
  if (emojiCheck.clean) ok('mail view emoji-free');
  else fail('mail view emoji-free');

  if (pageErrors.length) {
    warn('popup page errors', pageErrors.slice(0, 3).join(' | '));
  } else {
    ok('popup has zero page errors');
  }

  await page.close();

  // ====================================================================
  // PART B — REAL background router
  // ====================================================================
  const page2 = await context.newPage();
  await page2.goto(`chrome-extension://${extId}/popup.html`);
  await page2.waitForTimeout(400);

  const call = (msg) =>
    page2.evaluate((m) => new Promise((res) => chrome.runtime.sendMessage(m, (r) => res(r))), msg);

  // manifest: version + identity permission
  const manifest = await page2.evaluate(() => chrome.runtime.getManifest());
  if (manifest.version === '3.4.0' && manifest.permissions.includes('identity')) {
    ok('manifest v3.4.0 + identity permission');
  } else {
    fail('manifest v3.4.0 + identity permission', JSON.stringify({ v: manifest.version, p: manifest.permissions }));
  }

  // real status (disconnected)
  const status = await call({ type: 'GMAIL_GET_STATUS' });
  if (status?.ok && status.connected === false && status.extensionId === extId && status.redirectUri === `https://${extId}.chromiumapp.org/`) {
    ok('REAL GMAIL_GET_STATUS (disconnected)', status.redirectUri);
  } else {
    fail('REAL GMAIL_GET_STATUS (disconnected)', JSON.stringify(status));
  }

  // invalid client id → friendly error, no network
  const badConnect = await call({ type: 'GMAIL_CONNECT', clientId: 'not-a-valid-client-id' });
  if (!badConnect?.ok && /Client ID/.test(badConnect?.error || '')) {
    ok('REAL GMAIL_CONNECT rejects invalid clientId', badConnect.error);
  } else {
    fail('REAL GMAIL_CONNECT rejects invalid clientId', JSON.stringify(badConnect));
  }

  // seed oauth email (offline path) → alias creation through the REAL router
  await page2.evaluate(() =>
    chrome.storage.local.set({
      gmailOAuth: {
        clientId: '',
        email: 'e2e.real@gmail.com',
        accessToken: '',
        tokenExpiresAt: 0,
        connectedAt: Date.now()
      }
    })
  );
  const realStatus = await call({ type: 'GMAIL_GET_STATUS' });
  if (realStatus?.ok && realStatus.connected && realStatus.email === 'e2e.real@gmail.com') {
    ok('REAL status connected after seeding', realStatus.email);
  } else {
    fail('REAL status connected after seeding', JSON.stringify(realStatus));
  }

  const realCreate = await call({ type: 'MAIL_CREATE_INBOX', provider: 'gmail_real', customUser: 'E2E-Tag 7!' });
  if (
    realCreate?.ok &&
    realCreate.mailbox.address === 'e2e.real+e2e-tag7@gmail.com' &&
    realCreate.mailbox.ptype === 'gmail'
  ) {
    ok('REAL alias create via router', realCreate.mailbox.address);
  } else {
    fail('REAL alias create via router', JSON.stringify(realCreate));
  }

  const realState = await call({ type: 'MAIL_GET_STATE' });
  const mbInfo = realState?.mailboxes?.[0];
  if (realState?.ok && mbInfo?.provider === 'gmail_real' && mbInfo?.ptype === 'gmail' && mbInfo?.tag === 'e2e-tag7') {
    ok('REAL MAIL_GET_STATE exposes alias mailbox', JSON.stringify(mbInfo));
  } else {
    fail('REAL MAIL_GET_STATE exposes alias mailbox', JSON.stringify(realState));
  }

  // inbox list without network/token → graceful Persian error (no crash)
  const realList = await call({ type: 'MAIL_LIST_MESSAGES', mailboxId: mbInfo.id });
  if (realList && realList.ok === false && typeof realList.error === 'string' && realList.error.length > 5) {
    ok('REAL inbox error is graceful', realList.error.slice(0, 60));
  } else {
    warn('REAL inbox error is graceful', JSON.stringify(realList));
  }

  // delete-message guard for gmail
  const realDel = await call({ type: 'MAIL_DELETE_MESSAGE', mailboxId: mbInfo.id, messageId: 'x' });
  if (realDel && realDel.ok === false && /جیمیل/.test(realDel.error || '')) {
    ok('REAL delete guarded for real Gmail', realDel.error);
  } else {
    fail('REAL delete guarded for real Gmail', JSON.stringify(realDel));
  }

  // disconnect clears email but keeps mailboxes
  const realDisc = await call({ type: 'GMAIL_DISCONNECT' });
  const afterDisc = await call({ type: 'MAIL_GET_STATE' });
  if (realDisc?.ok && afterDisc?.mailboxes?.length === 1) {
    ok('REAL disconnect keeps created mailboxes');
  } else {
    fail('REAL disconnect keeps created mailboxes', JSON.stringify(afterDisc));
  }

  await page2.close();
  await context.close();

  console.log('\n===== E2E SUMMARY =====');
  const passCount = results.filter((r) => r.startsWith('PASS')).length;
  const failCount = results.filter((r) => r.startsWith('FAIL')).length;
  for (const r of results) console.log(r);
  console.log(`===== ${passCount} passed, ${failCount} failed =====`);
  process.exit(failCount ? 1 : 0);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
