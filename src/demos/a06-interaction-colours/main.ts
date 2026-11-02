/// <reference path="../../demo-window.d.ts" />

import {
  AstroViewer,
  ColumnType,
  MetadataColumn,
  MetadataManager,
  type CatalogueGL,
  type Footprint,
  type FootprintSetGL,
  type Source,
} from "astro-viewer";

type DemoMode = "video" | "interactive";

type FixtureColumn = {
  name: string;
  numeric?: boolean;
  unit?: string;
  description?: string;
};

type CatalogueFixture = {
  name: string;
  description: string;
  source: string;

  mapping: {
    ra: string;
    dec: string;
    name: string;
  };

  columns: FixtureColumn[];
  rows: Array<Array<string | number>>;
};

type FootprintFixture = {
  name: string;
  description: string;
  source: string;

  mapping: {
    ra: string;
    dec: string;
    name: string;
    footprint: string;
  };

  columns: FixtureColumn[];
  rows: Array<Array<string | number>>;
};

type InteractionState = "normal" | "hover" | "selected";


const M51_RA = 202.469575;
const M51_DEC = 47.195258;

const INTERACTION_BASE_COLOR = "#00D4FF";

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

const demoCursor = requiredElement<HTMLDivElement>("#demo-cursor");

const interactionStateElement =
  requiredElement<HTMLDivElement>("#interaction-state");

const stateNormal = requiredElement<HTMLDivElement>("#state-normal");

const stateHover = requiredElement<HTMLDivElement>("#state-hover");

const stateSelected = requiredElement<HTMLDivElement>("#state-selected");

controlsElement.hidden = demoMode === "video";

const viewer = new AstroViewer(canvas);

viewer.run();

let paused = false;
let running = false;

let catalogueFixture: CatalogueFixture | null = null;

let footprintFixture: FootprintFixture | null = null;

let catalogue: CatalogueGL | null = null;

let footprintSet: FootprintSetGL | null = null;

let catalogueSourceA: Source | null = null;

let catalogueSourceB: Source | null = null;

let footprintA: Footprint | null = null;

let footprintB: Footprint | null = null;

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
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
    statusElement.textContent = paused ? "Paused" : "Running A06";
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

function showDemoCursorAtCenter(): void {
  const rect = canvas.getBoundingClientRect();

  demoCursor.style.left = `${rect.width / 2}px`;

  demoCursor.style.top = `${rect.height / 2}px`;

  demoCursor.hidden = false;
}

function dispatchDemoMouseMove(x: number, y: number): void {
  const rect = canvas.getBoundingClientRect();
  const event = new MouseEvent("mousemove", {
    bubbles: true,
    clientX: rect.left + x,
    clientY: rect.top + y,
  });
  canvas.dispatchEvent(event);
  // AstroViewer's interaction layer may listen to pointer events instead.
  canvas.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: rect.left + x,
    clientY: rect.top + y,
  }));
}

async function moveDemoCursorIntoFootprint(): Promise<void> {
  const rect = canvas.getBoundingClientRect();
  const startX = rect.width * 0.12;
  const startY = rect.height * 0.12;
  const endX = rect.width / 2;
  const endY = rect.height / 2;
  demoCursor.style.transition = "none";
  demoCursor.style.left = `${startX}px`;
  demoCursor.style.top = `${startY}px`;
  demoCursor.hidden = false;
  dispatchDemoMouseMove(startX, startY);
  await demoWait(200);
  const steps = 35;
  for (let i = 1; i <= steps; i += 1) {
    await waitWhilePaused();
    const t = i / steps;
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;
    demoCursor.style.left = `${x}px`;
    demoCursor.style.top = `${y}px`;
    dispatchDemoMouseMove(x, y);
    await demoWait(25);
  }
}

function hideDemoCursor(): void {
  demoCursor.hidden = true;
}

