#!/usr/bin/env python3
# تشخیص گپ نهایی: کانتور قطعه روی (حلقهٔ دقیق + سفیدی داخل) — با تأیید بصری
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
rgb = bg[:, :, :3]
gray = rgb.mean(axis=2)
sat = rgb.max(axis=2) - rgb.min(axis=2)

alpha = strip[:, :, 3]
m = alpha > 100
# کانتور و داخل
cont = np.zeros_like(m)
cont[1:-1, 1:-1] = m[1:-1, 1:-1] & ~(m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:])
pys, pxs = np.argwhere(cont).T
# داخل = شکل با فرسایش ۳px
inner = m.copy()
for _ in range(3):
    n = inner.copy()
    n[1:-1, 1:-1] = inner[1:-1, 1:-1] & inner[:-2, 1:-1] & inner[2:, 1:-1] & inner[1:-1, :-2] & inner[1:-1, 2:]
    inner = n
iys, ixs = np.argwhere(inner).T
print('contour:', len(pys), 'inner:', len(iys))

# رنگ حلقه از کانتور قطعه
pc = strip[:, :, :3][cont]
ring_color = np.median(pc, axis=0)
print('ring color:', np.round(ring_color, 1))

dist = np.sqrt(((rgb - ring_color) ** 2).sum(axis=2))
ring_mask = dist < 28
white_mask = (gray > 180) & (sat < 48)
print('ring px:', int(ring_mask.sum()), '| white px:', int(white_mask.sum()))

rows = np.argwhere(m.any(axis=1)).flatten()
r0 = int(rows.min())
ylo = max(0, r0 - 6)
yhi = max(ylo, min(H - strip.shape[0], r0 + 6))

best, best_sc = None, -1
best2, best2_sc = None, -1
for offx in range(6, W - strip.shape[1] + 1):
    for offy in range(ylo, yhi + 1):
        ys, xs = pys + offy, pxs + offx
        if not ((ys < H).all() and (xs < W).all()): continue
        rsc = ring_mask[ys, xs].mean()
        iy, ix = iys + offy, ixs + offx
        wsc = white_mask[iy, ix].mean()
        sc = 0.45 * rsc + 0.55 * wsc
        if rsc > best2_sc:
            best2_sc, best2 = rsc, (offx, offy)
        if sc > best_sc:
            best_sc, best = sc, (offx, offy, rsc, wsc)

print('combined best:', best, 'score:', round(best_sc, 3))
print('ring-only best:', best2, 'score:', round(best2_sc, 3))
gx = best[0]

# تأیید بصری
vis = rgb.astype(np.uint8).copy()
vis[:, gx:gx + 2] = [255, 0, 0]
vis[:, min(W, gx + strip.shape[1] - 2):min(W, gx + strip.shape[1])] = [0, 128, 255]
vis[best[1]:best[1] + 2, gx:gx + strip.shape[1]] = [255, 0, 0]
Image.fromarray(vis).resize((W * 3, H * 3), Image.NEAREST).save('/tmp/slider_vis2.png')

pcounts = m.sum(axis=0)
mx = pcounts.max()
pml = next(x for x, c in enumerate(pcounts) if c >= 0.8 * mx)
delta_natural = gx - pml
print('piece main_left:', pml, '→ Δ natural =', delta_natural)
print(json.dumps({'gx': gx, 'gy': best[1], 'delta_natural': delta_natural,
                  'ring': round(best[2], 3), 'white': round(best[3], 3)}))
