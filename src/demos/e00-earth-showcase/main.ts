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
const coordsGridLabels = get<HTMLDivElement>("coords-grid-labels");
const mapTransition = get<HTMLDivElement>("map-transition");

const query = new URLSearchParams(location.search);
const mode = query.get("mode") === "video" ? "video" : "interactive";

controls.hidden = mode === "video";

const viewer = new AstroViewer(canvas, {
  gridLabelContainers: {
    coords: coordsGridLabels,
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

function hideEarthGrid(): void {
  if (viewer.isLonLatGridVisible()) {
    viewer.toggleLonLatGrid();
  }

  // AstroViewer 3.18.1 can retain labels belonging to a replaced XYZ map.
  // Keep the showcase deterministic until the grid lifecycle is fixed in core.
  coordsGridLabels.hidden = true;
}

async function transitionEarthMap(
  activateMap: () => void,
  token: number,
  durationMs = 700,
): Promise<void> {
  const steps = 14;
  mapTransition.hidden = false;

  try {
    for (let step = 1; step <= steps; step++) {
      await wait(durationMs / steps, token);
      mapTransition.style.opacity = `${step / steps}`;
    }

    activateMap();
    hideEarthGrid();
    await waitForEarthTiles(token);

    for (let step = steps - 1; step >= 0; step--) {
      await wait(durationMs / steps, token);
      mapTransition.style.opacity = `${step / steps}`;
    }
  } finally {
    mapTransition.style.opacity = "0";
    mapTransition.hidden = true;
  }
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
  const token = sequenceToken;
  running = false;
  paused = false;

  credits.hidden = true;
  mapTransition.hidden = true;
  mapTransition.style.opacity = "0";
  viewer.removeAllEarthRasterOverlays();
  viewer.setActiveDomain("earth");
  activateEsriWorldImagery();
  hideEarthGrid();

  viewer.resetAxesOrientation();
  viewer.setEastWestRotationLocked(false);
  viewer.setNorthSouthRotationLocked(false);
  viewer.setFoV(95);
  viewer.goTo(0, 18);

  showCaption(
    "E00 / Ready",
    "Earth Observation Showcase",
    "Explore global imagery, geographic data and observation geometry.",
    'viewer.setActiveDomain("earth")',
  );

  status.textContent = "Preparing E00";
  updateControls();
  updateTelemetry();

  await waitForEarthTiles(token);
  status.textContent = "E00 ready";
}

async function scene01EarthFromSpace(token: number): Promise<void> {
  audit.scenes.push(1);
  audit.sequencePhase = "scene01-earth-rotation";

  showCaption(
    "01 / Earth from space",
    "A complete rotation of Earth",
    "Lock north-south movement and rotate once around the planet before arriving over Rome.",
    "viewer.setNorthSouthRotationLocked(true);\nviewer.flyTo(longitude, latitude, duration)",
  );

  viewer.setActiveDomain("earth");
  viewer.goTo(12.4964, 41.9028);
  await viewer.flyToFoV(78, 1800);
  await waitForEarthTiles(token);

  viewer.setEastWestRotationLocked(false);
  viewer.setNorthSouthRotationLocked(true);

  try {
    const rotationWaypoints = [
      102.4964,
      -167.5036,
      -77.5036,
      12.4964,
    ];

    for (const longitude of rotationWaypoints) {
      viewer.flyTo(longitude, 41.9028, 2200);
      await wait(2400, token);
    }
  } finally {
    viewer.setNorthSouthRotationLocked(false);
  }

  await waitForEarthTiles(token);
  await wait(1200, token);
}

async function scene02GeographicNavigation(
  token: number,
): Promise<void> {
  audit.scenes.push(2);
  audit.sequencePhase = "scene02-geographic-navigation";

  showCaption(
    "02 / Geographic navigation",
    "Rome",
    "Begin the geographic tour from a precise longitude and latitude.",
    "await viewer.flyToFoV(32, 1800)",
  );

  await viewer.flyToFoV(32, 1800);
  await waitForEarthTiles(token);
  await wait(1300, token);

  const destinations = [
    { name: "Madrid", longitude: -3.7038, latitude: 40.4168 },
    { name: "Cape Town", longitude: 18.4241, latitude: -33.9249 },
    { name: "New York", longitude: -74.006, latitude: 40.7128 },
    { name: "São Paulo", longitude: -46.6333, latitude: -23.5505 },
    { name: "Beijing, China", longitude: 116.4074, latitude: 39.9042 },
    { name: "Tehran, Iran", longitude: 51.389, latitude: 35.6892 },
    { name: "Rome", longitude: 12.4964, latitude: 41.9028 },
  ];

  for (const destination of destinations) {
    showCaption(
      "02 / Geographic navigation",
      destination.name,
      "Fly smoothly between geographic targets while fallback tiles preserve global coverage.",
      `viewer.flyTo(${destination.longitude}, ${destination.latitude}, 2800)`,
    );

    viewer.flyTo(destination.longitude, destination.latitude, 2800);
    await wait(3000, token);
    await waitForEarthTiles(token);
    await wait(900, token);
  }
}

async function scene03OpenXYZMaps(token: number): Promise<void> {
  audit.scenes.push(3);
  audit.sequencePhase = "scene03-open-xyz-maps";

  showCaption(
    "03 / Open XYZ maps",
    "OpenStreetMap",
    "Switch to an open cartographic source using a standard XYZ URL template.",
    'viewer.activateXYZ2({\n  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"\n})',
  );

  await transitionEarthMap(() => {
    loadingIndicator.hidden = false;
    viewer.activateXYZ2({
      name: "OpenStreetMap",
      urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      minZoom: 0,
      maxZoom: 19,
      segmentsPerSide: 48,
      maxCachedTiles: 384,
      attribution: "© OpenStreetMap contributors",
    });

    provenance.textContent =
      "© OpenStreetMap contributors · XYZ raster tiles · " +
      "rendered with AstroViewer WebGL2";
  }, token);

  await wait(1800, token);

  showCaption(
    "03 / Open XYZ maps",
    "OpenTopoMap",
    "The same Earth renderer can exchange providers while preserving geographic navigation.",
    'viewer.activateXYZ2({\n  urlTemplate: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png"\n})',
  );

  await transitionEarthMap(() => {
    loadingIndicator.hidden = false;
    viewer.activateXYZ2({
      name: "OpenTopoMap",
      urlTemplate: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      minZoom: 0,
      maxZoom: 17,
      segmentsPerSide: 48,
      maxCachedTiles: 384,
      attribution: "© OpenTopoMap contributors",
    });

    provenance.textContent =
      "© OpenTopoMap contributors · XYZ raster tiles · " +
      "rendered with AstroViewer WebGL2";
  }, token);

  await wait(2000, token);

  showCaption(
    "03 / Open XYZ maps",
    "Return to global imagery",
    "Restore Esri World Imagery before introducing scientific Earth imagery.",
    "viewer.activateWMTS(esriWorldImagery)",
  );

  await transitionEarthMap(activateEsriWorldImagery, token);
  await wait(1500, token);
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
    await scene03OpenXYZMaps(token);

    check(token);
    audit.sequencePhase = "complete";
    status.textContent = "E00 review complete · 01–03";
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
  activateEsriWorldImagery();
  hideEarthGrid();

  viewer.resetAxesOrientation();
  viewer.setEastWestRotationLocked(false);
  viewer.setNorthSouthRotationLocked(false);
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
