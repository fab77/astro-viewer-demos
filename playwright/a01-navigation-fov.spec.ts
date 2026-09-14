import { test, expect } from "@playwright/test";

test.describe("A01 — Navigation & FoV", () => {
  test("runs the complete demo sequence", async ({ page }) => {
    await page.goto("http://localhost:5173/");

    await page.waitForFunction(() => Boolean(window.astroViewerDemo));

    const version = await page.evaluate(() =>
      Boolean(window.astroViewerDemo?.viewer),
    );

    expect(version).toBe(true);

    await page.evaluate(async () => {
      await window.astroViewerDemo!.runA01();
    });

    const finalState = await page.evaluate(() => {
      const demo = window.astroViewerDemo!;

      return {
        fov: demo.viewer.getFoV().minFoV,
        status: document.querySelector("#status")?.textContent,
      };
    });

    expect(finalState.fov).toBeGreaterThan(0.49);

    expect(finalState.fov).toBeLessThan(0.51);

    expect(finalState.status).toBe("A01 complete");
  });
});
