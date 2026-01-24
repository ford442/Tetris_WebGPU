from playwright.sync_api import Page, expect, sync_playwright
import time

def test_game_load(page: Page):
    # 1. Go to the game
    page.goto("http://localhost:5173/")

    # 2. Wait for loading
    time.sleep(2)

    # 3. Check for canvas or error
    # canvaswebgpu
    canvas = page.locator("#canvaswebgpu")

    # Take screenshot
    page.screenshot(path="verification/game_load.png")

    if canvas.is_visible():
        print("WebGPU Canvas is visible.")
    else:
        print("WebGPU Canvas not found or hidden.")
        # Check for error message
        content = page.content()
        if "Your current browser does not support WebGPU" in content:
            print("WebGPU not supported in this environment.")

if __name__ == "__main__":
    with sync_playwright() as p:
        # Launch with arguments to potentially enable WebGPU if possible (though likely software fallback or failure)
        browser = p.chromium.launch(headless=True, args=["--enable-unsafe-webgpu"])
        page = browser.new_page()
        try:
            test_game_load(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
