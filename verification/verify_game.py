from playwright.sync_api import sync_playwright

def verify_game_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:4173")

        # Wait for canvas to be present (WebGPU canvas)
        page.wait_for_selector("canvas#canvaswebgpu")

        # Take screenshot
        page.screenshot(path="verification/game_ui.png")
        browser.close()

if __name__ == "__main__":
    verify_game_ui()
