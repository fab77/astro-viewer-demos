/// <reference path="../../demo-window.d.ts" />
import {
  AstroViewer,
  ColumnType,
  HiPS,
  MetadataColumn,
  MetadataManager,
  type CatalogueGL,
  type FootprintSetGL,
} from "astro-viewer";

type Fixture = {
  name: string;
  description: string;
  source: string;
  mapping: { ra: string; dec: string; name: string; footprint?: string };
  columns: {
    name: string;
    numeric?: boolean;
    unit?: string;
    description?: string;
  }[];
  rows: (string | number)[][];
};
type Scene = {
  astronomyCatalogues: CatalogueGL[];
  astronomyFootprintSets: FootprintSetGL[];
};
const canvas = document.querySelector<HTMLCanvasElement>("#astrocanvas")!;
const results = document.querySelector<HTMLOListElement>("#results")!;
const summary = document.querySelector<HTMLElement>("#summary")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
const label = document.querySelector<HTMLElement>("#demo-label")!;
const headline = label.querySelector<HTMLElement>(".headline")!;
const detail = label.querySelector<HTMLElement>(".detail")!;
const command = label.querySelector<HTMLElement>(".api-command")!;
const report = document.querySelector<HTMLDetailsElement>("#report")!;
const viewer = new AstroViewer(canvas);
viewer.run();
// Read-only access to scene membership for integration assertions; not a production API.
const scene = (viewer as unknown as { astroSphere: Scene }).astroSphere;
let failures = 0;
let previousResources: { cat: CatalogueGL; fp: FootprintSetGL } | undefined;
function check(name: string, condition: boolean, detail = "") {
  const li = document.createElement("li");
  li.className = condition ? "pass" : "fail";
  li.textContent = `${condition ? "PASS" : "FAIL"} — ${name}${detail ? " — " + detail : ""}`;
  results.append(li);
  console[condition ? "log" : "error"](li.textContent);
  if (!condition) failures++;
}
function note(message: string) {
  const li = document.createElement("li");
  li.className = "info";
  li.textContent = message;
  results.append(li);
}
function metadata(f: Fixture) {
  const columns = f.columns.map(
    (c, index) =>
      new MetadataColumn({
        index,
        name: c.name,
        columnType:
          c.name === f.mapping.ra
            ? ColumnType.GEOM_RA
            : c.name === f.mapping.dec
              ? ColumnType.GEOM_DEC
              : c.name === f.mapping.footprint
                ? ColumnType.GEOM_FOOTPRINT
                : c.name === f.mapping.name
                  ? ColumnType.MAIN_NAME
                  : c.numeric
                    ? ColumnType.NUMBER
                    : ColumnType.STRING,
        unit: c.unit ?? "",
        description: c.description ?? "",
      }),
  );
  return { columns, manager: new MetadataManager(columns) };
}
async function fixture(path: string): Promise<Fixture> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
async function createResources() {
  const cf = await fixture("./hsc_m51_sources.json");
  const ff = await fixture("./hst_m51_observations.json");
  const cm = metadata(cf);
  const fm = metadata(ff);
  const cat = viewer.createCatalogue(
    cf.name,
    cf.description,
    cf.source,
    cm.manager,
  );
  cat.addSources(cf.rows, cm.columns);
  const fp = viewer.createFootprintSet(
    ff.name,
    ff.description,
    ff.source,
    fm.manager,
  );
  fp.addFootprints(ff.rows, fm.columns);
  return { cat, fp };
}
const near = (a: number, b: number, epsilon = 0.05) =>
  Math.abs(a - b) < epsilon;
const M51 = [202.469575, 47.195258] as const;
const M101 = [210.8023, 54.3489] as const;
const SDSS = "https://skies.esac.esa.int/SDSS9Color/";
const GALEX =
  "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor/";
