# -*- coding: utf-8 -*-
"""Replicate ddddocr_web browser pipeline in Python (q8 model) -> validate MV3 path"""
import re, os, time
import numpy as np
from PIL import Image

# 1) extract CHARSET from demo.html
h = open('/tmp/ddddocr_web/demo.html', encoding='utf-8').read()
m = re.search(r'const CHARSET\s*=\s*"(.+?)";', h, re.S)
CHARSET = m.group(1)
print(f"CHARSET chars: {len(CHARSET)}")

# 2) load q8 model
import onnxruntime as ort
sess = ort.InferenceSession('/tmp/ddddocr_web/common_q8.onnx', providers=['CPUExecutionProvider'])
inp_name = sess.get_inputs()[0].name
print(f"model input: {inp_name} shape={sess.get_inputs()[0].shape}")

def preprocess(img):
    w0, h0 = img.size
    h = 64
    w = int(w0 * (h / h0))
    img = img.convert('RGB').resize((w, h), Image.LANCZOS)
    # grayscale ITU-R 601-2 (matches PIL 'L' convert, same as 0.299/0.587/0.114)
    g = np.asarray(img.convert('L'), dtype=np.float32) / 255.0
    return g[None, None, :, :]  # [1,1,64,W]

def ctc_decode(out):
    # out shape [seq, 1, num_classes]
    seq = out.shape[0]
    nc = out.shape[2]
    idxs = []
    last = -1
    for i in range(seq):
        j = int(np.argmax(out[i, 0]))
        if j != last and j != 0:
            idxs.append(j)
        last = j
    return ''.join(CHARSET[i] for i in idxs if i < len(CHARSET))

def predict(pil_img):
    t = preprocess(pil_img)
    out = sess.run(None, {inp_name: t})[0]
    return ctc_decode(out)

# 3) test on generated captchas
d = '/tmp/captchas'
files = sorted(os.listdir(d))
ok = 0; fails = []; t0 = time.time()
for fn in files:
    truth = fn.split('_')[-1].replace('.png', '')
    pred = predict(Image.open(f'{d}/{fn}')).strip()
    if pred.lower() == truth.lower(): ok += 1
    else: fails.append((truth, pred))
dt = time.time() - t0
print(f"\n=== Q8 browser-pipeline: {ok}/{len(files)} = {100*ok/len(files):.1f}% | avg {dt/len(files)*1000:.0f}ms ===")
for t, p in fails: print(f"  FAIL: truth={t} pred={p}")
