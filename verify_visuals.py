
from playwright.sync_api import sync_playwright
import time

def verify_visuals():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--enable-unsafe-webgpu'])
        page = browser.new_page()
        try:
            # Visit the local dev server
            page.goto("http://localhost:5173")

            # Wait for canvas to load
            page.wait_for_selector("#canvaswebgpu", timeout=10000)

            # Allow some time for shaders to compile and render
            time.sleep(5)

            # Take screenshot
            page.screenshot(path="verification_screenshot.png")
            print("Screenshot taken.")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_visuals()
