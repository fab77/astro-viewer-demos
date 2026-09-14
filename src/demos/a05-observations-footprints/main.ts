import {
  AstroViewer,
  ColumnType,
  MetadataColumn,
  MetadataManager,
  type Footprint,
  type FootprintSetGL,
} from "astro-viewer";

type DemoMode = "video" | "interactive";

type FixtureColumn = {
  name: string;
  numeric?: boolean;
  unit?: string;
  description?: string;
};

type FootprintFixture = {
  name: string;
  description: string;
  source: string;

  center?: {
    ra: number;
    dec: number;
  };

  mapping: {
    ra: string;
    dec: string;
    name: string;
    footprint: string;
  };

  columns: FixtureColumn[];
  rows: Array<Array<string | number>>;
};

declare global {
  interface Window {
    astroViewerDemo?: {
      viewer: AstroViewer;
      ready: boolean;
      mode: DemoMode;

      runA05: () => Promise<void>;
      reset: () => Promise<void>;

      getFootprintSet: () => FootprintSetGL | null;

      showLabel: (
        headline: string,
        detail?: string,
        apiCommand?: string,
        durationMs?: number,
      ) => Promise<void>;
    };
  }
}

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

const M51_RA = 202.469575;

const M51_DEC = 47.195258;

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

const metadataHud = requiredElement<HTMLDivElement>("#metadata-hud");

const demoCursor = requiredElement<HTMLDivElement>("#demo-cursor");

const metaObservationId = requiredElement<HTMLSpanElement>(
  "#meta-observation-id",
);

const metaTarget = requiredElement<HTMLSpanElement>("#meta-target");

const metaInstrument = requiredElement<HTMLSpanElement>("#meta-instrument");

const metaCollection = requiredElement<HTMLSpanElement>("#meta-collection");

const metaType = requiredElement<HTMLSpanElement>("#meta-type");

const metaFilter = requiredElement<HTMLSpanElement>("#meta-filter");

const metaStart = requiredElement<HTMLSpanElement>("#meta-start");

const metaExposure = requiredElement<HTMLSpanElement>("#meta-exposure");

const metaRa = requiredElement<HTMLSpanElement>("#meta-ra");

const metaDec = requiredElement<HTMLSpanElement>("#meta-dec");

controlsElement.hidden = demoMode === "video";

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

let paused = false;
let running = false;

let fixture: FootprintFixture | null = null;

let footprintSet: FootprintSetGL | null = null;

let focusFootprint: Footprint | null = null;

let selectionFootprint: Footprint | null = null;

const viewer = new AstroViewer(canvas);

viewer.run();

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
    statusElement.textContent = paused ? "Paused" : "Running A05";
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

function hideDemoCursor(): void {
  demoCursor.hidden = true;
}

function textValue(value: string | number | undefined): string {
  return value === undefined ? "—" : String(value);
}

function numberValue(value: string | number | undefined, digits = 4): string {
  if (typeof value === "number") {
    return value.toFixed(digits);
  }

  return value === undefined ? "—" : String(value);
}

function showObservationMetadata(footprint: Footprint): void {
  metaObservationId.textContent = textValue(
    footprintValue(footprint, "observation_id"),
  );

  metaTarget.textContent = textValue(footprintValue(footprint, "target_name"));

  metaInstrument.textContent = textValue(
    footprintValue(footprint, "instrument_name"),
  );

  metaCollection.textContent = textValue(
    footprintValue(footprint, "collection"),
  );

  metaType.textContent = textValue(footprintValue(footprint, "obs_type"));

  metaFilter.textContent = textValue(footprintValue(footprint, "filter"));

  metaStart.textContent = textValue(footprintValue(footprint, "start_time"));

  metaExposure.textContent = `${numberValue(
    footprintValue(footprint, "exposure_duration"),
    0,
  )} s`;

  metaRa.textContent = `${numberValue(
    footprintValue(footprint, "ra_deg"),
    6,
  )}°`;

  metaDec.textContent = `${numberValue(
    footprintValue(footprint, "dec_deg"),
    6,
  )}°`;

  metadataHud.classList.add("visible");
}

function hideObservationMetadata(): void {
  metadataHud.classList.remove("visible");
}

