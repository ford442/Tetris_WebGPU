import asyncio
from playwright.async_api import async_playwright, expect

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Go to the local server
        await page.goto("http://localhost:3000")

        # Wait for the game UI to load
        await expect(page.locator("#ui-container")).to_be_visible()

        # Click start button to initialize game state
        await page.click("#start-button")

        # Wait a bit for game loop to start
        await page.wait_for_timeout(1000)

        # Inject code to trigger the floating text directly
        # We can't easily trigger a real T-Spin in headless without playing,
        # but we can call the showFloatingText method on the view object if exposed.
        # In index.ts: window.view = view;

        await page.evaluate("""
            window.view.showFloatingText("TETRIS", "+800");
        """)

        # Wait for animation to start
        await page.wait_for_timeout(200)

        # Check if the element exists and has correct class
        floating_text = page.locator(".floating-text.tetris")
        await expect(floating_text).to_be_visible()

        # Take a screenshot
        await page.screenshot(path="verification/verification.png")

        await browser.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(run())
