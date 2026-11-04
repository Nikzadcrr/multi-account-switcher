#!/usr/bin/env python3
"""Take screenshots of the extension popup (mocked chrome APIs)."""
import asyncio
from playwright.async_api import async_playwright

SITE = 'file:///home/z/my-project/scripts/shots/site/popup.html'
OUT = '/home/z/my-project/scripts/shots/out'


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(
            viewport={'width': 402, 'height': 600}, device_scale_factor=2
        )
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(SITE)
        await page.wait_for_timeout(900)

        # 1 — accounts list (top) + cards (scrolled)
        await page.screenshot(path=f'{OUT}/01-accounts.png')
        await page.evaluate("document.querySelector('#accountsList').scrollIntoView({block:'start'})")
        await page.wait_for_timeout(350)
        await page.screenshot(path=f'{OUT}/01b-cards.png')
        await page.evaluate('window.scrollTo(0, 0)')
        await page.wait_for_timeout(250)

        # 2 — settings panel
        await page.click('#toggleSettingsBtn')
        await page.wait_for_timeout(350)
        await page.screenshot(path=f'{OUT}/02-settings.png')
        await page.click('#closeSettingsBtn')
        await page.wait_for_timeout(250)

        # 3 — quick search filter
        await page.fill('#searchInput', 'شاپ')
        await page.wait_for_timeout(350)
        await page.evaluate("document.querySelector('#accountsList').scrollIntoView({block:'start'})")
        await page.wait_for_timeout(350)
        await page.screenshot(path=f'{OUT}/03-search.png')
        await page.fill('#searchInput', '')
        await page.wait_for_timeout(250)
        await page.evaluate('window.scrollTo(0, 0)')

        # 4 — edit modal
        await page.click('.acc-card >> nth=0 >> button[title*="ویرایش"]')
        await page.wait_for_timeout(350)
        await page.screenshot(path=f'{OUT}/04-edit.png')
        await page.click('#cancelEditBtn')
        await page.wait_for_timeout(250)

        # 5 — mail view with live inbox
        await page.click('#tabMailBtn')
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT}/05-mail-inbox.png')

        # 6 — create-mail card
        await page.click('#newMailBtn')
        await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}/06-create-mail.png')
        await page.click('#closeCreateCardBtn')
        await page.wait_for_timeout(250)

        # 7 — message modal with OTP
        await page.click('.msg-item >> nth=0')
        await page.wait_for_timeout(450)
        await page.screenshot(path=f'{OUT}/07-message.png')

        await browser.close()
        print('page errors:', errors if errors else 'none')


asyncio.run(main())
