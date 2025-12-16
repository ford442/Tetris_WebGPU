
from playwright.sync_api import sync_playwright

def verify_tetris():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:5173")
            # Wait for the game to potentially load (though WebGPU might fail in headless)
            page.wait_for_timeout(2000)

            # Press Space to hard drop (ghost piece logic verification)
            page.keyboard.press("Space")
            page.wait_for_timeout(500)

            # Take screenshot
            page.screenshot(path="verification/tetris_game.png")
            print("Screenshot taken at verification/tetris_game.png")
        except Exception as e:
            print(f"Error during verification: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_tetris()
