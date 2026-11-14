# -*- coding: utf-8 -*-
"""Fetch real captcha images from real sites (gushiwen is classic scraping-practice site)"""
import os, urllib.request, time

os.makedirs('/tmp/real_caps', exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

sources = [
    ('gushiwen', 'https://so.gushiwen.cn/RandCode.ashx'),
    ('douban_book', None),  # test later
    ('item_item', None),
]

ok = 0
for i in range(5):
    try:
        req = urllib.request.Request('https://so.gushiwen.cn/RandCode.ashx', headers=UA)
        data = urllib.request.urlopen(req, timeout=10).read()
        if len(data) < 500:
            print(f"gushiwen {i}: too small {len(data)}"); continue
        p = f'/tmp/real_caps/gsw_{i}.png'
        with open(p, 'wb') as f:
            f.write(data)
        print(f"gushiwen {i}: saved {len(data)}B")
        ok += 1
        time.sleep(0.4)
    except Exception as e:
        print(f"gushiwen {i}: FAIL {e}")

print(f"total real: {ok}")
