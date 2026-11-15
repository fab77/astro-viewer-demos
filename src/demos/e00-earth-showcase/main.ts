/// <reference path="../../demo-window.d.ts" />

import {
  AstroViewer,
  ColumnType,
  GeoJSONParser,
  MetadataColumn,
  MetadataManager,
  ObservationTrackViewerAdapter,
  type CatalogueGL,
  type Footprint,
  type Source,
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
import {
  OpenStreetMapOverpassService,
  type OpenStreetMapInfrastructureFeature,
  type OpenStreetMapInfrastructureResult,
} from "astrospatial-services/earth/openstreetmap";
import {
  CemsRapidMappingService,
  type CemsFloodLayerResult,
} from "astrospatial-services/earth/emergency";
import {
  FirmsService,
  GwisBurnedAreaService,
  type BurnedAreaPerimeter,
  type FirmsAreaResult,
  type GwisBurnedAreaResult,
  type WildfireDetection,
} from "astrospatial-services/earth/wildfire";

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
const provenancePanel = get<HTMLElement>("provenance");
const telemetryPanel = get<HTMLElement>("telemetry");
const coordinateStatus = get<HTMLElement>("coordinate-status");
const mouseCoordinateStatus = get<HTMLElement>("mouse-coordinate-status");
const fovStatus = get<HTMLElement>("fov-status");
const tileStatus = get<HTMLElement>("tile-status");
const loadingIndicator = get<HTMLElement>("loading-indicator");
const status = get<HTMLElement>("status");
const controls = get<HTMLElement>("controls");
const runButton = get<HTMLButtonElement>("run-button");
const pauseButton = get<HTMLButtonElement>("pause-button");
const resetButton = get<HTMLButtonElement>("reset-button");
const credits = get<HTMLIFrameElement>("credits");
const closingPanel = get<HTMLElement>("closing-panel");
const coordsGridLabels = get<HTMLDivElement>("coords-grid-labels");
const satelliteLegend = get<HTMLElement>("satellite-legend");
const maritimeLegend = get<HTMLElement>("maritime-legend");
const scientificLegend = get<HTMLElement>("scientific-legend");
const scientificLegendTitle = get<HTMLElement>("scientific-legend-title");
const scientificLegendRows = get<HTMLElement>("scientific-legend-rows");
const observationMetadata = get<HTMLElement>("observation-metadata");
const layerStack = get<HTMLElement>("layer-stack");
const layerStackRows = get<HTMLElement>("layer-stack-rows");
const savedContexts = get<HTMLElement>("saved-contexts");
const savedContextRows = get<HTMLElement>("saved-context-rows");
const demoPointer = get<HTMLElement>("demo-pointer");
document.body.appendChild(demoPointer);

const query = new URLSearchParams(location.search);
const mode = query.get("mode") === "video" ? "video" : "interactive";
type SceneNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
const initialScene = Number(query.get("scene"));
const requestedScene: SceneNumber =
  Number.isInteger(initialScene) && initialScene >= 1 && initialScene <= 15
    ? (initialScene as SceneNumber)
    : 1;
const initialEndScene = Number(query.get("end"));
const requestedEndScene: SceneNumber | null =
  Number.isInteger(initialEndScene) &&
  initialEndScene >= requestedScene &&
  initialEndScene <= 15
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

const europeanCapitals = [
  [19.8187, 41.3275, "Tirana", "Albania", 0.6],
  [1.5218, 42.5063, "Andorra la Vella", "Andorra", 0.023],
  [16.3738, 48.2082, "Vienna", "Austria", 2.0],
  [23.7275, 37.9838, "Athens", "Greece", 0.64],
  [49.8671, 40.4093, "Baku", "Azerbaijan", 2.3],
  [27.5615, 53.9045, "Minsk", "Belarus", 2.0],
  [4.3517, 50.8503, "Brussels", "Belgium", 1.2],
  [18.4131, 43.8563, "Sarajevo", "Bosnia and Herzegovina", 0.28],
  [23.3219, 42.6977, "Sofia", "Bulgaria", 1.3],
  [15.9819, 45.8150, "Zagreb", "Croatia", 0.77],
  [33.3823, 35.1856, "Nicosia", "Cyprus", 0.33],
  [14.4378, 50.0755, "Prague", "Czechia", 1.4],
  [12.5683, 55.6761, "Copenhagen", "Denmark", 0.66],
  [24.7536, 59.4370, "Tallinn", "Estonia", 0.46],
  [24.9384, 60.1699, "Helsinki", "Finland", 0.68],
  [-0.1276, 51.5072, "London", "United Kingdom", 8.9],
  [2.3522, 48.8566, "Paris", "France", 2.1],
  [13.4050, 52.5200, "Berlin", "Germany", 3.9],
  [44.8271, 41.7151, "Tbilisi", "Georgia", 1.2],
  [19.0402, 47.4979, "Budapest", "Hungary", 1.7],
  [-21.9426, 64.1466, "Reykjavík", "Iceland", 0.14],
  [-6.2603, 53.3498, "Dublin", "Ireland", 0.59],
  [12.4964, 41.9028, "Rome", "Italy", 2.8],
  [21.1655, 42.6629, "Pristina", "Kosovo", 0.23],
  [24.1052, 56.9496, "Riga", "Latvia", 0.61],
  [9.5209, 47.1410, "Vaduz", "Liechtenstein", 0.006],
  [25.2797, 54.6872, "Vilnius", "Lithuania", 0.61],
  [6.1319, 49.6116, "Luxembourg", "Luxembourg", 0.14],
  [14.5146, 35.8989, "Valletta", "Malta", 0.006],
  [28.8353, 47.0105, "Chișinău", "Moldova", 0.53],
  [7.4246, 43.7384, "Monaco", "Monaco", 0.039],
  [19.2629, 42.4304, "Podgorica", "Montenegro", 0.18],
  [4.9041, 52.3676, "Amsterdam", "Netherlands", 0.93],
  [21.4316, 41.9981, "Skopje", "North Macedonia", 0.53],
  [10.7522, 59.9139, "Oslo", "Norway", 0.72],
  [21.0122, 52.2297, "Warsaw", "Poland", 1.86],
  [-9.1393, 38.7223, "Lisbon", "Portugal", 0.57],
  [26.1025, 44.4268, "Bucharest", "Romania", 1.72],
  [37.6173, 55.7558, "Moscow", "Russia", 13.0],
  [12.4578, 43.9424, "San Marino", "San Marino", 0.004],
  [20.4489, 44.7866, "Belgrade", "Serbia", 1.2],
  [17.1077, 48.1486, "Bratislava", "Slovakia", 0.48],
  [14.5058, 46.0569, "Ljubljana", "Slovenia", 0.30],
  [-3.7038, 40.4168, "Madrid", "Spain", 3.3],
  [18.0686, 59.3293, "Stockholm", "Sweden", 0.99],
  [7.4474, 46.9480, "Bern", "Switzerland", 0.15],
  [32.8597, 39.9334, "Ankara", "Türkiye", 5.8],
  [30.5234, 50.4501, "Kyiv", "Ukraine", 3.0],
  [12.4534, 41.9029, "Vatican City", "Vatican City", 0.0008],
  [44.5152, 40.1872, "Yerevan", "Armenia", 1.1],
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

const firmsService = new FirmsService({
  authentication: { kind: "relay" },
  endpoint: new URL("/api/firms/", location.origin).href,
  timeoutMs: 120_000,
});
const gwisBurnedAreaService = new GwisBurnedAreaService({ timeoutMs: 120_000 });
const cemsRapidMappingService = new CemsRapidMappingService({ timeoutMs: 120_000 });
const openStreetMapOverpassService = new OpenStreetMapOverpassService({
  timeoutMs: 8_000,
});

const italyCitiesUrl = new URL("./data/italy-cities.geojson", import.meta.url).href;
const italyRegionsUrl = new URL("./data/italy-regions.geojson", import.meta.url).href;
const spainRegionsUrl = new URL("./data/spain-regions.geojson", import.meta.url).href;
const mediterraneanFerryRoutesUrl = new URL(
  "./data/mediterranean-ferry-routes.geojson",
  import.meta.url,
).href;
const firmsAfricaSnapshotUrl = new URL(
  "./data/firms-africa-2026-08-25.json",
  import.meta.url,
).href;
const gwisAfricaSnapshotUrl = new URL(
  "./data/gwis-africa-2026-08-25.json",
  import.meta.url,
).href;
const cemsEvrosSnapshotUrl = new URL(
  "./data/cems-evros-2026-02.json",
  import.meta.url,
).href;
const osmSoufliInfrastructureSnapshotUrl = new URL(
  "./data/osm-soufli-infrastructure.json",
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

type FirmsSnapshot = Omit<FirmsAreaResult, "detections"> & {
  schemaVersion: number;
  generatedAt: string;
  sourceUrl: string;
  selection: {
    method: string;
    inputDetectionCount: number;
    outputDetectionCount: number;
  };
  detections: WildfireDetection[];
};

async function loadFirmsSnapshot(): Promise<FirmsSnapshot> {
  const response = await fetch(firmsAfricaSnapshotUrl);
  if (!response.ok) {
    throw new Error(`Unable to load FIRMS snapshot: ${response.status}`);
  }
  return (await response.json()) as FirmsSnapshot;
}

type GwisSnapshot = Omit<GwisBurnedAreaResult, "perimeters"> & {
  schemaVersion: number;
  generatedAt: string;
  sourceUrl: string;
  selection: {
    method: string;
    inputPerimeterCount: number;
    outputPerimeterCount: number;
  };
  perimeters: BurnedAreaPerimeter[];
};

async function loadGwisSnapshot(): Promise<GwisSnapshot> {
  const response = await fetch(gwisAfricaSnapshotUrl);
  if (!response.ok) {
    throw new Error(`Unable to load GWIS snapshot: ${response.status}`);
  }
  return (await response.json()) as GwisSnapshot;
}

type CemsSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  sourceUrl: string;
  activation: {
    code: string;
    name: string;
    category: string;
    subCategory?: string;
    eventAt: string;
    countries: string[];
    provider: "Copernicus EMS Rapid Mapping";
  };
  maximumExtent: CemsFloodLayerResult;
  latestObservedExtent: CemsFloodLayerResult;
  floodDepth: CemsFloodLayerResult;
};

async function loadCemsSnapshot(): Promise<CemsSnapshot> {
  const response = await fetch(cemsEvrosSnapshotUrl);
  if (!response.ok) {
    throw new Error(`Unable to load CEMS snapshot: ${response.status}`);
  }
  return (await response.json()) as CemsSnapshot;
}

type OpenStreetMapInfrastructureSnapshot = OpenStreetMapInfrastructureResult & {
  schemaVersion: number;
  generatedAt: string;
  sourceUrl: string;
};

async function loadOpenStreetMapInfrastructureSnapshot(): Promise<OpenStreetMapInfrastructureSnapshot> {
  const response = await fetch(osmSoufliInfrastructureSnapshotUrl);
  if (!response.ok) {
    throw new Error(`Unable to load OpenStreetMap infrastructure snapshot: ${response.status}`);
  }
  return (await response.json()) as OpenStreetMapInfrastructureSnapshot;
}

function burnedAreaGeoJSON(perimeters: BurnedAreaPerimeter[]): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features: perimeters.map((perimeter) => ({
      type: "Feature",
      id: perimeter.id,
      properties: {
        fireId: perimeter.fireId,
        initialAt: perimeter.initialAt,
        finalAt: perimeter.finalAt,
        areaHa: perimeter.areaHa,
        product: perimeter.product,
        provider: perimeter.provider,
      },
      geometry: perimeter.geometry,
    })),
  };
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
    footprintInteractionBindings.delete(satelliteAcquiredImagesLayer);
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

async function clickDemoPointer(token: number): Promise<void> {
  const rect = canvas.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: rect.left + pointerPosition.x,
    clientY: rect.top + pointerPosition.y,
  };
  canvas.dispatchEvent(new PointerEvent("pointerdown", {
    ...eventInit,
    buttons: 1,
  }));
  await wait(70, token);
  canvas.dispatchEvent(new PointerEvent("pointerup", {
    ...eventInit,
    buttons: 0,
  }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function clickInterfaceElement(
  element: HTMLElement,
  token: number,
): Promise<void> {
  const bounds = element.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    clientX: bounds.left + bounds.width / 2,
    clientY: bounds.top + bounds.height / 2,
  };
  element.dispatchEvent(new PointerEvent("pointerdown", {
    ...eventInit,
    buttons: 1,
  }));
  element.dataset.pressed = "true";
  await wait(90, token);
  element.dispatchEvent(new PointerEvent("pointerup", {
    ...eventInit,
    buttons: 0,
  }));
  element.dispatchEvent(new MouseEvent("click", eventInit));
  delete element.dataset.pressed;
  await wait(140, token);
}

async function animatePointer(
  target: { x: number; y: number },
  token: number,
  onMove?: () => void,
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
    onMove?.();
  }
  pointerPosition = target;
}

function showScientificLegend(
  title: string,
  entries: Array<{ label: string; color: string }>,
): void {
  scientificLegendTitle.textContent = title;
  scientificLegendRows.replaceChildren(...entries.map(({ label, color }) => {
    const row = document.createElement("div");
    row.className = "legend-row";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = color;
    const text = document.createElement("span");
    text.textContent = label;
    row.append(swatch, text);
    return row;
  }));
  scientificLegend.hidden = false;
}

function hideScientificLegend(): void {
  scientificLegend.hidden = true;
  scientificLegendTitle.textContent = "";
  scientificLegendRows.replaceChildren();
}

type CatalogueInteractionBinding = {
  id: string;
  layer: CatalogueGL;
  records: readonly unknown[];
  render: (record: unknown, state: "hover" | "selected") => void;
};

type FootprintInteractionBinding = {
  id: string;
  layer: TerraFootprintSetGL;
  records: readonly unknown[];
  render: (record: unknown, state: "hover" | "selected") => void;
};

const catalogueInteractionBindings = new Map<CatalogueGL, CatalogueInteractionBinding>();
const footprintInteractionBindings = new Map<TerraFootprintSetGL, FootprintInteractionBinding>();
let footprintHoverFrame = 0;
let interactionEventsSuspended = false;
let hoveredSourceActive = false;

function clearHoverMetadata(): void {
  observationMetadata.querySelector('[data-state="hover"]')?.remove();
  if (!observationMetadata.childElementCount) {
    observationMetadata.hidden = true;
  }
}

function interactionCardKey(bindingId: string, index: number): string {
  return `${bindingId}:${index}`;
}

function removeInteractionCard(key: string, state: "hover" | "selected"): void {
  for (const card of observationMetadata.querySelectorAll<HTMLElement>(
    `[data-state="${state}"]`,
  )) {
    if (card.dataset.interactionKey === key) card.remove();
  }
  if (!observationMetadata.childElementCount) observationMetadata.hidden = true;
}

function renderInteractionCard(
  binding: CatalogueInteractionBinding | FootprintInteractionBinding,
  index: number,
  state: "hover" | "selected",
): void {
  const record = binding.records[index];
  if (record === undefined) return;
  const key = interactionCardKey(binding.id, index);
  removeInteractionCard(key, state);
  binding.render(record, state);
  const cards = observationMetadata.querySelectorAll<HTMLElement>(`[data-state="${state}"]`);
  const card = state === "hover" ? cards[0] : cards[cards.length - 1];
  if (card) card.dataset.interactionKey = key;
}

function registerCatalogueInteraction<T>(
  id: string,
  layer: CatalogueGL,
  records: readonly T[],
  render: (record: T, state: "hover" | "selected") => void,
): void {
  catalogueInteractionBindings.set(layer, {
    id,
    layer,
    records,
    render: (record, state) => render(record as T, state),
  });
}

function registerFootprintInteraction<T>(
  id: string,
  layer: TerraFootprintSetGL,
  records: readonly T[],
  render: (record: T, state: "hover" | "selected") => void,
): void {
  footprintInteractionBindings.set(layer, {
    id,
    layer,
    records,
    render: (record, state) => render(record as T, state),
  });
}

function refreshFootprintHoverMetadata(): void {
  footprintHoverFrame = 0;
  if (interactionEventsSuspended) return;
  for (const binding of footprintInteractionBindings.values()) {
    const footprint = binding.layer.hoveredFootprints.footprints[0];
    if (!footprint) continue;
    const index = binding.layer.footprintPolygons.indexOf(footprint);
    if (index >= 0) {
      clearHoverMetadata();
      renderInteractionCard(binding, index, "hover");
    }
    break;
  }
  const footprintIsHovered = [...footprintInteractionBindings.values()].some(
    ({ layer }) => layer.hoveredFootprints.footprints.length > 0,
  );
  if (!footprintIsHovered && !hoveredSourceActive) clearHoverMetadata();
}

function scheduleFootprintHoverMetadata(): void {
  if (interactionEventsSuspended || footprintHoverFrame) return;
  footprintHoverFrame = requestAnimationFrame(refreshFootprintHoverMetadata);
}

canvas.addEventListener("pointermove", scheduleFootprintHoverMetadata);
canvas.addEventListener("pointerleave", () => {
  hoveredSourceActive = false;
  clearHoverMetadata();
});
canvas.addEventListener("source-hovered", ((event: CustomEvent) => {
  if (interactionEventsSuspended) return;
  hoveredSourceActive = Boolean(event.detail?.source);
  clearHoverMetadata();
  const binding = catalogueInteractionBindings.get(event.detail?.catalogue);
  const source = event.detail?.source as Source | null;
  if (!binding || !source) return;
  const index = binding.layer.sources.indexOf(source);
  if (index >= 0) renderInteractionCard(binding, index, "hover");
}) as EventListener);
canvas.addEventListener("source-clicked", ((event: CustomEvent) => {
  const binding = catalogueInteractionBindings.get(event.detail?.catalogue);
  if (!binding) return;
  for (const item of event.detail?.selectionState ?? []) {
    const index = binding.layer.sources.indexOf(item.source as Source);
    if (index < 0) continue;
    const key = interactionCardKey(binding.id, index);
    if (item.selected) renderInteractionCard(binding, index, "selected");
    else removeInteractionCard(key, "selected");
  }
}) as EventListener);
canvas.addEventListener("footprint-clicked", ((event: CustomEvent) => {
  const binding = footprintInteractionBindings.get(event.detail?.footprintSet);
  if (!binding) return;
  for (const item of event.detail?.selectionState ?? []) {
    const index = binding.layer.footprintPolygons.indexOf(item.footprint as Footprint);
    if (index < 0) continue;
    const key = interactionCardKey(binding.id, index);
    if (item.selected) renderInteractionCard(binding, index, "selected");
    else removeInteractionCard(key, "selected");
  }
}) as EventListener);

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

  const wasSuspended = interactionEventsSuspended;
  interactionEventsSuspended = true;
  try {
    for (const candidate of candidates) {
      check(token);
      dispatchPointer(candidate.x, candidate.y);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (layer.hoveredFootprints.footprints.includes(footprint)) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  } finally {
    interactionEventsSuspended = wasSuspended;
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
  const dataset = document.createElement("span");
  dataset.textContent = "AstroViewer dataset: Acquired satellite images";
  card.append(dataset);
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
  datasetName: string,
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
  const populationLabel = populationMillions >= 0.1
    ? `about ${populationMillions.toFixed(1)} million`
    : `about ${Math.max(1, Math.round(populationMillions * 1000))} thousand`;
  const lines = [
    `AstroViewer dataset: ${datasetName}`,
    `Coordinates: ${longitude.toFixed(4)}°, ${latitude.toFixed(4)}°`,
    `Population: ${populationLabel} (illustrative estimate)`,
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
  datasetName: string,
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
    `AstroViewer dataset: ${datasetName}`,
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

function showScientificFeatureMetadata(
  titleText: string,
  lines: string[],
  state: "hover" | "selected",
): void {
  if (state === "hover") {
    observationMetadata.querySelector('[data-state="hover"]')?.remove();
  }
  const card = document.createElement("section");
  card.className = "observation-record";
  card.dataset.state = state;
  const title = document.createElement("strong");
  title.textContent = titleText;
  card.append(title, ...lines.map((text) => {
    const line = document.createElement("span");
    line.textContent = text;
    return line;
  }));
  if (state === "hover") observationMetadata.prepend(card);
  else observationMetadata.append(card);
  observationMetadata.hidden = false;
}

function showWildfireDetectionMetadata(
  detection: WildfireDetection,
  datasetName: string,
  state: "hover" | "selected",
): void {
  showScientificFeatureMetadata(
    `${detection.satellite} · ${detection.acquiredAt.slice(0, 16)} UTC`,
    [
      "Feature: satellite thermal detection",
      `AstroViewer dataset: ${datasetName}`,
      `Coordinates: ${detection.longitudeDeg.toFixed(4)}°, ${detection.latitudeDeg.toFixed(4)}°`,
      `Fire Radiative Power: ${detection.fireRadiativePowerMw?.toFixed(2) ?? "unavailable"} MW`,
      `Confidence: ${String(detection.confidence ?? "unavailable")}`,
      `Instrument: ${detection.instrument} · ${detection.dayNight ?? "unknown"}`,
      `Pixel dimensions: ${detection.scanKm ?? "—"} × ${detection.trackKm ?? "—"} km`,
      "Provider: NASA LANCE FIRMS · not an incident-status classification",
    ],
    state,
  );
}

function showBurnedAreaMetadata(
  perimeter: BurnedAreaPerimeter,
  datasetName: string,
  state: "hover" | "selected",
): void {
  showScientificFeatureMetadata(
    `GWIS burnt area ${perimeter.fireId}`,
    [
      "Feature: near-real-time burnt-area perimeter",
      `AstroViewer dataset: ${datasetName}`,
      `Area: ${Math.round(perimeter.areaHa).toLocaleString()} ha`,
      `Initial observation: ${perimeter.initialAt.slice(0, 16)} UTC`,
      `Final observation: ${perimeter.finalAt.slice(0, 16)} UTC`,
      `Geometry: ${perimeter.geometry.type}`,
      `Product: ${perimeter.product}`,
      `Provider: ${perimeter.provider} · not an operational incident perimeter`,
    ],
    state,
  );
}

function showFloodFootprintMetadata(
  properties: Record<string, unknown>,
  acquiredAt: string | undefined,
  datasetName: string,
  state: "hover" | "selected",
): void {
  showScientificFeatureMetadata(
    `CEMS flood polygon ${String(properties.dmg_src_id ?? "—")}`,
    [
      `Feature: ${String(properties.notation ?? "observed flood extent")}`,
      `AstroViewer dataset: ${datasetName}`,
      `Event: ${String(properties.obj_desc ?? properties.event_type ?? "Riverine flood")}`,
      `Mapped area: ${Number(properties.area ?? 0).toLocaleString()} ha`,
      `Detection method: ${String(properties.det_method ?? "not supplied")}`,
      `Acquired: ${acquiredAt?.slice(0, 16) ?? "unavailable"} UTC`,
      "Activation: EMSR868 · AOI 02 Feres · monitoring 03",
      "Provider: Copernicus EMS Rapid Mapping",
    ],
    state,
  );
}

function showFloodExposureMetadata(
  feature: OpenStreetMapInfrastructureFeature,
  floodProduct: string,
  floodDepth: string | undefined,
  infrastructurePriority: number,
  state: "hover" | "selected" = "hover",
): void {
  const assetType =
    feature.tags.bridge === "yes"
      ? `${feature.tags.railway ? "Railway" : "Road"} bridge`
      : feature.tags.man_made === "wastewater_plant"
        ? "Wastewater treatment plant"
        : feature.category.replaceAll("-", " ");
  showScientificFeatureMetadata(
    feature.name ?? assetType,
    [
      `Feature: ${assetType}`,
      "AstroViewer dataset: Soufli flood-context POIs",
      `OpenStreetMap ID: ${feature.id}`,
      `Coordinates: ${feature.longitudeDeg.toFixed(5)}°, ${feature.latitudeDeg.toFixed(5)}°`,
      `Flood intersection: ${floodProduct}`,
      `Estimated flood depth at asset centre: ${floodDepth ?? "not modelled"}`,
      `Infrastructure priority used for marker size: ${infrastructurePriority}/5`,
      `Operator: ${feature.tags.operator ?? "not supplied"}`,
      floodProduct.startsWith("outside")
        ? "Analysis: urban context only · no polygon intersection at representative point"
        : "Analysis: spatial intersection · potential exposure, not verified damage",
      "Sources: Copernicus EMS Rapid Mapping + OpenStreetMap contributors",
    ],
    state,
  );
}

async function demonstrateAcquiredImageMetadata(token: number): Promise<void> {
  if (!satelliteAcquiredImagesLayer) return;
  const footprints = satelliteAcquiredImagesLayer.footprintPolygons.filter(
    (footprint) => footprint.valid,
  );
  const targets = [footprints[4], footprints[6]].filter(Boolean);
  for (const footprint of targets) {
    const hoverPoint = await findFootprintHoverPoint(
      satelliteAcquiredImagesLayer,
      footprint,
      token,
    );
    await animatePointer(hoverPoint, token);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await wait(1100, token);
    await clickDemoPointer(token);
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
  hideOnComplete = true,
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
    demoPointer.hidden = hideOnComplete;
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

function pointInRing(
  longitude: number,
  latitude: number,
  ring: unknown,
): boolean {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (
      !Array.isArray(currentPoint) ||
      !Array.isArray(previousPoint) ||
      typeof currentPoint[0] !== "number" ||
      typeof currentPoint[1] !== "number" ||
      typeof previousPoint[0] !== "number" ||
      typeof previousPoint[1] !== "number"
    ) continue;
    const crossesLatitude =
      (currentPoint[1] > latitude) !== (previousPoint[1] > latitude);
    if (
      crossesLatitude &&
      longitude <
        ((previousPoint[0] - currentPoint[0]) *
          (latitude - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0]
    ) inside = !inside;
  }
  return inside;
}

function pointInFeature(
  longitude: number,
  latitude: number,
  feature: GeoJSONFeature,
): boolean {
  const geometry = feature.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) return false;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  return polygons.some((polygon) =>
    Array.isArray(polygon) &&
    pointInRing(longitude, latitude, polygon[0]) &&
    !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole)),
  );
}

function containingFeature(
  longitude: number,
  latitude: number,
  collection: GeoJSONFeatureCollection,
): GeoJSONFeature | undefined {
  return collection.features.find((feature) =>
    pointInFeature(longitude, latitude, feature));
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
  registerFootprintInteraction(
    "acquired-satellite-images",
    satelliteAcquiredImagesLayer,
    satelliteAcquiredImagesLayer.footprintPolygons,
    (footprint, state) => showObservationMetadata(footprint, state),
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

async function showClosingPanel(markup: string, token: number): Promise<void> {
  if (closingPanel.hidden) {
    closingPanel.innerHTML = markup;
    closingPanel.hidden = false;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return;
  }
  closingPanel.dataset.switching = "true";
  await wait(320, token);
  closingPanel.innerHTML = markup;
  delete closingPanel.dataset.switching;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
  const mouse = viewer.getCoordinatesFromMouse();
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

  if (mouse) {
    mouseCoordinateStatus.textContent =
      `Mouse: Lon ${mouse.astroDeg.ra.toFixed(4)}° · ` +
      `Lat ${mouse.astroDeg.dec.toFixed(4)}°`;
    mouseCoordinateStatus.hidden = false;
  } else {
    mouseCoordinateStatus.textContent = "Mouse: —";
    mouseCoordinateStatus.hidden = true;
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
  closingPanel.hidden = true;
  closingPanel.replaceChildren();
  captionBox.hidden = false;
  provenancePanel.hidden = false;
  telemetryPanel.hidden = false;
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
    { query: "Amman, Jordan", longitude: 35.9304, latitude: 31.9539 },
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
  audit.sequencePhase = "scene06-european-capitals";

  showCaption(
    "06 / Geographic point data",
    "European capitals",
    "Frame Europe and load all European capitals into an AstroTable-backed point layer with one high-contrast colour.",
    "const capitals = viewer.addTerraPointSet(capitalsTable, {\n" +
      "  name: \"European capitals\"\n" +
      "})\n" +
      'viewer.changeCatalogueColor(capitals, "#ff3d9a")',
  );

  const columns = [
    new MetadataColumn({ index: 0, name: "longitudeDeg", columnType: ColumnType.GEOM_RA, unit: "deg" }),
    new MetadataColumn({ index: 1, name: "latitudeDeg", columnType: ColumnType.GEOM_DEC, unit: "deg" }),
    new MetadataColumn({ index: 2, name: "name", columnType: ColumnType.MAIN_NAME }),
    new MetadataColumn({ index: 3, name: "country", columnType: ColumnType.STRING }),
    new MetadataColumn({ index: 4, name: "population", columnType: ColumnType.NUMBER, unit: "million" }),
  ];
  const rows = europeanCapitals.map((capital) => [...capital]);
  const cityLayer = viewer.addTerraPointSet(
    { columns, rows },
    {
      name: "European capitals",
      description: "European capital catalogue enriched with runtime geographic context",
    },
  );
  viewer.changeCatalogueColor(cityLayer, "#ff3d9a");
  showScientificLegend("European capitals", [
    { label: "Capital city", color: "#ff3d9a" },
  ]);
  provenance.textContent =
    `${rows.length} European capital points · AstroTable Earth catalogue · ` +
    "runtime context: Nominatim, Open-Meteo and Wikipedia";

  const capitalContexts = new Map<string, {
    weather: Awaited<ReturnType<typeof fetchCurrentWeather>> | null;
    resolvedPlace: ResolvedPlace | null;
    wikipedia: Awaited<ReturnType<typeof fetchWikipediaSummary>> | null;
  }>();
  registerCatalogueInteraction(
    "european-capitals",
    cityLayer,
    europeanCapitals,
    (capital, state) => {
      const [longitude, latitude, name, country, populationMillions] = capital;
      const context = capitalContexts.get(name) ?? {
        weather: null,
        resolvedPlace: null,
        wikipedia: null,
      };
      showCapitalMetadata(
        name,
        country,
        longitude,
        latitude,
        populationMillions,
        context.weather,
        context.resolvedPlace,
        context.wikipedia,
        "European capitals",
        state,
      );
    },
  );

  await viewer.flyTo(13, 50, 1800);
  await viewer.flyToFoV(52, 1400);
  await wait(1800, token);

  const capitalNames = ["Lisbon", "Berlin", "Helsinki"];
  for (const capitalName of capitalNames) {
    const index = europeanCapitals.findIndex((capital) => capital[2] === capitalName);
    if (index < 0) continue;
    const source = cityLayer.sources[index];
    const [longitude, latitude, name, country] = europeanCapitals[index];
    showCaption(
      "06 / Geographic point data",
      `${name} · runtime context`,
      "Fly to a European capital, hover its marker and enrich the catalogue record with place resolution, current weather and a concise geographic summary.",
      `await viewer.flyTo(${longitude}, ${latitude}, 1400)\n` +
        "const place = await placeResolver.search(name)\n" +
        "const weather = await fetchCurrentWeather(latitude, longitude)\n" +
        "const summary = await fetchWikipediaSummary(name)\n" +
        "canvas.addEventListener(\"source-hovered\", ({ detail }) =>\n" +
        "  renderSourceMetadata(detail.source))",
    );
    await viewer.flyTo(longitude, latitude, 1400);
    await viewer.flyToFoV(9, 900);
    await wait(500, token);
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
    capitalContexts.set(name, {
      weather,
      resolvedPlace,
      wikipedia,
    });
    await animatePointer(pointToScreen(source.point) ?? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, token);
    await wait(1200, token);
    await wait(1300, token);
  }

  showCaption(
    "06 / Geographic point data",
    "Population-driven marker size",
    "Return to the European overview and map the illustrative population field only to marker size. Every capital retains the same high-contrast colour.",
    "await viewer.flyTo(13, 50, 1800)\n" +
      "await viewer.flyToFoV(52, 1400)\n" +
      'viewer.setCatalogueShapeSize(capitals, "population")',
  );
  clearHoverMetadata();
  demoPointer.hidden = true;
  await viewer.flyTo(13, 50, 1800);
  await viewer.flyToFoV(52, 1400);
  viewer.setCatalogueShapeSize(cityLayer, "population");
  showScientificLegend("European capitals · population mapping", [
    {
      label: "Marker size · lower → higher population",
      color: "#ff3d9a",
    },
  ]);
  await wait(2200, token);

  showCaption(
    "06 / Geographic point data",
    "Point-layer lifecycle",
    "Remove the temporary European-capital catalogue and its interaction metadata before loading the African fire-detection workflow.",
    "viewer.deleteTerraPointSet(cityLayer)",
  );
  viewer.deleteTerraPointSet(cityLayer);
  catalogueInteractionBindings.delete(cityLayer);
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  demoPointer.hidden = true;
  hideScientificLegend();
  await wait(1000, token);
}

async function scene07AfricanWildfires(token: number): Promise<void> {
  audit.scenes.push(7);
  audit.sequencePhase = "scene07-african-wildfires";
  const queryCaptionStartedAt = performance.now();

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Query satellite fire detections",
    "Astrospatial Services calls NASA FIRMS at runtime for VIIRS observations over Angola and southern DRC, 25–29 August 2026.",
    "const result = await firms.queryArea({\n" +
      '  source: "VIIRS_NOAA21_NRT",\n' +
      "  area: { west: 11, south: -18, east: 25, north: -4 },\n" +
      '  dayRange: 5, startDate: "2026-08-25"\n' +
      "})",
  );

  let sourceMode = "LIVE NASA FIRMS";
  let inputDetectionCount = 0;
  let allDetections: WildfireDetection[];
  try {
    const result = await firmsService.queryArea({
      source: "VIIRS_NOAA21_NRT",
      area: { west: 11, south: -18, east: 25, north: -4 },
      dayRange: 5,
      startDate: "2026-08-25",
    });
    check(token);
    inputDetectionCount = result.detections.length;
    allDetections = result.detections;
  } catch (error) {
    sourceMode = "OFFICIAL SNAPSHOT FALLBACK";
    audit.warnings.push(`NASA FIRMS runtime query unavailable: ${String(error)}`);
    const snapshot = await loadFirmsSnapshot();
    check(token);
    inputDetectionCount = snapshot.selection.inputDetectionCount;
    allDetections = snapshot.detections;
  }

  const queryCaptionElapsedMs = performance.now() - queryCaptionStartedAt;
  await wait(Math.max(0, 1800 - queryCaptionElapsedMs), token);

  const strongest = [...allDetections]
    .filter(({ fireRadiativePowerMw }) =>
      Number.isFinite(fireRadiativePowerMw)
    )
    .sort(
      (left, right) =>
        (right.fireRadiativePowerMw ?? -Infinity) -
        (left.fireRadiativePowerMw ?? -Infinity),
    )
    .slice(0, 500);
  if (strongest.length < 500) {
    throw new Error(`FIRMS returned only ${strongest.length} usable detections`);
  }

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Select the strongest observations",
    `FIRMS returned ${inputDetectionCount.toLocaleString()} normalised detections. Keep the 500 greatest Fire Radiative Power measurements for a readable, reproducible view.`,
    "const strongest = result.detections\n" +
      "  .filter(({ fireRadiativePowerMw }) =>\n" +
      "    Number.isFinite(fireRadiativePowerMw))\n" +
      "  .toSorted((a, b) => b.fireRadiativePowerMw - a.fireRadiativePowerMw)\n" +
      "  .slice(0, 500)",
  );
  await wait(1600, token);

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Move to the observation region",
    "Navigate to Angola and southern DRC before adding any source, so the point-layer lifecycle remains visually explicit.",
    "await viewer.flyTo(18, -11, 1800)\n" +
      "await viewer.flyToFoV(26, 1400)",
  );
  await viewer.flyTo(18, -11, 1800);
  await viewer.flyToFoV(26, 1400);
  await wait(900, token);

  const columns = [
    new MetadataColumn({ index: 0, name: "longitudeDeg", columnType: ColumnType.GEOM_RA, unit: "deg" }),
    new MetadataColumn({ index: 1, name: "latitudeDeg", columnType: ColumnType.GEOM_DEC, unit: "deg" }),
    new MetadataColumn({ index: 2, name: "detection", columnType: ColumnType.MAIN_NAME }),
    new MetadataColumn({ index: 3, name: "frpMw", columnType: ColumnType.NUMBER, unit: "MW" }),
    new MetadataColumn({ index: 4, name: "dayInWindow", columnType: ColumnType.NUMBER }),
    new MetadataColumn({ index: 5, name: "confidence", columnType: ColumnType.STRING }),
    new MetadataColumn({ index: 6, name: "acquiredAt", columnType: ColumnType.STRING }),
    new MetadataColumn({ index: 7, name: "satellite", columnType: ColumnType.STRING }),
  ];
  const detectionRow = (detection: WildfireDetection) => {
    const date = detection.acquiredAt.slice(0, 10);
    const dayInWindow = Number(date.slice(-2)) - 24;
    return [
      detection.longitudeDeg,
      detection.latitudeDeg,
      `${detection.satellite} · ${detection.acquiredAt.slice(0, 16)} UTC`,
      detection.fireRadiativePowerMw ?? 0,
      dayInWindow,
      String(detection.confidence ?? "unknown"),
      detection.acquiredAt,
      detection.satellite,
    ];
  };
  const rows = strongest.map(detectionRow);

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Add 500 uniform point sources",
    "Convert the normalised service result into an Earth point table. Every marker initially shares the same size and colour.",
    "const fires = viewer.addTerraPointSet(fireTable, {\n" +
      '  name: "NASA FIRMS · VIIRS NOAA-21"\n' +
      "})\n" +
      'viewer.changeCatalogueColor(fires, "#ff7a2f")',
  );
  const firesName = "NASA FIRMS · strongest African detections";
  const fires = viewer.addTerraPointSet(
    { columns, rows },
    {
      name: firesName,
      description: "500 highest-FRP VIIRS NOAA-21 detections in the selected observation window",
    },
  );
  viewer.changeCatalogueColor(fires, "#ff7a2f");
  showScientificLegend("NASA FIRMS · point colours", [
    { label: "Uniform thermal detections", color: "#ff7a2f" },
  ]);
  provenance.textContent =
    `${sourceMode} · NASA LANCE FIRMS · VIIRS NOAA-21 NRT · ` +
    `${inputDetectionCount.toLocaleString()} detections → 500 highest FRP`;
  await wait(2600, token);

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Size by Fire Radiative Power",
    "Map the measured FRP column directly to marker size. Larger symbols identify detections with greater instantaneous radiant energy, not an emergency criticality rating.",
    'viewer.setCatalogueShapeSize(fires, "frpMw")',
  );
  viewer.setCatalogueShapeSize(fires, "frpMw");
  await wait(2400, token);

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Lightness by acquisition day",
    "Map the five-day window to the catalogue lightness channel. Earlier detections remain dark orange and later detections become progressively lighter; the marker hue itself stays orange.",
    'viewer.setCatalogueShapeHue(fires, "dayInWindow")',
  );
  viewer.setCatalogueShapeHue(fires, "dayInWindow");
  showScientificLegend("NASA FIRMS · acquisition-day lightness", [
    {
      label: "25 August dark → 29 August light",
      color: "linear-gradient(90deg, #6f1d00, #ff7a2f, #ffd0b0)",
    },
  ]);
  await wait(3400, token);

  viewer.deleteTerraPointSet(fires);
  const cutoff = "2026-08-28T00:00:00Z";
  const recentDetections = strongest.filter(
    ({ acquiredAt }) => acquiredAt >= cutoff,
  );
  const earlierDetections = strongest.filter(
    ({ acquiredAt }) => acquiredAt < cutoff,
  );
  const recentRows = recentDetections.map(detectionRow);
  const earlierRows = earlierDetections.map(detectionRow);
  const earlierFiresName = "Earlier FIRMS detections · 25–27 August";
  const recentFiresName = "Recent FIRMS detections · 28–29 August";
  const earlierFires = viewer.addTerraPointSet(
    { columns, rows: earlierRows },
    {
      name: earlierFiresName,
      description: "Earlier observations in the selected five-day window; not a declaration that a fire is extinguished",
    },
  );
  const recentFires = viewer.addTerraPointSet(
    { columns, rows: recentRows },
    {
      name: recentFiresName,
      description: "Detections from the final 48 hours of the selected observation window",
    },
  );
  viewer.changeCatalogueColor(earlierFires, "#050505");
  viewer.changeCatalogueColor(recentFires, "#ff2f2f");
  viewer.setCatalogueShapeSize(earlierFires, "frpMw");
  viewer.setCatalogueShapeSize(recentFires, "frpMw");
  registerCatalogueInteraction(
    "recent-firms-detections",
    recentFires,
    recentDetections,
    (detection, state) => showWildfireDetectionMetadata(
      detection,
      recentFiresName,
      state,
    ),
  );
  registerCatalogueInteraction(
    "earlier-firms-detections",
    earlierFires,
    earlierDetections,
    (detection, state) => showWildfireDetectionMetadata(
      detection,
      earlierFiresName,
      state,
    ),
  );
  showScientificLegend("NASA FIRMS · temporal classes", [
    { label: "Earlier detections · 25–27 August", color: "#050505" },
    { label: "Recent detections · 28–29 August", color: "#ff2f2f" },
  ]);
  showCaption(
    "07 / NASA FIRMS · African fires",
    "Recent and earlier detections",
    `Red marks ${recentRows.length} detections from 28–29 August; black marks ${earlierRows.length} earlier observations. The temporal classes do not assert operational active or extinguished fire status.`,
    'const cutoff = "2026-08-28T00:00:00Z"\n' +
      "const recentDetections = strongest.filter(\n" +
      "  ({ acquiredAt }) => acquiredAt >= cutoff)\n" +
      "const earlierDetections = strongest.filter(\n" +
      "  ({ acquiredAt }) => acquiredAt < cutoff)\n" +
      'viewer.changeCatalogueColor(recentFires, "#ff2f2f")\n' +
      'viewer.changeCatalogueColor(earlierFires, "#050505")',
  );
  await wait(5000, token);

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Inspect detection metadata",
    "Hover and preserve one recent and one earlier thermal detection. The associated measurements remain available after styling by time and radiant power.",
    "canvas.addEventListener(\"source-hovered\", ({ detail }) =>\n" +
      "  renderSourceMetadata(detail.source))\n" +
      "canvas.addEventListener(\"source-clicked\", ({ detail }) =>\n" +
      "  renderSelectionMetadata(detail.selectionState))",
  );
  for (const [layer, detection] of [
    [recentFires, recentDetections[0]],
    [earlierFires, earlierDetections[0]],
  ] as const) {
    const source = layer.sources[0];
    if (!source || !detection) continue;
    await animatePointer(
      pointToScreen(source.point) ?? {
        x: canvas.clientWidth / 2,
        y: canvas.clientHeight / 2,
      },
      token,
    );
    await wait(1100, token);
    await clickDemoPointer(token);
    await wait(1200, token);
  }
  await wait(1400, token);

  showCaption(
    "07 / NASA FIRMS · African fires",
    "Release detection layers",
    "Remove both thermal-detection catalogues before requesting the corresponding burnt-area product.",
    "viewer.deleteTerraPointSet(recentFires)\n" +
      "viewer.deleteTerraPointSet(earlierFires)",
  );
  viewer.deleteTerraPointSet(recentFires);
  viewer.deleteTerraPointSet(earlierFires);
  catalogueInteractionBindings.delete(recentFires);
  catalogueInteractionBindings.delete(earlierFires);
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  demoPointer.hidden = true;
  hideScientificLegend();
  await wait(1400, token);

  const perimeterCaptionStartedAt = performance.now();
  showCaption(
    "07 / COPERNICUS GWIS · BURNT AREAS",
    "Query near-real-time perimeters",
    "Astrospatial Services queries the official GWIS WFS for MODIS & VIIRS NRT burnt-area polygons overlapping the same region and observation window.",
    "const result = await gwis.queryPerimeters({\n" +
      "  area: { west: 11, south: -18, east: 25, north: -4 },\n" +
      '  startDate: "2026-08-25", endDate: "2026-08-29",\n' +
      "  minAreaHa: 1000\n" +
      "})",
  );
  let perimeterSourceMode = "LIVE COPERNICUS GWIS";
  let inputPerimeterCount = 0;
  let availablePerimeters: BurnedAreaPerimeter[];
  try {
    const result = await gwisBurnedAreaService.queryPerimeters({
      area: { west: 11, south: -18, east: 25, north: -4 },
      startDate: "2026-08-25",
      endDate: "2026-08-29",
      minAreaHa: 1000,
    });
    check(token);
    inputPerimeterCount = result.perimeters.length;
    availablePerimeters = result.perimeters;
  } catch (error) {
    perimeterSourceMode = "OFFICIAL GWIS SNAPSHOT FALLBACK";
    audit.warnings.push(`Copernicus GWIS runtime query unavailable: ${String(error)}`);
    const snapshot = await loadGwisSnapshot();
    check(token);
    inputPerimeterCount = snapshot.selection.inputPerimeterCount;
    availablePerimeters = snapshot.perimeters;
  }
  await wait(
    Math.max(0, 2000 - (performance.now() - perimeterCaptionStartedAt)),
    token,
  );

  const largestPerimeters = [...availablePerimeters]
    .sort((left, right) => right.areaHa - left.areaHa)
    .slice(0, 80);
  const totalSelectedAreaHa = largestPerimeters.reduce(
    (sum, perimeter) => sum + perimeter.areaHa,
    0,
  );
  showCaption(
    "07 / COPERNICUS GWIS · BURNT AREAS",
    "Add observed burnt-area geometry",
    `GWIS returned ${inputPerimeterCount.toLocaleString()} perimeters of at least 1,000 ha. Render the 80 largest provider geometries as one uniform footprint layer.`,
    "const burntAreas = viewer.createTerraFootprintSet(...)\n" +
      "burntAreas.addGeoJSONFeatures(\n" +
      "  GeoJSONParser.parseGeoJSON(perimeterGeoJSON))\n" +
      'viewer.changeFootprintSetColor(burntAreas, "#ff7a2f")\n' +
      "viewer.showTerraFootprintSet(burntAreas)",
  );
  const burntAreasName = "Copernicus GWIS burnt areas";
  const burntAreas = viewer.createTerraFootprintSet(
    burntAreasName,
    "80 largest MODIS & VIIRS NRT burnt-area perimeters in the selected window",
    "https://maps.effis.emergency.copernicus.eu/gwis",
    new MetadataManager([]),
  );
  burntAreas.addGeoJSONFeatures(
    GeoJSONParser.parseGeoJSON(burnedAreaGeoJSON(largestPerimeters)),
  );
  viewer.changeFootprintSetColor(burntAreas, "#ff7a2f");
  viewer.showTerraFootprintSet(burntAreas);
  registerFootprintInteraction(
    "gwis-burnt-areas",
    burntAreas,
    largestPerimeters,
    (perimeter, state) => showBurnedAreaMetadata(
      perimeter,
      burntAreasName,
      state,
    ),
  );
  showScientificLegend("Copernicus GWIS · footprint colours", [
    { label: "Observed burnt-area perimeters", color: "#ff7a2f" },
  ]);
  provenance.textContent =
    `${perimeterSourceMode} · MODIS & VIIRS NRT · ${inputPerimeterCount.toLocaleString()} ` +
    `perimeters ≥1,000 ha → 80 largest · selected area ${Math.round(totalSelectedAreaHa).toLocaleString()} ha`;
  await wait(4200, token);

  showCaption(
    "07 / COPERNICUS GWIS · BURNT AREAS",
    "Inspect the perimeter geometry",
    "Move into the dense Angola cluster after establishing the regional context. At this scale the provider polygons read as burnt-area footprints rather than point symbols.",
    "await viewer.flyTo(19.07, -9.87, 1800)\n" +
      "await viewer.flyToFoV(3.2, 1600)",
  );
  await viewer.flyTo(19.07, -9.87, 1800);
  await viewer.flyToFoV(3.2, 1600);
  await wait(2600, token);

  showCaption(
    "07 / COPERNICUS GWIS · BURNT AREAS",
    "Inspect burnt-area metadata",
    "Hover and select two provider polygons. Each footprint retains its area, observation interval, product provenance and source identifier.",
    "canvas.addEventListener(\"pointermove\", () =>\n" +
      "  requestAnimationFrame(() =>\n" +
      "    renderHoveredMetadata(viewer.getHoveredFootprints())))\n" +
      "canvas.addEventListener(\"footprint-clicked\", ({ detail }) =>\n" +
      "  renderSelectionMetadata(detail.selectionState))",
  );
  for (const index of [2, 4]) {
    const footprint = burntAreas.footprintPolygons[index];
    const perimeter = largestPerimeters[index];
    if (!footprint || !perimeter) continue;
    const hoverPoint = await findFootprintHoverPoint(burntAreas, footprint, token);
    await animatePointer(hoverPoint, token);
    await wait(1100, token);
    await clickDemoPointer(token);
    await wait(1200, token);
  }
  await wait(1400, token);

  dispatchPointer(canvas.clientWidth * 0.5, 8);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  clearHoverMetadata();
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  demoPointer.hidden = true;
  viewer.deleteTerraFootprintSet(burntAreas);
  footprintInteractionBindings.delete(burntAreas);
  const recentPerimeters = largestPerimeters.filter(
    ({ finalAt }) => finalAt >= cutoff,
  );
  const earlierPerimeters = largestPerimeters.filter(
    ({ finalAt }) => finalAt < cutoff,
  );
  const earlierBurntAreas = viewer.createTerraFootprintSet(
    "Earlier GWIS burnt areas",
    "Perimeters whose provider-reported final observation precedes 28 August",
    "https://maps.effis.emergency.copernicus.eu/gwis",
    new MetadataManager([]),
  );
  earlierBurntAreas.addGeoJSONFeatures(
    GeoJSONParser.parseGeoJSON(burnedAreaGeoJSON(earlierPerimeters)),
  );
  const recentBurntAreas = viewer.createTerraFootprintSet(
    "Recent GWIS burnt-area evolution",
    "Perimeters whose provider-reported final observation is on or after 28 August",
    "https://maps.effis.emergency.copernicus.eu/gwis",
    new MetadataManager([]),
  );
  recentBurntAreas.addGeoJSONFeatures(
    GeoJSONParser.parseGeoJSON(burnedAreaGeoJSON(recentPerimeters)),
  );
  viewer.changeFootprintSetColor(earlierBurntAreas, "#050505");
  viewer.changeFootprintSetColor(recentBurntAreas, "#ff2f2f");
  viewer.showTerraFootprintSet(earlierBurntAreas);
  viewer.showTerraFootprintSet(recentBurntAreas);
  showScientificLegend("Copernicus GWIS · observation time", [
    { label: "Final observation before 28 August", color: "#050505" },
    { label: "Updated on/after 28 August", color: "#ff2f2f" },
  ]);
  showCaption(
    "07 / COPERNICUS GWIS · BURNT AREAS",
    "Compare perimeter evolution",
    `Red outlines ${recentPerimeters.length} perimeters updated on or after 28 August; black outlines ${earlierPerimeters.length} earlier perimeters. This is a temporal observation split, not an operational active/extinguished status.`,
    "const recent = perimeters.filter(({ finalAt }) => finalAt >= cutoff)\n" +
      "const earlier = perimeters.filter(({ finalAt }) => finalAt < cutoff)\n" +
      'viewer.changeFootprintSetColor(recentAreas, "#ff2f2f")\n' +
      'viewer.changeFootprintSetColor(earlierAreas, "#050505")',
  );
  await wait(5200, token);

  showCaption(
    "07 / COPERNICUS GWIS · BURNT AREAS",
    "Release burnt-area layers",
    "Remove both GWIS footprint sets before continuing to the next Earth-observation workflow.",
    "viewer.deleteTerraFootprintSet(recentBurntAreas)\n" +
      "viewer.deleteTerraFootprintSet(earlierBurntAreas)",
  );
  viewer.deleteTerraFootprintSet(recentBurntAreas);
  viewer.deleteTerraFootprintSet(earlierBurntAreas);
  hideScientificLegend();
  await wait(1800, token);

  showCaption(
    "07 / COPERNICUS GWIS · BURNT AREAS",
    "Return to the regional view",
    "Zoom out from the inspected Angola footprints before starting the long transition toward the European flood activation.",
    "await viewer.flyToFoV(44, 2000)",
  );
  await viewer.flyToFoV(44, 2000);
  await wait(1500, token);
}

