/// <reference path="../src/demo-window.d.ts" />
import { test, expect } from "@playwright/test";

const base = process.env.A00_URL ?? "http://127.0.0.1:5173/";
test.use({ viewport: { width: 1440, height: 900 } });

async function assertFitsFrame(page: import("@playwright/test").Page, headline = "FITS — linear grayscale") {
  await page.waitForFunction((headline)=>window.astroViewerDemo?.viewer.getActiveHiPS()?.format === "fits" && document.querySelector("#headline")?.textContent === headline,headline,{timeout:600_000});
  await expect.poll(async()=>{
    const png=(await page.screenshot({clip:{x:500,y:250,width:400,height:350}})).toString("base64");
    return page.evaluate(async(base64)=>{
      const blob=await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap=await createImageBitmap(blob);
      const c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext("2d")!;
      ctx.drawImage(bitmap,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;
      let sum=0,sq=0,n=0;
      for(let i=0;i<d.length;i+=16){const v=(d[i]+d[i+1]+d[i+2])/3;sum+=v;sq+=v*v;n++;}
      return Math.sqrt(sq/n-(sum/n)**2);
    },png);
  },{timeout:20_000,message:"FITS sky must have structure, not a blank WebGL background"}).toBeGreaterThan(8);
}


test("A00 full video reaches scene 12, restores state and exits the sphere", async ({ page }) => {
  test.setTimeout(1_400_000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console",m=>{if(m.text().includes("WebGL: INVALID_OPERATION"))errors.push(m.text());});
  await page.goto(`${base}?mode=video`);
  await page.waitForFunction(() => window.astroViewerDemo?.ready, undefined, { timeout: 60_000 });
  await assertFitsFrame(page);
  await page.waitForFunction(() => /A00 (complete|failed)/.test(document.querySelector("#status")?.textContent ?? ""), undefined, { timeout: 650_000 });
  await expect(page.locator("#status")).toHaveText("A00 complete");
  await expect(page.locator("#scene")).toContainText("12 / Technology");
  const result = await page.evaluate(() => {
    const demo = window.astroViewerDemo!;
    return { audit: (demo as any).audit, inside: demo.viewer.getInsideSphere(), fov: demo.viewer.getFoV().minFoV };
  });
  expect(result.audit.scenes).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
  expect(result.audit.stateRestored).toBe(true);
  expect(["live", "local fallback"]).toContain(result.audit.tap);
  expect(result.inside).toBe(false);
  expect(result.fov).toBeCloseTo(120, 0);
  expect(errors).toEqual([]);
  // Reset must normalise the shared Herschel resource after FITS and restoreState.
  await page.evaluate(() => window.astroViewerDemo!.reset());
  const reset = await page.evaluate(() => window.astroViewerDemo!.viewer.getActiveHiPSLayers().map(h => ({url:h.baseURL,format:h.format,opacity:h.opacity})));
  expect(new Set(reset.map(h=>h.url)).size).toBe(reset.length);
  expect(reset.filter(h=>h.url.includes("SPIRE250"))).toHaveLength(1);
  expect(reset.find(h=>h.url.includes("SPIRE250"))?.format).toBe("png");
  expect(reset.filter(h=>h.opacity>0).map(h=>h.url)).toEqual([expect.stringContaining("DSSColor")]);
  // A second complete run exercises cached layers and repeated snapshot restoration.
  await page.evaluate(() => { void window.astroViewerDemo!.runA00!(); });
  await expect(page.locator("#status")).toHaveText("Running A00");
  await assertFitsFrame(page);
  await page.waitForFunction(() => /A00 (complete|failed)/.test(document.querySelector("#status")?.textContent ?? ""), undefined, { timeout: 650_000 });
  await expect(page.locator("#status")).toHaveText("A00 complete");
  expect(await page.evaluate(() => window.astroViewerDemo!.viewer.getInsideSphere())).toBe(false);
  expect(errors).toEqual([]);
});

for (const scene of [3,5,7,9,12]) {
  test(`A00 direct scene ${scene}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(`${base}?mode=video&scene=${String(scene).padStart(2,"0")}`);
    await expect(page.locator("#scene")).toContainText(`${String(scene).padStart(2,"0")} /`, { timeout: 60_000 });
    if(scene===5){
      await expect(page.locator("#coordinate-hud")).toContainText("Cursor · RA", {timeout:15_000});
      await expect(page.locator("#demo-pointer")).toBeVisible();
    }
    if(scene===7){
      await expect(page.locator("#metadata-box")).toContainText("HSC source", {timeout:60_000});
      await expect(page.locator("#metadata-box")).toContainText("flux:");
      await page.waitForFunction(()=>!!window.astroViewerDemo?.getCatalogue?.()?.selectedIndexes.length,undefined,{timeout:15_000});
      await expect(page.locator("#metadata-box")).toContainText("HST observation",{timeout:60_000});
      await page.waitForFunction(()=>!!window.astroViewerDemo?.getFootprintSet?.()?.selectedFootprints.length,undefined,{timeout:15_000});
    }
    if(scene===9){
      await page.waitForFunction(()=>(window.astroViewerDemo as any)?.audit.stateRestored,undefined,{timeout:100_000});
      await assertFitsFrame(page);
    }
    if(scene===12)await expect(page.locator("#status")).toHaveText("A00 complete",{timeout:15_000});
    expect(await page.locator("#status").textContent()).not.toBe("A00 failed");
  });
}

test("A00 TAP failure is labelled and CSV continues", async ({ page }) => {
  test.setTimeout(100_000);
  await page.route("**/esasky-tap/tap/sync",route=>route.abort("failed"));
  await page.goto(`${base}?mode=video&scene=08`);
  await expect(page.locator("#headline")).toHaveText("Local fallback — clearly identified",{timeout:60_000});
  await expect(page.locator("#metadata-box")).toContainText("LOCAL FALLBACK");
  await expect(page.locator("#headline")).toHaveText("CSV catalogue",{timeout:30_000});
  await expect(page.locator("#metadata-box")).toContainText("40 rows");
});

 test("A00 interactive pause and resume", async ({page})=>{
  await page.goto(base);
  await expect(page.locator("#status")).toHaveText("Ready",{timeout:45_000});
  await page.locator("#run-button").click();
  await page.locator("#pause-button").click();
  await expect(page.locator("#status")).toHaveText("Paused");
  await page.waitForTimeout(350);
  await expect(page.locator("#scene")).toContainText("01 /");
  await page.locator("#pause-button").click();
  await expect(page.locator("#scene")).toContainText("02 /",{timeout:10_000});
});

test("A00 custom FITS palette has visible structure", async ({page})=>{
  test.setTimeout(120_000);
  await page.goto(`${base}?mode=video&scene=10`);
  await assertFitsFrame(page);
  await assertFitsFrame(page,"A custom palette");
  await page.screenshot({path:"/tmp/a00-custom-palette.png"});
});

test("A00 review camera gestures and live coordinate dimensions", async ({page})=>{
  test.setTimeout(100_000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(`${base}?mode=video&scene=02&end=07`);
  await expect(page.locator("#headline")).toHaveText("Resolve the cluster",{timeout:30_000});
  const before=await page.evaluate(()=>window.astroViewerDemo!.viewer.getCenterCoordinates()!.astroDeg);
  await page.waitForFunction(()=>document.querySelector<HTMLElement>("#demo-pointer")?.dataset.gesture==="grabbing",undefined,{timeout:15_000,polling:30});
  await expect(page.locator("#demo-pointer")).toBeVisible();
  await page.screenshot({path:"/tmp/a00-review-hand.png"});
  await expect(page.locator("#headline")).toHaveText("The surrounding sky",{timeout:10_000});
  const after=await page.evaluate(()=>window.astroViewerDemo!.viewer.getCenterCoordinates()!.astroDeg);
  expect(Math.hypot(after.ra-before.ra,after.dec-before.dec)).toBeGreaterThan(.01);
  await page.goto(`${base}?mode=video&scene=05&end=07`);
  await expect(page.locator("#coordinate-hud")).toContainText("FoV min",{timeout:30_000});
  await expect(page.locator("#coordinate-hud")).toContainText("/ max");
  const centre=await page.evaluate(()=>window.astroViewerDemo!.viewer.getCenterCoordinates()!.astroDeg);
  await expect(page.locator("#headline")).toHaveText("Drag the camera",{timeout:20_000});
  await page.waitForTimeout(2000);
  const moved=await page.evaluate(()=>window.astroViewerDemo!.viewer.getCenterCoordinates()!.astroDeg);
  expect(Math.hypot(moved.ra-centre.ra,moved.dec-centre.dec)).toBeGreaterThan(.1);
  await page.screenshot({path:"/tmp/a00-review-coordinates.png"});
  await expect(page.locator("#headline")).toHaveText("A wider frame",{timeout:12_000});
  await expect.poll(()=>page.evaluate(()=>window.astroViewerDemo!.viewer.getFoV().minFoV)).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test("A00 review selected metadata persists through hover and footprints", async ({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(`${base}?mode=video&scene=07&end=07`);
  await expect(page.locator("#headline")).toHaveText("Photometric magnitude",{timeout:45_000});
  expect(await page.evaluate(()=>window.astroViewerDemo!.viewer.getFoV().minFoV)).toBeCloseTo(.12,2);
  await expect(page.locator("#metadata-box .selected-record")).toHaveCount(2,{timeout:30_000});
  const selected=await page.locator("#metadata-box").innerText();
  await expect(page.locator("#headline")).toHaveText("HSC hover 1/2",{timeout:15_000});
  await page.waitForTimeout(1200);
  await expect(page.locator("#metadata-box")).toBeVisible();
  expect(await page.locator("#metadata-box").innerText()).toBe(selected);
  await page.screenshot({path:"/tmp/a00-review-selection.png"});
  await expect(page.locator("#headline")).toHaveText("HST footprint 4/4",{timeout:45_000});
  await expect(page.locator("#metadata-box .selected-record")).toHaveCount(6,{timeout:10_000});
  expect(await page.evaluate(()=>window.astroViewerDemo!.viewer.getFoV().minFoV)).toBeCloseTo(.5,2);
  await page.screenshot({path:"/tmp/a00-review-footprints.png"});
  await expect(page.locator("#status")).toHaveText("A00 review complete · 01–07",{timeout:20_000});
  expect(await page.evaluate(()=>(window.astroViewerDemo as any).audit.scenes)).toEqual([7]);
  expect(errors).toEqual([]);
});

test("A00 TAP real request distinguishes live data from service failure", async ({page})=>{
  test.setTimeout(70_000);
  const responsePromise=page.waitForResponse(r=>r.url().includes("/esasky-tap/tap/sync")&&r.request().method()==="POST",{timeout:45_000});
  await page.goto(`${base}?mode=video&scene=08`);
  const response=await responsePromise;
  console.log(`ESASky TAP response: HTTP ${response.status()}`);
  const body=response.request().postData()??"";
  expect(decodeURIComponent(body.replace(/\+/g," "))).toContain("SELECT TOP 40 match_id, ra, dec, flux");
  if(response.ok()) {
    expect(await response.text()).toContain("<TABLEDATA>");
    await expect(page.locator("#metadata-box")).toContainText("LIVE TAP",{timeout:10_000});
  } else {
    await expect(page.locator("#metadata-box")).toContainText("LOCAL FALLBACK",{timeout:10_000});
    expect(await page.evaluate(()=>(window.astroViewerDemo as any).audit.tap)).toBe("local fallback");
  }
  await page.screenshot({path:"/tmp/a00-review-tap-live.png"});
});

test("A00 three saved views are clickable, restore independently and are deleted",async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(`${base}?scene=09`); // Direct scene links autostart, including interactive mode.
  await expect(page.locator("#headline")).toHaveText("Three saved views",{timeout:110_000});
  await page.locator("#pause-button").click();
  await expect(page.locator("#state-stack .state-card")).toHaveCount(3);
  expect(await page.evaluate(()=>window.astroViewerDemo!.viewer.getStateNames())).toEqual(["A00-M51","A00-M45","A00-M101"]);
  await page.screenshot({path:"/tmp/a00-three-states.png"});
  for(const [id,ra,dec,fov] of [["A00-M51",202.469575,47.195258,.5],["A00-M45",56.75,24.1167,5],["A00-M101",210.8023,54.3489,.5]] as const){
    await page.locator(`[data-state-restore="${id}"]`).click();
    await expect(page.locator(`.state-card[data-active="true"] [data-state-restore="${id}"]`)).toBeEnabled();
    const state=await page.evaluate(()=>{const v=window.astroViewerDemo!.viewer;return {center:v.getCenterCoordinates()!.astroDeg,fov:v.getFoV().minFoV,layers:v.getActiveHiPSLayers().filter(h=>h.opacity>0).map(h=>({url:h.baseURL,opacity:h.opacity})),sources:window.astroViewerDemo!.getCatalogue?.()?.sources.length??0};});
    expect(state.center.ra).toBeCloseTo(ra,2);expect(state.center.dec).toBeCloseTo(dec,2);expect(state.fov).toBeCloseTo(fov,1);
    if(id==="A00-M45"){expect(state.layers).toHaveLength(2);expect(state.layers.find(h=>h.url.includes("2MASS"))?.opacity).toBe(.65);expect(state.sources).toBe(0);}
    if(id==="A00-M101"){expect(state.layers.some(h=>h.url.includes("HST/ACS"))).toBe(true);expect(state.sources).toBe(30);}
    await page.waitForTimeout(2500);await page.screenshot({path:`/tmp/${id}-restored.png`});
  }
  await page.locator("#pause-button").click();
  await expect(page.locator("#headline")).toHaveText("State stack cleared",{timeout:55_000});
  expect(await page.evaluate(()=>window.astroViewerDemo!.viewer.getStateNames())).toEqual([]);
  expect(await page.evaluate(()=>(window.astroViewerDemo as any).audit.deletedStates)).toEqual(["A00-M51","A00-M45","A00-M101"]);
  expect(errors).toEqual([]);
  await assertFitsFrame(page);
});

test("A00 scene 07 to 08 preserves the camera",async({page})=>{
  test.setTimeout(150_000);
  await page.goto(`${base}?mode=video&scene=07`);
  await expect(page.locator("#headline")).toHaveText("Restore optical sky",{timeout:120_000});
  const camera=()=>page.evaluate(()=>({center:window.astroViewerDemo!.viewer.getCenterCoordinates()!.astroDeg,fov:window.astroViewerDemo!.viewer.getFoV().minFoV}));
  const before=await camera();await expect(page.locator("#headline")).toHaveText("Ask a scientific archive",{timeout:15_000});const after=await camera();
  expect(after).toEqual(before);expect(after.fov).toBeCloseTo(.5,2);
});
