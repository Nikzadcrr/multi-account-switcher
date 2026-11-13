// ============================================================================
// Registration Agent — تشخیص و پرکردن خودکار فرم ثبت‌نام (Content Script)
// فقط در صورت درخواست ایجنت از طریق chrome.scripting تزریق می‌شود.
// ============================================================================

(() => {
  if (window.__agentContentLoaded) return;
  window.__agentContentLoaded = true;

  // ---------------------------------------------------------------
  // ابزارهای عمومی
  // ---------------------------------------------------------------

  function isReallyVisible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  // مقداردهی امن حتی برای صفحات React/Vue (native setter + رویدادها)
  function setInputValue(input, value) {
    input.focus();
    const proto =
      input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fieldTextHints(el) {
    return [
      el.name || '',
      el.id || '',
      el.placeholder || '',
      el.autocomplete || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('data-testid') || ''
    ].join(' ').toLowerCase();
  }

  function labelForInput(el) {
    try {
      if (el.id) {
        const lb = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lb) return (lb.textContent || '').trim().toLowerCase();
      }
      const wrap = el.closest('label');
      if (wrap) return (wrap.textContent || '').trim().toLowerCase();
      const form = el.closest('form');
      if (form) {
        const lb = form.querySelector(`label[for="${CSS.escape(el.id || '')}"]`);
        if (lb) return (lb.textContent || '').trim().toLowerCase();
      }
    } catch {}
    return '';
  }

  // ---------------------------------------------------------------
  // تشخیص فیلدهای فرم ثبت‌نام
  // ---------------------------------------------------------------

  function collectVisibleInputs() {
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    return inputs.filter((el) => {
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'file') return false;
      if (el.type === 'checkbox' || el.type === 'radio') return false;
      const hints = fieldTextHints(el);
      // فیلدهای جست‌وجو و شماره کارت را دور بزن
      if (/search|جستجو|cardnumber|card-number|cvv|cvc/.test(hints)) return false;
      return isReallyVisible(el);
    });
  }

  function looksLikeRegistrationPage() {
    const text = (document.body?.innerText || '').slice(0, 4000).toLowerCase();
    const url = location.href.toLowerCase();
    const keywords =
      /sign\s?up|register|registration|create\s?(an?\s?)?account|join\s?(us|now)|ثبت\s?نام|عضویت|ساخت\s?اکانت|ساخت\s?حساب|ایجاد\s?حساب/;
    const urlHints = /register|signup|sign-up|registration|join|create|عضویت|ثبت/;
    return keywords.test(text) || urlHints.test(url);
  }

  function findPasswordField(all) {
    return all.filter((el) => el.type === 'password');
  }

  function pickEmailField(all) {
    return (
      all.find((el) => el.type === 'email') ||
      all.find((el) => el.autocomplete === 'email') ||
      all.find((el) => /email|e-mail|ایمیل|رایانامه/.test(fieldTextHints(el) + ' ' + labelForInput(el))) ||
      all.find((el) => /mail/.test(fieldTextHints(el)))
    );
  }

  function pickUsernameField(all, emailEl) {
    const candidates = all.filter((el) => el !== emailEl && el.type !== 'email' && el.type !== 'password');
    return (
      candidates.find((el) => /username|user[_-]?name|nickname|nick|handle|login|userid|user[_-]?id/.test(fieldTextHints(el))) ||
      candidates.find((el) => /نام\s?کاربری|یوزر|شناسه|handle/.test(fieldTextHints(el) + ' ' + labelForInput(el))) ||
      candidates.find((el) => el.autocomplete === 'username')
    );
  }

  function pickPhoneField(all, emailEl, userEl) {
    return all.find(
      (el) =>
        el !== emailEl &&
        el !== userEl &&
        (el.type === 'tel' || /phone|mobile|tel\b|شماره\s?موبایل|موبایل|همراه/.test(fieldTextHints(el) + ' ' + labelForInput(el)))
    );
  }

  function pickSubmitButton(formEl) {
    const scope = formEl || document;
    const btns = Array.from(scope.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')).filter(
      (b) => isReallyVisible(b) && b.type !== 'reset'
    );

    const scoreBtn = (b) => {
      const txt = ((b.innerText || b.value || '') + ' ' + (b.name || '') + ' ' + (b.id || '')).toLowerCase().trim();
      let score = 0;
      if (/sign\s?up|register|create\s?(account|my\s?account)|join|get\s?started|ثبت|عضویت|ساخت|برو|ادامه/.test(txt)) score += 6;
      if (/submit|next|continue/.test(txt)) score += 3;
      if (b.type === 'submit') score += 4;
      if (b.closest('form')) score += 1;
      // دکمه‌های لاگین/گوش/اشتراک را رد کن
      if (/log\s?in|sign\s?in|ورود|وارد\s?شو|forgot|subscribe|play|share|tweet|apple|facebook|google|github/.test(txt)) score -= 8;
      return score;
    };

    let best = null;
    let bestScore = -Infinity;
    for (const b of btns) {
      const s = scoreBtn(b);
      if (s > bestScore) {
        bestScore = s;
        best = b;
      }
    }
    if (bestScore <= 0) return null;
    return best;
  }

  function pickTermsCheckbox(formEl) {
    const scope = formEl || document;
    const boxes = Array.from(scope.querySelectorAll('input[type="checkbox"]')).filter(isReallyVisible);
    for (const b of boxes) {
      const text = (
        (b.closest('label')?.textContent || '') +
        ' ' +
        (b.parentElement?.textContent || '') +
        ' ' +
        fieldTextHints(b)
      )
        .toLowerCase();
      if (/terms|agree|privacy|accept|قوانین|موافقم|شرایط|حریم|توافق/.test(text)) return b;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // تشخیص کپچا
  // ---------------------------------------------------------------

  function detectCaptcha() {
    // reCAPTCHA v2/v-invisible
    const recDiv = document.querySelector('.g-recaptcha[data-sitekey], [data-sitekey].g-recaptcha');
    if (recDiv) {
      return { type: 'recaptcha_v2', sitekey: recDiv.getAttribute('data-sitekey') || '' };
    }
    const recIframe = document.querySelector('iframe[src*="google.com/recaptcha/"]');
    if (recIframe) {
      try {
        const src = new URL(recIframe.getAttribute('src'));
        const sitekey = src.searchParams.get('sitekey') || '';
        const enterprise = /recaptcha\/enterprise/.test(src.pathname);
        return { type: enterprise ? 'recaptcha_enterprise' : 'recaptcha_v2', sitekey };
      } catch {}
    }
    // برخی سایت‌ها فقط اسکریپت را می‌گذارند
    const recScript = document.querySelector('script[src*="recaptcha/api.js"], script[src*="recaptcha/enterprise"]');
    if (recScript) {
      const m = (recScript.src.match(/render=([\w-]+)/) || [])[1];
      if (m && m !== 'onload' && m !== 'explicit') {
        const isEnt = /enterprise/.test(recScript.src);
        return { type: isEnt ? 'recaptcha_enterprise' : 'recaptcha_v2', sitekey: m };
      }
      return { type: /enterprise/.test(recScript.src) ? 'recaptcha_enterprise' : 'recaptcha_v2', sitekey: '' };
    }

    // hCaptcha
    const hcDiv = document.querySelector('.h-captcha[data-sitekey], [data-sitekey].h-captcha, div[data-hcaptcha-widget-id]');
    if (hcDiv && hcDiv.getAttribute('data-sitekey')) {
      return { type: 'hcaptcha', sitekey: hcDiv.getAttribute('data-sitekey') };
    }
    const hcIframe = document.querySelector('iframe[src*="hcaptcha.com/"]');
    if (hcIframe) {
      try {
        const src = new URL(hcIframe.getAttribute('src'));
        return { type: 'hcaptcha', sitekey: src.searchParams.get('sitekey') || '' };
      } catch {}
    }

    // Cloudflare Turnstile
    const tsDiv = document.querySelector('.cf-turnstile[data-sitekey], [data-sitekey].cf-turnstile');
    if (tsDiv) {
      return { type: 'turnstile', sitekey: tsDiv.getAttribute('data-sitekey') };
    }
    const tsIframe = document.querySelector('iframe[src*="challenges.cloudflare.com/"]');
    if (tsIframe) {
      try {
        const src = new URL(tsIframe.getAttribute('src'));
        return { type: 'turnstile', sitekey: src.searchParams.get('sitekey') || '' };
      } catch {}
    }

    return null;
  }

  // ---------------------------------------------------------------
  // فیلدهای کد تأیید (OTP)
  // ---------------------------------------------------------------

  function findOtpInputs() {
    const all = Array.from(document.querySelectorAll('input, textarea')).filter((el) => el.type !== 'hidden');
    const hints = (el) => (fieldTextHints(el) + ' ' + el.getAttribute('autocomplete')).toLowerCase();

    // حالت ۱: فیلد یکپارچه
    const single = all.find(
      (el) =>
        isReallyVisible(el) &&
        (el.autocomplete === 'one-time-code' ||
          /otp|one[-_]?time|verification[-_]?code|verify[-_]?code|confirm[-_]?code|activation|کد\s?تأیید|کد\s?تایید/.test(hints(el)) ||
          (/^\d{4,8}$/.test(el.placeholder || '') && !/search/.test(hints(el))))
    );
    if (single) return { mode: 'single', inputs: [single] };

    // حالت ۲: خانه‌های جدا (مثلاً ۶ اینپوت تک‌رقمی)
    const digitBoxes = all.filter(
      (el) =>
        isReallyVisible(el) &&
        (el.maxLength === 1 || el.getAttribute('inputmode') === 'numeric') &&
        (el.type === 'text' || el.type === 'tel' || el.type === 'number')
    );
    if (digitBoxes.length >= 4 && digitBoxes.length <= 8) return { mode: 'split', inputs: digitBoxes };

    return null;
  }

  // ---------------------------------------------------------------
  // اجرای دستورها
  // ---------------------------------------------------------------

  function currentFormOf(el) {
    return el ? el.closest('form') || el.closest('div') : null;
  }

  function scanForm() {
    const all = collectVisibleInputs();
    const passwords = findPasswordField(all);
    const email = pickEmailField(all);
    const username = pickUsernameField(all, email);
    const phone = pickPhoneField(all, email, username);
    const password = passwords[0] || null;
    const confirm = passwords[1] || null;
    const formEl = email ? email.closest('form') : passwords[0] ? passwords[0].closest('form') : null;
    const submit = pickSubmitButton(formEl);
    const terms = pickTermsCheckbox(formEl);
    const captcha = detectCaptcha();

    const describe = (el) =>
      el
        ? {
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            id: el.id || '',
            placeholder: el.placeholder || ''
          }
        : null;

    return {
      ok: true,
      url: location.href,
      isRegistrationLike: looksLikeRegistrationPage(),
      hasFields: Boolean(email || password || username),
      fields: {
        email: describe(email),
        username: describe(username),
        phone: describe(phone),
        password: describe(password),
        confirm: describe(confirm)
      },
      hasSubmit: Boolean(submit),
      submitText: submit ? (submit.innerText || submit.value || '').trim().slice(0, 40) : '',
      hasTerms: Boolean(terms),
      captcha
    };
  }

  function fillFields(payload) {
    const { email, username, password } = payload || {};
    const all = collectVisibleInputs();
    const passwords = findPasswordField(all);
    const emailEl = pickEmailField(all);
    const usernameEl = pickUsernameField(all, emailEl);
    const passwordEl = passwords[0] || null;
    const confirmEl = passwords[1] || null;
    const formEl = emailEl ? emailEl.closest('form') : passwordEl ? passwordEl.closest('form') : null;
    const termsEl = pickTermsCheckbox(formEl);

    const filled = [];
    if (emailEl && email) {
      setInputValue(emailEl, email);
      filled.push('email');
    }
    if (usernameEl && username) {
      setInputValue(usernameEl, username);
      filled.push('username');
    }
    if (passwordEl && password) {
      setInputValue(passwordEl, password);
      filled.push('password');
    }
    if (confirmEl && password) {
      setInputValue(confirmEl, password);
      filled.push('confirm');
    }
    if (termsEl && !termsEl.checked) {
      termsEl.click();
      filled.push('terms');
    }

    return { ok: filled.length > 0, filled, found: Boolean(emailEl || passwordEl) };
  }

  function fillOtpCode(code) {
    const box = findOtpInputs();
    if (!box) return { ok: false, error: 'no_otp_inputs' };
    const digits = String(code).replace(/\D/g, '');
    try {
      if (box.mode === 'single') {
        setInputValue(box.inputs[0], digits);
        return { ok: true, mode: 'single' };
      }
      const chars = digits.split('');
      box.inputs.forEach((inp, i) => {
        if (i < chars.length) setInputValue(inp, chars[i]);
      });
      return { ok: true, mode: 'split' };
    } catch (e) {
      return { ok: false, error: e?.message || 'fill_failed' };
    }
  }

  function clickSubmit() {
    const all = collectVisibleInputs();
    const emailEl = pickEmailField(all);
    const passwords = findPasswordField(all);
    const formEl = emailEl ? emailEl.closest('form') : passwords[0] ? passwords[0].closest('form') : null;
    const btn = pickSubmitButton(formEl);
    if (!btn) {
      // فالبک: requestSubmit روی خود فرم
      if (formEl && typeof formEl.requestSubmit === 'function') {
        formEl.requestSubmit();
        return { ok: true, via: 'requestSubmit' };
      }
      return { ok: false, error: 'no_submit_button' };
    }
    btn.click();
    return { ok: true, via: 'click', label: (btn.innerText || btn.value || '').trim().slice(0, 40) };
  }

  // ---------------------------------------------------------------
  // گوش دادن به دستورهای پس‌زمینه
  // ---------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !String(msg.type || '').startsWith('AGENT_')) return undefined;

    switch (msg.type) {
      case 'AGENT_PING':
        sendResponse({ ok: true, url: location.href });
        return true;
      case 'AGENT_SCAN':
        sendResponse(scanForm());
        return true;
      case 'AGENT_FILL':
        sendResponse(fillFields(msg.payload));
        return true;
      case 'AGENT_FILL_OTP':
        sendResponse(fillOtpCode(msg.code));
        return true;
      case 'AGENT_DETECT_OTP':
        sendResponse({ ok: true, otp: Boolean(findOtpInputs()) });
        return true;
      case 'AGENT_CLICK_SUBMIT':
        sendResponse(clickSubmit());
        return true;
      default:
        sendResponse({ ok: false });
        return true;
    }
  });
})();
