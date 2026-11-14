#!/usr/bin/env python3
# تشخیص گپ با تطبیق کانتور قطعه روی ماسک رنگ حلقه + تأیید بصری با نقاشی مارکر
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

# ---------- استخراج ----------
bg_url = abjson("document.querySelector('img.puzzle').src")
piece_url = abjson("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
bg = to_arr(bg_url)          # [H,W,4] (alpha=255)
strip = to_arr(piece_url)    # [H,52,4]
H, W = bg.shape[:2]
print('bg:', W, 'x', H, '| strip:', strip.shape[1], 'x', strip.shape[0])

# ---------- کانتور قطعه ----------
alpha = strip[:, :, 3]
m = alpha > 100
cont = np.zeros_like(m)
cont[1:-1, 1:-1] = m[1:-1, 1:-1] & ~(m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:])
pys, pxs = np.argwhere(cont).T
print('contour px count:', len(pys))

# رنگ حلقه از پیکسل‌های کانتور قطعه (حلقهٔ دور قطعه داخل strip کشیده شده)
pc = strip[:, :, :3][cont]
ring_color = np.median(pc, axis=0)
print('ring color (from strip):', np.round(ring_color, 1))

# ---------- ماسک حلقه در bg ----------
dist = np.sqrt(((bg[:, :, :3] - ring_color) ** 2).sum(axis=2))
ring_mask = dist < 55
print('ring mask px:', int(ring_mask.sum()))

# فقط ردیف‌های شکل قطعه (با کمی حاشیه) جست‌وجو شود
rows = np.argwhere(m.any(axis=1)).flatten()
r0, r1 = int(rows.min()), int(rows.max())

best, best_sc = None, -1
ylo = max(0, r0 - 8)
yhi = min(H - strip.shape[0], r0 + 8)
if yhi < ylo:
    yhi = ylo
for offy in range(ylo, yhi + 1):
    for offx in range(6, W - strip.shape[1] + 1):
        ys = pys + offy
        xs = pxs + offx
        ok = (ys >= 0) & (ys < H) & (xs >= 0) & (xs < W)
        if not ok.all(): continue
        sc = ring_mask[ys, xs].mean()
        if sc > best_sc:
            best_sc, best = sc, (offx, offy)
print('contour match:', best, 'score:', round(float(best_sc), 3))

# ماسک حلقهٔ bg ممکن است حلقهٔ دور «قطعه» هم شامل شود (چون قطعه روی bg نیست — strip جدا است؛ فقط گپ دارد)
gx = best[0]

# ---------- تأیید بصری: مارکر روی bg ----------
vis = bg[:, :, :3].astype(np.uint8).copy()
vis[:, gx:gx + 2] = [255, 0, 0]          # لبهٔ چپ گپ شناسایی‌شده
vis[:, min(W, gx + strip.shape[1] - 3):min(W, gx + strip.shape[1] - 1)] = [0, 128, 255]
vis[best[1]:best[1] + 2, gx:gx + strip.shape[1]] = [255, 0, 0]
Image.fromarray(vis).resize((W * 3, H * 3), Image.NEAREST).save('/tmp/slider_vis.png')
print('saved /tmp/slider_vis.png — قرمز=لبهٔ چپ گپ، آبی=لبهٔ راست، افقی=بالا')

# شکل قطعه: main body left (ارتفاع ستون >= 0.8*max)
pcounts = m.sum(axis=0)
mx = pcounts.max()
pml = next(x for x, c in enumerate(pcounts) if c >= 0.8 * mx)
delta_natural = gx - pml
print('piece main_body_left:', pml, '→ Δ natural =', delta_natural)
print(json.dumps({'delta_natural': delta_natural, 'match_score': float(best_sc), 'gx': gx}))
