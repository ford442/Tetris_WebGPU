from playwright.sync_api import sync_playwright

def verify_game_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Navigate to the game
            page.goto("http://localhost:5173")

            # Wait for canvas to be present
            page.wait_for_selector("#canvaswebgpu", state="attached", timeout=5000)

            # Wait a bit for initialization
            page.wait_for_timeout(2000)

            # Take screenshot
            page.screenshot(path="verification/game_load.png")
            print("Screenshot saved to verification/game_load.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_game_load()
