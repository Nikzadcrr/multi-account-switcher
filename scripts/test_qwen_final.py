#!/usr/bin/env python3
# نهایی: حلقهٔ خاکستری خنثی → سیلابی داخل → تطبیق پوشش ماسک قطعه
import subprocess, json, base64, io, sys
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

def flood_interior(ring, H, W):
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
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not ring[ny, nx] and not ext[ny, nx]:
                ext[ny, nx] = True; dq.append((ny, nx))
    return ~ext & ~ring

bg_url = abjson("document.querySelector('img.puzzle').src")
piece_url = abjson("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
bg = to_arr(bg_url)
strip = to_arr(piece_url)
H, W = bg.shape[:2]
sh, sw = strip.shape[:2]
rgb = bg[:, :, :3]
mx = rgb.max(axis=2); mn = rgb.min(axis=2)
gray = rgb.mean(axis=2)
sat = mx - mn

# حلقهٔ خاکستری خنثی
ring = (sat < 16) & (gray >= 95) & (gray <= 150)
print('ring px:', int(ring.sum()))
interior = flood_interior(ring, H, W)
ipx = int(interior.sum())
print('interior px:', ipx)

# اگر نشت کرد، حلقه را ضخیم‌تر کن (فرسایش ext = اتساع ring)
tries = 0
while (ipx > 8000 or ipx < 500) and tries < 4:
    tries += 1
    # اتساع حلقه ۱-۲ پیکسل برای بستن شکاف‌ها
    r2 = ring.copy()
    r2[1:, :] |= ring[:-1, :]; r2[:-1, :] |= ring[1:, :]
    r2[:, 1:] |= ring[:, :-1]; r2[:, :-1] |= ring[:, 1:]
    if tries >= 2:
        r2[2:, :] |= ring[:-2, :]; r2[:-2, :] |= ring[2:, :]
        r2[:, 2:] |= ring[:, :-2]; r2[:, :-2] |= ring[:, 2:]
    ring = r2
    interior = flood_interior(ring, H, W)
    ipx = int(interior.sum())
    print(f'try {tries}: ring={int(ring.sum())} interior={ipx}')

alpha = strip[:, :, 3]
pm = alpha > 100
ppx = int(pm.sum())
print('piece mask px:', ppx)

pys, pxs = np.argwhere(pm).T
rows = np.argwhere(pm.any(axis=1)).flatten()
r0 = int(rows.min())
ylo = max(0, r0 - 6)
yhi = max(ylo, min(H - sh, r0 + 6))
iys, ixs = np.argwhere(interior).T
isec = set(zip(iys.tolist(), ixs.tolist()))

results = []
for offx in range(4, W - sw + 1):
    for offy in range(ylo, yhi + 1):
        ys = pys + offy
        xs = pxs + offx
        if (ys >= H).any() or (xs >= W).any(): continue
        hit = sum(1 for y, x in zip(ys.tolist(), xs.tolist()) if (y, x) in isec)
        results.append((hit / ppx, offx, offy))
results.sort(reverse=True)
print('top5:', [(r[1], r[2], round(r[0], 3)) for r in results[:5]])
best = results[0]
gx = best[1]

pcounts = pm.sum(axis=0)
mxp = pcounts.max()
pml = next(x for x, c in enumerate(pcounts) if c >= 0.8 * mxp)
delta_natural = gx - pml
print('piece main_left:', pml, '→ Δ natural =', delta_natural)

vis = rgb.astype(np.uint8).copy()
vis[:, gx:gx+2] = [255, 0, 0]
vis[best[2]:best[2]+2, gx:gx+sw] = [255, 0, 0]
Image.fromarray(vis).resize((W*3, H*3), Image.NEAREST).save('/tmp/slider_vis6.png')
print(json.dumps({'gx': gx, 'gy': best[2], 'delta_natural': delta_natural, 'coverage': round(best[0], 3)}))
