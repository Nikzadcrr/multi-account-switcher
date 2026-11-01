// تست محلی پارسر فید جیمیل (بدون نیاز به افزونه)
const sample = `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
<title>Gmail - Inbox for test.user@gmail.com</title>
<tagline>New mail in Inbox</tagline>
<fullcount>2</fullcount>
<link rel="alternate" href="https://mail.google.com/mail/u/0/" type="text/html"/>
<modified>2026-11-01T12:00:00Z</modified>
<entry>
<title>Your verification code is 481923</title>
<summary>Hi, use code 481923 to verify your netflix account for test.user+netflix@gmail.com</summary>
<link rel="alternate" href="https://mail.google.com/mail/u/0/#inbox/abc123" type="text/html"/>
<modified>2026-11-01T11:59:00Z</modified>
<issued>2026-11-01T11:59:00Z</issued>
<id>tag:gmail.google.com,2004:1789abcdef12345</id>
<author><name>Netflix</name><email>no-reply@netflix.com</email></author>
</entry>
<entry>
<title>&quot;Welcome&quot; — حساب شما فعال شد</title>
<summary>سلام، لینک تأیید: https://example.com/verify?token=abc&amp;lang=fa</summary>
<link rel="alternate" href="https://mail.google.com/mail/u/0/#inbox/def456" type="text/html"/>
<issued>2026-11-01T10:00:00Z</issued>
<id>tag:gmail.google.com,2004:fedcba654321</id>
<author><name>Example Site</name><email>info@example.com</email></author>
</entry>
</feed>`;

function xmlDecodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : ''; } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const code = parseInt(d, 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : ''; } catch { return ''; }
    })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&(apos|#39);/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function pickXmlTag(block, tag) {
  if (!block) return '';
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? xmlDecodeEntities(m[1]).trim() : '';
}
function extractOtpCode(text) {
  if (!text) return null;
  const m = String(text).match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}
function extractVerificationLinks(text) {
  const out = [];
  const re = /https?:\/\/[^\s<>"')]+/g;
  let mm;
  while ((mm = re.exec(String(text || '')))) out.push(mm[0]);
  return out.slice(0, 5);
}

const out = { email: '', messages: [] };
const feedHead = sample.match(/<feed[\s>][\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
if (feedHead) {
  const em = xmlDecodeEntities(feedHead[1]).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (em) out.email = em[0].toLowerCase();
}
const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
let m;
while ((m = entryRe.exec(sample))) {
  const e = m[1];
  const id = pickXmlTag(e, 'id');
  const subject = pickXmlTag(e, 'title') || '(بدون موضوع)';
  const summary = pickXmlTag(e, 'summary');
  const authorBlock = pickXmlTag(e, 'author');
  const issued = pickXmlTag(e, 'issued') || pickXmlTag(e, 'published') || pickXmlTag(e, 'updated');
  let createdAt = '';
  if (issued) { const d = new Date(issued); if (!Number.isNaN(d.getTime())) createdAt = d.toISOString(); }
  out.messages.push({
    id,
    fromAddress: pickXmlTag(authorBlock, 'email'),
    fromName: pickXmlTag(authorBlock, 'name'),
    subject,
    intro: summary.slice(0, 160),
    createdAt,
    otpCode: extractOtpCode(`${subject}\n${summary}`),
    links: extractVerificationLinks(summary)
  });
}

console.log(JSON.stringify(out, null, 2));

// assertions
const assert = require('node:assert');
assert.strictEqual(out.email, 'test.user@gmail.com', 'email detection');
assert.strictEqual(out.messages.length, 2, 'entry count');
assert.strictEqual(out.messages[0].otpCode, '481923', 'otp extraction');
assert.strictEqual(out.messages[1].subject, '"Welcome" — حساب شما فعال شد', 'entity decode');
assert.ok(out.messages[1].links[0].includes('example.com/verify?token=abc&lang=fa'), 'link decode');
assert.strictEqual(out.messages[0].createdAt, '2026-11-01T11:59:00.000Z', 'date parse');
console.log('ALL PARSER TESTS PASSED ✅');
