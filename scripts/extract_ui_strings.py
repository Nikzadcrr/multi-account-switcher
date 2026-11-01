#!/usr/bin/env python3
"""Extract Instant Mail UI strings from decompiled bundle strings."""
import re, json, sys

SRC = '/home/z/my-project/upload/app_decompile/bundle_strings.txt'
raw = open(SRC, encoding='utf-8', errors='replace').read()

# Keywords typical of the Instant Mail app UI
keywords = [
    'Your email', 'Your Email', 'Email Address', 'email address',
    'Copy', 'Refresh', 'Change', 'Delete', 'New Email', 'Inbox',
    'verification', 'Verification', 'OTP', 'Confirm',
    'domains', 'Domain', 'domain', 'Random', 'Popular',
    'Choose', 'username', 'Username', 'Custom',
    'mail service', 'Service', 'service',
    'expired', 'Expiry', 'expire', 'lifetime', 'Lifetime',
    'Auto refresh', 'auto-refresh', 'seconds',
    'No emails', 'empty inbox', 'Empty', 'waiting',
    'QR', 'QRCode', 'Scan',
    'Subscribe', 'Premium', 'Pro',
    'Send', 'Forward', 'Attachment',
]

found = set()
for kw in keywords:
    for m in re.finditer(re.escape(kw), raw):
        s = max(0, m.start() - 90)
        e = min(len(raw), m.end() + 90)
        ctx = raw[s:e].replace('\n', ' ')
        found.add(ctx)

# Filter noise: contexts with lots of code-ish chars
def looks_ui(c):
    if c.count('{') > 2 or c.count('function') > 0 or c.count('(') > 4:
        return False
    if c.count(' ') < 1:
        return False
    return True

ui = sorted({c for c in found if looks_ui(c)})
print(json.dumps(ui[:120], ensure_ascii=False, indent=1))
