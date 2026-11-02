import { test, expect } from "@playwright/test";

test.describe("A10 — Camera Controls", () => {
  test("applies rotation constraints and restores defaults", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:5173/?mode=video");
    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);
    await page.evaluate(() => {
      const run = window.astroViewerDemo?.runA10;
      if (!run) throw new Error("A10 API unavailable");
      void run();
    });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent === "A10 complete", undefined, { timeout: 75_000 });
    const state = await page.evaluate(() => {
      const viewer = window.astroViewerDemo!.viewer;
      return {
        eastWestLocked: viewer.isEastWestRotationLocked(),
        northSouthLocked: viewer.isNorthSouthRotationLocked(),
        northUp: viewer.isKeepCameraNorthUp(),
        sensitivity: viewer.getRotationSensitivity(),
      };
    });
    await expect(page.locator("#panel")).toBeVisible();
    await expect(page.locator("#north-up")).toBeDisabled();
    await expect(page.locator("#sensitivity")).toBeDisabled();
    expect(errors).toEqual([]);
    expect(state).toEqual({ eastWestLocked: false, northSouthLocked: false, northUp: false, sensitivity: 1 });
  });
});
