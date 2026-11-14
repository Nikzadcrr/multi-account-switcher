#!/usr/bin/env python3
# فیلتر نهایی حلقه: اسلیت‌گری (B>R) + chamfer distance از کانتور قطعه تا حلقهٔ bg
import subprocess, json, base64, io, sys
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
R, G, B = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
gray = rgb.mean(axis=2)

# ماسک حلقه: رنگ اسلیت‌گری + آبی‌مایل + تیرهٔ متوسط
ring_color = np.array([112.0, 128.0, 144.0])
d = np.sqrt(((rgb - ring_color) ** 2).sum(axis=2))
ring = (d < 62) & ((B - R) >= 6) & (gray < 185) & (gray > 60)
print('ring px:', int(ring.sum()))

# distance transform ساده (chamfer 3-4)
INF = 1e9
dt = np.full((H, W), INF, dtype=float)
dt[ring] = 0
# پاس رو به جلو
for y in range(H):
    for x in range(W):
        v = dt[y, x]
        if v == 0: continue
        c = v
        if y > 0: c = min(c, dt[y-1, x] + 1)
        if x > 0: c = min(c, dt[y, x-1] + 1)
        if y > 0 and x > 0: c = min(c, dt[y-1, x-1] + 1.41)
        if y > 0 and x < W-1: c = min(c, dt[y-1, x+1] + 1.41)
        dt[y, x] = c
# پاس رو به عقب
for y in range(H-1, -1, -1):
    for x in range(W-1, -1, -1):
        v = dt[y, x]
        c = v
        if y < H-1: c = min(c, dt[y+1, x] + 1)
        if x < W-1: c = min(c, dt[y, x+1] + 1)
        if y < H-1 and x < W-1: c = min(c, dt[y+1, x+1] + 1.41)
        if y < H-1 and x > 0: c = min(c, dt[y+1, x-1] + 1.41)
        dt[y, x] = c

alpha = strip[:, :, 3]
pm = alpha > 100
cont = np.zeros_like(pm)
cont[1:-1, 1:-1] = pm[1:-1, 1:-1] & ~(pm[:-2, 1:-1] & pm[2:, 1:-1] & pm[1:-1, :-2] & pm[1:-1, 2:])
pys, pxs = np.argwhere(cont).T
print('contour px:', len(pys))

rows = np.argwhere(pm.any(axis=1)).flatten()
r0 = int(rows.min())
ylo = max(0, r0 - 6)
yhi = max(ylo, min(H - sh, r0 + 6))

results = []
for offx in range(4, W - sw + 1):
    for offy in range(ylo, yhi + 1):
        ys = pys + offy
        xs = pxs + offx
        if (ys >= H).any() or (xs >= W).any(): continue
        vals = dt[ys, xs]
        vals = np.where(vals >= INF, 30.0, vals)
        # امتیاز: میانگین فاصله + نسبت پیکسل‌های خیلی نزدیک (<=2)
        sc = vals.mean() - 4.0 * (vals <= 2.0).mean()
        results.append((sc, offx, offy, float((vals <= 2).mean())))
results.sort()
print('top5 (offx, offy, score, near%) :')
for r in results[:5]:
    print('  ', r[1], r[2], round(r[0], 2), round(r[3], 3))

best = results[0]
gx = best[1]
pcounts = pm.sum(axis=0)
mx = pcounts.max()
pml = next(x for x, c in enumerate(pcounts) if c >= 0.8 * mx)
delta_natural = gx - pml
print('piece main_left:', pml, '→ Δ natural =', delta_natural)

vis = rgb.astype(np.uint8).copy()
vis[:, gx:gx+2] = [255, 0, 0]
vis[best[2]:best[2]+2, gx:gx+sw] = [255, 0, 0]
Image.fromarray(vis).resize((W*3, H*3), Image.NEAREST).save('/tmp/slider_vis5.png')
print(json.dumps({'gx': gx, 'gy': best[2], 'delta_natural': delta_natural}))
