#!/usr/bin/env python3
# تست نهایی E2E اسلایدر qwen با playwright (dispatch سریع مثل chrome.debugger افزونه)
# تشخیص هیبریدی + درگ پیوسته + settle-loop قبل از release
import asyncio, json, base64, io, random, sys, time
import numpy as np
from PIL import Image
import urllib.request
from playwright.async_api import async_playwright

def detect_gap_hybrid(bg_rgb, strip_rgba):
    H, W = bg_rgb.shape[:2]
    sh, sw = strip_rgba.shape[:2]
    gray = bg_rgb.mean(axis=2)
    sat = bg_rgb.max(axis=2) - bg_rgb.min(axis=2)
    neutral = (sat < 18) & (gray >= 92) & (gray <= 155)
    INF = 1e9
    dt = np.full((H, W), INF); dt[neutral] = 0
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
    E = np.zeros_like(gray)
    E[:, :-1] += np.abs(np.diff(gray, axis=1))
    E[:-1, :] += np.abs(np.diff(gray, axis=0))

    alpha = strip_rgba[:, :, 3]
    pm = alpha > 100
    cont = np.zeros_like(pm)
    cont[1:-1, 1:-1] = pm[1:-1, 1:-1] & ~(pm[:-2, 1:-1] & pm[2:, 1:-1] & pm[1:-1, :-2] & pm[1:-1, 2:])
    pys, pxs = np.argwhere(cont).T
    if not len(pys): return None
    rows = np.argwhere(pm.any(axis=1)).flatten()
    r0 = int(rows.min())
    ylo = min(max(0, r0 - 4), max(0, min(H - sh, r0 + 4)))
    yhi = max(ylo, min(H - sh, r0 + 4))

    bestCh, bestChSc, bestNear = None, 1e18, 0
    bestEd, bestEdSc = None, -1
    for offx in range(4, W - sw + 1):
        for offy in range(ylo, yhi + 1):
            ys = pys + offy; xs = pxs + offx
            if (ys >= H).any() or (xs >= W).any(): continue
            vals = dt[ys, xs]
            vals = np.where(vals >= INF, 30, vals)
            near = (vals <= 2).mean()
            sc = vals.mean() - 2.0 * near
            if sc < bestChSc: bestChSc, bestCh, bestNear = sc, offx, near
            esc = E[ys, xs].mean()
            if esc > bestEdSc: bestEdSc, bestEd = esc, offx
    if bestCh is None and bestEd is None: return None
    if bestNear >= 0.35:
        return {'dx': bestCh, 'conf': min(1, bestNear + 0.3), 'method': 'ring'}
    if bestEdSc > 25:
        return {'dx': bestEd, 'conf': min(1, bestEdSc / 90), 'method': 'edge'}
    return {'dx': bestCh if bestCh else bestEd, 'conf': 0.3, 'method': 'weak'}

