from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:5173")
            page.wait_for_load_state("networkidle")

            # Verify "FX: ON" button exists
            glitch_btn = page.locator("#glitch-button")
            if glitch_btn.count() > 0:
                print("Glitch button found!")
                print(f"Text: {glitch_btn.inner_text()}")
            else:
                print("Glitch button NOT found")

            # Click it to toggle
            glitch_btn.click()
            page.wait_for_timeout(500)
            print(f"Text after click: {glitch_btn.inner_text()}")

            # Take screenshot of UI
            page.screenshot(path="verification/ui_check.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_changes()
