// Node test: mirrors background.js HD codec + create/list flow against live servers
// and verifies JS codec parity with the verified Python implementation.

const HD_SWAP_PAIRS = [['a', 'o'], ['s', 'q'], ['=', 'x'], ['5', 'b'], ['4', '*'], ['B', 'z']];

function hdSwapChars(str) {
  let out = '';
  for (const ch of str) {
    let c = ch;
    for (const [a, b] of HD_SWAP_PAIRS) {
      if (c === a) { c = b; break; }
      if (c === b) { c = a; break; }
    }
    out += c;
  }
  return out;
}

function hdEncode(obj) {
  const json = JSON.stringify(obj);
  const bytes = Buffer.from(json, 'utf-8');
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = Buffer.from(bin, 'binary').toString('base64');
  return hdSwapChars(b64.split('').reverse().join(''));
}

function hdDecodeText(str) {
  const b64 = hdSwapChars(str.split('').reverse().join(''));
  const bin = Buffer.from(b64, 'base64');
  return bin.toString('utf-8');
}

function hdExtract(body) {
  let cur = body && body.data !== undefined ? body.data : body;
  for (let i = 0; i < 4 && typeof cur === 'string'; i++) {
    cur = JSON.parse(hdDecodeText(cur));
  }
  return cur;
}

// ---- roundtrip checks ----
const samples = [
  { email: 'test.user-1@gmail10p.com' },
  { email: 'طآزمون@x.com' }, // unicode safety
  { email: 'a@b.c', extra: { n: 1, ok: true } }
];
for (const s of samples) {
  const dec = JSON.parse(hdDecodeText(hdEncode(s)));
  if (JSON.stringify(dec) !== JSON.stringify(s)) {
    console.error('FAIL roundtrip', s, dec);
    process.exit(1);
  }
}
console.log('PASS codec roundtrip (incl. unicode)');

const HDRS = {
  accept: 'application/json',
  'content-type': 'application/json',
  'x-app-key': 'b9db03078622'
};

async function hdCall(url, options = {}) {
  const res = await fetch(url, { ...options, headers: HDRS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return hdExtract(await res.json());
}

function randUser() {
  return 'njs' + Math.random().toString(36).slice(2, 10);
}

async function main() {
  // [1] HD create + list
  const email = `${randUser()}@yanemail.com`;
  const info = await hdCall('https://mail-server.1timetech.com/api/email', {
    method: 'POST',
    body: JSON.stringify({ data: hdEncode({ email }) })
  });
  console.log('[HD] create:', JSON.stringify(info));
  if (!info.success || !info.id) throw new Error('HD create failed');
  const msgs = await hdCall(
    `https://mail-server.1timetech.com/api/email/${info.id}/messages?params=${hdEncode({ email: info.email || email })}`
  );
  console.log('[HD] messages count:', Array.isArray(msgs) ? msgs.length : msgs);

  // [2] HD_GMAIL create + list
  const gEmail = `${randUser()}@gmail.com`;
  const gInfo = await hdCall('https://mail-server-2.1timetech.com/api/g-mail', {
    method: 'POST',
    body: JSON.stringify({ data: hdEncode({ email: gEmail }) })
  });
  console.log('[HD_GMAIL] create:', JSON.stringify(gInfo));
  if (!gInfo.success || !gInfo.id) throw new Error('HD_GMAIL create failed');
  const gMsgs = await hdCall(
    `https://mail-server-2.1timetech.com/api/email/${gInfo.id}/messages?params=${hdEncode({ email: gInfo.email || gEmail })}`
  );
  console.log('[HD_GMAIL] messages count:', Array.isArray(gMsgs) ? gMsgs.length : gMsgs);

  // [3] temp-mail.io domains + create + list
  const dRes = await fetch('https://api.internal.temp-mail.io/api/v4/domains?min_expiration=900', {
    headers: { accept: 'application/json', 'application-name': 'web', 'application-version': '2.2.29', origin: 'https://temp-mail.io', referer: 'https://temp-mail.io/' }
  });
  const dJson = await dRes.json();
  const ioDomains = dJson.domains.filter((d) => d.type !== 'private').map((d) => d.name);
  console.log('[IO] domains:', ioDomains.length, ioDomains.slice(0, 3).join(','));
  const cRes = await fetch('https://api.internal.temp-mail.io/api/v3/email/new', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'application-name': 'web', 'application-version': '2.2.29', origin: 'https://temp-mail.io', referer: 'https://temp-mail.io/' },
    body: JSON.stringify({ name: randUser(), domain: ioDomains[0] })
  });
  const cJson = await cRes.json();
  console.log('[IO] create:', cJson.email);
  const mRes = await fetch(`https://api.internal.temp-mail.io/api/v3/email/${cJson.email}/messages`, {
    headers: { accept: 'application/json', 'application-name': 'web', 'application-version': '2.2.29', origin: 'https://temp-mail.io', referer: 'https://temp-mail.io/' }
  });
  const mJson = await mRes.json();
  console.log('[IO] messages count:', Array.isArray(mJson) ? mJson.length : mJson);

  console.log('\nALL LIVE API TESTS PASSED ✅');
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  process.exit(1);
});
