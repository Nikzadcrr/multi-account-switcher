# -*- coding: utf-8 -*-
"""E2E test: full account registration using any-auto-register's protocol approach
Step A: TempMail.lol inbox (free temp email, keyless)
Step B: Cerebras registration via Stytch email OTP (no captcha)
"""
import json, re, time, sys
from curl_cffi import requests as curl

PRINT = sys.stdout.isatty()
def log(msg): print(msg, flush=True)

# ---------- Step A1: create temp inbox ----------
log("[1] Creating TempMail.lol inbox...")
r = curl.post("https://api.tempmail.lol/v2/inbox/create", json={}, impersonate="chrome124", timeout=20)
log(f"    HTTP {r.status_code}")
try:
    d = r.json()
    email = d.get("address") or d.get("email", "")
    token = d.get("token", "")
    log(f"    EMAIL: {email}")
    log(f"    TOKEN: {token[:20]}...")
except Exception as e:
    log(f"    parse fail: {r.text[:300]}")
    sys.exit(1)

# ---------- Step A2: check inbox reachable ----------
log("[2] Checking inbox endpoint...")
r = curl.get("https://api.tempmail.lol/v2/inbox", params={"token": token}, impersonate="chrome124", timeout=15)
log(f"    HTTP {r.status_code} | emails: {len(r.json().get('emails', []))}")

# ---------- Step B: Cerebras via Stytch OTP ----------
STYTCH = "https://web.stytch.com"
PUB = "public-token-live-149c2fe0-f8dc-4569-8e3e-e04161a8475e"
s = curl.Session(impersonate="chrome124")

log("[3] Sending OTP to temp email (Stytch)...")
r = s.post(f"{STYTCH}/sdk/v1/otps/email/login_or_create",
    headers={
        "content-type": "application/json",
        "authorization": f"Basic {PUB}",
        "x-sdk-client": "eyJldmVudF9pZCI6ImV2ZW50LWlkLTEiLCJhcHBfc2Vzc2lvbl9pZCI6IiIsInBlcnNpc3RlbnRfaWQiOiIiLCJjbGllbnRfc2RrX3R5cGUiOiJqYXZhc2NyaXB0IiwiY2xpZW50X3Nka192ZXJzaW9uIjoiNS4xLjAifQ==",
    },
    data=json.dumps({"email": email, "login_expiration_minutes": 30, "signup_expiration_minutes": 30}),
    timeout=25)
log(f"    HTTP {r.status_code} | {r.text[:200]}")
method_id = r.json().get("email_id", "")
if not method_id:
    log("    FAIL: no method_id"); sys.exit(1)

log("[4] Waiting for 6-digit code in temp inbox (max 120s)...")
code = None
start = time.time()
while time.time() - start < 120:
    rr = curl.get("https://api.tempmail.lol/v2/inbox", params={"token": token}, impersonate="chrome124", timeout=15)
    for mail in rr.json().get("emails", []):
        text = (mail.get("subject") or "") + " " + (mail.get("body") or "")
        m = re.search(r'(?<!\d)(\d{6})(?!\d)', text)
        if m:
            code = m.group(1)
            log(f"    MAIL: {mail.get('subject','')[:60]}")
            log(f"    CODE: {code}")
            break
    if code: break
    time.sleep(4)

if not code:
    log("    FAIL: no code received"); sys.exit(1)

log("[5] Verifying OTP (Stytch authenticate)...")
r = s.post(f"{STYTCH}/sdk/v1/otps/authenticate",
    headers={"content-type": "application/json", "authorization": f"Basic {PUB}"},
    data=json.dumps({"code": code, "method_id": method_id, "session_duration_minutes": 60 * 24 * 7}),
    timeout=25)
log(f"    HTTP {r.status_code}")
d = r.json()
jwt = d.get("session_jwt", "")
uid = (d.get("user") or {}).get("user_id", "")
log(f"    user_id={uid[:30]}... | jwt={'YES' if jwt else 'NO'}")
if r.status_code != 200 or not jwt:
    log(f"    body: {r.text[:300]}"); sys.exit(1)

log("[6] Creating Cerebras API key...")
r = s.post("https://cloud.cerebras.ai/api/api-keys",
    headers={"authorization": f"Bearer {jwt}", "accept": "application/json", "content-type": "application/json"},
    data=json.dumps({"name": "auto-register"}),
    timeout=30)
log(f"    HTTP {r.status_code} | {r.text[:200]}")
try:
    key = r.json().get("key", "") or r.json().get("api_key", "")
except Exception:
    key = ""
if key:
    log(f"    API KEY: {key[:12]}...{key[-4:]}")
log("\n=== E2E RESULT: SUCCESS ===" if key else "\n=== E2E RESULT: partial (account created, key failed) ===")
