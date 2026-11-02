/// <reference path="../../demo-window.d.ts" />
import {
  AstroViewer,
  ColumnType,
  MetadataColumn,
  MetadataManager,
  type CatalogueGL,
  type FootprintSetGL,
  type Footprint,
  type HiPS,
  type Source,
} from "astro-viewer";
import hscUrl from "./hsc_m51_sources.json?url";
import hstUrl from "./hst_m51_observations.json?url";

type SurveyKey =
  | "optical"
  | "ultraviolet"
  | "infrared"
  | "xray"
  | "nearinfrared"
  | "midinfrared"
  | "herschelfits";
const surveys: Record<SurveyKey, { name: string; url: string }> = {
  optical: {
    name: "DSS Color — Optical",
    url: "https://cdn.skies.esac.esa.int/DSSColor/",
  },
  ultraviolet: {
    name: "GALEX Color — Ultraviolet",
    url: "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor",
  },
  infrared: {
    name: "Herschel SPIRE 250 µm — Far infrared",
    url: "https://skies.esac.esa.int/Herschel/SPIRE250/",
  },
  xray: {
    name: "Chandra — X-ray",
    url: "https://cdaftp.cfa.harvard.edu/cxc-hips/",
  },
  nearinfrared: {
    name: "2MASS Color — Near infrared (J/H/K)",
    url: "https://skies.esac.esa.int/2MASSColor/",
  },
  midinfrared: {
    name: "AllWISE Color — Mid infrared (W1/W2/W4)",
    url: "https://skies.esac.esa.int/AllWISEColor/",
  },
  herschelfits: {
    name: "Herschel SPIRE 250 µm — FITS",
    url: "https://skies.esac.esa.int/Herschel/SPIRE250/",
  },
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
const mode =
  new URLSearchParams(location.search).get("mode") === "video"
    ? "video"
    : "interactive";
get<HTMLElement>("controls").hidden = mode === "video";
const viewer = new AstroViewer(canvas, {
  gridLabelContainers: {
    coords: get<HTMLDivElement>("coords-grid-labels"),
    healpix: get<HTMLDivElement>("healpix-grid-labels"),
  },
});
viewer.run();
const layers = new Map<SurveyKey, HiPS>();
let running = false;
let paused = false;
let generation = 0;
let activeKey: SurveyKey | null = null;
let catalogue: CatalogueGL | null = null;
type HscFixture = {
  name: string;
  description: string;
  source: string;
  center: { ra: number; dec: number };
  mapping: { ra: string; dec: string; name: string };
  columns: Array<{
    name: string;
    numeric?: boolean;
    unit?: string;
    description?: string;
  }>;
  rows: Array<Array<string | number>>;
};
let hscFixture: HscFixture | null = null;
function clearCatalogue(): void {
  if (!catalogue) return;
  catalogue.clearSelection();
  viewer.deleteCatalogue(catalogue);
  catalogue = null;
}
async function showHscCatalogue(): Promise<{
  catalogue: CatalogueGL;
  source: Source;
  ra: number;
  dec: number;
  label: string;
}> {
  if (!hscFixture) {
    // const response = await fetch("./hsc_m51_sources.json");
    const response = await fetch(hscUrl);
    if (!response.ok)
      throw new Error(`HSC fixture unavailable: ${response.status}`);
    hscFixture = (await response.json()) as HscFixture;
  }
  const data = hscFixture;
  if (!data.rows.length) throw new Error("HSC fixture has no sources");
  const columns = data.columns.map(
    (column, index) =>
      new MetadataColumn({
        index,
        name: column.name,
        columnType:
          column.name === data.mapping.ra
            ? ColumnType.GEOM_RA
            : column.name === data.mapping.dec
              ? ColumnType.GEOM_DEC
              : column.name === data.mapping.name
                ? ColumnType.MAIN_NAME
                : column.numeric
                  ? ColumnType.NUMBER
                  : ColumnType.STRING,
        unit: column.unit ?? "",
        description: column.description ?? "",
      }),
  );
  const created = viewer.createCatalogue(
    data.name,
    data.description,
    data.source,
    new MetadataManager(columns),
  );
  created.addSources(data.rows, columns);
  viewer.showCatalogue(created);
  catalogue = created;
  const raIndex = data.columns.findIndex((c) => c.name === data.mapping.ra);
  const decIndex = data.columns.findIndex((c) => c.name === data.mapping.dec);
  const nameIndex = data.columns.findIndex((c) => c.name === data.mapping.name);
  const cosDec = Math.cos((data.center.dec * Math.PI) / 180);
  let best = 0;
  let distance = Infinity;
  data.rows.forEach((row, i) => {
    const dra = (Number(row[raIndex]) - data.center.ra) * cosDec;
    const ddec = Number(row[decIndex]) - data.center.dec;
    const d = dra * dra + ddec * ddec;
    if (d < distance) {
      distance = d;
      best = i;
    }
  });
  const source = created.sources[best];
  if (!source) throw new Error("HSC focus source unavailable");
  return {
    catalogue: created,
    source,
    ra: Number(data.rows[best][raIndex]),
    dec: Number(data.rows[best][decIndex]),
    label: String(data.rows[best][nameIndex]),
  };
}
type HstFixture = {
  name: string;
  description: string;
  source: string;
  mapping: { ra: string; dec: string; name: string; footprint: string };
  columns: Array<{
    name: string;
    numeric?: boolean;
    unit?: string;
    description?: string;
  }>;
  rows: Array<Array<string | number>>;
};
let hstFixture: HstFixture | null = null;
let observationSet: FootprintSetGL | null = null;
function clearObservations(): void {
  if (!observationSet) return;
  observationSet.clearSelection();
  viewer.deleteFootprintSet(observationSet);
  observationSet = null;
}
async function showHstObservations(): Promise<{
  set: FootprintSetGL;
  focus: Footprint;
  ra: number;
  dec: number;
}> {
  if (!hstFixture) {
    // const response = await fetch("./hst_m51_observations.json");
    const response = await fetch(hstUrl);
    if (!response.ok)
      throw new Error(`HST fixture unavailable: ${response.status}`);
    hstFixture = (await response.json()) as HstFixture;
  }
  const data = hstFixture;
  if (!data.rows.length) throw new Error("HST fixture has no observations");
  const columns = data.columns.map(
    (column, index) =>
      new MetadataColumn({
        index,
        name: column.name,
        columnType:
          column.name === data.mapping.ra
            ? ColumnType.GEOM_RA
            : column.name === data.mapping.dec
              ? ColumnType.GEOM_DEC
              : column.name === data.mapping.footprint
                ? ColumnType.GEOM_FOOTPRINT
                : column.name === data.mapping.name
                  ? ColumnType.MAIN_NAME
                  : column.numeric
                    ? ColumnType.NUMBER
                    : ColumnType.STRING,
        unit: column.unit ?? "",
        description: column.description ?? "",
      }),
  );
  const set = viewer.createFootprintSet(
    data.name,
    data.description,
    data.source,
    new MetadataManager(columns),
  );
  set.addFootprints(data.rows, columns);
  viewer.showFootprintSet(set);
  observationSet = set;
  const focus = set.footprintPolygons.find((footprint) => footprint.valid);
  if (!focus) throw new Error("No valid HST observation footprint");
  const row = focus.details as unknown as Array<string | number>;
  const raIndex = data.columns.findIndex(
    (column) => column.name === data.mapping.ra,
  );
  const decIndex = data.columns.findIndex(
    (column) => column.name === data.mapping.dec,
  );
  const ra = Number(row[raIndex]);
  const dec = Number(row[decIndex]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec))
    throw new Error("Invalid HST observation coordinates");
  return { set, focus, ra, dec };
}
const INTERACTION_COLOR = "#00d4ff";
let displayColor = INTERACTION_COLOR;
const legend = get<HTMLElement>("interaction-legend");
const demoPointer = get<HTMLElement>("demo-pointer");
// Keep the demonstration cursor in viewport coordinates, outside canvas/WebGL stacking contexts.
document.body.appendChild(demoPointer);
function placeDemoPointer(x: number, y: number): void {
  const rect = canvas.getBoundingClientRect();
  demoPointer.style.left = `${rect.left + x}px`;
  demoPointer.style.top = `${rect.top + y}px`;
}
function setLegend(
  kind: "catalogue" | "footprint",
  state: "normal" | "hover" | "selected",
): void {
  legend.hidden = false;
  const hex = displayColor.slice(1);
  const base = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
  const target = luminance < 0.55 ? 1 : 0;
  const mix = (amount: number) =>
    `rgb(${base.map((v) => Math.round((v + (target - v) * amount) * 255)).join(", ")})`;
  legend.style.setProperty("--base", displayColor);
  // CatalogueGL currently uses the complementary colour for BOTH states.
  // FootprintSetGL uses interactionColorsFromHex (45% / 75%).
  const complement = `rgb(${base.map((v) => Math.round((1 - v) * 255)).join(", ")})`;
  legend.style.setProperty(
    "--hover",
    kind === "catalogue" ? complement : mix(0.45),
  );
  legend.style.setProperty(
    "--selected",
    kind === "catalogue" ? complement : mix(0.75),
  );
  legend.dataset.kind = kind;
  legend.title =
    kind === "catalogue"
      ? "CatalogueGL uses the same complementary colour for hover and selected; selection is persistent."
      : "FootprintSetGL uses different hover and selected contrast colours.";
  legend.querySelector<HTMLElement>(".legend-title")!.textContent =
    kind === "catalogue"
      ? "HSC source interaction"
      : "HST footprint interaction";
  for (const element of legend.querySelectorAll<HTMLElement>("[data-state]")) {
    element.classList.toggle("active", element.dataset.state === state);
  }
}
function hideInteraction(): void {
  legend.hidden = true;
  demoPointer.hidden = true;
  demoPointer.style.display = "none";
}
function dispatchPointer(x: number, y: number): void {
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      clientX: rect.left + x,
      clientY: rect.top + y,
    }),
  );
  canvas.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: rect.left + x,
      clientY: rect.top + y,
    }),
  );
}
let pointerPosition = { x: 55, y: 70 };
async function animatePointer(
  target: { x: number; y: number },
  token: number,
): Promise<void> {
  const from = pointerPosition;
  demoPointer.hidden = false;
  demoPointer.style.display = "block";
  for (let i = 0; i <= 30; i++) {
    const t = i / 30,
      smooth = t * t * (3 - 2 * t);
    const x = from.x + (target.x - from.x) * smooth;
    const y = from.y + (target.y - from.y) * smooth;
    placeDemoPointer(x, y);
    dispatchPointer(x, y);
    await wait(22, token);
  }
  pointerPosition = target;
}
function movePointerAway(): void {
  // Clear the hover without hiding the demo cursor: it must remain visible
  // at its last target during pauses and between successive interactions.
  dispatchPointer(-30, -30);
}
// Use the exact model/view/projection matrices emitted by AstroSphere.
// CatalogueGL projects the same Cartesian Point coordinates with P * V * M.
type CameraMatrices = {
  vMatrix: Float32Array;
  pMatrix: Float32Array;
  mMatrix: Float32Array;
};
let cameraMatrices: CameraMatrices | null = null;
canvas.addEventListener("camera-changed", (event: Event) => {
  const detail = (event as CustomEvent<CameraMatrices>).detail;
  if (detail?.vMatrix && detail?.pMatrix && detail?.mMatrix) {
    cameraMatrices = {
      vMatrix: new Float32Array(detail.vMatrix),
      pMatrix: new Float32Array(detail.pMatrix),
      mMatrix: new Float32Array(detail.mMatrix),
    };
  }
});
function multiplyMatVec(m: Float32Array, v: readonly number[]): number[] {
  return [0, 1, 2, 3].map(
    (row) =>
      m[row] * v[0] +
      m[4 + row] * v[1] +
      m[8 + row] * v[2] +
      m[12 + row] * v[3],
  );
}
function pointToScreen(point: {
  x: number;
  y: number;
  z: number;
}): { x: number; y: number } | null {
  if (!cameraMatrices) return null;
  const { mMatrix, vMatrix, pMatrix } = cameraMatrices;
  const model = multiplyMatVec(mMatrix, [point.x, point.y, point.z, 1]);
  const view = multiplyMatVec(vMatrix, model);
  const clip = multiplyMatVec(pMatrix, view);
  if (clip[3] <= 0) return null;
  const ndcX = clip[0] / clip[3],
    ndcY = clip[1] / clip[3];
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return {
    x: (ndcX * 0.5 + 0.5) * canvas.clientWidth,
    y: (1 - (ndcY * 0.5 + 0.5)) * canvas.clientHeight,
  };
}
function requireScreenPoint(point: { x: number; y: number; z: number }): {
  x: number;
  y: number;
} {
  const projected = pointToScreen(point);
  if (!projected)
    throw new Error("Camera matrices unavailable or target behind camera");
  return projected;
}
function footprintScreenPoint(footprint: Footprint): { x: number; y: number } {
  // HST fixture uses compact convex STC-S polygons. Average vertices in 3D
  // to pick a point inside the footprint rather than the observation RA/Dec.
  const ring = footprint.polygons.find((points) => points.length >= 3);
  if (!ring) throw new Error("Footprint has no polygon vertices");
  const centroid = ring.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }),
    { x: 0, y: 0, z: 0 },
  );
  const length = Math.hypot(centroid.x, centroid.y, centroid.z);
  if (!length) throw new Error("Degenerate footprint centroid");
  return requireScreenPoint({
    x: centroid.x / length,
    y: centroid.y / length,
    z: centroid.z / length,
  });
}
function onScreen(p: { x: number; y: number }, margin = 70): boolean {
  return (
    p.x >= margin &&
    p.y >= margin &&
    p.x <= canvas.clientWidth - margin &&
    p.y <= canvas.clientHeight - margin
  );
}
function spaced<T>(
  items: T[],
  position: (item: T) => { x: number; y: number },
  count: number,
): T[] {
  const available = items.filter((item) => onScreen(position(item)));
  if (available.length < count)
    throw new Error(`Only ${available.length} targets visible; need ${count}`);
  const chosen: T[] = [available[0]];
  while (chosen.length < count) {
    const remaining = available.filter((item) => !chosen.includes(item));
    chosen.push(
      remaining.reduce((best, candidate) => {
        const separation = (item: T) =>
          Math.min(
            ...chosen.map((existing) => {
              const a = position(item),
                b = position(existing);
              return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
            }),
          );
        return separation(candidate) > separation(best) ? candidate : best;
      }),
    );
  }
  return chosen;
}
function footprintPosition(footprint: Footprint): { ra: number; dec: number } {
  if (!hstFixture) throw new Error("HST fixture unavailable");
  const row = footprint.details as unknown as Array<string | number>;
  const ra = Number(
    row[hstFixture.columns.findIndex((c) => c.name === hstFixture!.mapping.ra)],
  );
  const dec = Number(
    row[
      hstFixture.columns.findIndex((c) => c.name === hstFixture!.mapping.dec)
    ],
  );
  if (!Number.isFinite(ra) || !Number.isFinite(dec))
    throw new Error("Invalid footprint position");
  return { ra, dec };
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const check = (token: number) => {
  if (token !== generation) throw new Error("Sequence cancelled");
};
async function wait(ms: number, token: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; ) {
    check(token);
    if (paused) {
      await sleep(50);
      continue;
    }
    const step = Math.min(50, ms - elapsed);
    await sleep(step);
    elapsed += step;
  }
  check(token);
}
// Transient centre-screen feedback for the scientific view-state demonstration.
const stateToast = document.createElement("div");
stateToast.setAttribute("role", "status");
stateToast.setAttribute("aria-live", "polite");
Object.assign(stateToast.style, {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: "10000",
  padding: "18px 32px",
  borderRadius: "12px",
  background: "rgba(10, 18, 30, 0.88)",
  color: "#fff",
  font: "600 22px system-ui, sans-serif",
  letterSpacing: "0.12em",
  boxShadow: "0 12px 36px rgba(0, 0, 0, 0.35)",
  pointerEvents: "none",
  opacity: "0",
  transition: "opacity 250ms ease",
});
document.body.appendChild(stateToast);
async function showStateToast(message: string, token: number): Promise<void> {
  stateToast.textContent = message;
  stateToast.style.opacity = "1";
  try {
    await wait(1500, token);
  } finally {
    stateToast.style.opacity = "0";
  }
}

