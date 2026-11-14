#!/usr/bin/env python3
# حل زندهٔ اسلایدر qwen با agent-browser — همان الگوریتم ماژول افزونه
import subprocess, time, random, json, base64, re, sys
import numpy as np
from PIL import Image
import io

def ab(*args):
    return subprocess.run(['agent-browser', *args], capture_output=True, text=True).stdout

def abjson(expr):
    out = ab('eval', expr).strip()
    if out.startswith('"'):
        try: out = json.loads(out)
        except Exception: pass
    try:
        return json.loads(out)
    except Exception:
        return out  # رشتهٔ خام (مثل data URL) را برگردان

def grab_img_dataurl(expr):
    s = abjson(expr)
    if not s or not str(s).startswith('data:'):
        print('NO_IMG:', str(s)[:80]); return None
    return s

def to_arr(dataurl, mode='RGBA'):
    img = Image.open(io.BytesIO(base64.b64decode(dataurl.split(',',1)[1])))
    return np.asarray(img.convert(mode)).astype(float)

def detect_gap(bg, piece):
    H, W = bg.shape[:2]
    alpha_mask = piece[:,:,3] > 180
    if not alpha_mask.any(): return None
    pg = piece[:,:,:3].mean(axis=2)
    rows = np.argwhere(alpha_mask.any(axis=1)).flatten()
    r0, r1 = rows.min(), rows.max()
    m = alpha_mask[r0:r1+1]
    pys, pxs = np.argwhere(m).T
    pvals = pg[r0:r1+1][pys, pxs]
    ph = r1 - r0 + 1
    shape_left = int(pxs.min())
    gray = bg.mean(axis=2)
    best, best_sc = None, 1e18
    for a in (0.40, 0.50, 0.60):
        for offy in range(0, H - ph):
            for offx in range(20, W - 52):
                vals = gray[offy:offy+ph][pys, pxs + offx]
                orig = (vals - a*255) / (1 - a)
                sc = np.abs(orig - pvals).mean()
                if sc < best_sc: best_sc, best = sc, (offx, offy, a)
    return {'dx': int(best[0]) - shape_left, 'x': int(best[0]), 'y': int(best[1]),
            'alpha': float(best[2]), 'score': float(round(best_sc,1)), 'shape_left': shape_left}

# ۱) استخراج تصاویر
bg_url = grab_img_dataurl("document.querySelector('img.puzzle').src")
piece_url = grab_img_dataurl("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
if not bg_url or not piece_url:
    print('EXTRACT_FAIL'); sys.exit(1)

bgarr = to_arr(bg_url)
piecearr = to_arr(piece_url)
print('bg natural:', bgarr.shape, '| piece natural:', piecearr.shape)

# اندازهٔ نمایش‌داده‌شدهٔ bg برای مقیاس
disp = abjson("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); return JSON.stringify({w: b.width, h: b.height}); })()")
scale = disp['w'] / bgarr.shape[1]
print('display:', disp, 'scale:', round(scale,3))

res = detect_gap(bgarr, piecearr)
print('detect:', json.dumps(res))
if not res or res['dx'] <= 0:
    print('DETECT_FAIL'); sys.exit(1)

target = int(round(res['dx'] * scale))
print('target dx (css px):', target)

# ۲) دستگیره
hx = abjson("(() => { const h=document.querySelector('.slider-move'); const r=h.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}); })()")
print('handle center:', hx)
X0, Y0 = hx['x'], hx['y']

# ۳) مسیّر انسانی با اورشوت
points = []
overshoot = target + random.randint(6, 11)
for i in range(1, 27):
    u = i / 26
    points.append(overshoot * (1 - (1-u)**2.2))
for i in range(1, 8):
    points.append(overshoot - (overshoot - target) * (i/7.0))
points.append(target)

ab('mouse', 'move', str(X0), str(Y0)); time.sleep(random.uniform(0.25, 0.4))
ab('mouse', 'down', 'left'); time.sleep(random.uniform(0.15, 0.3))
prev = 0
for px_ in points:
    ix = int(round(px_))
    if ix == prev: continue
    jy = random.choice([0,0,0,-1,1])
    ab('mouse', 'move', str(X0 + ix), str(Y0 + jy))
    time.sleep(random.uniform(0.008, 0.022))
    prev = ix
time.sleep(random.uniform(0.25, 0.45))
ab('mouse', 'up', 'left')

# ۴) بررسی نتیجه
time.sleep(4)
state = abjson("(() => { const h=document.querySelector('.slider-move'); const p=document.querySelector('img.puzzle'); return JSON.stringify({slider: h? 'EXISTS':'GONE', puzzle: p? 'EXISTS':'GONE', body: (document.body.innerText||'').slice(0,260).replace(/\n/g,' | ')}); })()")
print('after state:', json.dumps(state, ensure_ascii=False)[:600])
solved = state.get('puzzle') == 'GONE' or 'success' in str(state.get('body','')).lower() or '验证成功' in str(state.get('body','')) or 'وارد' in str(state.get('body',''))
print('SOLVED' if solved else 'NOT_SURE')
