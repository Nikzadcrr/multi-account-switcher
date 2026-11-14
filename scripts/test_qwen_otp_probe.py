#!/usr/bin/env python3
# تشخیص دقیق وضعیت بعد از حل اسلایدر: آیا qwen کد را می‌فرستد؟ + گرفتار کردن پاسخ API
import asyncio, json, base64, io, random, sys, re
import numpy as np
import urllib.request
from playwright.async_api import async_playwright

sys.path.insert(0, '/home/z/my-project/scripts')
from test_qwen_pw_final import detect_gap_hybrid, fetch_img

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 800}, locale='en-US')
        await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        page = await ctx.new_page()

        api_hits = []
        async def on_resp(r):
            if '/api/' in r.url and ('auth' in r.url or 'login' in r.url or 'code' in r.url or 'email' in r.url):
                try:
                    body = await r.text()
                except Exception:
                    body = ''
                api_hits.append({'url': r.url[-90:], 'status': r.status, 'body': body[:260]})
        page.on('response', on_resp)

        await page.goto('https://chat.qwen.ai/auth?action=signup', wait_until='domcontentloaded', timeout=60000)
        await page.wait_for_timeout(3000)

        d = json.loads(urllib.request.urlopen(urllib.request.Request(
            'https://api.tempmail.lol/v2/inbox/create', data=b'{}',
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}), timeout=20).read())
        email, token = d['address'], d['token']
        print('email:', email)

        await page.fill('input[placeholder*="Email"]', email)
        await page.wait_for_timeout(500)
        await page.locator('button:has-text("Continue")').first.click()
        print('clicked Continue')

        slider_visible = False
        for i in range(10):
            try:
                await page.wait_for_selector('.slider-move', timeout=2000)
                slider_visible = True
                break
            except Exception:
                await page.wait_for_timeout(1500)
        if not slider_visible:
            print('NO_SLIDER')
            print('page:', (await page.evaluate('document.body.innerText'))[:200])
            await browser.close()
            return 1

        await page.wait_for_timeout(1500)
        bg_src = await page.evaluate("document.querySelector('img.puzzle').src")
        piece_src = await page.evaluate("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
        bg = np.asarray(fetch_img(bg_src).convert('RGB')).astype(int)
        strip = np.asarray(fetch_img(piece_src).convert('RGBA')).astype(int)
        det = detect_gap_hybrid(bg, strip)
        print('detect:', json.dumps(det))

        rects = json.loads(await page.evaluate("(() => { const b=document.querySelector('img.puzzle').getBoundingClientRect(); const h=document.querySelector('.slider-move').getBoundingClientRect(); return JSON.stringify({bgW: b.width, hx: h.x + h.width/2, hy: h.y + h.height/2}); })()"))
        target = det['dx'] * (rects['bgW'] / bg.shape[1])
        X0, Y0 = rects['hx'], rects['hy']
        await page.mouse.move(X0, Y0)
        await page.wait_for_timeout(random.randint(200, 400))
        await page.mouse.down()
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
            await page.wait_for_timeout(random.randint(6, 18))
            prev = ix
        await page.wait_for_timeout(300)
        await page.mouse.up()
        print('released, waiting...')
        await page.wait_for_timeout(4000)

        # وضعیت دقیق صفحه بعد از حل
        state = await page.evaluate("""(() => {
          const vis = (el) => el && el.offsetParent !== null;
          const inputs = Array.from(document.querySelectorAll('input')).filter(vis).map(i => ({
            type: i.type, ph: i.placeholder, disabled: i.disabled, value: i.value
          }));
          const btns = Array.from(document.querySelectorAll('button')).filter(vis).map(b => b.innerText.trim()).filter(Boolean);
          return JSON.stringify({url: location.href.slice(-60), title: document.body.innerText.slice(0, 220).replace(/\\n/g,' | '), inputs, btns});
        })()""")
        print('PAGE STATE:', state)
        print('API HITS so far:', json.dumps(api_hits, ensure_ascii=False)[:800])

        # چک باکس «پذیرش قوانین» یا قدم جاافتاده؟ اگر دکمه Continue فعال هست دوباره بزن
        again = await page.evaluate("""(() => {
          const btns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null && /continue/i.test(b.innerText));
          if (btns.length && !btns[0].disabled) { btns[0].click(); return 'clicked'; }
          return 'no-button';
        })()""")
        print('continue-again:', again)
        await page.wait_for_timeout(3000)

        # منتظر کد تا 240 ثانیه
        code = None
        for i in range(60):
            try:
                rr = urllib.request.urlopen(urllib.request.Request(f'https://api.tempmail.lol/v2/inbox?token={token}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=20)
                emails = json.loads(rr.read()).get('emails', [])
                for m in emails:
                    text = (m.get('subject') or '') + ' ' + (m.get('body') or '') + ' ' + (m.get('html') or '')
                    mm = re.search(r'(?<!\d)(\d{4,6})(?!\d)', text)
                    if mm:
                        code = mm.group(1)
                        print(f'OTP after ~{i*4}s:', code, '| subject:', m.get('subject'))
                        break
            except Exception as e:
                print('inbox err:', e)
            if code: break
            await page.wait_for_timeout(4000)

        if code:
            try:
                inp = page.locator('input[type="text"], input[inputmode="numeric"]').last
                await inp.fill(code)
                await page.wait_for_timeout(1500)
                print('CODE FILLED — page:', (await page.evaluate('document.body.innerText'))[:200].replace('\n', ' | '))
            except Exception as e:
                print('fill fail:', e)

        print('FINAL API HITS:', json.dumps(api_hits, ensure_ascii=False)[:1500])
        await browser.close()
        return 0 if code else 2

sys.exit(asyncio.run(main()))
