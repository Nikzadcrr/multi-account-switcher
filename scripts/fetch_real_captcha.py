# -*- coding: utf-8 -*-
"""Compare: ddddocr default vs beta mode vs vision LLM, on same captcha set"""
import os, sys, time, base64, json, urllib.request

# fetch real captchas from zhihu (real-world Chinese site captcha)
real = []
os.makedirs('/tmp/real_caps', exist_ok=True)
for i in range(6):
    try:
        req = urllib.request.Request('https://www.zhihu.com/api/v3/oauth/captcha?lang=en',
                                     headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                                              'Referer': 'https://www.zhihu.com/signup'})
        d = json.loads(urllib.request.urlopen(req, timeout=10).read())
        b64 = d['img_content']
        p = f'/tmp/real_caps/z{i}.jpg'
        with open(p, 'wb') as f:
            f.write(base64.b64decode(b64))
        real.append(p)
        print(f"saved real captcha {p} {len(b64)//1024}KB(b64)")
    except Exception as e:
        print(f"zhihu fail: {e}")
        break
print(f"real captchas: {len(real)}")
