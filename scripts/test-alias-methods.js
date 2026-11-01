// تست روش‌های جدید الیاس (v3.6.0) — نقطه‌گذاری، دامنهٔ اختصاصی، کوئری جست‌وجو، مسیریابی فید
// بلوک خالص بین نشانگرها از background.js استخراج و در Node اجرا می‌شود.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'background.js'), 'utf8');
const m = src.match(/\/\/ === ALIAS-METHODS-START ===([\s\S]*?)\/\/ === ALIAS-METHODS-END ===/);
if (!m) {
  console.error('FAIL: بلوک ALIAS-METHODS در background.js پیدا نشد');
  process.exit(1);
}

const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1], ctx);

let pass = 0;
let fail = 0;
function ok(cond, name) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}`);
  }
}

console.log('— روش ۱: +tag (رفتار قبلی حفظ شده) —');
const plus = ctx.buildGmailAlias('Nik.Zadcr@Gmail.com', 'Niki One!');
ok(plus.address === 'nik.zadcr+nikione@gmail.com', 'plus: نرمال‌سازی درست');
ok(plus.tag === 'nikione', 'plus: تگ تمیز شد');
let threw = false;
try {
  ctx.buildGmailAlias('nikzadcr@gmail.com', '   ');
} catch {
  threw = true;
}
ok(threw, 'plus: تگ خالی خطا می‌دهد');

console.log('— روش ۲: نقطه‌گذاری —');
const used = new Set();
let allValid = true;
let allUnique = true;
const seen = new Set();
for (let i = 0; i < 1000; i++) {
  const r = ctx.buildGmailDotAlias('nikzadcr@gmail.com', used);
  if (!r) break; // ظرفیت «nikzadcr» (۷ فاصله، بدون مجاورت) تمام شد
  const [local, domain] = r.address.split('@');
  if (
    r.address.includes('+') ||
    !local.includes('.') ||
    local.includes('..') ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    !['gmail.com', 'googlemail.com'].includes(domain) ||
    local.replace(/\./g, '') !== 'nikzadcr'
  ) {
    allValid = false;
    break;
  }
  if (seen.has(r.address)) allUnique = false;
  seen.add(r.address);
  used.add(r.address);
}
ok(allValid, 'dot: همهٔ آدرس‌های ساخته‌شده معتبرند (بدون +، بدون ..، بازسازی همان base)');
ok(allUnique, 'dot: هیچ آدرس تکراری ساخته نشد');
ok(seen.size === 32, `dot: ظرفیت دقیق «nikzadcr» مصرف شد (${seen.size}/32)`);
ok(ctx.buildGmailDotAlias('nikzadcr@gmail.com', used) === null, 'dot: بعد از پر شدن ظرفیت، null برمی‌گردد');

const short = ctx.buildGmailDotAlias('ab@gmail.com', new Set());
ok(short === null, 'dot: اسم دو حرفی → null (ظرفیت صفر)');

const longBase = new Set();
let longCount = 0;
while (longCount < 60) {
  const r = ctx.buildGmailDotAlias('nikzadcr@gmail.com', longBase);
  if (!r) break;
  longBase.add(r.address);
  longCount++;
}
ok(longCount >= 25, `dot: اسم طولانی‌تر ظرفیت بیشتری دارد (${longCount} آدرس)`);

const googlemailOnly = [];
const r2 = ctx.buildGmailDotAlias('nikzadcr@googlemail.com', googlemailOnly);
ok(r2 && (r2.address.endsWith('@gmail.com') || r2.address.endsWith('@googlemail.com')), 'dot: base روی googlemail هم کار می‌کند');

console.log('— روش ۳: دامنهٔ اختصاصی —');
const local1 = ctx.generateCustomLocal();
ok(/^[a-z0-9]{8}$/.test(local1), `custom: لوکال تصادفی خوانا (${local1})`);
const locals = new Set();
for (let i = 0; i < 200; i++) locals.add(ctx.generateCustomLocal());
ok(locals.size >= 150, `custom: تنوع لوکال بالاست (${locals.size}/200)`);

ok(ctx.isValidCustomDomain('MyDomain.COM'), 'custom: دامنهٔ معتبر تأیید می‌شود');
ok(!ctx.isValidCustomDomain('http://x.com'), 'custom: URL رد می‌شود');
ok(!ctx.isValidCustomDomain('بدون-دامنه'), 'custom: متن فارسی رد می‌شود');
ok(!ctx.isValidCustomDomain('a@b.com'), 'custom: ایمیل کامل به‌عنوان دامنه رد می‌شود');

console.log('— کوئری جست‌وجوی جیمیل —');
const q = ctx.buildGmailSearchQuery('shop@mydomain.com');
ok(
  q === '(to:shop@mydomain.com OR deliveredto:shop@mydomain.com) (in:inbox OR in:spam)',
  'query: to + deliveredto + اسپم'
);
ok(
  ctx.buildGmailSearchQuery('x+tag@gmail.com').includes('to:x+tag@gmail.com'),
  'query: آدرس با + سالم می‌ماند'
);

console.log('— مسیریابی فید مشترک (حالت سریع) —');
const cands = ['nikzadcr@gmail.com', 'n.ikzadcr@gmail.com', 'shop@mydomain.com'];
ok(
  ctx.quickFindOwnerAddress(
    { subject: 'کد تأیید', intro: 'Your code is 481923. Sent to shop@mydomain.com' },
    cands
  ) === 'shop@mydomain.com',
  'route: دامنهٔ اختصاصی پیدا شد'
);
ok(
  ctx.quickFindOwnerAddress(
    { subject: 'verify', intro: 'code for n.ikzadcr@gmail.com expires soon', text: '' },
    cands
  ) === 'n.ikzadcr@gmail.com',
  'route: آدرس نقطه‌ای پیدا شد'
);
ok(ctx.quickFindOwnerAddress({ subject: 'hello', intro: 'no address here' }, cands) === '', 'route: مبهم → خالی');
ok(
  ctx.quickFindOwnerAddress({ subject: '', intro: '', text: '' }, []) === '',
  'route: ورودی خالی → خطا نمی‌دهد'
);

console.log(`\nنتیجه: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
