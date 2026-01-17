
from playwright.sync_api import sync_playwright
import time

def verify_game_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # WebGPU often requires special args for headless but for screenshotting 2D elements/UI it's fine.
        # However, WebGPU canvas might be black if not supported in headless software rasterizer.
        # But we can verify UI elements.
        page = browser.new_page()

        # Wait for server
        time.sleep(2)

        try:
            page.goto("http://localhost:5173")

            # Wait for game to initialize
            time.sleep(2)

            # Check for canvas
            canvas = page.locator("#canvaswebgpu")

            # Take screenshot
            page.screenshot(path="verification/game_screen.png")
            print("Screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_game_load()
