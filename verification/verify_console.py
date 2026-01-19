from playwright.sync_api import sync_playwright
import time

def verify_console():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--enable-unsafe-webgpu'])
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"Page Error: {exc}"))

        try:
            page.goto('http://localhost:5173')
            page.wait_for_selector('#canvaswebgpu', timeout=5000)
            time.sleep(2)
            page.screenshot(path='verification/console_check.png')
        except Exception as e:
            print(f"Script Error: {e}")
        finally:
            browser.close()

if __name__ == '__main__':
    verify_console()
