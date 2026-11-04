#!/usr/bin/env python3
"""Remove the personal-Gmail UI (Gmail Real) from popup.js."""
import sys

PATH = '/home/z/my-project/plugin/popup.js'
src = open(PATH, encoding='utf-8').read()

def rep(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        print(f'FAIL {label}: {n} occurrences'); sys.exit(1)
    src = src.replace(old, new)
    print(f'ok {label}')

# R1 — provider chip entry
rep("  { key: 'gmail_real', icon: 'mail-check', label: 'جیمیل من (الیاس)' },\n", '', 'R1 chip')

# R2 — els references (40 lines)
els_old = """  gmailAliasBox: document.getElementById('gmailAliasBox'),
  gmailConnectedBox: document.getElementById('gmailConnectedBox'),
  gmailConnectBox: document.getElementById('gmailConnectBox'),
  gmailQuickConnectBtn: document.getElementById('gmailQuickConnectBtn'),
  gmailAppPwBox: document.getElementById('gmailAppPwBox'),
  openAppPwBtn: document.getElementById('openAppPwBtn'),
  gmailPwEmail: document.getElementById('gmailPwEmail'),
  gmailPwPass: document.getElementById('gmailPwPass'),
  gmailPwConnectBtn: document.getElementById('gmailPwConnectBtn'),
  gmailStatusEmail: document.getElementById('gmailStatusEmail'),
  gmailDisconnectBtn: document.getElementById('gmailDisconnectBtn'),
  gmailAliasPreviewLocal: document.getElementById('gmailAliasPreviewLocal'),
  gmailPreviewPlus: document.getElementById('gmailPreviewPlus'),
  gmailPreviewDomain: document.getElementById('gmailPreviewDomain'),
  gmailDomainSelect: document.getElementById('gmailDomainSelect'),
  gmailAliasGmailForm: document.getElementById('gmailAliasGmailForm'),
  gmailAliasDomainForm: document.getElementById('gmailAliasDomainForm'),
  gmailCustomLocal: document.getElementById('gmailCustomLocal'),
  gmailNewDomainBox: document.getElementById('gmailNewDomainBox'),
  gmailNewDomainInput: document.getElementById('gmailNewDomainInput'),
  gmailAddDomainBtn: document.getElementById('gmailAddDomainBtn'),
  gmailOpenDomainGuideBtn: document.getElementById('gmailOpenDomainGuideBtn'),
  gmailDotMode: document.getElementById('gmailDotMode'),
  gmailAliasNote: document.getElementById('gmailAliasNote'),
  gmailTagInput: document.getElementById('gmailTagInput'),
  openGmailWizardBtn: document.getElementById('openGmailWizardBtn'),
  gmailWizardModal: document.getElementById('gmailWizardModal'),
  closeGmailWizardBtn: document.getElementById('closeGmailWizardBtn'),
  gwExtId: document.getElementById('gwExtId'),
  gwRedirect: document.getElementById('gwRedirect'),
  gwCopyExtIdBtn: document.getElementById('gwCopyExtIdBtn'),
  gwCopyRedirectBtn: document.getElementById('gwCopyRedirectBtn'),
  gwOpenConsoleBtn: document.getElementById('gwOpenConsoleBtn'),
  gwOpenApiBtn: document.getElementById('gwOpenApiBtn'),
  gwOpenTestersBtn: document.getElementById('gwOpenTestersBtn'),
  gwOpenClientBtn: document.getElementById('gwOpenClientBtn'),
  gwClientIdInput: document.getElementById('gwClientIdInput'),
  gwConnectBtn: document.getElementById('gwConnectBtn'),
  gwError: document.getElementById('gwError'),
  gwErrorHint: document.getElementById('gwErrorHint'),
"""
rep(els_old, '', 'R2 els')

# R3 — whole Gmail Real section between the two markers
start_marker = '// ---------------- Gmail Real («جیمیل من») — وضعیت اتصال + ویزارد ----------------'
end_marker = '// ---------------- Instant Mail app-style create UI ----------------'
i = src.find(start_marker)
j = src.find(end_marker)
if i < 0 or j < 0 or j <= i:
    print('FAIL R3 markers'); sys.exit(1)
src = src[:i] + src[j:]
print('ok R3 section')

# R4 — renderDomainGrid gmail branch
rep("""  // سرویس «جیمیل من (الیاس)» — بدون دامنه و گروه؛ فرم اتصال/الیاس
  if (mailUi.provider === 'gmail_real') {
    els.imGroupTabsBox.classList.add('hidden');
    els.imDomainGrid.classList.add('hidden');
    els.mailCustomUser.classList.add('hidden');
    els.gmailAliasBox.classList.remove('hidden');
    els.createMailBtn.innerHTML = `${ic('at-sign')}<span>ساخت الیاس جیمیل</span>`;
    await renderGmailAliasBox();
    return;
  }

  els.gmailAliasBox.classList.add('hidden');
  els.imGroupTabsBox.classList.remove('hidden');
""", "  els.imGroupTabsBox.classList.remove('hidden');\n", 'R4 domain grid')

# R5 — active mailbox meta text
rep("""    if (els.activeMailMeta) {
      if (active.provider === 'gmail_real' || active.ptype === 'gmail') {
        els.activeMailMeta.textContent =
          'این آدرس واقعی است؛ نامه‌ها به صندوق جیمیل خودت می‌آیند و همین‌جا زنده نمایش داده می‌شوند.';
      } else {
        els.activeMailMeta.textContent =
          'آدرس به‌صورت خودکار ساخته می‌شود، حدود ۲ روز اعتبار دارد و قابل بازیابی نیست.';
      }
    }
""", """    if (els.activeMailMeta) {
      els.activeMailMeta.textContent =
        'آدرس به‌صورت خودکار ساخته می‌شود، حدود ۲ روز اعتبار دارد و قابل بازیابی نیست.';
    }
""", 'R5 meta')

# R6 — gmail select/dot/domain/guide handlers
rep("""els.gmailDomainSelect.addEventListener('change', () => {
  els.gmailDomainSelect.dataset.prev = els.gmailDomainSelect.value;
  applyGmailAliasMode();
});

els.gmailDotMode.addEventListener('change', applyGmailAliasMode);

els.gmailAddDomainBtn.addEventListener('click', async () => {
  const d = els.gmailNewDomainInput.value.trim().toLowerCase();
  if (!d) {
    showToast('دامنه را وارد کن (مثلاً mydomain.com).', true);
    return;
  }
  els.gmailAddDomainBtn.disabled = true;
  try {
    const res = await sendMsg({ type: 'GMAIL_ADD_DOMAIN', domain: d });
    if (!res?.ok) {
      showToast(res?.error || 'دامنه ذخیره نشد.', true);
      return;
    }
    els.gmailNewDomainInput.value = '';
    gmailStatus = { ...gmailStatus, customDomains: res.customDomains || [] };
    renderGmailDomainSelect(res.customDomains || []);
    els.gmailDomainSelect.dataset.prev = d;
    els.gmailDomainSelect.value = d;
    applyGmailAliasMode();
    showToast(`دامنهٔ ${d} اضافه شد — حالا هر اسمی روی آن بساز.`);
  } finally {
    els.gmailAddDomainBtn.disabled = false;
  }
});

els.gmailOpenDomainGuideBtn.addEventListener('click', () => {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('domain-setup.html') });
  } catch {}
});

""", '', 'R6 handlers')

# R7 — create-mail payload
rep("""  const isGmailAlias = mailUi.provider === 'gmail_real';
  const isRandom = !isGmailAlias && mailUi.group === 'random';

  // انتخاب‌های الیاس جیمیل: دامنه (جیمیل / دامنهٔ خودت) و حالت (+tag / بدون +)
  const domainSelVal = isGmailAlias && els.gmailDomainSelect ? els.gmailDomainSelect.value : '';
  const customDomain =
    isGmailAlias && domainSelVal && domainSelVal !== '__new' ? domainSelVal : '';
  const dotMode = isGmailAlias && !customDomain && els.gmailDotMode && els.gmailDotMode.checked;

  const res = await sendMsg({
    type: 'MAIL_CREATE_INBOX',
    provider: mailUi.provider,
    domain: isRandom ? '' : mailUi.domain,
    customUser: isGmailAlias
      ? customDomain
        ? els.gmailCustomLocal.value.trim()
        : els.gmailTagInput.value.trim()
      : isRandom
        ? ''
        : els.mailCustomUser.value.trim(),
    aliasStyle: dotMode ? 'dot' : 'plus',
    aliasDomain: customDomain
  });
""", """  const isRandom = mailUi.group === 'random';

  const res = await sendMsg({
    type: 'MAIL_CREATE_INBOX',
    provider: mailUi.provider,
    domain: isRandom ? '' : mailUi.domain,
    customUser: isRandom ? '' : els.mailCustomUser.value.trim()
  });
""", 'R7 create payload')

# R8 — reset inputs
rep("""    els.mailCustomUser.value = '';
    els.gmailTagInput.value = '';
    if (els.gmailCustomLocal) els.gmailCustomLocal.value = '';
    createCardOpen = false;
""", """    els.mailCustomUser.value = '';
    createCardOpen = false;
""", 'R8 reset')

# R9 — success toast
rep("""    showToast(
      copied
        ? isGmailAlias
          ? `الیاس ساخته و کپی شد: ${res.mailbox.address}`
          : `ایمیل ساخته و کپی شد: ${res.mailbox.address}`
        : 'ایمیل جدید ساخته شد'
    );
""", """    showToast(copied ? `ایمیل ساخته و کپی شد: ${res.mailbox.address}` : 'ایمیل جدید ساخته شد');
""", 'R9 toast')

open(PATH, 'w', encoding='utf-8').write(src)
print('popup.js done, bytes =', len(src))