function caption(
  scene: string,
  headline: string,
  detail: string,
  api: string,
): void {
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
  for (const [id, layer] of layers)
    viewer.setHiPSOpacity(layer, id === key ? 1 : 0);
  viewer.setActiveHiPS(active);
  activeKey = key;
}
async function fadeTo(key: SurveyKey, token: number): Promise<boolean> {
  const previous = activeKey;
  let next: HiPS;
  try {
    next = await ensureLayer(key);
  } catch (error) {
    console.warn(`A00: ${surveys[key].name} unavailable`, error);
    caption(
      "Multiwavelength",
      "Survey unavailable",
      `${surveys[key].name} could not be loaded.`,
      surveys[key].url,
    );
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
    if (previous && previous !== key)
      viewer.setHiPSOpacity(layers.get(previous)!, 1 - i / 25);
  }
  showOnly(key);
  return true;
}
// Reuse A10's canvas PointerEvent technique for a reproducible camera demonstration.
// The scene token keeps cancellation responsive and always releases the pointer.
async function demonstrateCameraDrag(
  dx: number,
  dy: number,
  token: number,
): Promise<void> {
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const pointerId = 1;
  const dispatch = (
    type: string,
    clientX: number,
    clientY: number,
    buttons: number,
  ) => {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons,
        clientX,
        clientY,
      }),
    );
  };
  let lastX = x;
  let lastY = y;
  dispatch("pointerdown", x, y, 1);
  try {
    const steps = 60;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      lastX = x + dx * t;
      lastY = y + dy * t;
      dispatch("pointermove", lastX, lastY, 1);
      await wait(25, token);
    }
  } finally {
    dispatch("pointerup", lastX, lastY, 0);
  }
  await wait(300, token);
}
function resetCameraConstraints(): void {
  viewer.setEastWestRotationLocked(false);
  viewer.setNorthSouthRotationLocked(false);
  viewer.setKeepCameraNorthUp(false);
  viewer.setRotationSensitivity(1);
}
function setHealpixGridVisible(visible: boolean): void {
  if (viewer.isHealpixGridVisible() !== visible) viewer.toggleHealpixGrid();
}
function setEquatorialGridVisible(visible: boolean): void {
  if (viewer.isEquatorialGridVisible() !== visible)
    viewer.toggleEquatorialGrid();
}
async function reset(): Promise<void> {
  if (running) return;
  paused = false;
  setEquatorialGridVisible(false);
  setHealpixGridVisible(false);
  clearCatalogue();
  clearObservations();
  hideInteraction();
  resetCameraConstraints();
  viewer.resetAxesOrientation();
  viewer.goTo(83.633083, 22.0145);
  viewer.setFoV(65);
  if (layers.has("optical")) showOnly("optical");
  caption(
    "Opening",
    "AstroViewer",
    "Explore the sky across wavelengths.",
    "viewer.goTo(83.633083, 22.0145); viewer.setFoV(65)",
  );
  status.textContent = "Ready";
  controls();
}
type SceneNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
const initialScene = Number(new URLSearchParams(location.search).get("scene"));
const requestedScene: SceneNumber =
  Number.isInteger(initialScene) && initialScene >= 1 && initialScene <= 10
    ? (initialScene as SceneNumber)
    : 1;

