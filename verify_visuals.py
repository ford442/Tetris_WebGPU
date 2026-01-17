from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:5173/")

        # Wait for canvas to exist
        print("Waiting for canvas...")
        page.wait_for_selector("#canvaswebgpu", timeout=10000)

        # Allow some time for things to initialize and render frames
        print("Waiting for render...")
        time.sleep(2)

        # Simulate a hard drop (Space) to trigger particles/shockwave
        print("Simulating input...")
        page.keyboard.press("Space")
        time.sleep(0.1) # Wait for effect to start

        # Take screenshot
        print("Taking screenshot...")
        screenshot_path = "/home/jules/verification/verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
