#!/usr/bin/env python3
# استراتژی دوم تشخیص گپ: شکل سفید هدف (رندر qwen) + اجرای drag درست
import subprocess, time, random, json, base64, re, sys, io
import numpy as np
from PIL import Image

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
        return out

def to_arr(dataurl):
    if dataurl.startswith('http'):
        import urllib.request
        req = urllib.request.Request(dataurl, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://chat.qwen.ai/'})
        raw = urllib.request.urlopen(req, timeout=20).read()
        img = Image.open(io.BytesIO(raw))
    else:
        img = Image.open(io.BytesIO(base64.b64decode(dataurl.split(',', 1)[1])))
    return np.asarray(img.convert('RGBA')).astype(float)

def detect_gap_white(bg_rgba):
    """گپ سفید علی‌بابا: ستون‌هایی که پیکسل‌های روشن کم‌اشباع زیادی دارند."""
    H, W = bg_rgba.shape[:2]
    rgb = bg_rgba[:, :, :3]
    gray = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    mask = (gray > 200) & (sat < 40)
    # حذف ناحیهٔ دکمهٔ refresh بالا-راست و لبه‌ها
    mask[:int(H*0.12), :] = False
    counts = mask[:, :].sum(axis=0)  # per column
    runs = []
    in_run = False
    for x in range(10, W-10):
        if counts[x] >= 18 and not in_run:
            in_run, start = True, x
        elif counts[x] < 18 and in_run:
            in_run = False
            if x - start >= 30:
                runs.append((start, x))
    if in_run and (W-10) - start >= 30:
        runs.append((start, W-10))
    if not runs:
        return None
    # عریض‌ترین run = گپ
    runs.sort(key=lambda r: r[1]-r[0], reverse=True)
    start, end = runs[0]
    return {'left': int(start), 'right': int(end), 'width': int(end-start), 'runs': runs}

# ---- اجرا ----
bg_url = abjson("document.querySelector('img.puzzle').src")
piece_url = abjson("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
bgarr = to_arr(bg_url)
piecearr = to_arr(piece_url)
print('bg natural:', bgarr.shape[:2][::-1], 'piece:', piecearr.shape[:2][::-1])

rects = abjson("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); const p=Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).getBoundingClientRect(); return JSON.stringify({bg:{x:b.x,y:b.y,w:b.width,h:b.height}, piece:{x:p.x,y:p.y,w:p.width,h:p.height}}); })()")
print('rects:', json.dumps(rects))

scale = rects['bg']['w'] / bgarr.shape[1]

# شکل قطعه در نوار (آلفا)
palpha = piecearr[:, :, 3] > 128
pys, pxs = np.argwhere(palpha).T
shape_left = int(pxs.min())
shape_right = int(pxs.max())
print('piece shape_left(natural):', shape_left, 'shape_right:', shape_right, 'strip natural w:', piecearr.shape[1])

res = detect_gap_white(bgarr)
print('white gap:', json.dumps(res))
if not res:
    print('NO_GAP'); sys.exit(1)

# Δ = فاصلهٔ چپ گپ تا موقعیت فعلی شکل قطعه در bg
strip_x_in_bg = rects['piece']['x'] - rects['bg']['x']  # css px
shape_now_css = strip_x_in_bg + shape_left * (rects['piece']['w'] / piecearr.shape[1])
gap_left_css = res['left'] * scale
delta = gap_left_css - shape_now_css
print(f'strip_x_in_bg={strip_x_in_bg:.1f} shape_now_css={shape_now_css:.1f} gap_left_css={gap_left_css:.1f} → Δ={delta:.1f}')

hx = abjson("(() => { const h=document.querySelector('.slider-move'); const r=h.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}); })()")
X0, Y0 = hx['x'], hx['y']
print('handle:', hx)

target = int(round(delta))
points = []
overshoot = target + random.randint(6, 10)
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
    jy = random.choice([0, 0, 0, -1, 1])
    ab('mouse', 'move', str(X0 + ix), str(Y0 + jy))
    time.sleep(random.uniform(0.008, 0.022))
    prev = ix
time.sleep(random.uniform(0.25, 0.45))
ab('mouse', 'up', 'left')

time.sleep(4)
state = abjson("(() => { const h=document.querySelector('.slider-move'); const p=document.querySelector('img.puzzle'); return JSON.stringify({slider: h ? 'EXISTS' : 'GONE', puzzle: p ? 'EXISTS' : 'GONE', body: (document.body.innerText||'').slice(0,300).replace(/\\n/g,' | ')}); })()")
if isinstance(state, str):
    try: state = json.loads(state)
    except Exception: pass
print('after:', json.dumps(state, ensure_ascii=False)[:500])
solved = isinstance(state, dict) and (state.get('puzzle') == 'GONE' or '验证成功' in str(state.get('body', '')) or 'verification code' in str(state.get('body', '')).lower())
print('SOLVED ✓' if solved else 'STILL THERE')
