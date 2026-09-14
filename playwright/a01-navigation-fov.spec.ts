/// <reference path="../src/demo-window.d.ts" />

import { test, expect } from "@playwright/test";

test.describe("A01 — Navigation & FoV", () => {
  test("runs the complete demo sequence", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      const runA01 = window.astroViewerDemo?.runA01;

      if (!runA01) {
        throw new Error("A01 demo API is not available.");
      }

      void runA01();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A01 complete",
      undefined,
      {
        timeout: 75_000,
      },
    );

    const finalState = await page.evaluate(() => ({
      fov: window.astroViewerDemo!.viewer.getFoV().minFoV,

      status: document.querySelector("#status")?.textContent,
    }));

    expect(finalState.fov).toBeGreaterThan(0.49);
    expect(finalState.fov).toBeLessThan(0.51);
    expect(finalState.status).toBe("A01 complete");
  });
});
