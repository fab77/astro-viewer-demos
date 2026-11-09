/// <reference path="../../demo-window.d.ts" />

import {
  AstroViewer,
  type CameraChangedDetail,
} from "astro-viewer";

declare global {
  interface AstroViewerDemoAPI {
    runE00?: () => Promise<void>;
  }
}

const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }

  return element as T;
};

const canvas = get<HTMLCanvasElement>("astrocanvas");
const sceneLabel = get<HTMLElement>("scene");
const headline = get<HTMLElement>("headline");
const detail = get<HTMLElement>("detail");
const apiCommand = get<HTMLElement>("api-command");
const provenance = get<HTMLElement>("provenance-content");
const coordinateStatus = get<HTMLElement>("coordinate-status");
const fovStatus = get<HTMLElement>("fov-status");
const tileStatus = get<HTMLElement>("tile-status");
const loadingIndicator = get<HTMLElement>("loading-indicator");
const status = get<HTMLElement>("status");
const controls = get<HTMLElement>("controls");
const runButton = get<HTMLButtonElement>("run-button");
const pauseButton = get<HTMLButtonElement>("pause-button");
const resetButton = get<HTMLButtonElement>("reset-button");
const credits = get<HTMLIFrameElement>("credits");

const query = new URLSearchParams(location.search);
const mode = query.get("mode") === "video" ? "video" : "interactive";

controls.hidden = mode === "video";

const viewer = new AstroViewer(canvas, {
  gridLabelContainers: {
    coords: get<HTMLDivElement>("coords-grid-labels"),
    healpix: get<HTMLDivElement>("healpix-grid-labels"),
  },
});

viewer.run();

let sequenceToken = 0;
let running = false;
let paused = false;

const audit = {
  scenes: [] as number[],
  warnings: [] as string[],
  sequencePhase: "bootstrap",
};

function showCaption(
  scene: string,
  title: string,
  description: string,
  command: string,
): void {
  sceneLabel.textContent = scene;
  headline.textContent = title;
  detail.textContent = description;
  apiCommand.textContent = command;
}

function updateControls(): void {
  runButton.disabled = running;
  resetButton.disabled = running;
  pauseButton.disabled = !running;
  pauseButton.textContent = paused ? "Resume" : "Pause";
}

function check(token: number): void {
  if (token !== sequenceToken) {
    throw new Error("E00 sequence cancelled.");
  }
}

async function wait(durationMs: number, token: number): Promise<void> {
  let elapsedMs = 0;

  while (elapsedMs < durationMs) {
    check(token);

    if (!paused) {
      elapsedMs += 50;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 50);
    });
  }
}

async function waitForEarthTiles(
  token: number,
  timeoutMs = 15000,
): Promise<void> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    check(token);

    const stats = viewer.getXYZDebugStats();
    const layer = stats.layer;

    if (
      layer &&
      layer.readyTileCount > 0 &&
      layer.loadingTileCount === 0 &&
      stats.requests.activeRequests === 0 &&
      stats.requests.queuedRequests === 0
    ) {
      loadingIndicator.hidden = true;
      return;
    }

    await wait(100, token);
  }

  audit.warnings.push("Earth tile readiness timeout");
  loadingIndicator.hidden = true;
}

function updateTelemetry(): void {
  const center = viewer.getCenterCoordinates();
  const fov = viewer.getFoV();
  const stats = viewer.getXYZDebugStats();
  const layer = stats.layer;

  if (center) {
    coordinateStatus.textContent =
      `Center: Lon ${center.astroDeg.ra.toFixed(4)}° · ` +
      `Lat ${center.astroDeg.dec.toFixed(4)}°`;
  } else {
    coordinateStatus.textContent = "Center: —";
  }

  fovStatus.textContent =
    `FoV: ${fov.minFoV.toFixed(3)}° · ` +
    `${fov.xFoV.toFixed(3)}° × ${fov.yFoV.toFixed(3)}°`;

  if (layer) {
    tileStatus.textContent =
      `Tiles: ${layer.readyTileCount} ready · ` +
      `${layer.loadingTileCount} loading · ` +
      `${layer.fallbackTileCount} fallback · ` +
      `z${layer.currentZoom ?? "—"}`;
  } else {
    tileStatus.textContent = "Tiles: —";
  }
}

canvas.addEventListener("camera-changed", (event: Event) => {
  const cameraEvent = event as CustomEvent<CameraChangedDetail>;

  if (cameraEvent.detail) {
    updateTelemetry();
  }
});

function activateEsriWorldImagery(): void {
  loadingIndicator.hidden = false;

  viewer.setActiveDomain("earth");
  viewer.setXYZMaxConcurrentRequests(4);

  viewer.activateWMTS({
    baseUrl:
      "https://services.arcgisonline.com/arcgis/rest/services/" +
      "World_Imagery/MapServer/WMTS/",
    layer: "World_Imagery",
    tileMatrixSet: "default028mm",
    style: "default",
    format: "image/jpeg",
    requestEncoding: "kvp",
    minZoom: 0,
    maxZoom: 8,
    segmentsPerSide: 48,
    maxCachedTiles: 384,
    attribution: "Esri World Imagery",
  });

  provenance.textContent =
    "Esri World Imagery · WMTS · Web Mercator-compatible " +
    "TileMatrixSet · rendered with AstroViewer WebGL2";
}

