/// <reference path="../../demo-window.d.ts" />

import { AstroViewer, type HiPS } from "astro-viewer";

type DemoMode = "video" | "interactive";


function requiredElement<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required DOM element not found: ${selector}`);
  }

  return element;
}

function getDemoMode(): DemoMode {
  const params = new URLSearchParams(window.location.search);

  return params.get("mode") === "video" ? "video" : "interactive";
}

const demoMode = getDemoMode();

const canvas = requiredElement<HTMLCanvasElement>("#astrocanvas");

const statusElement = requiredElement<HTMLDivElement>("#status");

const labelElement = requiredElement<HTMLDivElement>("#demo-label");

const labelHeadline = requiredElement<HTMLDivElement>(
  ".headline",
  labelElement,
);

const labelDetail = requiredElement<HTMLDivElement>(".detail", labelElement);

const labelApiCommand = requiredElement<HTMLDivElement>(
  ".api-command",
  labelElement,
);

const controlsElement = requiredElement<HTMLDivElement>("#demo-controls");

const runButton = requiredElement<HTMLButtonElement>("#run-button");

const pauseButton = requiredElement<HTMLButtonElement>("#pause-button");

const resetButton = requiredElement<HTMLButtonElement>("#reset-button");

const demoTitleElement = requiredElement<HTMLDivElement>("#demo-title");

controlsElement.hidden = demoMode === "video";

const surveys = {
  sdss: {
    name: "SDSS DR9 r",
    wavelength: "Optical",
    url: "https://alasky.cds.unistra.fr/SDSS/DR9/band-r/",
  },

  galex: {
    name: "GALEX FUV",
    wavelength: "Ultraviolet",
    url: "https://alasky.cds.unistra.fr/GALEX/GALEXGR6_7_FUV/",
  },

  spire: {
    name: "Herschel SPIRE 250 µm",
    wavelength: "Far infrared",
    url: "https://skies.esac.esa.int/Herschel/SPIRE250/",
  },

  xmm: {
    name: "XMM EPIC-RGB",
    wavelength: "X-ray",
    url: "https://alasky.cds.unistra.fr/SSC/xcatdb_P_XMM_PN_color/",
  },
} as const;

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

let paused = false;
let running = false;

let sdssLayer: HiPS | null = null;
let galexLayer: HiPS | null = null;
let spireLayer: HiPS | null = null;
let xmmLayer: HiPS | null = null;

async function waitWhilePaused(): Promise<void> {
  while (paused) {
    await sleep(50);
  }
}

async function demoWait(durationMs: number): Promise<void> {
  const intervalMs = 50;
  let elapsedMs = 0;

  while (elapsedMs < durationMs) {
    await waitWhilePaused();

    await sleep(intervalMs);

    if (!paused) {
      elapsedMs += intervalMs;
    }
  }
}

function updateControls(): void {
  runButton.disabled = running;
  pauseButton.disabled = !running;
  resetButton.disabled = running;
  pauseButton.textContent = paused ? "Resume" : "Pause";
}

function setPaused(value: boolean): void {
  paused = value;

  if (running) {
    statusElement.textContent = paused ? "Paused" : "Running A02";
  }

  updateControls();
}

const viewer = new AstroViewer(canvas);

viewer.run();

async function showLabel(
  headline: string,
  detail = "",
  apiCommand = "",
  durationMs = 1500,
): Promise<void> {
  await waitWhilePaused();

  labelHeadline.textContent = headline;

  labelDetail.textContent = detail;

  labelApiCommand.textContent = apiCommand;

  labelElement.classList.add("visible");

  await demoWait(durationMs);

  labelElement.classList.remove("visible");

  await demoWait(300);
}

async function showDemoTitle(): Promise<void> {
  demoTitleElement.classList.add("visible");

  await demoWait(2800);

  demoTitleElement.classList.remove("visible");

  await demoWait(700);
}

function removeLayer(layer: HiPS | null): void {
  if (layer) {
    viewer.removeHiPS(layer);
  }
}

async function ensurePrimarySurvey(): Promise<void> {
  if (sdssLayer) {
    return;
  }

  sdssLayer = await viewer.addHiPSFromUrl(surveys.sdss.url);
  await demoWait(3000);

  viewer.setActiveHiPS(sdssLayer);
}

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  statusElement.textContent = "Resetting…";

  removeLayer(galexLayer);

  removeLayer(spireLayer);

  removeLayer(xmmLayer);

  galexLayer = null;
  spireLayer = null;
  xmmLayer = null;

  await ensurePrimarySurvey();

  viewer.setActiveHiPS(sdssLayer!);

  viewer.setHiPSOpacity(sdssLayer!, 1);

  viewer.goTo(202.469575, 47.195258);

  viewer.setFoV(0.5);

  await sleep(500);

  statusElement.textContent = "Ready";
}

async function fadeOpacity(
  layer: HiPS,
  from: number,
  to: number,
  durationMs: number,
): Promise<void> {
  const steps = 30;
  const stepDuration = durationMs / steps;

  for (let i = 0; i <= steps; i += 1) {
    await waitWhilePaused();

    const t = i / steps;

    const opacity = from + (to - from) * t;

    viewer.setHiPSOpacity(layer, opacity);

    await sleep(stepDuration);
  }
}

function showOnly(activeLayer: HiPS, allLayers: Array<HiPS | null>): void {
  for (const layer of allLayers) {
    if (!layer) {
      continue;
    }

    viewer.setHiPSOpacity(layer, layer === activeLayer ? 1 : 0);
  }

  viewer.setActiveHiPS(activeLayer);
}

async function runA02(): Promise<void> {
  if (running) {
    return;
  }

  running = true;

  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A02";

  try {
    await resetForRun();

    await showDemoTitle();

    await showLabel(
      "SDSS DR9 r — Optical",
      "Start with an optical view of M51.",
      `const sdss = await viewer.addHiPSFromUrl(
  "${surveys.sdss.url}"
)`,
      2000,
    );

    await showLabel(
      "Navigate to M51",
      "Use a fixed target while comparing surveys at different wavelengths.",
      "viewer.flyTo(202.469575, 47.195258, 3000)",
      1400,
    );
    await waitWhilePaused();
    viewer.flyTo(202.469575, 47.195258, 3000);
    await demoWait(3200);

    await showLabel(
      "Frame M51",
      "Set a reproducible scientific field of view.",
      "await viewer.flyToFoV(0.5, 2200)",
      1300,
    );
    await waitWhilePaused();
    await viewer.flyToFoV(0.5, 2200);
    await demoWait(700);

    await showLabel(
      "GALEX FUV — Ultraviolet",
      "Reveal the ultraviolet emission of M51.",
      `const galex = await viewer.addHiPSFromUrl("${surveys.galex.url}")
        viewer.setActiveHiPS(galex)`,
      1800,
    );
    galexLayer = await viewer.addHiPSFromUrl(surveys.galex.url);
    showOnly(galexLayer, [sdssLayer, galexLayer, spireLayer, xmmLayer]);
    await demoWait(3000);
    

    await showLabel(
      "Herschel SPIRE 250 µm",
      "Explore the far-infrared structure of M51.",
      `const spire = await viewer.addHiPSFromUrl("${surveys.spire.url}")
        viewer.setActiveHiPS(spire)`,
      1800,
    );

    spireLayer = await viewer.addHiPSFromUrl(surveys.spire.url);
    showOnly(spireLayer, [sdssLayer, galexLayer, spireLayer, xmmLayer]);
    await demoWait(3000);

    await showLabel(
      "XMM EPIC-RGB — X-ray",
      "View the same target in X-rays.",
      `const xmm = await viewer.addHiPSFromUrl("${surveys.xmm.url}")
        viewer.setActiveHiPS(xmm)`,
      1800,
    );
    xmmLayer = await viewer.addHiPSFromUrl(surveys.xmm.url);
    showOnly(xmmLayer, [sdssLayer, galexLayer, spireLayer, xmmLayer]);
    await demoWait(3000);

    await showLabel(
      "Multi-layer comparison",
      "Blend X-ray and optical data using layer opacity.",
      "viewer.setHiPSOpacity(xmm, 0.55)",
      1600,
    );

    viewer.setHiPSOpacity(sdssLayer!, 1);
    viewer.setHiPSOpacity(galexLayer!, 0);
    viewer.setHiPSOpacity(spireLayer!, 0);
    viewer.setHiPSOpacity(xmmLayer!, 0);

    viewer.setActiveHiPS(xmmLayer!);

    await fadeOpacity(xmmLayer!, 0, 0.55, 4500);

    await demoWait(1200);

    await showLabel(
      "Restore optical survey",
      "Return to SDSS and remove the secondary survey layers.",
      `viewer.setActiveHiPS(sdss)
