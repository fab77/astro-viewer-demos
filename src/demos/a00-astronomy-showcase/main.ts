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
import {
  FetchHttpTransport,
  parseJsonTable,
  parseCsvTable,
  SesameService,
} from "astrospatial-services";
import {
  TapService,
  parseVOTable,
  parseTapCsvTable,
} from "astrospatial-services/astronomy/tap";
import csvUrl from "./hsc_m51_sources.csv?url";
import hscUrl from "./hsc_m51_sources.json?url";
import hstUrl from "./hst_m51_observations.json?url";
import m101Url from "./hsc_m101_sources.json?url";

const XMM_TAP_ENDPOINT = "https://nxsa.esac.esa.int/tap-server/tap";
const transport = new FetchHttpTransport((input, init) =>
  fetch(
    String(input).replace(XMM_TAP_ENDPOINT, `${location.origin}/api/xmm-tap`),
    init,
  ),
);
const services = {
  xmm: new TapService({
    endpoint: XMM_TAP_ENDPOINT,
    transport,
    timeoutMs: 30000,
  }),
};

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
  | "xmm"
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
  xmm: {
    name: "XMM-Newton EPIC — X-ray RGB",
    url: "https://esdchips.esac.esa.int/XMM-Newton/EPIC-RGB/",
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
const fitsModeBadge = get<HTMLElement>("fits-mode-badge");
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
const dataExample = document.createElement("aside");
dataExample.id = "data-example";
dataExample.hidden = true;
document.querySelector("main")!.append(dataExample);
function showDataExample(label: string, text: string): void {
  const title = document.createElement("strong");
  title.textContent = label;
  const pre = document.createElement("pre");
  pre.textContent = text;
  dataExample.replaceChildren(title, pre);
  dataExample.hidden = false;
}

const coordinateHud = document.createElement("aside");
coordinateHud.id = "coordinate-hud";

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
  xmm: "XMM-Newton EPIC RGB · ESA / XSA · pointed X-ray observations",
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
  if (observationSet?.isVisible) protocols.push(observationProvenance);
  if (scene === 6 && audit.tap !== "not run")
    protocols.push(`TAP / ADQL / VOTable · ${audit.tap}`);
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
  const created = viewer.addCatalogue(parseJsonTable(data), {
    name: data.name,
    description: data.description,
    providerUrl: data.source,
  });
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
let observationProvenance = "HST / STC-S · local JSON fixture";
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
  const set = viewer.addFootprintSet(parseJsonTable(data), {
    name: data.name,
    description: data.description,
    providerUrl: data.source,
  });
  observationSet = set;
  observationProvenance = "HST / STC-S · local JSON fixture";
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
  clearHoveredMetadata();
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
function parkDemoPointer(): void {
  demoPointer.hidden = true;
  demoPointer.style.display = "none";
  realPointerOnCanvas = false;
  // Clear the viewer's last hit-test position, not just our metadata panel.
  dispatchPointer(-1000, -1000);
  lastHoveredSource = null;
  lastHoveredFootprint = null;
  clearHoveredMetadata();
}
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
async function fadeTo(key: SurveyKey, token: number, durationMs = 1400): Promise<boolean> {
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
    await wait(900, token);
    return false;
  }
  check(token);
  // Activate the next survey only after its metadata has loaded.
  if (previous && layers.get(previous) === next) {
    showOnly(key);
    return true;
  }
  provenanceSignature = "";
  updateProvenance();
  activeKey = key;
  // Retain the previous sky while incoming tiles start to load.
  await wait(900, token);
  check(token);
  const old = previous ? layers.get(previous) : undefined;
  await viewer.transitionToHiPS(next, { previous: old, durationMs });
  check(token);
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
  updateProvenance();
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
  momentumRelease = false,
  inertiaHoldMs = 0,
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
      // Keep velocity at release for the free-camera gesture; locked-axis
      // demonstrations retain the original smooth stop.
      const t = momentumRelease ? phase * phase : phase * phase * (3 - 2 * phase);
      lastX = x + dx * t;
      lastY = y + dy * t;
      placeDemoPointer(lastX - rect.left, lastY - rect.top);
      dispatch("pointermove", lastX, lastY, 1);
      await wait(20, token);
    }
    // Keep the button pressed and the pointer still: AstroSphere applies
    // its existing angular inertia during render frames, without new drags.
    if (inertiaHoldMs > 0) await wait(inertiaHoldMs, token);
  } finally {
    dispatch("pointerup", lastX, lastY, 0);
    pointerPosition = { x: lastX - rect.left, y: lastY - rect.top };
    cursorGesture(false);
    dispatchPointer(pointerPosition.x, pointerPosition.y);
  }
  await wait(momentumRelease ? 650 : 300, token);
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
  dataExample.hidden = true;
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

  if (layers.has("optical")) showOnly("optical");
  caption(
    "Opening",
    "AstroViewer",
    "Explore the sky across wavelengths.",
    "viewer.goTo(83.633083, 22.0145);\nviewer.setFoV(65)",
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
  const kind = /source/i.test(heading) ? "source" : "footprint";
  if (state === "hover") clearHoveredMetadata(kind);
  const values = details as Array<string | number>;
  const key = heading + JSON.stringify(values);
  if (state === "selected") {
    clearHoveredMetadata(kind);
    if (selectedMetadata.has(key)) return;
    selectedMetadata.add(key);
  }
  const card = document.createElement("section");
  card.className = "selected-record";
  const h = document.createElement("strong");
  const idIndex = columns.findIndex((c) =>
    /^(match_id|iauname|observation_id)$/.test(c.name),
  );
  const identifier = idIndex >= 0 ? values[idIndex] : heading;
  if (state === "hover") card.dataset.hover = kind;
  h.textContent =
    state === "hover"
      ? `? ${identifier} - hovered`
      : `${heading} ${identifier} · selected`;
  card.append(h);
  const wanted =
    /^(match_id|ra|dec|flux|ep_flux|iauname|obs_id|target|duration|ci|observation_id|instrument.*|filter.*|ra_deg|dec_deg|exposure.*)$/i;
  for (const [i, c] of columns.entries()) {
    if (!wanted.test(c.name) || values[i] == null || values[i] === "") continue;
    const line = document.createElement("span");
    const value =
      typeof values[i] === "number" && !/id/.test(c.name)
        ? Math.abs(Number(values[i])) > 0 && Math.abs(Number(values[i])) < 0.001
          ? Number(values[i]).toExponential(3)
          : Number(values[i])
              .toFixed(/ra|dec/.test(c.name) ? 5 : 3)
              .replace(/\.?0+$/, "")
        : values[i];
    line.textContent = `${c.name}: ${value}${c.unit ? " " + c.unit : ""}`;
    card.append(line);
  }
  if (state === "hover") metadataBox.prepend(card);
  else metadataBox.append(card);
  metadataBox.hidden = false;
}
function clearHoveredMetadata(kind?: string): void {
  const selector = kind ? `[data-hover="${kind}"]` : "[data-hover]";
  metadataBox.querySelectorAll(selector).forEach((card) => card.remove());
  if (!metadataBox.hasChildNodes()) metadataBox.hidden = true;
}
let lastHoveredSource: Source | null = null;
let lastHoveredFootprint: Footprint | null = null;
function updateHoveredMetadata(): void {
  const cursorVisible = realPointerOnCanvas || !demoPointer.hidden;
  const source =
    cursorVisible && catalogue?.isVisible
      ? catalogue.getPrimaryHoveredSource()
      : null;
  const footprint =
    cursorVisible && observationSet?.isVisible
      ? (observationSet.hoveredFootprints.footprints[0] ?? null)
      : null;
  if (source !== lastHoveredSource) {
    clearHoveredMetadata("source");
    if (source && catalogue)
      showMetadata(
        source.details,
        catalogue.metadataManager.columns,
        "Source",
        "hover",
      );
    lastHoveredSource = source;
  }
  if (footprint !== lastHoveredFootprint) {
    clearHoveredMetadata("footprint");
    if (footprint && observationSet)
      showMetadata(
        footprint.details,
        observationSet.metadataManager.columns,
        "Observation",
        "hover",
      );
    lastHoveredFootprint = footprint;
  }
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
let realPointerOnCanvas = false;
canvas.addEventListener("pointermove", (event) => {
  if (event.isTrusted) realPointerOnCanvas = true;
});
canvas.addEventListener("pointerleave", () => {
  realPointerOnCanvas = false;
});
window.addEventListener("blur", () => {
  realPointerOnCanvas = false;
});

// The viewer tracks real pointer events and the demo's animated pointer.
// Read that state without dispatching synthetic events that overwrite the mouse.
function updateCoordinates(): void {
  updateHoveredMetadata();
  const center = viewer.getCenterCoordinates()?.astroDeg;
  const cursor = viewer.getCoordinatesFromMouse()?.astroDeg;
  const describe = (label: string, point: typeof center) => {
    if (!point) return `${label}: outside sky`;
    const [l, b] = galactic(point.ra, point.dec);
    return `${label} · RA ${point.ra.toFixed(4)}° / Dec ${point.dec.toFixed(4)}°\nl ${l.toFixed(4)}° / b ${b.toFixed(4)}°`;
  };
  const fov = viewer.getFoV();
  const cursorLine =
    cursor && (realPointerOnCanvas || !demoPointer.hidden)
      ? `\n${describe("Cursor", cursor)}`
      : "";
  coordinateHud.textContent = `Equatorial J2000 / Galactic (derived)\n${describe("Centre", center)}${cursorLine}\nFoV min ${fov.minFoV.toFixed(3)}° / max ${Math.max(fov.xFoV, fov.yFoV).toFixed(3)}°`;
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
    label,
    csvUrl,
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
      "08 / FITS & color mapping",
      "Load the numerical measurements",
      "The PNG preview remains visible while the FITS image resolves in the same field.",
      'viewer.changeHiPSFormat("fits");\nviewer.setHiPSFITSRangeMode("robust")',
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
          "07 / Scientific view state",
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
    "07 / Scientific view state",
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
    "07 / Scientific view state",
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
    "07 / Scientific view state",
    `Widen before ${name}`,
    "Open the field for the journey to the next saved view.",
    "await viewer.flyToFoV(30, 1400)",
  );
  await viewer.flyToFoV(30, 1400);
  caption(
    "07 / Scientific view state",
    `Travel to ${name}`,
    "Move the camera to the next target.",
    `viewer.flyTo(${ra}, ${dec}, 2400)`,
  );
  viewer.flyTo(ra, dec, 2400);
  await wait(2600, token);
  caption(
    "07 / Scientific view state",
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
  const scene = "01 / Navigation";

  // Start wide: demonstrate camera constraints before approaching an object.
  // Preserve the opening FoV (65°): no abrupt jump after the intro.
  viewer.resetAxesOrientation();
  resetCameraConstraints();

  try {
    caption(
      scene,
      "East–West rotation locked",
      "Vertical dragging moves the sky while the East–West axis is constrained.",
      "viewer.setEastWestRotationLocked(true)",
    );

    viewer.setEastWestRotationLocked(true);

    pointerPosition = {
      x: canvas.clientWidth * 0.4,
      y: canvas.clientHeight * 0.42,
    };

    await demonstrateCameraDrag(0, 190, token);
    await demonstrateCameraDrag(0, -190, token);

    viewer.setEastWestRotationLocked(false);

    caption(
      scene,
      "North–South rotation locked",
      "Horizontal dragging demonstrates the second camera constraint.",
      "viewer.setNorthSouthRotationLocked(true)",
    );

    viewer.setNorthSouthRotationLocked(true);

    await demonstrateCameraDrag(260, 0, token);
    await demonstrateCameraDrag(-260, 0, token);

    viewer.setNorthSouthRotationLocked(false);

    caption(
      scene,
      "Free rotation",
      "Both axes are now free. Hold the pointer after a sweep to reveal the camera’s natural inertia.",
      "viewer.setEastWestRotationLocked(false);\nviewer.setNorthSouthRotationLocked(false)",
    );

    // Keep the mouse pressed while the engine dissipates the angular inertia.
    // Releasing immediately hides most of the effect in this demo.
    await demonstrateCameraDrag(400, 165, token, true, 2100);
  } finally {
    resetCameraConstraints();
    hideInteraction();
  }

  // Restore the north axis before resolving M45 and starting the flyTo.
  caption(
    scene,
    "Restore north axis",
    "Re-establish the camera's north-up orientation before target navigation.",
    "viewer.resetAxesOrientation();",
  );
  viewer.resetAxesOrientation();
  await wait(900, token);

  // ------------------------------------------------------------
  // Sesame name resolution
  // ------------------------------------------------------------

  const sesame = new SesameService({ timeoutMs: 4000 });

  const sesameExample = [
    'const target = await sesame.resolve("M45");',
    "viewer.flyTo(target.raDeg, target.decDeg, 3000);",
  ].join("\n");

  caption(
    scene,
    "Sesame name resolution — M45",
    "Resolve the Pleiades by name using CDS Sesame, with Harvard as backup.",
    sesameExample,
  );

  let m45 = { raDeg: 56.75, decDeg: 24.1167 };
  let resolvedBy = "reference coordinates (offline fallback)";

  try {
    const target = await sesame.resolve("M45");

    if (target) {
      m45 = target;
      resolvedBy = target.resolver ?? "Sesame";
    }
  } catch (error) {
    console.warn(
      "[A00] Sesame unavailable; using reference coordinates",
      error,
    );
  }

  // Resolve and navigate as one continuous narrative beat: do not pause
  // on an intermediate Sesame result screen before the camera moves.
  caption(
    scene,
    "Sesame · Towards the Pleiades — M45",
    `RA ${m45.raDeg.toFixed(5)}° · Dec ${m45.decDeg.toFixed(5)}° · ${resolvedBy}`,
    sesameExample,
  );

  viewer.flyTo(m45.raDeg, m45.decDeg, 3000);
  await wait(3200, token);

  // ------------------------------------------------------------
  // Hierarchical HiPS resolution
  // ------------------------------------------------------------

  caption(
    scene,
    "Hierarchical HiPS resolution",
    "Zoom in: higher-order HiPS tiles reveal progressively finer detail.",
    "await viewer.flyToFoV(5, 4200)",
  );

  await viewer.flyToFoV(5, 4200);
  await wait(1700, token);
}

async function scene02Spectrum(token: number): Promise<void> {
  const scene = "02 / M42 — A multiwavelength view";
  // The scene stays on the same physical object and at the same FoV.
  // These three surveys provide broad coverage around M42; avoid pointed
  // observations whose footprints may leave the field empty.
  const bands: Array<{ key: SurveyKey; headline: string; note: string }> = [
    {
      key: "optical",
      headline: "M42 · Visible light",
      note: "DSS Color: optical appearance of the Orion Nebula.",
    },
    {
      key: "nearinfrared",
      headline: "M42 · Near infrared",
      note: "2MASS J/H/Ks: the same field observed at 1.25–2.16 µm.",
    },
    {
      key: "midinfrared",
      headline: "M42 · Mid infrared",
      note: "AllWISE W1/W2/W4: the same field observed at longer wavelengths.",
    },
  ];

  // A continuous optical background remains visible during the transfer
  // from M45, avoiding an empty sky or a full-screen title.
  caption(
    scene,
    "From M45 to M42",
    "Widen, move to Orion, then approach M42. The optical map stays visible.",
    "await viewer.flyToFoV(35, 1600);\nviewer.flyTo(83.8221, -5.3911, 2300);\nawait viewer.flyToFoV(2.5, 1900)",
  );
  await viewer.flyToFoV(35, 1600);
  viewer.flyTo(83.8221, -5.3911, 2300);
  await wait(2500, token);
  await viewer.flyToFoV(2.5, 1900);
  await wait(900, token);

  // Load the two incoming maps while optical remains fully visible.
  // If a provider is unavailable, keep the previous image and continue.
  caption(
    scene,
    bands[0].headline,
    bands[0].note,
    "viewer.setActiveHiPS(optical);\nviewer.changeColorMap(\"native\")",
  );
  showOnly("optical");
  viewer.changeColorMap("native");
  await wait(2300, token);

  for (const band of bands.slice(1)) {
    try {
      await ensureLayer(band.key);
      check(token);
      caption(
        scene,
        band.headline,
        band.note,
        `await viewer.transitionToHiPS(next, { previous: old, durationMs: 2100 })`,
      );
      if (await fadeTo(band.key, token, 3100)) await wait(1000, token);
    } catch (error) {
      check(token);
      audit.warnings.push(`${band.key}: ${String(error)}`);
      caption(
        scene,
        `${surveys[band.key].name} unavailable`,
        "The preceding survey remains visible.",
        surveys[band.key].url,
      );
      await wait(1000, token);
    }
  }

  // Scene 03 starts with optical as its base layer.
  caption(
    scene,
    "M42 · Back to optical",
    "Return to the visible-light view before three-layer compositing.",
    'await viewer.transitionToHiPS(optical, { previous: old, durationMs: 3100 })',
  );
  await fadeTo("optical", token, 2100);
  viewer.changeColorMap("native");
  await wait(600, token);
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
    "viewer.setHiPSOpacity(optical, 0.35);\nviewer.setHiPSOpacity(nearInfrared, 0.65);\nviewer.setHiPSOpacity(midInfrared, 0.55)",
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
    "viewer.setHiPSOpacity(nearInfrared, 0);\nviewer.setHiPSOpacity(midInfrared, 0)",
  );
  showOnly("optical");
  await wait(1000, token);
  // Keep M42 in view: scene 04 continues here without a position jump.
}