function setLegendKind(kind: "catalogue" | "footprint"): void {
  interactionStateElement.dataset.kind = kind;
  const hex = INTERACTION_BASE_COLOR.slice(1);
  const base = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
  const target = luminance < 0.55 ? 1 : 0;
  const mix = (amount: number) => `rgb(${base.map((v) => Math.round((v + (target - v) * amount) * 255)).join(", ")})`;
  interactionStateElement.style.setProperty("--base-color", INTERACTION_BASE_COLOR);
  interactionStateElement.style.setProperty("--hover-color", mix(0.45));
  interactionStateElement.style.setProperty("--selected-color", mix(0.75));
}

function setInteractionState(state: InteractionState): void {
  interactionStateElement.classList.add("visible");

  stateNormal.classList.toggle("active", state === "normal");

  stateHover.classList.toggle("active", state === "hover");

  stateSelected.classList.toggle("active", state === "selected");
}

function hideInteractionState(): void {
  interactionStateElement.classList.remove("visible");

  stateNormal.classList.remove("active");

  stateHover.classList.remove("active");

  stateSelected.classList.remove("active");
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Unable to load ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

function createMetadata(
  columnsData: FixtureColumn[],
  mapping: {
    ra: string;
    dec: string;
    name: string;
    footprint?: string;
  },
): {
  columns: MetadataColumn[];
  manager: MetadataManager;
} {
  const columns = columnsData.map((column, index) => {
    let columnType = ColumnType.STRING;

    if (column.name === mapping.ra) {
      columnType = ColumnType.GEOM_RA;
    } else if (column.name === mapping.dec) {
      columnType = ColumnType.GEOM_DEC;
    } else if (mapping.footprint && column.name === mapping.footprint) {
      columnType = ColumnType.GEOM_FOOTPRINT;
    } else if (column.name === mapping.name) {
      columnType = ColumnType.MAIN_NAME;
    } else if (column.numeric) {
      columnType = ColumnType.NUMBER;
    }

    return new MetadataColumn({
      index,
      name: column.name,
      columnType,
      unit: column.unit ?? "",
      description: column.description ?? "",
    });
  });

  return {
    columns,
    manager: new MetadataManager(columns),
  };
}

function createCatalogue(): CatalogueGL {
  if (!catalogueFixture) {
    throw new Error("Catalogue fixture not loaded.");
  }

  const { columns, manager } = createMetadata(
    catalogueFixture.columns,
    catalogueFixture.mapping,
  );

  const created = viewer.createCatalogue(
    catalogueFixture.name,
    catalogueFixture.description,
    catalogueFixture.source,
    manager,
  );

  created.addSources(catalogueFixture.rows, columns);

  viewer.changeCatalogueColor(created, INTERACTION_BASE_COLOR);

  viewer.showCatalogue(created);

  return created;
}

function createFootprints(): FootprintSetGL {
  if (!footprintFixture) {
    throw new Error("Footprint fixture not loaded.");
  }

  const { columns, manager } = createMetadata(
    footprintFixture.columns,
    footprintFixture.mapping,
  );

  const created = viewer.createFootprintSet(
    footprintFixture.name,
    footprintFixture.description,
    footprintFixture.source,
    manager,
  );

  created.addFootprints(footprintFixture.rows, columns);

  viewer.changeFootprintSetColor(created, INTERACTION_BASE_COLOR);

  viewer.showFootprintSet(created);

  return created;
}

function angularDistanceSquared(
  raA: number,
  decA: number,
  raB: number,
  decB: number,
): number {
  const meanDec = (decA + decB) / 2;

  const cosDec = Math.cos((meanDec * Math.PI) / 180);

  const dra = (raA - raB) * cosDec;

  const ddec = decA - decB;

  return dra * dra + ddec * ddec;
}

function findSeparatedSources(cat: CatalogueGL, count: number): Source[] {
  if (cat.sources.length < count) {
    throw new Error(`At least ${count} catalogue sources are required.`);
  }
  const ordered = [...cat.sources].sort((a, b) =>
    angularDistanceSquared(a.point.raDeg, a.point.decDeg, M51_RA, M51_DEC) -
    angularDistanceSquared(b.point.raDeg, b.point.decDeg, M51_RA, M51_DEC),
  );
  const chosen = [ordered[0]];
  while (chosen.length < count) {
    const remaining = ordered.filter((source) => !chosen.includes(source));
    const next = remaining.reduce((best, candidate) => {
      const separation = (source: Source) => Math.min(...chosen.map((picked) =>
        angularDistanceSquared(source.point.raDeg, source.point.decDeg,
          picked.point.raDeg, picked.point.decDeg)));
      return separation(candidate) > separation(best) ? candidate : best;
    });
    chosen.push(next);
  }
  return chosen;
}

function footprintValue(
  footprint: Footprint,
  key: string,
): string | number | undefined {
  if (!footprintFixture) {
    return undefined;
  }

  const index = footprintFixture.columns.findIndex(
    (column) => column.name === key,
  );

  if (index < 0) {
    return undefined;
  }

  /*
   * Runtime compatibility:
   * Footprint.details is currently typed as FootprintDetail[],
   * while addFootprints() stores the raw fixture row values.
   */
  const details = footprint.details as unknown as Array<string | number>;

  return details[index];
}

function footprintNumber(footprint: Footprint, key: string): number {
  const value = Number(footprintValue(footprint, key));

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric footprint metadata "${key}": ${value}`);
  }

  return value;
}

function findSeparatedFootprints(set: FootprintSetGL, count: number): Footprint[] {
  const valid = set.footprintPolygons.filter((footprint) => footprint.valid);
  if (valid.length < count) {
    throw new Error(`At least ${count} valid footprints are required.`);
  }
  // Preserve the original first target (closest pair), then spread the rest.
  const [first] = findNearbyFootprints(set);
  const chosen = [first];
  while (chosen.length < count) {
    const remaining = valid.filter((footprint) => !chosen.includes(footprint));
    const separation = (footprint: Footprint) => Math.min(...chosen.map((picked) =>
      angularDistanceSquared(
        footprintNumber(footprint, "ra_deg"), footprintNumber(footprint, "dec_deg"),
        footprintNumber(picked, "ra_deg"), footprintNumber(picked, "dec_deg"),
      )));
    chosen.push(remaining.reduce((best, candidate) =>
      separation(candidate) > separation(best) ? candidate : best));
  }
  return chosen;
}

function findNearbyFootprints(set: FootprintSetGL): [Footprint, Footprint] {
  const valid = set.footprintPolygons.filter((footprint) => footprint.valid);
  let best: [Footprint, Footprint] | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const distance = angularDistanceSquared(
        footprintNumber(valid[i], "ra_deg"), footprintNumber(valid[i], "dec_deg"),
        footprintNumber(valid[j], "ra_deg"), footprintNumber(valid[j], "dec_deg"),
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [valid[i], valid[j]];
      }
    }
  }
  if (!best) throw new Error("Not enough valid footprints.");
  return best;
}

function clearCatalogue(): void {
  if (!catalogue) {
    return;
  }

  catalogue.clearSelection();

  if (catalogueSourceA) {
    catalogue.extHighlightSource(catalogueSourceA, false);
  }

  if (catalogueSourceB) {
    catalogue.extHighlightSource(catalogueSourceB, false);
  }

  viewer.deleteCatalogue(catalogue);

  catalogue = null;
  catalogueSourceA = null;
  catalogueSourceB = null;
}

function clearFootprints(): void {
  if (!footprintSet) {
    return;
  }

  footprintSet.clearSelection();

  if (footprintA) {
    footprintSet.extHighlightFootprint(footprintA, false);
  }

  if (footprintB) {
    footprintSet.extHighlightFootprint(footprintB, false);
  }

  viewer.deleteFootprintSet(footprintSet);

  footprintSet = null;
  footprintA = null;
  footprintB = null;
}

function clearScene(): void {
  clearCatalogue();
  clearFootprints();

  hideDemoCursor();
  hideInteractionState();
}

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  statusElement.textContent = "Resetting…";

  clearScene();

  viewer.goTo(M51_RA, M51_DEC);

  viewer.setFoV(0.2);

  await sleep(500);

  statusElement.textContent = "Ready";
}

async function resetForRun(): Promise<void> {
  clearScene();

  viewer.goTo(0, 0);

  viewer.setFoV(20);

  await demoWait(500);
}

async function runA06(): Promise<void> {
  if (running) {
    return;
  }

  running = true;

  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A06";

  try {
    await resetForRun();

    await showDemoTitle();

    await showLabel(
      "Navigate to M51",
      "Use M51 as the scientific field for comparing interaction states.",
      "viewer.flyTo(202.469575, 47.195258, 3000)",
      1400,
    );

    viewer.flyTo(M51_RA, M51_DEC, 3000);

    await demoWait(3200);

    await viewer.flyToFoV(0.2, 2200);

    await demoWait(700);

    /*
     * Catalogue interaction states
     */

    await showLabel(
      "Catalogue — normal state",
      "Load HSC sources using one common base colour.",
      `viewer.changeCatalogueColor(
  catalogue,
  "${INTERACTION_BASE_COLOR}"
)`,
      1700,
    );

    setLegendKind("catalogue");
    catalogue = createCatalogue();

    const catalogueTargets = findSeparatedSources(catalogue, 5);
    [catalogueSourceA, catalogueSourceB] = catalogueTargets;
    setInteractionState("normal");
    await demoWait(1800);

    await viewer.flyToFoV(0.2, 1100);
    for (let i = 0; i < catalogueTargets.length; i += 1) {
      const source = catalogueTargets[i];
      const willSelect = i < 3;
      await showLabel(
        willSelect ? `Catalogue — select ${i + 1} of 3` : `Catalogue — hover ${i - 2} of 2`,
        willSelect ? "Selection accumulates without clearing earlier sources." :
          "Hover is temporary; the three selected sources remain selected.",
        willSelect ? "catalogue.extAddSources2Selected(source)" :
          "catalogue.extHighlightSource(source, true)",
        850,
      );
      viewer.flyTo(source.point.raDeg, source.point.decDeg, 1250);
      await demoWait(1350);
      showDemoCursorAtCenter();
      catalogue.extHighlightSource(source, true);
      setInteractionState("hover");
      await demoWait(1000);
      if (willSelect) {
        catalogue.extAddSources2Selected(source);
        setInteractionState("selected");
        await demoWait(950);
      }
      catalogue.extHighlightSource(source, false);
    }
    hideDemoCursor();
    viewer.flyTo(M51_RA, M51_DEC, 1400);
    await demoWait(1500);
    setInteractionState("selected");
    await demoWait(2200);
    catalogue.clearSelection();
    setInteractionState("normal");
    await demoWait(700);

    /*
     * Transition from catalogue to footprints
     */

    viewer.deleteCatalogue(catalogue);

    catalogue = null;
    catalogueSourceA = null;
    catalogueSourceB = null;

    await viewer.flyToFoV(0.25, 1800);

    await showLabel(
      "Footprints — normal state",
      "Apply the same interaction model to HST observation footprints.",
      `viewer.changeFootprintSetColor(
  footprints,
  "${INTERACTION_BASE_COLOR}"
)`,
      1800,
    );

    setLegendKind("footprint");
    footprintSet = createFootprints();

    [footprintA, footprintB] = findNearbyFootprints(footprintSet);

    setInteractionState("normal");

    await demoWait(2800);

    /*
     * Footprint hover
     */

    const footprintARa = footprintNumber(footprintA, "ra_deg");

    const footprintADec = footprintNumber(footprintA, "dec_deg");

    await showLabel(
      "Footprint — hover",
      "Hover uses the same automatically derived interaction colour.",
      "footprints.extHighlightFootprint(footprintA, true)",
      1700,
    );

    viewer.flyTo(footprintARa, footprintADec, 1900);

    await demoWait(2000);

    await viewer.flyToFoV(0.06, 1500);

    await demoWait(500);

    await moveDemoCursorIntoFootprint();

    // Hover is driven by canvas picking during the simulated mouse movement.
    setInteractionState("hover");

    await demoWait(3000);

    /*
     * Footprint selection
     */

    await showLabel(
      "Footprint — selected",
      "Selected footprints retain the derived colour and add persistent geometric emphasis.",
      "footprints.extAddPolygons2Selected(footprintA)",
      1700,
    );

    footprintSet.extAddPolygons2Selected(footprintA);

    dispatchDemoMouseMove(-20, -20);

    setInteractionState("selected");

    await demoWait(3000);

    /* Select a second footprint, then show the complete M51 field. */
    const footprintTargets = findSeparatedFootprints(footprintSet, 5);
    const additional = footprintTargets.filter((footprint) => footprint !== footprintA);
    const second = additional[0];
    await showLabel(
      "Footprints — second selection",
      "Hover and select another observation while preserving the first.",
      "footprints.extAddPolygons2Selected(footprintB)", 1100,
    );
    viewer.flyTo(footprintNumber(second, "ra_deg"), footprintNumber(second, "dec_deg"), 1700);
    await demoWait(1850);
    await moveDemoCursorIntoFootprint();
    setInteractionState("hover");
    await demoWait(1050);
    footprintSet.extAddPolygons2Selected(second);
    dispatchDemoMouseMove(-20, -20);
    setInteractionState("selected");
    await demoWait(1250);
    hideDemoCursor();

    await showLabel(
      "Footprints — overview of M51",
      "Zoom out and recenter to see the galaxy and the observation footprints together.",
      "viewer.flyTo(M51_RA, M51_DEC, 1800)", 1300,
    );
    viewer.flyTo(M51_RA, M51_DEC, 1800);
    await demoWait(1900);
    await viewer.flyToFoV(0.25, 1700);
    await demoWait(1100);

    // At the overview scale, pan to each target while keeping the same FoV.
    // The simulated pointer movement invokes AstroViewer's actual picking path.
    for (let i = 1; i < additional.length; i += 1) {
      const footprint = additional[i];
      await showLabel(
        `Footprints — selection ${i + 2} of 5`,
        "Hover, then add the footprint to the persistent multi-selection.",
        "footprints.extAddPolygons2Selected(footprint)", 950,
      );
      viewer.flyTo(footprintNumber(footprint, "ra_deg"),
        footprintNumber(footprint, "dec_deg"), 1300);
      await demoWait(1450);
      await moveDemoCursorIntoFootprint();
      setInteractionState("hover");
      await demoWait(900);
      footprintSet.extAddPolygons2Selected(footprint);
      dispatchDemoMouseMove(-20, -20);
      setInteractionState("selected");
      await demoWait(1000);
      hideDemoCursor();
    }
    viewer.flyTo(M51_RA, M51_DEC, 1800);
    await demoWait(1900);
    setInteractionState("selected");
    await demoWait(2600);

    /*
     * End state
     */

    await showLabel(
      "A06 complete",
      "AstroViewer derives consistent hover and selection feedback from each dataset's base colour.",
      "",
      2400,
    );

    statusElement.textContent = "A06 complete";
  } catch (error) {
    console.error("[A06] Demo failed:", error);

    statusElement.textContent = "A06 failed";

    throw error;
  } finally {
    running = false;

    setPaused(false);
    updateControls();
  }
}

async function initialiseDemo(): Promise<void> {
  statusElement.textContent = "Loading data…";

  runButton.disabled = true;

  pauseButton.disabled = true;

  resetButton.disabled = true;

  const [loadedCatalogueFixture, loadedFootprintFixture] = await Promise.all([
    loadJson<CatalogueFixture>("./hsc_m51_sources.json"),

    loadJson<FootprintFixture>("./hst_m51_observations.json"),

    // viewer.loadHiPS("https://alasky.cds.unistra.fr/SDSS/DR9/band-r/"),
    viewer.loadHiPS("https://cdn.skies.esac.esa.int/DSSColor/")
  ]);

  catalogueFixture = loadedCatalogueFixture;

  footprintFixture = loadedFootprintFixture;

  window.astroViewerDemo!.ready = true;

  statusElement.textContent = "Ready";

  updateControls();

  console.log("[A06] Demo data ready.", {
    sources: catalogueFixture.rows.length,
    observations: footprintFixture.rows.length,
  });
}

runButton.addEventListener("click", () => {
  void runA06();
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

  runA06,
  reset,

  getCatalogue: () => catalogue,

  getFootprintSet: () => footprintSet,

  showLabel,
};

await initialiseDemo();

console.log("[A06] AstroViewer demo ready.", {
  mode: demoMode,
});