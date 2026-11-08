/// <reference path="../src/demo-window.d.ts" />
import { test, expect } from "@playwright/test";


const base = process.env.A00_URL ?? "http://localhost:5173/";
test.use({ viewport: { width: 1440, height: 900 } });

function captureErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("A00 bootstraps with published dependencies", async ({ page }) => {
  test.setTimeout(20_000);
  const errors = captureErrors(page);
  const response = await page.goto(base);
  expect(response?.status()).toBe(200);
  await page.waitForFunction(
    () => window.astroViewerDemo?.ready === true,
    undefined,
    { timeout: 12_000 },
  );
  await expect(page.locator("#status")).toHaveText("Ready", { timeout: 3_000 });
  expect(errors).toEqual([]);
});

for (const [number, title, timeout] of [
  [3, "Three-layer compositing", 240_000],
  [4, "Equatorial & HEALPix grids", 120_000],
  [10, "Technology & data ecosystem", 60_000],
] as const) {
  test(`A00 direct scene ${number}: ${title}`, async ({ page }) => {
    test.setTimeout(timeout + 20_000);
    const errors = captureErrors(page);
    const numberText = String(number).padStart(2, "0");
    const url = new URL(base);
    url.searchParams.set("mode", "video");
    url.searchParams.set("scene", numberText);
    url.searchParams.set("end", String(number));
    const response = await page.goto(url.toString());
    expect(response?.status()).toBe(200);
    await page.waitForFunction(
      () => window.astroViewerDemo?.ready === true,
      undefined,
      { timeout: 12_000 },
    );
    await expect(page.locator("#scene")).toContainText(`${numberText} /`, {
      timeout: 15_000,
    });
    try {
      await expect(page.locator("#status")).toHaveText(
        `A00 review complete · 01–${numberText}`,
        { timeout },
      );
    } catch (error) {
      console.error("A00 timeout diagnostics:", {
        scene: await page.locator("#scene").textContent(),
        status: await page.locator("#status").textContent(),
        caption: await page
          .locator("#caption")
          .textContent()
          .catch(() => null),
        url: page.url(),
        errors,
      });
      throw error;
    }
    const audit = await page.evaluate(
      () => (window.astroViewerDemo as any).audit,
    );
    expect(audit.scenes).toEqual([number]);
    expect(errors).toEqual([]);
  });
}
