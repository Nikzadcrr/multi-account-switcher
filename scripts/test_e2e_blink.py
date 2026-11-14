#!/usr/bin/env python3
"""E2E sandbox test #2: tempmail.lol + blink.new magic-link signup (pure protocol, adapted from any-auto-register).
Pipeline: temp inbox -> send magic link -> poll inbox -> extract link token -> redeem -> firebase signin -> app token.
"""
import sys, time, json, re
sys.path.insert(0, '/tmp/any-auto-register')
from curl_cffi import requests as curl_requests
from core.base_mailbox import TempMailLolMailbox as TML

LOG = []
def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    LOG.append(line)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")
BLINK = "https://blink.new"

def main():
    log("STEP 0: temp inbox")
    acct = TML().get_email()
    log(f"  inbox: {acct.email}")
    token_inbox = acct.account_id
    json.dump({"email": acct.email, "token": token_inbox}, open('/tmp/e2e_blink.json', 'w'))

    s = curl_requests.Session()
    s.impersonate = "chrome124"
    s.headers.update({"user-agent": UA})

    log("STEP 1: request blink.new magic link")
    r = s.post(f"{BLINK}/api/auth/main-app/magic-link",
        json={"email": acct.email, "redirectUrl": "/"},
        headers={"accept": "*/*", "content-type": "application/json",
                 "origin": BLINK, "referer": f"{BLINK}/sign-up",
                 "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"},
        timeout=30)
    log(f"  -> {r.status_code} {r.text[:160]}")
    if r.status_code != 200:
        return 1

    log("STEP 2: poll inbox for magic link (max 150s)")
    link = None
    start = time.time()
    while time.time() - start < 150:
        try:
            rr = curl_requests.get('https://api.tempmail.lol/v2/inbox', params={'token': token_inbox},
                                   impersonate='chrome124', timeout=20)
            emails = rr.json().get('emails', [])
            log(f"  poll: {len(emails)} email(s)")
            for mail in emails:
                text = (mail.get('subject') or '') + ' ' + (mail.get('body') or '') + ' ' + (mail.get('html') or '')
                m = re.search(r'https?://[^"\'\s<>]*blink\.new[^"\'\s<>]*', text)
                if m:
                    link = m.group(0).replace('&amp;', '&')
                    log(f"  link found: {link[:100]}...")
                    break
            if link:
                break
        except Exception as e:
            log(f"  poll err: {e}")
        time.sleep(4)
    if not link:
        log("FAILED: no link in inbox")
        return 1

    # extract token param
    m = re.search(r'[?&]token=([A-Za-z0-9._\-]+)', link)
    if not m:
        log(f"FAILED: no token in link: {link[:200]}")
        return 1
    mt = m.group(1)
    log(f"  token: {mt[:24]}...")

    log("STEP 3: redeem magic link")
    r2 = s.get(f"{BLINK}/api/auth/main-app/magic-link", params={"token": mt, "email": acct.email},
        headers={"accept": "*/*", "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors",
                 "sec-fetch-dest": "empty", "referer": f"{BLINK}/auth"}, timeout=30)
    log(f"  -> {r2.status_code} {r2.text[:200]}")
    if r2.status_code != 200:
        return 1
    data = r2.json()
    if not data.get('success'):
        log("FAILED: redeem unsuccessful")
        return 1
    custom = data.get('customToken') or data.get('token') or ''
    log(f"  keys: {list(data.keys())}")

    log("STEP 4: firebase signInWithCustomToken")
    r3 = s.post("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test",
        json={"token": custom, "returnSecureToken": True},
        headers={"accept": "*/*", "content-type": "application/json", "origin": BLINK,
                 "referer": BLINK, "x-client-version": "Chrome/JsCore/11.10.0/FirebaseCore-web",
                 "x-firebase-gmpid": "1:179867881115:web:08cc80113a7cb5f152003e"}, timeout=30)
    log(f"  -> {r3.status_code} {r3.text[:160]}")
    if r3.status_code != 200:
        return 1
    fb = r3.json()
    id_token = fb.get('idToken', '')

    if not id_token:
        log("FAILED: no idToken")
        return 1

    log("STEP 5: exchange app token")
    r4 = s.post(f"{BLINK}/api/auth/token", json={"idToken": id_token[:40]+'...'} if False else {"idToken": id_token},
        headers={"accept": "*/*", "content-type": "application/json", "origin": BLINK,
                 "referer": BLINK, "authorization": f"Bearer {id_token}"}, timeout=30)
    log(f"  -> {r4.status_code} {r4.text[:200]}")

    result = {"email": acct.email, "firebase_uid": fb.get('localId', ''), "id_token_len": len(id_token),
              "app_token_status": r4.status_code}
    log("E2E RESULT: " + json.dumps(result, ensure_ascii=False))
    ok = bool(fb.get('localId') or id_token)
    log("SUCCESS" if ok else "PARTIAL")
    json.dump({"logs": LOG, "result": result, "success": ok}, open('/home/z/my-project/scripts/e2e_blink_result.json', 'w'), ensure_ascii=False, indent=2)
    return 0 if ok else 2

if __name__ == '__main__':
    sys.exit(main())
