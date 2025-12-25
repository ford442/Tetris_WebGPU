from playwright.sync_api import sync_playwright

def verify_fix():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Go to the local dev server
            page.goto("http://localhost:5173")

            # Wait a bit for JS to init
            page.wait_for_timeout(2000)

            # 1. Verify the hardcoded video is gone
            # (There should be no video with id="bg-video")
            bg_video_count = page.locator("#bg-video").count()
            print(f"Number of #bg-video elements (should be 0): {bg_video_count}")

            if bg_video_count > 0:
                print("FAIL: Hardcoded video #bg-video still exists!")
            else:
                print("PASS: Hardcoded video removed.")

            # 2. Verify the dynamic video exists (created in View)
            # It usually doesn't have an ID, but it's a <video> tag inside <body> (or where ever it is appended)
            # viewWebGPU.ts appends it to this.element (which is document.body usually? No, let's check index.ts)

            video_tags = page.locator("video")
            count = video_tags.count()
            print(f"Total video tags found: {count}")

            if count == 1:
                print("PASS: Exactly one video tag found (the dynamic one).")
                # Check src
                src = video_tags.first.get_attribute("src")
                print(f"Video src: {src}")
                if "bg3.mp4" in src:
                    print("PASS: Video source is bg3.mp4")
                else:
                    print("FAIL: Video source is NOT bg3.mp4")
            else:
                print(f"FAIL: Expected 1 video tag, found {count}")

            # 3. Screenshot
            page.screenshot(path="verification/verification.png")
            print("Screenshot saved to verification/verification.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_fix()
