/// <reference path="../../demo-window.d.ts" />

import { AstroViewer, type CameraChangedDetail } from "astro-viewer";

type DemoMode = "video" | "interactive";

type ScientificView = {
  raDeg: number;
  decDeg: number;
  fovDeg: number;
};

const M51 = {
  name: "M51",
  ra: 202.469575,
  dec: 47.195258,
  fov: 0.5,
};

const M42 = {
  name: "M42",
  ra: 83.633083,
  dec: -5.391111,
  fov: 3,
};

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required DOM element not found: ${selector}`);
  }

  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#astrocanvas");

const statusElement = requiredElement<HTMLDivElement>("#status");

const controlsElement = requiredElement<HTMLDivElement>("#demo-controls");

const runButton = requiredElement<HTMLButtonElement>("#run-button");

const pauseButton = requiredElement<HTMLButtonElement>("#pause-button");

const resetButton = requiredElement<HTMLButtonElement>("#reset-button");

const labelElement = requiredElement<HTMLDivElement>("#demo-label");

const labelHeadline = requiredElement<HTMLDivElement>("#demo-label .headline");

const labelDetail = requiredElement<HTMLDivElement>("#demo-label .detail");

const labelApiCommand = requiredElement<HTMLDivElement>(
  "#demo-label .api-command",
);

const demoTitleElement = requiredElement<HTMLDivElement>("#demo-title");

const viewStateElement = requiredElement<HTMLDivElement>("#view-state");

const capturedTarget = requiredElement<HTMLDivElement>("#captured-target");

const capturedRa = requiredElement<HTMLSpanElement>("#captured-ra");

const capturedDec = requiredElement<HTMLSpanElement>("#captured-dec");

const capturedFov = requiredElement<HTMLSpanElement>("#captured-fov");

const currentTarget = requiredElement<HTMLDivElement>("#current-target");

const currentRa = requiredElement<HTMLSpanElement>("#current-ra");

const currentDec = requiredElement<HTMLSpanElement>("#current-dec");

const currentFov = requiredElement<HTMLSpanElement>("#current-fov");

const demoMode: DemoMode =
  new URLSearchParams(window.location.search).get("mode") === "video"
    ? "video"
    : "interactive";

controlsElement.hidden = demoMode === "video";

const viewer = new AstroViewer(canvas);

viewer.run();

let running = false;
let paused = false;

let capturedCameraState: CameraChangedDetail | null = null;
let capturedScientificView: ScientificView | null = null;

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

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
    statusElement.textContent = paused ? "Paused" : "Running A07";
  }

  updateControls();
}

async function showLabel(
  headline: string,
  detail = "",
  apiCommand = "",
  durationMs = 1600,
): Promise<void> {
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

function scientificViewFromState(state: CameraChangedDetail): ScientificView {
  return {
    raDeg: state.centralPoint.raDeg,
    decDeg: state.centralPoint.decDeg,
    fovDeg: state.fovDeg,
  };
}

function formatCoordinate(value: number): string {
  return `${value.toFixed(4)}°`;
}

function formatFoV(value: number): string {
  return `${value.toFixed(3)}°`;
}

function showCapturedView(target: string, view: ScientificView): void {
  capturedTarget.textContent = target;
  capturedRa.textContent = formatCoordinate(view.raDeg);
  capturedDec.textContent = formatCoordinate(view.decDeg);
  capturedFov.textContent = formatFoV(view.fovDeg);

  viewStateElement.classList.add("visible");
}

function showCurrentView(target: string, view: ScientificView): void {
  currentTarget.textContent = target;
  currentRa.textContent = formatCoordinate(view.raDeg);
  currentDec.textContent = formatCoordinate(view.decDeg);
  currentFov.textContent = formatFoV(view.fovDeg);

  viewStateElement.classList.add("visible");
}

function clearViewPanel(): void {
  capturedTarget.textContent = "—";
  capturedRa.textContent = "—";
  capturedDec.textContent = "—";
  capturedFov.textContent = "—";

  currentTarget.textContent = "—";
  currentRa.textContent = "—";
  currentDec.textContent = "—";
  currentFov.textContent = "—";

  viewStateElement.classList.remove("visible");
}

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  capturedCameraState = null;
  capturedScientificView = null;

  clearViewPanel();

  viewer.goTo(0, 0);
  viewer.setFoV(20);

  await sleep(500);

  statusElement.textContent = "Ready";
}

async function resetForRun(): Promise<void> {
  capturedCameraState = null;
  capturedScientificView = null;

  clearViewPanel();

  viewer.goTo(0, 0);
  viewer.setFoV(20);

  await demoWait(500);
}

async function runA07(): Promise<void> {
  if (running) {
    return;
  }

  running = true;

  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A07";

  try {
    await resetForRun();

    await showDemoTitle();

    await showLabel(
      "Navigate to M51",
      "Establish a scientific target view.",
      `viewer.flyTo(${M51.ra}, ${M51.dec}, 3000)`,
      1400,
    );

    viewer.flyTo(M51.ra, M51.dec, 3000);

    await demoWait(3200);

    await showLabel(
      "Frame M51 at 0.5°",
      "Define the angular field required for the scientific view.",
      "await viewer.flyToFoV(0.5, 2500)",
      1500,
    );

    await viewer.flyToFoV(M51.fov, 2500);

    await demoWait(800);

    await showLabel(
      "Capture scientific view",
      "Capture the complete current camera state for later restoration.",
      "const snapshot = viewer.getCurrentAstroViewerStatus()",
      1900,
    );

    capturedCameraState = viewer.getCurrentAstroViewerStatus();

    if (!capturedCameraState) {
      throw new Error("AstroViewer did not return a camera state.");
    }

    capturedScientificView = scientificViewFromState(capturedCameraState);

    showCapturedView(M51.name, capturedScientificView);

    showCurrentView(M51.name, capturedScientificView);

    await demoWait(2800);

    await showLabel(
      "Navigate away from the captured view",
      "Change both the target and the angular field.",
      `viewer.flyTo(${M42.ra}, ${M42.dec}, 3000)`,
      1600,
    );

    viewer.flyTo(M42.ra, M42.dec, 3000);

    await demoWait(3200);

    await viewer.flyToFoV(M42.fov, 2200);

    await demoWait(700);

    const m42State = viewer.getCurrentAstroViewerStatus();

    if (!m42State) {
      throw new Error("Unable to read the current M42 view.");
    }

    showCurrentView(M42.name, scientificViewFromState(m42State));

    await showLabel(
      "Captured and current views differ",
      "The original M51 framing remains stored while the viewer is now centred on M42.",
      "viewer.getCurrentAstroViewerStatus()",
      2400,
    );

    await demoWait(1200);

    await showLabel(
      "Restore captured scientific view",
      "Restore the complete M51 camera state without changing the active colour map.",
      "viewer.restoreAstroViewerState(snapshot, false)",
      2200,
    );

    viewer.restoreAstroViewerState(capturedCameraState, false);

    await demoWait(1200);

    const restoredState = viewer.getCurrentAstroViewerStatus();

    if (!restoredState) {
      throw new Error("Unable to read the restored camera state.");
    }

    showCurrentView("M51 restored", scientificViewFromState(restoredState));

    await demoWait(3200);

    await showLabel(
      "A07 complete",
      "A scientific astronomical view can be captured and restored as a reproducible viewer state.",
      "",
      2400,
    );

    statusElement.textContent = "A07 complete";
  } catch (error) {
    console.error("[A07] Demo failed:", error);

    statusElement.textContent = "A07 failed";

    throw error;
  } finally {
    running = false;

    setPaused(false);
    updateControls();
  }
}

runButton.addEventListener("click", () => {
  void runA07();
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

  runA07,
  reset,

  getCapturedState: () => capturedScientificView,

  showLabel,
};

async function initialiseDemo(): Promise<void> {
  statusElement.textContent = "Loading survey…";

  await viewer.loadHiPS("https://alasky.cds.unistra.fr/SDSS/DR9/band-r/");

  window.astroViewerDemo!.ready = true;

  statusElement.textContent = "Ready";

  updateControls();
}

await initialiseDemo();

console.log("[A07] AstroViewer demo ready.", {
  mode: demoMode,
});
