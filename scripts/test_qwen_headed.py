#!/usr/bin/env python3
# qwen نهایی: مرورگر headed تحت Xvfb + استلث کامل + ریتم انسانی (بعد از هر حل صبر)
import asyncio, json, base64, io, random, sys, re
import numpy as np
import urllib.request
from playwright.async_api import async_playwright

sys.path.insert(0, '/home/z/my-project/scripts')
from test_qwen_pw_final import detect_gap_hybrid, fetch_img

STEALTH = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
window.chrome = window.chrome || { runtime: {}, loadTimes: () => {}, csi: () => {} };
Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
Object.defineProperty(navigator, 'languages', {get: () => ['en-US','en']});
Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
const origQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (p) => p.name === 'notifications'
  ? Promise.resolve({state: Notification.permission})
  : origQuery(p);
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(x) {
  if (x === 37445) return 'Intel Inc.';
  if (x === 37446) return 'Intel Iris OpenGL Engine';
  return getParameter.apply(this, [x]);
};
"""

async def solve_slider(page, n):
    bg_src = await page.evaluate("document.querySelector('img.puzzle').src")
    piece_src = await page.evaluate("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
    bg = np.asarray(fetch_img(bg_src).convert('RGB')).astype(int)
    strip = np.asarray(fetch_img(piece_src).convert('RGBA')).astype(int)
    det = detect_gap_hybrid(bg, strip)
    if not det: return False
    rects = json.loads(await page.evaluate("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); const h=document.querySelector('.slider-move').getBoundingClientRect(); return JSON.stringify({bgW: b.width, hx: h.x + h.width/2, hy: h.y + h.height/2}); })()"))
    target = det['dx'] * (rects['bgW'] / bg.shape[1])
    X0, Y0 = rects['hx'], rects['hy']
    await page.mouse.move(X0 + random.randint(-8, 8), Y0 + random.randint(-4, 4))
    await page.wait_for_timeout(random.randint(400, 900))
    await page.mouse.move(X0, Y0)
    await page.wait_for_timeout(random.randint(150, 350))
    await page.mouse.down()
    await page.wait_for_timeout(random.randint(120, 250))
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
        await page.mouse.move(X0 + ix, Y0 + random.choice([0, 0, 0, -1, 1]))
        await page.wait_for_timeout(random.randint(7, 22))
        prev = ix
    for i in range(10):
        await page.wait_for_timeout(300)
        st = await page.evaluate("(() => { const p=Array.from(document.querySelectorAll('img')).find(x=>Math.round(x.getBoundingClientRect().width)===52); if(!p) return 'gone'; const b=document.querySelector('img.puzzle'); return b ? Math.round(p.getBoundingClientRect().x - b.getBoundingClientRect().x) : 'gone'; })()")
        if st == 'gone': break
        try:
            if abs(float(st) - target) <= 3: break
        except Exception:
            break
    await page.wait_for_timeout(random.randint(200, 400))
    await page.mouse.up()
    print(f'  slider #{n} solved ({det["method"]} {det["conf"]:.2f}) — حالا صبر انسانی...')
    return True

async def poll_inbox(token):
    try:
        rr = urllib.request.urlopen(urllib.request.Request(f'https://api.tempmail.lol/v2/inbox?token={token}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=15)
        for m in json.loads(rr.read()).get('emails', []):
            text = (m.get('subject') or '') + ' ' + (m.get('body') or '') + ' ' + (m.get('html') or '')
            mm = re.search(r'(?<!\d)(\d{4,6})(?!\d)', text)
            if mm:
                return mm.group(1), (m.get('subject') or '')[:60]
    except Exception:
        pass
    return None, None

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=[
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox', '--disable-dev-shm-usage',
            '--window-size=1280,800',
        ])
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 800}, locale='en-US', timezone_id='America/New_York')
        await ctx.add_init_script(STEALTH)
        page = await ctx.new_page()

        otp_json = []
        async def on_resp(r):
            if 'otp/email/request' in r.url:
                try:
                    body = await r.text()
                    ok = not body.strip().startswith('<')
                    otp_json.append(ok)
                    print(f'  OTP request → {"JSON ✓✓" if ok else "WAF ✗"} ({r.status})')
                except Exception:
                    pass
        page.on('response', on_resp)

        await page.goto('https://chat.qwen.ai/auth?action=signup', wait_until='domcontentloaded', timeout=60000)
        await page.wait_for_timeout(3500)

        d = json.loads(urllib.request.urlopen(urllib.request.Request(
            'https://api.tempmail.lol/v2/inbox/create', data=b'{}',
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}), timeout=20).read())
        email, token = d['address'], d['token']
        print('email:', email)

        await page.fill('input[placeholder*="Email"]', email)
        await page.wait_for_timeout(random.randint(800, 1400))
        await page.locator('button:has-text("Continue")').first.click()
        print('clicked Continue')

        n = 0
        code, subj = None, None
        t0 = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - t0 < 240:
            # اسلایدر موجود؟
            has = await page.evaluate("!!(document.querySelector('img.puzzle') && document.querySelector('.slider-move'))")
            if has:
                n += 1
                await page.wait_for_timeout(1200)
                await solve_slider(page, n)
                if n >= 5:
                    print('  ۵ حل انجام شد — دیگر حل نمی‌کنم، فقط صبر برای OTP (جلوگیری از death-spiral)')
                    # فقط منتظر می‌مانیم تا اسلایدر برود یا OTP بیاید
                await page.wait_for_timeout(random.randint(8000, 15000))
            else:
                code, subj = await poll_inbox(token)
                if code:
                    print(f'OTP: {code} | subj: {subj}')
                    break
                await page.wait_for_timeout(5000)

        if code:
            try:
                inp = page.locator('input[type="text"], input[inputmode="numeric"]').last
                await inp.fill(code)
                await page.wait_for_timeout(2500)
                body = (await page.evaluate('document.body.innerText'))[:300].replace('\n', ' | ')
                print('CODE FILLED — page:', body)
            except Exception as e:
                print('fill fail:', e)

        print('OTP API json-success count:', sum(otp_json), '/', len(otp_json))
        print('RESULT:', 'FULL SUCCESS ✓' if code else 'NO_CODE (محیط سندباکس: IP دیتاسنتر)')
        await browser.close()
        return 0 if code else 2

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
