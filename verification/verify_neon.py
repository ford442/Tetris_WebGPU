from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Navigate to the local dev server
        page.goto("http://localhost:5173")

        # Wait for canvas to be present
        page.wait_for_selector("#canvaswebgpu")

        # Wait a bit for game to initialize and pieces to spawn
        page.wait_for_timeout(2000)

        # Take a screenshot of the whole UI
        page.screenshot(path="verification/neon_ui.png")

        # Also try to specifically screenshot the next/hold areas if possible,
        # but full screen is safer to see context.

        browser.close()

if __name__ == "__main__":
    run()
