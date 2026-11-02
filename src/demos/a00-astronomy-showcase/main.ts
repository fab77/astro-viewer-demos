/// <reference path="../../demo-window.d.ts" />
import { AstroViewer, ColumnType, MetadataColumn, MetadataManager, type CatalogueGL, type FootprintSetGL, type Footprint, type HiPS, type Source } from "astro-viewer";

type SurveyKey = "optical" | "ultraviolet" | "infrared" | "xray";
const surveys: Record<SurveyKey, { name: string; url: string }> = {
  optical: { name: "DSS Color — Optical", url: "https://cdn.skies.esac.esa.int/DSSColor/" },
  ultraviolet: { name: "GALEX Color — Ultraviolet", url: "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor" },
  infrared: { name: "Herschel SPIRE 250 µm — Far infrared", url: "https://skies.esac.esa.int/Herschel/SPIRE250/" },
  xray: { name: "Chandra — X-ray", url: "https://cdaftp.cfa.harvard.edu/cxc-hips/" },
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
const mode = new URLSearchParams(location.search).get("mode") === "video" ? "video" : "interactive";
get<HTMLElement>("controls").hidden = mode === "video";
const viewer = new AstroViewer(canvas, { gridLabelContainers: { coords: get<HTMLDivElement>("coords-grid-labels") } });
viewer.run();
const layers = new Map<SurveyKey, HiPS>();
let running = false;
let paused = false;
let generation = 0;
let activeKey: SurveyKey | null = null;
let catalogue: CatalogueGL | null = null;
type HscFixture = { name: string; description: string; source: string; center: {ra:number;dec:number}; mapping: {ra:string;dec:string;name:string}; columns: Array<{name:string;numeric?:boolean;unit?:string;description?:string}>; rows: Array<Array<string|number>> };
let hscFixture: HscFixture | null = null;
function clearCatalogue(): void {
  if (!catalogue) return;
  catalogue.clearSelection();
  viewer.deleteCatalogue(catalogue);
  catalogue = null;
}
async function showHscCatalogue(): Promise<{ catalogue: CatalogueGL; source: Source; ra: number; dec: number; label: string }> {
  if (!hscFixture) {
    const response = await fetch("./hsc_m51_sources.json");
    if (!response.ok) throw new Error(`HSC fixture unavailable: ${response.status}`);
    hscFixture = await response.json() as HscFixture;
  }
  const data = hscFixture;
  if (!data.rows.length) throw new Error("HSC fixture has no sources");
  const columns = data.columns.map((column, index) => new MetadataColumn({
    index, name: column.name,
    columnType: column.name === data.mapping.ra ? ColumnType.GEOM_RA : column.name === data.mapping.dec ? ColumnType.GEOM_DEC : column.name === data.mapping.name ? ColumnType.MAIN_NAME : column.numeric ? ColumnType.NUMBER : ColumnType.STRING,
    unit: column.unit ?? "", description: column.description ?? "",
  }));
  const created = viewer.createCatalogue(data.name, data.description, data.source, new MetadataManager(columns));
  created.addSources(data.rows, columns);
  viewer.showCatalogue(created);
  catalogue = created;
  const raIndex = data.columns.findIndex(c => c.name === data.mapping.ra);
  const decIndex = data.columns.findIndex(c => c.name === data.mapping.dec);
  const nameIndex = data.columns.findIndex(c => c.name === data.mapping.name);
  const cosDec = Math.cos(data.center.dec * Math.PI / 180);
  let best = 0;
  let distance = Infinity;
  data.rows.forEach((row, i) => {
    const dra = (Number(row[raIndex]) - data.center.ra) * cosDec;
    const ddec = Number(row[decIndex]) - data.center.dec;
    const d = dra * dra + ddec * ddec;
    if (d < distance) { distance = d; best = i; }
  });
  const source = created.sources[best];
  if (!source) throw new Error("HSC focus source unavailable");
  return { catalogue: created, source, ra: Number(data.rows[best][raIndex]), dec: Number(data.rows[best][decIndex]), label: String(data.rows[best][nameIndex]) };
}
type HstFixture = {
  name: string; description: string; source: string;
  mapping: { ra: string; dec: string; name: string; footprint: string };
  columns: Array<{ name: string; numeric?: boolean; unit?: string; description?: string }>;
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
async function showHstObservations(): Promise<{ set: FootprintSetGL; focus: Footprint; ra: number; dec: number }> {
  if (!hstFixture) {
    const response = await fetch("./hst_m51_observations.json");
    if (!response.ok) throw new Error(`HST fixture unavailable: ${response.status}`);
    hstFixture = await response.json() as HstFixture;
  }
  const data = hstFixture;
  if (!data.rows.length) throw new Error("HST fixture has no observations");
  const columns = data.columns.map((column, index) => new MetadataColumn({
    index, name: column.name,
    columnType: column.name === data.mapping.ra ? ColumnType.GEOM_RA
      : column.name === data.mapping.dec ? ColumnType.GEOM_DEC
      : column.name === data.mapping.footprint ? ColumnType.GEOM_FOOTPRINT
      : column.name === data.mapping.name ? ColumnType.MAIN_NAME
      : column.numeric ? ColumnType.NUMBER : ColumnType.STRING,
    unit: column.unit ?? "", description: column.description ?? "",
  }));
  const set = viewer.createFootprintSet(data.name, data.description, data.source, new MetadataManager(columns));
  set.addFootprints(data.rows, columns);
  viewer.showFootprintSet(set);
  observationSet = set;
  const focus = set.footprintPolygons.find(footprint => footprint.valid);
  if (!focus) throw new Error("No valid HST observation footprint");
  const row = focus.details as unknown as Array<string | number>;
  const raIndex = data.columns.findIndex(column => column.name === data.mapping.ra);
  const decIndex = data.columns.findIndex(column => column.name === data.mapping.dec);
  const ra = Number(row[raIndex]);
  const dec = Number(row[decIndex]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) throw new Error("Invalid HST observation coordinates");
  return { set, focus, ra, dec };
}
const INTERACTION_COLOR = "#00d4ff";
const legend = get<HTMLElement>("interaction-legend");
const demoPointer = get<HTMLElement>("demo-pointer");
// Keep the demonstration cursor in viewport coordinates, outside canvas/WebGL stacking contexts.
document.body.appendChild(demoPointer);
function placeDemoPointer(x: number, y: number): void {
  const rect = canvas.getBoundingClientRect();
  demoPointer.style.left = `${rect.left + x}px`;
  demoPointer.style.top = `${rect.top + y}px`;
}
function setLegend(kind: "catalogue" | "footprint", state: "normal" | "hover" | "selected"): void {
  legend.hidden = false;
  const hex = INTERACTION_COLOR.slice(1);
  const base = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
  const target = luminance < 0.55 ? 1 : 0;
  const mix = (amount: number) => `rgb(${base.map(v => Math.round((v + (target - v) * amount) * 255)).join(", ")})`;
  legend.style.setProperty("--base", INTERACTION_COLOR);
  // CatalogueGL currently uses the complementary colour for BOTH states.
  // FootprintSetGL uses interactionColorsFromHex (45% / 75%).
  const complement = `rgb(${base.map(v => Math.round((1 - v) * 255)).join(", ")})`;
  legend.style.setProperty("--hover", kind === "catalogue" ? complement : mix(0.45));
  legend.style.setProperty("--selected", kind === "catalogue" ? complement : mix(0.75));
  legend.dataset.kind = kind;
  legend.title = kind === "catalogue"
    ? "CatalogueGL uses the same complementary colour for hover and selected; selection is persistent."
    : "FootprintSetGL uses different hover and selected contrast colours.";
  legend.querySelector<HTMLElement>(".legend-title")!.textContent = kind === "catalogue" ? "HSC source interaction" : "HST footprint interaction";
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
  canvas.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: rect.left + x, clientY: rect.top + y }));
  canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, pointerType: "mouse", clientX: rect.left + x, clientY: rect.top + y }));
}
let pointerPosition = { x: 55, y: 70 };
async function animatePointer(target: {x:number;y:number}, token: number): Promise<void> {
  const from = pointerPosition;
  demoPointer.hidden = false;
  demoPointer.style.display = "block";
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, smooth = t * t * (3 - 2 * t);
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
type CameraMatrices = { vMatrix: Float32Array; pMatrix: Float32Array; mMatrix: Float32Array };
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
  return [0, 1, 2, 3].map(row =>
    m[row] * v[0] + m[4 + row] * v[1] + m[8 + row] * v[2] + m[12 + row] * v[3]);
}
function pointToScreen(point: { x: number; y: number; z: number }): { x: number; y: number } | null {
  if (!cameraMatrices) return null;
  const { mMatrix, vMatrix, pMatrix } = cameraMatrices;
  const model = multiplyMatVec(mMatrix, [point.x, point.y, point.z, 1]);
  const view = multiplyMatVec(vMatrix, model);
  const clip = multiplyMatVec(pMatrix, view);
  if (clip[3] <= 0) return null;
  const ndcX = clip[0] / clip[3], ndcY = clip[1] / clip[3];
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return { x: (ndcX * .5 + .5) * canvas.clientWidth,
           y: (1 - (ndcY * .5 + .5)) * canvas.clientHeight };
}
function requireScreenPoint(point: { x: number; y: number; z: number }): { x: number; y: number } {
  const projected = pointToScreen(point);
  if (!projected) throw new Error("Camera matrices unavailable or target behind camera");
  return projected;
}
function footprintScreenPoint(footprint: Footprint): { x: number; y: number } {
  // HST fixture uses compact convex STC-S polygons. Average vertices in 3D
  // to pick a point inside the footprint rather than the observation RA/Dec.
  const ring = footprint.polygons.find(points => points.length >= 3);
  if (!ring) throw new Error("Footprint has no polygon vertices");
  const centroid = ring.reduce((acc, p) => ({x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z}), {x:0,y:0,z:0});
  const length = Math.hypot(centroid.x, centroid.y, centroid.z);
  if (!length) throw new Error("Degenerate footprint centroid");
  return requireScreenPoint({x: centroid.x / length, y: centroid.y / length, z: centroid.z / length});
}
function onScreen(p: {x:number;y:number}, margin = 70): boolean {
  return p.x >= margin && p.y >= margin && p.x <= canvas.clientWidth - margin && p.y <= canvas.clientHeight - margin;
}
function spaced<T>(items: T[], position: (item:T)=>{x:number;y:number}, count:number): T[] {
  const available = items.filter(item => onScreen(position(item)));
  if (available.length < count) throw new Error(`Only ${available.length} targets visible; need ${count}`);
  const chosen: T[] = [available[0]];
  while (chosen.length < count) {
    const remaining = available.filter(item => !chosen.includes(item));
    chosen.push(remaining.reduce((best, candidate) => {
      const separation = (item:T) => Math.min(...chosen.map(existing => {
        const a = position(item), b = position(existing);
        return (a.x-b.x)**2+(a.y-b.y)**2;
      }));
      return separation(candidate) > separation(best) ? candidate : best;
    }));
  }
  return chosen;
}
function footprintPosition(footprint: Footprint): { ra: number; dec: number } {
  if (!hstFixture) throw new Error("HST fixture unavailable");
  const row = footprint.details as unknown as Array<string | number>;
  const ra = Number(row[hstFixture.columns.findIndex(c => c.name === hstFixture!.mapping.ra)]);
  const dec = Number(row[hstFixture.columns.findIndex(c => c.name === hstFixture!.mapping.dec)]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) throw new Error("Invalid footprint position");
  return { ra, dec };
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const check = (token: number) => { if (token !== generation) throw new Error("Sequence cancelled"); };
async function wait(ms: number, token: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms;) {
    check(token);
    if (paused) { await sleep(50); continue; }
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
  position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
  zIndex: "10000", padding: "18px 32px", borderRadius: "12px",
  background: "rgba(10, 18, 30, 0.88)", color: "#fff",
  font: "600 22px system-ui, sans-serif", letterSpacing: "0.12em",
  boxShadow: "0 12px 36px rgba(0, 0, 0, 0.35)",
  pointerEvents: "none", opacity: "0", transition: "opacity 250ms ease",
});
document.body.appendChild(stateToast);
async function showStateToast(message: string, token: number): Promise<void> {
  stateToast.textContent = message;
  stateToast.style.opacity = "1";
  try { await wait(1500, token); }
  finally { stateToast.style.opacity = "0"; }
}

