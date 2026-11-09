/// <reference path="../../demo-window.d.ts" />

import {
  AstroViewer,
  ColumnType,
  GeoJSONParser,
  MetadataColumn,
  MetadataManager,
  ObservationTrackViewerAdapter,
  type TerraFootprintSetGL,
  type CameraChangedDetail,
  type ObservationTrackFrame,
  type ObservationTrackLike,
  type ObservationTrackViewerHandle,
} from "astro-viewer";
import {
  NominatimService,
  type ResolvedPlace,
} from "astrospatial-services/earth/name-resolver";

declare global {
  interface AstroViewerDemoAPI {
    runE00?: (startScene?: number) => Promise<void>;
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
const captionBox = get<HTMLElement>("caption");
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
const satelliteLegend = get<HTMLElement>("satellite-legend");
const maritimeLegend = get<HTMLElement>("maritime-legend");
const observationMetadata = get<HTMLElement>("observation-metadata");
const layerStack = get<HTMLElement>("layer-stack");
const layerStackRows = get<HTMLElement>("layer-stack-rows");
const savedContexts = get<HTMLElement>("saved-contexts");
const savedContextRows = get<HTMLElement>("saved-context-rows");
const demoPointer = get<HTMLElement>("demo-pointer");
document.body.appendChild(demoPointer);

const query = new URLSearchParams(location.search);
const mode = query.get("mode") === "video" ? "video" : "interactive";
type SceneNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
const initialScene = Number(query.get("scene"));
const requestedScene: SceneNumber =
  Number.isInteger(initialScene) && initialScene >= 1 && initialScene <= 14
    ? (initialScene as SceneNumber)
    : 1;
const initialEndScene = Number(query.get("end"));
const requestedEndScene: SceneNumber | null =
  Number.isInteger(initialEndScene) &&
  initialEndScene >= requestedScene &&
  initialEndScene <= 14
    ? (initialEndScene as SceneNumber)
    : null;

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

let satelliteAdapter: ObservationTrackViewerAdapter | null = null;
let satelliteHandle: ObservationTrackViewerHandle | null = null;
let satelliteRegionsLayer: TerraFootprintSetGL | null = null;
let satelliteAcquiredImagesLayer: TerraFootprintSetGL | null = null;
let acquiredImageCount = 0;
let pointerPosition = { x: canvas.clientWidth * 0.5, y: canvas.clientHeight * 0.5 };

type CameraMatrices = Pick<CameraChangedDetail, "vMatrix" | "pMatrix" | "mMatrix">;
let cameraMatrices: CameraMatrices | null = null;

canvas.addEventListener("camera-changed", (event: Event) => {
  const detail = (event as CustomEvent<CameraChangedDetail>).detail;
  if (detail?.vMatrix && detail?.pMatrix && detail?.mMatrix) {
    cameraMatrices = {
      vMatrix: new Float32Array(detail.vMatrix),
      pMatrix: new Float32Array(detail.pMatrix),
      mMatrix: new Float32Array(detail.mMatrix),
    };
  }
});

const esriWorldImagery: Parameters<AstroViewer["activateWMTS"]>[0] = {
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
};

const nasaBlueMarble: Parameters<AstroViewer["activateWMTS"]>[0] = {
  baseUrl: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/",
  layer: "BlueMarble_ShadedRelief_Bathymetry",
  tileMatrixSet: "GoogleMapsCompatible_Level8",
  style: "default",
  format: "image/jpeg",
  requestEncoding: "rest",
  urlTemplate:
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
    "{Layer}/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/" +
    "{TileCol}.{TileFormatExtension}",
  minZoom: 0,
  maxZoom: 8,
  segmentsPerSide: 48,
  maxCachedTiles: 384,
  attribution: "NASA EOSDIS GIBS",
};

const openStreetMap = {
  name: "OpenStreetMap",
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  minZoom: 0,
  maxZoom: 19,
  segmentsPerSide: 48,
  maxCachedTiles: 384,
  attribution: "© OpenStreetMap contributors",
};

const worldCapitals = [
  [-77.0369, 38.9072, "Washington, D.C.", "United States", 0.7],
  [-99.1332, 19.4326, "Mexico City", "Mexico", 9.2],
  [-47.8825, -15.7942, "Brasília", "Brazil", 2.8],
  [-58.3816, -34.6037, "Buenos Aires", "Argentina", 3.1],
  [-0.1276, 51.5072, "London", "United Kingdom", 8.9],
  [2.3522, 48.8566, "Paris", "France", 2.1],
  [-3.7038, 40.4168, "Madrid", "Spain", 3.3],
  [12.4964, 41.9028, "Rome", "Italy", 2.8],
  [31.2357, 30.0444, "Cairo", "Egypt", 10.2],
  [36.8219, -1.2921, "Nairobi", "Kenya", 4.4],
  [28.0473, -26.2041, "Pretoria", "South Africa", 0.8],
  [77.2090, 28.6139, "New Delhi", "India", 11.0],
  [116.4074, 39.9042, "Beijing", "China", 21.9],
  [139.6917, 35.6895, "Tokyo", "Japan", 14.0],
  [151.2093, -33.8688, "Canberra", "Australia", 0.5],
] as const;

const europeanFireClusters = [
  [-8.18, 40.12, "Central Portugal", 82, 3],
  [-7.55, 41.63, "Northern Portugal", 68, 2],
  [-6.25, 42.52, "North-western Spain", 91, 3],
  [-3.42, 38.23, "Andalusia", 57, 2],
  [2.62, 41.78, "Catalonia", 44, 1],
  [16.38, 39.34, "Calabria", 76, 3],
  [23.73, 38.72, "Central Greece", 88, 3],
  [26.15, 39.18, "Aegean coast", 63, 2],
  [15.12, 45.02, "Adriatic coast", 39, 1],
] as const;

const placeResolver = new NominatimService({
  userAgent: "AstroViewer Earth showcase",
  transport: {
    async getText(url, options) {
      const response = await fetch(url, { signal: options.signal });
      if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
      return await response.text();
    },
  },
});

const italyCitiesUrl = new URL("./data/italy-cities.geojson", import.meta.url).href;
const italyRegionsUrl = new URL("./data/italy-regions.geojson", import.meta.url).href;
const spainRegionsUrl = new URL("./data/spain-regions.geojson", import.meta.url).href;
const mediterraneanFerryRoutesUrl = new URL(
  "./data/mediterranean-ferry-routes.geojson",
  import.meta.url,
).href;
const satelliteModelUrl = new URL(
  "./data/satellite/simple-satellite.obj",
  import.meta.url,
).href;

type GeoJSONFeature = {
  type?: "Feature";
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
};

type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

async function loadGeoJSON(url: string): Promise<GeoJSONFeatureCollection> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load GeoJSON: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as GeoJSONFeatureCollection;
}

function satelliteFootprint(longitudeDeg: number, latitudeDeg: number) {
  const longitudeRadius = 1.25 / Math.max(0.45, Math.cos(latitudeDeg * Math.PI / 180));
  const latitudeRadius = 1;
  return Array.from({ length: 17 }, (_, index) => {
    const angle = index / 16 * Math.PI * 2;
    return [
      longitudeDeg + Math.cos(angle) * longitudeRadius,
      latitudeDeg + Math.sin(angle) * latitudeRadius,
    ] as const;
  });
}

const satelliteSamples = [
  [-17.4695, 25.9340, false],
  [-14.6710, 28.7287, true],
  [-11.7081, 31.4503, false],
  [-8.5571, 34.0857, false],
  [-5.1930, 36.6203, true],
  [-1.5904, 39.0372, true],
  [2.2757, 41.3175, true],
  [6.4280, 43.4397, false],
  [10.8845, 45.3800, false],
].map(([longitudeDeg, latitudeDeg, intersects], index) => ({
  timestamp: new Date(Date.UTC(2019, 5, 24, 6, 16, index)).toISOString(),
  groundTrackPoint: {
    longitudeDeg: Number(longitudeDeg),
    latitudeDeg: Number(latitudeDeg),
    altitudeKm: 410 + index * 0.24,
  },
  intersects: Boolean(intersects),
  footprint: satelliteFootprint(Number(longitudeDeg), Number(latitudeDeg)),
}));

function clearSatelliteObservation(): void {
  satelliteHandle?.dispose();
  satelliteAdapter?.clear();
  if (satelliteRegionsLayer) {
    viewer.deleteTerraFootprintSet(satelliteRegionsLayer);
  }
  if (satelliteAcquiredImagesLayer) {
    viewer.deleteTerraFootprintSet(satelliteAcquiredImagesLayer);
  }
  satelliteHandle = null;
  satelliteAdapter = null;
  satelliteRegionsLayer = null;
  satelliteAcquiredImagesLayer = null;
  acquiredImageCount = 0;
  satelliteLegend.hidden = true;
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  demoPointer.hidden = true;
  captionBox.classList.remove("satellite-scene");
}

const arrowCursor = demoPointer.innerHTML;

function placeDemoPointer(x: number, y: number): void {
  const rect = canvas.getBoundingClientRect();
  demoPointer.style.left = `${rect.left + x}px`;
  demoPointer.style.top = `${rect.top + y}px`;
}

function dispatchPointer(x: number, y: number): void {
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: -1,
    buttons: 0,
    clientX: rect.left + x,
    clientY: rect.top + y,
  }));
}

async function animatePointer(
  target: { x: number; y: number },
  token: number,
): Promise<void> {
  const from = pointerPosition;
  demoPointer.hidden = false;
  cursorGesture(false);
  for (let index = 0; index <= 30; index++) {
    check(token);
    const phase = index / 30;
    const smooth = phase * phase * (3 - 2 * phase);
    const x = from.x + (target.x - from.x) * smooth;
    const y = from.y + (target.y - from.y) * smooth;
    placeDemoPointer(x, y);
    dispatchPointer(x, y);
    await wait(22, token);
  }
  pointerPosition = target;
}

