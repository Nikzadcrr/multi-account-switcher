#!/usr/bin/env python3
# تطبیق مستقیم RGB قطعه روی bg (وزن‌دار با آلفا) — دقیق‌ترین روش، بدون فرضیهٔ رنگ
import subprocess, time, random, json, base64, io, sys
import numpy as np
from PIL import Image

def ab(*args):
    return subprocess.run(['agent-browser', *args], capture_output=True, text=True).stdout

def abjson(expr):
    out = ab('eval', expr).strip()
    if out.startswith('"'):
        try: out = json.loads(out)
        except Exception: pass
    try: return json.loads(out)
    except Exception: return out

def to_arr(src):
    if src.startswith('http'):
        import urllib.request
        req = urllib.request.Request(src, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://chat.qwen.ai/'})
        raw = urllib.request.urlopen(req, timeout=20).read()
        img = Image.open(io.BytesIO(raw))
    else:
        img = Image.open(io.BytesIO(base64.b64decode(src.split(',', 1)[1])))
    return np.asarray(img.convert('RGBA')).astype(float)

bg_url = abjson("document.querySelector('img.puzzle').src")
piece_url = abjson("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
bg = to_arr(bg_url)
strip = to_arr(piece_url)
H, W = bg.shape[:2]
sh, sw = strip.shape[:2]
rgb = bg[:, :, :3]

alpha = strip[:, :, 3]
m = alpha > 100
srgb = strip[:, :, :3]

rows = np.argwhere(m.any(axis=1)).flatten()
r0 = int(rows.min())
ylo = max(0, r0 - 6)
yhi = max(ylo, min(H - sh, r0 + 6))

pys, pxs = np.argwhere(m).T
pvals = srgb[m]  # [N,3]
N = len(pys)
print('template px:', N)

# وزن: پیکسل‌های پرآلفا بیشتر
w = (alpha[m] / 255.0)
w = w / w.sum()

best, best_sc = None, 1e18
scores = []
for offx in range(4, W - sw + 1):
    for offy in range(ylo, yhi + 1):
        ys = pys + offy
        xs = pxs + offx
        if (ys >= H).any() or (xs >= W).any(): continue
        bv = rgb[ys, xs]  # [N,3]
        d = np.sqrt(((bv - pvals) ** 2).sum(axis=1))
        sc = float((d * w).sum())
        scores.append((sc, offx, offy))
        if sc < best_sc:
            best_sc, best = sc, (offx, offy)

scores.sort()
print('best:', best, 'score:', round(best_sc, 1))
print('top5:', [(s[1], s[2], round(s[0], 1)) for s in scores[:5]])

gx = best[0]
pcounts = m.sum(axis=0)
mx = pcounts.max()
pml = next(x for x, c in enumerate(pcounts) if c >= 0.8 * mx)
delta_natural = gx - pml
print('piece main_left:', pml, '→ Δ natural =', delta_natural)

# تأیید بصری
vis = rgb.astype(np.uint8).copy()
vis[:, gx:gx + 2] = [255, 0, 0]
vis[:, min(W, gx + sw - 2):min(W, gx + sw)] = [0, 128, 255]
vis[best[1]:best[1] + 2, gx:gx + sw] = [255, 0, 0]
Image.fromarray(vis).resize((W * 3, H * 3), Image.NEAREST).save('/tmp/slider_vis3.png')
print(json.dumps({'gx': gx, 'gy': best[1], 'delta_natural': delta_natural, 'score': round(best_sc, 1)}))
