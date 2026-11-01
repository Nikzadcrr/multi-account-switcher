#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Instant Mail API Client (com.temporary.email.pro v8.6.0)
=========================================================
استخراج‌شده از دیکامپایل باندل Hermes (assets/index.android.bundle)

۴ سرویس ایمیل موقت که اپ استفاده می‌کند:
  1) HD        — بک‌اند اختصاصی اپ (پیش‌فرض)  https://mail-server.1timetech.com/api
  2) HD_GMAIL  — نسخه Gmail (ترفند نقطه)      https://mail-server-2.1timetech.com/api
  3) temp-mail — API موبایل temp-mail.org     https://mob2.temp-mail.org
  4) temp-mail-io — API وب temp-mail.io       https://api.internal.temp-mail.io/api

نمونه استفاده:
    from instant_mail_api_client import TempMailClient
    c = TempMailClient()
    box = c.create('HD')                 # ساخت ایمیل تصادفی
    box = c.create('HD', email='ali@tempmail.edu.pl')   # ایمیل دلخواه
    print(box)
    print(c.get_messages('HD', box['token'], box['email']))
"""
import base64
import json
import random
import string
import time

import requests

# ════════════════════════════════════════════════════════════════
#  ۱) سرویس HD / HD_GMAIL — بک‌اند 1timetech
#     پارامترها و بدنه در پاکت کدگذاری‌شده ارسال می‌شوند:
#       request : {"params": ENC({...})} یا {"data": ENC({...})}
#       response: {"data": ENC(ENC(JSON)), "type": "object"}  ← دولایه!
#     ENC = swap(reversed(base64(JSON)))   با جفت‌کاراکترهای کلید
# ════════════════════════════════════════════════════════════════
HD_KEY_PAIRS = ['ao', 'sq', '=x', '5b', '4*', 'Bz']   # از encryptKey 'ao-sq-=x-5b-4*-Bz'

HD_BASES = {
    'HD':       'https://mail-server.1timetech.com/api',
    'HD_GMAIL': 'https://mail-server-2.1timetech.com/api',
}
HD_HEADERS = {
    'accept': 'application/json',
    'x-app-key': 'b9db03078622',          # از remoteConfig hdServiceKey / hdGmailServiceKey
    'user-agent': 'okhttp/4.12.0',
}


def hd_encode(obj) -> str:
    s = obj if isinstance(obj, str) else json.dumps(obj, separators=(',', ':'))
    s = base64.b64encode(s.encode()).decode()
    s = s[::-1]                            # ۱) معکوس‌کردن رشته
    for a, b in HD_KEY_PAIRS:              # ۲) جابه‌جایی جفت‌کاراکترها (متقارن)
        s = s.replace(a, '\x00').replace(b, a).replace('\x00', b)
    return s


def hd_decode(s: str) -> str:
    """عکس عمل hd_encode — پاسخ سرور دولایه است؛ در hd_request باز می‌شود."""
    for a, b in HD_KEY_PAIRS:
        s = s.replace(a, '\x00').replace(b, a).replace('\x00', b)
    s = s[::-1]
    s = s + '=' * (-len(s) % 4)            # ترمیم پدینگ base64
    return base64.b64decode(s).decode()


def hd_request(base: str, method: str, path: str, params=None, data=None, timeout=25):
    if params is not None:
        params = {'params': hd_encode(params)}
    if data is not None:
        data = {'data': hd_encode(data)}
    r = requests.request(method, base + path, headers=HD_HEADERS,
                         params=params, json=data, timeout=timeout)
    r.raise_for_status()
    j = r.json()
    depth = 0
    while isinstance(j, dict) and isinstance(j.get('data'), str) and depth < 5:
        j = json.loads(hd_decode(j['data']))     # بازکردن لایه‌های تودرتو
        depth += 1
    return j


# ════════════════════════════════════════════════════════════════
#  ۲) سرویس temp-mail (موبایل temp-mail.org)
# ════════════════════════════════════════════════════════════════
TMORG_BASE = 'https://mob2.temp-mail.org'
TMORG_HEADERS = {
    'accept': 'application/json',
    'accept-encoding': 'gzip',
    'content-length': '0',
    'user-agent': 'TempMail/1022 CFNetwork/1568.100.1 Darwin/24.0.0',
}


def tmorg_create(timeout=25):
    """POST /mailbox → {'token': JWT, 'mailbox': 'addr@dom'}"""
    r = requests.post(TMORG_BASE + '/mailbox', headers=TMORG_HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()


def tmorg_messages(token: str, timeout=25):
    """GET /messages با هدر authorization: <JWT>"""
    h = dict(TMORG_HEADERS)
    h['authorization'] = token
    r = requests.get(TMORG_BASE + '/messages', headers=h, timeout=timeout)
    r.raise_for_status()
    return r.json().get('messages', [])


def tmorg_message(token: str, message_id: str, timeout=25):
    h = dict(TMORG_HEADERS)
    h['authorization'] = token
    r = requests.get(f'{TMORG_BASE}/messages/{message_id}', headers=h, timeout=timeout)
    r.raise_for_status()
    return r.json()


# ════════════════════════════════════════════════════════════════
#  ۳) سرویس temp-mail-io (وب temp-mail.io)
# ════════════════════════════════════════════════════════════════
TMIO_BASE = 'https://api.internal.temp-mail.io/api'
TMIO_HEADERS = {
    'authority': 'api.internal.temp-mail.io',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
    'application-name': 'web',
    'application-version': '2.2.29',
    'origin': 'https://temp-mail.io',
    'referer': 'https://temp-mail.io/',
    'user-agent': ('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/118.0.5993.80 Mobile Safari/537.36'),
}


def tmio_domains(timeout=25):
    """GET /v4/domains → [{'name','type',...}, ...]"""
    r = requests.get(TMIO_BASE + '/v4/domains', headers=TMIO_HEADERS, timeout=timeout)
    r.raise_for_status()
    return [d['name'] for d in r.json().get('domains', [])]


def tmio_create(name=None, domain=None, timeout=25):
    """POST /v3/email/new  (بدون بدنه = تصادفی، یا {'name','domain'})"""
    body = {}
    if name and domain:
        body = {'name': name, 'domain': domain}
    r = requests.post(TMIO_BASE + '/v3/email/new', headers=TMIO_HEADERS, json=body or None, timeout=timeout)
    r.raise_for_status()
    return r.json()


def tmio_messages(email: str, timeout=25):
    """GET /v3/email/{email}/messages"""
    r = requests.get(f'{TMIO_BASE}/v3/email/{email}/messages', headers=TMIO_HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()


def tmio_message(message_id: str, timeout=25):
    """GET /v3/message/{id}"""
    r = requests.get(f'{TMIO_BASE}/v3/message/{message_id}', headers=TMIO_HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()


# ════════════════════════════════════════════════════════════════
#  کلاینت یکپارچه
# ════════════════════════════════════════════════════════════════
HD_DOMAINS = ['gmail10p.com', 'oletters.com', 'oemails.com', 'oegmail.com',
              'suiemail.com', 'voewo.com', 'yanemail.com', 'tempmail.edu.pl', 'rommiui.com']


class TempMailClient:
    """کلاینت یکپارچه ۴ سرویس ایمیل موقت اپ Instant Mail"""

    def __init__(self, service: str = 'HD'):
        assert service in ('HD', 'HD_GMAIL', 'temp-mail', 'temp-mail-io')
        self.service = service

    # ---------- ساخت ایمیل ----------
    def create(self, email: str = None, name: str = None, domain: str = None) -> dict:
        """
        خروجی همیشه: {'service', 'email', 'token', 'raw'}
          - HD:        email دلخواه روی دامنه‌های HD_DOMAINS (توکن = id باکس)
          - HD_GMAIL:  آدرس gmail.com (ترفند نقطه) — پریمیوم
          - temp-mail: تصادفی از سرور (~۲ روز اعتبار)
          - temp-mail-io: تصادفی یا name@domain
        """
        if self.service in ('HD', 'HD_GMAIL'):
            if email is None:
                name = name or ''.join(random.choices(string.ascii_lowercase + string.digits, k=15))
                domain = domain or random.choice(HD_DOMAINS)
                email = f'{name}@{domain}'
            d = hd_request(HD_BASES[self.service], 'POST',
                           '/g-mail' if self.service == 'HD_GMAIL' else '/email',
                           data={'email': email})
            return {'service': self.service, 'email': d['email'], 'token': d['id'], 'raw': d}

        if self.service == 'temp-mail':
            d = tmorg_create()
            return {'service': self.service, 'email': d['mailbox'], 'token': d['token'], 'raw': d}

        # temp-mail-io
        d = tmio_create(name=name, domain=domain)
        return {'service': self.service, 'email': d['email'], 'token': d['token'], 'raw': d}

    # ---------- دریافت پیام‌ها ----------
    def get_messages(self, box: dict) -> list:
        s = box['service']
        if s in ('HD', 'HD_GMAIL'):
            return hd_request(HD_BASES[s], 'GET', f"/email/{box['token']}/messages",
                              params={'email': box['email']})
        if s == 'temp-mail':
            return tmorg_messages(box['token'])
        return tmio_messages(box['email'])

    # ---------- دریافت یک پیام کامل ----------
    def get_message(self, box: dict, message_id: str) -> dict:
        s = box['service']
        if s in ('HD', 'HD_GMAIL'):
            return hd_request(HD_BASES[s], 'GET', f"/email/{box['token']}/messages/{message_id}",
                              params={'email': box['email']})
        if s == 'temp-mail':
            return tmorg_message(box['token'], message_id)
        return tmio_message(message_id)

    # ---------- دامنه‌ها ----------
    def get_domains(self) -> list:
        if self.service in ('HD', 'HD_GMAIL'):
            return list(HD_DOMAINS)          # از remoteConfig (hdDomainsStr)
        if self.service == 'temp-mail':
            return ['random.com']            # اپ همین را هاردکد کرده
        return tmio_domains()


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(description='Instant Mail temp-mail API client')
    p.add_argument('service', nargs='?', default='HD',
                   choices=['HD', 'HD_GMAIL', 'temp-mail', 'temp-mail-io'])
    p.add_argument('--email', help='آدرس دلخواه (فقط HD/HD_GMAIL)')
    args = p.parse_args()
    c = TempMailClient(args.service)
    box = c.create(email=args.email)
    print(json.dumps(box, ensure_ascii=False, indent=2, default=str))
    print('waiting 3s ...')
    time.sleep(3)
    print('messages:', json.dumps(c.get_messages(box), ensure_ascii=False)[:400])
