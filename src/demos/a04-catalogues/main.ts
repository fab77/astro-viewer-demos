import {
  AstroViewer,
  ColumnType,
  MetadataColumn,
  MetadataManager,
  type CatalogueGL,
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

  center: {
    ra: number;
    dec: number;
  };

  mapping: {
    ra: string;
    dec: string;
    name: string;
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

      runA04: () => Promise<void>;
      reset: () => Promise<void>;

      getCatalogue: () => CatalogueGL | null;

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

const metaMatchId = requiredElement<HTMLSpanElement>("#meta-match-id");

const metaRa = requiredElement<HTMLSpanElement>("#meta-ra");

const metaDec = requiredElement<HTMLSpanElement>("#meta-dec");

const metaKron = requiredElement<HTMLSpanElement>("#meta-kron");

const metaCi = requiredElement<HTMLSpanElement>("#meta-ci");

const metaFlux = requiredElement<HTMLSpanElement>("#meta-flux");

const metaExtinction = requiredElement<HTMLSpanElement>("#meta-extinction");

const demoCursor = requiredElement<HTMLDivElement>("#demo-cursor");

controlsElement.hidden = demoMode === "video";

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

let paused = false;
let running = false;

let fixture: CatalogueFixture | null = null;

let catalogue: CatalogueGL | null = null;

let focusSource: Source | null = null;

const viewer = new AstroViewer(canvas);

viewer.run();

async function waitWhilePaused(): Promise<void> {
  while (paused) {
    await sleep(50);
  }
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
    statusElement.textContent = paused ? "Paused" : "Running A04";
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

function columnIndex(name: string): number {
  if (!fixture) {
    return -1;
  }

  return fixture.columns.findIndex((column) => column.name === name);
}

function sourceValue(
  source: Source,
  columnName: string,
): string | number | undefined {
  const index = columnIndex(columnName);

  if (index < 0) {
    return undefined;
  }

  return source.details[index];
}

function numberText(value: string | number | undefined, digits = 4): string {
  if (typeof value === "number") {
    return value.toFixed(digits);
  }

  return value === undefined ? "—" : String(value);
}

function showSourceMetadata(source: Source): void {
  metaMatchId.textContent = numberText(sourceValue(source, "match_id"), 0);

  metaRa.textContent = `${numberText(sourceValue(source, "ra"), 6)}°`;

  metaDec.textContent = `${numberText(sourceValue(source, "dec"), 6)}°`;

  metaKron.textContent = `${numberText(
    sourceValue(source, "kron_radius"),
    3,
  )} arcsec`;

  metaCi.textContent = numberText(sourceValue(source, "ci"), 3);

  metaFlux.textContent = `${numberText(sourceValue(source, "flux"), 3)} mag`;

  metaExtinction.textContent = `${numberText(
    sourceValue(source, "extinction"),
    4,
  )} ABMag`;

  metadataHud.classList.add("visible");
}

function hideSourceMetadata(): void {
  metadataHud.classList.remove("visible");
}

async function loadFixture(): Promise<CatalogueFixture> {
  const response = await fetch("./hsc_m51_sources.json");

  if (!response.ok) {
    throw new Error(
      `Unable to load HSC fixture: ${response.status} ${response.statusText}`,
    );
  }

  const loaded = (await response.json()) as CatalogueFixture;

  if (
    !Array.isArray(loaded.columns) ||
    !Array.isArray(loaded.rows) ||
    loaded.rows.length === 0
  ) {
    throw new Error("Invalid or empty HSC fixture.");
  }

  return loaded;
}

function createMetadata(data: CatalogueFixture): {
  columns: MetadataColumn[];
  manager: MetadataManager;
} {
  const columns = data.columns.map((column, index) => {
    let columnType = ColumnType.STRING;

    if (column.name === data.mapping.ra) {
      columnType = ColumnType.GEOM_RA;
    } else if (column.name === data.mapping.dec) {
      columnType = ColumnType.GEOM_DEC;
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

function createCatalogue(): CatalogueGL {
  if (!fixture) {
    throw new Error("HSC fixture has not been loaded.");
  }

  const { columns, manager } = createMetadata(fixture);

  const created = viewer.createCatalogue(
    fixture.name,
    fixture.description,
    fixture.source,
    manager,
  );

  created.addSources(fixture.rows, columns);

  viewer.showCatalogue(created);

  return created;
}

function findNearestSourceToCenter(cat: CatalogueGL): Source {
  if (!fixture) {
    throw new Error("Fixture unavailable.");
  }

  const raIndex = columnIndex(fixture.mapping.ra);

  const decIndex = columnIndex(fixture.mapping.dec);

  const centerRa = fixture.center.ra;

  const centerDec = fixture.center.dec;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  fixture.rows.forEach((row, index) => {
    const ra = Number(row[raIndex]);

    const dec = Number(row[decIndex]);

    const cosDec = Math.cos((centerDec * Math.PI) / 180);

    const dra = (ra - centerRa) * cosDec;

    const ddec = dec - centerDec;

    const distance = dra * dra + ddec * ddec;

    if (distance < bestDistance) {
      bestDistance = distance;

      bestIndex = index;
    }
  });

  const source = cat.sources[bestIndex];

  if (!source) {
    throw new Error("Unable to select HSC focus source.");
  }

  return source;
}

function clearCatalogue(): void {
  if (!catalogue) {
    return;
  }

  catalogue.clearSelection();

  if (focusSource) {
    catalogue.extHighlightSource(focusSource, false);
  }

  viewer.deleteCatalogue(catalogue);

  catalogue = null;
  focusSource = null;

  hideSourceMetadata();
}

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  statusElement.textContent = "Resetting…";

  clearCatalogue();

  viewer.goTo(202.469575, 47.195258);

  viewer.setFoV(0.25);

  await sleep(500);

  statusElement.textContent = "Ready";
}

async function resetForRun(): Promise<void> {
  clearCatalogue();

  viewer.goTo(0, 0);

  viewer.setFoV(20);

  await demoWait(500);
}

async function runA04(): Promise<void> {
  if (running) {
    return;
  }

  running = true;

  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A04";

  try {
    await resetForRun();

    await showDemoTitle();

    await showLabel(
      "Navigate to M51",
      "Move to the Whirlpool Galaxy before overlaying source catalogue data.",
      "viewer.flyTo(202.469575, 47.195258, 3000)",
      1400,
    );

    viewer.flyTo(202.469575, 47.195258, 3000);

    await demoWait(3200);

    await showLabel(
      "Frame the catalogue field",
      "Use a 0.25° field of view around M51.",
      "await viewer.flyToFoV(0.25, 2400)",
      1400,
    );

    await viewer.flyToFoV(0.25, 2400);
    await demoWait(800);

    await showLabel(
      "Load Hubble Source Catalog",
      "Display 40 HSC sources retrieved from the ESASky TAP service around M51.",
      `const catalogue = viewer.createCatalogue(...)
catalogue.addSources(rows, columns)
viewer.showCatalogue(catalogue)`,
      1900,
    );

    catalogue = createCatalogue();

    focusSource = findNearestSourceToCenter(catalogue);

    await demoWait(2600);

    await showLabel(
      "Change catalogue colour",
      "Apply a common base colour to the source catalogue.",
      `viewer.changeCatalogueColor(
  catalogue,
  "#ffd166"
)`,
      1600,
    );

    viewer.changeCatalogueColor(catalogue, "#ffd166");

    await demoWait(2200);

    await showLabel(
      "Size by Concentration Index",
      "Scale catalogue symbols using the HSC Concentration Index.",
      `viewer.setCatalogueShapeSize(
  catalogue,
  "ci"
)`,
      1700,
    );
    viewer.setCatalogueShapeSize(catalogue, "ci");
    await demoWait(2800);

    await showLabel(
      "Hue by Flux",
      "Use source magnitude to encode an additional catalogue property through colour.",
      `viewer.setCatalogueShapeHue(
  catalogue,
  "flux"
)`,
      1700,
    );
    viewer.setCatalogueShapeHue(catalogue, "flux");
    await demoWait(2800);

    const focusRa = Number(sourceValue(focusSource, "ra"));
    const focusDec = Number(sourceValue(focusSource, "dec"));

    await showLabel(
      "Inspect a catalogue source",
      "Zoom into one HSC source and inspect its scientific metadata.",
      `viewer.flyTo(sourceRa, sourceDec, 2200)
await viewer.flyToFoV(0.08, 1800)`,
      1600,
    );
    viewer.flyTo(focusRa, focusDec, 2200);
    await demoWait(2300);
    await viewer.flyToFoV(0.08, 1800);
    await demoWait(700);
    showDemoCursorAtCenter();
    catalogue.extHighlightSource(focusSource, true);
    showSourceMetadata(focusSource);
    await demoWait(4200);

    await showLabel(
      "Select the source",
      "Keep the highlighted HSC source selected for continued inspection.",
      "catalogue.extAddSources2Selected(source)",
      1600,
    );
    catalogue.extAddSources2Selected(focusSource);
    catalogue.extHighlightSource(focusSource, false);
    await demoWait(3200);

    hideDemoCursor();


    await showLabel(
      "Catalogue visibility",
      "Catalogue overlays can be hidden without removing their data.",
      "viewer.hideCatalogue(catalogue, false)",
      1500,
    );

    viewer.hideCatalogue(catalogue, false);

    await demoWait(1800);

    await showLabel(
      "Restore catalogue",
      "Restore the existing catalogue without reloading its sources.",
      "viewer.hideCatalogue(catalogue, true)",
      1500,
    );

    viewer.hideCatalogue(catalogue, true);

    await demoWait(2400);

    hideSourceMetadata();

    await showLabel(
      "A04 complete",
      "Create, style, inspect and select astronomical catalogue sources through AstroViewer.",
      "",
      2200,
    );

    statusElement.textContent = "A04 complete";
  } catch (error) {
    console.error("[A04] Demo failed:", error);

    statusElement.textContent = "A04 failed";

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

  console.log("[A04] HSC fixture loaded:", fixture.rows.length, "sources");
}

/*
 * Preserve real interactive hover behaviour as well:
 * when AstroViewer emits source-hovered, display the same metadata HUD.
 */
canvas.addEventListener("source-hovered", (event: Event) => {
  if (running) {
    return;
  }

  const detail = (
    event as CustomEvent<{
      source?: Source | null;
    }>
  ).detail;

  if (detail?.source) {
    showSourceMetadata(detail.source);
  } else {
    hideSourceMetadata();
  }
});

runButton.addEventListener("click", () => {
  console.log("[A04] Run clicked");

  void runA04();
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

  runA04,
  reset,

  getCatalogue: () => catalogue,

  showLabel,
};

await initialiseDemo();

console.log("[A04] AstroViewer demo ready.", {
  mode: demoMode,
});
