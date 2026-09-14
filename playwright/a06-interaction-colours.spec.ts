/// <reference path="../src/demo-window.d.ts" />

import { test, expect } from "@playwright/test";

test.describe("A06 — Interaction Colours", () => {
  test("runs the complete interaction sequence", async ({ page }) => {
    test.setTimeout(140_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      const runA06 = window.astroViewerDemo?.runA06;

      if (!runA06) {
        throw new Error("A06 demo API is not available.");
      }

      void runA06();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A06 complete",
      undefined,
      {
        timeout: 130_000,
      },
    );

    const finalState = await page.evaluate(() => {
      const demo = window.astroViewerDemo!;

      const getFootprintSet = demo.getFootprintSet;

      if (!getFootprintSet) {
        throw new Error("Footprint demo API is not available.");
      }

      const footprintSet = getFootprintSet();

      return {
        status: document.querySelector("#status")?.textContent,

        catalogueExists: Boolean(
          demo.getCatalogue ? demo.getCatalogue() : null,
        ),

        footprintSetExists: Boolean(footprintSet),

        footprintCount: footprintSet?.footprintPolygons.length ?? 0,

        selectedFootprints: footprintSet?.selectedFootprints.length ?? 0,

        colour: footprintSet?.shapeColor ?? null,

        visible: footprintSet?.isVisible ?? false,

        fov: demo.viewer.getFoV().minFoV,
      };
    });

    expect(finalState.status).toBe("A06 complete");

    expect(finalState.catalogueExists).toBe(false);

    expect(finalState.footprintSetExists).toBe(true);

    expect(finalState.footprintCount).toBe(40);

    expect(finalState.visible).toBe(true);

    expect(finalState.selectedFootprints).toBeGreaterThan(0);

    expect(finalState.colour).toBe("#ff9f1c");

    expect(finalState.fov).toBeGreaterThan(0.05);

    expect(finalState.fov).toBeLessThan(0.07);
  });
});
