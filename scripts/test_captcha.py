# -*- coding: utf-8 -*-
"""Test ddddocr on generated captchas - accuracy benchmark for extension agent"""
import os, sys, io, time
import captcha.image
from captcha.image import ImageCaptcha
import random, string

sys.path.insert(0, '/usr/local/lib/python3/dist-packages')

# ---- generate test captchas ----
CHARS = string.digits + string.ascii_lowercase
outdir = '/tmp/captchas'
os.makedirs(outdir, exist_ok=True)

gen = ImageCaptcha(width=160, height=60)
tests = []
random.seed(42)
for i in range(30):
    # mix of lengths 4-6 like real sites
    n = random.choice([4, 4, 5, 6])
    txt = ''.join(random.choice(CHARS) for _ in range(n))
    img = gen.generate_image(txt)
    p = f'{outdir}/cap_{i}_{txt}.png'
    img.save(p)
    tests.append((p, txt))

print(f"Generated {len(tests)} captchas")

# ---- ddddocr inference ----
import ddddocr
ocr = ddddocr.DdddOcr(show_ad=False)

ok = 0
fails = []
t0 = time.time()
for p, truth in tests:
    with open(p, 'rb') as f:
        data = f.read()
    pred = ocr.classification(data)
    match = (pred.lower() == truth.lower())
    if match:
        ok += 1
    else:
        fails.append((truth, pred))
dt = time.time() - t0

print(f"\n=== RESULT: {ok}/{len(tests)} = {100*ok/len(tests):.1f}% accuracy, total {dt:.2f}s, avg {dt/len(tests)*1000:.0f}ms/image ===")
for truth, pred in fails:
    print(f"  FAIL: truth={truth}  pred={pred}")

# model file location/size
import ddddocr, pathlib
mp = pathlib.Path(ddddocr.__file__).parent
for f in mp.glob('*.onnx'):
    print(f"MODEL: {f} size={f.stat().st_size/1024/1024:.1f}MB")
for f in mp.glob('*.json'):
    print(f"CHARSET: {f} size={f.stat().st_size/1024:.1f}KB")
