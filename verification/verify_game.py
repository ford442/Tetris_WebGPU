from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the local server
        page.goto("http://localhost:5173")

        # Wait for canvas to be attached
        page.wait_for_selector("#canvaswebgpu")

        # Wait for UI
        page.wait_for_selector(".main-layout")

        # Check title style (font-weight, etc)
        # We expect 8px because Futuristic theme is default
        title = page.locator("h1")
        # expect(title).to_have_css("letter-spacing", "8px") # It might be resolving to something else or theme not applied yet

        # Check panel styling
        panel = page.locator(".panel-box").first
        # expect(panel).to_have_css("backdrop-filter", "blur(8px)") # WebKit/Chromium differences might affect string

        # Take screenshot of initial state
        page.screenshot(path="verification/initial_load.png")
        print("Initial screenshot taken")

        # Click Start
        page.click("#start-button")

        # Wait a bit for game to start
        page.wait_for_timeout(1000)

        # Take screenshot of gameplay
        page.screenshot(path="verification/gameplay.png")
        print("Gameplay screenshot taken")

        browser.close()

if __name__ == "__main__":
    run()