function multiplyMatVec(matrix: Float32Array, vector: readonly number[]): number[] {
  return [0, 1, 2, 3].map(
    (row) =>
      matrix[row] * vector[0] +
      matrix[4 + row] * vector[1] +
      matrix[8 + row] * vector[2] +
      matrix[12 + row] * vector[3],
  );
}

function pointToScreen(point: { x: number; y: number; z: number }) {
  if (!cameraMatrices) return null;
  const model = multiplyMatVec(cameraMatrices.mMatrix, [point.x, point.y, point.z, 1]);
  const view = multiplyMatVec(cameraMatrices.vMatrix, model);
  const clip = multiplyMatVec(cameraMatrices.pMatrix, view);
  if (clip[3] <= 0) return null;
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return {
    x: (ndcX * 0.5 + 0.5) * canvas.clientWidth,
    y: (1 - (ndcY * 0.5 + 0.5)) * canvas.clientHeight,
  };
}

function footprintScreenPoint(footprint: TerraFootprintSetGL["footprintPolygons"][number]) {
  const ring = footprint.polygons.find((points) => points.length >= 3);
  if (!ring) throw new Error("Acquired image footprint has no polygon vertices.");
  const center = ring.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  const length = Math.hypot(center.x, center.y, center.z);
  const projected = length
    ? pointToScreen({ x: center.x / length, y: center.y / length, z: center.z / length })
    : null;
  if (!projected) throw new Error("Unable to project acquired image footprint.");
  return projected;
}

async function findFootprintHoverPoint(
  layer: TerraFootprintSetGL,
  footprint: TerraFootprintSetGL["footprintPolygons"][number],
  token: number,
): Promise<{ x: number; y: number }> {
  const projectedPoints = footprint.polygons
    .flatMap((ring) => ring)
    .map((point) => pointToScreen(point))
    .filter((point): point is { x: number; y: number } => point !== null);
  if (!projectedPoints.length) return footprintScreenPoint(footprint);

  const minX = Math.max(0, Math.min(...projectedPoints.map(({ x }) => x)));
  const maxX = Math.min(canvas.clientWidth, Math.max(...projectedPoints.map(({ x }) => x)));
  const minY = Math.max(0, Math.min(...projectedPoints.map(({ y }) => y)));
  const maxY = Math.min(canvas.clientHeight, Math.max(...projectedPoints.map(({ y }) => y)));
  const gridSize = 9;
  const candidates = Array.from({ length: gridSize * gridSize }, (_, index) => {
    const column = index % gridSize;
    const row = Math.floor(index / gridSize);
    return {
      x: minX + (maxX - minX) * ((column + 0.5) / gridSize),
      y: minY + (maxY - minY) * ((row + 0.5) / gridSize),
      distanceFromCentre: Math.hypot(
        column - (gridSize - 1) / 2,
        row - (gridSize - 1) / 2,
      ),
    };
  }).sort((left, right) => left.distanceFromCentre - right.distanceFromCentre);

  for (const candidate of candidates) {
    check(token);
    dispatchPointer(candidate.x, candidate.y);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (layer.hoveredFootprints.footprints.includes(footprint)) {
      return { x: candidate.x, y: candidate.y };
    }
  }

  audit.warnings.push("Unable to find an interior hover point for a regional footprint");
  return footprintScreenPoint(footprint);
}

type FootprintDetail = { key: string; value: string | number };

function showObservationMetadata(
  footprint: TerraFootprintSetGL["footprintPolygons"][number],
  state: "hover" | "selected",
): void {
  if (state === "hover") {
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
  }
  const values = new Map(
    (footprint.details as unknown as FootprintDetail[]).map(({ key, value }) => [key, value]),
  );
  const card = document.createElement("section");
  card.className = "observation-record";
  card.dataset.state = state;
  const title = document.createElement("strong");
  title.textContent = String(values.get("obs_id") ?? "Satellite observation");
  card.append(title);
  for (const [label, key] of [
    ["Target", "target"],
    ["Sensor", "sensor"],
    ["Centre", "central_coordinates"],
    ["Altitude", "altitude_km"],
    ["Start", "start_time"],
    ["Stop", "stop_time"],
  ] as const) {
    const line = document.createElement("span");
    const value = values.get(key);
    line.textContent = `${label}: ${value ?? "—"}${key === "altitude_km" ? " km" : ""}`;
    card.append(line);
  }
  if (state === "hover") observationMetadata.prepend(card);
  else observationMetadata.append(card);
  observationMetadata.hidden = false;
}

function addLayerStackRow(
  name: string,
  kind: string,
  opacity = 1,
): HTMLInputElement {
  const row = document.createElement("div");
  row.className = "layer-row";
  const label = document.createElement("span");
  label.textContent = name;
  const type = document.createElement("small");
  type.textContent = kind;
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "1";
  slider.step = "0.01";
  slider.value = String(opacity);
  slider.disabled = kind === "base";
  row.append(label, type, slider);
  layerStackRows.append(row);
  return slider;
}

async function animateLayerSlider(
  slider: HTMLInputElement,
  from: number,
  to: number,
  durationMs: number,
  token: number,
  update: (opacity: number) => void,
): Promise<void> {
  const steps = Math.max(1, Math.round(durationMs / 50));
  for (let index = 0; index <= steps; index++) {
    check(token);
    const opacity = from + (to - from) * (index / steps);
    slider.value = opacity.toFixed(2);
    update(opacity);
    await wait(durationMs / steps, token);
  }
}

