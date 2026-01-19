
from playwright.sync_api import sync_playwright
import time

def verify_game_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Assuming vite dev server will run on 5173 or similar, but let's check.
            # Usually we need to start it first.
            page.goto('http://localhost:5173')

            # Wait for canvas to be present
            page.wait_for_selector('#canvaswebgpu', timeout=5000)

            # Wait a bit for shaders to compile and render
            time.sleep(2)

            # Take screenshot
            page.screenshot(path='verification/game_load.png')
            print('Screenshot taken: verification/game_load.png')
        except Exception as e:
            print(f'Error: {e}')
        finally:
            browser.close()

if __name__ == '__main__':
    verify_game_load()