viewer.removeHiPS(galex)
viewer.removeHiPS(spire)
viewer.removeHiPS(xmm)`,
      1900,
    );

    viewer.setActiveHiPS(sdssLayer!);

    removeLayer(galexLayer);

    removeLayer(spireLayer);

    removeLayer(xmmLayer);

    galexLayer = null;
    spireLayer = null;
    xmmLayer = null;

    await demoWait(1800);

    await showLabel(
      "A02 complete",
      "Load, select, combine and remove HiPS surveys through the AstroViewer public API.",
      "",
      2200,
    );

    statusElement.textContent = "A02 complete";
  } catch (error) {
    console.error("[A02] Demo failed:", error);

    statusElement.textContent = "A02 failed";

    throw error;
  } finally {
    running = false;

    setPaused(false);
    updateControls();
  }
}

async function resetForRun(): Promise<void> {
  removeLayer(galexLayer);

  removeLayer(spireLayer);

  removeLayer(xmmLayer);

  galexLayer = null;
  spireLayer = null;
  xmmLayer = null;

  await ensurePrimarySurvey();

  viewer.setActiveHiPS(sdssLayer!);

  viewer.setHiPSOpacity(sdssLayer!, 1);

  viewer.goTo(0, 0);

  viewer.setFoV(20);

  await demoWait(500);
}

async function initialiseDemo(): Promise<void> {
  statusElement.textContent = "Loading SDSS…";

  runButton.disabled = true;
  pauseButton.disabled = true;
  resetButton.disabled = true;

  await ensurePrimarySurvey();

  window.astroViewerDemo!.ready = true;

  statusElement.textContent = "Ready";

  updateControls();

  console.log("[A02] Primary HiPS loaded:", surveys.sdss);
}

runButton.addEventListener("click", () => {
  console.log("[A02] Run clicked");

  void runA02();
});

pauseButton.addEventListener("click", () => {
  if (!running) {
    return;
  }

  setPaused(!paused);
});

resetButton.addEventListener("click", () => {
  void reset();
});

window.astroViewerDemo = {
  viewer,
  ready: false,
  mode: demoMode,
  runA02,
  reset,
  showLabel,
};

await initialiseDemo();

console.log("[A02] AstroViewer demo ready.", {
  mode: demoMode,
});
