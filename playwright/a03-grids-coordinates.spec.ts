/// <reference path="../src/demo-window.d.ts" />

import { test, expect } from "@playwright/test";

test.describe("A03 — Grids & Coordinates", () => {
  test("runs the complete demo sequence", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      const runA03 = window.astroViewerDemo?.runA03;

      if (!runA03) {
        throw new Error("A03 demo API is not available.");
      }

      void runA03();
    });

    const canvas = page.locator("#astrocanvas");

    await canvas.waitFor();

    await page.waitForTimeout(30_000);

    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error("AstroViewer canvas has no bounding box.");
    }

    const points = [
      [0.3, 0.35],
      [0.42, 0.48],
      [0.55, 0.4],
      [0.68, 0.56],
      [0.48, 0.62],
    ] as const;

    for (const [xRatio, yRatio] of points) {
      await page.mouse.move(
        box.x + box.width * xRatio,
        box.y + box.height * yRatio,
        {
          steps: 20,
        },
      );

      await page.waitForTimeout(700);
    }

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A03 complete",
      undefined,
      {
        timeout: 100_000,
      },
    );

    const finalState = await page.evaluate(() => {
      const demo = window.astroViewerDemo!;

      return {
        status: document.querySelector("#status")?.textContent,

        equatorialGrid: demo.viewer.isEquatorialGridVisible(),

        healpixGrid: demo.viewer.isHealpixGridVisible(),

        coordinateMode: demo.viewer.getActiveCoordinateMode(),

        center: demo.viewer.getCenterCoordinates(),

        fov: demo.viewer.getFoV().minFoV,
      };
    });

    expect(finalState.status).toBe("A03 complete");

    expect(finalState.equatorialGrid).toBe(false);

    expect(finalState.healpixGrid).toBe(false);

    expect(finalState.coordinateMode).toBe("equatorial");

    expect(finalState.center).toBeDefined();

    expect(finalState.fov).toBeGreaterThan(1.9);

    expect(finalState.fov).toBeLessThan(2.1);
  });
});