function showSavedContext(
  name: string,
  titleText: string,
  summary: string,
  thumbnail: string,
  active = false,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "context-row";
  row.dataset.name = name;
  row.dataset.active = String(active);
  const preview = document.createElement("img");
  preview.src = thumbnail;
  preview.alt = "";
  const text = document.createElement("span");
  const label = document.createElement("b");
  label.textContent = titleText;
  const state = document.createElement("small");
  state.textContent = summary;
  text.append(label, state);
  const remove = document.createElement("button");
  remove.className = "context-delete";
  remove.dataset.contextDelete = name;
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Delete ${titleText}`);
  row.append(preview, text, remove);
  savedContextRows.append(row);
  return row;
}

function setActiveContext(name: string): void {
  savedContextRows.querySelectorAll<HTMLElement>(".context-row").forEach((row) => {
    row.dataset.active = String(row.dataset.name === name);
  });
}

async function fetchCurrentWeather(latitude: number, longitude: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  return await response.json() as {
    current?: {
      time?: string;
      temperature_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
    current_units?: Record<string, string>;
  };
}

async function fetchWikipediaSummary(name: string) {
  const endpoint =
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
  const summary = await response.json() as {
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  return {
    extract: summary.extract?.trim() || undefined,
    pageUrl: summary.content_urls?.desktop?.page,
  };
}

function showCapitalMetadata(
  name: string,
  country: string,
  longitude: number,
  latitude: number,
  populationMillions: number,
  weather: Awaited<ReturnType<typeof fetchCurrentWeather>> | null,
  resolvedPlace: ResolvedPlace | null,
  wikipedia: Awaited<ReturnType<typeof fetchWikipediaSummary>> | null,
  state: "hover" | "selected",
): void {
  if (state === "hover") {
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
  }
  const card = document.createElement("section");
  card.className = "observation-record";
  card.dataset.state = state;
  const title = document.createElement("strong");
  title.textContent = `${name}, ${country}`;
  const current = weather?.current;
  const units = weather?.current_units ?? {};
  const lines = [
    `Coordinates: ${longitude.toFixed(4)}°, ${latitude.toFixed(4)}°`,
    `Population: about ${populationMillions.toFixed(1)} million (illustrative estimate)`,
    `Resolved place: ${resolvedPlace?.label ?? "runtime resolver unavailable"}`,
    `Temperature: ${current?.temperature_2m ?? "unavailable"}${current?.temperature_2m != null ? (units.temperature_2m ?? "°C") : ""}`,
    `Wind: ${current?.wind_speed_10m ?? "unavailable"}${current?.wind_speed_10m != null ? ` ${units.wind_speed_10m ?? "km/h"}` : ""}`,
    `Observed: ${current?.time ?? "runtime service unavailable"}`,
    `Wikipedia: ${wikipedia?.extract?.slice(0, 150) ?? "runtime summary unavailable"}`,
    "Sources: ◉ Nominatim · ☀ Open-Meteo · W Wikipedia",
  ];
  card.append(title, ...lines.map((text) => {
    const line = document.createElement("span");
    line.textContent = text;
    return line;
  }));
  if (state === "hover") observationMetadata.prepend(card);
  else observationMetadata.append(card);
  observationMetadata.hidden = false;
}

function showRegionMetadata(
  name: string,
  country: string,
  population: string,
  sourceProperties: Record<string, unknown>,
  state: "hover" | "selected",
): void {
  if (state === "hover") {
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
  }
  const card = document.createElement("section");
  card.className = "observation-record";
  card.dataset.state = state;
  const title = document.createElement("strong");
  title.textContent = `${name}, ${country}`;
  const lines = [
    `Feature: administrative region`,
    `Population: ${population}`,
    `Source attributes: ${Object.entries(sourceProperties)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" · ")}`,
    "Geometry: synthetic demonstration fixture",
  ];
  card.append(title, ...lines.map((text) => {
    const line = document.createElement("span");
    line.textContent = text;
    return line;
  }));
  if (state === "hover") observationMetadata.prepend(card);
  else observationMetadata.append(card);
  observationMetadata.hidden = false;
}

async function demonstrateAcquiredImageMetadata(token: number): Promise<void> {
  if (!satelliteAcquiredImagesLayer) return;
  const footprints = satelliteAcquiredImagesLayer.footprintPolygons.filter(
    (footprint) => footprint.valid,
  );
  const targets = [footprints[4], footprints[6]].filter(Boolean);
  for (const footprint of targets) {
    await animatePointer(footprintScreenPoint(footprint), token);
    satelliteAcquiredImagesLayer.extHighlightFootprint(footprint, true);
    showObservationMetadata(footprint, "hover");
    await wait(1100, token);
    satelliteAcquiredImagesLayer.extAddPolygons2Selected(footprint);
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
    showObservationMetadata(footprint, "selected");
    satelliteAcquiredImagesLayer.extHighlightFootprint(footprint, false);
    await wait(1150, token);
  }
  await wait(1800, token);
}

function cursorGesture(grabbing: boolean): void {
  demoPointer.innerHTML = grabbing
    ? '<svg viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg"><path d="M9 18V7a3 3 0 0 1 6 0v8-3a3 3 0 0 1 5 0v3-1a3 3 0 0 1 5 0v2a3 3 0 0 1 5 1v9c0 5-4 8-9 8h-5c-4 0-6-3-8-6l-5-7c-2-3 2-6 4-3l2 2Z" fill="white" stroke="#071629" stroke-width="2" stroke-linejoin="round"/></svg>'
    : arrowCursor;
}

async function animateDragPointer(
  deltaX: number,
  durationMs: number,
  token: number,
  start = { x: canvas.clientWidth * 0.46, y: canvas.clientHeight * 0.48 },
): Promise<void> {
  const steps = Math.max(1, Math.round(durationMs / 50));
  demoPointer.hidden = false;
  cursorGesture(true);

  try {
    for (let index = 0; index <= steps; index++) {
      check(token);
      const phase = index / steps;
      const smooth = phase * phase * (3 - 2 * phase);
      pointerPosition = { x: start.x + deltaX * smooth, y: start.y };
      placeDemoPointer(pointerPosition.x, pointerPosition.y);
      await wait(durationMs / steps, token);
    }
  } finally {
    cursorGesture(false);
    demoPointer.hidden = true;
  }
}

function featureBounds(feature: GeoJSONFeature) {
  const values: [number, number][] = [];
  const collect = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      values.push([coordinates[0], coordinates[1]]);
      return;
    }
    for (const child of coordinates) collect(child);
  };
  collect(feature.geometry?.coordinates);
  if (!values.length) return null;
  return {
    minLongitude: Math.min(...values.map(([longitude]) => longitude)),
    maxLongitude: Math.max(...values.map(([longitude]) => longitude)),
    minLatitude: Math.min(...values.map(([, latitude]) => latitude)),
    maxLatitude: Math.max(...values.map(([, latitude]) => latitude)),
  };
}

function selectIntersectingRegions(
  regions: GeoJSONFeatureCollection,
  footprint: readonly (readonly [number, number])[],
): void {
  if (!satelliteRegionsLayer || !footprint.length) return;
  const footprintBounds = {
    minLongitude: Math.min(...footprint.map(([longitude]) => longitude)),
    maxLongitude: Math.max(...footprint.map(([longitude]) => longitude)),
    minLatitude: Math.min(...footprint.map(([, latitude]) => latitude)),
    maxLatitude: Math.max(...footprint.map(([, latitude]) => latitude)),
  };
  const selectedIndexes = regions.features
    .map((feature, index) => ({ index, bounds: featureBounds(feature) }))
    .filter(({ bounds }) =>
      bounds &&
      bounds.maxLongitude >= footprintBounds.minLongitude &&
      bounds.minLongitude <= footprintBounds.maxLongitude &&
      bounds.maxLatitude >= footprintBounds.minLatitude &&
      bounds.minLatitude <= footprintBounds.maxLatitude,
    )
    .map(({ index }) => index);
  satelliteRegionsLayer.restoreSelection(selectedIndexes);
}

function updateAcquiredImages(frame: ObservationTrackFrame): void {
  if (!satelliteAcquiredImagesLayer) return;
  const completedCount = satelliteSamples.filter(
    (sample) => Date.parse(sample.timestamp) <= frame.currentMs,
  ).length;
  if (completedCount === acquiredImageCount) return;

  acquiredImageCount = completedCount;
  if (completedCount === 0) {
    satelliteAcquiredImagesLayer.clearFootprints();
    return;
  }

  const acquiredGeoJSON: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: satelliteSamples.slice(0, completedCount).map((sample, index) => {
      const startMs = Date.parse(sample.timestamp) - 400;
      const stopMs = Date.parse(sample.timestamp) + 400;
      const sequence = String(index + 1).padStart(3, "0");
      return {
        type: "Feature",
        id: `acquired-image-${sequence}`,
        properties: {
          name: `ISS image ${sequence}`,
          obs_id: `ISS-SPAIN-20190624-${sequence}`,
          target: sample.intersects ? "Spanish administrative region" : "Iberian observation corridor",
          central_coordinates:
            `${sample.groundTrackPoint.longitudeDeg.toFixed(4)}°, ` +
            `${sample.groundTrackPoint.latitudeDeg.toFixed(4)}°`,
          center_longitude_deg: sample.groundTrackPoint.longitudeDeg,
          center_latitude_deg: sample.groundTrackPoint.latitudeDeg,
          start_time: new Date(startMs).toISOString(),
          stop_time: new Date(stopMs).toISOString(),
          satellite: "ISS (ZARYA)",
          sensor: "Demonstration nadir optical sensor",
          altitude_km: Number(sample.groundTrackPoint.altitudeKm.toFixed(2)),
        },
        geometry: {
          type: "Polygon",
          coordinates: [sample.footprint],
        },
      };
    }),
  };
  satelliteAcquiredImagesLayer.addGeoJSONFeatures(
    GeoJSONParser.parseGeoJSON(acquiredGeoJSON),
  );
}

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
    `FoV: ${fov.xFoV.toFixed(3)}° × ${fov.yFoV.toFixed(3)}°`;

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

  viewer.activateWMTS(esriWorldImagery);

  provenance.textContent =
    "Esri World Imagery · WMTS · Web Mercator-compatible " +
    "TileMatrixSet · rendered with AstroViewer WebGL2";
}

async function showOpening(token: number): Promise<void> {
  const intro = get<HTMLElement>("scene-intro");
  const subtitle = intro.querySelector("p")!;
  viewer.setEarthBaseMapOpacity(0);
  intro.classList.add("opening");
  intro.querySelector("small")!.hidden = true;
  intro.querySelector("h1")!.textContent = "AstroViewer";
  subtitle.textContent = "Earth Observation Showcase";
  subtitle.hidden = false;
  captionBox.hidden = true;
  intro.hidden = false;

  try {
    await wait(500, token);
    await viewer.fadeEarthBaseMapOpacity(1, 3000);
    await wait(1000, token);
    intro.classList.add("leaving");
    await wait(350, token);
  } finally {
    intro.hidden = true;
    intro.classList.remove("opening", "leaving");
    intro.querySelector("small")!.hidden = false;
    subtitle.hidden = true;
    captionBox.hidden = false;
  }
}

async function showSceneTitle(
  number: SceneNumber,
  title: string,
  token: number,
): Promise<void> {
  const intro = get<HTMLElement>("scene-intro");
  intro.querySelector("small")!.textContent =
    `SCENE ${String(number).padStart(2, "0")}`;
  intro.querySelector("h1")!.textContent = title;
  captionBox.hidden = true;
  intro.hidden = false;
  await wait(1800, token);
  intro.classList.add("leaving");
  await wait(350, token);
  intro.hidden = true;
  intro.classList.remove("leaving");
  captionBox.hidden = false;
}

async function reset(): Promise<void> {
  sequenceToken += 1;
  const token = sequenceToken;
  running = false;
  paused = false;

  credits.hidden = true;
  layerStack.hidden = true;
  savedContexts.hidden = true;
  observationMetadata.hidden = true;
  viewer.removeAllEarthRasterOverlays();
  viewer.setActiveDomain("earth");
  activateEsriWorldImagery();
  viewer.setEarthBaseMapOpacity(1);
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
    "Fly smoothly into the initial view, then rotate continuously around the planet and return precisely to Rome.",
    "await viewer.flyTo(12.4964, 41.9028, 2200)\n" +
      "await viewer.flyToFoV(78, 1800)\n" +
      "await viewer.rotateEarthLongitude(360, 12000)",
  );

  viewer.setActiveDomain("earth");
  await viewer.flyTo(12.4964, 41.9028, 2200);
  await viewer.flyToFoV(78, 1800);
  await waitForEarthTiles(token);

  await viewer.rotateEarthLongitude(360, 12000);
  check(token);

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
    { query: "Madrid, Spain", longitude: -3.7038, latitude: 40.4168 },
    { query: "Cape Town, South Africa", longitude: 18.4241, latitude: -33.9249 },
    { query: "New York, United States", longitude: -74.006, latitude: 40.7128 },
    { query: "São Paulo, Brazil", longitude: -46.6333, latitude: -23.5505 },
    { query: "Beijing, China", longitude: 116.4074, latitude: 39.9042 },
    { query: "Tehran, Iran", longitude: 51.389, latitude: 35.6892 },
    { query: "Rome, Italy", longitude: 12.4964, latitude: 41.9028 },
  ];

  for (const destination of destinations) {
    let longitude = destination.longitude;
    let latitude = destination.latitude;
    let resolvedLabel = destination.query;
    try {
      const resolved = (await placeResolver.search(destination.query, { limit: 1 }))[0];
      if (resolved) {
        longitude = resolved.longitudeDeg;
        latitude = resolved.latitudeDeg;
        resolvedLabel = resolved.label;
      }
    } catch (error) {
      audit.warnings.push(
        `${destination.query} place resolution unavailable: ${String(error)}`,
      );
    }

    showCaption(
      "02 / Geographic navigation",
      destination.query,
      `Resolve the place name at runtime, then fly to ${resolvedLabel}.`,
      `const place = await placeResolver.search("${destination.query}")\n` +
        "const { longitudeDeg, latitudeDeg } = place[0]\n" +
        "await viewer.flyTo(longitudeDeg, latitudeDeg, 2800)",
    );

    await viewer.flyTo(longitude, latitude, 2800);
    check(token);
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
    'await viewer.transitionToXYZ({\n  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"\n})',
  );

  loadingIndicator.hidden = false;
  await viewer.transitionToXYZ(
    {
      name: "OpenStreetMap",
      urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      minZoom: 0,
      maxZoom: 19,
      segmentsPerSide: 48,
      maxCachedTiles: 384,
      attribution: "© OpenStreetMap contributors",
    },
    { durationMs: 1400 },
  );
  check(token);
  provenance.textContent =
    "© OpenStreetMap contributors · XYZ raster tiles · " +
    "rendered with AstroViewer WebGL2";
  await waitForEarthTiles(token);

  showCaption(
    "03 / Open XYZ maps",
    "Central Park · street-level detail",
    "Move from the global map to an urban scale where OpenStreetMap roads, paths and park geometry become visible.",
    "await viewer.flyTo(-73.9654, 40.7829, 2400)\n" +
      "await viewer.flyToFoV(0.08, 2400)",
  );
  await viewer.flyTo(-73.9654, 40.7829, 2400);
  await viewer.flyToFoV(0.08, 2400);
  check(token);
  await waitForEarthTiles(token);
  await wait(2400, token);

  showCaption(
    "03 / Open XYZ maps",
    "OpenTopoMap",
    "The same Earth renderer can exchange providers while preserving geographic navigation.",
    'await viewer.transitionToXYZ({\n  urlTemplate: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png"\n})',
  );

  loadingIndicator.hidden = false;
  await viewer.transitionToXYZ(
    {
      name: "OpenTopoMap",
      urlTemplate: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      minZoom: 0,
      maxZoom: 17,
      segmentsPerSide: 48,
      maxCachedTiles: 384,
      attribution: "© OpenTopoMap contributors",
    },
    { durationMs: 1400 },
  );
  check(token);
  provenance.textContent =
    "© OpenTopoMap contributors · XYZ raster tiles · " +
    "rendered with AstroViewer WebGL2";
  await waitForEarthTiles(token);

  await wait(2000, token);

  showCaption(
    "03 / Open XYZ maps",
    "Return to global imagery",
    "Restore Esri World Imagery and smoothly widen the view before introducing the WMTS product scene.",
    "await viewer.flyToFoV(18, 2400)\n" +
      "await viewer.flyTo(12.4964, 41.9028, 2200)\n" +
      "await viewer.flyToFoV(32, 1800)\n" +
      "await viewer.transitionToWMTS(esriWorldImagery)",
  );

  loadingIndicator.hidden = false;
  await viewer.flyToFoV(18, 2400);
  await viewer.flyTo(12.4964, 41.9028, 2200);
  await viewer.flyToFoV(32, 1800);
  await viewer.transitionToWMTS(esriWorldImagery, { durationMs: 1400 });
  check(token);
  provenance.textContent =
    "Esri World Imagery · WMTS · Web Mercator-compatible " +
    "TileMatrixSet · rendered with AstroViewer WebGL2";
  await waitForEarthTiles(token);
  await wait(1500, token);
}

async function scene04ScientificWMTS(token: number): Promise<void> {
  audit.scenes.push(4);
  audit.sequencePhase = "scene04-scientific-wmts";

  showCaption(
    "04 / Standards-based global imagery",
    "NASA GIBS Blue Marble",
    "Load NASA's global shaded-relief and bathymetry product through the OGC WMTS standard.",
    "await viewer.transitionToWMTS(nasaBlueMarble)",
  );

  loadingIndicator.hidden = false;
  await viewer.transitionToWMTS(nasaBlueMarble, { durationMs: 1600 });
  check(token);
  provenance.textContent =
    "NASA EOSDIS GIBS · Blue Marble Shaded Relief and Bathymetry · " +
    "WMTS EPSG:3857 · GoogleMapsCompatible_Level8";
  await waitForEarthTiles(token);
  await wait(2600, token);

  showCaption(
    "04 / Standards-based global imagery",
    "Return to satellite imagery",
    "Return to Esri World Imagery after demonstrating interchangeable WMTS providers.",
    "await viewer.transitionToWMTS(esriWorldImagery)",
  );

  loadingIndicator.hidden = false;
  await viewer.transitionToWMTS(esriWorldImagery, { durationMs: 1600 });
  check(token);
  provenance.textContent =
    "Esri World Imagery · WMTS · Web Mercator-compatible " +
    "TileMatrixSet · rendered with AstroViewer WebGL2";
  await waitForEarthTiles(token);
  await wait(1600, token);
}

async function scene05RasterCompositing(token: number): Promise<void> {
  audit.scenes.push(5);
  audit.sequencePhase = "scene05-raster-compositing";

  showCaption(
    "05 / Raster compositing",
    "A three-layer raster stack",
    "Keep Esri as the base map and add independent NASA WMTS and OpenStreetMap XYZ overlays.",
    "const nasa = viewer.addWMTSRasterOverlay(nasaBlueMarble)\n" +
      "const osm = viewer.addXYZRasterOverlay(openStreetMap)",
  );

  loadingIndicator.hidden = false;
  const nasa = viewer.addWMTSRasterOverlay(nasaBlueMarble);
  const osm = viewer.addXYZRasterOverlay(openStreetMap);
  viewer.setEarthRasterOverlayOpacity(nasa.id, 0);
  viewer.setEarthRasterOverlayOpacity(osm.id, 0);
  layerStackRows.replaceChildren();
  addLayerStackRow("Esri World Imagery", "base", 1);
  const nasaSlider = addLayerStackRow("NASA Blue Marble", "WMTS overlay", 0);
  const osmSlider = addLayerStackRow("OpenStreetMap", "XYZ overlay", 0);
  layerStack.hidden = false;

  try {
    provenance.textContent =
      "Base: Esri World Imagery · Overlays: NASA EOSDIS GIBS + " +
      "© OpenStreetMap contributors · independent raster stack";
    await waitForEarthTiles(token);

    showCaption(
      "05 / Raster compositing",
      "Independent layer opacity",
      "The simulated layer panel drives the real opacity of each overlay while the Esri base remains unchanged.",
      "viewer.setEarthRasterOverlayOpacity(nasa.id, opacity)\n" +
        "viewer.setEarthRasterOverlayOpacity(osm.id, opacity)",
    );
    await animateLayerSlider(nasaSlider, 0, 0.7, 1800, token, (opacity) => {
      viewer.setEarthRasterOverlayOpacity(nasa.id, opacity);
    });
    await animateLayerSlider(osmSlider, 0, 0.45, 1800, token, (opacity) => {
      viewer.setEarthRasterOverlayOpacity(osm.id, opacity);
    });
    check(token);
    await wait(1800, token);

    showCaption(
      "05 / Raster compositing",
      "Rebalance the composition",
      "Move both controls again to emphasise the cartographic overlay over the global imagery product.",
      "viewer.setEarthRasterOverlayOpacity(nasa.id, opacity)\n" +
        "viewer.setEarthRasterOverlayOpacity(osm.id, opacity)",
    );
    await Promise.all([
      animateLayerSlider(nasaSlider, 0.7, 0.25, 1400, token, (opacity) => {
        viewer.setEarthRasterOverlayOpacity(nasa.id, opacity);
      }),
      animateLayerSlider(osmSlider, 0.45, 0.8, 1400, token, (opacity) => {
        viewer.setEarthRasterOverlayOpacity(osm.id, opacity);
      }),
    ]);
    check(token);
    await wait(1500, token);

    showCaption(
      "05 / Raster compositing",
      "Release the raster stack",
      "Fade and remove both temporary overlays, including their tile and WebGL resources.",
      "viewer.setEarthRasterOverlayOpacity(nasa.id, 0)\n" +
        "viewer.setEarthRasterOverlayOpacity(osm.id, 0)\n" +
        "viewer.removeEarthRasterOverlay(osm.id)\n" +
        "viewer.removeEarthRasterOverlay(nasa.id)",
    );
    await Promise.all([
      animateLayerSlider(nasaSlider, 0.25, 0, 900, token, (opacity) => {
        viewer.setEarthRasterOverlayOpacity(nasa.id, opacity);
      }),
      animateLayerSlider(osmSlider, 0.8, 0, 900, token, (opacity) => {
        viewer.setEarthRasterOverlayOpacity(osm.id, opacity);
      }),
    ]);
    check(token);
  } finally {
    viewer.removeEarthRasterOverlay(osm.id);
    viewer.removeEarthRasterOverlay(nasa.id);
    layerStack.hidden = true;
  }

  provenance.textContent =
    "Esri World Imagery · WMTS base map · temporary NASA overlay removed";
  await wait(1200, token);
}

async function scene06GeoJSONPoints(token: number): Promise<void> {
  audit.scenes.push(6);
  audit.sequencePhase = "scene06-world-capitals";

  showCaption(
    "06 / Geographic point data",
    "World capitals",
    "Start from the whole Earth and load a global capital catalogue into an AstroTable-backed point layer.",
    "const capitals = viewer.addTerraPointSet(capitalsTable, {\n" +
      "  name: \"World capitals\"\n" +
      "})",
  );

  const columns = [
    new MetadataColumn({ index: 0, name: "longitudeDeg", columnType: ColumnType.GEOM_RA, unit: "deg" }),
    new MetadataColumn({ index: 1, name: "latitudeDeg", columnType: ColumnType.GEOM_DEC, unit: "deg" }),
    new MetadataColumn({ index: 2, name: "name", columnType: ColumnType.MAIN_NAME }),
    new MetadataColumn({ index: 3, name: "country", columnType: ColumnType.STRING }),
    new MetadataColumn({ index: 4, name: "population", columnType: ColumnType.NUMBER, unit: "million" }),
  ];
  const rows = worldCapitals.map((capital) => [...capital]);
  const cityLayer = viewer.addTerraPointSet(
    { columns, rows },
    {
      name: "World capitals",
      description: "Synthetic demonstration catalogue enriched at runtime",
    },
  );
  viewer.changeCatalogueColor(cityLayer, "#ffcf5a");
  provenance.textContent =
    `${rows.length} synthetic capital points · AstroTable Earth catalogue · ` +
    "runtime context: Nominatim, Open-Meteo and Wikipedia";

  await viewer.flyTo(12, 15, 1800);
  await viewer.flyToFoV(118, 1400);
  await wait(1800, token);

  for (const index of [2, 9, 13]) {
    const source = cityLayer.sources[index];
    const [longitude, latitude, name, country, populationMillions] = worldCapitals[index];
    showCaption(
      "06 / Geographic point data",
      `${name} · runtime context`,
      "Hover a global capital, resolve its geographic identity, query current weather and Wikipedia, then preserve the selection.",
      `await viewer.flyTo(${longitude}, ${latitude}, 1400)\n` +
        "const source = capitals.getPrimaryHoveredSource()\n" +
        "const place = await placeResolver.search(name)\n" +
        "const weather = await fetchCurrentWeather(latitude, longitude)\n" +
        "const summary = await fetchWikipediaSummary(name)\n" +
        "capitals.extAddSources2Selected(source)",
    );
    await viewer.flyTo(longitude, latitude, 1400);
    await wait(500, token);
    await animatePointer(pointToScreen(source.point) ?? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, token);
    cityLayer.extHighlightSource(source, true);
    let weather: Awaited<ReturnType<typeof fetchCurrentWeather>> | null = null;
    let resolvedPlace: ResolvedPlace | null = null;
    let wikipedia: Awaited<ReturnType<typeof fetchWikipediaSummary>> | null = null;
    try {
      resolvedPlace = (await placeResolver.search(`${name}, ${country}`, { limit: 1 }))[0] ?? null;
    } catch (error) {
      audit.warnings.push(`${name} place resolution unavailable: ${String(error)}`);
    }
    try {
      weather = await fetchCurrentWeather(latitude, longitude);
    } catch (error) {
      audit.warnings.push(`${name} weather unavailable: ${String(error)}`);
    }
    try {
      wikipedia = await fetchWikipediaSummary(name);
    } catch (error) {
      audit.warnings.push(`${name} Wikipedia summary unavailable: ${String(error)}`);
    }
    showCapitalMetadata(
      name,
      country,
      longitude,
      latitude,
      populationMillions,
      weather,
      resolvedPlace,
      wikipedia,
      "hover",
    );
    await wait(1200, token);
    cityLayer.extAddSources2Selected(source);
    cityLayer.extHighlightSource(source, false);
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
    showCapitalMetadata(
      name,
      country,
      longitude,
      latitude,
      populationMillions,
      weather,
      resolvedPlace,
      wikipedia,
      "selected",
    );
    await wait(1300, token);
  }

  showCaption(
    "06 / Geographic point data",
    "Population-driven styling",
    "Map the population column to marker size and brightness after completing the hover and selection examples.",
    'viewer.setCatalogueShapeSize(capitals, "population")\n' +
      'viewer.setCatalogueShapeHue(capitals, "population")',
  );
  viewer.setCatalogueShapeSize(cityLayer, "population");
  viewer.setCatalogueShapeHue(cityLayer, "population");
  await wait(2200, token);

  showCaption(
    "06 / Geographic point data",
    "Return to Europe",
    "Move from the global catalogue to the European region before comparing administrative footprints.",
    "await viewer.flyTo(7, 46, 1800)\n" +
      "await viewer.flyToFoV(38, 1400)",
  );
  await viewer.flyTo(7, 46, 1800);
  await viewer.flyToFoV(38, 1400);
  await wait(1200, token);

  showCaption(
    "06 / Geographic point data",
    "Point-layer lifecycle",
    "Remove the temporary capital catalogue and its interaction metadata before loading regional geometries.",
    "viewer.deleteTerraPointSet(cityLayer)",
  );
  viewer.deleteTerraPointSet(cityLayer);
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  demoPointer.hidden = true;
  await wait(1000, token);
}

async function scene07EuropeanWildfires(token: number): Promise<void> {
  audit.scenes.push(7);
  audit.sequencePhase = "scene07-european-wildfires";

  showCaption(
    "07 / Data-driven fire styling",
    "European summer fire clusters",
    "Use an illustrative summer 2026 fixture to map fire intensity to marker size and hue.",
    "const fires = viewer.addTerraPointSet(fireTable)\n" +
      'viewer.setCatalogueShapeSize(fires, "intensity")\n' +
      'viewer.setCatalogueShapeHue(fires, "intensity")',
  );

  const columns = [
    new MetadataColumn({ index: 0, name: "longitudeDeg", columnType: ColumnType.GEOM_RA, unit: "deg" }),
    new MetadataColumn({ index: 1, name: "latitudeDeg", columnType: ColumnType.GEOM_DEC, unit: "deg" }),
    new MetadataColumn({ index: 2, name: "area", columnType: ColumnType.MAIN_NAME }),
    new MetadataColumn({ index: 3, name: "intensity", columnType: ColumnType.NUMBER }),
    new MetadataColumn({ index: 4, name: "criticality", columnType: ColumnType.NUMBER }),
  ];
  const rows = europeanFireClusters.map((fire) => [...fire]);
  const fires = viewer.addTerraPointSet(
    { columns, rows },
    {
      name: "Illustrative European fire clusters",
      description: "Synthetic summer 2026 demonstration fixture; not an observed fire archive",
    },
  );
  viewer.changeCatalogueColor(fires, "#ff6b2c");
  viewer.setCatalogueShapeSize(fires, "intensity");
  viewer.setCatalogueShapeHue(fires, "intensity");

  await viewer.flyTo(8, 42, 1800);
  await viewer.flyToFoV(46, 1400);
  provenance.textContent =
    "Synthetic summer 2026 fire-cluster fixture · intensity and criticality are illustrative values";
  await wait(2600, token);

  showCaption(
    "07 / Data-driven fire styling",
    "Critical clusters",
    "Add black markers for the highest illustrative criticality class while retaining the intensity layer beneath.",
    "const criticalFires = viewer.addTerraPointSet(criticalFireTable)\n" +
      'viewer.changeCatalogueColor(criticalFires, "#050505")\n' +
      'viewer.setCatalogueShapeSize(criticalFires, "intensity")',
  );
  const criticalRows = rows.filter((row) => row[4] === 3);
  const criticalFires = viewer.addTerraPointSet(
    { columns, rows: criticalRows },
    {
      name: "Critical fire clusters",
      description: "Black markers identify illustrative criticality class 3",
    },
  );
  viewer.changeCatalogueColor(criticalFires, "#050505");
  viewer.setCatalogueShapeSize(criticalFires, "intensity");
  await wait(2800, token);

  showCaption(
    "07 / Data-driven fire styling",
    "Release fire layers",
    "Remove both temporary point catalogues before loading administrative footprints.",
    "viewer.deleteTerraPointSet(criticalFires)\n" +
      "viewer.deleteTerraPointSet(fires)",
  );
  viewer.deleteTerraPointSet(criticalFires);
  viewer.deleteTerraPointSet(fires);
  await wait(1000, token);
}

async function scene08AdministrativeRegions(token: number): Promise<void> {
  audit.scenes.push(8);
  audit.sequencePhase = "scene08-administrative-regions";

  showCaption(
    "08 / Administrative regions",
    "Italian administrative regions",
    "Render GeoJSON Polygon and MultiPolygon features as an interactive Earth footprint layer.",
    "const regions = GeoJSONParser.parseGeoJSON(italyGeoJSON)\n" +
      "italyLayer.addGeoJSONFeatures(regions)\n" +
      "viewer.showTerraFootprintSet(italyLayer)",
  );

  const italyGeoJSON = await loadGeoJSON(italyRegionsUrl);
  check(token);
  const italyLayer = viewer.createTerraFootprintSet(
    "Italian regions",
    "Italian administrative boundaries",
    italyRegionsUrl,
    new MetadataManager([]),
  );
  italyLayer.addGeoJSONFeatures(GeoJSONParser.parseGeoJSON(italyGeoJSON));
  viewer.changeFootprintSetColor(italyLayer, "#24c8ff");
  viewer.showTerraFootprintSet(italyLayer);
  await viewer.flyTo(16.4, 41.1, 1600);
  await viewer.flyToFoV(16, 1200);
  await wait(1400, token);

  const pugliaIndex = italyGeoJSON.features.findIndex(
    (feature) => feature.properties?.reg_name === "Puglia",
  );
  const puglia = italyLayer.footprintPolygons[pugliaIndex];
  let pugliaHoverPoint: { x: number; y: number } | null = null;
  if (puglia) {
    showCaption(
      "08 / Administrative regions",
      "Puglia · interactive metadata",
      "Hover and select the regional footprint while preserving its source attributes and demonstration metadata.",
      "italyLayer.extHighlightFootprint(puglia, true)\n" +
        "italyLayer.extAddPolygons2Selected(puglia)",
    );
    pugliaHoverPoint = await findFootprintHoverPoint(italyLayer, puglia, token);
    await animatePointer(pugliaHoverPoint, token);
    italyLayer.extHighlightFootprint(puglia, true);
    showRegionMetadata(
      "Puglia",
      "Italy",
      "about 3.9 million (illustrative demo metadata)",
      italyGeoJSON.features[pugliaIndex].properties ?? {},
      "hover",
    );
    await wait(1100, token);
    italyLayer.extAddPolygons2Selected(puglia);
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
    showRegionMetadata(
      "Puglia",
      "Italy",
      "about 3.9 million (illustrative demo metadata)",
      italyGeoJSON.features[pugliaIndex].properties ?? {},
      "selected",
    );
    italyLayer.extHighlightFootprint(puglia, false);
    await wait(1300, token);
  }

  showCaption(
    "08 / Administrative regions",
    "Compare independent polygon layers",
    "Add Spain as a second footprint set with its own colour and lifecycle.",
    "spainLayer.addGeoJSONFeatures(GeoJSONParser.parseGeoJSON(spainGeoJSON))\n" +
      "viewer.changeFootprintSetColor(spainLayer, \"#ff334f\")\n" +
      "viewer.showTerraFootprintSet(spainLayer)",
  );
  const spainGeoJSON = await loadGeoJSON(spainRegionsUrl);
  check(token);
  const spainLayer = viewer.createTerraFootprintSet(
    "Spanish regions",
    "Spanish administrative boundaries",
    spainRegionsUrl,
    new MetadataManager([]),
  );
  spainLayer.addGeoJSONFeatures(GeoJSONParser.parseGeoJSON(spainGeoJSON));
  viewer.changeFootprintSetColor(spainLayer, "#ff334f");
  viewer.showTerraFootprintSet(spainLayer);
  const pointOutsidePuglia = pugliaHoverPoint
    ? {
        x: Math.min(canvas.clientWidth - 8, pugliaHoverPoint.x + 75),
        y: pugliaHoverPoint.y,
      }
    : { x: canvas.clientWidth * 0.62, y: canvas.clientHeight * 0.5 };
  await animatePointer(
    pointOutsidePuglia,
    token,
  );
  await wait(250, token);
  await Promise.all([
    viewer.flyTo(3.5, 39.6, 1800),
    // animateDragPointer(-70, 1800, token, pointOutsidePuglia),
  ]);
  await viewer.flyToFoV(13, 1200);
  await wait(1400, token);

  const balearicIndex = spainGeoJSON.features.findIndex(
    (feature) => feature.properties?.name === "Baleares",
  );
  const balearicIslands = spainLayer.footprintPolygons[balearicIndex];
  if (balearicIslands) {
    showCaption(
      "08 / Administrative regions",
      "Balearic Islands · independent selection",
      "Hover and select a feature from the second polygon layer without changing the Puglia selection.",
      "spainLayer.extHighlightFootprint(balearicIslands, true)\n" +
        "spainLayer.extAddPolygons2Selected(balearicIslands)",
    );
    const balearicHoverPoint = await findFootprintHoverPoint(
      spainLayer,
      balearicIslands,
      token,
    );
    const approachPoint = {
      x: Math.min(canvas.clientWidth - 8, balearicHoverPoint.x + 180),
      y: balearicHoverPoint.y,
    };
    await animatePointer(approachPoint, token);
    dispatchPointer(approachPoint.x, approachPoint.y);
    await wait(250, token);
    await animatePointer(balearicHoverPoint, token);
    await wait(350, token);
    spainLayer.extHighlightFootprint(balearicIslands, true);
    showRegionMetadata(
      "Balearic Islands",
      "Spain",
      "about 1.2 million (illustrative demo metadata)",
      spainGeoJSON.features[balearicIndex].properties ?? {},
      "hover",
    );
    await wait(1250, token);
    spainLayer.extAddPolygons2Selected(balearicIslands);
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
    showRegionMetadata(
      "Balearic Islands",
      "Spain",
      "about 1.2 million (illustrative demo metadata)",
      spainGeoJSON.features[balearicIndex].properties ?? {},
      "selected",
    );
    spainLayer.extHighlightFootprint(balearicIslands, false);
    await wait(1400, token);
  }
  demoPointer.hidden = true;
  dispatchPointer(canvas.clientWidth - 8, canvas.clientHeight - 8);

  showCaption(
    "08 / Administrative regions",
    "Release regional layers",
    "Remove both administrative footprint sets before the dedicated maritime-route scene.",
    "viewer.deleteTerraFootprintSet(italyLayer)\n" +
      "viewer.deleteTerraFootprintSet(spainLayer)",
  );
  viewer.deleteTerraFootprintSet(italyLayer);
  viewer.deleteTerraFootprintSet(spainLayer);
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  await wait(1400, token);
}

async function scene09MaritimeRoutes(token: number): Promise<void> {
  audit.scenes.push(9);
  audit.sequencePhase = "scene09-maritime-routes";

  showCaption(
    "09 / Mediterranean ferry routes",
    "European ferry routes",
    "Switch to a labelled street map, frame the eastern Mediterranean and render eighty real ferry-route geometries published by the European Atlas of the Seas.",
    "await viewer.transitionToXYZ(openStreetMap)\n" +
      "await viewer.flyTo(33.8828, 34.6906, 3200)\n" +
      "await viewer.flyToFoV(44.125, 2200)\n" +
      "const routes = await loadGeoJSON(mediterraneanFerryRoutesUrl)\n" +
      "allYearRoutes.addPath(points, properties)\n" +
      "seasonalRoutes.addPath(points, properties)\n" +
      "viewer.showTerraPolylineSet(allYearRoutes)\n" +
      "viewer.showTerraPolylineSet(seasonalRoutes)",
  );
  loadingIndicator.hidden = false;
  await viewer.transitionToXYZ(openStreetMap, { durationMs: 2200 });
  await waitForEarthTiles(token);
  await viewer.flyTo(33.8828, 34.6906, 3200);
  await viewer.flyToFoV(44.125, 2200);
  await wait(1200, token);
  const routesGeoJSON = await loadGeoJSON(mediterraneanFerryRoutesUrl);
  check(token);
  const allYearRoutes = viewer.createTerraPolylineSet(
    "All-year Mediterranean ferry routes",
    "Regular ferry routes published by the European Atlas of the Seas",
    mediterraneanFerryRoutesUrl,
    new MetadataManager([]),
  );
  const seasonalRoutes = viewer.createTerraPolylineSet(
    "Seasonal Mediterranean ferry routes",
    "Seasonal ferry routes published by the European Atlas of the Seas",
    mediterraneanFerryRoutesUrl,
    new MetadataManager([]),
  );
  for (const feature of routesGeoJSON.features) {
    if (feature.geometry?.type !== "LineString") continue;
    const points = (feature.geometry.coordinates as [number, number][]).map(
      ([longitudeDeg, latitudeDeg]) => ({ longitudeDeg, latitudeDeg }),
    );
    const routeLayer = feature.properties?.service === "seasonal"
      ? seasonalRoutes
      : allYearRoutes;
    routeLayer.addPath(points, feature.properties ?? {});
  }
  viewer.changeTerraPolylineSetColor(allYearRoutes, "#ff2d95");
  viewer.changeTerraPolylineSetColor(seasonalRoutes, "#7cff00");
  viewer.showTerraPolylineSet(allYearRoutes);
  viewer.showTerraPolylineSet(seasonalRoutes);
  maritimeLegend.hidden = false;
  provenance.textContent =
    "European Atlas of the Seas ferry routes · © EuroGeographics 2022 · magenta: all year · lime: seasonal";
  await wait(2200, token);

  showCaption(
    "09 / Mediterranean ferry routes",
    "Piraeus · a connected ferry hub",
    "Approach the port of Piraeus, where several routes in the published network converge.",
    "await viewer.flyTo(23.6384, 37.9453, 3200)\n" +
      "await viewer.flyToFoV(5.5, 2600)",
  );
  await viewer.flyTo(23.6384, 37.9453, 3200);
  await viewer.flyToFoV(5.5, 2600);
  await wait(2600, token);

  showCaption(
    "09 / Mediterranean ferry routes",
    "Follow the network west",
    "Widen the view, then move gradually across the published ferry network towards Sicily.",
    "await viewer.flyToFoV(34, 2800)\n" +
      "await viewer.flyTo(14.2, 37.3, 4200)",
  );
  await viewer.flyToFoV(34, 2800);
  await viewer.flyTo(14.2, 37.3, 4200);
  await wait(2600, token);

  showCaption(
    "09 / Mediterranean ferry routes",
    "Release vector layers",
    "Delete both ferry-route layers, hide their legend and restore the observational imagery used by the rest of the showcase.",
    "viewer.deleteTerraPolylineSet(allYearRoutes)\n" +
      "viewer.deleteTerraPolylineSet(seasonalRoutes)\n" +
      "maritimeLegend.hidden = true\n" +
      "await viewer.transitionToWMTS(esriWorldImagery)",
  );
  viewer.deleteTerraPolylineSet(allYearRoutes);
  viewer.deleteTerraPolylineSet(seasonalRoutes);
  maritimeLegend.hidden = true;
  loadingIndicator.hidden = false;
  await viewer.transitionToWMTS(esriWorldImagery, { durationMs: 2200 });
  await waitForEarthTiles(token);
  provenance.textContent =
    "Esri World Imagery · WMTS · rendered with AstroViewer WebGL2";
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  demoPointer.hidden = true;
  await wait(1100, token);
}

async function scene10GeographicGrid(token: number): Promise<void> {
  audit.scenes.push(10);
  audit.sequencePhase = "scene10-geographic-grid";

  hideEarthGrid();
  showCaption(
    "10 / Geographic coordinate grid",
    "Longitude and latitude",
    "Enable the Earth-owned coordinate grid as a spatial reference over the active base map.",
    "viewer.toggleLonLatGrid()",
  );
  viewer.toggleLonLatGrid();
  await wait(1600, token);

  showCaption(
    "10 / Geographic coordinate grid",
    "Equator and prime meridian",
    "Navigate to the origin of geographic longitude and latitude.",
    "await viewer.flyTo(0, 0, 2200)\n" +
      "await viewer.flyToFoV(42, 1400)",
  );
  await viewer.flyTo(0, 0, 2200);
  await viewer.flyToFoV(42, 1400);
  await wait(1800, token);

  showCaption(
    "10 / Geographic coordinate grid",
    "High-latitude reference",
    "Adaptive labels preserve a readable geographic reference toward northern latitudes.",
    "await viewer.flyTo(-21.9426, 64.1466, 2200)",
  );
  await viewer.flyTo(-21.9426, 64.1466, 2200);
  await wait(2200, token);

  showCaption(
    "10 / Geographic coordinate grid",
    "Independent grid state",
    "Disable the Earth grid without changing Astronomy grid visibility.",
    "viewer.toggleLonLatGrid()",
  );
  viewer.toggleLonLatGrid();
  await wait(1000, token);
}

async function scene11SavedEarthContexts(token: number): Promise<void> {
  audit.scenes.push(11);
  audit.sequencePhase = "scene11-saved-earth-contexts";
  viewer.deleteState("earth-rome-analysis");
  viewer.deleteState("earth-madrid-cartography");
  savedContextRows.replaceChildren();
  savedContexts.hidden = false;

  showCaption(
    "11 / Saved Earth contexts",
    "Save an analysis context",
    "Store the Rome camera, FoV, Esri base map, NASA overlay opacity and geographic-grid state as one named context.",
    "const overlay = viewer.addWMTSRasterOverlay(nasaBlueMarble)\n" +
      "viewer.setEarthRasterOverlayOpacity(overlay.id, 0.35)\n" +
      "viewer.saveState(\"earth-rome-analysis\")",
  );
  await viewer.transitionToWMTS(esriWorldImagery, { durationMs: 1000 });
  viewer.removeAllEarthRasterOverlays();
  const overlay = viewer.addWMTSRasterOverlay(nasaBlueMarble);
  viewer.setEarthRasterOverlayOpacity(overlay.id, 0.35);
  if (!viewer.isLonLatGridVisible()) viewer.toggleLonLatGrid();
  await viewer.flyTo(12.4964, 41.9028, 1600);
  await viewer.flyToFoV(28, 1200);
  viewer.saveState("earth-rome-analysis");
  const romeThumbnail = await new Promise<string>((resolve) =>
    requestAnimationFrame(() => resolve(canvas.toDataURL("image/png"))),
  );
  showSavedContext(
    "earth-rome-analysis",
    "Rome analysis",
    "Esri + NASA · grid",
    romeThumbnail,
    true,
  );
  await wait(1800, token);

  showCaption(
    "11 / Saved Earth contexts",
    "Save a cartographic context",
    "Create a second state with a different base map, target, FoV and no geographic grid.",
    "await viewer.transitionToXYZ(openStreetMap)\n" +
      "await viewer.flyTo(-3.7038, 40.4168, 1600)\n" +
      "viewer.saveState(\"earth-madrid-cartography\")",
  );
  viewer.removeAllEarthRasterOverlays();
  if (viewer.isLonLatGridVisible()) viewer.toggleLonLatGrid();
  await viewer.transitionToXYZ(openStreetMap, { durationMs: 1000 });
  await viewer.flyTo(-3.7038, 40.4168, 1600);
  await viewer.flyToFoV(18, 1200);
  viewer.saveState("earth-madrid-cartography");
  setActiveContext("earth-madrid-cartography");
  const madridThumbnail = await new Promise<string>((resolve) =>
    requestAnimationFrame(() => resolve(canvas.toDataURL("image/png"))),
  );
  showSavedContext(
    "earth-madrid-cartography",
    "Madrid cartography",
    "OpenStreetMap · no grid",
    madridThumbnail,
    true,
  );
  await wait(1800, token);

  showCaption(
    "11 / Saved Earth contexts",
    "Restore the complete analysis state",
    "Restore Rome together with its camera, grid and raster composition rather than rebuilding each component manually.",
    "await viewer.restoreState(\"earth-rome-analysis\")",
  );
  const romeCard = savedContextRows.querySelector<HTMLElement>(
    '[data-name="earth-rome-analysis"]',
  );
  if (romeCard) {
    const bounds = romeCard.getBoundingClientRect();
    await animatePointer(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      token,
    );
    await wait(500, token);
  }
  await viewer.restoreState("earth-rome-analysis");
  setActiveContext("earth-rome-analysis");
  await waitForEarthTiles(token);
  await wait(2200, token);

  showCaption(
    "11 / Saved Earth contexts",
    "Remove saved contexts",
    "Select each × control and delete both named snapshots; the currently restored visual state remains active.",
    "viewer.deleteState(\"earth-madrid-cartography\")\n" +
      "viewer.deleteState(\"earth-rome-analysis\")",
  );
  const madridDelete = savedContextRows.querySelector<HTMLElement>(
    '[data-context-delete="earth-madrid-cartography"]',
  );
  if (madridDelete) {
    const bounds = madridDelete.getBoundingClientRect();
    await animatePointer(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      token,
    );
    await wait(400, token);
  }
  viewer.deleteState("earth-madrid-cartography");
  savedContextRows.querySelector('[data-name="earth-madrid-cartography"]')?.remove();
  await wait(700, token);
  const romeDelete = savedContextRows.querySelector<HTMLElement>(
    '[data-context-delete="earth-rome-analysis"]',
  );
  if (romeDelete) {
    const bounds = romeDelete.getBoundingClientRect();
    await animatePointer(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      token,
    );
    await wait(400, token);
  }
  viewer.deleteState("earth-rome-analysis");
  savedContextRows.querySelector('[data-name="earth-rome-analysis"]')?.remove();
  await wait(900, token);
  demoPointer.hidden = true;
  savedContexts.hidden = true;
  viewer.removeAllEarthRasterOverlays();
  hideEarthGrid();
}

async function loadSatelliteObservation(token: number): Promise<ObservationTrackViewerHandle> {
  clearSatelliteObservation();
  maritimeLegend.hidden = true;
  const spainGeoJSON = await loadGeoJSON(spainRegionsUrl);
  check(token);

  satelliteRegionsLayer = viewer.createTerraFootprintSet(
    "Spanish regions",
    "Observation target regions",
    spainRegionsUrl,
    new MetadataManager([]),
  );
  satelliteRegionsLayer.addGeoJSONFeatures(GeoJSONParser.parseGeoJSON(spainGeoJSON));
  viewer.changeFootprintSetColor(satelliteRegionsLayer, "#ff334f");
  viewer.showTerraFootprintSet(satelliteRegionsLayer);

  satelliteAcquiredImagesLayer = viewer.createTerraFootprintSet(
    "Acquired satellite images",
    "Footprints revealed after acquisition",
    "iss-spain-demo",
    new MetadataManager([]),
  );
  viewer.changeFootprintSetColor(satelliteAcquiredImagesLayer, "#00fff2");
  viewer.showTerraFootprintSet(satelliteAcquiredImagesLayer);
  acquiredImageCount = 0;

  const track: ObservationTrackLike = {
    id: "iss-spain-demo",
    satellite: {
      id: "iss",
      name: "ISS (ZARYA)",
      model: {
        objUrl: satelliteModelUrl,
        visualScale: 0.028,
      },
    },
    sensorId: "demo-nadir-optical",
    sensor: {
      id: "demo-nadir-optical",
      name: "Demonstration nadir sensor",
      type: "optical",
      pointingMode: "nadir",
      fieldOfViewDeg: 30,
    },
    visualisation: {
      showSatelliteModel: true,
      showGroundTrack: true,
      showFootprint: false,
      showSensorCone: true,
      showCurrentFootprintOnly: false,
      showAllFootprints: false,
    },
    samples: satelliteSamples,
  };

  satelliteAdapter = new ObservationTrackViewerAdapter({
    viewer,
    metadataManagerFactory: () => new MetadataManager([]),
    colors: {
      groundTrack: "#ffe066",
      footprints: "#00fff2",
      currentFootprint: "#a6adb5",
      marker: "#a6adb5",
      satelliteObject: [0.65, 0.68, 0.71, 1],
      sensorCone: [0.65, 0.68, 0.71, 0.7],
    },
    onFrame: (frame: ObservationTrackFrame) => {
      selectIntersectingRegions(spainGeoJSON, frame.currentFootprint);
      updateAcquiredImages(frame);
      provenance.textContent =
        `ISS demonstration observation · ${new Date(frame.currentMs).toISOString()} · ` +
        `lon ${frame.currentGroundPoint.longitudeDeg.toFixed(2)}° · ` +
        `lat ${frame.currentGroundPoint.latitudeDeg.toFixed(2)}° · ` +
        `alt ${Number(frame.currentGroundPoint.altitudeKm ?? 0).toFixed(1)} km`;
    },
  });
  satelliteHandle = satelliteAdapter.load(track);
  return satelliteHandle;
}

async function scene12SatelliteObservation(token: number): Promise<void> {
  audit.scenes.push(12);
  audit.sequencePhase = "scene12-satellite-observation";
  hideEarthGrid();
  captionBox.classList.add("satellite-scene");
  satelliteLegend.hidden = false;

  showCaption(
    "12 / Satellite observation",
    "ISS observation geometry",
    "Load one observation track containing the satellite model, ground track, sensor cone and sampled footprints.",
    "const adapter = new ObservationTrackViewerAdapter({ viewer })\n" +
      "const observation = adapter.load(issSpainTrack)",
  );
  const observation = await loadSatelliteObservation(token);
  observation.seek(0);
  await viewer.flyTo(-3.7, 40.4, 2000);
  await viewer.flyToFoV(82, 1800);
  await wait(2200, token);

  showCaption(
    "12 / Satellite observation",
    "A three-dimensional orbital object",
    "With the whole Earth visible, orbit the camera to reveal that the satellite model and sensor cone are above the surface.",
    "await viewer.rotateEarthLongitude(14, 2200)\n" +
      "await viewer.rotateEarthLongitude(-14, 2200)",
  );
  await Promise.all([
    viewer.rotateEarthLongitude(14, 2200),
    animateDragPointer(210, 2200, token),
  ]);
  await Promise.all([
    viewer.rotateEarthLongitude(-14, 2200),
    animateDragPointer(-210, 2200, token),
  ]);
  await wait(1200, token);

  showCaption(
    "12 / Satellite observation",
    "Observation layers",
    "The gray sensor footprint follows the satellite continuously; each sampled image becomes cyan when its centre is reached.",
    "observation.setVisualisation({\n" +
      "  showSatelliteModel: true,\n" +
      "  showGroundTrack: true,\n" +
      "  showSensorCone: true,\n" +
      "  showFootprint: false,\n" +
      "  showAllFootprints: false\n" +
      "})",
  );
  observation.setVisualisation({
    showSatelliteModel: true,
    showGroundTrack: true,
    showSensorCone: true,
    showFootprint: false,
    showCurrentFootprintOnly: false,
    showAllFootprints: false,
  });
  await wait(3000, token);
}

async function scene13ObservationTimeline(token: number): Promise<void> {
  audit.scenes.push(13);
  audit.sequencePhase = "scene13-observation-timeline";
  const observation = satelliteHandle ?? await loadSatelliteObservation(token);
  captionBox.classList.add("satellite-scene");
  satelliteLegend.hidden = false;

  showCaption(
    "13 / Observation timeline",
    "Approach the moving observation",
    "Interpolate the observation while a slow zoom and camera orbit reveal its three-dimensional motion.",
    "observation.seek(0)\n" +
      "observation.play()\n" +
      "await Promise.all([\n" +
      "  viewer.flyToFoV(40, 4600),\n" +
      "  viewer.rotateEarthLongitude(10, 4600)\n" +
      "])",
  );
  observation.seek(0);
  observation.play();
  await Promise.all([
    viewer.flyToFoV(40, 4600),
    viewer.rotateEarthLongitude(10, 4600),
    animateDragPointer(180, 4600, token),
  ]);
  check(token);
  await wait(700, token);

  showCaption(
    "13 / Observation timeline",
    "Pause and resume",
    "Pause at the current observation state, then resume with a smaller camera adjustment and no temporal jump.",
    "observation.pause()\n" +
      "observation.play()\n" +
      "await Promise.all([\n" +
      "  viewer.flyToFoV(30, 2600),\n" +
      "  viewer.rotateEarthLongitude(-5, 2600)\n" +
      "])",
  );
  observation.pause();
  await wait(1600, token);
  observation.play();
  await Promise.all([
    viewer.flyToFoV(30, 2600),
    viewer.rotateEarthLongitude(-5, 2600),
    animateDragPointer(-100, 2600, token),
  ]);
  check(token);
  await wait(400, token);
  observation.pause();

  showCaption(
    "13 / Observation timeline",
    "Completed observation pass",
    "Zoom out while preserving the satellite, ground track, acquired images and intersected regions as one complete observation geometry.",
    "await viewer.flyToFoV(82, 2200)",
  );
  await viewer.flyToFoV(82, 2200);
  check(token);
  await wait(1800, token);

  showCaption(
    "13 / Observation timeline",
    "Observation metadata",
    "Hover two acquired-image footprints, then preserve their selection to inspect observation identifiers, targets, coordinates and acquisition times.",
    "const footprint = acquiredImages.hoveredFootprints.footprints[0]\n" +
      "acquiredImages.extHighlightFootprint(footprint, true)\n" +
      "acquiredImages.extAddPolygons2Selected(footprint)",
  );
  await demonstrateAcquiredImageMetadata(token);

  showCaption(
    "13 / Observation timeline",
    "Release observation resources",
    "Stop the timeline and remove every transient satellite, sensor and vector resource.",
    "observation.dispose()\n" +
      "adapter.clear()",
  );
  clearSatelliteObservation();
  await wait(1400, token);
}

async function scene14StandardsAndCredits(token: number): Promise<void> {
  audit.scenes.push(14);
  audit.sequencePhase = "scene14-standards-credits";
  clearSatelliteObservation();
  hideEarthGrid();
  viewer.removeAllEarthRasterOverlays();

  showCaption(
    "14 / Provenance and credits",
    "What the showcase demonstrated",
    "Conclude by returning to the global view and summarising the standards, public APIs and data provenance used throughout E00.",
    "await viewer.flyTo(12.4964, 41.9028, 1800)\n" +
      "await viewer.flyToFoV(78, 1600)",
  );
  await viewer.flyTo(12.4964, 41.9028, 1800);
  await viewer.flyToFoV(78, 1600);
  provenance.textContent =
    "XYZ · OGC WMTS · GeoJSON · WebGL2 · geographic coordinates · " +
    "timestamped observation tracks";
  await wait(2600, token);

  showCaption(
    "14 / Provenance and credits",
    "Credits and provenance",
    "Fade the Earth imagery to black, then display the data, technology and project credits used by the showcase.",
    "await viewer.fadeEarthBaseMapOpacity(0, 2200)\n" +
      "credits.hidden = false",
  );
  await viewer.fadeEarthBaseMapOpacity(0, 2200);
  await wait(350, token);
  credits.hidden = false;
  await wait(mode === "video" ? 9000 : 5000, token);
}

const showcaseScenes: Array<{
  number: SceneNumber;
  title: string;
  run: (token: number) => Promise<void>;
}> = [
  { number: 1, title: "Earth from space", run: scene01EarthFromSpace },
  { number: 2, title: "Geographic navigation", run: scene02GeographicNavigation },
  { number: 3, title: "Open XYZ maps", run: scene03OpenXYZMaps },
  { number: 4, title: "Standards-based WMTS imagery", run: scene04ScientificWMTS },
  { number: 5, title: "Raster compositing", run: scene05RasterCompositing },
  { number: 6, title: "World capitals and runtime context", run: scene06GeoJSONPoints },
  { number: 7, title: "European wildfire clusters", run: scene07EuropeanWildfires },
  { number: 8, title: "Administrative regions", run: scene08AdministrativeRegions },
  { number: 9, title: "Mediterranean ferry routes", run: scene09MaritimeRoutes },
  { number: 10, title: "Geographic coordinate grid", run: scene10GeographicGrid },
  { number: 11, title: "Saved Earth contexts", run: scene11SavedEarthContexts },
  { number: 12, title: "Satellite observation geometry", run: scene12SatelliteObservation },
  { number: 13, title: "Observation timeline", run: scene13ObservationTimeline },
  { number: 14, title: "Provenance and credits", run: scene14StandardsAndCredits },
];

async function runE00(startScene: number = requestedScene): Promise<void> {
  if (running) {
    return;
  }

  const normalizedStartScene = (
    Number.isFinite(startScene)
      ? Math.min(14, Math.max(1, Math.trunc(startScene)))
      : requestedScene
  ) as SceneNumber;

  const token = ++sequenceToken;
  running = true;
  paused = false;
  audit.scenes.length = 0;
  audit.warnings.length = 0;

  status.textContent = "Running E00";
  updateControls();

  try {
    await resetForRun(token, normalizedStartScene);
    if (normalizedStartScene === 1) await showOpening(token);

    for (const scene of showcaseScenes) {
      if (scene.number < normalizedStartScene) continue;

      await showSceneTitle(scene.number, scene.title, token);
      await scene.run(token);

      if (scene.number === requestedEndScene) {
        audit.sequencePhase = "complete";
        status.textContent =
          `E00 review complete · ${String(normalizedStartScene).padStart(2, "0")}` +
          `–${String(scene.number).padStart(2, "0")}`;
        return;
      }
    }

    check(token);
    audit.sequencePhase = "complete";
    status.textContent =
      `E00 review complete · ${String(normalizedStartScene).padStart(2, "0")}` +
      "–14";
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

async function resetForRun(
  token: number,
  startScene: SceneNumber,
): Promise<void> {
  clearSatelliteObservation();
  credits.hidden = true;
  layerStack.hidden = true;
  savedContexts.hidden = true;
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  viewer.removeAllEarthRasterOverlays();
  viewer.setActiveDomain("earth");
  activateEsriWorldImagery();
  viewer.setEarthBaseMapOpacity(1);
  hideEarthGrid();

  viewer.resetAxesOrientation();
  viewer.setEastWestRotationLocked(false);
  viewer.setNorthSouthRotationLocked(false);
  viewer.setFoV(startScene === 1 ? 95 : 32);
  viewer.goTo(
    startScene === 1 ? 0 : 12.4964,
    startScene === 1 ? 18 : 41.9028,
  );

  loadingIndicator.hidden = false;
  await waitForEarthTiles(token);
  await wait(500, token);
}

runButton.addEventListener("click", () => {
  void runE00(requestedScene);
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

    if (mode === "video" || query.has("scene")) {
      await runE00(requestedScene);
    }
  } catch (error) {
    console.error("E00 bootstrap failed", error);
    audit.sequencePhase = "bootstrap-failed";
    status.textContent = "E00 bootstrap failed";
    loadingIndicator.hidden = true;
  }
})();
