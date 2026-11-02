import { test, expect } from "@playwright/test";

test.describe("A09 — Inside the Sphere", () => {
  test("zooms inside the sphere and completes the external return", async ({ page }) => {
    test.setTimeout(120_000);

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("http://localhost:5173/?mode=video");
    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      const runA09 = window.astroViewerDemo?.runA09;
      if (!runA09) throw new Error("A09 demo API is unavailable.");
      void runA09();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A09 complete",
      undefined,
      { timeout: 110_000 },
    );

    const state = await page.evaluate(() => ({
      inside: window.astroViewerDemo!.viewer.getInsideSphere(),
      fov: window.astroViewerDemo!.viewer.getFoV().minFoV,
    }));

    expect(errors).toEqual([]);
    expect(state.inside).toBe(false);
    expect(state.fov).toBeGreaterThan(0);
    expect(state.fov).toBeLessThan(180);
  });
});
