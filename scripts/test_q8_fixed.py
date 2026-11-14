# -*- coding: utf-8 -*-
"""q8 model with CORRECT charset (8210) - replicating ddddocr v5 decode exactly"""
import os, time
import numpy as np
from PIL import Image
import onnxruntime as ort
from ddddocr.charsets import CHARSET_OLD, CHARSET_BETA

sess = ort.InferenceSession('/tmp/ddddocr_web/common_q8.onnx', providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0].name
print(f"classes: 8210 | CHARSET_OLD len={len(CHARSET_OLD)} first3={CHARSET_OLD[:3]}")

def predict(pil_img, charset):
    w0, h0 = pil_img.size
    w = int(w0 * (64 / h0))
    img = pil_img.convert('RGB').resize((w, 64), Image.LANCZOS).convert('L')
    arr = np.asarray(img, dtype=np.float32) / 255.0
    t = arr[None, None, :, :]
    out = sess.run(None, {inp: t})[0]           # [seq,1,8210]
    pred_idx = np.argmax(out[:, 0, :], axis=1)  # argmax per timestep
    # CTC: remove consecutive dups + blank (index 0)
    idxs, last = [], -1
    for i in pred_idx:
        i = int(i)
        if i != last and i != 0:
            idxs.append(i)
        last = i
    return ''.join(charset[i] for i in idxs if 0 <= i < len(charset))

for name, cs in [('OLD', CHARSET_OLD), ('BETA', CHARSET_BETA)]:
    d = '/tmp/captchas'
    files = sorted(os.listdir(d))
    ok = 0; fails = []; t0 = time.time()
    for fn in files:
        truth = fn.split('_')[-1].replace('.png', '')
        pred = predict(Image.open(f'{d}/{fn}'), cs).strip()
        if pred.lower() == truth.lower(): ok += 1
        else: fails.append((truth, pred))
    dt = time.time() - t0
    print(f"\n=== q8 + CHARSET_{name}: {ok}/{len(files)} = {100*ok/len(files):.1f}% | avg {dt/len(files)*1000:.0f}ms ===")
    for t_, p_ in fails[:8]: print(f"  FAIL: truth={t_} pred={p_}")
