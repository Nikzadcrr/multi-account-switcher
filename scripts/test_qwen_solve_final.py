#!/usr/bin/env python3
# حل نهایی اسلایدر qwen: ring-core خنثی + chamfer + مسیّر انسانی + تأیید
import subprocess, json, base64, io, sys, time, random
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
    return np.asarray(img.convert('RGB')).astype(int)

def solve_current():
    bg_url = abjson("document.querySelector('img.puzzle').src")
    piece_url = abjson("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
    bg = to_arr(bg_url)
    strip = np.asarray(Image.open(io.BytesIO(base64.b64decode(piece_url.split(',',1)[1])) if piece_url.startswith('data:') else io.BytesIO(subprocess.run(['python3','-c',''],capture_output=True).stdout)).convert('RGBA')).astype(int) if False else None
    if piece_url.startswith('http'):
        import urllib.request
        req = urllib.request.Request(piece_url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://chat.qwen.ai/'})
        strip = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read())).convert('RGBA')).astype(int)
    else:
        strip = np.asarray(Image.open(io.BytesIO(base64.b64decode(piece_url.split(',', 1)[1]))).convert('RGBA')).astype(int)

    H, W = bg.shape[:2]
    sh, sw = strip.shape[:2]
    rgb = bg
    mx = rgb.max(axis=2); mn = rgb.min(axis=2)
    gray = rgb.mean(axis=2)
    sat = mx - mn
    ring = (sat < 16) & (gray >= 95) & (gray <= 150)

    INF = 1e9
    dt = np.full((H, W), float(INF))
    dt[ring] = 0
    for y in range(H):
        for x in range(W):
            if dt[y, x] == 0: continue
            c = dt[y, x]
            if y > 0: c = min(c, dt[y-1, x] + 1)
            if x > 0: c = min(c, dt[y, x-1] + 1)
            if y > 0 and x > 0: c = min(c, dt[y-1, x-1] + 1.41)
            if y > 0 and x < W-1: c = min(c, dt[y-1, x+1] + 1.41)
            dt[y, x] = c
    for y in range(H-1, -1, -1):
        for x in range(W-1, -1, -1):
            c = dt[y, x]
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
    rows = np.argwhere(pm.any(axis=1)).flatten()
    r0 = int(rows.min())
    ylo = max(0, r0 - 4)
    yhi = max(ylo, min(H - sh, r0 + 4))

    results = []
    for offx in range(4, W - sw + 1):
        for offy in range(ylo, yhi + 1):
            ys = pys + offy
            xs = pxs + offx
            if (ys >= H).any() or (xs >= W).any(): continue
            vals = dt[ys, xs]
            vals = np.where(vals >= INF, 30.0, vals)
            sc = vals.mean() - 2.0 * (vals <= 2.0).mean()
            results.append((sc, offx, offy))
    results.sort()
    return results[0], results[1] if len(results) > 1 else (None, None, None)

# --- اجرا ---
best, second = solve_current()
print('best (score, offx, offy):', tuple(round(v, 2) if isinstance(v, float) else v for v in best))
if second[0] is not None:
    print('second:', tuple(round(v, 2) if isinstance(v, float) else v for v in second))

rects = abjson("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); return JSON.stringify({w: b.width}); })()")
scale = rects['w'] / 296 if rects['w'] else 1.0

delta_css = int(round(best[1] * scale))
print(f'Δ natural={best[1]} scale={scale:.4f} → Δ css={delta_css}')

hx = abjson("(() => { const h=document.querySelector('.slider-move'); const r=h.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}); })()")
X0, Y0 = hx['x'], hx['y']
print('handle:', hx)

target = delta_css
points = []
overshoot = target + random.randint(5, 9)
for i in range(1, 31):
    u = i / 30
    points.append(overshoot * (1 - (1 - u) ** 2.1))
for i in range(1, 7):
    points.append(overshoot - (overshoot - target) * (i / 6.0))
points.append(target)
ab('mouse', 'move', str(X0), str(Y0)); time.sleep(random.uniform(0.3, 0.5))
ab('mouse', 'down', 'left'); time.sleep(random.uniform(0.15, 0.3))
prev = 0
for px_ in points:
    ix = int(round(px_))
    if ix == prev: continue
    jy = random.choice([0, 0, 0, -1, 1])
    ab('mouse', 'move', str(X0 + ix), str(Y0 + jy))
    time.sleep(random.uniform(0.006, 0.024))
    prev = ix
time.sleep(random.uniform(0.25, 0.4))
ab('mouse', 'up', 'left')

ok = False
for i in range(10):
    time.sleep(1)
    st = abjson("(() => { const p=document.querySelector('img.puzzle'); const h=document.querySelector('.slider-move'); const b=document.body.innerText||''; return JSON.stringify({puzzle: p?1:0, slider: h?1:0, ok: b.includes('验证成功'), next: b.includes('Enter verification') || b.includes('code')}); })()")
    if isinstance(st, str):
        try: st = json.loads(st)
        except Exception: pass
    if isinstance(st, dict) and (st.get('puzzle') == 0 or st.get('ok') or st.get('next')):
        ok = True
        print('state:', json.dumps(st))
        break
print('RESULT:', 'SOLVED ✓' if ok else 'FAILED')
