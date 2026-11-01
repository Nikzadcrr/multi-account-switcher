#!/usr/bin/env python3
"""Extract Instant Mail create-email screen strings + theme colors."""
import re, json

SRC = '/home/z/my-project/upload/app_decompile/bundle_strings.txt'
raw = open(SRC, encoding='utf-8', errors='replace').read()

pats = [
    'Choose the type of email', 'type of email', 'mail service', 'Mail Service',
    'Enter your name', 'Enter username', 'username already', 'Name of email',
    'Create new email', 'Create Email', 'create email', 'New email', 'New Email',
    'Random Email', 'random email', 'Custom Email', 'custom email',
    'Popular domains', 'All domains', 'Choose domain', 'choose domain',
    'Auto refresh', 'Auto Refresh', 'Refresh every', 'every 10 seconds',
    'expires in', 'Expires in', 'Expire in', 'email expired', 'Email expired',
    'This email has expired', 'Remove this email', 'Confirm delete email',
    'activate', 'Activate this email', 'copy the email', 'Your email',
    'unread', 'Unread', 'new message', 'New message',
    'HD_GMAIL', 'hdDomains', 'Gmail (HD)', 'Temp Mail io', 'temp-mail.io',
    'ServiceTemp', 'service', 'Service',
]
seen = set()
for p in pats:
    for m in re.finditer(re.escape(p), raw):
        s = max(0, m.start() - 200)
        e = min(len(raw), m.end() + 200)
        ctx = raw[s:e].replace('\n', ' ')
        if re.search(r'function\(|prototype|_worklet|Factory', ctx):
            continue
        seen.add(ctx)

out = sorted(seen)
print(json.dumps(out[:100], ensure_ascii=False, indent=1))
