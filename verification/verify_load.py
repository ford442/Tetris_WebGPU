
from playwright.sync_api import sync_playwright
import time

def verify_game_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the game
        try:
            page.goto("http://localhost:5173", timeout=10000)

            # Wait for canvas to be present
            page.wait_for_selector("#canvaswebgpu", timeout=5000)

            # Wait a bit for initialization
            time.sleep(2)

            # Take screenshot
            page.screenshot(path="/home/jules/verification/game_load.png")
            print("Screenshot taken successfully")

        except Exception as e:
            print(f"Error: {e}")
            # Take error screenshot
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_game_load()
