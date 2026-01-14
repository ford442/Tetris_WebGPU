
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Ensure we hit the served page
        page.goto("http://localhost:5173")

        # Wait for canvas to load
        page.wait_for_selector("#canvaswebgpu", timeout=10000)

        # Take a screenshot
        page.screenshot(path="verification/screenshot.png")
        browser.close()

if __name__ == "__main__":
    run()
