#!/usr/bin/env python3
"""Live-test the Instant Mail (HD) API encoding + endpoints."""
import base64, json, random, string, urllib.request, ssl, sys

SWAPS = [('a', 'o'), ('s', 'q'), ('=', 'x'), ('5', 'b'), ('4', '*'), ('B', 'z')]

def transform(s: str) -> str:
    out = []
    for ch in reversed(s):
        for a, b in SWAPS:
            if ch == a:
                ch = b
                break
            if ch == b:
                ch = a
                break
        out.append(ch)
    return ''.join(out)

def enc(obj) -> str:
    b64 = base64.b64encode(json.dumps(obj, separators=(',', ':')).encode()).decode()
    return transform(b64)

def dec(s: str):
    b64 = transform(s)
    # fix padding position (transform moved it) — pad manually
    pad = '=' * (-len(b64) % 4)
    return json.loads(base64.b64decode(b64 + pad).decode())

CTX = ssl.create_default_context()
HDRS = {'accept': 'application/json', 'content-type': 'application/json', 'x-app-key': 'b9db03078622'}

def req(url, method='GET', body=None, headers=None):
    h = dict(HDRS)
    if headers: h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=25, context=CTX) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)

DOMAINS = ["gmail10p.com","oletters.com","oemails.com","oegmail.com","suiemail.com","voewo.com","yanemail.com","tempmail.edu.pl","rommiui.com"]
dom = DOMAINS[-2]  # tempmail.edu.pl
user = 'plugtest' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
email = f"{user}@{dom}"
print(f"[1] creating HD mailbox: {email}")

st, body = req('https://mail-server.1timetech.com/api/email', 'POST', {'data': enc({'email': email})})
print('create status:', st)
print('create raw:', body[:500])
try:
    j = json.loads(body)
    print('type field:', j.get('type'))
    d = dec(j['data'])
    print('dec1:', json.dumps(d)[:400])
    if isinstance(d, dict) and 'data' in d:
        d2 = dec(d['data'])
        print('dec2:', json.dumps(d2)[:400])
        d = d2
except Exception as e:
    print('decode err:', e)
    sys.exit(1)

mid = d.get('id') if isinstance(d, dict) else None
print('mailbox id:', mid)

if mid:
    st, body = req(f'https://mail-server.1timetech.com/api/email/{mid}/messages?params={enc({"email": email})}')
    print('\n[2] messages status:', st)
    print('messages raw:', body[:600])
    try:
        j = json.loads(body)
        d = dec(j['data'])
        print('dec1:', json.dumps(d)[:400])
        if isinstance(d, str):
            d2 = dec(d)
            print('dec2:', json.dumps(d2)[:400])
    except Exception as e:
        print('decode err:', e)

# [3] temp-mail.io API test
print('\n[3] temp-mail.io test')
import urllib.request as u
def rio(url, method='GET', body=None, headers=None):
    h = {'accept': 'application/json, text/plain, */*', 'application-name': 'web',
         'application-version': '2.2.29', 'origin': 'https://temp-mail.io', 'referer': 'https://temp-mail.io/',
         'user-agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.80 Mobile Safari/537.36'}
    if headers: h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    if data: h['content-type'] = 'application/json'
    r = u.Request(url, data=data, method=method, headers=h)
    try:
        with u.urlopen(r, timeout=25, context=CTX) as resp:
            return resp.status, resp.read().decode()
    except u.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)

st, body = rio('https://api.internal.temp-mail.io/api/v4/domains?min_expiration=900')
print('domains status:', st, 'body:', body[:300])
st, body = rio('https://api.internal.temp-mail.io/api/v3/email/new', 'POST', {})
print('new email status:', st, 'body:', body[:300])
if st == 200:
    jio = json.loads(body)
    em = jio.get('email')
    st2, body2 = rio(f'https://api.internal.temp-mail.io/api/v3/email/{em}/messages')
    print('io messages status:', st2, 'body:', body2[:300])

