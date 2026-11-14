#!/usr/bin/env python3
# تشخیص گپ با نقشهٔ لبه + شکل قطعه — مستقل از آلفا، برای رندر سفید/تیرهٔ علی‌بابا
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

def detect_gap_edge(bg_rgba, piece_rgba):
    """امتیاز لبه: هم‌پوشانی کانتور شکل قطعه با نقشهٔ گرادیان bg."""
    H, W = bg_rgba.shape[:2]
    gray = bg_rgba[:, :, :3].mean(axis=2)
    # گرادیان (sobel ساده)
    gx = np.abs(np.diff(gray, axis=1))
    gy = np.abs(np.diff(gray, axis=0))
    E = np.zeros_like(gray)
    E[:, :-1] += gx
    E[:-1, :] += gy

    alpha = piece_rgba[:, :, 3]
    m = alpha > 128
    # کانتور: پیکسل شکل که همسایه‌اش خارج شکل است
    cont = np.zeros_like(m)
    cont[1:-1, 1:-1] = (
        m[1:-1, 1:-1]
        & ~(m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:])
    )
    pys, pxs = np.argwhere(cont).T
    if not len(pys): return None
    ph, pw = alpha.shape

    best, best_sc = None, -1
    for offy in range(0, H - ph + 1):
        for offx in range(10, W - pw + 1):
            ys = pys + offy
            xs = pxs + offx
            ok = (ys < H) & (xs < W)
            if not ok.all():
                continue
            sc = E[ys, xs].mean()
            if sc > best_sc:
                best_sc, best = sc, (offx, offy)
    return {'x': int(best[0]), 'y': int(best[1]), 'score': round(float(best_sc), 1)}

bg_url = abjson("document.querySelector('img.puzzle').src")
piece_url = abjson("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
bg = to_arr(bg_url); piece = to_arr(piece_url)
print('bg:', bg.shape[1], 'x', bg.shape[0], '| piece:', piece.shape[1], 'x', piece.shape[0])

rects = abjson("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); const p=Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).getBoundingClientRect(); return JSON.stringify({bg:{x:b.x,y:b.y,w:b.width,h:b.height}, piece:{x:p.x,y:p.y,w:p.width,h:p.height}}); })()")
scale = rects['bg']['w'] / bg.shape[1]
alpha = piece[:, :, 3]
pys, pxs = np.argwhere(alpha > 128).T
shape_left = int(pxs.min())
strip_x_css = rects['piece']['x'] - rects['bg']['x']
piece_scale = rects['piece']['w'] / piece.shape[1]
shape_now_css = strip_x_css + shape_left * piece_scale
print(f'scale={scale:.3f} shape_left={shape_left} shape_now_css={shape_now_css:.1f}')

res = detect_gap_edge(bg, piece)
print('edge detect:', json.dumps(res))
delta_natural = res['x'] - shape_left
delta_css = delta_natural * scale
print(f'Δ natural={delta_natural} css={delta_css:.1f}')

# drag
hx = abjson("(() => { const h=document.querySelector('.slider-move'); const r=h.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}); })()")
X0, Y0 = hx['x'], hx['y']
target = int(round(delta_css))
points = []
overshoot = target + random.randint(6, 10)
for i in range(1, 27):
    u = i / 26
    points.append(overshoot * (1 - (1 - u) ** 2.2))
for i in range(1, 8):
    points.append(overshoot - (overshoot - target) * (i / 7.0))
points.append(target)
ab('mouse', 'move', str(X0), str(Y0)); time.sleep(random.uniform(0.25, 0.4))
ab('mouse', 'down', 'left'); time.sleep(random.uniform(0.15, 0.3))
prev = 0
for px_ in points:
    ix = int(round(px_))
    if ix == prev: continue
    jy = random.choice([0, 0, 0, -1, 1])
    ab('mouse', 'move', str(X0 + ix), str(Y0 + jy))
    time.sleep(random.uniform(0.008, 0.022))
    prev = ix
time.sleep(random.uniform(0.25, 0.45))
ab('mouse', 'up', 'left')

time.sleep(4)
st = abjson("(() => { const h=document.querySelector('.slider-move'); const p=document.querySelector('img.puzzle'); return JSON.stringify({slider: h ? 'EXISTS' : 'GONE', puzzle: p ? 'EXISTS' : 'GONE', body: (document.body.innerText||'').slice(0,400).replace(/\\n/g,' | ')}); })()")
if isinstance(st, str):
    try: st = json.loads(st)
    except Exception: pass
print('after:', json.dumps(st, ensure_ascii=False)[:600])
ok = isinstance(st, dict) and (st.get('puzzle') == 'GONE' and st.get('slider') == 'GONE')
print('SOLVED ✓' if ok else 'STILL THERE')
