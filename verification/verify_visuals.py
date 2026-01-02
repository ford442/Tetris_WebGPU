
import time
from playwright.sync_api import sync_playwright

def verify_game_visuals():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # Navigate to the game
            # Assuming default vite port 5173
            page.goto("http://localhost:5173")

            # Wait for canvas to be present
            page.wait_for_selector("#canvaswebgpu", state="attached", timeout=10000)

            # Wait a bit for WebGPU init (though in headless it might fail or fallback)
            time.sleep(2)

            # Take screenshot of Title/Start Screen
            page.screenshot(path="verification/start_screen.png")
            print("Start screen screenshot taken.")

            # Click Start
            page.click("#start-button")

            # Wait for game to start and render some frames
            time.sleep(2)

            # Take screenshot of Gameplay
            page.screenshot(path="verification/gameplay.png")
            print("Gameplay screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_game_visuals()