async function scene04Grids(token: number): Promise<void> {
  // Keep celestial north upright throughout the grid demonstration.
  viewer.resetAxesOrientation();
  viewer.setKeepCameraNorthUp(true);
  try {
    caption(
      "04 / Equatorial & HEALPix grids",
      "The Pleiades — M45",
      "Approach the Pleiades with celestial north upright.",
      "viewer.resetAxesOrientation();\nviewer.setKeepCameraNorthUp(true);\nviewer.flyTo(56.75, 24.1167, 2400);\nawait viewer.flyToFoV(120, 2000)",
    );
    await fadeTo("optical", token);
    viewer.flyTo(56.75, 24.1167, 2400);
    await wait(2600, token);
    await viewer.flyToFoV(120, 2000);

    caption(
      "04 / Equatorial & HEALPix grids",
      "Equatorial geometry",
      "Right ascension and declination remain visible as we zoom into M45.",
      "viewer.toggleEquatorialGrid();\nawait viewer.flyToFoV(3, 2600)",
    );
    setEquatorialGridVisible(true);
    await wait(1000, token);
    await viewer.flyToFoV(3, 2600);
    await wait(1000, token);

    caption(
      "04 / Equatorial & HEALPix grids",
      "HEALPix sky pixelisation",
      "Switch grids at the Pleiades, then reveal the hierarchical cells as the field widens.",
      "viewer.toggleEquatorialGrid();\nviewer.toggleHealpixGrid();\nawait viewer.flyToFoV(35, 2600)",
    );
    setEquatorialGridVisible(false);
    setHealpixGridVisible(true);
    await wait(1000, token);
    await viewer.flyToFoV(35, 2600);
    await wait(2200, token);
    setHealpixGridVisible(false);
  } finally {
    // Do not leak this scene's camera constraint into scene 05.
    viewer.setKeepCameraNorthUp(false);
  }
}

