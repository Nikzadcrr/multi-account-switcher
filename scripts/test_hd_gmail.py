#!/usr/bin/env python3
"""Live-test HD_GMAIL (mail-server-2) create + messages."""
import base64, json, random, string, urllib.request, ssl

SWAPS = [('a', 'o'), ('s', 'q'), ('=', 'x'), ('5', 'b'), ('4', '*'), ('B', 'z')]

def transform(s):
    out = []
    for ch in reversed(s):
        for a, b in SWAPS:
            if ch == a: ch = b; break
            if ch == b: ch = a; break
        out.append(ch)
    return ''.join(out)

def enc(obj):
    return transform(base64.b64encode(json.dumps(obj, separators=(',', ':')).encode()).decode())

def dec(s):
    b64 = transform(s)
    return json.loads(base64.b64decode(b64 + '=' * (-len(b64) % 4)).decode())

CTX = ssl.create_default_context()
def req(url, method='GET', body=None):
    h = {'accept': 'application/json', 'content-type': 'application/json', 'x-app-key': 'b9db03078622'}
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=25, context=CTX) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)

user = 'plugtest' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
for dom in ['gmail.com', 'googlemail.com']:
    email = f"{user}@{dom}"
    print(f"[{dom}] creating: {email}")
    st, body = req('https://mail-server-2.1timetech.com/api/g-mail', 'POST', {'data': enc({'email': email})})
    print('status:', st, 'raw:', body[:300])
    if st == 200:
        try:
            d = dec(json.loads(body)['data'])
            print('decoded:', json.dumps(d)[:300])
            if isinstance(d, str):
                print('decoded2:', json.dumps(dec(d))[:300])
            mid = d.get('id') if isinstance(d, dict) else None
            if mid:
                st2, b2 = req(f'https://mail-server-2.1timetech.com/api/email/{mid}/messages?params={enc({"email": email})}')
                print('messages status:', st2, 'raw:', b2[:200])
                if st2 == 200:
                    dd = dec(json.loads(b2)['data'])
                    print('messages decoded:', json.dumps(dd)[:200])
                    if isinstance(dd, str):
                        print('messages decoded2:', json.dumps(dec(dd))[:200])
        except Exception as e:
            print('decode err:', e)
    print()
