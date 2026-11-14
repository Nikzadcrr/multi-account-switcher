#!/usr/bin/env python3
# روش نهایی: تراز بدنهٔ اصلی (main-body) قطعه با بدنهٔ اصلی گپ سفید
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

def main_body_left(mask_counts, thresh_ratio=0.72):
    """اولین ستونی که ارتفاع شکل آن >= thresh_ratio*max است (بدنهٔ اصلی، نه تاب)."""
    mx = mask_counts.max()
    for x, c in enumerate(mask_counts):
        if c >= thresh_ratio * mx:
            return x
    return int(np.argmax(mask_counts))

# ---------- استخراج ----------
bg_url = abjson("document.querySelector('img.puzzle').src")
piece_url = abjson("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
bg = to_arr(bg_url); piece = to_arr(piece_url)
H, W = bg.shape[:2]
rects = abjson("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); const p=Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).getBoundingClientRect(); return JSON.stringify({bg:{x:b.x,y:b.y,w:b.width,h:b.height}, piece:{x:p.x,y:p.y,w:p.width,h:p.height}}); })()")
scale = rects['bg']['w'] / W
print('bg natural:', W, 'x', H, 'scale:', round(scale, 4), 'piece natural w:', piece.shape[1])

# شکل قطعه
palpha = piece[:, :, 3] > 128
pcounts = palpha.sum(axis=0)  # ارتفاع شکل در هر ستون
pml = main_body_left(pcounts)
print('piece col counts (0..15):', list(map(int, pcounts[:16])))
print('piece main_body_left(natural):', pml, '| piece leftmost:', int(np.argmax(pcounts > 0)))

# ردیف‌های شکل قطعه (برای محدود کردن جست‌وجوی گپ)
prows = np.argwhere(palpha.any(axis=1)).flatten()
r0, r1 = int(prows.min()), int(prows.max())

# نقشهٔ سفیدی bg (خاکستری روشن + کم‌اشباع) در ردیف‌های شکل
rgb = bg[:, :, :3]
gray = rgb.mean(axis=2)
sat = rgb.max(axis=2) - rgb.min(axis=2)
white = (gray > 195) & (sat < 42)
wband = white[r0:r1 + 1, :]
wcounts = wband.sum(axis=0)
print('white col counts peak:', int(wcounts.max()))

# runs با ارتفاع کافی
thr = max(14, int(0.5 * (r1 - r0 + 1)))
runs = []
in_run = False
for x in range(8, W - 8):
    if wcounts[x] >= thr and not in_run:
        in_run, start = True, x
    elif wcounts[x] < thr and in_run:
        in_run = False
        if x - start >= int(0.55 * pcounts[pml:pml + 40].max() if False else 26):
            runs.append((start, x))
if in_run:
    runs.append((start, W - 8))
print('candidate runs:', runs)
if not runs:
    print('NO_GAP_RUN'); sys.exit(1)

# عریض‌ترین run؛ گپ main-left = اولین ستون با ارتفاع >= 0.72*max در run
runs.sort(key=lambda r: r[1] - r[0], reverse=True)
start, end = runs[0]
sub = wcounts[start:end + 1]
gml = start + main_body_left(sub)
print('gap run:', start, end, 'gap main_body_left(natural):', gml)

delta_natural = gml - pml
delta_css = delta_natural * scale
print(f'Δ natural={delta_natural} → css={delta_css:.1f}')

# ---------- drag ----------
hx = abjson("(() => { const h=document.querySelector('.slider-move'); const r=h.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}); })()")
X0, Y0 = hx['x'], hx['y']
target = int(round(delta_css))
print('handle:', hx, 'target:', target)

def px_of(t):
    return X0 + t

ab('mouse', 'move', str(X0), str(Y0))
time.sleep(random.uniform(0.3, 0.5))
ab('mouse', 'down', 'left')
time.sleep(random.uniform(0.18, 0.32))
# مسیر انسانی: شتاب متغیر + مکث میانی + لرزش y
points = []
n1 = 38
for i in range(1, n1 + 1):
    u = i / n1
    e = u ** (1.7 + 0.5 * random.random())  # شتاب تصادفی
    points.append(target * e)
    if i == int(n1 * 0.55):
        points.append(points[-1])  # مکث میانی
prev = 0
for px_ in points:
    ix = int(round(px_))
    if ix == prev: continue
    jy = random.choice([0, 0, 0, -1, 1])
    ab('mouse', 'move', str(int(px_of(ix))), str(Y0 + jy))
    time.sleep(random.uniform(0.006, 0.026))
    prev = ix
# اورشوت کوچک و برگشت
ov = target + random.randint(3, 6)
ab('mouse', 'move', str(int(px_of(ov))), str(Y0))
time.sleep(0.06)
ab('mouse', 'move', str(int(px_of(target))), str(Y0))
time.sleep(random.uniform(0.3, 0.5))

# خواندن موقعیت قطعه در حین نگه‌داشتن
during = abjson("(() => { const p=Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52); return Math.round(p.getBoundingClientRect().x - document.querySelector('img.puzzle').getBoundingClientRect().x); })()")
print('piece during hold:', during)
time.sleep(random.uniform(0.25, 0.45))
ab('mouse', 'up', 'left')

# ---------- تأیید ----------
ok = False
for i in range(8):
    time.sleep(1)
    st = abjson("(() => { const p=document.querySelector('img.puzzle'); const h=document.querySelector('.slider-move'); return JSON.stringify({puzzle: p ? 'E' : 'G', slider: h ? 'E' : 'G', ok: (document.body.innerText||'').includes('验证成功')}); })()")
    if isinstance(st, str):
        try: st = json.loads(st)
        except Exception: pass
    if isinstance(st, dict) and st.get('puzzle') == 'G' and st.get('slider') == 'G':
        ok = True
        break
    if isinstance(st, dict) and st.get('ok'):
        ok = True
        break
print('RESULT:', 'SOLVED ✓' if ok else 'FAILED')
