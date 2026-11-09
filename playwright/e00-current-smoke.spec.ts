/// <reference path="../src/demo-window.d.ts" />
import { test, expect } from "@playwright/test";

const base = process.env.E00_URL ?? "http://localhost:5173/";
test.use({ viewport: { width: 1440, height: 900 } });

function captureErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("E00 bootstraps with published dependencies", async ({ page }) => {
  test.setTimeout(20_000);
  const errors = captureErrors(page);
  const response = await page.goto(base);
  expect(response?.status()).toBe(200);
  await page.waitForFunction(
    () => window.astroViewerDemo?.ready === true,
    undefined,
    { timeout: 12_000 },
  );
  await expect(page.locator("#status")).toHaveText("E00 ready", {
    timeout: 3_000,
  });
  expect(errors).toEqual([]);
});

for (const [number, title, timeout] of [
  [8, "Administrative regions", 180_000],
  [9, "Mediterranean ferry routes", 150_000],
  [14, "Provenance and credits", 75_000],
] as const) {
  test(`E00 direct scene ${number}: ${title}`, async ({ page }) => {
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
        `E00 review complete · ${numberText}–${numberText}`,
        { timeout },
      );
    } catch (error) {
      console.error("E00 timeout diagnostics:", {
        scene: await page.locator("#scene").textContent(),
        status: await page.locator("#status").textContent(),
        caption: await page.locator("#caption").textContent().catch(() => null),
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
