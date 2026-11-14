#!/usr/bin/env python3
"""E2E sandbox test: tempmail.lol + Cerebras Stytch OTP signup.
Pipeline: create temp inbox -> send OTP -> poll inbox -> extract code -> auth -> get API key.
This mirrors exactly the pipeline the extension agent will run (site=qwen uses same OTP steps + captcha in real tab).
"""
import sys, os, json, time, re

sys.path.insert(0, '/tmp/any-auto-register')
from curl_cffi import requests as curl_requests
from providers.mailbox.tempmail_lol import TempMailLolMailbox  # noqa
from core.base_mailbox import TempMailLolMailbox as TML
from core.executors.protocol import ProtocolExecutor
from platforms.cerebras.core import CerebrasRegister

LOG = []
def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    LOG.append(line)

def main():
    log("STEP 0: create temp inbox (tempmail.lol v2)")
    mb = TML()
    acct = mb.get_email()
    log(f"  inbox: {acct.email}")
    token = acct.account_id
    json.dump({"email": acct.email, "token": token}, open('/tmp/e2e_state.json', 'w'))

    log("STEP 1: send OTP via Stytch (login_or_create)")
    ex = ProtocolExecutor()
    reg = CerebrasRegister(executor=ex, log_fn=log)
    method_id = reg.step1_send_otp(acct.email)
    json.dump({"email": acct.email, "token": token, "method_id": method_id}, open('/tmp/e2e_state.json', 'w'))
    if not method_id:
        log("  !! no method_id returned")
        return 1

    log("STEP 2: wait for OTP in inbox (max 150s)")
    otp = None
    start = time.time()
    while time.time() - start < 150:
        try:
            r = curl_requests.get('https://api.tempmail.lol/v2/inbox', params={'token': token}, timeout=20)
            emails = r.json().get('emails', [])
            log(f"  poll: {len(emails)} email(s)")
            for mail in emails:
                text = (mail.get('subject') or '') + ' ' + (mail.get('body') or '') + ' ' + (mail.get('html') or '')
                m = re.search(r'(?<!\d)(\d{6})(?!\d)', text)
                if m:
                    otp = m.group(1)
                    log(f"  OTP found: {otp} (subject: {mail.get('subject','')[:60]})")
                    break
            if otp:
                break
        except Exception as e:
            log(f"  poll error: {e}")
        time.sleep(4)
    if not otp:
        log("FAILED: OTP timeout")
        return 1

    log("STEP 3: authenticate OTP")
    session = reg.step2_verify_otp(acct.email, otp, method_id)
    if not session.get('session_token'):
        log("FAILED: no session_token")
        return 1

    log("STEP 4: get/create API key")
    api_key = reg.step3_get_or_create_api_key()

    result = {
        "email": acct.email,
        "user_id": session.get('user_id', ''),
        "session_token": session.get('session_token', '')[:25] + '...',
        "api_key": (api_key[:18] + '...') if api_key else '',
        "api_key_len": len(api_key or ''),
    }
    log("E2E RESULT: " + json.dumps(result, ensure_ascii=False))
    ok = bool(api_key)
    log("SUCCESS" if ok else "PARTIAL (auth ok, no api key)")
    json.dump({"logs": LOG, "result": result, "success": ok}, open('/home/z/my-project/scripts/e2e_result.json', 'w'), ensure_ascii=False, indent=2)
    return 0 if ok else 2

if __name__ == '__main__':
    sys.exit(main())