function caption(scene: string, headline: string, detail: string, api: string): void {
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
  for (const [id, layer] of layers) viewer.setHiPSOpacity(layer, id === key ? 1 : 0);
  viewer.setActiveHiPS(active);
  activeKey = key;
}
async function fadeTo(key: SurveyKey, token: number): Promise<boolean> {
  const previous = activeKey;
  let next: HiPS;
  try { next = await ensureLayer(key); }
  catch (error) {
    console.warn(`A00: ${surveys[key].name} unavailable`, error);
    caption("Multiwavelength", "Survey unavailable", `${surveys[key].name} could not be loaded.`, surveys[key].url);
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
    if (previous && previous !== key) viewer.setHiPSOpacity(layers.get(previous)!, 1 - i / 25);
  }
  showOnly(key);
  return true;
}
function setEquatorialGridVisible(visible: boolean): void {
  if (viewer.isEquatorialGridVisible() !== visible) viewer.toggleEquatorialGrid();
}
async function reset(): Promise<void> {
  if (running) return;
  paused = false;
  setEquatorialGridVisible(false);
  clearCatalogue();
  clearObservations();
  hideInteraction();
  viewer.resetAxesOrientation();
  viewer.goTo(83.633083, 22.0145);
  viewer.setFoV(65);
  if (layers.has("optical")) showOnly("optical");
  caption("Opening", "AstroViewer", "Explore the sky across wavelengths.", "viewer.goTo(83.633083, 22.0145); viewer.setFoV(65)");
  status.textContent = "Ready";
  controls();
}
async function runA00(): Promise<void> {
  if (running) return;
  running = true;
  paused = false;
  const token = ++generation;
  controls();
  status.textContent = "Running A00";
  try {
    setEquatorialGridVisible(false);
    clearCatalogue();
    clearObservations();
    hideInteraction();
    viewer.resetAxesOrientation();
    viewer.goTo(83.633083, 22.0145);
    viewer.setFoV(65);
    showOnly("optical");
    title.classList.add("visible");
    caption("01 / Opening", "The astronomical sky", "A panoramic optical view of the celestial sphere.", "viewer.setActiveHiPS(dssColor)");
    await wait(2700, token);
    title.classList.remove("visible");
    caption("02 / Navigation", "Orion and the Crab Nebula", "Navigate and progressively refine the field of view.", "viewer.flyTo(83.633083, 22.0145, 2200)");
    viewer.flyTo(83.633083, 22.0145, 2200);
    await wait(2400, token);
    await viewer.flyToFoV(5, 1800);
    await wait(900, token);
    caption("02 / Navigation", "M51 — Whirlpool Galaxy", "Cross the sky and frame a galaxy with a precise FoV.", "viewer.flyTo(202.469575, 47.195258, 3000)");
    viewer.flyTo(202.469575, 47.195258, 3000);
    await wait(3200, token);
    await viewer.flyToFoV(0.5, 2100);
    await wait(1100, token);
    caption("03 / Multiwavelength", "Optical — DSS Color", "One sky position, multiple astronomical wavelengths.", surveys.optical.url);
    await wait(1800, token);
    for (const key of ["ultraviolet", "infrared", "xray"] as const) {
      caption("03 / Multiwavelength", surveys[key].name, "Comparing the same field across wavelengths.", surveys[key].url);
      await fadeTo(key, token);
      await wait(1700, token);
    }
    caption("03 / Multiwavelength", "Return to optical", "Complete the comparison in DSS Color.", "viewer.setActiveHiPS(dssColor)");
    await fadeTo("optical", token);
    await wait(1200, token);
    caption("04 / Coordinates", "Equatorial grid — RA / Dec", "Reveal the celestial coordinate system around M51.", "viewer.toggleEquatorialGrid()");
    setEquatorialGridVisible(true);
    await wait(1200, token);
    caption("04 / Coordinates", "Explore the equatorial grid", "Zoom out to 60° to reveal meridians and declination parallels.", "await viewer.flyToFoV(60, 3500)");
    await viewer.flyToFoV(60, 3500);
    await wait(4000, token);
    caption("04 / Coordinates", "Hide coordinate grid", "Return to the unobstructed optical view.", "viewer.toggleEquatorialGrid()");
    setEquatorialGridVisible(false);
    await wait(1200, token);
    caption("05 / Catalogues", "Hubble Source Catalog", "Return to M51 and display 40 HSC sources from the local A04 scientific fixture.", "viewer.createCatalogue(...); viewer.showCatalogue(catalogue)");
    viewer.flyTo(202.469575, 47.195258, 2600);
    await wait(2800, token);
    await viewer.flyToFoV(0.25, 2600);
    await wait(600, token);
    const hsc = await showHscCatalogue();
    viewer.changeCatalogueColor(hsc.catalogue, INTERACTION_COLOR);
    setLegend("catalogue", "normal");
    pointerPosition = { x: canvas.clientWidth * 0.68, y: canvas.clientHeight * 0.26 };
    placeDemoPointer(pointerPosition.x, pointerPosition.y);
    demoPointer.hidden = false;
    demoPointer.style.display = "block";
    await wait(1500, token);
    // Frame the complete interaction field once; never rotate the camera per source.
    const hscTargets = spaced(hsc.catalogue.sources,
      source => requireScreenPoint(source.point), 4);
    for (let i = 0; i < hscTargets.length; i++) {
      const source = hscTargets[i];
      const selecting = i < 2;
      caption("05 / Catalogues", selecting ? `HSC selection ${i + 1}/2` : `HSC hover ${i - 1}/2`,
        selecting ? "Hover the source, then preserve its selection." : "Hover temporarily without changing the existing selection.",
        selecting ? "catalogue.extAddSources2Selected(source)" : "catalogue.extHighlightSource(source, true)");
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
    caption("05 / Catalogues", "Restore optical sky", "Remove the catalogue overlay and return to the panoramic optical view.", "viewer.deleteCatalogue(catalogue)");
    clearCatalogue();
    await viewer.flyToFoV(5, 1800);
    await wait(700, token);
    caption("06 / Observations", "Hubble observation coverage", "Display HST observation footprints around M51 using STC-S geometry.", "viewer.createFootprintSet(...); viewer.showFootprintSet(footprints)");
    viewer.flyTo(202.469575, 47.195258, 2300);
    await wait(2500, token);
    await viewer.flyToFoV(0.5, 2100);
    const hst = await showHstObservations();
    viewer.changeFootprintSetColor(hst.set, INTERACTION_COLOR);
    setLegend("footprint", "normal");
    pointerPosition = { x: canvas.clientWidth * 0.68, y: canvas.clientHeight * 0.26 };
    placeDemoPointer(pointerPosition.x, pointerPosition.y);
    demoPointer.hidden = false;
    demoPointer.style.display = "block";
    await wait(1600, token);
    const targets = spaced(hst.set.footprintPolygons.filter(f => f.valid),
      f => footprintScreenPoint(f), 4);
    for (let i = 0; i < targets.length; i++) {
      const footprint = targets[i];
      caption("06 / Observations", `HST footprint ${i + 1}/4`,
        "Move the pointer to hover; add the footprint to the persistent multi-selection.",
        "footprints.extAddPolygons2Selected(footprint)");
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
    caption("06 / Observations", "Restore optical sky", "Remove the observation overlay and finish the showcase.", "viewer.deleteFootprintSet(footprints)");
    clearObservations();
    await viewer.flyToFoV(5, 1800);
    await wait(700, token);

    // 07 — Scientific View State (A07): capture, navigate, restore.
    caption("07 / View state", "Save the M51 view", "Frame M51 and capture the astronomical viewing state.", "viewer.getCurrentAstroViewerStatus()");
    viewer.flyTo(202.469575, 47.195258, 1800);
    await wait(2000, token);
    await viewer.flyToFoV(0.5, 1500);
    check(token);
    const savedView = viewer.getCurrentAstroViewerStatus();
    await showStateToast("STATE SAVED", token);

    caption("07 / View state", "Navigate to Orion", "Leave the saved view and change the field of view.", "viewer.flyTo(83.633083, 22.0145, 2300)");
    viewer.flyTo(83.633083, 22.0145, 2300);
    await wait(2500, token);
    await viewer.flyToFoV(5, 1400);
    await wait(1200, token);

    caption("07 / View state", "Restore M51", "Restore the previously saved astronomical state.", "viewer.restoreAstroViewerState(savedView, false)");
    viewer.restoreAstroViewerState(savedView, false);
    await wait(700, token);
    await showStateToast("STATE RESTORED", token);
    await wait(900, token);
    status.textContent = "A00 complete";
  } catch (error) {
    if (token === generation) {
      console.error("A00 sequence failed", error);
      setEquatorialGridVisible(false);
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
runButton.addEventListener("click", () => { void runA00(); });
pauseButton.addEventListener("click", () => {
  paused = !paused;
  status.textContent = paused ? "Paused" : "Running A00";
  controls();
});
resetButton.addEventListener("click", () => { void reset(); });
window.astroViewerDemo = { viewer, ready: false, mode, runA00, reset };
void ensureLayer("optical").then(() => {
  showOnly("optical");
  return reset();
}).then(() => {
  window.astroViewerDemo!.ready = true;
}).catch(error => {
  console.error("A00 optical survey failed", error);
  status.textContent = "Survey load failed";
});
