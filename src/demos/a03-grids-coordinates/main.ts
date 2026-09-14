/// <reference path="../../demo-window.d.ts" />

import { AstroViewer, type PointCoordinates } from "astro-viewer";

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

const coordinateHud = requiredElement<HTMLDivElement>("#coordinate-hud");

const coordModeElement = requiredElement<HTMLSpanElement>("#coord-mode");

const centerRaElement = requiredElement<HTMLSpanElement>("#center-ra");

const centerDecElement = requiredElement<HTMLSpanElement>("#center-dec");

const cursorSection = requiredElement<HTMLDivElement>("#cursor-section");

const cursorRaElement = requiredElement<HTMLSpanElement>("#cursor-ra");

const cursorDecElement = requiredElement<HTMLSpanElement>("#cursor-dec");

const demoCursor = requiredElement<HTMLDivElement>("#demo-cursor");
canvas.addEventListener("pointermove", (event) => {
  if (!cursorHudEnabled) {
    return;
  }

  const rect = canvas.getBoundingClientRect();

  demoCursor.hidden = false;

  demoCursor.style.left = `${event.clientX - rect.left}px`;

  demoCursor.style.top = `${event.clientY - rect.top}px`;

  updateCursorHud();
});

demoCursor.hidden = true;

controlsElement.hidden = demoMode === "video";

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

let paused = false;
let running = false;
let cursorHudEnabled = false;

const coordsGridLabels = requiredElement<HTMLDivElement>("#coords-grid-labels");

const healpixGridLabels = requiredElement<HTMLDivElement>(
  "#healpix-grid-labels",
);

const viewer = new AstroViewer(canvas, {
  gridLabelContainers: {
    coords: coordsGridLabels,
    healpix: healpixGridLabels,
  },
});

viewer.run();

canvas.addEventListener("camera-changed", () => {
  if (coordinateHud.classList.contains("visible")) {
    updateCenterHud();
  }
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
    statusElement.textContent = paused ? "Paused" : "Running A03";
  }

  updateControls();
}

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

function formatHms(coords: PointCoordinates): string {
  const { h, m, s } = coords.raHMS;

  return (
    `${String(h).padStart(2, "0")}h ` +
    `${String(m).padStart(2, "0")}m ` +
    `${s.toFixed(2)}s`
  );
}

function formatDms(coords: PointCoordinates): string {
  const { d, m, s } = coords.decDMS;

  const sign = d < 0 ? "−" : "+";

  return (
    `${sign}${Math.abs(d).toString().padStart(2, "0")}° ` +
    `${String(m).padStart(2, "0")}′ ` +
    `${s.toFixed(2)}″`
  );
}

function updateCenterHud(): void {
  const coords = viewer.getCenterCoordinates();

  if (!coords) {
    centerRaElement.textContent = "—";

    centerDecElement.textContent = "—";

    return;
  }

  centerRaElement.textContent = formatHms(coords);

  centerDecElement.textContent = formatDms(coords);
}

function updateCursorHud(): void {
  const coords = viewer.getCoordinatesFromMouse();

  if (!coords) {
    cursorRaElement.textContent = "—";

    cursorDecElement.textContent = "—";

    return;
  }

  cursorRaElement.textContent = formatHms(coords);

  cursorDecElement.textContent = formatDms(coords);
}

function updateCoordinateMode(): void {
  const mode = viewer.getActiveCoordinateMode();

  coordModeElement.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
}

function showCoordinateHud(showCursor = false): void {
  updateCoordinateMode();
  updateCenterHud();

  cursorHudEnabled = showCursor;

  cursorSection.hidden = !showCursor;

  if (showCursor) {
    updateCursorHud();
  }

  coordinateHud.classList.add("visible");
}

function hideCoordinateHud(): void {
  cursorHudEnabled = false;

  cursorSection.hidden = true;

  demoCursor.hidden = true;

  coordinateHud.classList.remove("visible");
}

function ensureGridState(
  grid: "equatorial" | "healpix",
  visible: boolean,
): void {
  if (grid === "equatorial") {
    const current = viewer.isEquatorialGridVisible();

    if (current !== visible) {
      viewer.toggleEquatorialGrid();
    }

    return;
  }

  const current = viewer.isHealpixGridVisible();

  if (current !== visible) {
    viewer.toggleHealpixGrid();
  }
}

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  statusElement.textContent = "Resetting…";

  ensureGridState("equatorial", false);

  ensureGridState("healpix", false);

  hideCoordinateHud();

  viewer.goTo(202.469575, 47.195258);

  viewer.setFoV(2);

  await sleep(500);

  updateCenterHud();

  statusElement.textContent = "Ready";
}

async function resetForRun(): Promise<void> {
  ensureGridState("equatorial", false);

  ensureGridState("healpix", false);

  hideCoordinateHud();

  viewer.goTo(0, 0);

  viewer.setFoV(20);

  await demoWait(500);
}

