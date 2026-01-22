
from playwright.sync_api import sync_playwright
import time

def verify_visuals():
    with sync_playwright() as p:
        # Enable unsafe-webgpu to try and force GPU in headless
        browser = p.chromium.launch(headless=True, args=['--enable-unsafe-webgpu'])
        page = browser.new_page()
        page.goto("http://localhost:5173")

        # Check for error message
        if page.locator("div:text('Your current browser does not support WebGPU')").count() > 0:
            print("WebGPU not supported in this headless environment.")

        # Click START button to ensure game is running
        try:
            page.get_by_role('button', name='START').click()
            print("Clicked START")
        except:
            print("Could not find START button")

        # Wait for rendering to settle
        time.sleep(3)

        # Take screenshot
        screenshot_path = "verification/visual_check.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")
        browser.close()

if __name__ == "__main__":
    verify_visuals()