async function reset(): Promise<void> {
  sequenceToken += 1;
  running = false;
  paused = false;

  credits.hidden = true;
  viewer.removeAllEarthRasterOverlays();
  viewer.setActiveDomain("earth");

  if (viewer.isLonLatGridVisible()) {
    viewer.toggleLonLatGrid();
  }

  viewer.resetAxesOrientation();
  viewer.setFoV(95);
  viewer.goTo(0, 18);

  showCaption(
    "E00 / Ready",
    "Earth Observation Showcase",
    "Explore global imagery, geographic data and observation geometry.",
    'viewer.setActiveDomain("earth")',
  );

  status.textContent = "E00 ready";
  updateControls();
  updateTelemetry();
}

async function scene01EarthFromSpace(token: number): Promise<void> {
  audit.scenes.push(1);
  audit.sequencePhase = "scene01-global-earth";

  showCaption(
    "01 / Earth from space",
    "A global Earth view",
    "AstroViewer renders Earth imagery in a domain with its own camera and layer state.",
    'viewer.setActiveDomain("earth");\nviewer.activateWMTS(esriWorldImagery)',
  );

  viewer.setActiveDomain("earth");
  await viewer.flyToFoV(88, 1800);
  check(token);

  viewer.flyTo(-18, 18, 2600);
  await wait(2900, token);

  viewer.flyTo(20, 12, 2600);
  await wait(2900, token);

  await waitForEarthTiles(token);
  await wait(1100, token);
}

async function scene02GeographicNavigation(
  token: number,
): Promise<void> {
  audit.scenes.push(2);
  audit.sequencePhase = "scene02-geographic-navigation";

  showCaption(
    "02 / Geographic navigation",
    "Rome",
    "Move directly to a known longitude and latitude.",
    "viewer.goTo(12.4964, 41.9028)",
  );

  viewer.goTo(12.4964, 41.9028);
  await viewer.flyToFoV(28, 1800);
  await waitForEarthTiles(token);
  await wait(1300, token);

  showCaption(
    "02 / Geographic navigation",
    "Madrid",
    "Fly smoothly between geographic targets while fallback tiles preserve coverage.",
    "viewer.flyTo(-3.7038, 40.4168, 2600)",
  );

  viewer.flyTo(-3.7038, 40.4168, 2600);
  await wait(2900, token);
  await waitForEarthTiles(token);
  await wait(1200, token);

  showCaption(
    "02 / Geographic navigation",
    "Cape Town",
    "Longitude and latitude remain the common reference across the Earth domain.",
    "viewer.flyTo(18.4241, -33.9249, 2800)",
  );

  viewer.flyTo(18.4241, -33.9249, 2800);
  await wait(3100, token);
  await waitForEarthTiles(token);
  await wait(1300, token);
}

async function runE00(): Promise<void> {
  if (running) {
    return;
  }

  const token = ++sequenceToken;
  running = true;
  paused = false;
  audit.scenes.length = 0;
  audit.warnings.length = 0;

  status.textContent = "Running E00";
  updateControls();

  try {
    await resetForRun(token);
    await scene01EarthFromSpace(token);
    await scene02GeographicNavigation(token);

    check(token);
    audit.sequencePhase = "complete";
    status.textContent = "E00 review complete · 01–02";
  } catch (error) {
    if (token === sequenceToken) {
      console.error("E00 sequence failed", error);
      audit.sequencePhase = "failed";
      status.textContent = "E00 failed";
    }
  } finally {
    if (token === sequenceToken) {
      running = false;
      paused = false;
      updateControls();
    }
  }
}

async function resetForRun(token: number): Promise<void> {
  credits.hidden = true;
  viewer.removeAllEarthRasterOverlays();
  viewer.setActiveDomain("earth");

  if (viewer.isLonLatGridVisible()) {
    viewer.toggleLonLatGrid();
  }

  viewer.resetAxesOrientation();
  viewer.setFoV(95);
  viewer.goTo(0, 18);

  loadingIndicator.hidden = false;
  await waitForEarthTiles(token);
  await wait(500, token);
}

runButton.addEventListener("click", () => {
  void runE00();
});

pauseButton.addEventListener("click", () => {
  paused = !paused;
  status.textContent = paused ? "E00 paused" : "Running E00";
  updateControls();
});

resetButton.addEventListener("click", () => {
  void reset();
});

window.astroViewerDemo = {
  viewer,
  ready: false,
  mode,
  runE00,
  reset,
};

Object.assign(window.astroViewerDemo, {
  audit,
});

void (async () => {
  try {
    audit.sequencePhase = "initialising-earth";
    activateEsriWorldImagery();
    await waitForEarthTiles(sequenceToken);

    await reset();

    window.astroViewerDemo!.ready = true;
    audit.sequencePhase = "ready";

    if (mode === "video") {
      await runE00();
    }
  } catch (error) {
    console.error("E00 bootstrap failed", error);
    audit.sequencePhase = "bootstrap-failed";
    status.textContent = "E00 bootstrap failed";
    loadingIndicator.hidden = true;
  }
})();
