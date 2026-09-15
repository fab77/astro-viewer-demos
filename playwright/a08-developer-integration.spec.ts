import { test, expect } from "@playwright/test";

test.describe("A08 — Developer Integration", () => {
  test("builds the viewer through the public consumer API", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:5173/?mode=video");

    await page.waitForFunction(() => window.astroViewerDemo?.ready === true);

    await page.evaluate(() => {
      const runA08 = window.astroViewerDemo?.runA08;

      if (!runA08) {
        throw new Error("A08 demo API is not available.");
      }

      void runA08();
    });

    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent === "A08 complete",
      undefined,
      {
        timeout: 110_000,
      },
    );

    const finalState = await page.evaluate(() => {
      const demo = window.astroViewerDemo;

      if (!demo) {
        throw new Error("AstroViewer demo API is unavailable.");
      }

      const catalogue = demo.getCatalogue?.();

      const viewerState = demo.viewer.getCurrentAstroViewerStatus();

      return {
        status: document.querySelector("#status")?.textContent,

        catalogueExists: Boolean(catalogue),

        sourceCount: catalogue?.sources.length ?? 0,

        activeHiPS: Boolean(demo.viewer.getActiveHiPS()),

        ra: viewerState?.centralPoint.raDeg ?? null,

        dec: viewerState?.centralPoint.decDeg ?? null,
        
        fov: demo.viewer.getFoV().minFoV,

        completedSteps: document.querySelectorAll(
          "#integration-panel .integration-step.done",
        ).length,
      };
    });

    expect(finalState.status).toBe("A08 complete");

    expect(finalState.activeHiPS).toBe(true);

    expect(finalState.catalogueExists).toBe(true);

    expect(finalState.sourceCount).toBe(40);

    expect(finalState.completedSteps).toBe(5);

    expect(finalState.ra).not.toBeNull();
    expect(finalState.dec).not.toBeNull();

    expect(finalState.ra!).toBeCloseTo(202.469575, 1);

    expect(finalState.dec!).toBeCloseTo(47.195258, 1);

    expect(finalState.fov).toBeGreaterThan(0.23);

    expect(finalState.fov).toBeLessThan(0.27);
  });
});
