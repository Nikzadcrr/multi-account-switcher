# -*- coding: utf-8 -*-
"""E2E test with any-auto-register's approach: Blink.new registration
TempMail.lol inbox -> magic link -> Firebase -> full account. No captcha.
"""
import json, re, time, sys
from curl_cffi import requests as curl

def log(m): print(m, flush=True)

# ---------- temp inbox ----------
log("[1] TempMail.lol inbox create...")
r = curl.post("https://api.tempmail.lol/v2/inbox/create", json={}, impersonate="chrome124", timeout=20)
d = r.json()
email = d.get("address") or d.get("email", "")
token = d.get("token", "")
log(f"    EMAIL: {email}")
if not email: sys.exit("FAIL inbox")

s = curl.Session(impersonate="chrome124")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
s.headers.update({"user-agent": UA})

# ---------- step1 magic link ----------
log("[2] Blink: send magic link...")
r = s.post("https://blink.new/api/auth/main-app/magic-link",
    json={"email": email, "redirectUrl": "/"},
    headers={"accept": "*/*", "content-type": "application/json",
             "origin": "https://blink.new", "referer": "https://blink.new/sign-up"},
    timeout=30)
log(f"    HTTP {r.status_code} | {r.text[:150]}")
if r.status_code != 200 or not r.json().get("success"):
    sys.exit("FAIL send magic link")

# ---------- step2 poll inbox for magic token ----------
log("[3] Waiting for magic token in inbox (max 120s)...")
mt = None
start = time.time()
while time.time() - start < 120:
    rr = curl.get("https://api.tempmail.lol/v2/inbox", params={"token": token}, impersonate="chrome124", timeout=15)
    for mail in rr.json().get("emails", []):
        text = " ".join(str(mail.get(k) or "") for k in ("subject", "body", "html", "text"))
        m = re.search(r'magic_token=([a-f0-9]{64})', text)
        if not m:
            # any 64-hex token near blink.new link
            m = re.search(r'blink\.new[^"\s]*[?&]token=([a-f0-9]{64})', text)
        if m:
            mt = m.group(1)
            log(f"    SUBJECT: {(mail.get('subject') or '')[:60]}")
            log(f"    MAGIC TOKEN: {mt[:20]}...")
            break
    if mt: break
    time.sleep(4)
if not mt: sys.exit("FAIL no magic token")

# ---------- step3 redeem ----------
log("[4] Redeem magic link...")
r = s.get("https://blink.new/api/auth/main-app/magic-link",
    params={"token": mt, "email": email},
    headers={"accept": "*/*", "referer": "https://blink.new/auth"}, timeout=30)
log(f"    HTTP {r.status_code}")
d = r.json()
if not d.get("success"): sys.exit(f"FAIL redeem: {str(d)[:200]}")
custom_token = d["customToken"]
user = d.get("user", {})
ws = d.get("workspaceSlug", "")
log(f"    user_id={user.get('id','')[:20]} workspace={ws}")

# ---------- step4 firebase ----------
log("[5] Firebase signInWithCustomToken...")
r = s.post("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test",
    json={"token": custom_token, "returnSecureToken": True},
    headers={"accept": "*/*", "content-type": "application/json",
             "origin": "https://blink.new", "referer": "https://blink.new",
             "x-client-version": "Chrome/JsCore/11.10.0/FirebaseCore-web",
             "x-firebase-gmpid": "1:179867881115:web:08cc80113a7cb5f152003e"},
    timeout=30)
log(f"    HTTP {r.status_code}")
fdata = r.json()
id_token = fdata.get("idToken", "")
if not id_token: sys.exit(f"FAIL firebase: {r.text[:200]}")

# ---------- step5 app token ----------
log("[6] Exchange Blink app token...")
r = s.post("https://blink.new/api/auth/token", json={"idToken": id_token},
    headers={"accept": "*/*", "content-type": "application/json",
             "origin": "https://blink.new", "referer": f"https://blink.new/{ws}" if ws else "https://blink.new"},
    timeout=30)
log(f"    HTTP {r.status_code}")
at = r.json().get("access_token", "")
rf = r.json().get("refresh_token", "")
log(f"    access_token={'YES' if at else 'NO'} refresh_token={'YES' if rf else 'NO'}")

# ---------- step6 session ----------
log("[7] Get session cookie...")
r = s.post("https://blink.new/api/auth/session", json={"idToken": id_token},
    headers={"accept": "*/*", "content-type": "application/json",
             "origin": "https://blink.new", "referer": f"https://blink.new/{ws}" if ws else "https://blink.new"},
    timeout=30)
sess = ""
for c in s.cookies.jar:
    if c.name == "session": sess = c.value
log(f"    HTTP {r.status_code} | session={'YES' if sess else 'NO'}")

ok = bool(at and sess)
log(f"\n=== BLINK E2E: {'SUCCESS' if ok else 'PARTIAL'} | account email: {email} ===")
json.dump({"email": email, "access_token": at, "refresh_token": rf, "session": sess,
           "user_id": user.get("id",""), "workspace": ws},
          open('/tmp/blink_result.json','w'))
