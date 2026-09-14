import { test, expect } from "@playwright/test";

test.describe("A02 — HiPS Surveys", () => {
  test("runs the complete demo sequence", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      void window.astroViewerDemo!.runA02();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A02 complete",
      undefined,
      {
        timeout: 110_000,
      },
    );

    const finalState = await page.evaluate(() => {
      const demo = window.astroViewerDemo!;

      return {
        status: document.querySelector("#status")?.textContent,

        layers: demo.viewer.getActiveHiPSLayers().length,

        activeHiPS: Boolean(demo.viewer.getActiveHiPS()),

        fov: demo.viewer.getFoV().minFoV,
      };
    });

    expect(finalState.status).toBe("A02 complete");
    expect(finalState.activeHiPS).toBe(true);
    expect(finalState.layers).toBe(1);
    expect(finalState.fov).toBeGreaterThan(0.49);
    expect(finalState.fov).toBeLessThan(0.51);
  });
});
