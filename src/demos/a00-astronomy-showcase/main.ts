/// <reference path="../../demo-window.d.ts" />
import {
  AstroViewer,
  createColorMapFromSamples,
  ColumnType,
  MetadataColumn,
  MetadataManager,
  type ColorMapName,
  type CatalogueGL,
  type FootprintSetGL,
  type Footprint,
  type HiPS,
  type Source,
} from "astro-viewer";
import { FetchHttpTransport } from "astrospatial-services";
import {
  TapService,
  parseVOTable,
  parseTapCsvTable,
} from "astrospatial-services/astronomy/tap";
import csvUrl from "./hsc_m51_sources.csv?url";
import hscUrl from "./hsc_m51_sources.json?url";
import hstUrl from "./hst_m51_observations.json?url";
import m101Url from "./hsc_m101_sources.json?url";

type SurveyKey =
  | "hstimage"
  | "radio"
  | "nuv"
  | "fuv"
  | "gamma"
  | "planck"
  | "sdss"
  | "optical"
  | "ultraviolet"
  | "infrared"
  | "xray"
  | "nearinfrared"
  | "midinfrared"
  | "herschelfits";
const surveys: Record<SurveyKey, { name: string; url: string }> = {
  hstimage: {
    name: "HST ACS — pointed imaging",
    url: "https://skies.esac.esa.int/HST/ACS/",
  },
  radio: {
    name: "Haslam — 408 MHz · Radio",
    url: "https://skies.esac.esa.int/Haslam/Haslam408_dsds_Remazeilles2014_mod_HiPS/",
  },
  nuv: {
    name: "GALEX — Near ultraviolet",
    url: "https://alasky.cds.unistra.fr/GALEX/GALEXGR6_7_NUV/",
  },
  fuv: {
    name: "GALEX — Far ultraviolet",
    url: "https://alasky.cds.unistra.fr/GALEX/GALEXGR6_7_FUV/",
  },
  gamma: {
    name: "Fermi LAT — Gamma rays",
    url: "https://skies.esac.esa.int/FermiColor/",
  },
  planck: {
    name: "Planck HFI — 100 GHz",
    url: "https://skies.esac.esa.int/pla/HFI_SkyMap_100_2048_R3_00_full_HiPS/",
  },
  sdss: {
    name: "SDSS DR9 — optical",
    url: "https://skies.esac.esa.int/SDSS9Color/",
  },
  optical: {
    name: "DSS Color — Optical",
    url: "https://cdn.skies.esac.esa.int/DSSColor/",
  },
  ultraviolet: {
    name: "GALEX Color — Ultraviolet",
    url: "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor/",
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
const credits = document.createElement("div");
credits.id = "science-credits";
document.querySelector("main")!.append(credits);
const metadataBox = document.createElement("aside");
metadataBox.id = "metadata-box";
metadataBox.hidden = true;
document.querySelector("main")!.append(metadataBox);
const coordinateHud = document.createElement("aside");
coordinateHud.id = "coordinate-hud";
coordinateHud.hidden = true;
document.querySelector("main")!.append(coordinateHud);
const surveyCredits: Record<SurveyKey, string> = {
  hstimage:
    "HST ACS · UV / optical / near-IR composite · NASA / ESA / STScI · pointed coverage",
  radio: "Radio · 408 MHz · Haslam / Remazeilles · ESA HiPS",
  nuv: "NUV · 177–283 nm · GALEX GR6/7 · NASA / MAST / CDS",
  fuv: "FUV · 134–179 nm · GALEX GR6/7 · NASA / MAST / CDS",
  gamma: "Gamma rays · Fermi LAT · NASA / DOE / CDS · ESA HiPS",
  optical: "DSS Color · optical ~400–600 nm · CDS / STScI · ESA HiPS",
  planck: "Planck HFI · 100 GHz (3 mm) · ESA · Planck colour map",
  sdss: "SDSS DR9 · optical g/r/i · Sloan Digital Sky Survey · ESA HiPS",
  ultraviolet: "GALEX · FUV 134–179 nm / NUV 177–283 nm · NASA / MAST",
  infrared: "Herschel SPIRE · 250 µm · ESA · black regions: no coverage",
  herschelfits: "Herschel SPIRE · 250 µm · ESA · palette ≠ dataset",
  xray: "Chandra · 0.5–7 keV · NASA / CXC · pointed observations",
  nearinfrared: "2MASS · J/H/Ks 1.25 / 1.65 / 2.16 µm · UMass / IPAC",
  midinfrared: "AllWISE · W1/W2/W4 3.4 / 4.6 / 22 µm · NASA / IPAC",
};
const audit = {
  scenes: [] as number[],
  stateRestored: false,
  tap: "not run",
  warnings: [] as string[],
  restoredStates: [] as string[],
  deletedStates: [] as string[],
};

let provenanceSignature = "";
function updateProvenance(): void {
  const scene = Number(get<HTMLElement>("scene").textContent?.slice(0, 2));
  const visible = [...new Set(layers.values())].filter((h) => h.opacity > 0.01);
  const protocols = [
    "HiPS / HEALPix",
    ...(visible.some((h) => h.format === "fits") ? ["FITS"] : []),
  ];
  if (catalogue?.isVisible) protocols.push("Catalogue metadata");
  if (observationSet?.isVisible)
    protocols.push("HST / STC-S · local JSON fixture");
  if (scene === 7) protocols.push(`TAP / ADQL / VOTable · ${audit.tap}`);
  const signature = JSON.stringify([
    visible.map((h) => [
      h.baseURL,
      h.format,
      Math.round(h.opacity * 100),
      h.colorMap.name,
      h.format === "fits" ? h.getFITSDisplayRange(undefined) : null,
    ]),
    protocols,
  ]);
  if (signature === provenanceSignature && credits.querySelector("strong"))
    return;
  provenanceSignature = signature;
  credits.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = "MAPS & PROVENANCE";
  credits.append(heading);
  for (const h of visible) {
    const key = (Object.keys(surveys) as SurveyKey[]).find(
      (k) => layers.get(k) === h,
    );
    if (!key) continue;
    const line = document.createElement("div");
    line.textContent = `${surveys[key].name} · ${h.format.toUpperCase()} · ${Math.round(h.opacity * 100)}% · palette ${h.colorMap.name}`;
    credits.append(line);
    if (h.format === "fits") {
      const range = h.getFITSDisplayRange(undefined);
      if (range) {
        const values = document.createElement("div");
        values.textContent = `Display range: ${range.min.toPrecision(5)} … ${range.max.toPrecision(5)} ${h.getProperty("data_unit") ?? ""}`;
        credits.append(values);
      }
    }
    const origin = document.createElement("div");
    origin.textContent = `Band / provider: ${surveyCredits[key]}`;
    credits.append(origin);
    const link = document.createElement("a");
    link.href = h.baseURL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = h.baseURL;
    credits.append(link);
  }
  const standards = document.createElement("div");
  standards.textContent = `Data / standards: ${protocols.join(" · ")}`;
  credits.append(standards);
  const links = document.createElement("div");
  for (const [name, url] of [
    ["CDS", "https://aladin.cds.unistra.fr/hips/"],
    ["ESASky", "https://sky.esa.int/"],
    ["Chandra HiPS", "https://cxc.cfa.harvard.edu/cda/hips.html"],
  ]) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = name;
    links.append(link, " · ");
  }
  credits.append(links);
}
setInterval(updateProvenance, 200);

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
// AstroViewer 3.17.0 overlay disposal leaves vertex attributes enabled after
// deleting their buffers. Clear those bindings at this API boundary so the
// next HiPS draw does not fail with INVALID_OPERATION. No engine internals.
function resetOverlayAttributes(): void {
  const gl = canvas.getContext("webgl2");
  if (!gl) return;
  for (let i = 0; i < gl.getParameter(gl.MAX_VERTEX_ATTRIBS); i++)
    gl.disableVertexAttribArray(i);
}
function clearCatalogue(): void {
  if (!catalogue) return;
  catalogue.clearSelection();
  viewer.deleteCatalogue(catalogue);
  resetOverlayAttributes();
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
  resetOverlayAttributes();
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
  metadataBox.hidden = true;
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
  for (let elapsed = 0; elapsed < ms;) {
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
  const number = Number(scene.slice(0, 2));
  if (number && audit.scenes.at(-1) !== number) audit.scenes.push(number);
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
  // Reuse the same HiPS instance when two scene keys share a survey URL.
  const shared = (Object.keys(surveys) as SurveyKey[]).find(
    (other) =>
      other !== key &&
      surveys[other].url === surveys[key].url &&
      layers.has(other),
  );
  if (shared) {
    const layer = layers.get(shared)!;
    layers.set(key, layer);
    return layer;
  }
  if (key === "nuv" || key === "fuv") {
    // Bound discovery while the CDS node is unavailable; do not leave a late
    // addHiPS promise creating a ghost layer after the scene has moved on.
    const response = await fetch(new URL("properties", surveys[key].url), {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(`HiPS properties HTTP ${response.status}`);
  }
  const layer = await viewer.addHiPSFromUrl(surveys[key].url);
  layers.set(key, layer);
  viewer.setHiPSOpacity(layer, 0);
  return layer;
}
function showOnly(key: SurveyKey): void {
  const active = layers.get(key);
  if (!active) throw new Error(`Survey ${key} not loaded`);
  for (const layer of new Set(layers.values()))
    viewer.setHiPSOpacity(layer, layer === active ? 1 : 0);
  viewer.setActiveHiPS(active);
  activeKey = key;
  provenanceSignature = "";
  updateProvenance();
}
function layerCommand(key: SurveyKey): string {
  const cached = layers.get(key);
  return cached
    ? `const layer = viewer.getActiveHiPSLayers().find(h => h.baseURL === "${cached.baseURL}");`
    : `const layer = await viewer.addHiPSFromUrl("${surveys[key].url}");`;
}
async function fadeTo(key: SurveyKey, token: number): Promise<boolean> {
  const previous = activeKey;
  let next: HiPS;
  try {
    next = await ensureLayer(key);
  } catch (error) {
    console.warn(`A00: ${surveys[key].name} unavailable`, error);
    caption(
      get<HTMLElement>("scene").textContent ??
        "02 / Across the electromagnetic spectrum",
      `${surveys[key].name} — unavailable`,
      `This service did not respond. The previous map remains visible; this is not a ${key.toUpperCase()} image.`,
      surveys[key].url,
    );
    audit.warnings.push(`${key}: service unavailable (${String(error)})`);
    await wait(4000, token);
    return false;
  }
  check(token);
  // Activate the next survey only after its metadata has loaded.
  if (previous && layers.get(previous) === next) {
    showOnly(key);
    return true;
  }
  viewer.setActiveHiPS(next);
  provenanceSignature = "";
  updateProvenance();
  activeKey = key;
  // Keep the outgoing image opaque while the incoming layer acquires tiles.
  await wait(2500, token);
  const old = previous ? layers.get(previous) : undefined;
  const stack = viewer.getActiveHiPSLayers();
  const incomingAbove = !old || stack.indexOf(next) > stack.indexOf(old);
  for (let i = 0; i <= 25; i++) {
    await wait(55, token);
    viewer.setHiPSOpacity(next, incomingAbove ? i / 25 : 1);
    if (old) viewer.setHiPSOpacity(old, incomingAbove ? 1 : 1 - i / 25);
  }
  showOnly(key);
  return true;
}

async function fadeHiPS(
  key: SurveyKey,
  from: number,
  to: number,
  token: number,
  durationMs = 1000,
  steps = 10,
): Promise<void> {
  const layer = layers.get(key);
  if (!layer) throw new Error(`Layer HiPS non trovato: ${key}`);

  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const start = clamp(from);
  const end = clamp(to);
  const count = Math.max(1, Math.round(steps));

  viewer.setHiPSOpacity(layer, start);

  for (let i = 1; i <= count; i++) {
    await wait(durationMs / count, token);

    const opacity = start + (end - start) * (i / count);
    viewer.setHiPSOpacity(layer, opacity);
  }
}



const arrowCursor = demoPointer.innerHTML;
function cursorGesture(grabbing: boolean): void {
  demoPointer.dataset.gesture = grabbing ? "grabbing" : "pointer";
  demoPointer.innerHTML = grabbing
    ? '<svg viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg"><path d="M9 18V7a3 3 0 0 1 6 0v8-3a3 3 0 0 1 5 0v3-1a3 3 0 0 1 5 0v2a3 3 0 0 1 5 1v9c0 5-4 8-9 8h-5c-4 0-6-3-8-6l-5-7c-2-3 2-6 4-3l2 2Z" fill="white" stroke="#071629" stroke-width="2" stroke-linejoin="round"/></svg>'
    : arrowCursor;
}
// Reuse A10's canvas PointerEvent technique for a reproducible camera demonstration.
// The scene token keeps cancellation responsive and always releases the pointer.
async function demonstrateCameraDrag(
  dx: number,
  dy: number,
  token: number,
): Promise<void> {
  const rect = canvas.getBoundingClientRect();
  const start = {
    x: Math.max(100, Math.min(rect.width - 100, pointerPosition.x)),
    y: Math.max(180, Math.min(rect.height - 200, pointerPosition.y)),
  };
  await animatePointer(start, token);
  const x = rect.left + start.x;
  const y = rect.top + start.y;
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
  cursorGesture(true);
  await wait(160, token);
  dispatch("pointerdown", x, y, 1);
  try {
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const phase = i / steps;
      const t = phase * phase * (3 - 2 * phase);
      lastX = x + dx * t;
      lastY = y + dy * t;
      placeDemoPointer(lastX - rect.left, lastY - rect.top);
      dispatch("pointermove", lastX, lastY, 1);
      await wait(20, token);
    }
  } finally {
    dispatch("pointerup", lastX, lastY, 0);
    pointerPosition = { x: lastX - rect.left, y: lastY - rect.top };
    cursorGesture(false);
    dispatchPointer(pointerPosition.x, pointerPosition.y);
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
  get<HTMLElement>("ecosystem-diagram").hidden = true;
  clearSavedViews();
  setEquatorialGridVisible(false);
  setHealpixGridVisible(false);
  clearCatalogue();
  clearObservations();
  hideInteraction();
  resetCameraConstraints();
  viewer.resetAxesOrientation();
  viewer.goTo(83.633083, 22.0145);
  viewer.setFoV(65);
  if (viewer.getInsideSphere()) viewer.toggleInsideSphere();
  normalizeLayers();
  coordinateHud.hidden = true;
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
type SceneNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
const initialScene = Number(new URLSearchParams(location.search).get("scene"));
const requestedScene: SceneNumber =
  Number.isInteger(initialScene) && initialScene >= 1 && initialScene <= 11
    ? (initialScene as SceneNumber)
    : 1;

// restoreState recreates HiPS; never retain an instance detached by the engine.
function rebindLayers(): void {
  const live = viewer.getActiveHiPSLayers();
  layers.clear();
  for (const key of Object.keys(surveys) as SurveyKey[]) {
    const h = live.find(
      (h) =>
        h.baseURL.replace(/\/+$/, "") === surveys[key].url.replace(/\/+$/, ""),
    );
    if (h) layers.set(key, h);
  }
  activeKey =
    (Object.keys(surveys) as SurveyKey[]).find(
      (k) => layers.get(k) === viewer.getActiveHiPS(),
    ) ?? null;
}
function normalizeLayers(): void {
  rebindLayers();
  for (const h of new Set(layers.values())) {
    viewer.setActiveHiPS(h);
    if (h.availableFormats.includes("png")) viewer.changeHiPSFormat("png");
    viewer.changeColorMap("native");
    viewer.setHiPSFITSScaleFunction("linear");
    viewer.setHiPSFITSRangeMode("hips");
    viewer.setHiPSOpacity(h, 0);
  }
}
function snapshot() {
  return {
    center: viewer.getCenterCoordinates()!.astroDeg,
    fov: viewer.getFoV().minFoV,
    camera: Array.from(viewer.getCurrentAstroViewerStatus()!.vMatrix),
    inside: viewer.getInsideSphere(),
    layers: viewer
      .getActiveHiPSLayers()
      .map((h) => ({ url: h.baseURL, opacity: h.opacity, format: h.format })),
    catalogueVisible: catalogue?.isVisible,
    footprintsVisible: observationSet?.isVisible,
  };
}
function sameSnapshot(
  a: ReturnType<typeof snapshot>,
  b: ReturnType<typeof snapshot>,
): boolean {
  return (
    Math.abs(a.center.ra - b.center.ra) < 0.01 &&
    Math.abs(a.center.dec - b.center.dec) < 0.01 &&
    Math.abs(a.fov - b.fov) < 0.02 &&
    a.camera.every((v, i) => Math.abs(v - b.camera[i]) < 0.001) &&
    a.inside === b.inside &&
    JSON.stringify(a.layers) === JSON.stringify(b.layers) &&
    a.catalogueVisible === b.catalogueVisible &&
    a.footprintsVisible === b.footprintsVisible
  );
}
const selectedMetadata = new Set<string>();
function clearSelectedMetadata(): void {
  selectedMetadata.clear();
  metadataBox.replaceChildren();
  metadataBox.hidden = true;
}
function showMetadata(
  details: unknown,
  columns: HscFixture["columns"],
  heading: string,
  state: string,
): void {
  if (state !== "selected") return; // Hover changes the marker only; selections persist.
  const values = details as Array<string | number>;
  const key = heading + JSON.stringify(values);
  if (selectedMetadata.has(key)) return;
  selectedMetadata.add(key);
  const card = document.createElement("section");
  card.className = "selected-record";
  const h = document.createElement("strong");
  h.textContent = `${heading} · selected`;
  card.append(h);
  const wanted =
    /^(match_id|ra|dec|flux|ci|observation_id|instrument.*|filter.*|ra_deg|dec_deg|exposure.*)$/i;
  for (const [i, c] of columns.entries()) {
    if (!wanted.test(c.name) || values[i] == null || values[i] === "") continue;
    const line = document.createElement("span");
    const value =
      typeof values[i] === "number" && !/id/.test(c.name)
        ? Number(values[i])
            .toFixed(/ra|dec/.test(c.name) ? 5 : 3)
            .replace(/\.?0+$/, "")
        : values[i];
    line.textContent = `${c.name}: ${value}${c.unit ? " " + c.unit : ""}`;
    card.append(line);
  }
  metadataBox.append(card);
  metadataBox.hidden = false;
}
// ICRS/J2000 equatorial -> Galactic rotation (IAU Galactic system).
function galactic(ra: number, dec: number): [number, number] {
  const r = (ra * Math.PI) / 180,
    d = (dec * Math.PI) / 180;
  const v = [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
  const m = [
    [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
    [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
    [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
  ];
  const [x, y, z] = m.map((row) =>
    row.reduce((sum, n, i) => sum + n * v[i], 0),
  );
  return [
    ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
  ];
}
function updateCoordinates(): void {
  if (!coordinateHud.hidden) {
    if (demoPointer.dataset.gesture !== "grabbing")
      dispatchPointer(pointerPosition.x, pointerPosition.y);
    const c = viewer.getCenterCoordinates()?.astroDeg,
      p = viewer.getCoordinatesFromMouse()?.astroDeg;
    const describe = (label: string, q: typeof c) => {
      if (label === "Cursor" && demoPointer.dataset.gesture === "grabbing")
        return "Cursor · dragging (centre updates live)";
      if (!q) return `${label}: outside sky`;
      const [l, b] = galactic(q.ra, q.dec);
      return `${label} · RA ${q.ra.toFixed(4)}° / Dec ${q.dec.toFixed(4)}°\nl ${l.toFixed(4)}° / b ${b.toFixed(4)}°`;
    };
    coordinateHud.textContent = `Equatorial J2000 / Galactic (derived)\n${describe("Centre", c)}\n${describe("Cursor", p)}\nFoV min ${viewer.getFoV().minFoV.toFixed(3)}° / max ${Math.max(viewer.getFoV().xFoV, viewer.getFoV().yFoV).toFixed(3)}°`;
  }
  requestAnimationFrame(updateCoordinates);
}
requestAnimationFrame(updateCoordinates);

function tableCatalogue(
  names: string[],
  units: string[],
  rows: Array<Array<string | number>>,
  label: string,
): void {
  clearCatalogue();
  const columns = names.map(
    (name, index) =>
      new MetadataColumn({
        index,
        name,
        unit: units[index] ?? "",
        columnType:
          name === "ra"
            ? ColumnType.GEOM_RA
            : name === "dec"
              ? ColumnType.GEOM_DEC
              : name === "match_id"
                ? ColumnType.MAIN_NAME
                : ColumnType.NUMBER,
      }),
  );
  const ra = names.indexOf("ra"),
    dec = names.indexOf("dec");
  if (ra < 0 || dec < 0) throw new Error("Table missing RA / Dec columns");
  const valid = rows
    .filter(
      (row) =>
        Number.isFinite(Number(row[ra])) && Number.isFinite(Number(row[dec])),
    )
    .map((row) => row.map((v, i) => (i === ra || i === dec ? Number(v) : v)));
  if (!valid.length) throw new Error("No valid table rows");
  catalogue = viewer.createCatalogue(
    label,
    "M51 scientific sources",
    "https://sky.esa.int/esasky-tap/tap",
    new MetadataManager(columns),
  );
  catalogue.addSources(valid, columns);
  viewer.showCatalogue(catalogue);
  metadataBox.textContent = `${label}\n${valid.length} rows\n${names.map((n, i) => n + (units[i] ? ` [${units[i]}]` : "")).join(" · ")}`;
  metadataBox.hidden = false;
}
// Keep the last rendered PNG in view while the same HiPS instance switches
// format. This is a temporary image, not a second scientific layer.
async function prepareFITS(layer: HiPS, token: number): Promise<void> {
  const preview = document.createElement("img");
  preview.alt = "PNG preview while FITS tiles load";
  Object.assign(preview.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "1",
    pointerEvents: "none",
    transition: "opacity 600ms",
  });
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => {
      preview.src = canvas.toDataURL("image/png");
      resolve();
    }),
  );
  await preview.decode();
  document.querySelector("main")!.append(preview);
  try {
    caption(
      "09 / FITS & color mapping",
      "Load the numerical measurements",
      "The PNG preview remains visible while the FITS image resolves in the same field.",
      'viewer.changeHiPSFormat("fits"); viewer.setHiPSFITSRangeMode("robust")',
    );
    viewer.changeHiPSFormat("fits");
    viewer.changeColorMap("grayscale");
    viewer.setHiPSFITSScaleFunction("linear");
    viewer.setHiPSFITSRangeMode("robust");
    let settled = false;
    for (let elapsed = 0; elapsed < 20000; elapsed += 500) {
      await wait(500, token);
      if (
        elapsed >= 7500 &&
        layer.getFITSDisplayRange(undefined) &&
        layer.getDebugStats().loadingTileCount === 0
      ) {
        settled = true;
        break;
      }
    }
    if (!settled)
      audit.warnings.push(
        "FITS refinement exceeded 20 seconds; some tiles may still be loading.",
      );
    preview.style.opacity = "0";
    await wait(650, token);
  } finally {
    preview.remove();
  }
}

type SavedView = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  snapshot: ReturnType<typeof snapshot>;
  catalogue: CatalogueGL | null;
  footprints: FootprintSetGL | null;
};
const savedViews = new Map<string, SavedView>();
const stateStack = document.createElement("aside");
stateStack.id = "state-stack";
stateStack.hidden = true;
stateStack.setAttribute("aria-label", "Saved scientific views");
document.querySelector("main")!.append(stateStack);
let stateStackInteractive = false,
  stateActionBusy = false,
  currentSavedView = "";
let stateAction: Promise<void> = Promise.resolve();
function clearSavedViews(): void {
  for (const id of savedViews.keys()) viewer.deleteState(id);
  savedViews.clear();
  resetOverlayAttributes();
  stateStack.hidden = true;
  stateStackInteractive = false;
  currentSavedView = "";
  stateAction = Promise.resolve();
}
function queueStateAction(action: () => Promise<void>): void {
  stateAction = stateAction.then(async () => {
    stateActionBusy = true;
    renderStateStack();
    try {
      await action();
    } finally {
      stateActionBusy = false;
      renderStateStack();
    }
  });
  void stateAction.catch((error) =>
    console.error("A00 saved-view action failed", error),
  );
}
function renderStateStack(): void {
  stateStack.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = `Saved views · ${savedViews.size}`;
  stateStack.append(heading);
  const hint = document.createElement("p");
  hint.textContent = stateStackInteractive
    ? "Click a view to restore · × removes its saved state"
    : "Building three scientific views…";
  stateStack.append(hint);
  for (const record of savedViews.values()) {
    const card = document.createElement("div");
    card.className = "state-card";
    card.dataset.active = String(record.id === currentSavedView);
    const button = document.createElement("button");
    button.className = "state-restore";
    button.dataset.stateRestore = record.id;
    button.disabled = !stateStackInteractive || stateActionBusy;
    button.setAttribute("aria-label", `Restore ${record.title}`);
    const thumb = document.createElement("img");
    thumb.src = record.thumbnail;
    thumb.alt = "";
    button.append(thumb);
    const text = document.createElement("span"),
      title = document.createElement("b"),
      detail = document.createElement("small");
    title.textContent = record.title;
    detail.textContent = record.description;
    text.append(title, detail);
    button.append(text);
    button.addEventListener("click", () =>
      queueStateAction(() => restoreSavedView(record.id)),
    );
    const remove = document.createElement("button");
    remove.className = "state-delete";
    remove.textContent = "×";
    remove.dataset.stateDelete = record.id;
    remove.disabled = button.disabled;
    remove.setAttribute("aria-label", `Delete ${record.title}`);
    remove.addEventListener("click", () =>
      queueStateAction(async () => {
        caption(
          "08 / Scientific view state",
          `Delete ${record.title}`,
          "Remove this saved snapshot; the current sky remains visible.",
          `viewer.deleteState("${record.id}")`,
        );
        if (!viewer.deleteState(record.id))
          throw new Error(`Missing saved state ${record.id}`);
        savedViews.delete(record.id);
        audit.deletedStates.push(record.id);
        resetOverlayAttributes();
      }),
    );
    card.append(button, remove);
    stateStack.append(card);
  }
}
async function captureSavedView(
  id: string,
  title: string,
  description: string,
  token: number,
): Promise<void> {
  caption(
    "08 / Scientific view state",
    `Save ${title}`,
    description,
    `viewer.saveState("${id}")`,
  );
  viewer.saveState(id);
  const thumbnail = await new Promise<string>((resolve) =>
    requestAnimationFrame(() => resolve(canvas.toDataURL("image/png"))),
  );
  savedViews.set(id, {
    id,
    title,
    description,
    thumbnail,
    snapshot: snapshot(),
    catalogue,
    footprints: observationSet,
  });
  currentSavedView = id;
  stateStack.hidden = false;
  renderStateStack();
  await wait(2600, token);
}
async function restoreSavedView(id: string): Promise<void> {
  const record = savedViews.get(id);
  if (!record) return;
  caption(
    "08 / Scientific view state",
    `Restore ${record.title}`,
    `${record.description} Camera, layers and overlays return together.`,
    `await viewer.restoreState("${id}")`,
  );
  await viewer.restoreState(id);
  rebindLayers();
  catalogue = record.catalogue;
  observationSet = record.footprints;
  resetOverlayAttributes();
  if (!sameSnapshot(record.snapshot, snapshot()))
    throw new Error(`Restored state differs: ${id}`);
  currentSavedView = id;
  audit.restoredStates.push(id);
  provenanceSignature = "";
}
async function clickSavedControl(
  selector: string,
  token: number,
): Promise<void> {
  await stateAction;
  check(token);
  const button = stateStack.querySelector<HTMLButtonElement>(selector);
  if (!button) return;
  const r = button.getBoundingClientRect(),
    c = canvas.getBoundingClientRect();
  await animatePointer(
    { x: r.left + r.width * 0.45 - c.left, y: r.top + r.height * 0.5 - c.top },
    token,
  );
  button.classList.add("demo-click");
  await wait(200, token);
  button.click();
  await stateAction;
}
async function frameSavedTarget(
  ra: number,
  dec: number,
  fov: number,
  name: string,
  token: number,
): Promise<void> {
  caption(
    "08 / Scientific view state",
    `Widen before ${name}`,
    "Open the field for the journey to the next saved view.",
    "await viewer.flyToFoV(30, 1400)",
  );
  await viewer.flyToFoV(30, 1400);
  caption(
    "08 / Scientific view state",
    `Travel to ${name}`,
    "Move the camera to the next target.",
    `viewer.flyTo(${ra}, ${dec}, 2400)`,
  );
  viewer.flyTo(ra, dec, 2400);
  await wait(2600, token);
  caption(
    "08 / Scientific view state",
    `Frame ${name}`,
    `Set the field of view to ${fov}° before configuring the layers.`,
    `await viewer.flyToFoV(${fov}, 1800)`,
  );
  await viewer.flyToFoV(fov, 1800);
}
async function showM101Catalogue(): Promise<void> {
  const data = (await (await fetch(m101Url)).json()) as HscFixture;
  const columns = data.columns.map(
    (c, index) =>
      new MetadataColumn({
        index,
        name: c.name,
        unit: c.unit ?? "",
        description: c.description ?? "",
        columnType:
          c.name === "ra"
            ? ColumnType.GEOM_RA
            : c.name === "dec"
              ? ColumnType.GEOM_DEC
              : c.name === "match_id"
                ? ColumnType.MAIN_NAME
                : ColumnType.NUMBER,
      }),
  );
  catalogue = viewer.createCatalogue(
    data.name,
    data.description,
    data.source,
    new MetadataManager(columns),
  );
  catalogue.addSources(data.rows, columns);
  viewer.showCatalogue(catalogue);
  viewer.changeCatalogueColor(catalogue, "#00d4ff");
}

// Unnumbered opening: reveal the DSS sky before Navigation (scene 01).
async function showOpening(token: number): Promise<void> {
  const intro = get<HTMLElement>("scene-intro");
  const dssColor = layers.get("optical")!;
  viewer.setHiPSOpacity(dssColor, 0);
  intro.classList.add("opening");
  intro.querySelector("small")!.hidden = true;
  intro.querySelector("h1")!.textContent = "AstroViewer";
  const subtitle = intro.querySelector("p")!;
  subtitle.textContent = "Exploring the Universe";
  subtitle.hidden = false;
  get<HTMLElement>("caption").hidden = true;
  intro.hidden = false;

  try {
    await wait(500, token);
    // Three-second fade; wait() also honours the showcase pause control.
    for (let step = 1; step <= 60; step++) {
      await wait(50, token);
      viewer.setHiPSOpacity(dssColor, step / 60);
    }
    updateProvenance();
    await wait(1000, token);
    intro.classList.add("leaving");
    await wait(350, token);
  } finally {
    intro.hidden = true;
    intro.classList.remove("opening", "leaving");
    intro.querySelector("small")!.hidden = false;
    subtitle.hidden = true;
    get<HTMLElement>("caption").hidden = false;
  }
}

async function scene01Navigation(token: number): Promise<void> {
  caption(
    "01 / Navigation",
    "Towards the Pleiades — M45",
    "Travel from the panoramic view to a nearby open star cluster.",
    "viewer.flyTo(56.75, 24.1167, 3200)",
  );
  viewer.flyTo(56.75, 24.1167, 3200);
  await wait(3600, token);
  caption(
    "01 / Navigation",
    "Resolve the cluster",
    "Zoom in while preserving the arrival direction.",
    "await viewer.flyToFoV(5, 3000)",
  );
  await viewer.flyToFoV(5, 3000);
  await wait(2500, token);
  caption(
    "01 / Navigation",
    "Drag the sky",
    "Press, drag right, release — then drag left. The hand follows the camera gesture.",
    "// Canvas PointerEvent drag, using the existing camera",
  );
  pointerPosition = {
    x: canvas.clientWidth * 0.35,
    y: canvas.clientHeight * 0.42,
  };
  await demonstrateCameraDrag(340, 45, token);
  await wait(650, token);
  await demonstrateCameraDrag(-300, -35, token);
  hideInteraction();
  caption(
    "01 / Navigation",
    "The surrounding sky",
    "Widen the field before the next journey.",
    "await viewer.flyToFoV(30, 2600)",
  );
  await viewer.flyToFoV(30, 2600);
  await wait(1600, token);
}

async function scene02Spectrum(token: number): Promise<void> {
  const scene = "02 / Across the electromagnetic spectrum";
  type SpectrumBand = {
    key: SurveyKey;
    ra: number;
    dec: number;
    fov: number;
    field: string;
    note: string;
    colormap: ColorMapName;
  };

  // Edit each band's framing and palette here. This scene uses image tiles only.
  const spectrum: SpectrumBand[] = [
    {
      key: "radio",
      ra: 83.8221,
      dec: -5.3911,
      fov: 60,
      field: "Orion region",
      colormap: "planck",
      note: "408 MHz radio image at a wide field. Planck is the display palette, not the dataset.",
    },
    {
      key: "planck",
      ra: 83.8221,
      dec: -5.3911,
      fov: 20,
      field: "Orion region",
      colormap: "planck",
      note: "100 GHz microwave image with the Planck colour map.",
    },
    {
      key: "infrared",
      ra: 83.8221,
      dec: -5.3911,
      fov: 2.5,
      field: "M42",
      colormap: "native",
      note: "Herschel SPIRE 250 µm, native image. Dark borders have no coverage.",
    },
    {
      key: "midinfrared",
      ra: 83.8221,
      dec: -5.3911,
      fov: 2.5,
      field: "M42",
      colormap: "native",
      note: "Mid infrared: AllWISE W1/W2/W4.",
    },
    {
      key: "nearinfrared",
      ra: 83.8221,
      dec: -5.3911,
      fov: 2.5,
      field: "M42",
      colormap: "native",
      note: "Near infrared: 2MASS J/H/Ks.",
    },
    {
      key: "optical",
      ra: 83.8221,
      dec: -5.3911,
      fov: 2.5,
      field: "M42",
      colormap: "native",
      note: "DSS optical coverage of Orion.",
    },
    {
      key: "ultraviolet",
      ra: 202.469575,
      dec: 47.195258,
      fov: 0.5,
      field: "M51",
      colormap: "native",
      note: "GALEX NUV + FUV colour composite from MAST. The two bands are combined.",
    },
    {
      key: "xray",
      ra: 202.469575,
      dec: 47.195258,
      fov: 0.5,
      field: "M51",
      colormap: "native",
      note: "Chandra pointed X-ray observations; coverage is not all-sky.",
    },
    {
      key: "gamma",
      ra: 83.8221,
      dec: -5.3911,
      fov: 60,
      field: "Orion region",
      colormap: "native",
      note: "Fermi LAT gamma-ray image at a field appropriate to its resolution.",
    },
  ];

  // Establish compositing order for scene 04; all three stay hidden initially.
  await ensureLayer("sdss");
  await ensureLayer("nearinfrared");
  await ensureLayer("midinfrared");

  for (const band of spectrum) {
    caption(
      scene,
      `Frame ${band.field} · FoV ${band.fov}°`,
      "Move to the comparison field before changing the survey.",
      `viewer.flyTo(${band.ra}, ${band.dec}, 1800);\nawait viewer.flyToFoV(${band.fov}, 1600);`,
    );
    viewer.flyTo(band.ra, band.dec, 1800);
    await wait(1900, token);
    await viewer.flyToFoV(band.fov, 1600);

    const loadCommand = layerCommand(band.key);
    caption(scene, `Load ${surveys[band.key].name}`, band.note, loadCommand);
    let layer: HiPS;
    try {
      layer = await ensureLayer(band.key);
    } catch (error) {
      check(token);
      audit.warnings.push(`${band.key}: ${String(error)}`);
      caption(
        scene,
        `${surveys[band.key].name} — unavailable`,
        "The previous map remains visible; the requested survey could not be loaded.",
        loadCommand,
      );
      await wait(4000, token);
      continue;
    }
    check(token);

    const presentationCommand = [
      "viewer.setActiveHiPS(layer);",
      `viewer.changeColorMap("${band.colormap}");`,
      "viewer.setHiPSOpacity(layer, opacity); // fade to 1",
    ].join("\n");
    caption(
      scene,
      `Transition to ${surveys[band.key].name}`,
      band.note,
      presentationCommand,
    );
    viewer.setActiveHiPS(layer);
    viewer.changeColorMap(band.colormap);
    await fadeTo(band.key, token);

    caption(
      scene,
      surveys[band.key].name,
      `${band.field} · FoV ${band.fov}°. ${band.note}`,
      presentationCommand,
    );
    await wait(5500, token);
  }

  const optical = await ensureLayer("optical");
  caption(
    scene,
    "Restore DSS Color",
    "Native optical rendering before compositing.",
    'viewer.setActiveHiPS(optical);\nviewer.changeColorMap("native");\nviewer.setHiPSOpacity(optical, opacity); // fade to 1',
  );
  viewer.setActiveHiPS(optical);
  viewer.changeColorMap("native");
  await fadeTo("optical", token);

  caption(
    scene,
    "Return to M42",
    "Keep this 2.5° optical field for the next scene.",
    "viewer.flyTo(83.8221, -5.3911, 2000);\nawait viewer.flyToFoV(2.5, 2000);",
  );
  viewer.flyTo(83.8221, -5.3911, 2000);
  await wait(2200, token);
  await viewer.flyToFoV(2.5, 2000);
  
}

async function scene03Compositing(token: number): Promise<void> {
  // Scene 03 and direct entry already establish M42 at FoV 2.5°.
  setEquatorialGridVisible(false);
  setHealpixGridVisible(false);
  showOnly("optical");
  caption(
    "03 / Three-layer compositing",
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
  provenanceSignature = "";
  await wait(2500, token);
  caption(
    "03 / Three-layer compositing",
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
    "03 / Three-layer compositing",
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
    "03 / Three-layer compositing",
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
    "03 / Three-layer compositing",
    "Return to optical",
    "Hide both infrared overlays and restore the DSS Color view.",
    "viewer.setHiPSOpacity(nearInfrared, 0); viewer.setHiPSOpacity(midInfrared, 0)",
  );
  showOnly("optical");
  await wait(1000, token);
  // Keep M42 in view: scene 05 continues here without a position jump.
}

async function scene04Coordinates(token: number): Promise<void> {
  coordinateHud.hidden = false;
  caption(
    "04 / Sky coordinates & camera",
    "Read the sky beneath the cursor",
    "Equatorial RA / Dec and Galactic l / b, in degrees. The cursor and readout use the same viewer picking point.",
    "viewer.getCenterCoordinates(); viewer.getCoordinatesFromMouse(); viewer.getFoV()",
  );
  for (const [x, y] of [
    [0.42, 0.35],
    [0.6, 0.4],
    [0.55, 0.6],
    [0.4, 0.5],
  ]) {
    await animatePointer(
      { x: canvas.clientWidth * x, y: canvas.clientHeight * y },
      token,
    );
    await wait(2000, token);
  }
  caption(
    "04 / Sky coordinates & camera",
    "Drag the camera",
    "The centre coordinates update during the drag; the hand shows when the sky is held.",
    "viewer.getCenterCoordinates(); viewer.getCoordinatesFromMouse(); // canvas drag",
  );
  await demonstrateCameraDrag(280, 45, token);
  await wait(2000, token);
  await demonstrateCameraDrag(-230, -25, token);
  await wait(1600, token);
  caption(
    "04 / Sky coordinates & camera",
    "A wider frame",
    "Watch both FoV dimensions grow while the centre stays fixed.",
    "await viewer.flyToFoV(35, 3000); viewer.getFoV(); // minFoV; max = Math.max(xFoV, yFoV)",
  );
  await viewer.flyToFoV(35, 3000);
  await wait(2500, token);
  coordinateHud.hidden = true;
  hideInteraction();
}

async function scene05Grids(token: number): Promise<void> {
  caption(
    "05 / Equatorial & HEALPix grids",
    "The Pleiades — M45",
    "A new optical field for the coordinate and tile grids.",
    "viewer.flyTo(56.75, 24.1167, 2400); await viewer.flyToFoV(120, 2000)",
  );
  await fadeTo("optical", token);
  viewer.flyTo(56.75, 24.1167, 2400);
  await wait(2600, token);
  await viewer.flyToFoV(120, 2000);
  caption(
    "05 / Equatorial & HEALPix grids",
    "Equatorial geometry",
    "Right ascension and declination over the Pleiades.",
    "viewer.toggleEquatorialGrid()",
  );
  setEquatorialGridVisible(true);
  await wait(3000, token);
  pointerPosition = {
    x: canvas.clientWidth * 0.4,
    y: canvas.clientHeight * 0.4,
  };
  await demonstrateCameraDrag(180, 25, token);
  await wait(1500, token);
  await demonstrateCameraDrag(-180, -25, token);
  hideInteraction();
  caption(
    "05 / Equatorial & HEALPix grids",
    "Equatorial geometry",
    "Right ascension and declination over the Pleiades.",
    "await viewer.flyToFoV(12, 2000)",
  );
  await viewer.flyToFoV(12, 2000)
  setEquatorialGridVisible(false);
  caption(
    "05 / HEALPix grid",
    "HEALPix sky pixelisation",
    "The hierarchical cells organise HiPS sky tiles.",
    "viewer.toggleHealpixGrid()",
  );
  
  await wait(2600, token);
  setHealpixGridVisible(true);
  caption(
    "05 / HEALPix grid",
    "Resolve the Pleiades",
    "Zoom into M45 and follow the changing HEALPix tessellation.",
    "await viewer.flyToFoV(3, 2600)",
  );
  await viewer.flyToFoV(3, 2600);
  await wait(2800, token);
  caption(
    "05 / HEALPix grid",
    "The surrounding field",
    "Keep the grid visible as the field widens.",
    "await viewer.flyToFoV(12, 2600)",
  );
  await viewer.flyToFoV(12, 2600);
  await wait(2200, token);
  setHealpixGridVisible(false);
}

async function scene06CataloguesAndFootprints(token: number): Promise<void> {
  caption(
    "06 / Catalogues",
    "Travel to M51",
    "Frame the Whirlpool Galaxy before loading the source catalogue.",
    "viewer.flyTo(202.469575, 47.195258, 2600); await viewer.flyToFoV(0.5, 2600)",
  );
  viewer.flyTo(202.469575, 47.195258, 2600);
  await wait(2800, token);
  await viewer.flyToFoV(0.5, 2600);
  caption(
    "06 / Catalogues",
    "SDSS optical field",
    "Switch to SDSS at M51; this field has useful optical coverage.",
    `${layerCommand("sdss")}\nviewer.setActiveHiPS(layer); viewer.setHiPSOpacity(layer, 1);`,
  );
  await fadeTo("sdss", token);
  caption(
    "06 / Catalogues",
    "Hubble Source Catalog",
    "Display 40 real HSC sources from the local M51 fixture.",
    "viewer.createCatalogue(...); catalogue.addSources(rows, columns); viewer.showCatalogue(catalogue)",
  );
  const hsc = await showHscCatalogue();
  // Demonstrate the catalogue colour API before source interactions.
  for (const color of ["#ffb347", "#a78bfa", INTERACTION_COLOR]) {
    caption(
      "06 / Catalogues",
      "Catalogue colour",
      "Change the HSC marker colour while preserving the scientific data.",
      "viewer.changeCatalogueColor(catalogue, color)",
    );
    viewer.changeCatalogueColor(hsc.catalogue, color);
    displayColor = color;
    setLegend("catalogue", "normal");
    await wait(2400, token);
  }
  const raIndex = hscFixture!.columns.findIndex(
    (c) => c.name === hscFixture!.mapping.ra,
  );
  const decIndex = hscFixture!.columns.findIndex(
    (c) => c.name === hscFixture!.mapping.dec,
  );
  const mean = (index: number) =>
    hscFixture!.rows.reduce((sum, row) => sum + Number(row[index]), 0) /
    hscFixture!.rows.length;
  const sourceRa = mean(raIndex),
    sourceDec = mean(decIndex);
  caption(
    "06 / Catalogues",
    "Centre the source group",
    "Move east from M51 to the HSC sources, keeping the wide field before zooming.",
    `viewer.flyTo(${sourceRa.toFixed(6)}, ${sourceDec.toFixed(6)}, 2200)`,
  );
  viewer.flyTo(sourceRa, sourceDec, 2200);
  await wait(3700, token); // Complete the pan, then hold the centred group for 1.5 s.
  caption(
    "06 / Catalogues",
    "Resolve the source cluster",
    "The source group is now centred. Zoom in before mapping magnitude and concentration.",
    "await viewer.flyToFoV(0.12, 2200)",
  );
  await viewer.flyToFoV(0.12, 2200);
  await wait(1800, token);
  // Scientific styling from actual HSC columns: flux is a magnitude (mag),
  // and ci is the normalized concentration index. flux_sigma is constant here.
  caption(
    "06 / Catalogues",
    "Photometric magnitude",
    "Map the HSC flux (magnitude, mag) column to marker brightness.",
    "viewer.setCatalogueShapeHue(catalogue, 'flux')",
  );
  viewer.setCatalogueShapeHue(hsc.catalogue, "flux");
  await wait(1900, token);
  caption(
    "06 / Catalogues",
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
    let source = hscTargets[i];
    const selecting = i < 2;
    caption(
      "06 / Catalogues",
      selecting ? `HSC selection ${i + 1}/2` : `HSC hover ${i - 1}/2`,
      selecting
        ? "Hover the source, then preserve its selection."
        : "Hover temporarily without changing the existing selection.",
      selecting
        ? "catalogue.extAddSources2Selected(source)"
        : "catalogue.extHighlightSource(source, true)",
    );
    await animatePointer(requireScreenPoint(source.point), token);
    const picked = hsc.catalogue.getPrimaryHoveredSource();
    if (!picked) throw new Error("HSC cursor did not pick a source");
    source = picked;
    hsc.catalogue.extHighlightSource(source, true);
    showMetadata(source.details, hscFixture!.columns, "HSC source", "hover");
    setLegend("catalogue", "hover");
    await wait(1150, token);
    if (selecting) {
      hsc.catalogue.extAddSources2Selected(source);
      showMetadata(
        source.details,
        hscFixture!.columns,
        "HSC source",
        "selected",
      );
      setLegend("catalogue", "selected");
      await wait(1050, token);
    }
    hsc.catalogue.extHighlightSource(source, false);
    // Continue directly from this source to the next; selected cards stay visible.
    await wait(450, token);
  }

  setLegend("catalogue", "selected");
  await wait(1800, token);
  caption(
    "06 / Catalogues",
    "Sources and observation coverage",
    "Keep the HSC catalogue visible beneath the HST footprints.",
    "viewer.showCatalogue(catalogue)",
  );
  viewer.showCatalogue(hsc.catalogue);
  await wait(700, token);

  caption(
    "06 / Scientific overlays",
    "Frame M51 observation coverage",
    "Return to the wider M51 field before adding the HST footprints.",
    "viewer.flyTo(202.469575, 47.195258, 1600); await viewer.flyToFoV(0.5, 2200)",
  );
  viewer.flyTo(202.469575, 47.195258, 1600);
  await wait(1800, token);
  await viewer.flyToFoV(0.5, 2200);
  await wait(1200, token);
  caption(
    "06 / Scientific overlays",
    "Hubble observation coverage",
    "Load the local HST STC-S fixture and show its observation footprints.",
    "viewer.createFootprintSet(...); footprints.addFootprints(rows, columns); viewer.showFootprintSet(footprints)",
  );
  const hst = await showHstObservations();
  // Demonstrate footprint colours independently of catalogue styling.
  for (const color of ["#ffb347", INTERACTION_COLOR, "#a78bfa"]) {
    caption(
      "06 / Scientific overlays",
      "Footprint colour",
      "Change the HST observation outline and update the interaction legend.",
      "viewer.changeFootprintSetColor(footprints, color)",
    );
    viewer.changeFootprintSetColor(hst.set, color);
    displayColor = color;
    setLegend("footprint", "normal");
    await wait(2400, token);
  }
  demoPointer.hidden = false;
  demoPointer.style.display = "block";
  await wait(1600, token);
  const targets = spaced(
    hst.set.footprintPolygons.filter((f) => f.valid),
    (f) => footprintScreenPoint(f),
    4,
  );
  for (let i = 0; i < targets.length; i++) {
    let footprint = targets[i];
    caption(
      "06 / Scientific overlays",
      `HST footprint ${i + 1}/4`,
      "Move the pointer to hover; add the footprint to the persistent multi-selection.",
      "footprints.extAddPolygons2Selected(footprint)",
    );
    await animatePointer(footprintScreenPoint(footprint), token);
    const picked = hst.set.hoveredFootprints.footprints;
    if (!picked.length) throw new Error("HST cursor did not pick a footprint");
    if (!picked.includes(footprint)) footprint = picked[0];
    hst.set.extHighlightFootprint(footprint, true);
    showMetadata(
      footprint.details,
      hstFixture!.columns,
      "HST observation",
      "hover",
    );
    setLegend("footprint", "hover");
    await wait(1150, token);
    hst.set.extAddPolygons2Selected(footprint);
    showMetadata(
      footprint.details,
      hstFixture!.columns,
      "HST observation",
      "selected",
    );
    hst.set.extHighlightFootprint(footprint, false);
    // Leave the cursor here; the next interaction starts from this position.
    setLegend("footprint", "selected");
    await wait(1350, token);
  }

  await wait(2300, token);
  hideInteraction();
  caption(
    "06 / Scientific overlays",
    "Restore optical sky",
    "Remove both overlays before querying the archive.",
    "viewer.deleteFootprintSet(footprints); viewer.deleteCatalogue(catalogue)",
  );
  clearObservations();
  clearCatalogue();
  await wait(700, token);
}

async function scene07DataAccess(token: number): Promise<void> {
  clearCatalogue();
  clearObservations();
  // Scene 07 and direct entry already establish M51 at FoV 0.5°.
  const adql =
    "SELECT TOP 40 match_id, ra, dec, flux FROM catalogues.mv_t_hubble_scv3_fdw WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',202.469575,47.195258,0.12))";
  caption(
    "07 / TAP · ADQL · JSON · CSV",
    "Ask a scientific archive",
    "astrospatial-services submits this ADQL to ESASky TAP; results are labelled live or local fallback.",
    `await tap.querySync({ adql, format: "votable", maxrec: 40 });\n// adql:\n${adql}`,
  );
  credits.textContent =
    "Hubble Source Catalog · ESASky TAP · astrospatial-services 0.1.1";
  await wait(3500, token);
  try {
    const tap = new TapService({
      endpoint: "https://sky.esa.int/esasky-tap/tap",
      timeoutMs: 12000,
      transport: new FetchHttpTransport((input, init) => fetch(input, init)),
    });
    const response = await tap.querySync({
      adql,
      format: "votable",
      maxrec: 40,
    });
    check(token);
    const table = parseVOTable(response.body);
    tableCatalogue(
      table.columns.map((c) => c.name),
      table.columns.map((c) => c.unit),
      table.rows,
      "LIVE TAP · VOTable TABLEDATA",
    );
    audit.tap = "live";
    caption(
      "07 / TAP · ADQL · JSON · CSV",
      "Live result on the sky",
      "FIELD metadata supplies column names and units; TABLEDATA supplies the catalogue rows.",
      "const result = parseVOTable(response.body); catalogue.addSources(result.rows, columns)",
    );
  } catch (error) {
    check(token);
    audit.tap = "local fallback";
    audit.warnings.push(
      `TAP fallback: ${String(error)}; cause: ${String((error as Error).cause ?? "not exposed")}`,
    );
    await showHscCatalogue();
    metadataBox.textContent =
      "LOCAL FALLBACK · HSC JSON fixture\nLive TAP unavailable, timed out, or returned an unsupported serialization.";
    metadataBox.hidden = false;
    caption(
      "07 / TAP · ADQL · JSON · CSV",
      "Local fallback — clearly identified",
      "The live service could not supply a usable table. Continue with the checked-in HSC fixture.",
      "await fetch(hscUrl); // Local JSON fallback",
    );
  }
  await wait(5000, token);
  clearCatalogue();
  await showHscCatalogue();
  caption(
    "07 / TAP · ADQL · JSON · CSV",
    "JSON catalogue",
    "Load the local scientific fixture with explicit metadata and units.",
    "const data = await (await fetch(hscUrl)).json(); catalogue.addSources(data.rows, columns)",
  );
  metadataBox.textContent = `LOCAL JSON · HSC fixture\n${hscFixture!.rows.length} sources`;
  await wait(4000, token);
  const csv = await (await fetch(csvUrl)).text();
  check(token);
  const parsed = parseTapCsvTable(csv);
  tableCatalogue(
    parsed.columns,
    parsed.columns.map(
      (n) => hscFixture!.columns.find((c) => c.name === n)?.unit ?? "",
    ),
    parsed.rows.map((row) => parsed.columns.map((n) => row[n])),
    "LOCAL CSV · HSC fixture export",
  );
  caption(
    "07 / TAP · ADQL · JSON · CSV",
    "CSV catalogue",
    "The same local HSC rows, parsed as CSV; units come from the companion metadata.",
    "const table = parseTapCsvTable(await response.text()); catalogue.addSources(rows, columns)",
  );
  await wait(4000, token);
  clearCatalogue();
  metadataBox.hidden = true;
}

async function scene08SavedViews(token: number): Promise<void> {
  hideInteraction();
  clearSelectedMetadata();
  clearCatalogue();
  clearObservations();
  caption(
    "08 / Scientific view state",
    "Build M51 · optical + infrared",
    "Keep the M51 field from the archive scene and combine SDSS with 2MASS at 30% opacity.",
    `${layerCommand("sdss")}\nviewer.setActiveHiPS(layer); viewer.setHiPSOpacity(layer, 1);\nviewer.setHiPSOpacity(nearInfrared, 0.3);`,
  );
  await ensureLayer("sdss");
  await ensureLayer("nearinfrared");
  showOnly("sdss");
  viewer.setHiPSOpacity(layers.get("nearinfrared")!, 0.3);
  caption(
    "08 / Scientific view state",
    "Add M51 sources and footprints",
    "Load the local HSC and HST scientific fixtures.",
    "viewer.createCatalogue(...); catalogue.addSources(rows, columns); viewer.showCatalogue(catalogue);\nviewer.createFootprintSet(...); footprints.addFootprints(rows, columns); viewer.showFootprintSet(footprints)",
  );
  await showHscCatalogue();
  await showHstObservations();
  viewer.changeFootprintSetColor(observationSet!, "#ffcc00");
  await wait(3500, token);
  await captureSavedView(
    "A00-M51",
    "M51",
    "SDSS + 2MASS 30% · HSC + HST footprints",
    token,
  );
  // Saved instances are retained by ViewerStateManager while detached.
  viewer.deleteCatalogue(catalogue!);
  viewer.deleteFootprintSet(observationSet!);
  catalogue = null;
  observationSet = null;
  resetOverlayAttributes();
  await frameSavedTarget(56.75, 24.1167, 5, "the Pleiades", token);
  caption(
    "08 / Scientific view state",
    "M45 · optical + near infrared",
    "DSS and 2MASS cover this field; GALEX has a central coverage gap and SDSS does not cover it.",
    `${layerCommand("optical")}\nviewer.setActiveHiPS(layer); viewer.setHiPSOpacity(layer, 1);\nviewer.setHiPSOpacity(nearInfrared, 0.65);`,
  );
  showOnly("optical");
  await ensureLayer("nearinfrared");
  viewer.setHiPSOpacity(layers.get("nearinfrared")!, 0.65);
  await wait(4000, token);
  await captureSavedView(
    "A00-M45",
    "Pleiades · M45",
    "DSS + 2MASS 65% · FoV 5°",
    token,
  );
  await frameSavedTarget(210.8023, 54.3489, 0.5, "M101", token);
  caption(
    "08 / Scientific view state",
    "M101 · Hubble ACS",
    "Load the HST pointed-image mosaic. Its native tiles have a negative display and retain their observation boundaries.",
    `${layerCommand("hstimage")}\nviewer.setActiveHiPS(layer); viewer.changeColorMap("native"); viewer.setHiPSOpacity(layer, 1);`,
  );
  await fadeTo("hstimage", token);
  caption(
    "08 / Scientific view state",
    "M101 · Hubble sources",
    "Overlay real HSC v3 sources from a local fixture retrieved from MAST at this target.",
    "viewer.createCatalogue(...); catalogue.addSources(rows, columns); viewer.showCatalogue(catalogue)",
  );
  await showM101Catalogue();
  await wait(4500, token);
  await captureSavedView(
    "A00-M101",
    "M101",
    "HST ACS · HSC v3 / MAST fixture · FoV 0.5°",
    token,
  );
  stateStackInteractive = true;
  renderStateStack();
  caption(
    "08 / Scientific view state",
    "Three saved views",
    "Each card restores a different scientific scene. The × button removes only the saved snapshot.",
    "viewer.getStateNames()",
  );
  viewer.getStateNames();
  await wait(4500, token);
  for (const id of ["A00-M51", "A00-M45", "A00-M101"]) {
    await clickSavedControl(`[data-state-restore="${id}"]`, token);
    await wait(5000, token);
  }
  audit.stateRestored = ["A00-M51", "A00-M45", "A00-M101"].every((id) =>
    audit.restoredStates.includes(id),
  );
  for (const id of ["A00-M51", "A00-M45", "A00-M101"]) {
    await clickSavedControl(`[data-state-delete="${id}"]`, token);
    await wait(2200, token);
  }
  caption(
    "08 / Scientific view state",
    "State stack cleared",
    "All three saved snapshots are removed. Continue from the current sky.",
    "viewer.getStateNames(); // A00 snapshots removed",
  );
  await wait(1800, token);
  stateStack.hidden = true;
  stateStackInteractive = false;
  hideInteraction();
  clearCatalogue();
  clearObservations();
}

async function scene09FITS(token: number): Promise<void> {
  // Herschel SPIRE 250 µm supports PNG and FITS tiles.
  // Keep the camera fixed to make the FITS processing comparison meaningful.
  const herschel = await ensureLayer("herschelfits");
  check(token);
  caption(
    "09 / FITS & color mapping",
    "Return to Orion",
    "Prepare a fixed field for the image and measurement comparison.",
    "await viewer.flyToFoV(30, 1800); viewer.flyTo(83.8221, -5.3911, 2600); await viewer.flyToFoV(2.5, 2200)",
  );
  await viewer.flyToFoV(30, 1800);
  viewer.flyTo(83.8221, -5.3911, 2600);
  await wait(2900, token);
  await viewer.flyToFoV(2.5, 2200);
  showOnly("herschelfits");
  viewer.changeHiPSFormat("png");
  viewer.changeColorMap("native");
  caption(
    "09 / FITS scientific visualization",
    "Herschel SPIRE 250 µm — PNG",
    "Start with the image tiles of the same far-infrared survey.",
    'viewer.setActiveHiPS(herschel); viewer.setHiPSOpacity(herschel, 1); viewer.changeHiPSFormat("png"); viewer.changeColorMap("native")',
  );
  await wait(12000, token);
  await prepareFITS(herschel, token);
  caption(
    "09 / FITS — scientific pixel values",
    "FITS — linear grayscale",
    "Unlike pre-rendered PNG tiles, FITS contains numerical intensity measurements. Linear stretch maps equal intensity differences to equal display steps; robust limits reduce the impact of extremes.",
    'viewer.changeColorMap("grayscale"); viewer.setHiPSFITSScaleFunction("linear"); viewer.setHiPSFITSRangeMode("robust")',
  );
  await wait(4500, token);
  // Color maps change the display palette, not the FITS measurements.
  const colorMaps = [
    {
      name: "planck",
      description:
        "A false-color palette emphasizes contrasts in far-infrared emission. The FITS pixel values remain unchanged.",
    },
    {
      name: "cubehelix",
      description:
        "A different intensity-to-color mapping reveals the same structures with another visual progression; no scientific values are altered.",
    },
    {
      name: "hot",
      description:
        "Dark-to-bright warm colors highlight strong emission. This is visualization, not a temperature measurement.",
    },
  ] as const;
  for (const map of colorMaps) {
    viewer.changeColorMap(map.name);
    caption(
      "09 / FITS — color mapping",
      `Color map — ${map.name}`,
      map.description,
      `viewer.changeColorMap("${map.name}")`,
    );
    await wait(3500, token);
  }
  const samples = Array.from({ length: 256 }, (_, i) => i / 255);
  const custom = createColorMapFromSamples("A00 amber", {
    r: samples.map((t) => 255 * t),
    g: samples.map((t) => 255 * 0.9 * t * t),
    b: samples.map((t) => 255 * (0.08 + 0.57 * t)),
  });
  viewer.changeCustomColorMap(custom);
  caption(
    "09 / FITS — color mapping",
    "A custom palette",
    "A demo-defined amber palette maps the same measured intensities.",
    'viewer.changeCustomColorMap(createColorMapFromSamples("A00 amber", channels))',
  );
  await wait(3500, token);
  // Stretch changes the intensity transformation; keep the palette fixed.
  viewer.changeColorMap("planck");
  const stretches = [
    {
      name: "sqrt",
      description:
        "Square-root stretch expands the lower end of the intensity scale, making faint emission easier to distinguish.",
    },
    {
      name: "log",
      description:
        "Logarithmic stretch compresses a wide dynamic range so faint and bright structures can be seen together.",
    },
    {
      name: "asinh",
      description:
        "Inverse-hyperbolic-sine stretch is nearly linear near zero and compresses brighter values, balancing faint detail and bright regions.",
    },
    {
      name: "linear",
      description:
        "Return to linear scaling: equal changes in measured intensity produce equal steps along the color map.",
    },
  ] as const;
  for (const stretch of stretches) {
    viewer.setHiPSFITSScaleFunction(stretch.name);
    caption(
      "09 / FITS — intensity stretch",
      `Intensity stretch — ${stretch.name}`,
      stretch.description,
      `viewer.changeColorMap("planck"); viewer.setHiPSFITSScaleFunction("${stretch.name}")`,
    );
    await wait(3700, token);
  }
  // Per-tile ranges can create visible discontinuities at tile boundaries.
  const ranges = [
    {
      name: "hips",
      description:
        "Use the survey's shared HiPS intensity limits to preserve a consistent display scale across neighboring tiles.",
    },
    {
      name: "robust",
      description:
        "Use robust contrast limits to reduce the influence of extreme intensities and reveal more of the diffuse emission.",
    },
  ] as const;
  for (const range of ranges) {
    viewer.setHiPSFITSRangeMode(range.name);
    caption(
      "09 / FITS — intensity range",
      range.name === "hips"
        ? "Range — HiPS global limits"
        : "Range — robust contrast",
      range.description,
      `viewer.setHiPSFITSRangeMode("${range.name}")`,
    );
    const displayRange = herschel.getFITSDisplayRange(undefined);
    credits.textContent =
      surveyCredits.herschelfits +
      (displayRange
        ? ` · display min ${displayRange.min.toPrecision(5)}, max ${displayRange.max.toPrecision(5)} ${herschel.getProperty("data_unit") ?? ""}`
        : " · numerical range unavailable");
    await wait(4200, token);
  }
  viewer.changeHiPSFormat("png");
  showOnly("optical");
  viewer.changeColorMap("native");
  caption(
    "09 / FITS scientific visualization",
    "Return to DSS Color",
    "Restore the optical survey after the FITS demonstration.",
    'viewer.changeHiPSFormat("png"); viewer.setHiPSOpacity(herschel, 0); viewer.setActiveHiPS(optical); viewer.setHiPSOpacity(optical, 1); viewer.changeColorMap("native")',
  );
  await wait(1200, token);
}

async function scene10InsideSphere(token: number): Promise<void> {
  // A09-inspired demonstration: use motion and the equatorial grid to
  // make the change of perspective perceptible, not merely a toggle.
  showOnly("optical");
  viewer.changeColorMap("native");
  setEquatorialGridVisible(false);
  viewer.resetAxesOrientation();
  caption(
    "10 / Inside the sphere",
    "Widen the optical sky",
    "Reset the axes and widen the DSS field before entering the celestial sphere.",
    "viewer.resetAxesOrientation(); await viewer.flyToFoV(120, 3200)",
  );
  await viewer.flyToFoV(120, 3200);
  caption(
    "10 / Inside the sphere",
    "Outside the celestial sphere",
    "Begin with the external view. We will enter the sphere and navigate with the equatorial grid as a spatial reference.",
    "viewer.getInsideSphere() // false",
  );
  await wait(2600, token);
  
  await fadeHiPS("optical", 1, 0, token);
  
  try {
    if (!viewer.getInsideSphere()) viewer.toggleInsideSphere();

    await fadeHiPS("optical", 0, 1, token);
    await wait(1600, token);

    setEquatorialGridVisible(true);
    caption(
      "10 / Inside the sphere",
      "Inside — equatorial grid",
      "The camera now looks outward from within the celestial sphere. Right ascension and declination lines help reveal its surrounding geometry.",
      "viewer.toggleInsideSphere(); viewer.toggleEquatorialGrid()",
    );
    await wait(2500, token);

    caption(
      "10 / Inside the sphere",
      "Towards the Galactic Centre",
      "Navigate across the interior sky towards the Milky Way's Galactic Centre, keeping the coordinate grid visible.",
      "viewer.flyTo(266.4051, -28.936175, 3200)",
    );
    viewer.flyTo(266.4051, -28.936175, 3200);
    await wait(3500, token);

    caption(
      "10 / Inside the sphere",
      "Across the sky to B33",
      "A second rotation carries the observer towards the Horsehead Nebula, demonstrating navigation from inside the sphere.",
      "viewer.flyTo(85.2458, -2.4583, 3200)",
    );
    // viewer.flyTo(202.4696, 47.1952, 3200);
    viewer.flyTo(85.2458, -2.4583, 3200);
    await wait(3500, token);
    caption(
      "10 / Inside the sphere",
      "Narrow the B33 field",
      "Zoom in while remaining inside the sphere.",
      "await viewer.flyToFoV(5, 2200)",
    );
    await viewer.flyToFoV(5, 2200);
    await wait(1000, token);


  } finally {
    setEquatorialGridVisible(false);
    if (viewer.getInsideSphere()) viewer.toggleInsideSphere();
    viewer.resetAxesOrientation();
    viewer.goTo(85.2458, -2.4583);
  }
  caption(
    "10 / Inside the sphere",
    "Back outside — reveal the sphere",
    "Exit the celestial sphere and widen the field of view to make the external geometry apparent again.",
    "viewer.toggleInsideSphere(); viewer.flyToFoV(120, 4200)",
  );
  await viewer.flyToFoV(120, 4200);
  await wait(1500, token);
}

// Scene titles and the closing diagrams are presentation only: no camera changes.
async function showSceneTitle(
  number: SceneNumber,
  heading: string,
  token: number,
): Promise<void> {
  const intro = get<HTMLElement>("scene-intro");
  const captionBox = get<HTMLElement>("caption");
  intro.querySelector("small")!.textContent =
    `SCENE ${String(number).padStart(2, "0")}`;
  intro.querySelector("h1")!.textContent = heading;
  captionBox.hidden = true;
  intro.hidden = false;
  await wait(1800, token);
  intro.classList.add("leaving");
  await wait(350, token);
  intro.hidden = true;
  intro.classList.remove("leaving");
  captionBox.hidden = false;
}

async function scene11Ecosystem(token: number): Promise<void> {
  const diagram = get<HTMLElement>("ecosystem-diagram");
  diagram.hidden = false;
  caption(
    "11 / Technology & data ecosystem",
    "The viewer and its scientific foundations",
    "Package dependencies: FITS parsing, WCS utilities, sky geometry and metadata.",
    "// Architecture diagram — no service request in this step",
  );
  diagram.innerHTML = `
      <h2>AstroViewer</h2>
      <p class="diagram-subtitle">Rendering · camera · HiPS layers · catalogues · footprints</p>
      <div class="diagram-arrow">↓ depends on</div>
      <div class="dependency-grid">
        <div class="diagram-node"><b>jsfitsio</b><span>FITS parsing</span></div>
        <div class="diagram-node"><b>wcslight</b><span>WCS utilities</span></div>
        <div class="diagram-node"><b>astrospatial-core</b><span>/healpix · /metadata</span></div>
      </div>
      <p class="diagram-note">wcslight also depends on jsfitsio and astrospatial-core.</p>`;
  await wait(6000, token);

  caption(
    "11 / Technology & data ecosystem",
    "Retrieval and rendering work together",
    "The demo passes service results to the viewer. Sesame and HiPS discovery are available service clients; this diagram is not a live demonstration of them.",
    "// Coordinates → viewer.flyTo(ra, dec)\n// Survey URL → viewer.addHiPSFromUrl(url)\n// Table rows → catalogue.addSources(rows, columns)",
  );
  diagram.innerHTML = `
      <h2>From scientific services to the sky</h2>
      <div class="service-flow">
        <div class="diagram-node"><b>External services</b><span>Sesame · HiPS nodes · TAP</span></div>
        <div class="diagram-arrow">↓</div>
        <div class="diagram-node"><b>astrospatial-services</b><span>Retrieve and parse coordinates, survey metadata and tables</span></div>
        <div class="diagram-arrow">↓</div>
        <div class="diagram-node diagram-application"><b>Demo application</b><span>Pass results to AstroViewer's public API</span></div>
        <div class="diagram-arrow">↓</div>
        <div class="diagram-node"><b>AstroViewer</b><span>Render the scientific view · fetch HiPS image tiles</span></div>
      </div>`;
  await wait(6000, token);
}

// Playback order. Edit the corresponding scene function to change its narrative.
const showcaseScenes: Array<{
  number: SceneNumber;
  title: string;
  run: (token: number) => Promise<void>;
}> = [
  { number: 1, title: "Navigation", run: scene01Navigation },
  {
    number: 2,
    title: "Across the electromagnetic spectrum",
    run: scene02Spectrum,
  },
  { number: 3, title: "Three-layer compositing", run: scene03Compositing },
  { number: 4, title: "Sky coordinates & camera", run: scene04Coordinates },
  { number: 5, title: "Equatorial & HEALPix grids", run: scene05Grids },
  {
    number: 6,
    title: "Catalogues & scientific overlays",
    run: scene06CataloguesAndFootprints,
  },
  { number: 7, title: "TAP · ADQL · JSON · CSV", run: scene07DataAccess },
  { number: 8, title: "Scientific view states", run: scene08SavedViews },
  { number: 9, title: "FITS & colour mapping", run: scene09FITS },
  {
    number: 10,
    title: "Inside the celestial sphere",
    run: scene10InsideSphere,
  },
  { number: 11, title: "Technology & data ecosystem", run: scene11Ecosystem },
];

async function runA00(startScene: SceneNumber = 1): Promise<void> {
  if (running) return;
  running = true;
  paused = false;
  const token = ++generation;
  controls();
  audit.scenes = [];
  audit.stateRestored = false;
  audit.warnings = [];
  audit.tap = "not run";
  audit.restoredStates = [];
  audit.deletedStates = [];
  get<HTMLElement>("ecosystem-diagram").hidden = true;
  clearSavedViews();
  status.textContent = "Running A00";
  try {
    setEquatorialGridVisible(false);
    setHealpixGridVisible(false);
    clearCatalogue();
    clearObservations();
    hideInteraction();
    clearSelectedMetadata();
    resetCameraConstraints();
    if (viewer.getInsideSphere()) viewer.toggleInsideSphere();
    viewer.resetAxesOrientation();
    // Direct scene entry: establish the same baseline without replaying earlier scenes.
    const atM42 = startScene >= 2 && startScene <= 5;
    const atM51 = startScene >= 6;
    viewer.goTo(
      atM42 ? 83.8221 : atM51 ? 202.469575 : 83.633083,
      atM42 ? -5.3911 : atM51 ? 47.195258 : 22.0145,
    );
    viewer.setFoV(
      startScene === 1
        ? 65
        : startScene <= 4
          ? 2.5
          : startScene === 5
            ? 60
            : startScene <= 8
              ? 0.5
              : 5,
    );
    normalizeLayers();
    showOnly("optical");

    if (startScene === 1) await showOpening(token);

    for (const scene of showcaseScenes) {
      if (scene.number < startScene) continue;
      await showSceneTitle(scene.number, scene.title, token);
      await scene.run(token);
      if (
        scene.number === Number(new URLSearchParams(location.search).get("end"))
      ) {
        status.textContent = `A00 review complete · 01–${String(scene.number).padStart(2, "0")}`;
        return;
      }
    }
    status.textContent = "A00 complete";
  } catch (error) {
    if (token === generation) {
      console.error("A00 sequence failed", error);
      setEquatorialGridVisible(false);
      setHealpixGridVisible(false);
      clearObservations();
      hideInteraction();
      if (viewer.getInsideSphere()) viewer.toggleInsideSphere();
      status.textContent = "A00 failed";
    }
  } finally {
    coordinateHud.hidden = true;
    get<HTMLElement>("scene-intro").hidden = true;
    get<HTMLElement>("caption").hidden = false;
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
Object.assign(window.astroViewerDemo, {
  audit,
  getCatalogue: () => catalogue,
  getFootprintSet: () => observationSet,
});
void ensureLayer("optical")
  .then(() => {
    showOnly("optical");
    return reset();
  })
  .then(() => {
    window.astroViewerDemo!.ready = true;
    if (mode === "video" || new URLSearchParams(location.search).has("scene"))
      void runA00(requestedScene);
  })
  .catch((error) => {
    console.error("A00 optical survey failed", error);
    status.textContent = "Survey load failed";
  });