function layers() {
  return viewer
    .getActiveHiPSLayers()
    .map((h) => ({ url: h.baseURL, opacity: h.opacity, format: h.format }));
}
function center() {
  const p = viewer.getCenterCoordinates();
  return p ? JSON.stringify(p) : "unavailable";
}
function centerNear(target: readonly [number, number], tolerance = 0.3) {
  const c = viewer.getCenterCoordinates()?.astroDeg;
  return (
    !!c &&
    Math.abs(((c.ra - target[0] + 540) % 360) - 180) < tolerance &&
    Math.abs(c.dec - target[1]) < tolerance
  );
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function stage(
  title: string,
  description: string,
  api: string,
  duration = 2300,
) {
  headline.textContent = title;
  detail.textContent = description;
  command.textContent = api;
  label.classList.add("visible");
  await wait(duration);
}
// Keep the fly and the zoom as separate, observable operations.
async function flyAndZoom(
  target: readonly [number, number],
  finalFov: number,
  name: string,
) {
  const flyDuration = 4500;
  await stage(
    `Fly to ${name}`,
    `Move across the sky at a wide field of view before zooming in.`,
    `viewer.flyTo(${target[0]}, ${target[1]}, ${flyDuration})`,
    400,
  );
  viewer.flyTo(target[0], target[1], flyDuration);
  await wait(flyDuration + 600);
  check(`${name} camera center`, centerNear(target), center());

  const initialFov = viewer.getFoV().minFoV;
  const zoomDuration = 4500;

  headline.textContent = `Zoom into ${name}`;
  detail.textContent = `Gradually reduce the field of view from ${initialFov.toFixed(1)}° to ${finalFov}°.`;
  command.textContent = `await viewer.flyToFoV(${finalFov}, ${zoomDuration})`;

  await viewer.flyToFoV(finalFov, zoomDuration);
  await wait(1300);

}
async function run() {
  button.disabled = true;
  failures = 0;
  results.replaceChildren();
  report.open = false;
  if (previousResources) {
    viewer.deleteCatalogue(previousResources.cat);
    viewer.deleteFootprintSet(previousResources.fp);
    previousResources = undefined;
  }
  //   viewer.clearStates();
  let cat: CatalogueGL | undefined;
  let fp: FootprintSetGL | undefined;
  try {
    viewer.removeAllHiPS();
    viewer.goTo(0, 0);
    viewer.setFoV(70);
    await stage(
      "The celestial sphere",
      "Starting from a wide-field view before travelling to M51.",
      "viewer.goTo(0, 0)\nviewer.setFoV(70)",
      1600,
    );
    const sdss = await viewer.addHiPSFromUrl(SDSS);
    viewer.setHiPSOpacity(sdss, 1);
    await stage(
      "M51 — SDSS survey",
      "Use the SDSS optical HiPS layer as the only survey for M51.",
      "const sdss = await viewer.addHiPSFromUrl(SDSS)\nviewer.setHiPSOpacity(sdss, 1)",
      2000,
    );
    await flyAndZoom(M51, 0.5, "M51");
    ({ cat, fp } = await createResources());
    previousResources = { cat, fp };
    viewer.changeCatalogueColor(cat, "#00d4ff");
    viewer.changeFootprintSetColor(fp, "#ffcc00");
    viewer.showCatalogue(cat);
    viewer.hideCatalogue(cat, true);
    await stage(
      "Show M51 catalogue",
      "Display HSC sources around the galaxy.",
      "viewer.showCatalogue(cat)",
      3000,
    );
    viewer.showFootprintSet(fp);
    viewer.hideFootprintSet(fp, true);
    await stage(
      "Show M51 footprints",
      "Add HST observation footprints after the catalogue.",
      "viewer.showFootprintSet(fp)",
      3000,
    );
    const m51Layers = layers();
    viewer.saveState("M51");
    check("M51 snapshot registered", viewer.hasState("M51"));
    check(
      "M51 has SDSS only",
      m51Layers.length === 1 &&
        m51Layers[0].url.replace(/\/+$/, "") === SDSS.replace(/\/+$/, ""),
    );
    check(
      "M51 resource membership",
      scene.astronomyCatalogues.includes(cat) &&
        scene.astronomyFootprintSets.includes(fp),
    );
    await stage(
      "Save M51",
      "Capture the camera, HiPS layers, catalogue and footprints.",
      'viewer.saveState("M51")',
      3000,
    );
    viewer.deleteCatalogue(cat);
    await stage(
      "Remove M51 catalogue",
      "Detach the catalogue while preserving it in the saved state.",
      "viewer.deleteCatalogue(cat)",
      2300,
    );
    viewer.deleteFootprintSet(fp);
    await stage(
      "Remove M51 footprints",
      "Detach the footprints before travelling to M101.",
      "viewer.deleteFootprintSet(fp)",
      2300,
    );
    check(
      "Resources detached",
      !scene.astronomyCatalogues.includes(cat) &&
        !scene.astronomyFootprintSets.includes(fp),
    );
    // Preserve SDSS and add GALEX as a second layer: no blank frame from resetting the base map.
    const galex = await viewer.addHiPSFromUrl(GALEX);
    viewer.setHiPSOpacity(galex, 0);
    viewer.setActiveHiPS(sdss);
    await stage(
      "M101 — SDSS + GALEX",
      "Keep SDSS visible and overlay GALEX at 65% opacity, without reloading SDSS.",
      "const galex = await viewer.addHiPSFromUrl(GALEX)\nviewer.setHiPSOpacity(galex, 0)\nviewer.setActiveHiPS(sdss)",
      2800,
    );
    await flyAndZoom(M101, 1.3, "M101");
    headline.textContent = "M101 — GALEX ultraviolet overlay";
    detail.textContent =
      "Gradually reveal GALEX ultraviolet observations over the SDSS optical survey.";
    command.textContent = "await viewer.fadeHiPSOpacity(galex, 0.65, 2500);";

    // await fadeHiPSOpacity(viewer, galex, 0, 0.65, 2500);
    await viewer.fadeHiPSOpacity(galex, 0.65, 2500);
    await wait(3000);
    viewer.saveState("M101");
    check("M101 snapshot registered", viewer.hasState("M101"));
    const m101Layers = layers();
    check(
      "M101 has SDSS + GALEX",
      m101Layers.length === 2 &&
        m101Layers[0].url.replace(/\/+$/, "") === SDSS.replace(/\/+$/, "") &&
        m101Layers[1].url.replace(/\/+$/, "") === GALEX.replace(/\/+$/, ""),
    );
    await stage(
      "Save M101",
      "The second snapshot has a different camera, FoV, two HiPS layers and no M51 resources.",
      'viewer.saveState("M101")',
      3000,
    );
    await viewer.restoreState("M51");
    check(
      "Restored HiPS layer order",
      layers()
        .map((x) => x.url)
        .join("|") === m51Layers.map((x) => x.url).join("|"),
    );
    check(
      "Restored HiPS opacity",
      layers().every((x, i) => near(x.opacity, m51Layers[i].opacity, 0.001)),
    );
    check(
      "Restored catalogue identity",
      scene.astronomyCatalogues.length === 1 &&
        scene.astronomyCatalogues[0] === cat,
    );
    check(
      "Restored footprint identity",
      scene.astronomyFootprintSets.length === 1 &&
        scene.astronomyFootprintSets[0] === fp,
    );
    check("Restored resource visibility", cat.isVisible && fp.isVisible);
    check(
      "Restored resource colors",
      cat.shapeColor === "#00d4ff" && fp.shapeColor === "#ffcc00",
    );
    check("Restored FoV", near(viewer.getFoV().minFoV, 0.5, 0.15));
    check("Restored M51 camera center", centerNear(M51), center());
    await stage(
      "Restore M51",
      "Restore M51 camera, FoV, SDSS-only survey, HSC catalogue and HST footprints.",
      'await viewer.restoreState("M51")',
      3200,
    );
    await viewer.restoreState("M101");
    check("Restored M101 camera center", centerNear(M101), center());
    check(
      "Restored M101 resources absent",
      !scene.astronomyCatalogues.includes(cat) &&
        !scene.astronomyFootprintSets.includes(fp),
    );
    check(
      "Restored M101 HiPS layer order",
      layers()
        .map((x) => x.url)
        .join("|") === m101Layers.map((x) => x.url).join("|"),
    );
    check(
      "Restored M101 HiPS opacity",
      layers().every((x, i) => near(x.opacity, m101Layers[i].opacity, 0.001)),
    );
    await stage(
      "Restore M101",
      "Restore M101 camera, FoV, SDSS + GALEX, without catalogue or footprints.",
      'await viewer.restoreState("M101")',
      3200,
    );
    await viewer.restoreState("M51");
    check(
      "Idempotent catalogue membership",
      scene.astronomyCatalogues.length === 1 &&
        scene.astronomyCatalogues[0] === cat,
    );
    check(
      "Idempotent footprint membership",
      scene.astronomyFootprintSets.length === 1 &&
        scene.astronomyFootprintSets[0] === fp,
    );
    check(
      "Idempotent M51 SDSS-only layer",
      layers().length === 1 && layers()[0].url === m51Layers[0].url,
    );
    check("Idempotent M51 camera center", centerNear(M51), center());
    await stage(
      "State management verified",
      "Repeated restoration does not duplicate scene resources.",
      'await viewer.restoreState("M51")',
      2100,
    );
    check(
      "Delete M101 snapshot",
      viewer.deleteState("M101") && !viewer.hasState("M101"),
    );
    viewer.clearStates();
    check("Clear snapshots", viewer.getStateNames().length === 0);
    check(
      "Live resources survive snapshot deletion",
      scene.astronomyCatalogues.includes(cat) &&
        scene.astronomyFootprintSets.includes(fp),
    );
  } catch (e) {
    failures++;
    note(`ERROR: ${String(e)}`);
    console.error(e);
    report.open = true;
  } finally {
    summary.textContent = failures
      ? `${failures} failure(s) — see report`
      : "All assertions passed";
    summary.style.color = failures ? "#ff8c8c" : "#78e0a1";
    if (failures) report.open = true;
    button.disabled = false;
  }
}
button.addEventListener("click", () => void run());
(
  window as unknown as {
    stateDemo?: { viewer: AstroViewer; run: () => Promise<void> };
  }
).stateDemo = { viewer, run };
