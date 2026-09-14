/// <reference path="../src/demo-window.d.ts" />

import { test, expect } from "@playwright/test";

test.describe("A04 — Astronomical Catalogues", () => {
  test("runs the complete demo sequence", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      const runA04 = window.astroViewerDemo?.runA04;

      if (!runA04) {
        throw new Error("A04 demo API is not available.");
      }

      void runA04();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A04 complete",
      undefined,
      {
        timeout: 110_000,
      },
    );

    const finalState = await page.evaluate(() => {
      const demo = window.astroViewerDemo!;

      const getCatalogue = demo.getCatalogue;

      if (!getCatalogue) {
        throw new Error("Catalogue demo API is not available.");
      }

      const catalogue = getCatalogue();

      return {
        status: document.querySelector("#status")?.textContent,

        catalogueExists: Boolean(catalogue),

        sourceCount: catalogue?.sources.length ?? 0,

        visible: catalogue?.isVisible ?? false,

        selectedCount: catalogue?.selectedIndexes.length ?? 0,

        colour: catalogue?.shapeColor ?? null,

        fov: demo.viewer.getFoV().minFoV,
      };
    });

    expect(finalState.status).toBe("A04 complete");

    expect(finalState.catalogueExists).toBe(true);

    expect(finalState.sourceCount).toBe(40);

    expect(finalState.visible).toBe(true);

    expect(finalState.selectedCount).toBeGreaterThan(0);

    expect(finalState.colour).toBe("#ffd166");

    expect(finalState.fov).toBeGreaterThan(0.49);

    expect(finalState.fov).toBeLessThan(0.51);
  });
});
