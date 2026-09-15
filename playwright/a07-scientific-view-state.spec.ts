import { test, expect } from "@playwright/test";

test.describe("A07 — Scientific View State", () => {
  test("captures and restores the scientific view", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      const runA07 = window.astroViewerDemo?.runA07;

      if (!runA07) {
        throw new Error("A07 demo API is not available.");
      }

      void runA07();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A07 complete",
      undefined,
      {
        timeout: 110_000,
      },
    );

    const result = await page.evaluate(() => {
      const demo = window.astroViewerDemo;

      if (!demo?.getCapturedState) {
        throw new Error("A07 captured-state API is not available.");
      }

      const captured = demo.getCapturedState();

      const finalState = demo.viewer.getCurrentAstroViewerStatus();

      if (!captured || !finalState) {
        throw new Error("A07 state is not available.");
      }

      return {
        status: document.querySelector("#status")?.textContent,

        captured,

        restored: {
          raDeg: finalState.centralPoint.raDeg,
          decDeg: finalState.centralPoint.decDeg,
          fovDeg: finalState.fovDeg,
        },
      };
    });

    expect(result.status).toBe("A07 complete");

    expect(result.captured.raDeg).toBeCloseTo(202.469575, 2);

    expect(result.captured.decDeg).toBeCloseTo(47.195258, 2);

    expect(result.captured.fovDeg).toBeCloseTo(0.5, 2);

    expect(result.restored.raDeg).toBeCloseTo(result.captured.raDeg, 4);

    expect(result.restored.decDeg).toBeCloseTo(result.captured.decDeg, 4);

    expect(result.restored.fovDeg).toBeCloseTo(result.captured.fovDeg, 4);
  });
});
