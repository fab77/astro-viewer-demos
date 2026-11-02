/// <reference path="../src/demo-window.d.ts" />
import { test, expect } from "@playwright/test";

test("A00 — Astronomy Showcase v1", async ({ page }) => {
  test.setTimeout(160_000);
  await page.goto("http://localhost:5173/?mode=video");
  await page.waitForFunction(() => window.astroViewerDemo?.ready === true, undefined, { timeout: 45_000 });
  await page.evaluate(() => { void window.astroViewerDemo!.runA00!(); });
  await page.waitForFunction(() => ["A00 complete", "A00 failed"].includes(document.querySelector("#status")?.textContent ?? ""), undefined, { timeout: 145_000 });
  expect(await page.locator("#status").textContent()).toBe("A00 complete");
  expect(await page.locator("#scene").textContent()).toContain("Multiwavelength");
  const fov = await page.evaluate(() => window.astroViewerDemo!.viewer.getFoV().minFoV);
  expect(fov).toBeGreaterThan(0.49);
  expect(fov).toBeLessThan(0.51);
});