async function scene05CataloguesAndFootprints(token: number): Promise<void> {
  // Scene 04 ends on M45, so the M51 transfer is necessary during a full run.
  // For a standalone scene 05 start, avoid an unnecessary reposition if already there.
  caption(
    "05 / Catalogues",
    "From the Pleiades to M51",
    "Widen the field, travel to the Whirlpool Galaxy, then approach the source catalogue.",
    "await viewer.flyToFoV(35, 1800);\nviewer.flyTo(202.469575, 47.195258, 2600)",
  );
  await viewer.flyToFoV(35, 1800);
  check(token);
  viewer.flyTo(202.469575, 47.195258, 2600);
  await wait(2800, token);
  await viewer.flyToFoV(0.5, 2600);
  caption(
    "05 / Catalogues",
    "SDSS optical field",
    "Switch to SDSS at M51; this field has useful optical coverage.",
    `${layerCommand("sdss")}\nviewer.setActiveHiPS(layer);\nviewer.setHiPSOpacity(layer, 1);`,
  );
  await fadeTo("sdss", token);
  caption(
    "05 / Catalogues",
    "Hubble Source Catalog",
    "Services interprets the JSON metadata and produces an AstroTable; AstroViewer renders its sources.",
    'const table = parseJsonTable(hscJson);\nviewer.addCatalogue(table, { name: "HSC sources" });',
  );
  // Keep the real loading path in showHscCatalogue(), which calls
  // viewer.addCatalogue(parseJsonTable(data), options).
  const hsc = await showHscCatalogue();
  showDataExample(
    "HSC JSON · simplified structure",
    [
      "{",
      '  "mapping": { "ra": "ra", "dec": "dec", "name": "match_id" },',
      '  "columns": [',
      '    { "name": "ra", "unit": "deg", "numeric": true },',
      '    { "name": "dec", "unit": "deg", "numeric": true },',
      "    …",
      "  ],",
      '  "rows": [ […], … ]',
      "}",
    ].join("\n"),
  );
  await wait(1600, token);
  caption(
    "05 / Catalogues",
    "Astrospatial Services",
    "Convert the structured JSON into an AstroTable containing columns and rows.",
    "const table = parseJsonTable(hscJson);",
  );
  showDataExample(
    "Services · JSON → AstroTable",
    'import { parseJsonTable } from "astrospatial-services";\n\nconst table = parseJsonTable(hscJson);',
  );
  await wait(1600, token);
  caption(
    "05 / Catalogues",
    "AstroViewer",
    "Pass the normalized AstroTable to the Viewer; the same API supports styling and interaction.",
    'viewer.addCatalogue(table, { name: "HSC sources" });',
  );
  showDataExample(
    "Viewer · AstroTable → CatalogueGL",
    'const catalogue = viewer.addCatalogue(table, {\n  name: "HSC sources"\n});',
  );
  await wait(1600, token);
  dataExample.hidden = true;
  // Demonstrate the catalogue colour API before source interactions.
  // Show a single colour change, keeping the final colour for subsequent interactions.
  caption(
    "05 / Catalogues",
    "Catalogue colour",
    "Change the HSC marker colour once; retain the result for hue, size and selection.",
    "viewer.changeCatalogueColor(catalogue, color)",
  );
  viewer.changeCatalogueColor(hsc.catalogue, INTERACTION_COLOR);
  displayColor = INTERACTION_COLOR;
  setLegend("catalogue", "normal");
  await wait(2400, token);
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
    "05 / Catalogues",
    "Centre the source group",
    "Move east from M51 to the HSC sources, keeping the wide field before zooming.",
    `viewer.flyTo(${sourceRa.toFixed(6)}, ${sourceDec.toFixed(6)}, 2200)`,
  );
  viewer.flyTo(sourceRa, sourceDec, 2200);
  await wait(3700, token); // Complete the pan, then hold the centred group for 1.5 s.
  caption(
    "05 / Catalogues",
    "Resolve the source cluster",
    "The source group is now centred. Zoom in before mapping magnitude and concentration.",
    "await viewer.flyToFoV(0.10, 2200)",
  );
  await viewer.flyToFoV(0.10, 2200);
  await wait(1800, token);
  // Scientific styling from actual HSC columns: flux is a magnitude (mag),
  // and ci is the normalized concentration index. flux_sigma is constant here.
  caption(
    "05 / Catalogues",
    "Photometric magnitude",
    "Map the HSC flux (magnitude, mag) column to marker brightness.",
    "viewer.setCatalogueShapeHue(catalogue, 'flux')",
  );
  viewer.setCatalogueShapeHue(hsc.catalogue, "flux");
  await wait(1900, token);
  caption(
    "05 / Catalogues",
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
      "05 / Catalogues",
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
  // Demonstrate the CSV import path without creating another copy of HSC.
  const csv = await (await fetch(csvUrl)).text();
  const csvTable = parseCsvTable(csv, {
    mapping: hscFixture!.mapping,
    numericColumns: hscFixture!.columns
      .filter((c) => c.numeric)
      .map((c) => c.name),
  });
  if (csvTable.rows.length !== hscFixture!.rows.length) {
    throw new Error("CSV and JSON HSC source counts differ");
  }
  caption(
    "05 / Catalogues & data",
    "The same catalogue, two formats",
    "CSV is normalized by Services into AstroTable; the already displayed HSC sources remain in place.",
    "const table = parseCsvTable(csv, { mapping }); // AstroTable",
  );
  showDataExample(
    "CSV · same AstroTable contract",
    'const table = parseCsvTable(csvText, {\n  mapping: hscMapping\n});\nviewer.addCatalogue(table, { name: "HSC CSV" });',
  );
  await wait(1700, token);
  dataExample.hidden = true;
  caption(
    "05 / Scientific overlays",
    "From catalogue sources to observation footprints",
    "Remove the HSC catalogue and its selection metadata before showing HST coverage.",
    "catalogue.clearSelection(); viewer.deleteCatalogue(catalogue)",
  );
  hideInteraction();
  clearCatalogue();
  clearSelectedMetadata();
  parkDemoPointer();
  await wait(700, token);

  caption(
    "05 / Scientific overlays",
    "Frame M51 observation coverage",
    "Return to the wider M51 field before adding the HST footprints.",
    "viewer.flyTo(202.469575, 47.195258, 1600);\nawait viewer.flyToFoV(0.5, 2200)",
  );
  viewer.flyTo(202.469575, 47.195258, 1600);
  await wait(1800, token);
  await viewer.flyToFoV(0.5, 2200);
  await wait(1200, token);
  caption(
    "05 / Scientific overlays",
    "Hubble observation coverage",
    "Show real HST footprints from local JSON. The STC-S geometry is interpreted through the shared AstroTable contract.",
    "viewer.createFootprintSet(...);\nfootprints.addFootprints(rows, columns);\nviewer.showFootprintSet(footprints)",
  );
  parkDemoPointer();
  const hst = await showHstObservations();
  parkDemoPointer();
  showDataExample(
    "HST footprints · JSON → AstroTable → Viewer",
    'const table = parseJsonTable(hstJson);\nviewer.addFootprintSet(table, {\n  name: "HST observations"\n});',
  );
  await wait(1700, token);
  dataExample.hidden = true;
  // Demonstrate footprint colours independently of catalogue styling.
  // One change only: keep the resulting colour during hover and selection.
  caption(
    "05 / Scientific overlays",
    "Footprint colour",
    "Change the HST outline colour once and retain it for footprint interactions.",
    "viewer.changeFootprintSetColor(footprints, color)",
  );
  viewer.changeFootprintSetColor(hst.set, "#a78bfa");
  displayColor = "#a78bfa";
  setLegend("footprint", "normal");
  await wait(2400, token);
  await wait(650, token);
  const targets = spaced(
    hst.set.footprintPolygons.filter((f) => f.valid),
    (f) => footprintScreenPoint(f),
    4,
  );
  for (let i = 0; i < targets.length; i++) {
    let footprint = targets[i];
    caption(
      "05 / Scientific overlays",
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
  parkDemoPointer();
  caption(
    "05 / Scientific overlays",
    "Restore optical sky",
    "Remove both overlays before querying the archive.",
    "viewer.deleteFootprintSet(footprints);\nviewer.deleteCatalogue(catalogue)",
  );
  clearObservations();
  clearCatalogue();
  await wait(700, token);
}

async function scene06LiveTAP(token: number): Promise<void> {
  hideInteraction();
  clearSelectedMetadata();
  clearCatalogue();
  clearObservations();
  try {
    await demonstrateLiveXMM(token);
  } catch (error) {
    check(token);
    audit.tap = "unavailable — no local substitution";
    audit.warnings.push(`Data access: ${String(error)}`);
    caption(
      "06 / Live TAP",
      "XMM archive unavailable",
      String(error),
      "// Live query failed; no local fallback",
    );
    await wait(1000, token);
  } finally {
    dataExample.hidden = true;
    clearCatalogue();
    clearObservations();
    clearSelectedMetadata();
    hideInteraction();
  }
}

function formatDataExample(data: {
  mapping?: unknown;
  columns: unknown[];
  rows: unknown[][];
}): string {
  return [
    "{",
    ...(data.mapping ? [`  "mapping": ${JSON.stringify(data.mapping)},`] : []),
    '  "columns": [',
    data.columns.map((column) => "    " + JSON.stringify(column)).join(",\n"),
    "  ],",
    `  "rows": ${JSON.stringify(data.rows)}`,
    "}",
  ].join("\n");
}

// Three independent imports: JSON catalogue, JSON footprints, then CSV catalogue.
// TAP FIELD metadata supplies types and units; these explicit roles are renderer-specific.
function tapViewerColumns(
  columns: MetadataColumn[],
  nameColumn: string,
  footprintColumn?: string,
): MetadataColumn[] {
  return columns.map(
    (column, index) =>
      new MetadataColumn({
        index,
        name: column.name,
        unit: column.unit,
        description: column.description,
        columnType:
          column.name === "ra"
            ? ColumnType.GEOM_RA
            : column.name === "dec"
              ? ColumnType.GEOM_DEC
              : column.name === nameColumn
                ? ColumnType.MAIN_NAME
                : column.name === footprintColumn
                  ? ColumnType.GEOM_FOOTPRINT
                  : column.columnType === ColumnType.NUMBER
                    ? ColumnType.NUMBER
                    : ColumnType.STRING,
      }),
  );
}

async function demonstrateLiveXMM(token: number): Promise<void> {
  const scene = "06 / Live TAP · ADQL";
  const cone =
    "1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',49.9507,41.5117,0.3))";
  const sourceADQL = `SELECT TOP 60 iauname, ra, dec, ep_flux, obs_id\nFROM xsa.v_epic_source_cat\nWHERE ${cone} AND ep_flux IS NOT NULL\nORDER BY ep_flux DESC`;
  const footprintADQL = `SELECT TOP 120 observation_id, target, ra, dec, duration, stc_s\nFROM xsa.v_public_observations\nWHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',49.9507,41.5117,2.0))
  AND stc_s IS NOT NULL
ORDER BY duration DESC`;
  caption(
    scene,
    "Perseus cluster — XMM-Newton EPIC",
    "A new field for a real archive query: XMM X-ray imaging, detections and observation footprints.",
    "await viewer.flyToFoV(25, 1800);\nviewer.flyTo(49.9507, 41.5117, 3000);\nawait viewer.flyToFoV(2.5, 2400);\nawait transitionToHiPS(xmmLayer)",
  );
  await viewer.flyToFoV(25, 1800);
  check(token);
  viewer.flyTo(49.9507, 41.5117, 3000);
  await wait(3200, token);
  await viewer.flyToFoV(2.5, 2400);
  check(token);
  if (!(await fadeTo("xmm", token)))
    throw new Error("XMM EPIC HiPS unavailable");
  viewer.changeColorMap("native");
  caption(
    scene,
    "services queries · viewer renders",
    "astrospatial-services retrieves archive tables; AstroViewer renders their rows. The A00 transport relays XSA through /api/xmm-tap because XSA does not enable browser CORS.",
    'import { TapService, parseVOTable } from "astrospatial-services/astronomy/tap";\nconst services = {\n  xmm: new TapService({ endpoint: "https://nxsa.esac.esa.int/tap-server/tap", transport, timeoutMs: 30000 })\n};',
  );
  await wait(1200, token);
  audit.tap = "querying XSA";
  showDataExample("ADQL · live XMM source detections", sourceADQL);
  caption(
    scene,
    "4 / Send ADQL to XSA TAP",
    "Request real XMM catalogue detections in a 0.3° cone around Perseus. votable_plain requests TABLEDATA, which the parser supports.",
    'const response = await services.xmm.querySync({\n  adql: sourceADQL, format: "votable_plain", maxrec: 60\n});\nconst table = parseVOTable(response.body);',
  );
  await wait(1200, token);
  const response = await services.xmm.querySync({
    adql: sourceADQL,
    format: "votable_plain",
    maxrec: 60,
  });
  check(token);
  const table = parseVOTable(response.body);
  if (!table.rows.length)
    throw new Error("XSA returned no source detections in this field");
  const columns = tapViewerColumns(table.columns, "iauname");
  showDataExample(
    `Live response · ${table.rows.length} detections · first 2 rows`,
    formatDataExample({
      columns: table.columns.map((c) => ({ name: c.name, unit: c.unit })),
      rows: table.rows.slice(0, 2),
    }),
  );
  caption(
    scene,
    "5 / services → viewer · sources",
    "Use FIELD metadata for names and units; explicitly map ra, dec and iauname to the viewer's coordinate and identifier roles.",
    'const columns = tapViewerColumns(table.columns, "iauname");\nconst catalogue = viewer.createCatalogue("Live XMM detections", "Perseus", XMM_TAP_ENDPOINT, new MetadataManager(columns));\ncatalogue.addSources(table.rows, columns);\nviewer.showCatalogue(catalogue);',
  );
  catalogue = viewer.addCatalogue(
    { ...table, columns },
    {
      name: "Live XMM detections",
      description: "Perseus",
      providerUrl: XMM_TAP_ENDPOINT,
    },
  );
  viewer.changeCatalogueColor(catalogue, "#00d4ff");
  audit.tap = `live XSA · ${table.rows.length} detections`;
  await wait(3000, token);
  showDataExample("ADQL · live XMM observation footprints", footprintADQL);
  caption(
    scene,
    "6 / Query observation geometry",
    "Retrieve distinct public XMM observations, including their original STC-S footprints. These are live archive geometries, not locally generated outlines.",
    'const response = await services.xmm.querySync({\n  adql: footprintADQL, format: "votable_plain", maxrec: 120\n});\nconst observations = parseVOTable(response.body);',
  );
  await wait(1200, token);
  const footprintResponse = await services.xmm.querySync({
    adql: footprintADQL,
    format: "votable_plain",
    maxrec: 120,
  });
  check(token);
  const observations = parseVOTable(footprintResponse.body);
  if (!observations.rows.length)
    throw new Error("XSA returned no observation footprints");
  // Multiple archive observations can share the same pointing/geometry.
  // Keep distinct STC-S shapes so the video does not show overlapping copies.
  const geometryIndex = observations.columns.findIndex(
    (column) => column.name.toLowerCase() === "stc_s",
  );
  if (geometryIndex < 0) throw new Error("XSA response lacks stc_s");
  const uniqueGeometries = new Set<string>();
  const distinctRows = observations.rows
    .filter((row) => {
      const geometry = String(row[geometryIndex] ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (!geometry || uniqueGeometries.has(geometry)) return false;
      uniqueGeometries.add(geometry);
      return true;
    })
    .slice(0, 15);
  if (!distinctRows.length) throw new Error("No distinct XMM footprints");
  const footprintColumns = tapViewerColumns(
    observations.columns,
    "observation_id",
    "stc_s",
  );
  dataExample.hidden = true;
  caption(
    scene,
    "7 / services → viewer · footprints",
    "Map stc_s to GEOM_FOOTPRINT and pass the archive rows to the viewer, keeping the live source detections visible.",
    'const columns = tapViewerColumns(observations.columns, "observation_id", "stc_s");\nconst footprints = viewer.addFootprintSet({ ...observations, rows: distinctRows, columns }, { name: "Live XMM observations" });',
  );
  observationProvenance = "XMM-Newton / STC-S · live XSA TAP";
  observationSet = viewer.addFootprintSet(
    { ...observations, rows: distinctRows, columns: footprintColumns },
    {
      name: "Live XMM observations",
      description: "Perseus",
      providerUrl: XMM_TAP_ENDPOINT,
      visible: false,
    },
  );
  if (!observationSet.footprintPolygons.some((f) => f.valid))
    throw new Error("XMM footprints could not be rendered");
  observationSet.clearSelection();
  parkDemoPointer();
  viewer.showFootprintSet(observationSet);
  viewer.changeFootprintSetColor(observationSet, "#ffb347");
  audit.tap = `live XSA · ${table.rows.length} detections · ${distinctRows.length} distinct observations`;
  updateProvenance();
  await wait(3000, token);
}

async function scene07SavedViews(token: number): Promise<void> {
  hideInteraction();
  clearSelectedMetadata();
  clearCatalogue();
  clearObservations();
  caption(
    "07 / Scientific view state",
    "Build M51 · optical + infrared",
    "Keep the M51 field from the archive scene and combine SDSS with 2MASS at 30% opacity.",
    `${layerCommand("sdss")}\nviewer.setActiveHiPS(layer);\nviewer.setHiPSOpacity(layer, 1);\nviewer.setHiPSOpacity(nearInfrared, 0.3);`,
  );
  await ensureLayer("sdss");
  await ensureLayer("nearinfrared");
  showOnly("sdss");
  viewer.setHiPSOpacity(layers.get("nearinfrared")!, 0.3);
  caption(
    "07 / Scientific view state",
    "Add M51 sources and footprints",
    "Load the local HSC and HST scientific fixtures.",
    "viewer.createCatalogue(...);\ncatalogue.addSources(rows, columns);\nviewer.showCatalogue(catalogue);\nviewer.createFootprintSet(...);\nfootprints.addFootprints(rows, columns);\nviewer.showFootprintSet(footprints)",
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
    "07 / Scientific view state",
    "M45 · optical + near infrared",
    "DSS and 2MASS cover this field; GALEX has a central coverage gap and SDSS does not cover it.",
    `${layerCommand("optical")}\nviewer.setActiveHiPS(layer);\nviewer.setHiPSOpacity(layer, 1);\nviewer.setHiPSOpacity(nearInfrared, 0.65);`,
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
    "07 / Scientific view state",
    "M101 · Hubble ACS",
    "Load the HST pointed-image mosaic. Its native tiles have a negative display and retain their observation boundaries.",
    `${layerCommand("hstimage")}\nviewer.setActiveHiPS(layer);\nviewer.changeColorMap("native");\nviewer.setHiPSOpacity(layer, 1);`,
  );
  await fadeTo("hstimage", token);
  caption(
    "07 / Scientific view state",
    "M101 · Hubble sources",
    "Overlay real HSC v3 sources from a local fixture retrieved from MAST at this target.",
    "viewer.createCatalogue(...);\ncatalogue.addSources(rows, columns);\nviewer.showCatalogue(catalogue)",
  );
  await showM101Catalogue();
  await wait(1200, token);
  await captureSavedView(
    "A00-M101",
    "M101",
    "HST ACS · HSC v3 / MAST fixture · FoV 0.5°",
    token,
  );
  stateStackInteractive = true;
  renderStateStack();
  caption(
    "07 / Scientific view state",
    "Three saved views",
    "Each card restores a different scientific scene. The × button removes only the saved snapshot.",
    "viewer.getStateNames()",
  );
  viewer.getStateNames();
  await wait(1200, token);
  for (const id of ["A00-M51", "A00-M45", "A00-M101"]) {
    await clickSavedControl(`[data-state-restore="${id}"]`, token);
    await wait(2800, token);
  }
  audit.stateRestored = ["A00-M51", "A00-M45", "A00-M101"].every((id) =>
    audit.restoredStates.includes(id),
  );
  for (const id of ["A00-M51", "A00-M45", "A00-M101"]) {
    await clickSavedControl(`[data-state-delete="${id}"]`, token);
    await wait(900, token);
  }
  caption(
    "07 / Scientific view state",
    "State stack cleared",
    "All three saved snapshots are removed. Continue from the current sky.",
    "viewer.getStateNames(); // A00 snapshots removed",
  );
  await wait(900, token);
  stateStack.hidden = true;
  stateStackInteractive = false;
  hideInteraction();
  clearCatalogue();
  clearObservations();
}

async function scene08FITS(token: number): Promise<void> {
  // Herschel SPIRE 250 µm supports PNG and FITS tiles.
  // Keep the camera fixed to make the FITS processing comparison meaningful.
  const herschel = await ensureLayer("herschelfits");
  check(token);
  // The saved-view sequence ends on a narrow HST field near M101.
  // Restore a broad optical sky BEFORE travelling to Orion.
  showOnly("optical");
  viewer.changeColorMap("native");
  caption(
    "08 / FITS & color mapping",
    "From M101 to Orion",
    "Widen the optical field, travel to M42, then approach the Herschel field.",
    "await viewer.flyToFoV(45, 2200);\nviewer.flyTo(83.8221, -5.3911, 3200);\nawait viewer.flyToFoV(3.5, 2400)",
  );
  await viewer.flyToFoV(45, 2200);
  check(token);
  viewer.flyTo(83.8221, -5.3911, 3200);
  await wait(3500, token);
  await viewer.flyToFoV(3.5, 2400);
  check(token);
  // Fade from the optical sky to Herschel without a hard layer switch.
  if (!(await fadeTo("herschelfits", token))) return;
  viewer.changeHiPSFormat("png");
  viewer.changeColorMap("native");
  caption(
    "08 / FITS & color mapping",
    "Herschel SPIRE 250 µm — PNG",
    "Start with the image tiles of the same far-infrared survey.",
    'viewer.setActiveHiPS(herschel);\nviewer.setHiPSOpacity(herschel, 1);\nviewer.changeHiPSFormat("png");\nviewer.changeColorMap("native")',
  );
  await wait(3500, token);
  await prepareFITS(herschel, token);
  fitsModeBadge.hidden = false;
  caption(
    "08 / FITS & color mapping",
    "FITS — linear grayscale",
    "Unlike pre-rendered PNG tiles, FITS contains numerical intensity measurements. Linear stretch maps equal intensity differences to equal display steps; robust limits reduce the impact of extremes.",
    'viewer.changeColorMap("grayscale");\nviewer.setHiPSFITSScaleFunction("linear");\nviewer.setHiPSFITSRangeMode("robust")',
  );
  await wait(3500, token);
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
      "08 / FITS & color mapping",
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
    "08 / FITS & color mapping",
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
      "08 / FITS & color mapping",
      `Intensity stretch — ${stretch.name}`,
      stretch.description,
      `viewer.changeColorMap("planck");\nviewer.setHiPSFITSScaleFunction("${stretch.name}")`,
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
      "08 / FITS & color mapping",
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
  fitsModeBadge.hidden = true;
  viewer.changeHiPSFormat("png");
  showOnly("optical");
  viewer.changeColorMap("native");
  caption(
    "08 / FITS & color mapping",
    "Return to DSS Color",
    "Restore the optical survey after the FITS demonstration.",
    'viewer.changeHiPSFormat("png");\nviewer.setHiPSOpacity(herschel, 0);\nviewer.setActiveHiPS(optical);\nviewer.setHiPSOpacity(optical, 1);\nviewer.changeColorMap("native")',
  );
  await wait(1200, token);
}

async function scene09InsideSphere(token: number): Promise<void> {
  // M51 → Galactic Centre → M33 → M81/M82 → M31; fade the maps before changing perspective.
  await ensureLayer("sdss");
  await ensureLayer("ultraviolet");
  await ensureLayer("midinfrared");
  showOnly("optical");
  viewer.changeColorMap("native");
  setEquatorialGridVisible(false);
  viewer.resetAxesOrientation();
  caption(
    "09 / Inside the sphere",
    "M51 — widen the optical sky",
    "Frame M51 and widen the DSS field before entering the celestial sphere.",
    "viewer.resetAxesOrientation();\nawait viewer.flyToFoV(65, 2400);\nviewer.flyTo(202.469575, 47.195258, 3200);\nawait viewer.flyToFoV(120, 2400)",
  );
  // Never fly across the sky at the narrow Herschel FITS FoV.
  await viewer.flyToFoV(65, 2400);
  check(token);
  viewer.flyTo(202.469575, 47.195258, 3200);
  await wait(3500, token);
  await viewer.flyToFoV(120, 2400);
  caption(
    "09 / Inside the sphere",
    "Outside the celestial sphere",
    "Begin with the external view. We will enter the sphere and navigate with the equatorial grid as a spatial reference.",
    "await fadeHiPS(\"optical\", 1, 0, token);\nif (!viewer.getInsideSphere()) viewer.toggleInsideSphere();\nawait fadeHiPS(\"optical\", 0, 1, token)",
  );
  await wait(900, token);

  await fadeHiPS("optical", 1, 0, token);

  try {
    if (!viewer.getInsideSphere()) viewer.toggleInsideSphere();

    await fadeHiPS("optical", 0, 1, token);
    await wait(1600, token);

    setEquatorialGridVisible(true);
    caption(
      "09 / Inside the sphere",
      "Inside — equatorial grid",
      "The camera now looks outward from within the celestial sphere. Right ascension and declination lines help reveal its surrounding geometry.",
      "setEquatorialGridVisible(true)",
    );
    await wait(1000, token);

    caption(
      "09 / Inside the sphere",
      "Towards the Galactic Centre",
      "Navigate across the interior sky towards the Milky Way's Galactic Centre, keeping the coordinate grid visible.",
      "viewer.flyTo(266.4051, -28.936175, 3200)",
    );
    viewer.flyTo(266.4051, -28.936175, 3200);
    await wait(3500, token);

    // Keep the preferred field here after comparing the three candidates.
    const galaxies = [
      // { name: "M33", ra: 23.4621, dec: 30.66, fov: 1.2 },
      { name: "M81 / M82", ra: 148.93, dec: 69.37, fov: 1.2 },
      // { name: "M31", ra: 10.6847, dec: 41.269, fov: 3 },
    ];

    for (const field of galaxies) {
      caption(
        "09 / Inside the sphere",
        `Travel to ${field.name}`,
        "Restore DSS and frame the next galaxy comparison.",
        `viewer.flyTo(${field.ra}, ${field.dec}, 3200);\nawait viewer.flyToFoV(${field.fov}, 2200)`,
      );
      await fadeTo("optical", token);
      viewer.flyTo(field.ra, field.dec, 3200);
      await wait(3500, token);
      await viewer.flyToFoV(field.fov, 2200);
      setEquatorialGridVisible(false);
      caption(
        "09 / Inside the sphere",
        `${field.name} — DSS Color`,
        `Optical baseline · FoV ${field.fov}°`,
        'viewer.setActiveHiPS(optical);\nviewer.changeColorMap("native")',
      );
      viewer.setActiveHiPS(layers.get("optical")!);
      viewer.changeColorMap("native");
      await wait(1000, token);
      caption(
        "09 / Inside the sphere",
        `${field.name} — SDSS Color`,
        "Compare the optical surveys before adding ultraviolet and infrared light.",
        'await fadeTo("sdss", token);\nviewer.changeColorMap("native")',
      );
      await fadeTo("sdss", token);
      viewer.changeColorMap("native");
      await wait(1000, token);

      for (const key of ["ultraviolet", "midinfrared"] as const) {
        const overlay = layers.get(key)!;
        const label = key === "ultraviolet" ? "GALEX" : "AllWISE";
        viewer.setActiveHiPS(overlay);
        viewer.changeColorMap("native");
        for (const [from, to] of [
          [0, 0.65],
          [0.65, 0.25],
          [0.25, 0.8],
        ]) {
          caption(
            "09 / Inside the sphere",
            `${field.name} — SDSS + ${label} · ${Math.round(to * 100)}%`,
            "Compare the same opacity levels across all three fields. The provenance box identifies the visible bands.",
            `viewer.setActiveHiPS(overlay);\nawait fadeHiPS("${key}", ${from}, ${to}, token, 2200, 40)`,
          );
          await fadeHiPS(key, from, to, token, 2200, 40);
          await wait(900, token);
        }
        caption(
          "09 / Inside the sphere",
          `${field.name} — fade out ${label}`,
          "Return to the SDSS optical baseline.",
          `await fadeHiPS("${key}", 0.8, 0, token, 1800, 30)`,
        );
        await fadeHiPS(key, 0.8, 0, token, 1800, 30);
      }
    }

    caption(
      "09 / Inside the sphere",
      "Fade out — leave the sphere",
      "Fade the remaining optical map to zero before returning to the external view.",
      "await fadeHiPS(\"sdss\", 1, 0, token, 1800, 30);\nviewer.toggleInsideSphere();\nviewer.resetAxesOrientation()",
    );
    await fadeHiPS("sdss", 1, 0, token, 1800, 30);
    viewer.toggleInsideSphere();
    viewer.resetAxesOrientation();
    // Keep every map transparent while selecting the sole visible survey.
    const optical = layers.get("optical")!;
    viewer.setActiveHiPS(optical);
    activeKey = "optical";
    viewer.changeColorMap("native");
    caption(
      "09 / Inside the sphere",
      "Back outside — DSS Color",
      "Reveal DSS alone, then widen the field to show the celestial sphere.",
      "viewer.setActiveHiPS(optical);\nawait fadeHiPS(\"optical\", 0, 1, token, 2200, 40);\nawait viewer.flyToFoV(120, 4200)",
    );
    await fadeHiPS("optical", 0, 1, token, 2200, 40);
    await viewer.flyToFoV(120, 4200);
    await wait(1500, token);
  } finally {
    setEquatorialGridVisible(false);
    if (viewer.getInsideSphere()) viewer.toggleInsideSphere();
    viewer.resetAxesOrientation();
    showOnly("optical");
  }
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

async function scene10Ecosystem(token: number): Promise<void> {
  const diagram = get<HTMLElement>("ecosystem-diagram");
  diagram.classList.remove("ecosystem-expanded");
  diagram.innerHTML = `
    <div class="ecosystem-stage">
      <div class="ecosystem-demo diagram-node diagram-application">
        <b>Demo application</b><span>Orchestrates Viewer and Services</span>
      </div>
      <div class="ecosystem-branches" aria-hidden="true">
        <span></span><span></span>
      </div>
      <div class="ecosystem-pair">
        <div class="ecosystem-viewer">
          <h2>AstroViewer</h2>
          <p class="diagram-subtitle">Rendering · camera · HiPS · catalogues · footprints</p>
          <div class="diagram-arrow">↓ depends on</div>
          <div class="dependency-grid">
            <div class="diagram-node"><b>jsfitsio</b><span>FITS parsing</span></div>
            <div class="diagram-node"><b>wcslight</b><span>WCS utilities</span></div>
            <div class="diagram-node"><b>astrospatial-core</b><span>HEALPix · metadata</span></div>
          </div>
          <p class="diagram-note">wcslight also depends on jsfitsio and astrospatial-core.</p>
        </div>
        <div class="ecosystem-services">
          <div class="diagram-node"><b>Astrospatial Services</b><span>Adapters · TAP · discovery</span></div>
          <div class="diagram-arrow">↓</div>
          <div class="diagram-node ecosystem-external"><b>External services</b><span>Sesame · HiPS nodes · TAP</span></div>
        </div>
      </div>
    </div>`;
  diagram.hidden = false;
  caption(
    "10 / Technology & data ecosystem",
    "The viewer and its scientific foundations",
    "AstroViewer builds on FITS parsing, WCS utilities and shared scientific metadata.",
    "AstroViewer · jsfitsio · wcslight · astrospatial-core",
  );
  await wait(1800, token);
  caption(
    "10 / Technology & data ecosystem",
    "From scientific services to the sky",
    "The demo application uses AstroViewer and Astrospatial Services as separate components. Services communicates with external providers.",
    "parseJsonTable(data) → viewer.addCatalogue(table, options)",
  );
  diagram.classList.add("ecosystem-expanded");
  await wait(1900, token);
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
    title: "M42 — A multiwavelength view",
    run: scene02Spectrum,
  },
  { number: 3, title: "Three-layer compositing", run: scene03Compositing },
  { number: 4, title: "Equatorial & HEALPix grids", run: scene04Grids },
  {
    number: 5,
    title: "Catalogues & footprints (JSON / CSV)",
    run: scene05CataloguesAndFootprints,
  },
  { number: 6, title: "Live XMM TAP · ADQL", run: scene06LiveTAP },
  { number: 7, title: "Scientific view states", run: scene07SavedViews },
  { number: 8, title: "FITS & colour mapping", run: scene08FITS },
  {
    number: 9,
    title: "Inside the celestial sphere",
    run: scene09InsideSphere,
  },
  { number: 10, title: "Technology & data ecosystem", run: scene10Ecosystem },
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
    const atM42 = startScene >= 2 && startScene <= 4;
    const atM51 = startScene >= 5;
    viewer.goTo(
      atM42 ? 83.8221 : atM51 ? 202.469575 : 83.633083,
      atM42 ? -5.3911 : atM51 ? 47.195258 : 22.0145,
    );
    viewer.setFoV(
      startScene === 1
        ? 65
        : startScene <= 3
          ? 2.5
          : startScene === 4
            ? 60
            : startScene <= 7
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
    dataExample.hidden = true;
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
