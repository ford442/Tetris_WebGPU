from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Start server in background first
        page.goto("http://localhost:5173")
        page.wait_for_selector("#canvaswebgpu")

        # Take screenshot of initial state (should show UI + potential WebGPU canvas)
        page.screenshot(path="verification/initial_state.png")

        # Test clicking theme buttons
        page.click("#neon-theme")
        page.wait_for_timeout(500)
        page.screenshot(path="verification/neon_theme.png")

        page.click("#futuristic-theme")
        page.wait_for_timeout(500)
        page.screenshot(path="verification/future_theme.png")

        # Start game
        page.click("#start-button")
        page.wait_for_timeout(1000) # Let pieces fall a bit
        page.screenshot(path="verification/gameplay.png")

        browser.close()

if __name__ == "__main__":
    run()
