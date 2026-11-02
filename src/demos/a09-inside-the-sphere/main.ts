/// <reference path="../../demo-window.d.ts" />

import { AstroViewer } from "astro-viewer";

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

controlsElement.hidden = demoMode === "video";

const demoTitleElement = requiredElement<HTMLDivElement>("#demo-title");

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

let paused = false;
let running = false;

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

async function showDemoTitle(): Promise<void> {
  demoTitleElement.classList.add("visible");
  await demoWait(2800);
  demoTitleElement.classList.remove("visible");
  await demoWait(700);
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
    statusElement.textContent = paused ? "Paused" : "Running A09";
  }

  updateControls();
}

const coordsGridLabels = requiredElement<HTMLDivElement>("#coords-grid-labels");
const viewer = new AstroViewer(canvas, {
  gridLabelContainers: {
    coords: coordsGridLabels,
  },
});

viewer.run();

async function showLabel(
  headline: string,
  detail = "",
  apiCommand = "",
  durationMs = 1400,
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

// Keep transitions deterministic: never toggle without checking the state.
function setInsideSphere(inside: boolean): void {
  if (viewer.getInsideSphere() !== inside) {
    viewer.toggleInsideSphere();
  }
}

async function reset(): Promise<void> {
  if (running) return;
  setPaused(false);
  statusElement.textContent = "Resetting…";
  setInsideSphere(false);
  setEquatorialGridVisible(false);
  viewer.goTo(0, 0);
  viewer.setFoV(20);
  await sleep(500);
  statusElement.textContent = "Ready";
}

async function navigate(
  ra: number,
  dec: number,
  durationMs = 2800,
): Promise<void> {
  await waitWhilePaused();
  viewer.flyTo(ra, dec, durationMs);
  await demoWait(durationMs + 250);
}

function setEquatorialGridVisible(visible: boolean): void {
  if (viewer.isEquatorialGridVisible() !== visible) {
    viewer.toggleEquatorialGrid();
  }
}

async function runA09(): Promise<void> {
  if (running) return;
  running = true;
  setPaused(false);
  updateControls();
  statusElement.textContent = "Running A09";
  try {
    setInsideSphere(false);
    setEquatorialGridVisible(false);
    viewer.goTo(0, 0);
    viewer.setFoV(20);
    await demoWait(600);
    await showDemoTitle();

    await showLabel(
      "The celestial sphere",
      "Begin with an external astronomical view.",
      "viewer.getInsideSphere()",
      1600,
    );
    await navigate(83.633083, 22.0145, 2800); // Orion

    await showLabel(
      "Step inside the sphere",
      "Switch to an immersive perspective from within the sky.",
      "viewer.toggleInsideSphere()",
      1600,
    );
    await waitWhilePaused();
    setInsideSphere(true);
    await demoWait(2300);

    setEquatorialGridVisible(true);

    await showLabel(
      "Equatorial coordinate grid",
      "Visualise right ascension and declination from inside the celestial sphere.",
      "viewer.toggleEquatorialGrid()",
      3000,
    );

    await demoWait(1200);

    await showLabel(
      "Explore the Milky Way",
      "Look toward the Galactic Centre from inside the celestial sphere.",
      "viewer.flyTo(266.4051, -28.936175, 2800)",
      1300,
    );
    await navigate(266.4051, -28.936175);
    await demoWait(1100);

    await showLabel(
      "Immersive sky navigation",
      "Travel directly from the Galactic Centre to the Whirlpool Galaxy (M51).",
      "viewer.flyTo(202.4696, 47.1952, 3200)",
      2000,
    );
    await navigate(202.4696, 47.1952, 3200);
    await demoWait(1200);

    await showLabel(
      "Zoom into the Whirlpool Galaxy",
      "Approach M51 while remaining inside the celestial sphere.",
      "viewer.flyToFoV(3, 3200)",
      1800,
    );
    await waitWhilePaused();
    console.log("[A09] Before zoom:", viewer.getFoV().minFoV);
    await viewer.flyToFoV(3, 3200);
    console.log("[A09] After zoom:", viewer.getFoV().minFoV);

    await showLabel(
      "Return to the external view",
      "Exit the celestial sphere and move away to reveal its geometry.",
      "viewer.toggleInsideSphere()",
      2200,
    );

    await waitWhilePaused();

    setEquatorialGridVisible(false);
    setInsideSphere(false);

    await demoWait(1200);

    // Animated zoom-out in the external view.
    await viewer.flyToFoV(120, 4500);
    await demoWait(250);

    console.log("[A09] Final state:", {
      insideSphere: viewer.getInsideSphere(),
    });

    await showLabel(
      "A09 complete",
      "Inside-the-sphere exploration using the AstroViewer public API.",
      "",
      2200,
    );
    statusElement.textContent = "A09 complete";
  } catch (error) {
    console.error("[A09] Demo failed:", error);
    statusElement.textContent = "A09 failed";
    throw error;
  } finally {
    running = false;
    setPaused(false);
    updateControls();
  }
}

async function initialiseDemo(): Promise<void> {
  statusElement.textContent = "Loading HiPS…";

  runButton.disabled = true;
  pauseButton.disabled = true;
  resetButton.disabled = true;

  const defaultHiPSUrl = viewer.getDefaultHiPSURL();

  await viewer.loadHiPS(defaultHiPSUrl);

  window.astroViewerDemo!.ready = true;

  statusElement.textContent = "Ready";

  updateControls();

  console.log("[A09] HiPS loaded:", defaultHiPSUrl);
}

/*
 * Interactive controls
 */

runButton.addEventListener("click", () => {
  console.log("[A09] Run clicked");

  void runA09();
});

pauseButton.addEventListener("click", () => {
  console.log("[A09] Pause/Resume clicked");

  if (!running) {
    return;
  }

  setPaused(!paused);
});

resetButton.addEventListener("click", () => {
  console.log("[A09] Reset clicked");

  void reset();
});

window.astroViewerDemo = {
  viewer,
  ready: false,
  mode: demoMode,
  reset,
  showLabel,
};

(
  window.astroViewerDemo as typeof window.astroViewerDemo & {
    runA09: typeof runA09;
  }
).runA09 = runA09;

await initialiseDemo();

console.log("[A09] AstroViewer demo ready.", {
  mode: demoMode,
});
