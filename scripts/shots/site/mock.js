// Screenshot harness: mocks chrome.* APIs with realistic demo data.
// Injected BEFORE popup.js in the copied popup.html (see patch).
(function () {
  const NOW = Date.now();
  const MIN = 60_000;

  const store = {
    listPref: { label: '', sort: 'recent' },
    mailUiPref: { provider: 'hd', group: 'domain', domain: 'tempmail.edu.pl' }
  };

  const accounts = [
    {
      id: 'acc1', name: 'نیکی مین', note: 'nikzadcr@gmail.com', email: 'nikzadcr@gmail.com',
      color: '#6366f1', labels: ['کاری'], pinned: true, createdAt: NOW - 40 * 864e5,
      updatedAt: NOW - 9 * MIN, lastUsedAt: NOW - 9 * MIN, useCount: 21, cookieCount: 14,
      storageCount: 6
    },
    {
      id: 'acc2', name: 'شاپ اینستا', note: 'پیج فروشگاه — اکانت دوم', email: '',
      color: '#10b981', labels: ['کاری', 'شخصی'], pinned: true, createdAt: NOW - 33 * 864e5,
      updatedAt: NOW - 3 * 36e5, lastUsedAt: NOW - 3 * 36e5, useCount: 17, cookieCount: 11,
      storageCount: 4
    },
    {
      id: 'acc3', name: 'تست نت‌فلیکس', note: 'نیک‌زاد + نت‌فلیکس', email: 'nikzadcr+netflix@gmail.com',
      color: '#f59e0b', labels: ['آزمایشی'], pinned: false, createdAt: NOW - 12 * 864e5,
      updatedAt: NOW - 26 * 36e5, lastUsedAt: NOW - 26 * 36e5, useCount: 9, cookieCount: 8,
      storageCount: 2
    },
    {
      id: 'acc4', name: 'پیج شخصی', note: 'اکانت خصوصی خودم', email: '',
      color: '#ec4899', labels: ['شخصی'], pinned: false, createdAt: NOW - 60 * 864e5,
      updatedAt: NOW - 2 * 864e5, lastUsedAt: NOW - 2 * 864e5, useCount: 34, cookieCount: 16,
      storageCount: 7
    },
    {
      id: 'acc5', name: 'ورک‌شاپ سایت', note: 'ثبت‌نام وبینار', email: '',
      color: '#06b6d4', labels: ['کاری'], pinned: false, createdAt: NOW - 5 * 864e5,
      updatedAt: NOW - 30 * MIN, lastUsedAt: NOW - 30 * MIN, useCount: 6, cookieCount: 5,
      storageCount: 1
    },
    {
      id: 'acc6', name: 'اکانت ۷', note: '', email: '',
      color: '#8b5cf6', labels: [], pinned: false, createdAt: NOW - 864e5,
      updatedAt: NOW - 864e5, lastUsedAt: NOW - 864e5, useCount: 2, cookieCount: 3,
      storageCount: 0
    }
  ];

  const mailboxes = [
    { id: 'mb1', provider: 'hd', ptype: 'hd', address: 'sara.kauf4821@tempmail.edu.pl', createdAt: NOW - 40 * MIN },
    { id: 'mb2', provider: 'hd_gmail', ptype: 'hd', address: 'mila.rivera8214@gmail.com', createdAt: NOW - 3 * 36e5 },
    { id: 'mb3', provider: 'temp-mail-io', ptype: 'io', address: 'coolbear8421@duck.com', createdAt: NOW - 26 * 36e5 }
  ];

  const messages = [
    {
      id: 'm1', subject: 'کد تأیید اینستاگرام',
      fromAddress: 'no-reply@mail.instagram.com', fromName: 'Instagram',
      intro: 'کد ورود شما: ۵۳۰-۹۴۱. این کد را با کسی به اشتراک نگذارید.',
      seen: false, otpCode: '530941', createdAt: new Date(NOW - 2 * MIN).toISOString()
    },
    {
      id: 'm2', subject: 'Welcome to Instagram, sara!',
      fromAddress: 'welcome@mail.instagram.com', fromName: 'Instagram',
      intro: 'Thanks for signing up! Get started by following a few friends.',
      seen: true, otpCode: null, createdAt: new Date(NOW - 12 * MIN).toISOString()
    },
    {
      id: 'm3', subject: 'Confirm your email address',
      fromAddress: 'verify@shopdemo.com', fromName: 'ShopDemo',
      intro: 'Tap the button below to confirm your email address.',
      seen: true, otpCode: null, createdAt: new Date(NOW - 47 * MIN).toISOString()
    }
  ];

  const fullMessage = {
    id: 'm1', subject: 'کد تأیید اینستاگرام',
    fromName: 'Instagram', fromAddress: 'no-reply@mail.instagram.com',
    createdAt: new Date(NOW - 2 * MIN).toISOString(),
    text:
      'Hi sara.kauf4821,\n\nکد ورود شما: ۵۳۰-۹۴۱\n\nاین کد را با کسی به اشتراک نگذارید. اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.\n\n— تیم اینستاگرام',
    otpCode: '530941',
    links: ['https://www.instagram.com/verify/email/?token=demo9f2k']
  };

  function siteState() {
    return {
      ok: true, supported: true, tabId: 42,
      url: 'https://www.instagram.com/', origin: 'https://www.instagram.com',
      siteKey: 'instagram.com', hostname: 'www.instagram.com',
      isGoogleUnified: false, activeAccountId: 'acc1',
      isIsolatedTab: false, isolatedAccountId: null,
      openIsolatedTabs: [{ tabId: 77, accountId: 'acc3' }],
      accounts, settings: { floatingWidget: true, autoSync: true, includeStorage: true },
      widgetPos: { side: 'right', offset: 24 }
    };
  }

  const HD_DOMAINS = [
    'tempmail.edu.pl', 'rommiui.com', 'gmail10p.com', 'oletters.com', 'oemails.com',
    'oegmail.com', 'suiemail.com', 'voewo.com', 'yanemail.com'
  ];

  const handlers = {
    GET_SITE_STATE: () => siteState(),
    MAIL_GET_STATE: () => ({ ok: true, activeMailboxId: 'mb1', mailboxes }),
    MAIL_LIST_MESSAGES: () => ({ ok: true, messages }),
    MAIL_READ_MESSAGE: () => ({ ok: true, canDelete: false, message: fullMessage }),
    MAIL_FETCH_DOMAINS: (msg) =>
      msg.provider === 'temp-mail-io'
        ? { ok: true, domains: ['duck.com', 'dcpa.net', 'fexpost.com'], popular: ['duck.com'] }
        : { ok: true, domains: HD_DOMAINS, popular: ['tempmail.edu.pl', 'rommiui.com'] },
    GET_NOTIF_PREFS: () => ({ ok: true, notifPrefs: { enabled: true } })
  };

  function respond(payload) {
    const h = handlers[payload && payload.type];
    if (h) return h(payload || {});
    return { ok: true };
  }

  function promisify(fn, ctx) {
    return function (...args) {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const out = new Promise((resolve) => resolve(fn.apply(ctx, args)));
      if (cb) out.then((r) => cb(r));
      return out;
    };
  }

  const chromeMock = {
    runtime: {
      lastError: null,
      getURL: (p) => new URL(p, location.href).href,
      sendMessage: (payload, cb) => {
        const res = respond(payload);
        if (cb) setTimeout(() => cb(res), 15);
        else return Promise.resolve(res);
      },
      onMessage: { addListener: () => {} },
      openAppPage: () => {}
    },
    tabs: {
      query: promisify(() => [{ id: 42, url: 'https://www.instagram.com/', title: 'Instagram' }]),
      create: promisify(() => ({ id: 999 })),
      sendMessage: promisify(() => ({ ok: true })),
      remove: promisify(() => {})
    },
    storage: {
      local: {
        get: promisify((keys) => {
          if (keys === null || keys === undefined) return { ...store };
          if (typeof keys === 'string') return { [keys]: store[keys] };
          if (Array.isArray(keys)) {
            const o = {};
            keys.forEach((k) => { if (store[k] !== undefined) o[k] = store[k]; });
            return o;
          }
          const o = {};
          Object.keys(keys).forEach((k) => {
            o[k] = store[k] !== undefined ? store[k] : keys[k];
          });
          return o;
        }),
        set: promisify((obj) => { Object.assign(store, obj); }),
        remove: promisify((keys) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]);
        })
      }
    },
    notifications: { create: promisify(() => {}), clear: promisify(() => {}) }
  };

  window.chrome = chromeMock;
})();