async function loadFixture(): Promise<FootprintFixture> {
  const response = await fetch("./hst_m51_observations.json");

  if (!response.ok) {
    throw new Error(
      `Unable to load HST fixture: ${response.status} ${response.statusText}`,
    );
  }

  const loaded = (await response.json()) as FootprintFixture;

  if (
    !Array.isArray(loaded.columns) ||
    !Array.isArray(loaded.rows) ||
    loaded.rows.length === 0
  ) {
    throw new Error("Invalid or empty HST fixture.");
  }

  return loaded;
}

function createMetadata(data: FootprintFixture): {
  columns: MetadataColumn[];
  manager: MetadataManager;
} {
  const columns = data.columns.map((column, index) => {
    let columnType = ColumnType.STRING;

    if (column.name === data.mapping.ra) {
      columnType = ColumnType.GEOM_RA;
    } else if (column.name === data.mapping.dec) {
      columnType = ColumnType.GEOM_DEC;
    } else if (column.name === data.mapping.footprint) {
      columnType = ColumnType.GEOM_FOOTPRINT;
    } else if (column.name === data.mapping.name) {
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

function createObservationFootprintSet(): FootprintSetGL {
  if (!fixture) {
    throw new Error("HST fixture has not been loaded.");
  }

  const { columns, manager } = createMetadata(fixture);

  const created = viewer.createFootprintSet(
    fixture.name,
    fixture.description,
    fixture.source,
    manager,
  );

  created.addFootprints(fixture.rows, columns);

  viewer.showFootprintSet(created);

  return created;
}

function findDemoFootprints(set: FootprintSetGL): {
  focusFootprint: Footprint;
  selectionFootprint: Footprint;
} {
  const validFootprints = set.footprintPolygons.filter(
    (footprint) => footprint.valid,
  );

  if (validFootprints.length < 2) {
    throw new Error("Not enough valid HST footprints for the demo.");
  }

  const focusFootprint = validFootprints[0];

  const selectionFootprint =
    validFootprints[Math.floor(validFootprints.length * 0.65)];

  if (
    !focusFootprint ||
    !selectionFootprint ||
    focusFootprint === selectionFootprint
  ) {
    throw new Error("Unable to select two distinct HST footprints.");
  }

  return {
    focusFootprint,
    selectionFootprint,
  };
}

function footprintValue(
  footprint: Footprint,
  key: string,
): string | number | undefined {
  if (!fixture) {
    return undefined;
  }

  const index = fixture.columns.findIndex((column) => column.name === key);

  if (index < 0) {
    return undefined;
  }

  // Footprint.details is typed as FootprintDetail[], but addFootprints()
  // currently stores the raw fixture row values at runtime.
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

function clearFootprintSet(): void {
  if (!footprintSet) {
    return;
  }

  footprintSet.clearSelection();

  if (focusFootprint) {
    footprintSet.extHighlightFootprint(focusFootprint, false);
  }

  viewer.deleteFootprintSet(footprintSet);

  footprintSet = null;
  focusFootprint = null;
  selectionFootprint = null;

  hideDemoCursor();
  hideObservationMetadata();
}

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  statusElement.textContent = "Resetting…";

  clearFootprintSet();

  viewer.goTo(M51_RA, M51_DEC);

  viewer.setFoV(0.5);

  await sleep(500);

  statusElement.textContent = "Ready";
}

async function resetForRun(): Promise<void> {
  clearFootprintSet();

  viewer.goTo(0, 0);

  viewer.setFoV(20);

  await demoWait(500);
}

async function runA05(): Promise<void> {
  if (running) {
    return;
  }

  running = true;

  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A05";

  try {
    await resetForRun();

    await showDemoTitle();

    await showLabel(
      "Navigate to M51",
      "Move to the Whirlpool Galaxy before overlaying HST observation coverage.",
      "viewer.flyTo(202.469575, 47.195258, 3000)",
      1400,
    );

    viewer.flyTo(M51_RA, M51_DEC, 3000);

    await demoWait(3200);

    await showLabel(
      "Frame the observation field",
      "Use a 0.5° field of view to inspect the HST coverage around M51.",
      "await viewer.flyToFoV(0.5, 2200)",
      1400,
    );

    await viewer.flyToFoV(0.5, 2200);

    await demoWait(800);

    await showLabel(
      "Load HST observations",
      "Display 40 HST observations using their real STC-S footprint geometry.",
      `const footprints = viewer.createFootprintSet(...)
footprints.addFootprints(rows, columns)
viewer.showFootprintSet(footprints)`,
      1900,
    );

    footprintSet = createObservationFootprintSet();

    const demoFootprints = findDemoFootprints(footprintSet);

    focusFootprint = demoFootprints.focusFootprint;

    selectionFootprint = demoFootprints.selectionFootprint;

    await demoWait(3000);

    await showLabel(
      "Change footprint colour",
      "Apply a high-contrast colour to the HST observation coverage.",
      `viewer.changeFootprintSetColor(
  footprints,
  "#ff9f1c"
)`,
      1600,
    );
    viewer.changeFootprintSetColor(footprintSet, "#ff9f1c");

    await demoWait(2400);

    const focusRa = footprintNumber(focusFootprint, "ra_deg");

    const focusDec = footprintNumber(focusFootprint, "dec_deg");

    await showLabel(
      "Inspect an HST observation",
      "Zoom into one observation footprint and inspect its archive metadata.",
      `viewer.flyTo(observationRa, observationDec, 2200)
await viewer.flyToFoV(0.08, 1800)`,
      1700,
    );

    viewer.flyTo(focusRa, focusDec, 2200);

    await demoWait(2300);

    await viewer.flyToFoV(0.08, 1800);

    await demoWait(800);

    showDemoCursorAtCenter();

    footprintSet.extHighlightFootprint(focusFootprint, true);

    showObservationMetadata(focusFootprint);

    await demoWait(4400);

    footprintSet.extHighlightFootprint(focusFootprint, false);

    hideObservationMetadata();
    hideDemoCursor();

    const selectionRa = footprintNumber(selectionFootprint, "ra_deg");

    const selectionDec = footprintNumber(selectionFootprint, "dec_deg");

    await showLabel(
      "Select another observation",
      "Move to a different HST observation and keep its footprint selected.",
      `viewer.flyTo(selectionRa, selectionDec, 2200)
await viewer.flyToFoV(0.06, 1600)
footprints.extAddPolygons2Selected(footprint)`,
      1700,
    );

    viewer.flyTo(selectionRa, selectionDec, 2200);

    await demoWait(2300);

    await viewer.flyToFoV(0.06, 1600);

    await demoWait(600);

    showDemoCursorAtCenter();

    footprintSet.extAddPolygons2Selected(selectionFootprint);

    showObservationMetadata(selectionFootprint);

    await demoWait(3600);

    hideDemoCursor();

    await showLabel(
      "Hide observation coverage",
      "Temporarily hide the footprint layer without deleting the observations.",
      "viewer.hideFootprintSet(footprints, false)",
      1500,
    );

    viewer.hideFootprintSet(footprintSet, false);

    await demoWait(1800);

    await showLabel(
      "Restore observation coverage",
      "Restore the existing footprint layer without reloading the data.",
      "viewer.hideFootprintSet(footprints, true)",
      1500,
    );

    viewer.hideFootprintSet(footprintSet, true);

    await demoWait(2400);

    hideObservationMetadata();

    await showLabel(
      "A05 complete",
      "Load, style, inspect and select real HST observation footprints through AstroViewer.",
      "",
      2200,
    );

    statusElement.textContent = "A05 complete";
  } catch (error) {
    console.error("[A05] Demo failed:", error);

    statusElement.textContent = "A05 failed";

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

  const [loadedFixture] = await Promise.all([
    loadFixture(),

    viewer.loadHiPS("https://alasky.cds.unistra.fr/SDSS/DR9/band-r/"),
  ]);

  fixture = loadedFixture;

  window.astroViewerDemo!.ready = true;

  statusElement.textContent = "Ready";

  updateControls();

  console.log("[A05] HST fixture loaded:", fixture.rows.length, "observations");
}

runButton.addEventListener("click", () => {
  console.log("[A05] Run clicked");

  void runA05();
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

  runA05,
  reset,

  getFootprintSet: () => footprintSet,

  showLabel,
};

await initialiseDemo();

console.log("[A05] AstroViewer demo ready.", {
  mode: demoMode,
});
