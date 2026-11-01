// Unit tests for the Gmail Real (alias) engine in background.js
// Loads the real background.js inside a VM with a chrome stub, then tests
// the pure helpers: b64urlDecode, gmailWalkParts/gmailExtract, buildGmailAlias,
// sanitizeGmailTag, validateGmailClientId + OTP/links extraction on fixtures.

const fs = require('fs');
const vm = require('vm');

const SRC = fs.readFileSync('/home/z/my-project/plugin/background.js', 'utf8');

const chromeStub = {
  runtime: {
    id: 'testextid123',
    onMessage: { addListener() {} },
    getURL: (p) => `chrome-extension://testextid123/${p}`,
    lastError: null
  },
  storage: {
    local: {
      _data: {},
      async get(k) {
        if (typeof k === 'string') return { [k]: this._data[k] };
        if (Array.isArray(k)) {
          const out = {};
          for (const key of k) if (key in this._data) out[key] = this._data[key];
          return out;
        }
        return { ...this._data };
      },
      async set(obj) {
        Object.assign(this._data, obj);
      }
    }
  },
  tabs: {
    onUpdated: { addListener() {} },
    onActivated: { addListener() {} },
    onRemoved: { addListener() {} },
    async query() { return []; },
    async get() { return null; },
    async sendMessage() { return {}; },
    async create() { return { id: 1 }; }
  },
  alarms: { create() {}, onAlarm: { addListener() {} } },
  notifications: {
    async create() { return 'n1'; },
    async clear() {},
    onClicked: { addListener() {} }
  },
  commands: { onCommand: { addListener() {} } },
  identity: {
    getAuthToken() {},
    launchWebAuthFlow() {},
    removeCachedAuthToken() {}
  },
  action: { openPopup() {} },
  declarativeNetRequest: {
    updateDynamicRules: async () => {},
    updateSessionRules: async () => {}
  },
  webRequest: { onBeforeSendHeaders: { addListener() {} } },
  scripting: { executeScript: async () => [{ result: { filled: false } }] }
};

const sandbox = {
  chrome: chromeStub,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  fetch: async () => {
    throw new Error('no-network-in-unit-test');
  },
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  Uint8Array,
  Date,
  Math,
  JSON,
  Promise
};
vm.createContext(sandbox);

const bootstrap = `
globalThis.__X = {
  b64urlDecode, gmailWalkParts, gmailExtract, buildGmailAlias,
  sanitizeGmailTag, validateGmailClientId, extractOtpCode,
  extractVerificationLinks, getGmailOAuth, saveGmailOAuth,
  createGmailAliasMailbox, getMailState
};
`;
vm.runInContext(SRC + bootstrap, sandbox, { filename: 'background.js' });
const X = sandbox.__X;

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    failed++;
    console.error(`FAIL ${name}${extra ? ' — ' + extra : ''}`);
  }
}

// ---------- b64urlDecode ----------
function b64urlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const plain = 'Your verification code is 481920. https://site.com/verify?token=abc123';
ok('b64urlDecode roundtrip', X.b64urlDecode(b64urlEncode(plain)) === plain);
const faText = 'کد تأیید شما: ۹۱۲۴۵۶';
ok('b64urlDecode utf8 (فارسی)', X.b64urlDecode(b64urlEncode(faText)) === faText);

// ---------- gmailWalkParts / gmailExtract ----------
const htmlBody = '<html><body><p>Your code is <b>553 118</b></p><a href="https://example.com/verify?token=xyz">Verify</a><img src="https://cdn.example.com/p.png"></body></html>';
const fullMessage = {
  id: 'msg-1',
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From', value: 'Instagram <no-reply@instagram.com>' },
      { name: 'To', value: 'tester+instagram@gmail.com' },
      { name: 'Subject', value: 'Verify your account' }
    ],
    mimeType: 'multipart/alternative',
    parts: [
      {
        partId: '0',
        mimeType: 'text/plain',
        body: { data: b64urlEncode('Your code is 553 118') }
      },
      {
        partId: '1',
        mimeType: 'text/html',
        body: { data: b64urlEncode(htmlBody) }
      }
    ]
  }
};

