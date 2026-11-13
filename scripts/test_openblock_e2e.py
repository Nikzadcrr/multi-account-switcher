# -*- coding: utf-8 -*-
"""E2E test using any-auto-register's own code:
OpenBlockLabs (WorkOS AuthKit, no captcha) + TempMail.lol live inbox
"""
import sys, json, re, time
sys.path.insert(0, '/tmp/any-auto-register')
from curl_cffi import requests as curl
from platforms.openblocklabs.core import OpenBlockLabsRegister, _rand_password

def log(m): print(m, flush=True)

# ---------- temp inbox (live) ----------
log("[1] TempMail.lol inbox...")
r = curl.post("https://api.tempmail.lol/v2/inbox/create", json={}, impersonate="chrome124", timeout=20)
d = r.json()
email, token = d.get("address") or d.get("email",""), d.get("token","")
log(f"    EMAIL: {email}")
if not email: sys.exit("FAIL inbox")

reg = OpenBlockLabsRegister()
pw = _rand_password()
first, last = "Nik", "Zad"

if not reg.step1_initiate_signup():
    log("    step1 FAIL (CF blocked?)"); sys.exit(1)
if not reg.step3_submit_signup(email, first, last):
    log("    step3 FAIL"); sys.exit(1)
reg.step4_get_password_page()
pt = reg.step5_submit_password(email, pw, first, last)
if not pt:
    log("    step5 FAIL (no pendingAuthenticationToken)"); sys.exit(1)
reg.step6_get_email_verification_page()

# ---------- poll inbox for 6-digit code ----------
log("[6] Polling temp inbox for OTP (max 150s)...")
code = None
start = time.time()
while time.time() - start < 150:
    rr = curl.get("https://api.tempmail.lol/v2/inbox", params={"token": token}, impersonate="chrome124", timeout=15)
    for mail in rr.json().get("emails", []):
        text = " ".join(str(mail.get(k) or "") for k in ("subject","body","html","text"))
        m = re.search(r'(?<!\d)(\d{6})(?!\d)', text)
        if m and ('openblock' in text.lower() or 'verification' in text.lower() or 'code' in text.lower() or 'workos' in text.lower()):
            code = m.group(1)
            log(f"    SUBJECT: {(mail.get('subject') or '')[:60]}")
            log(f"    CODE: {code}")
            break
    if code: break
    time.sleep(4)
if not code:
    log("    no code received"); sys.exit(1)

auth_code = reg.step7_submit_otp(email, code, pt)
if not auth_code:
    log("    step7 FAIL"); sys.exit(1)
sess = reg.step8_exchange_callback(auth_code)
log(f"    session={'YES' if sess else 'NO'}")
ok_org = reg.step9_create_personal_org()
log(f"    org={ok_org}")

log(f"\n=== OPENBLOCKLABS E2E: {'SUCCESS' if (sess and ok_org) else 'PARTIAL'} ===")
log(f"    account: {email} / {pw}")
