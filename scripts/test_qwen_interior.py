#!/usr/bin/env python3
# تطبیق ماسک قطعه با «داخل حفره» (پر کردن سیلابی از بیرون) — روش قطعی
import subprocess, time, random, json, base64, io, sys
from collections import deque
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

# حلقه: رنگ اسلیت‌گری مشخص
ring_color = np.array([112.0, 128.0, 144.0])
dist = np.sqrt(((rgb - ring_color) ** 2).sum(axis=2))
ring = dist < 42

# سیلابی از گوشه‌ها — عبور از سلول‌های غیر حلقه
ext = np.zeros((H, W), dtype=bool)
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if not ring[y, x] and not ext[y, x]:
            ext[y, x] = True; dq.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if not ring[y, x] and not ext[y, x]:
            ext[y, x] = True; dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny, nx_ = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx_ < W and not ring[ny, nx_] and not ext[ny, nx_]:
            ext[ny, nx_] = True
            dq.append((ny, nx_))
interior = ~ext & ~ring
print('ring px:', int(ring.sum()), '| interior px:', int(interior.sum()))

alpha = strip[:, :, 3]
pm = alpha > 100
print('piece mask px:', int(pm.sum()))

# اگر حلقه نشتی داشته باشد، interior کل تصویر می‌شود → چک
if interior.sum() > 0.5 * H * W:
    print('LEAK! ring not closed — افزایش تلورانس')
    ring = dist < 60
    # سیلابی دوباره
    ext = np.zeros((H, W), dtype=bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if not ring[y, x] and not ext[y, x]: ext[y, x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if not ring[y, x] and not ext[y, x]: ext[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx_ = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx_ < W and not ring[ny, nx_] and not ext[ny, nx_]:
                ext[ny, nx_] = True; dq.append((ny, nx_))
    interior = ~ext & ~ring
    print('interior after retune:', int(interior.sum()))

# جست‌وجو: بیشترین پوشش ماسک قطعه توسط داخل حفره
iys, ixs = np.argwhere(interior).T
inter_set = set(zip(iys.tolist(), ixs.tolist()))

rows = np.argwhere(pm.any(axis=1)).flatten()
r0 = int(rows.min())
pys, pxs = np.argwhere(pm).T
N = len(pys)

ylo = max(0, r0 - 6)
yhi = max(ylo, min(H - sh, r0 + 6))
best, best_sc = None, -1
results = []
for offx in range(4, W - sw + 1):
    for offy in range(ylo, yhi + 1):
        ys = pys + offy
        xs = pxs + offx
        if (ys >= H).any() or (xs >= W).any() or (xs < 0).any(): continue
        hit = sum(1 for y, x in zip(ys.tolist(), xs.tolist()) if (y, x) in inter_set)
        sc = hit / N
        results.append((sc, offx, offy))
        if sc > best_sc:
            best_sc, best = sc, (offx, offy)
results.sort(reverse=True)
print('best:', best, 'coverage:', round(best_sc, 3))
print('top5:', [(r[1], r[2], round(r[0], 3)) for r in results[:5]])

gx = best[0]
pcounts = pm.sum(axis=0)
mx = pcounts.max()
pml = next(x for x, c in enumerate(pcounts) if c >= 0.8 * mx)
delta_natural = gx - pml
print('piece main_left:', pml, '→ Δ natural =', delta_natural)

vis = rgb.astype(np.uint8).copy()
vis[:, gx:gx + 2] = [255, 0, 0]
vis[best[1]:best[1] + 2, gx:gx + sw] = [255, 0, 0]
Image.fromarray(vis).resize((W * 3, H * 3), Image.NEAREST).save('/tmp/slider_vis4.png')
print(json.dumps({'gx': gx, 'gy': best[1], 'delta_natural': delta_natural, 'coverage': round(best_sc, 3)}))