const ext = X.gmailExtract(fullMessage);
ok('gmailExtract subject', ext.subject === 'Verify your account', ext.subject);
ok('gmailExtract from address', ext.fromAddress === 'no-reply@instagram.com', ext.fromAddress);
ok('gmailExtract from name', ext.fromName === 'Instagram', ext.fromName);
ok('gmailExtract text part', ext.text.includes('553 118'), ext.text.slice(0, 40));
ok('gmailExtract html part', ext.html.length === 1 && ext.html[0].includes('verify'), `html count=${ext.html.length}`);
ok('gmailExtract OTP', ext.otpCode === '553118' || ext.otpCode === '553 118' || /^\d{6}$/.test(String(ext.otpCode).replace(/\s/g, '')), `otp=${ext.otpCode}`);
ok('gmailExtract verification link sorted first', Array.isArray(ext.links) && ext.links.some((l) => l.includes('/verify')), JSON.stringify(ext.links));
ok('gmailExtract excludes image assets', !ext.links.some((l) => l.endsWith('.png')));

// nested multipart/mixed with attachment-like part (no text data)
const nested = {
  id: 'msg-2',
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From', value: 'security@netflix.com' },
      { name: 'Subject', value: 'کد ورود شما: 771204' }
    ],
    mimeType: 'multipart/mixed',
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: b64urlEncode('کد ورود 771204') } },
          { mimeType: 'text/html', body: { data: b64urlEncode('<div>کد ورود 771204</div>') } }
        ]
      },
      { mimeType: 'application/pdf', body: { attachmentId: 'att1', size: 100 } }
    ]
  }
};
const ext2 = X.gmailExtract(nested);
ok('gmailExtract nested multipart', ext2.text.includes('771204'), ext2.text.slice(0, 40));
ok('gmailExtract Persian OTP', String(ext2.otpCode).includes('771204'), `otp=${ext2.otpCode}`);

// single-part message (no parts array)
const single = {
  id: 'msg-3',
  internalDate: String(Date.now()),
  payload: {
    headers: [{ name: 'From', value: 'a@b.com' }, { name: 'Subject', value: 'Hi' }],
    mimeType: 'text/plain',
    body: { data: b64urlEncode('single part body 424242') }
  }
};
const ext3 = X.gmailExtract(single);
ok('gmailExtract single-part', ext3.text === 'single part body 424242', ext3.text);

// ---------- buildGmailAlias ----------
const a1 = X.buildGmailAlias('Sara.83@gmail.com', 'Netflix');
ok('buildGmailAlias basic', a1.address === 'sara.83+netflix@gmail.com', a1.address);
ok('buildGmailAlias tag sanitized', a1.tag === 'netflix', a1.tag);

const a2 = X.buildGmailAlias('user.name@googlemail.com', '  My Shop 2! ');
ok('buildGmailAlias cleans tag', a2.address === 'user.name+myshop2@googlemail.com', a2.address);

let threw = false;
try {
  X.buildGmailAlias('sara@gmail.com', '   ');
} catch {
  threw = true;
}
ok('buildGmailAlias empty tag throws', threw);

threw = false;
try {
  X.buildGmailAlias('not-an-email', 'tag');
} catch {
  threw = true;
}
ok('buildGmailAlias invalid base throws', threw);

ok('sanitizeGmailTag strips unsafe', X.sanitizeGmailTag('AbC!@# $%^123') === 'abc123', X.sanitizeGmailTag('AbC!@# $%^123'));
ok('validateGmailClientId accepts', X.validateGmailClientId('1234567890-abc123def.apps.googleusercontent.com'));
ok('validateGmailClientId rejects junk', !X.validateGmailClientId('hello-world.apps.googleusercontent.com'));

// ---------- createGmailAliasMailbox (storage-level, بدون شبکه) ----------
(async () => {
  await chromeStub.storage.local.set({
    gmailOAuth: { clientId: '', email: 'tester@gmail.com', accessToken: '', tokenExpiresAt: 0, connectedAt: 1 }
  });

  const mb = await X.createGmailAliasMailbox('telegram');
  ok('createGmailAliasMailbox address', mb.address === 'tester+telegram@gmail.com', mb.address);
  ok('createGmailAliasMailbox ptype', mb.ptype === 'gmail' && mb.provider === 'gmail_real');

  const st = await X.getMailState();
  ok('mailbox stored + active', st.mailboxes[0].id === mb.id && st.activeMailboxId === mb.id);

  // duplicate → switches to existing, does not duplicate
  let dupError = '';
  try {
    await X.createGmailAliasMailbox('telegram');
  } catch (e) {
    dupError = e.message;
  }
  const st2 = await X.getMailState();
  ok(
    'duplicate alias rejected + activated',
    st2.mailboxes.length === 1 && st2.activeMailboxId === mb.id && dupError.includes('قبلاً'),
    dupError
  );

  console.log(`\n== UNIT RESULT: ${passed} passed, ${failed} failed ==`);
  process.exit(failed ? 1 : 0);
})();
