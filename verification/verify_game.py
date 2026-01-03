from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Navigate to the game
            page.goto("http://localhost:5173")

            # Wait for canvas to be present
            page.wait_for_selector("#canvaswebgpu", timeout=5000)

            # Wait a bit for the game to render initial frame
            page.wait_for_timeout(2000)

            # Check if UI elements are present
            expect(page.locator("#score")).to_be_visible()
            expect(page.locator("#hold-piece-canvas")).to_be_visible()
            expect(page.locator("#next-piece-canvas")).to_be_visible()

            # Take a screenshot
            page.screenshot(path="verification/game_screenshot.png")
            print("Screenshot taken successfully")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
