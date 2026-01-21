from playwright.sync_api import sync_playwright

def verify_particle_system():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the game (assuming it's running on port 5173 from previous step)
        try:
            page.goto("http://localhost:5173")

            # Wait for canvas
            page.wait_for_selector("#canvaswebgpu", state="attached", timeout=5000)

            # Start game
            page.keyboard.press("Enter")

            # Perform actions to trigger particles
            # Hard drop triggers many particles
            page.keyboard.press("ArrowRight")
            page.keyboard.press("Space")

            # Wait a bit for particles to spawn and fade
            # We want to catch them mid-fade to see the "life" effect (color shift/alpha fade)
            page.wait_for_timeout(200)

            # Take screenshot
            page.screenshot(path="verification/particle_effects.png")
            print("Screenshot taken: verification/particle_effects.png")

        except Exception as e:
            print(f"Error: {e}")

        finally:
            browser.close()

if __name__ == "__main__":
    verify_particle_system()
