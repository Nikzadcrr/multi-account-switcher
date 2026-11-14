#!/usr/bin/env python3
# qwen چند-چالشه: حل اسلایدر به صورت حلقه تا زمانی که otp/email/request واقعاً JSON بدهد و کد بیاید
import asyncio, json, base64, io, random, sys, re
import numpy as np
import urllib.request
from playwright.async_api import async_playwright

sys.path.insert(0, '/home/z/my-project/scripts')
from test_qwen_pw_final import detect_gap_hybrid, fetch_img

SOLVE_N = [0]

async def solve_slider(page, tag=''):
    """اگر اسلایدر موجود است حلش کن. برمی‌گرداند: True=حل شد، False=اسلایدری نبود."""
    for _ in range(6):
        has = await page.evaluate("!!(document.querySelector('img.puzzle') && document.querySelector('.slider-move'))")
        if has: break
        await page.wait_for_timeout(1200)
    else:
        return False
    await page.wait_for_timeout(1200)
    bg_src = await page.evaluate("document.querySelector('img.puzzle').src")
    piece_src = await page.evaluate("Array.from(document.querySelectorAll('img')).find(i=>Math.round(i.getBoundingClientRect().width)===52).src")
    bg = np.asarray(fetch_img(bg_src).convert('RGB')).astype(int)
    strip = np.asarray(fetch_img(piece_src).convert('RGBA')).astype(int)
    det = detect_gap_hybrid(bg, strip)
    if not det: return False
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
    # settle: صبر برای نشستن قطعه
    for i in range(10):
        await page.wait_for_timeout(300)
        st = await page.evaluate("(() => { const p=Array.from(document.querySelectorAll('img')).find(x=>Math.round(x.getBoundingClientRect().width)===52); if(!p) return 'gone'; const b=document.querySelector('img.puzzle'); return b ? Math.round(p.getBoundingClientRect().x - b.getBoundingClientRect().x) : 'gone'; })()")
        if st == 'gone': break
        try:
            if abs(float(st) - target) <= 3: break
        except Exception:
            break
    await page.wait_for_timeout(random.randint(150, 300))
    await page.mouse.up()
    SOLVE_N[0] += 1
    print(f'  slider {tag} #{SOLVE_N[0]} solved (det {det["method"]} conf {det["conf"]:.2f})')
    await page.wait_for_timeout(3500)
    return True

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 800}, locale='en-US')
        await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        page = await ctx.new_page()

        otp_json = []
        async def on_resp(r):
            if 'otp/email/request' in r.url:
                try:
                    body = await r.text()
                    is_json = not body.strip().startswith('<')
                    otp_json.append({'json': is_json, 'status': r.status, 'body': body[:200] if is_json else 'WAF_HTML'})
                    print(f'  OTP request → {"JSON ✓" if is_json else "WAF challenge ✗"} ({r.status})')
                except Exception:
                    pass
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
        print('clicked Continue — حلقهٔ حل اسلایدر شروع...')

        # حلقهٔ اصلی: هر اسلایدر جدید را حل کن تاotp بده
        deadline = 180  # ثانیه
        t0 = asyncio.get_event_loop().time()
        code = None
        inbox_poll = 0
        while asyncio.get_event_loop().time() - t0 < deadline:
            await solve_slider(page, tag='live')
            # صفحهٔ کد؟
            body = await page.evaluate('document.body.innerText')
            if 'verification code' in body.lower() and 'Enter Your Email' not in body:
                pass  # مرحلهٔ کد
            # هر 8 ثانیه اینباکس را چک کن
            if asyncio.get_event_loop().time() - t0 > inbox_poll:
                inbox_poll += 8
                try:
                    rr = urllib.request.urlopen(urllib.request.Request(f'https://api.tempmail.lol/v2/inbox?token={token}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=15)
                    emails = json.loads(rr.read()).get('emails', [])
                    for m in emails:
                        text = (m.get('subject') or '') + ' ' + (m.get('body') or '') + ' ' + (m.get('html') or '')
                        mm = re.search(r'(?<!\d)(\d{4,6})(?!\d)', text)
                        if mm:
                            code = mm.group(1)
                            print(f'OTP after ~{int(asyncio.get_event_loop().time()-t0)}s:', code, '| subj:', (m.get('subject') or '')[:50])
                            break
                except Exception as e:
                    print('  inbox err:', e)
                if code: break
            # اگر OTP واقعی JSON شد ولی هنوز ایمیلی نرسیده، ادامه بده (ایمیل ممکن است 1-2 دقیقه طول بکشد)
            any_slider = await page.evaluate("!!(document.querySelector('img.puzzle') && document.querySelector('.slider-move'))")
            if not any_slider and otp_json and otp_json[-1]['json']:
                # در انتظار ایمیل — اینباکس را با گام کوتاه چک کن
                for i in range(45):
                    await page.wait_for_timeout(4000)
                    try:
                        rr = urllib.request.urlopen(urllib.request.Request(f'https://api.tempmail.lol/v2/inbox?token={token}', headers={'User-Agent': 'Mozilla/5.0'}), timeout=15)
                        emails = json.loads(rr.read()).get('emails', [])
                        for m in emails:
                            text = (m.get('subject') or '') + ' ' + (m.get('body') or '') + ' ' + (m.get('html') or '')
                            mm = re.search(r'(?<!\d)(\d{4,6})(?!\d)', text)
                            if mm:
                                code = mm.group(1)
                                print(f'OTP after wait:', code, '| subj:', (m.get('subject') or '')[:50])
                                break
                    except Exception:
                        pass
                    if code: break
                break

        if code:
            try:
                inp = page.locator('input[type="text"], input[inputmode="numeric"]').last
                await inp.fill(code)
                await page.wait_for_timeout(2000)
                print('CODE FILLED — page:', (await page.evaluate('document.body.innerText'))[:250].replace('\n', ' | '))
            except Exception as e:
                print('fill fail:', e)

        print('OTP API calls:', json.dumps(otp_json, ensure_ascii=False)[:600])
        print('RESULT:', 'FULL SUCCESS ✓' if code else 'NO_CODE')
        await browser.close()
        return 0 if code else 2

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