async function moveDemoCursor(
  xRatio: number,
  yRatio: number,
  durationMs = 900,
): Promise<void> {
  const rect = canvas.getBoundingClientRect();

  const startX = demoCursor.hidden
    ? rect.width / 2
    : Number.parseFloat(demoCursor.style.left);

  const startY = demoCursor.hidden
    ? rect.height / 2
    : Number.parseFloat(demoCursor.style.top);

  const targetX = rect.width * xRatio;

  const targetY = rect.height * yRatio;

  const steps = 30;

  demoCursor.hidden = false;

  for (let i = 1; i <= steps; i += 1) {
    await waitWhilePaused();

    const t = i / steps;

    const x = startX + (targetX - startX) * t;

    const y = startY + (targetY - startY) * t;

    demoCursor.style.left = `${x}px`;

    demoCursor.style.top = `${y}px`;

    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: rect.left + x,

        clientY: rect.top + y,

        bubbles: true,
      }),
    );

    await sleep(durationMs / steps);
  }
}

async function runA03(): Promise<void> {
  if (running) {
    return;
  }

  running = true;

  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A03";

  try {
    await resetForRun();

    await showDemoTitle();

    await showLabel(
      "Navigate to M51",
      "Use a fixed astronomical target to explore grids and coordinates.",
      "viewer.flyTo(202.469575, 47.195258, 3000)",
      1400,
    );

    await waitWhilePaused();

    viewer.flyTo(202.469575, 47.195258, 3000);

    await demoWait(3200);

    await showLabel(
      "Frame M51",
      "Set a reproducible field of view.",
      "await viewer.flyToFoV(2, 2200)",
      1300,
    );

    await waitWhilePaused();

    await viewer.flyToFoV(2, 2200);

    await demoWait(700);

    await showLabel(
      "Widen the field",
      "Zoom out to reveal the larger celestial coordinate structure.",
      "await viewer.flyToFoV(12, 2400)",
      1400,
    );

    await viewer.flyToFoV(12, 2400);

    await demoWait(900);

    await showLabel(
      "Read center coordinates",
      "AstroViewer exposes the coordinates at the center of the viewport.",
      "const coords = viewer.getCenterCoordinates()",
      1500,
    );

    showCoordinateHud(false);

    await demoWait(1200);

    await showLabel(
      "Track the viewport center",
      "Center coordinates update continuously while navigating across the sky.",
      "viewer.flyTo(208.0, 43.0, 3600)",
      1500,
    );

    viewer.flyTo(208.0, 43.0, 3600);

    await demoWait(3800);

    await showLabel(
      "Enable Equatorial Grid",
      "Overlay right ascension and declination reference lines.",
      "viewer.toggleEquatorialGrid()",
      1500,
    );

    ensureGridState("equatorial", true);

    await demoWait(2500);

    updateCenterHud();

    await demoWait(900);

    await showLabel(
      "Switch to HEALPix Grid",
      "Replace the equatorial reference grid with the HEALPix pixelisation used by HiPS.",
      `viewer.toggleEquatorialGrid()
viewer.toggleHealpixGrid()`,
      1600,
    );

    ensureGridState("equatorial", false);

    await demoWait(600);

    ensureGridState("healpix", true);

    await demoWait(3000);

    await showLabel(
      "Live cursor coordinates",
      "Move across the sky and read the astronomical coordinates under the pointer.",
      "viewer.getCoordinatesFromMouse()",
      1700,
    );

    showCoordinateHud(true);

    await demoWait(500);

    await moveDemoCursor(0.3, 0.35, 1200);

    await demoWait(500);

    await moveDemoCursor(0.62, 0.4, 1400);

    await demoWait(500);

    await moveDemoCursor(0.7, 0.62, 1400);

    await demoWait(500);

    await moveDemoCursor(0.42, 0.68, 1400);

    await demoWait(800);

    await showLabel(
      "Hide Equatorial Grid",
      "Return to the HEALPix-only view.",
      "viewer.toggleEquatorialGrid()",
      1400,
    );

    ensureGridState("equatorial", false);

    await demoWait(2200);

    await showLabel(
      "Hide HEALPix Grid",
      "Restore a clean astronomical view.",
      "viewer.toggleHealpixGrid()",
      1400,
    );

    ensureGridState("healpix", false);

    await demoWait(1800);

    hideCoordinateHud();

    await showLabel(
      "A03 complete",
      "Grids and live astronomical coordinates controlled through the AstroViewer public API.",
      "",
      2200,
    );

    statusElement.textContent = "A03 complete";
  } catch (error) {
    console.error("[A03] Demo failed:", error);

    statusElement.textContent = "A03 failed";

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

  console.log("[A03] HiPS loaded:", defaultHiPSUrl);
}

canvas.addEventListener("pointermove", (event) => {
  if (!cursorHudEnabled) {
    return;
  }

  const rect = canvas.getBoundingClientRect();

  demoCursor.hidden = false;

  demoCursor.style.left = `${event.clientX - rect.left}px`;

  demoCursor.style.top = `${event.clientY - rect.top}px`;

  updateCursorHud();
});

canvas.addEventListener("pointerleave", () => {
  if (!cursorHudEnabled) {
    return;
  }

  demoCursor.hidden = true;

  cursorRaElement.textContent = "—";

  cursorDecElement.textContent = "—";
});

runButton.addEventListener("click", () => {
  console.log("[A03] Run clicked");

  void runA03();
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
  runA03,
  reset,
  showLabel,
};

await initialiseDemo();

console.log("[A03] AstroViewer demo ready.", {
  mode: demoMode,
});
