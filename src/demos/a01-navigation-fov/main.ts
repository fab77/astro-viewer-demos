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
    statusElement.textContent = paused ? "Paused" : "Running A01";
  }

  updateControls();
}

const viewer = new AstroViewer(canvas);

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

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  statusElement.textContent = "Resetting…";

  viewer.goTo(0, 0);

  viewer.setFoV(20);

  await sleep(500);

  statusElement.textContent = "Ready";
}

async function runA01(): Promise<void> {
  if (running) {
    return;
  }

  running = true;
  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A01";

  try {
    viewer.goTo(0, 0);

    viewer.setFoV(20);

    await demoWait(600);

    await showDemoTitle();

    await showLabel(
      "Astronomy navigation",
      "Start from a wide view of the sky.",
      "viewer.setFoV(20)",
      1400,
    );

    await showLabel(
      "Navigate to M51",
      "Move to the Whirlpool Galaxy.",
      "viewer.flyTo(202.469575, 47.195258, 3000)",
      1200,
    );

    await waitWhilePaused();

    viewer.flyTo(202.469575, 47.195258, 3000);

    await demoWait(3200);

    await showLabel(
      "Set FoV to 8°",
      "Set an absolute scientific field of view.",
      "viewer.setFoV(8)",
      1400,
    );

    await waitWhilePaused();

    viewer.setFoV(8);

    await demoWait(1000);

    await showLabel(
      "Navigate to the Crab Nebula",
      "Move smoothly while preserving the current field of view.",
      "viewer.flyTo(83.633083, 22.0145, 3000)",
      1200,
    );

    await waitWhilePaused();

    viewer.flyTo(83.633083, 22.0145, 3000);

    await demoWait(3200);

    await showLabel(
      "Animate FoV to 2°",
      "Change the field of view smoothly.",
      "await viewer.flyToFoV(2, 2500)",
      1200,
    );

    await waitWhilePaused();

    await viewer.flyToFoV(2, 2500);

    await demoWait(700);

    await showLabel(
      "Zoom in ×2",
      "One zoom step halves the current FoV.",
      "await viewer.zoomIn(1, 1800)",
      1100,
    );

    await waitWhilePaused();

    await viewer.zoomIn(1, 1800);

    await demoWait(700);

    await showLabel(
      "Zoom out ×4",
      "Two zoom steps increase the FoV by a factor of four.",
      "await viewer.zoomOut(2, 2000)",
      1100,
    );

    await waitWhilePaused();

    await viewer.zoomOut(2, 2000);

    await demoWait(700);

    await showLabel(
      "Navigate to M31",
      "Move to the Andromeda Galaxy.",
      "viewer.flyTo(10.6847083, 41.26875, 3000)",
      1200,
    );

    await waitWhilePaused();

    viewer.flyTo(10.6847083, 41.26875, 3000);

    await demoWait(3200);

    await showLabel(
      "Scientific framing: 0.5°",
      "Finish with a precise absolute field of view.",
      "await viewer.flyToFoV(0.5, 2800)",
      1300,
    );

    await waitWhilePaused();

    await viewer.flyToFoV(0.5, 2800);

    await demoWait(800);

    await showLabel(
      "A01 complete",
      "Navigation and FoV controlled through the AstroViewer public API.",
      "",
      2200,
    );

    statusElement.textContent = "A01 complete";
  } catch (error) {
    console.error("[A01] Demo failed:", error);

    statusElement.textContent = "A01 failed";

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

  console.log("[A01] HiPS loaded:", defaultHiPSUrl);
}

/*
 * Interactive controls
 */

runButton.addEventListener("click", () => {
  console.log("[A01] Run clicked");

  void runA01();
});

pauseButton.addEventListener("click", () => {
  console.log("[A01] Pause/Resume clicked");

  if (!running) {
    return;
  }

  setPaused(!paused);
});

resetButton.addEventListener("click", () => {
  console.log("[A01] Reset clicked");

  void reset();
});

window.astroViewerDemo = {
  viewer,
  ready: false,
  mode: demoMode,
  runA01,
  reset,
  showLabel,
};

await initialiseDemo();

console.log("[A01] AstroViewer demo ready.", {
  mode: demoMode,
});