async function scene08EuropeanFlooding(token: number): Promise<void> {
  audit.scenes.push(8);
  audit.sequencePhase = "scene08-european-flooding";

  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Move to the Evros River basin",
    "Navigate to Feres in north-eastern Greece before requesting the official emergency-mapping products for the February 2026 riverine flood.",
    "await viewer.flyTo(26.18, 40.86, 2000)\n" +
      "await viewer.flyToFoV(0.309, 1800)",
  );
  await viewer.flyTo(26.18, 40.86, 2000);
  await viewer.flyToFoV(0.309, 1800);
  await wait(900, token);

  const queryCaptionStartedAt = performance.now();
  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Request emergency-mapping products",
    "Astrospatial Services resolves activation EMSR868, AOI 02 Feres, then downloads the maximum mapped extent, latest observed flood extent and modelled flood depth from monitoring 03.",
    "const maximum = await cems.queryFloodLayer({\n" +
      '  activationCode: "EMSR868", areaNumber: 2,\n' +
      '  monitoringNumber: 3, kind: "maximum-flood-extent"\n' +
      "})\n" +
      "const latest = await cems.queryFloodLayer({\n" +
      '  activationCode: "EMSR868", areaNumber: 2,\n' +
      '  monitoringNumber: 3, kind: "observed-event"\n' +
      "})\n" +
      "const depth = await cems.queryFloodLayer({\n" +
      '  activationCode: "EMSR868", areaNumber: 2,\n' +
      '  monitoringNumber: 3, kind: "flood-depth"\n' +
      "})",
  );

  let sourceMode = "LIVE COPERNICUS EMS";
  let maximumExtent: CemsFloodLayerResult;
  let latestObservedExtent: CemsFloodLayerResult;
  let floodDepth: CemsFloodLayerResult;
  try {
    [maximumExtent, latestObservedExtent, floodDepth] = await Promise.all([
      cemsRapidMappingService.queryFloodLayer({
        activationCode: "EMSR868",
        areaNumber: 2,
        monitoringNumber: 3,
        kind: "maximum-flood-extent",
      }),
      cemsRapidMappingService.queryFloodLayer({
        activationCode: "EMSR868",
        areaNumber: 2,
        monitoringNumber: 3,
        kind: "observed-event",
      }),
      cemsRapidMappingService.queryFloodLayer({
        activationCode: "EMSR868",
        areaNumber: 2,
        monitoringNumber: 3,
        kind: "flood-depth",
      }),
    ]);
    check(token);
  } catch (error) {
    sourceMode = "OFFICIAL CEMS SNAPSHOT FALLBACK";
    audit.warnings.push(`Copernicus EMS runtime query unavailable: ${String(error)}`);
    const snapshot = await loadCemsSnapshot();
    check(token);
    maximumExtent = snapshot.maximumExtent;
    latestObservedExtent = snapshot.latestObservedExtent;
    floodDepth = snapshot.floodDepth;
  }
  await wait(
    Math.max(0, 2200 - (performance.now() - queryCaptionStartedAt)),
    token,
  );

  const maximumFloodName = "EMSR868 maximum mapped flood extent";
  const maximumFlood = viewer.createTerraFootprintSet(
    maximumFloodName,
    "Copernicus EMS maximum mapped extent for Feres, monitoring 03",
    "https://mapping.emergency.copernicus.eu/activations/EMSR868/",
    new MetadataManager([]),
  );
  maximumFlood.addGeoJSONFeatures(
    GeoJSONParser.parseGeoJSON(maximumExtent.data),
  );
  viewer.changeFootprintSetColor(maximumFlood, "#230585");
  viewer.showTerraFootprintSet(maximumFlood);
  showScientificLegend("Copernicus EMS · flood products", [
    { label: "Maximum mapped flood extent", color: "#230585" },
  ]);
  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Render the maximum mapped extent",
    `Render ${maximumExtent.data.features.length.toLocaleString()} polygons from the official CEMS “Maximum flood extent” layer. CEMS marks this layer as modelled: it represents the product's maximum flood scenario for Monitoring 03, not the latest observed water extent and not a claim that every location remains flooded.`,
    "const maximumFlood = viewer.createTerraFootprintSet(...)\n" +
      "maximumFlood.addGeoJSONFeatures(\n" +
      "  GeoJSONParser.parseGeoJSON(maximum.data))\n" +
      'viewer.changeFootprintSetColor(maximumFlood, "#230585")\n' +
      "viewer.showTerraFootprintSet(maximumFlood)",
  );
  provenance.textContent =
    `${sourceMode} · EMSR868 · Feres AOI 02 · maximum mapped extent · ` +
    `${maximumExtent.data.features.length.toLocaleString()} polygons`;
  await wait(3800, token);

  const latestFloodName = "EMSR868 latest observed flood extent";
  const latestFlood = viewer.createTerraFootprintSet(
    latestFloodName,
    "Copernicus EMS observed flood extent acquired 27 February 2026",
    "https://mapping.emergency.copernicus.eu/activations/EMSR868/",
    new MetadataManager([]),
  );
  latestFlood.addGeoJSONFeatures(
    GeoJSONParser.parseGeoJSON(latestObservedExtent.data),
  );
  viewer.changeFootprintSetColor(latestFlood, "#23bde8");
  viewer.showTerraFootprintSet(latestFlood);
  registerFootprintInteraction(
    "cems-latest-observed-flood",
    latestFlood,
    latestObservedExtent.data.features,
    (feature, state) => showFloodFootprintMetadata(
      feature.properties,
      latestObservedExtent.acquiredAt,
      latestFloodName,
      state,
    ),
  );
  showScientificLegend("Copernicus EMS · flood products", [
    { label: "Maximum mapped flood extent", color: "#230585" },
    { label: "Latest observed flood extent", color: "#23bde8" },
  ]);

  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Inspect the mapped flood geometry",
    "Keep the approximately 0.544° × 0.309° Feres view after both products become visible. Individual mapped polygons now read as areas rather than point markers.",
    "await viewer.flyTo(26.18, 40.86, 1800)",
  );
  await viewer.flyTo(26.18, 40.86, 1800);
  await wait(2800, token);

  loadingIndicator.hidden = false;
  await viewer.transitionToXYZ(openStreetMap, { durationMs: 1400 });
  await waitForEarthTiles(token);

  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Inspect flood-footprint metadata",
    "Move into a tighter inspection field, hover and select one observed-flood polygon, then follow the latest mapped event north-east and inspect a second footprint. Each selection exposes its mapped area, detection method, acquisition time and Copernicus activation provenance.",
    "await viewer.flyToFoV(0.069, 1800)\n" +
      "canvas.addEventListener(\"pointermove\", () =>\n" +
      "  renderHoveredMetadata(viewer.getHoveredFootprints()))\n" +
      "canvas.addEventListener(\"footprint-clicked\", ({ detail }) =>\n" +
      "  renderSelectionMetadata(detail.selectionState))\n" +
      "await viewer.flyTo(northEastLongitude, northEastLatitude, 2200)\n" +
      "// The click event preserves the selected footprint",
  );
  const floodFeatureCenters = latestObservedExtent.data.features
    .map((feature, index) => {
      const bounds = featureBounds(feature);
      return bounds
        ? {
            index,
            longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
            latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
          }
        : null;
    })
    .filter((target): target is {
      index: number;
      longitude: number;
      latitude: number;
    } => target !== null);
  const firstFloodTarget = floodFeatureCenters
    .toSorted((left, right) =>
      Math.hypot(left.longitude - 26.18, left.latitude - 40.86) -
      Math.hypot(right.longitude - 26.18, right.latitude - 40.86))
    [0];
  const northEastFloodTarget = floodFeatureCenters
    .filter((target) => target.index !== firstFloodTarget?.index)
    .toSorted((left, right) =>
      (right.longitude + right.latitude) -
      (left.longitude + left.latitude))
    [0];
  await viewer.flyToFoV(0.069, 1800);
  const floodTargets = [firstFloodTarget, northEastFloodTarget].filter(
    (target): target is {
      index: number;
      longitude: number;
      latitude: number;
    } => target !== undefined,
  );

  for (const [targetNumber, target] of floodTargets.entries()) {
    const { index, longitude, latitude } = target;
    await viewer.flyTo(longitude, latitude, targetNumber === 0 ? 1400 : 2200);
    await wait(targetNumber === 0 ? 500 : 900, token);
    const footprint = latestFlood.footprintPolygons[index];
    const feature = latestObservedExtent.data.features[index];
    if (!footprint || !feature) continue;
    const hoverPoint = await findFootprintHoverPoint(latestFlood, footprint, token);
    await animatePointer(hoverPoint, token);
    await wait(1100, token);
    await clickDemoPointer(token);
    await wait(1200, token);
  }
  await wait(1400, token);

  const infrastructureArea = {
    west: 26.27,
    south: 41.16,
    east: 26.34,
    north: 41.23,
  };
  const infrastructureCategories = [
    "bridge",
    "transport",
    "healthcare",
    "emergency",
    "education",
    "public-service",
    "utility",
    "poi",
  ] as const;
  showCaption(
    "08 / COPERNICUS EMS · FLOOD EXPOSURE",
    "Query infrastructure around Soufli",
    "Astrospatial Services queries OpenStreetMap through Overpass, then intersects infrastructure centres with Copernicus flood products. This derives potential exposure; it does not claim verified damage or interruption.",
    "const infrastructure = await overpass.queryInfrastructure({\n" +
      "  area: soufliArea,\n" +
      "  categories: [\"bridge\", \"transport\", \"healthcare\",\n" +
      "    \"emergency\", \"education\", \"public-service\", \"utility\", \"poi\"]\n" +
      "})\n" +
      "const analysed = relateToFloodProducts(infrastructure, cemsFloodProducts)",
  );
  let infrastructureSource = "LIVE OPENSTREETMAP · OVERPASS API";
  let infrastructure: OpenStreetMapInfrastructureResult;
  try {
    infrastructure = await openStreetMapOverpassService.queryInfrastructure({
      area: infrastructureArea,
      categories: [...infrastructureCategories],
    });
    check(token);
  } catch (error) {
    infrastructureSource = "OPENSTREETMAP SNAPSHOT FALLBACK";
    audit.warnings.push(`OpenStreetMap Overpass query unavailable: ${String(error)}`);
    infrastructure = await loadOpenStreetMapInfrastructureSnapshot();
    check(token);
  }

  const infrastructurePriority = (feature: OpenStreetMapInfrastructureFeature): number => {
    if (["emergency", "healthcare", "utility"].includes(feature.category)) return 5;
    if (["bridge", "transport"].includes(feature.category)) return 4;
    if (["education", "public-service"].includes(feature.category)) return 3;
    return feature.name ? 2 : 1;
  };
  const floodCandidates = infrastructure.features.map((feature) => {
    const latest = containingFeature(
      feature.longitudeDeg,
      feature.latitudeDeg,
      latestObservedExtent.data,
    );
    const maximum = containingFeature(
      feature.longitudeDeg,
      feature.latitudeDeg,
      maximumExtent.data,
    );
    const depth = containingFeature(
      feature.longitudeDeg,
      feature.latitudeDeg,
      floodDepth.data,
    );
    return {
      feature,
      floodProduct: latest
        ? "latest observed flood extent"
        : maximum
          ? "maximum mapped flood extent"
          : "outside mapped flood polygons · urban context",
      floodRelation: latest ? 3 : maximum ? 2 : 1,
      infrastructurePriority: infrastructurePriority(feature),
      floodDepth: depth?.properties?.value
        ? String(depth.properties.value)
        : undefined,
    };
  }).toSorted((left, right) => {
    if (left.floodRelation !== right.floodRelation) {
      return right.floodRelation - left.floodRelation;
    }
    if (left.infrastructurePriority !== right.infrastructurePriority) {
      return right.infrastructurePriority - left.infrastructurePriority;
    }
    const leftDistance = Math.hypot(
      left.feature.longitudeDeg - 26.304,
      left.feature.latitudeDeg - 41.195,
    );
    const rightDistance = Math.hypot(
      right.feature.longitudeDeg - 26.304,
      right.feature.latitudeDeg - 41.195,
    );
    return leftDistance - rightDistance;
  }).slice(0, 100);
  const directlyIntersectingCount = floodCandidates.filter(
    ({ floodRelation }) => floodRelation > 1,
  ).length;
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;

  showCaption(
    "08 / COPERNICUS EMS · FLOOD EXPOSURE",
    "Move from satellite mapping to the street network",
    `Keep the OpenStreetMap basemap introduced for footprint inspection and zoom into Soufli. Analyse ${floodCandidates.length} OpenStreetMap POIs; ${directlyIntersectingCount} representative points intersect a mapped Copernicus flood product.`,
    "await viewer.flyTo(26.304, 41.195, 1800)\n" +
      "await viewer.flyToFoV(0.035, 1600)",
  );
  await viewer.flyTo(26.304, 41.195, 1800);
  await viewer.flyToFoV(0.035, 1600);
  await wait(1000, token);

  const exposureColumns = [
    new MetadataColumn({ index: 0, name: "longitudeDeg", columnType: ColumnType.GEOM_RA, unit: "deg" }),
    new MetadataColumn({ index: 1, name: "latitudeDeg", columnType: ColumnType.GEOM_DEC, unit: "deg" }),
    new MetadataColumn({ index: 2, name: "asset", columnType: ColumnType.MAIN_NAME }),
    new MetadataColumn({ index: 3, name: "category", columnType: ColumnType.STRING }),
    new MetadataColumn({ index: 4, name: "osmId", columnType: ColumnType.STRING }),
    new MetadataColumn({ index: 5, name: "floodProduct", columnType: ColumnType.STRING }),
    new MetadataColumn({ index: 6, name: "infrastructurePriority", columnType: ColumnType.NUMBER }),
    new MetadataColumn({ index: 7, name: "floodRelation", columnType: ColumnType.NUMBER }),
  ];
  const exposureRows = floodCandidates.map(({
    feature,
    floodProduct,
    infrastructurePriority,
    floodRelation,
  }) => [
    feature.longitudeDeg,
    feature.latitudeDeg,
    feature.name ?? feature.tags.man_made ?? feature.category,
    feature.category,
    feature.id,
    floodProduct,
    infrastructurePriority,
    floodRelation,
  ]);
  const exposureLayerName = "Soufli flood-context POIs";
  const exposureLayer = viewer.addTerraPointSet(
    { columns: exposureColumns, rows: exposureRows },
    {
      name: exposureLayerName,
      description: "One hundred OSM POIs classified by infrastructure priority and relation to Copernicus flood products",
    },
  );
  registerCatalogueInteraction(
    "soufli-flood-context-pois",
    exposureLayer,
    floodCandidates,
    (exposure, state) => showFloodExposureMetadata(
      exposure.feature,
      exposure.floodProduct,
      exposure.floodDepth,
      exposure.infrastructurePriority,
      state,
    ),
  );
  viewer.changeCatalogueColor(exposureLayer, "#ff304f");
  showScientificLegend("Soufli · 100 urban POIs", [
    { label: "OpenStreetMap infrastructure and buildings", color: "#ff304f" },
    { label: "Latest observed flood extent", color: "#23bde8" },
    { label: "Maximum mapped flood extent", color: "#230585" },
  ]);
  provenance.textContent =
    `${infrastructureSource} · Copernicus EMSR868 monitoring 03 · ` +
    "spatial intersection, not verified damage";

  showCaption(
    "08 / COPERNICUS EMS · FLOOD EXPOSURE",
    "Add 100 high-contrast urban POIs",
    "Render the analysed OpenStreetMap sample in red. The set includes critical infrastructure, services, named places and mapped buildings; only the explicitly classified markers intersect a CEMS flood polygon.",
    'viewer.changeCatalogueColor(pois, "#ff304f")',
  );
  await wait(1500, token);

  showCaption(
    "08 / COPERNICUS EMS · FLOOD EXPOSURE",
    "Size by infrastructure priority",
    "Quickly map the derived 1–5 priority field to symbol size. Utilities, emergency and healthcare assets are largest; generic mapped buildings remain smallest. This is a visual priority, not a damage score.",
    'viewer.setCatalogueShapeSize(pois, "infrastructurePriority")',
  );
  viewer.setCatalogueShapeSize(exposureLayer, "infrastructurePriority");
  await wait(1500, token);

  showCaption(
    "08 / COPERNICUS EMS · FLOOD EXPOSURE",
    "Hue by flood-product relationship",
    "Map the relationship field to marker hue: urban context, maximum mapped extent, or latest observed extent. The classification comes from geometry intersection at each OSM representative point.",
    'viewer.setCatalogueShapeHue(pois, "floodRelation")',
  );
  viewer.setCatalogueShapeHue(exposureLayer, "floodRelation");
  showScientificLegend("Soufli · POI encoding", [
    {
      label: "Hue · context → maximum → latest extent",
      color: "linear-gradient(90deg, #5f0717, #ff304f, #ffb2be)",
    },
    {
      label: "Size · generic building → critical infrastructure",
      color: "#ff304f",
    },
  ]);
  await wait(1800, token);

  showCaption(
    "08 / COPERNICUS EMS · FLOOD EXPOSURE",
    "Inspect POI metadata",
    "Hover a small sample and preserve one POI selection. Metadata exposes the AstroViewer dataset, OSM identifier, infrastructure priority and exact CEMS relationship. Intersections indicate potential exposure, never verified damage.",
    "canvas.addEventListener(\"source-hovered\", ({ detail }) =>\n" +
      "  renderSourceMetadata(detail.source))\n" +
      "canvas.addEventListener(\"source-clicked\", ({ detail }) =>\n" +
      "  renderSelectionMetadata(detail.selectionState))\n" +
      "const metadata = { osmId, priority, floodProduct, floodDepth }",
  );
  const hoverCandidates = floodCandidates
    .map((exposure, index) => {
      const source = exposureLayer.sources[index];
      const screenPoint = source ? pointToScreen(source.point) : null;
      return { exposure, index, screenPoint };
    })
    .filter(({ screenPoint }) =>
      screenPoint !== null &&
      screenPoint.x >= 70 &&
      screenPoint.x <= canvas.clientWidth - 70 &&
      screenPoint.y >= 70 &&
      screenPoint.y <= canvas.clientHeight - 70)
    .toSorted((left, right) =>
      right.exposure.floodRelation - left.exposure.floodRelation)
    .slice(0, 4);
  for (const [candidateIndex, { index, screenPoint }] of hoverCandidates.entries()) {
    const source = exposureLayer.sources[index];
    if (!source || !screenPoint) continue;
    await animatePointer(screenPoint, token);
    await wait(750, token);
    if (candidateIndex === 0) {
      await clickDemoPointer(token);
      await wait(650, token);
    }
  }
  await wait(1000, token);
  viewer.deleteTerraPointSet(exposureLayer);
  catalogueInteractionBindings.delete(exposureLayer);
  observationMetadata.querySelector('[data-state="hover"]')?.remove();
  demoPointer.hidden = true;

  const floodStats = latestObservedExtent.statistics?.["Flooded area"] as
    | Record<string, { affected?: unknown }>
    | undefined;
  const affectedHa = Number(floodStats?.None?.affected);
  const roads = latestObservedExtent.statistics?.Transportation as
    | Record<string, { affected?: unknown; unit?: unknown }>
    | undefined;
  const affectedRoadKm = roads
    ? Object.values(roads).reduce(
        (sum, item) => sum + (Number(item.affected) || 0),
        0,
      )
    : 0;
  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Compare with the latest observation",
    `Cyan shows ${latestObservedExtent.data.features.length.toLocaleString()} polygons observed on 27 February. Copernicus reports ${affectedHa.toLocaleString()} ha flooded and ${affectedRoadKm.toFixed(1)} km of affected mapped transport routes. The dark/cyan comparison is maximum versus latest observed extent—not an operational active/receded classification.`,
    "latestFlood.addGeoJSONFeatures(\n" +
      "  GeoJSONParser.parseGeoJSON(latest.data))\n" +
      'viewer.changeFootprintSetColor(latestFlood, "#23bde8")\n' +
      "viewer.showTerraFootprintSet(latestFlood)",
  );
  provenance.textContent =
    `${sourceMode} · Copernicus EMS Rapid Mapping · EMSR868 · ` +
    `Sentinel-1 / COSMO-SkyMed / ICEYE · acquired 27 February 2026`;
  await wait(5200, token);

  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Release flood geometries",
    "Remove both emergency-mapping layers before continuing to the administrative-boundary workflow.",
    "viewer.deleteTerraFootprintSet(latestFlood)\n" +
      "viewer.deleteTerraFootprintSet(maximumFlood)",
  );
  viewer.deleteTerraFootprintSet(latestFlood);
  viewer.deleteTerraFootprintSet(maximumFlood);
  footprintInteractionBindings.delete(latestFlood);
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  demoPointer.hidden = true;
  hideScientificLegend();
  await wait(1600, token);

  showCaption(
    "08 / COPERNICUS EMS · EUROPEAN FLOODING",
    "Leave the floodplain",
    "Widen the field from the street-level Soufli inspection before the camera moves west toward the Italian administrative-region workflow.",
    "await viewer.flyToFoV(26, 2400)",
  );
  await viewer.flyToFoV(26, 2400);
  await waitForEarthTiles(token);
  await wait(1000, token);
}

