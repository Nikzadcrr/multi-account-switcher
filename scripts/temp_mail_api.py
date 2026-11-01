#!/usr/bin/env python3
"""
Instant Mail (com.temporary.email.pro) v8.6.0 — Temp Mail API client
Extracted from Hermes bytecode bundle (assets/index.android.bundle)
4 services: temp-mail.org, HD, HD_GMAIL, temp-mail-io
"""
import base64, json, time, requests

# ─── HD payload encoding (from replaceChars/encodeStr @ func 16017-16021) ───
HD_KEY_PAIRS = ['ao', 'sq', '=x', '5b', '4*', 'Bz']  # full encryptKey 'ao-sq-=x-5b-4*-Bz'

def hd_encode(obj):
    s = obj if isinstance(obj, str) else json.dumps(obj, separators=(',', ':'))
    s = base64.b64encode(s.encode()).decode()
    s = s[::-1]                      # reverse string
    for a, b in HD_KEY_PAIRS:        # swap chars (symmetric)
        s = s.replace(a, '\x00').replace(b, a).replace('\x00', b)
    return s

def hd_decode(s):
    """Server responses come wrapped (possibly twice): {"data": "<encoded>", "type": "object"}"""
    for a, b in HD_KEY_PAIRS:        # swap is symmetric
        s = s.replace(a, '\x00').replace(b, a).replace('\x00', b)
    s = s[::-1]
    s = s + '=' * (-len(s) % 4)      # restore base64 padding
    return base64.b64decode(s).decode()

def hd_request(base, method, path, params=None, data=None):
    """HD-family request: params/data are wrapped in encoded envelope,
    response is (doubly) encoded {"data": "<...>", "type": ...} — unwrap recursively."""
    if params is not None:
        params = {'params': hd_encode(params)}
    if data is not None:
        data = {'data': hd_encode(data)}
    r = requests.request(method, base + path, headers=HD_HEADERS,
                         params=params, json=data, timeout=20)
    try:
        j = r.json()
    except Exception:
        return r.text
    # unwrap nested encoded layers
    depth = 0
    while isinstance(j, dict) and isinstance(j.get('data'), str) and depth < 5:
        try:
            j = json.loads(hd_decode(j['data']))
            depth += 1
        except Exception as e:
            print('   [unwrap stop:', e, ']')
            return j
    return j

# ─── 1) temp-mail.org  (service id 'temp-mail') ───
TMORG = 'https://mob2.temp-mail.org'
TMORG_HEADERS = {
    'accept': 'application/json',
    'accept-encoding': 'gzip',
    'content-length': '0',
    'user-agent': 'TempMail/1022 CFNetwork/1568.100.1 Darwin/24.0.0',
}

# ─── 2) HD / 3) HD_GMAIL (1timetech backend, default service) ───
HD_BASE    = 'https://mail-server.1timetech.com/api'
HD_G_BASE  = 'https://mail-server-2.1timetech.com/api'
HD_HEADERS = {'accept': 'application/json', 'x-app-key': 'b9db03078622'}

# ─── 4) temp-mail.io (service id 'temp-mail-io') ───
TMIO = 'https://api.internal.temp-mail.io/api'
TMIO_HEADERS = {
    'authority': 'api.internal.temp-mail.io',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
    'application-name': 'web',
    'application-version': '2.2.29',
    'origin': 'https://temp-mail.io',
    'referer': 'https://temp-mail.io/',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.80 Mobile Safari/537.36',
}

if __name__ == '__main__':
    print('=' * 60)
    print('[1] temp-mail.io  GET /v4/domains')
    r = requests.get(TMIO + '/v4/domains', headers=TMIO_HEADERS, timeout=20)
    print('   status:', r.status_code)
    try:
        d = r.json()
        doms = d.get('domains', d)
        print('   domains:', json.dumps(doms)[:300])
    except Exception as e:
        print('   body:', r.text[:200])

    print('=' * 60)
    print('[2] temp-mail.org  POST /mailbox')
    r = requests.post(TMORG + '/mailbox', headers=TMORG_HEADERS, timeout=20)
    print('   status:', r.status_code)
    print('   body:', r.text[:300])
    tm_token = None
    tm_email = None
    try:
        d = r.json()
        tm_token = d.get('token')
        tm_email = d.get('mailbox')
    except Exception:
        pass

    if tm_token:
        time.sleep(1)
        print('=' * 60)
        print('[3] temp-mail.org  GET /messages (authorization header)')
        h = dict(TMORG_HEADERS); h['authorization'] = tm_token
        r = requests.get(TMORG + '/messages', headers=h, timeout=20)
        print('   status:', r.status_code)
        print('   body:', r.text[:200])

    print('=' * 60)
    print('[4] HD  POST /email  (x-app-key + encoded payload)')
    email = f'test{int(time.time())}@tempmail.edu.pl'
    d = hd_request(HD_BASE, 'POST', '/email', data={'email': email})
    print('   decoded:', json.dumps(d, ensure_ascii=False)[:300])
    try:
        tok = d.get('id')
        if tok:
            time.sleep(1)
            print('=' * 60)
            print('[5] HD  GET /email/{token}/messages?params=encoded')
            d2 = hd_request(HD_BASE, 'GET', f'/email/{tok}/messages', params={'email': d.get('email') or email})
            print('   decoded:', json.dumps(d2, ensure_ascii=False)[:400])
    except Exception as e:
        print('   err:', e)

    print('=' * 60)
    print('[5b] HD_GMAIL  POST /g-mail  (mail-server-2)')
    d = hd_request(HD_G_BASE, 'POST', '/g-mail', data={'email': f'test{int(time.time())}@gmail.com'})
    print('   decoded:', json.dumps(d, ensure_ascii=False)[:300])

    print('=' * 60)
    print('[6] temp-mail.io  POST /v3/email/new (random)')
    r = requests.post(TMIO + '/v3/email/new', headers=TMIO_HEADERS, timeout=20)
    print('   status:', r.status_code)
    print('   body:', r.text[:300])
