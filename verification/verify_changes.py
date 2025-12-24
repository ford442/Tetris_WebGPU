from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        # Launch browser in headless mode
        browser = p.chromium.launch(headless=True, args=['--enable-unsafe-webgpu'])
        page = browser.new_page()

        # Navigate to the local server
        page.goto("http://localhost:5173/")

        # Wait for the canvas and UI to load
        page.wait_for_selector("#ui-container")
        page.wait_for_selector("canvas")

        # Take a screenshot to verify UI visibility and alignment
        page.screenshot(path="/home/jules/verification/verification.png")

        print("Screenshot taken at /home/jules/verification/verification.png")
        browser.close()

if __name__ == "__main__":
    verify_frontend()
