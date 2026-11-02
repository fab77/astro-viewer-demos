/// <reference path="../../demo-window.d.ts" />
import { AstroViewer, type HiPS } from "astro-viewer";

type SurveyKey = "optical" | "ultraviolet" | "infrared" | "xray";
const surveys: Record<SurveyKey, { name: string; url: string }> = {
  optical: { name: "DSS Color — Optical", url: "https://cdn.skies.esac.esa.int/DSSColor/" },
  ultraviolet: { name: "GALEX Color — Ultraviolet", url: "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor" },
  infrared: { name: "Herschel SPIRE 250 µm — Far infrared", url: "https://skies.esac.esa.int/Herschel/SPIRE250/" },
  xray: { name: "Chandra — X-ray", url: "https://cdaftp.cfa.harvard.edu/cxc-hips/" },
};
const get = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
};
const canvas = get<HTMLCanvasElement>("astrocanvas");
const status = get<HTMLElement>("status");
const title = get<HTMLElement>("title");
const runButton = get<HTMLButtonElement>("run-button");
const pauseButton = get<HTMLButtonElement>("pause-button");
const resetButton = get<HTMLButtonElement>("reset-button");
const mode = new URLSearchParams(location.search).get("mode") === "video" ? "video" : "interactive";
get<HTMLElement>("controls").hidden = mode === "video";
const viewer = new AstroViewer(canvas, { gridLabelContainers: { coords: get<HTMLDivElement>("coords-grid-labels") } });
viewer.run();
const layers = new Map<SurveyKey, HiPS>();
let running = false;
let paused = false;
let generation = 0;
let activeKey: SurveyKey | null = null;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const check = (token: number) => { if (token !== generation) throw new Error("Sequence cancelled"); };
async function wait(ms: number, token: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms;) {
    check(token);
    if (paused) { await sleep(50); continue; }
    const step = Math.min(50, ms - elapsed);
    await sleep(step);
    elapsed += step;
  }
  check(token);
}
function caption(scene: string, headline: string, detail: string, api: string): void {
  get<HTMLElement>("scene").textContent = scene;
  get<HTMLElement>("headline").textContent = headline;
  get<HTMLElement>("detail").textContent = detail;
  get<HTMLElement>("api-command").textContent = api;
}
function controls(): void {
  runButton.disabled = running;
  resetButton.disabled = running;
  pauseButton.disabled = !running;
  pauseButton.textContent = paused ? "Resume" : "Pause";
}
async function ensureLayer(key: SurveyKey): Promise<HiPS> {
  const cached = layers.get(key);
  if (cached) return cached;
  const layer = await viewer.addHiPSFromUrl(surveys[key].url);
  layers.set(key, layer);
  viewer.setHiPSOpacity(layer, 0);
  return layer;
}
function showOnly(key: SurveyKey): void {
  const active = layers.get(key);
  if (!active) throw new Error(`Survey ${key} not loaded`);
  for (const [id, layer] of layers) viewer.setHiPSOpacity(layer, id === key ? 1 : 0);
  viewer.setActiveHiPS(active);
  activeKey = key;
}
async function fadeTo(key: SurveyKey, token: number): Promise<boolean> {
  const previous = activeKey;
  let next: HiPS;
  try { next = await ensureLayer(key); }
  catch (error) {
    console.warn(`A00: ${surveys[key].name} unavailable`, error);
    caption("Multiwavelength", "Survey unavailable", `${surveys[key].name} could not be loaded.`, surveys[key].url);
    await wait(1300, token);
    return false;
  }
  check(token);
  // Activate the next survey only after its metadata has loaded.
  viewer.setActiveHiPS(next);
  activeKey = key;
  for (let i = 0; i <= 25; i++) {
    await wait(55, token);
    viewer.setHiPSOpacity(next, i / 25);
    if (previous && previous !== key) viewer.setHiPSOpacity(layers.get(previous)!, 1 - i / 25);
  }
  showOnly(key);
  return true;
}
function setEquatorialGridVisible(visible: boolean): void {
  if (viewer.isEquatorialGridVisible() !== visible) viewer.toggleEquatorialGrid();
}
async function reset(): Promise<void> {
  if (running) return;
  paused = false;
  setEquatorialGridVisible(false);
  viewer.resetAxesOrientation();
  viewer.goTo(83.633083, 22.0145);
  viewer.setFoV(65);
  if (layers.has("optical")) showOnly("optical");
  caption("Opening", "AstroViewer", "Explore the sky across wavelengths.", "viewer.goTo(83.633083, 22.0145); viewer.setFoV(65)");
  status.textContent = "Ready";
  controls();
}
async function runA00(): Promise<void> {
  if (running) return;
  running = true;
  paused = false;
  const token = ++generation;
  controls();
  status.textContent = "Running A00";
  try {
    setEquatorialGridVisible(false);
    viewer.resetAxesOrientation();
    viewer.goTo(83.633083, 22.0145);
    viewer.setFoV(65);
    showOnly("optical");
    title.classList.add("visible");
    caption("01 / Opening", "The astronomical sky", "A panoramic optical view of the celestial sphere.", "viewer.setActiveHiPS(dssColor)");
    await wait(2700, token);
    title.classList.remove("visible");
    caption("02 / Navigation", "Orion and the Crab Nebula", "Navigate and progressively refine the field of view.", "viewer.flyTo(83.633083, 22.0145, 2200)");
    viewer.flyTo(83.633083, 22.0145, 2200);
    await wait(2400, token);
    await viewer.flyToFoV(5, 1800);
    await wait(900, token);
    caption("02 / Navigation", "M51 — Whirlpool Galaxy", "Cross the sky and frame a galaxy with a precise FoV.", "viewer.flyTo(202.469575, 47.195258, 3000)");
    viewer.flyTo(202.469575, 47.195258, 3000);
    await wait(3200, token);
    await viewer.flyToFoV(0.5, 2100);
    await wait(1100, token);
    caption("03 / Multiwavelength", "Optical — DSS Color", "One sky position, multiple astronomical wavelengths.", surveys.optical.url);
    await wait(1800, token);
    for (const key of ["ultraviolet", "infrared", "xray"] as const) {
      caption("03 / Multiwavelength", surveys[key].name, "Comparing the same field across wavelengths.", surveys[key].url);
      await fadeTo(key, token);
      await wait(1700, token);
    }
    caption("03 / Multiwavelength", "Return to optical", "Complete the comparison in DSS Color.", "viewer.setActiveHiPS(dssColor)");
    await fadeTo("optical", token);
    await wait(1200, token);
    caption("04 / Coordinates", "Equatorial grid — RA / Dec", "Reveal the celestial coordinate system around M51.", "viewer.toggleEquatorialGrid()");
    setEquatorialGridVisible(true);
    await wait(1200, token);
    caption("04 / Coordinates", "Explore the equatorial grid", "Zoom out to 60° to reveal meridians and declination parallels.", "await viewer.flyToFoV(60, 3500)");
    await viewer.flyToFoV(60, 3500);
    await wait(4000, token);
    caption("04 / Coordinates", "Hide coordinate grid", "Return to the unobstructed optical view.", "viewer.toggleEquatorialGrid()");
    setEquatorialGridVisible(false);
    await wait(1200, token);
    status.textContent = "A00 complete";
  } catch (error) {
    if (token === generation) {
      console.error("A00 sequence failed", error);
      setEquatorialGridVisible(false);
      status.textContent = "A00 failed";
    }
  } finally {
    running = false;
    paused = false;
    title.classList.remove("visible");
    controls();
  }
}
runButton.addEventListener("click", () => { void runA00(); });
pauseButton.addEventListener("click", () => {
  paused = !paused;
  status.textContent = paused ? "Paused" : "Running A00";
  controls();
});
resetButton.addEventListener("click", () => { void reset(); });
window.astroViewerDemo = { viewer, ready: false, mode, runA00, reset };
void ensureLayer("optical").then(() => {
  showOnly("optical");
  return reset();
}).then(() => {
  window.astroViewerDemo!.ready = true;
}).catch(error => {
  console.error("A00 optical survey failed", error);
  status.textContent = "Survey load failed";
});
