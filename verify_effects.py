from playwright.sync_api import sync_playwright

def verify_visual_effects():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the game
        page.goto("http://localhost:5173")

        # Wait for the canvas to be ready
        page.wait_for_selector("#canvaswebgpu", state="attached")

        # Take a screenshot of the initial state
        page.screenshot(path="verification_initial.png")

        # Simulate key presses to trigger effects
        # Rotate and move to ensure game is active
        page.keyboard.press("ArrowRight")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("ArrowUp")

        # Hard drop to trigger shake and shockwave
        page.keyboard.press("Space")

        # Wait briefly for effects to manifest (particles, shake)
        page.wait_for_timeout(100)

        # Take a screenshot of the effect
        page.screenshot(path="verification_effect.png")

        browser.close()

if __name__ == "__main__":
    verify_visual_effects()