async function scene09AdministrativeRegions(token: number): Promise<void> {
  audit.scenes.push(9);
  audit.sequencePhase = "scene09-administrative-regions";

  showCaption(
    "09 / Administrative regions",
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
  showScientificLegend("Administrative footprint sets", [
    { label: "Italian regions", color: "#24c8ff" },
  ]);
  registerFootprintInteraction(
    "italian-regions",
    italyLayer,
    italyGeoJSON.features,
    (feature, state) => showRegionMetadata(
      String(feature.properties?.reg_name ?? "Italian region"),
      "Italy",
      "not supplied by the geometry dataset",
      feature.properties ?? {},
      "Italian regions",
      state,
    ),
  );
  await viewer.flyTo(16.4, 41.1, 1600);
  await viewer.flyToFoV(16, 1200);
  await wait(1400, token);

  showCaption(
    "09 / Administrative regions",
    "Listen for footprint interaction",
    "Connect pointer movement to the public hovered-footprint state and listen for click selections before rendering application metadata.",
    "canvas.addEventListener(\"pointermove\", () => {\n" +
      "  requestAnimationFrame(() => {\n" +
      "    const hovered = viewer.getHoveredFootprints()\n" +
      "    renderHoveredMetadata(hovered)\n" +
      "  })\n" +
      "})\n" +
      "canvas.addEventListener(\"footprint-clicked\", ({ detail }) =>\n" +
      "  renderSelectionMetadata(detail.selectionState))",
  );
  await wait(2200, token);

  const pugliaIndex = italyGeoJSON.features.findIndex(
    (feature) => feature.properties?.reg_name === "Puglia",
  );
  const puglia = italyLayer.footprintPolygons[pugliaIndex];
  let pugliaHoverPoint: { x: number; y: number } | null = null;
  if (puglia) {
    showCaption(
      "09 / Administrative regions",
      "Puglia · interactive metadata",
      "Hover and select the regional footprint while preserving its source attributes and demonstration metadata.",
      "// Hover is reported by viewer.getHoveredFootprints()\n" +
        "// Selection is reported by the footprint-clicked event",
    );
    pugliaHoverPoint = await findFootprintHoverPoint(italyLayer, puglia, token);
    const pugliaApproachPoint = {
      x: Math.min(canvas.clientWidth - 70, pugliaHoverPoint.x + 190),
      y: pugliaHoverPoint.y,
    };
    pointerPosition = pugliaApproachPoint;
    cursorGesture(false);
    demoPointer.hidden = false;
    placeDemoPointer(pugliaApproachPoint.x, pugliaApproachPoint.y);
    clearHoverMetadata();
    dispatchPointer(pugliaApproachPoint.x, pugliaApproachPoint.y);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await wait(350, token);
    await animatePointer(pugliaHoverPoint, token);
    await wait(1100, token);
    await clickDemoPointer(token);
    await wait(1300, token);
  }

  showCaption(
    "09 / Administrative regions",
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
  showScientificLegend("Administrative footprint sets", [
    { label: "Italian regions", color: "#24c8ff" },
    { label: "Spanish regions", color: "#ff334f" },
  ]);
  registerFootprintInteraction(
    "spanish-regions",
    spainLayer,
    spainGeoJSON.features,
    (feature, state) => showRegionMetadata(
      String(feature.properties?.name ?? "Spanish region"),
      "Spain",
      "not supplied by the geometry dataset",
      feature.properties ?? {},
      "Spanish regions",
      state,
    ),
  );
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
  showCaption(
    "09 / Administrative regions",
    "Rotate west toward the Balearic Islands",
    "Change from the inspection cursor to a drag gesture and rotate the globe toward the second administrative layer while preserving the Puglia selection.",
    "await viewer.flyTo(3.5, 39.6, 1800)",
  );
  await Promise.all([
    viewer.flyTo(3.5, 39.6, 1800),
    animateDragPointer(150, 1800, token, pointOutsidePuglia, false),
  ]);
  await viewer.flyToFoV(13, 1200);
  dispatchPointer(pointerPosition.x, pointerPosition.y);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await wait(850, token);
  await wait(1400, token);

  const balearicIndex = spainGeoJSON.features.findIndex(
    (feature) => feature.properties?.name === "Baleares",
  );
  const balearicIslands = spainLayer.footprintPolygons[balearicIndex];
  if (balearicIslands) {
    showCaption(
      "09 / Administrative regions",
      "Balearic Islands · independent selection",
      "Hover and select a feature from the second polygon layer without changing the Puglia selection.",
      "// Hover is reported by viewer.getHoveredFootprints()\n" +
        "// Selection is reported by the footprint-clicked event",
    );
    const balearicHoverPoint = await findFootprintHoverPoint(
      spainLayer,
      balearicIslands,
      token,
    );
    await animatePointer(balearicHoverPoint, token);
    await wait(350, token);
    await wait(1250, token);
    await clickDemoPointer(token);
    await wait(1400, token);
  }
  demoPointer.hidden = true;
  dispatchPointer(canvas.clientWidth - 8, canvas.clientHeight - 8);

  showCaption(
    "09 / Administrative regions",
    "Release regional layers",
    "Remove both administrative footprint sets before the dedicated maritime-route scene.",
    "viewer.deleteTerraFootprintSet(italyLayer)\n" +
      "viewer.deleteTerraFootprintSet(spainLayer)",
  );
  viewer.deleteTerraFootprintSet(italyLayer);
  viewer.deleteTerraFootprintSet(spainLayer);
  footprintInteractionBindings.delete(italyLayer);
  footprintInteractionBindings.delete(spainLayer);
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  hideScientificLegend();
  await wait(1400, token);
}

async function scene10MaritimeRoutes(token: number): Promise<void> {
  audit.scenes.push(10);
  audit.sequencePhase = "scene10-maritime-routes";

  showCaption(
    "10 / Mediterranean ferry routes",
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
    "10 / Mediterranean ferry routes",
    "Piraeus · a connected ferry hub",
    "Approach the port of Piraeus, where several routes in the published network converge.",
    "await viewer.flyTo(23.6384, 37.9453, 3200)\n" +
      "await viewer.flyToFoV(5.5, 2600)",
  );
  await viewer.flyTo(23.6384, 37.9453, 3200);
  await viewer.flyToFoV(5.5, 2600);
  await wait(2600, token);

  showCaption(
    "10 / Mediterranean ferry routes",
    "Follow the network west",
    "Widen the view, then move gradually across the published ferry network towards Sicily.",
    "await viewer.flyToFoV(34, 2800)\n" +
      "await viewer.flyTo(14.2, 37.3, 4200)",
  );
  await viewer.flyToFoV(34, 2800);
  await viewer.flyTo(14.2, 37.3, 4200);
  await wait(2600, token);

  showCaption(
    "10 / Mediterranean ferry routes",
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

async function scene11GeographicGrid(token: number): Promise<void> {
  audit.scenes.push(11);
  audit.sequencePhase = "scene11-geographic-grid";

  hideEarthGrid();
  showCaption(
    "11 / Geographic coordinate grid",
    "Longitude and latitude",
    "Enable the Earth-owned coordinate grid as a spatial reference over the active base map.",
    "viewer.toggleLonLatGrid()",
  );
  viewer.toggleLonLatGrid();
  await wait(1600, token);

  showCaption(
    "11 / Geographic coordinate grid",
    "Equator and prime meridian",
    "Navigate to the origin of geographic longitude and latitude.",
    "await viewer.flyTo(0, 0, 2200)\n" +
      "await viewer.flyToFoV(42, 1400)",
  );
  await viewer.flyTo(0, 0, 2200);
  await viewer.flyToFoV(42, 1400);
  await wait(1800, token);

  showCaption(
    "11 / Geographic coordinate grid",
    "High-latitude reference",
    "Adaptive labels preserve a readable geographic reference toward northern latitudes.",
    "await viewer.flyTo(-21.9426, 64.1466, 2200)",
  );
  await viewer.flyTo(-21.9426, 64.1466, 2200);
  await wait(2200, token);

  showCaption(
    "11 / Geographic coordinate grid",
    "Independent grid state",
    "Disable the Earth grid without changing Astronomy grid visibility.",
    "viewer.toggleLonLatGrid()",
  );
  viewer.toggleLonLatGrid();
  await wait(1000, token);
}

async function scene12SavedEarthContexts(token: number): Promise<void> {
  audit.scenes.push(12);
  audit.sequencePhase = "scene12-saved-earth-contexts";
  viewer.deleteState("earth-rome-analysis");
  viewer.deleteState("earth-madrid-cartography");
  savedContextRows.replaceChildren();
  savedContexts.hidden = false;

  showCaption(
    "12 / Saved Earth contexts",
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
    "12 / Saved Earth contexts",
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
    "12 / Saved Earth contexts",
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
    await clickInterfaceElement(romeCard, token);
  }
  await viewer.restoreState("earth-rome-analysis");
  setActiveContext("earth-rome-analysis");
  await waitForEarthTiles(token);
  await wait(2200, token);

  showCaption(
    "12 / Saved Earth contexts",
    "Reopen Madrid before deletion",
    "Select the Madrid card once more to restore its OpenStreetMap camera and grid-free cartographic state, then remove that saved context.",
    "await viewer.restoreState(\"earth-madrid-cartography\")\n" +
      "viewer.deleteState(\"earth-madrid-cartography\")",
  );
  const madridCard = savedContextRows.querySelector<HTMLElement>(
    '[data-name="earth-madrid-cartography"]',
  );
  if (madridCard) {
    const bounds = madridCard.getBoundingClientRect();
    await animatePointer(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      token,
    );
    await wait(400, token);
    await clickInterfaceElement(madridCard, token);
  }
  await viewer.restoreState("earth-madrid-cartography");
  setActiveContext("earth-madrid-cartography");
  await waitForEarthTiles(token);
  await wait(1400, token);
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
    await clickInterfaceElement(madridDelete, token);
  }
  viewer.deleteState("earth-madrid-cartography");
  savedContextRows.querySelector('[data-name="earth-madrid-cartography"]')?.remove();
  await wait(900, token);

  showCaption(
    "12 / Saved Earth contexts",
    "Return to Rome and remove the final context",
    "Select Rome analysis to restore its imagery composition and geographic grid, then delete the last saved snapshot.",
    "await viewer.restoreState(\"earth-rome-analysis\")\n" +
      "viewer.deleteState(\"earth-rome-analysis\")",
  );
  const remainingRomeCard = savedContextRows.querySelector<HTMLElement>(
    '[data-name="earth-rome-analysis"]',
  );
  if (remainingRomeCard) {
    const bounds = remainingRomeCard.getBoundingClientRect();
    await animatePointer(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      token,
    );
    await wait(400, token);
    await clickInterfaceElement(remainingRomeCard, token);
  }
  await viewer.restoreState("earth-rome-analysis");
  setActiveContext("earth-rome-analysis");
  await waitForEarthTiles(token);
  await wait(1400, token);
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
    await clickInterfaceElement(romeDelete, token);
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

async function scene13SatelliteObservation(token: number): Promise<void> {
  audit.scenes.push(13);
  audit.sequencePhase = "scene13-satellite-observation";
  hideEarthGrid();
  captionBox.classList.add("satellite-scene");
  satelliteLegend.hidden = false;

  showCaption(
    "13 / Satellite observation",
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
    "13 / Satellite observation",
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
    "13 / Satellite observation",
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

async function scene14ObservationTimeline(token: number): Promise<void> {
  audit.scenes.push(14);
  audit.sequencePhase = "scene14-observation-timeline";
  const observation = satelliteHandle ?? await loadSatelliteObservation(token);
  captionBox.classList.add("satellite-scene");
  satelliteLegend.hidden = false;

  showCaption(
    "14 / Observation timeline",
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
    "14 / Observation timeline",
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
    "14 / Observation timeline",
    "Completed observation pass",
    "Zoom out while preserving the satellite, ground track, acquired images and intersected regions as one complete observation geometry.",
    "await viewer.flyToFoV(82, 2200)",
  );
  await viewer.flyToFoV(82, 2200);
  check(token);
  await wait(1800, token);

  showCaption(
    "14 / Observation timeline",
    "Observation metadata",
    "Hover two acquired-image footprints, then preserve their selection to inspect observation identifiers, targets, coordinates and acquisition times.",
    "canvas.addEventListener(\"pointermove\", () =>\n" +
      "  requestAnimationFrame(() =>\n" +
      "    renderHoveredMetadata(viewer.getHoveredFootprints())))\n" +
      "canvas.addEventListener(\"footprint-clicked\", ({ detail }) =>\n" +
      "  renderSelectionMetadata(detail.selectionState))",
  );
  await demonstrateAcquiredImageMetadata(token);

  showCaption(
    "14 / Observation timeline",
    "Release observation resources",
    "Stop the timeline and remove every transient satellite, sensor and vector resource.",
    "observation.dispose()\n" +
      "adapter.clear()",
  );
  clearSatelliteObservation();
  await wait(1400, token);
}

async function scene15ProvenanceAndStructure(token: number): Promise<void> {
  audit.scenes.push(15);
  audit.sequencePhase = "scene15-provenance-structure";
  clearSatelliteObservation();
  hideEarthGrid();
  viewer.removeAllEarthRasterOverlays();

  showCaption(
    "15 / Provenance and structure",
    "Services and data providers",
    "Leave the local observation workflows, return to the global Earth and fade the imagery before separating the runtime services from the organisations and communities providing maps and scientific data.",
    "await viewer.flyTo(12.4964, 41.9028, 1800)\n" +
      "await viewer.flyToFoV(78, 1600)\n" +
      "await viewer.fadeEarthBaseMapOpacity(0, 2200)\n" +
      "showServicesAndProviders()",
  );
  await viewer.flyTo(12.4964, 41.9028, 1800);
  await viewer.flyToFoV(78, 1600);
  provenance.textContent =
    "XYZ · OGC WMTS · GeoJSON · WebGL2 · geographic coordinates · " +
    "timestamped observation tracks";
  await wait(1000, token);
  await viewer.fadeEarthBaseMapOpacity(0, 2200);
  await wait(350, token);
  captionBox.hidden = true;
  provenancePanel.hidden = true;
  telemetryPanel.hidden = true;
  await showClosingPanel(`
    <p class="panel-eyebrow">E00 · Provenance</p>
    <h2>Services and data providers</h2>
    <p class="panel-subtitle">
      E00 combines Astrospatial Services adapters with recognised public
      geospatial and Earth-observation sources.
    </p>
    <div class="provenance-grid">
      <article class="closing-card">
        <h3>Services used</h3>
        <p>
          NASA FIRMS Area API · Copernicus GWIS WFS · Copernicus EMS Rapid
          Mapping products · OpenStreetMap Overpass API · Nominatim place
          search · Open-Meteo forecast API · Wikipedia REST API
        </p>
      </article>
      <article class="closing-card">
        <h3>Data providers</h3>
        <p>
          Esri World Imagery · NASA EOSDIS GIBS · NASA LANCE FIRMS ·
          Copernicus GWIS · Copernicus EMS · OpenStreetMap contributors ·
          OpenTopoMap contributors · European Atlas of the Seas ·
          © EuroGeographics 2022
        </p>
      </article>
    </div>
  `, token);
  await wait(mode === "video" ? 7000 : 4200, token);

  await showClosingPanel(`
    <p class="panel-eyebrow">E00 · Software structure</p>
    <h2>How data reaches the globe</h2>
    <p class="panel-subtitle">
      Astrospatial Services retrieves and normalises provider data.
      AstroViewer renders the resulting maps, catalogues, footprints and
      observation geometry. Both use shared models from astrospatial-core.
    </p>
    <div class="architecture-node architecture-demo">
      <strong>E00 demo application</strong>
      <span>Orchestrates the viewer, service queries and presentation sequence</span>
    </div>
    <div class="architecture-connector" aria-hidden="true">↓</div>
    <div class="architecture-pair">
      <article class="architecture-node viewer">
        <strong>AstroViewer</strong>
        <span>
          Earth rendering · camera · XYZ and WMTS rasters · catalogues ·
          footprints · polylines · saved contexts · observation geometry
        </span>
      </article>
      <article class="architecture-node services">
        <strong>Astrospatial Services</strong>
        <span>
          Provider adapters · request normalisation · GeoJSON-ready results ·
          reproducible snapshot fallbacks
        </span>
        <div class="architecture-connector" aria-hidden="true">↓</div>
        <span><b>External providers</b> · maps, observations and context APIs</span>
      </article>
    </div>
    <div class="architecture-connector" aria-hidden="true">↓</div>
    <div class="architecture-node architecture-core">
      <strong>astrospatial-core</strong>
      <span>Shared spatial models, metadata and interoperable data structures</span>
    </div>
  `, token);
  await wait(mode === "video" ? 9000 : 5200, token);
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
  { number: 6, title: "European capitals and runtime context", run: scene06GeoJSONPoints },
  { number: 7, title: "NASA FIRMS African fire detections", run: scene07AfricanWildfires },
  { number: 8, title: "Copernicus EMS European flooding", run: scene08EuropeanFlooding },
  { number: 9, title: "Administrative regions", run: scene09AdministrativeRegions },
  { number: 10, title: "Mediterranean ferry routes", run: scene10MaritimeRoutes },
  { number: 11, title: "Geographic coordinate grid", run: scene11GeographicGrid },
  { number: 12, title: "Saved Earth contexts", run: scene12SavedEarthContexts },
  { number: 13, title: "Satellite observation geometry", run: scene13SatelliteObservation },
  { number: 14, title: "Observation timeline", run: scene14ObservationTimeline },
  { number: 15, title: "Provenance and structure", run: scene15ProvenanceAndStructure },
];

async function runE00(startScene: number = requestedScene): Promise<void> {
  if (running) {
    return;
  }

  const normalizedStartScene = (
    Number.isFinite(startScene)
      ? Math.min(15, Math.max(1, Math.trunc(startScene)))
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
      "–15";
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
  closingPanel.hidden = true;
  closingPanel.replaceChildren();
  delete closingPanel.dataset.switching;
  captionBox.hidden = false;
  provenancePanel.hidden = false;
  telemetryPanel.hidden = false;
  layerStack.hidden = true;
  savedContexts.hidden = true;
  hideScientificLegend();
  observationMetadata.replaceChildren();
  observationMetadata.hidden = true;
  catalogueInteractionBindings.clear();
  footprintInteractionBindings.clear();
  hoveredSourceActive = false;
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
