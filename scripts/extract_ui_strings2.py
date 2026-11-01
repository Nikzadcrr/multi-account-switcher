#!/usr/bin/env python3
"""Extract Instant Mail app UI strings (i18n) from bundle strings."""
import re, json

SRC = '/home/z/my-project/upload/app_decompile/bundle_strings.txt'
raw = open(SRC, encoding='utf-8', errors='replace').read()

pats = [
    r'inbox is empty', r'Inbox is empty', r'Your inbox', r'No emails yet',
    r'new mail', r'New Email', r'new email', r'Create Email', r'Create email',
    r'Your Email Address', r'your email address', r'Email Address',
    r'Copy Email', r'Copy email', r'copy', r'Copy',
    r'Change Email', r'Change', r'Delete Email', r'Delete',
    r'Enter username', r'Enter your name', r'Username', r'username',
    r'Custom Email', r'custom email', r'Custom domain', r'Random',
    r'Popular', r'Domain', r'domains', r'Premium',
    r'Auto Refresh', r'Auto refresh', r'auto refresh', r'Refresh',
    r'Waiting for', r'waiting for', r'QR Code', r'QRCode',
    r'Mail Service', r'mail service', r'Select Mail', r'SelectMail',
    r'expire', r'Expire', r'expires', r'lifetime', r'Lifetime',
    r'OCR', r'ocr', r'verification code', r'Verification',
    r'Instant', r'instant',
]

seen = set()
for p in pats:
    for m in re.finditer(p, raw):
        s = max(0, m.start() - 120)
        e = min(len(raw), m.end() + 120)
        ctx = raw[s:e].replace('\n', ' ')
        if ctx in seen:
            continue
        seen.add(ctx)

out = []
for c in sorted(seen):
    # skip code-noise contexts
    if re.search(r'function|=>|typeof|undefined|prototype|\{|\}|\[\]', c):
        continue
    out.append(c)

print(json.dumps(out, ensure_ascii=False, indent=1))
