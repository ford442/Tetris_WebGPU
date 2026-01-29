from playwright.sync_api import sync_playwright
import time

def verify_effects():
    with sync_playwright() as p:
        # Launch with WebGPU flags
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--enable-unsafe-webgpu",
                "--use-gl=egl",
                "--ignore-gpu-blocklist"
            ]
        )
        page = browser.new_page()

        # Go to app
        page.goto("http://localhost:3000")

        # Wait for canvas to be present
        page.wait_for_selector("#canvaswebgpu")

        # Wait a bit for game to start and effects to show
        # The game auto-starts? Controller.play() is called in constructor.
        time.sleep(2)

        # Simulate a key press to rotate (visual check)
        page.keyboard.press("ArrowUp")
        time.sleep(0.5)

        # Simulate hard drop to see particles
        page.keyboard.press("Space")
        # Wait for particle effect
        time.sleep(0.2)

        # Take screenshot
        page.screenshot(path="verification_effects.png")

        browser.close()

if __name__ == "__main__":
    verify_effects()