def fetch_img(src):
    if src.startswith('http'):
        req = urllib.request.Request(src, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://chat.qwen.ai/'})
        return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read()))
    return Image.open(io.BytesIO(base64.b64decode(src.split(',', 1)[1])))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 800}, locale='en-US')
        # حذف نشانه‌های اتوماسیون
        await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        page = await ctx.new_page()
        await page.goto('https://chat.qwen.ai/auth?action=signup', wait_until='domcontentloaded', timeout=60000)
        await page.wait_for_timeout(3000)

        # ایمیل موقت
        d = json.loads(urllib.request.urlopen(urllib.request.Request(
            'https://api.tempmail.lol/v2/inbox/create', data=b'{}',
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}), timeout=20).read())
        email = d['address']
        token = d['token']
        print('email:', email)

        await page.fill('input[placeholder*="Email"]', email)
        await page.wait_for_timeout(600)
        # کلیک Continue
        btn = page.locator('button:has-text("Continue")').first
        await btn.click()
        print('clicked Continue, waiting for slider...')
        await page.wait_for_timeout(4000)

        # صبر برای ویجت
        slider_visible = False
        for i in range(10):
            try:
                await page.wait_for_selector('.slider-move', timeout=2000)
                slider_visible = True
                break
            except Exception:
                await page.wait_for_timeout(1500)
        if not slider_visible:
            print('NO_SLIDER — maybe challenge skipped or different')
            body = await page.evaluate('document.body.innerText.slice(0,300)')
            print(body)
            return 1

        print('slider detected!')
        # صبر برای کامل شدن تصاویر
        await page.wait_for_timeout(1500)

        bg_src = await page.evaluate("document.querySelector('img.puzzle').src")
        piece_src = await page.evaluate("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
        bg = np.asarray(fetch_img(bg_src).convert('RGB')).astype(int)
        strip = np.asarray(fetch_img(piece_src).convert('RGBA')).astype(int)
        print('bg natural:', bg.shape[1], 'x', bg.shape[0])

        det = detect_gap_hybrid(bg, strip)
        print('detect:', json.dumps(det))
        if not det: return 1

        rects = await page.evaluate("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); const h=document.querySelector('.slider-move').getBoundingClientRect(); return JSON.stringify({bgW: b.width, bgX: b.x, hx: h.x + h.width/2, hy: h.y + h.height/2}); })()")
        rects = json.loads(rects) if isinstance(rects, str) else rects
        scale = rects['bgW'] / bg.shape[1]
        piece_dx = det['dx'] * scale
        target = piece_dx  # دستگیره تقریباً 1:1 با قطعه (نسبت هندسی 0.954 نزدیک 1)
        print(f'target handle dx: {target:.1f}')

        # درگ پیوسته با mouse.playwright (سریع مثل chrome.debugger)
        X0, Y0 = rects['hx'], rects['hy']
        await page.mouse.move(X0, Y0)
        await page.wait_for_timeout(random.randint(200, 400))
        await page.mouse.down()
        await page.wait_for_timeout(random.randint(80, 180))

        overshoot = target + random.randint(4, 8)
        pts = []
        for i in range(1, 31):
            u = i / 30
            pts.append(overshoot * (1 - (1 - u) ** 2.1))
        for i in range(1, 7):
            pts.append(overshoot - (overshoot - target) * (i / 6))
        pts.append(target)
        prev = 0
        for px_ in pts:
            ix = int(round(px_))
            if ix == prev: continue
            jy = random.choice([0, 0, 0, -1, 1])
            await page.mouse.move(X0 + ix, Y0 + jy)
            await page.wait_for_timeout(random.randint(6, 18))
            prev = ix
        await page.mouse.move(X0 + target, Y0)

        # settle-loop: صبر برای نشستن transition قطعه (درس تست زنده)
        settled = False
        for i in range(12):
            await page.wait_for_timeout(300)
            st = await page.evaluate("(() => { const p=Array.from(document.querySelectorAll('img')).find(x=>Math.round(x.getBoundingClientRect().width)===52); const h=document.querySelector('.slider-move'); if(!p||!h) return JSON.stringify({gone:true}); return JSON.stringify({px: Math.round(p.getBoundingClientRect().x - document.querySelector('img.puzzle').getBoundingClientRect().x)}); })()")
            st = json.loads(st) if isinstance(st, str) else st
            if st.get('gone'):
                settled = True
                print(f'settle {i}: widget GONE (success path)')
                break
            px = st.get('px', 0)
            print(f'settle {i}: piece at {px} (target {target:.0f})')
            if abs(px - target) <= 3:
                settled = True
                break
        await page.wait_for_timeout(random.randint(150, 300))
        if not settled:
            # به هر حال رها کن — گاهی با تأخیر هم درست است
            pass
        await page.mouse.up()
        print('released')

        # تأیید
        ok = False
        for i in range(10):
            await page.wait_for_timeout(1000)
            body = await page.evaluate('document.body.innerText')
            has_slider = await page.evaluate("!!document.querySelector('.slider-move')")
            if '验证成功' in body or (not has_slider and 'Access Verification' not in body):
                ok = True
                break
            if not has_slider:
                # ویجت رفت — چک نهایی
                ok = '验证成功' in body or 'verification' in body.lower()
                break
        print('RESULT:', 'SOLVED ✓' if ok else 'FAILED')
        # اگر حل شد، صبر برای مرحلهٔ کد تأیید
        if ok:
            await page.wait_for_timeout(3000)
            body = await page.evaluate('document.body.innerText.slice(0,400)')
            print('page now:', body.replace('\n', ' | ')[:300])
            # صبر برای ایمیل کد تأیید
            code = None
            import re
            for i in range(30):
                rr = urllib.request.urlopen(urllib.request.Request(f'https://api.tempmail.lol/v2/inbox?token={token}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=20)
                emails = json.loads(rr.read()).get('emails', [])
                for m in emails:
                    text = (m.get('subject') or '') + ' ' + (m.get('body') or '') + ' ' + (m.get('html') or '')
                    mm = re.search(r'(?<!\d)(\d{4,6})(?!\d)', text)
                    if mm:
                        code = mm.group(1)
                        break
                if code:
                    print('OTP from email:', code)
                    break
                await page.wait_for_timeout(4000)
            if code:
                try:
                    inp = page.locator('input[type="text"], input[inputmode="numeric"]').last
                    await inp.fill(code)
                    print('code filled!')
                except Exception as e:
                    print('fill fail:', e)
        await browser.close()
        return 0 if ok else 2

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
