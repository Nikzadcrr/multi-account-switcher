# -*- coding: utf-8 -*-
"""Generate realistic Aliyun-style slider captchas (bg + puzzle gap) and test vision gap detection"""
import os, random
from PIL import Image, ImageDraw, ImageFilter

os.makedirs('/tmp/slider', exist_ok=True)
random.seed(7)

def make_slider(i, w=320, h=160):
    # photo-like background: gradient + blobs + noise
    img = Image.new('RGB', (w, h))
    dr = ImageDraw.Draw(img)
    c1 = (random.randint(40,120), random.randint(60,140), random.randint(80,160))
    c2 = (c1[0]+60, c1[1]+50, c1[2]+40)
    for x in range(w):
        t = x/w
        col = tuple(int(c1[k]*(1-t)+c2[k]*t) for k in range(3))
        dr.line([(x,0),(x,h)], fill=col)
    for _ in range(random.randint(6,10)):
        x0,y0 = random.randint(0,w), random.randint(0,h)
        r = random.randint(15,45)
        col = (random.randint(20,180), random.randint(20,180), random.randint(20,180))
        dr.ellipse([x0-r,y0-r,x0+r,y0+r], fill=col)
    img = img.filter(ImageFilter.GaussianBlur(2))
    dr = ImageDraw.Draw(img)
    for _ in range(200):
        x0,y0 = random.randint(0,w-1), random.randint(0,h-1)
        dr.point((x0,y0), fill=(random.randint(0,255),)*3)

    # puzzle gap (Aliyun style: rounded square + tabs) at known x
    gx = random.randint(60, w-80)   # gap left edge
    gy = random.randint(30, h-80)
    s = 48  # piece size
    hole = Image.new('L', (w,h), 0)
    hd = ImageDraw.Draw(hole)
    hd.rounded_rectangle([gx, gy, gx+s, gy+s], radius=8, fill=255)
    # tabs
    tab = 14
    hd.ellipse([gx+s-8, gy+s//2-9, gx+s+tab, gy+s//2+9], fill=255)   # right tab
    hd.ellipse([gx+s//2-9, gy+s-8, gx+s//2+9, gy+s+tab], fill=255)   # bottom tab

    # cut hole: darken edges to mimic Aliyun look
    bg = img.copy()
    dark = Image.new('RGB', (w,h), (30,30,35))
    bg = Image.composite(dark, bg, hole.filter(ImageFilter.GaussianBlur(0.8)))
    # inner shadow ring
    ring = hole.filter(ImageFilter.GaussianBlur(3))
    bg = Image.composite(Image.new('RGB',(w,h),(10,10,14)), bg, ring)

    p = f'/tmp/slider/s{i}.png'
    bg.save(p)
    return p, gx, gy, s

truths = []
for i in range(6):
    p, gx, gy, s = make_slider(i)
    truths.append((p, gx, gy, s))
    print(f"{p}: gap_left={gx} gap_top={gy} size={s}")

import json
json.dump([{'p':p,'gx':g,'gy':y,'s':s} for p,g,y,s in truths], open('/tmp/slider/truth.json','w'))
