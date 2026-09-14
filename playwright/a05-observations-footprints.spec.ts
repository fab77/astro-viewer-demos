import { test, expect } from "@playwright/test";

test.describe("A05 — Observations & Footprints", () => {
  test("runs the complete demo sequence", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      void window.astroViewerDemo!.runA05();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A05 complete",
      undefined,
      {
        timeout: 110_000,
      },
    );

    const finalState = await page.evaluate(() => {
      const demo = window.astroViewerDemo!;

      const footprintSet = demo.getFootprintSet();

      return {
        status: document.querySelector("#status")?.textContent,

        footprintSetExists: Boolean(footprintSet),

        footprintCount: footprintSet?.footprintPolygons.length ?? 0,

        visible: footprintSet?.isVisible ?? false,

        selectedCount: footprintSet?.selectedFootprints.length ?? 0,

        colour: footprintSet?.shapeColor ?? null,

        fov: demo.viewer.getFoV().minFoV,
      };
    });

    expect(finalState.status).toBe("A05 complete");

    expect(finalState.footprintSetExists).toBe(true);

    expect(finalState.footprintCount).toBe(40);

    expect(finalState.visible).toBe(true);

    expect(finalState.selectedCount).toBeGreaterThan(0);

    expect(finalState.colour).toBe("#ff9f1c");

    expect(finalState.fov).toBeGreaterThan(0.07);

    expect(finalState.fov).toBeLessThan(0.09);
  });
});