async function runA00(startScene: SceneNumber = 1): Promise<void> {
  if (running) return;
  running = true;
  paused = false;
  const token = ++generation;
  controls();
  status.textContent = "Running A00";
  try {
    setEquatorialGridVisible(false);
    setHealpixGridVisible(false);
    clearCatalogue();
    clearObservations();
    hideInteraction();
    resetCameraConstraints();
    viewer.resetAxesOrientation();
    // Direct scene entry: establish the same baseline without replaying earlier scenes.
    const atM51 = startScene >= 3 && startScene !== 4;
    viewer.goTo(atM51 ? 202.469575 : 83.633083, atM51 ? 47.195258 : 22.0145);
    viewer.setFoV(
      startScene === 1 || startScene === 2
        ? 65
        : startScene <= 3
          ? 0.5
          : startScene === 4
            ? 2.5
            : startScene === 6
              ? 60
              : 5,
    );
    showOnly("optical");
    if (startScene === 5) setEquatorialGridVisible(true);
    if (startScene === 6) setHealpixGridVisible(true);
    if (startScene > 1) title.classList.remove("visible");
    if (startScene <= 1) {
      title.classList.add("visible");
      caption(
        "01 / Opening",
        "The astronomical sky",
        "A panoramic optical view of the celestial sphere.",
        "viewer.setActiveHiPS(dssColor)",
      );
      await wait(2700, token);
      title.classList.remove("visible");
    }
    if (startScene <= 2) {
      caption(
        "02 / Navigation",
        "Orion and the Crab Nebula",
        "Navigate and progressively refine the field of view.",
        "viewer.flyTo(83.633083, 22.0145, 2200)",
      );
      viewer.flyTo(83.633083, 22.0145, 2200);
      await wait(2400, token);
      await viewer.flyToFoV(5, 1800);
      await wait(900, token);
      caption(
        "02 / Navigation",
        "M51 — Whirlpool Galaxy",
        "Cross the sky and frame a galaxy with a precise FoV.",
        "viewer.flyTo(202.469575, 47.195258, 3000)",
      );
      viewer.flyTo(202.469575, 47.195258, 3000);
      await wait(3200, token);
      await viewer.flyToFoV(0.5, 2100);
      await wait(1100, token);
    }
    if (startScene <= 3) {
      caption(
        "03 / Multiwavelength",
        "Optical — DSS Color",
        "One sky position, multiple astronomical wavelengths.",
        surveys.optical.url,
      );
      await wait(1800, token);
      for (const key of ["ultraviolet", "infrared", "xray"] as const) {
        caption(
          "03 / Multiwavelength",
          surveys[key].name,
          "Comparing the same field across wavelengths.",
          surveys[key].url,
        );
        await fadeTo(key, token);
        await wait(1700, token);
      }
      caption(
        "03 / Multiwavelength",
        "Return to optical",
        "Complete the comparison in DSS Color.",
        "viewer.setActiveHiPS(dssColor)",
      );
      await fadeTo("optical", token);
      await wait(1200, token);
    }
    if (startScene <= 4) {
      // Three real, full-sky wavelength surveys at M42, simultaneously visible.
      // 2MASS and AllWISE use IRSA mirrors to avoid reliance on CDS tile hosts.
      const m42Ra = 83.8221;
      const m42Dec = -5.3911;
      setEquatorialGridVisible(false);
      setHealpixGridVisible(false);
      viewer.goTo(m42Ra, m42Dec);
      viewer.setFoV(2.5);
      showOnly("optical");
      caption(
        "04 / Three-layer compositing",
        "M42 — optical sky",
        "Start with DSS Color at full opacity over the Orion Nebula.",
        "viewer.setHiPSOpacity(optical, 1)",
      );
      await wait(1900, token);
      // Load both IR surveys before exposing them. Do not claim a layer is
      // visible if its HiPS metadata could not be loaded.
      const nir = await ensureLayer("nearinfrared");
      check(token);
      const mir = await ensureLayer("midinfrared");
      check(token);
      const optical = layers.get("optical")!;
      viewer.setActiveHiPS(mir);
      viewer.setHiPSOpacity(nir, 0);
      viewer.setHiPSOpacity(mir, 0);
      caption(
        "04 / Three-layer compositing",
        "Add 2MASS — near infrared",
        "Overlay J/H/K near-infrared observations without removing the optical sky.",
        "viewer.setHiPSOpacity(nearInfrared, 0.45)",
      );
      for (let i = 0; i <= 15; i++) {
        await wait(75, token);
        viewer.setHiPSOpacity(nir, (0.45 * i) / 15);
      }
      await wait(1500, token);
      caption(
        "04 / Three-layer compositing",
        "Add AllWISE — mid infrared",
        "Three wavelength regimes are now rendered together with independent opacity.",
        "viewer.setHiPSOpacity(midInfrared, 0.35)",
      );
      for (let i = 0; i <= 15; i++) {
        await wait(75, token);
        viewer.setHiPSOpacity(mir, (0.35 * i) / 15);
      }
      await wait(2200, token);
      caption(
        "04 / Three-layer compositing",
        "Rebalance the three layers",
        "Optical 35%, 2MASS 65%, AllWISE 55% — all visible simultaneously.",
        "viewer.setHiPSOpacity(optical, 0.35); viewer.setHiPSOpacity(nearInfrared, 0.65); viewer.setHiPSOpacity(midInfrared, 0.55)",
      );
      for (let i = 0; i <= 20; i++) {
        await wait(75, token);
        const t = i / 20;
        viewer.setHiPSOpacity(optical, 1 - 0.65 * t);
        viewer.setHiPSOpacity(nir, 0.45 + 0.2 * t);
        viewer.setHiPSOpacity(mir, 0.35 + 0.2 * t);
      }
      await wait(2300, token);
      caption(
        "04 / Three-layer compositing",
        "Return to optical",
        "Hide both infrared overlays and restore the DSS Color view.",
        "viewer.setHiPSOpacity(nearInfrared, 0); viewer.setHiPSOpacity(midInfrared, 0)",
      );
      showOnly("optical");
      await wait(1000, token);
      // Re-establish the next scene's M51 baseline (also for direct scene 05).
      viewer.goTo(202.469575, 47.195258);
      viewer.setFoV(0.5);
    }
    if (startScene <= 5) {
      caption(
        "05 / Coordinates",
        "Equatorial grid — RA / Dec",
        "Reveal the celestial coordinate system around M51.",
        "viewer.toggleEquatorialGrid()",
      );
      setEquatorialGridVisible(true);
      await wait(1200, token);
      caption(
        "05 / Coordinates",
        "Explore the equatorial grid",
        "Zoom out to 60° to reveal meridians and declination parallels.",
        "await viewer.flyToFoV(60, 3500)",
      );
      await viewer.flyToFoV(60, 3500);
      await wait(1200, token);
      // A10 camera controls, demonstrated against the visible equatorial grid.
      // Free movement on both axes, followed by axis-constrained rotations.
      try {
        caption(
          "05 / Camera controls",
          "Free camera rotation",
          "Drag diagonally to rotate the celestial sphere on both axes.",
          "viewer.setEastWestRotationLocked(false); viewer.setNorthSouthRotationLocked(false)",
        );
        await demonstrateCameraDrag(170, 100, token);
        await demonstrateCameraDrag(-170, -100, token);
        viewer.setEastWestRotationLocked(true);
        caption(
          "05 / Camera controls",
          "East–West rotation locked",
          "Drag vertically while East–West rotation is constrained.",
          "viewer.setEastWestRotationLocked(true)",
        );
        await demonstrateCameraDrag(0, 140, token);
        await demonstrateCameraDrag(0, -140, token);
        viewer.setEastWestRotationLocked(false);
        viewer.setNorthSouthRotationLocked(true);
        caption(
          "05 / Camera controls",
          "North–South rotation locked",
          "Drag horizontally while North–South rotation is constrained.",
          "viewer.setNorthSouthRotationLocked(true)",
        );
        await demonstrateCameraDrag(170, 0, token);
        await demonstrateCameraDrag(-170, 0, token);
      } finally {
        resetCameraConstraints();
        viewer.resetAxesOrientation();
        viewer.goTo(202.469575, 47.195258);
        viewer.setFoV(60);
      }
      await wait(800, token);
      caption(
        "05 / Coordinates",
        "Hide coordinate grid",
        "Return to the unobstructed optical view.",
        "viewer.toggleEquatorialGrid()",
      );
      setEquatorialGridVisible(false);
      await wait(1200, token);
    }
    if (startScene <= 6) {
      // A03 HEALPix grid, independent from the equatorial grid and catalogues.
      setEquatorialGridVisible(false);
      viewer.goTo(202.469575, 47.195258);
      viewer.setFoV(60);
      caption(
        "06 / HEALPix grid",
        "HEALPix sky pixelisation",
        "Display the hierarchical HEALPix grid used to organise HiPS sky tiles.",
        "viewer.toggleHealpixGrid()",
      );
      setHealpixGridVisible(true);
      await wait(2000, token);
      caption(
        "06 / HEALPix grid",
        "Zoom in",
        "Zoom towards M51 to reveal the changing HEALPix tessellation.",
        "await viewer.flyToFoV(5, 2600)",
      );
      await viewer.flyToFoV(5, 2600);
      await wait(1400, token);
      caption(
        "06 / HEALPix grid",
        "Zoom out",
        "Return to the wider sky while keeping the HEALPix grid visible.",
        "await viewer.flyToFoV(60, 2600)",
      );
      await viewer.flyToFoV(60, 2600);
      await wait(1500, token);
      caption(
        "06 / HEALPix grid",
        "Hide HEALPix grid",
        "Remove the grid before the scientific overlays.",
        "viewer.toggleHealpixGrid()",
      );
      setHealpixGridVisible(false);
      await wait(900, token);
    }
    if (startScene <= 7) {
      caption(
        "07 / Catalogues",
        "Hubble Source Catalog",
        "Return to M51 and display 40 HSC sources from the local A04 scientific fixture.",
        "viewer.createCatalogue(...); viewer.showCatalogue(catalogue)",
      );
      viewer.flyTo(202.469575, 47.195258, 2600);
      await wait(2800, token);
      await viewer.flyToFoV(0.25, 2600);
      await wait(600, token);
      const hsc = await showHscCatalogue();
      // Demonstrate the catalogue colour API before source interactions.
      for (const color of ["#ffb347", "#a78bfa", INTERACTION_COLOR]) {
        caption(
          "07 / Catalogues",
          "Catalogue colour",
          "Change the HSC marker colour while preserving the scientific data.",
          "viewer.changeCatalogueColor(catalogue, color)",
        );
        viewer.changeCatalogueColor(hsc.catalogue, color);
        displayColor = color;
        setLegend("catalogue", "normal");
        await wait(900, token);
      }
      // Scientific styling from actual HSC columns: flux is a magnitude (mag),
      // and ci is the normalized concentration index. flux_sigma is constant here.
      caption(
        "07 / Catalogues",
        "Photometric magnitude",
        "Map the HSC flux (magnitude, mag) column to marker brightness.",
        "viewer.setCatalogueShapeHue(catalogue, 'flux')",
      );
      viewer.setCatalogueShapeHue(hsc.catalogue, "flux");
      await wait(1900, token);
      caption(
        "07 / Catalogues",
        "Source concentration",
        "Map the HSC concentration index (ci) to marker size (8–20 px).",
        "viewer.setCatalogueShapeSize(catalogue, 'ci')",
      );
      viewer.setCatalogueShapeSize(hsc.catalogue, "ci");
      await wait(2100, token);
      pointerPosition = {
        x: canvas.clientWidth * 0.68,
        y: canvas.clientHeight * 0.26,
      };
      placeDemoPointer(pointerPosition.x, pointerPosition.y);
      demoPointer.hidden = false;
      demoPointer.style.display = "block";
      await wait(1500, token);
      // Frame the complete interaction field once; never rotate the camera per source.
      const hscTargets = spaced(
        hsc.catalogue.sources,
        (source) => requireScreenPoint(source.point),
        4,
      );
      for (let i = 0; i < hscTargets.length; i++) {
        const source = hscTargets[i];
        const selecting = i < 2;
        caption(
          "07 / Catalogues",
          selecting ? `HSC selection ${i + 1}/2` : `HSC hover ${i - 1}/2`,
          selecting
            ? "Hover the source, then preserve its selection."
            : "Hover temporarily without changing the existing selection.",
          selecting
            ? "catalogue.extAddSources2Selected(source)"
            : "catalogue.extHighlightSource(source, true)",
        );
        await animatePointer(requireScreenPoint(source.point), token);
        hsc.catalogue.extHighlightSource(source, true);
        setLegend("catalogue", "hover");
        await wait(1150, token);
        if (selecting) {
          hsc.catalogue.extAddSources2Selected(source);
          setLegend("catalogue", "selected");
          await wait(1050, token);
        }
        hsc.catalogue.extHighlightSource(source, false);
        movePointerAway();
        await wait(450, token);
      }

      setLegend("catalogue", "selected");
      await wait(1800, token);
      hideInteraction();
      caption(
        "07 / Catalogues",
        "Hide catalogue",
        "Remove the HSC overlay before showing HST observation footprints.",
        "viewer.deleteCatalogue(catalogue)",
      );
      clearCatalogue();
      await wait(700, token);
    }
    if (startScene <= 8) {
      caption(
        "08 / Observations",
        "Hubble observation coverage",
        "Display HST observation footprints around M51 using STC-S geometry.",
        "viewer.createFootprintSet(...); viewer.showFootprintSet(footprints)",
      );
      // Only initialise the camera when opening scene 07 directly.
      // During continuous playback, preserve the catalogue camera view.
      if (startScene === 8) {
        viewer.flyTo(202.469575, 47.195258, 2300);
        await wait(2500, token);
        await viewer.flyToFoV(0.5, 2100);
      }
      const hst = await showHstObservations();
      // Demonstrate footprint colours independently of catalogue styling.
      for (const color of ["#ffb347", "#a78bfa", INTERACTION_COLOR]) {
        caption(
          "08 / Observations",
          "Footprint colour",
          "Change the HST observation outline and update the interaction legend.",
          "viewer.changeFootprintSetColor(footprints, color)",
        );
        viewer.changeFootprintSetColor(hst.set, color);
        displayColor = color;
        setLegend("footprint", "normal");
        await wait(900, token);
      }
      pointerPosition = {
        x: canvas.clientWidth * 0.68,
        y: canvas.clientHeight * 0.26,
      };
      placeDemoPointer(pointerPosition.x, pointerPosition.y);
      demoPointer.hidden = false;
      demoPointer.style.display = "block";
      await wait(1600, token);
      const targets = spaced(
        hst.set.footprintPolygons.filter((f) => f.valid),
        (f) => footprintScreenPoint(f),
        4,
      );
      for (let i = 0; i < targets.length; i++) {
        const footprint = targets[i];
        caption(
          "08 / Observations",
          `HST footprint ${i + 1}/4`,
          "Move the pointer to hover; add the footprint to the persistent multi-selection.",
          "footprints.extAddPolygons2Selected(footprint)",
        );
        await animatePointer(footprintScreenPoint(footprint), token);
        hst.set.extHighlightFootprint(footprint, true);
        setLegend("footprint", "hover");
        await wait(1150, token);
        hst.set.extAddPolygons2Selected(footprint);
        hst.set.extHighlightFootprint(footprint, false);
        movePointerAway();
        setLegend("footprint", "selected");
        await wait(1350, token);
      }

      await wait(2300, token);
      hideInteraction();
      caption(
        "08 / Observations",
        "Restore optical sky",
        "Remove the observation overlay and finish the showcase.",
        "viewer.deleteFootprintSet(footprints)",
      );
      clearObservations();
      await viewer.flyToFoV(5, 1800);
      await wait(700, token);
    }
    if (startScene <= 9) {
      // 08 — Scientific View State (A07): capture, navigate, restore.
      caption(
        "09 / View state",
        "Save the M51 view",
        "Frame M51 and capture the astronomical viewing state.",
        "viewer.getCurrentAstroViewerStatus()",
      );
      viewer.flyTo(202.469575, 47.195258, 1800);
      await wait(2000, token);
      await viewer.flyToFoV(0.5, 1500);
      check(token);
      const savedView = viewer.getCurrentAstroViewerStatus();
      if (!savedView) {
        throw new Error(
          "Cannot save astronomical state: camera state unavailable",
        );
      }
      await showStateToast("STATE SAVED", token);
      caption(
        "09 / View state",
        "Navigate to Orion",
        "Leave the saved view and change the field of view.",
        "viewer.flyTo(83.633083, 22.0145, 2300)",
      );
      viewer.flyTo(83.633083, 22.0145, 2300);
      await wait(2500, token);
      await viewer.flyToFoV(5, 1400);
      await wait(1200, token);

      caption(
        "09 / View state",
        "Restore M51",
        "Restore the previously saved astronomical state.",
        "viewer.restoreAstroViewerState(savedView, false)",
      );
      viewer.restoreAstroViewerState(savedView, false);
      await wait(700, token);
      await showStateToast("STATE RESTORED", token);
      await wait(900, token);
    }
    if (startScene <= 10) {
      // Herschel SPIRE 250 µm supports PNG and FITS tiles.
      // Keep the camera fixed to make the FITS processing comparison meaningful.
      const herschel = await ensureLayer("herschelfits");
      check(token);
      viewer.goTo(83.8221, -5.3911);
      viewer.setFoV(2.5);
      showOnly("herschelfits");
      viewer.changeHiPSFormat("png");
      caption(
        "10 / FITS scientific visualization",
        "Herschel SPIRE 250 µm — PNG",
        "Start with the image tiles of the same far-infrared survey.",
        'viewer.changeHiPSFormat("png")',
      );
      await wait(2400, token);
      viewer.changeHiPSFormat("fits");
      viewer.changeColorMap("grayscale");
      viewer.setHiPSFITSScaleFunction("linear");
      viewer.setHiPSFITSRangeMode("robust");
      caption(
        "10 / FITS — scientific pixel values",
        "FITS — linear grayscale",
        "Unlike pre-rendered PNG tiles, FITS contains numerical intensity measurements. Linear stretch maps equal intensity differences to equal display steps; robust limits reduce the impact of extremes.",
        'viewer.changeHiPSFormat("fits"); viewer.setHiPSFITSScaleFunction("linear")',
      );
      await wait(3800, token);
      // Color maps change the display palette, not the FITS measurements.
      const colorMaps = [
        { name: "planck", description: "A false-color palette emphasizes contrasts in far-infrared emission. The FITS pixel values remain unchanged." },
        { name: "cubehelix", description: "A different intensity-to-color mapping reveals the same structures with another visual progression; no scientific values are altered." },
        { name: "hot", description: "Dark-to-bright warm colors highlight strong emission. This is visualization, not a temperature measurement." },
      ] as const;
      for (const map of colorMaps) {
        viewer.changeColorMap(map.name);
        caption(
          "10 / FITS — color mapping",
          `Color map — ${map.name}`,
          map.description,
          `viewer.changeColorMap("${map.name}")`,
        );
        await wait(3500, token);
      }
      // Stretch changes the intensity transformation; keep the palette fixed.
      viewer.changeColorMap("planck");
      const stretches = [
        { name: "sqrt", description: "Square-root stretch expands the lower end of the intensity scale, making faint emission easier to distinguish." },
        { name: "log", description: "Logarithmic stretch compresses a wide dynamic range so faint and bright structures can be seen together." },
        { name: "asinh", description: "Inverse-hyperbolic-sine stretch is nearly linear near zero and compresses brighter values, balancing faint detail and bright regions." },
        { name: "linear", description: "Return to linear scaling: equal changes in measured intensity produce equal steps along the color map." },
      ] as const;
      for (const stretch of stretches) {
        viewer.setHiPSFITSScaleFunction(stretch.name);
        caption(
          "10 / FITS — intensity stretch",
          `Intensity stretch — ${stretch.name}`,
          stretch.description,
          `viewer.setHiPSFITSScaleFunction("${stretch.name}")`,
        );
        await wait(3700, token);
      }
      // Per-tile ranges can create visible discontinuities at tile boundaries.
      const ranges = [
        { name: "hips", description: "Use the survey's shared HiPS intensity limits to preserve a consistent display scale across neighboring tiles." },
        { name: "robust", description: "Use robust contrast limits to reduce the influence of extreme intensities and reveal more of the diffuse emission." },
      ] as const;
      for (const range of ranges) {
        viewer.setHiPSFITSRangeMode(range.name);
        caption(
          "10 / FITS — intensity range",
          range.name === "hips" ? "Range — HiPS global limits" : "Range — robust contrast",
          range.description,
          `viewer.setHiPSFITSRangeMode("${range.name}")`,
        );
        await wait(4200, token);
      }
      viewer.changeHiPSFormat("png");
      showOnly("optical");
      viewer.changeColorMap("native");
      caption(
        "10 / FITS scientific visualization",
        "Return to DSS Color",
        "Restore the optical survey after the FITS demonstration.",
        "viewer.setActiveHiPS(optical)",
      );
      await wait(1200, token);
    }
    status.textContent = "A00 complete";
  } catch (error) {
    if (token === generation) {
      console.error("A00 sequence failed", error);
      setEquatorialGridVisible(false);
      setHealpixGridVisible(false);
      clearObservations();
      hideInteraction();
      status.textContent = "A00 failed";
    }
  } finally {
    running = false;
    paused = false;
    title.classList.remove("visible");
    controls();
  }
}
runButton.addEventListener("click", () => {
  void runA00(requestedScene);
});
// Keyboard shortcuts run from a clean scene-specific baseline.
document.addEventListener("keydown", (event) => {
  if (
    mode === "video" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.repeat
  )
    return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    if (running) pauseButton.click();
    return;
  }
  if (event.code === "Escape") {
    if (!running) void reset();
    return;
  }
  const number = Number(event.key);
  if (Number.isInteger(number) && number >= 1 && number <= 9 && !running) {
    void runA00(number as SceneNumber);
  }
});
pauseButton.addEventListener("click", () => {
  paused = !paused;
  status.textContent = paused ? "Paused" : "Running A00";
  controls();
});
resetButton.addEventListener("click", () => {
  void reset();
});
window.astroViewerDemo = { viewer, ready: false, mode, runA00, reset };
void ensureLayer("optical")
  .then(() => {
    showOnly("optical");
    return reset();
  })
  .then(() => {
    window.astroViewerDemo!.ready = true;
    if (new URLSearchParams(location.search).has("scene"))
      void runA00(requestedScene);
  })
  .catch((error) => {
    console.error("A00 optical survey failed", error);
    status.textContent = "Survey load failed";
  });
