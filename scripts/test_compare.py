# -*- coding: utf-8 -*-
"""Final comparison: browser fp32 vs q8 vs ddddocr beta vs vision LLM"""
import os, time, re
import numpy as np
from PIL import Image
import onnxruntime as ort

h = open('/tmp/ddddocr_web/demo.html', encoding='utf-8').read()
DEMO_CHARSET = re.search(r'const CHARSET\s*=\s*"(.+?)";', h, re.S).group(1)
print(f"demo charset: {len(DEMO_CHARSET)} chars, first 2: {DEMO_CHARSET[:2]!r}")

def preprocess(pil_img):
    w0, h0 = pil_img.size
    w = int(w0 * (64 / h0))
    img = pil_img.convert('L').resize((w, 64), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    return arr[None, None, :, :]

def ctc_decode(out, charset):
    pred = np.argmax(out[:, 0, :], axis=1)
    idxs, last = [], -1
    for i in pred:
        i = int(i)
        if i != last and i != 0:
            idxs.append(i)
        last = i
    return ''.join(charset[i] for i in idxs if 0 <= i < len(charset))

def run_session(path, charset, name):
    sess = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
    inp = sess.get_inputs()[0].name
    d = '/tmp/captchas'
    files = sorted(os.listdir(d))
    ok = 0; fails = []; t0 = time.time()
    for fn in files:
        truth = fn.split('_')[-1].replace('.png', '')
        out = sess.run(None, {inp: preprocess(Image.open(f'{d}/{fn}'))})[0]
        pred = ctc_decode(out, charset).strip()
        if pred.lower() == truth.lower(): ok += 1
        else: fails.append((truth, pred))
    dt = time.time() - t0
    print(f"{name:<38} {ok}/{len(files)} = {100*ok/len(files):5.1f}%  avg {dt/len(files)*1000:.0f}ms")
    return fails

f1 = run_session('/tmp/ddddocr_web/common.onnx', DEMO_CHARSET, 'browser fp32 + demo charset (52MB)')
f2 = run_session('/tmp/ddddocr_web/common_q8.onnx', DEMO_CHARSET, 'browser q8 + demo charset (13MB)')

import sys
sys.path.insert(0, '/usr/local/lib/python3/dist-packages')
import ddddocr
ocr = ddddocr.DdddOcr(show_ad=False, beta=True)
ok = 0; t0 = time.time(); fails3 = []
d = '/tmp/captchas'
files = sorted(os.listdir(d))
for fn in files:
    truth = fn.split('_')[-1].replace('.png', '')
    with open(f'{d}/{fn}', 'rb') as f: data = f.read()
    pred = ocr.classification(data).strip()
    if pred.lower() == truth.lower(): ok += 1
    else: fails3.append((truth, pred))
dt = time.time() - t0
print(f"{'ddddocr v5 beta (common_old 13MB)':<38} {ok}/{len(files)} = {100*ok/len(files):5.1f}%  avg {dt/len(files)*1000:.0f}ms")

print("\nfailures fp32:", [(t,p) for t,p in f1[:6]])
print("failures q8  :", [(t,p) for t,p in f2[:6]])
print("failures beta:", [(t,p) for t,p in fails3[:6]])
