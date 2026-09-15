/// <reference path="../../demo-window.d.ts" />

import {
  AstroViewer,
  ColumnType,
  MetadataColumn,
  MetadataManager,
  type CatalogueGL,
  type HiPS,
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

const SDSS_URL = "https://alasky.cds.unistra.fr/SDSS/DR9/band-r/";

const M51 = {
  ra: 202.469575,
  dec: 47.195258,
  fov: 0.25,
};

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required DOM element not found: ${selector}`);
  }

  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#astrocanvas");

const statusElement = requiredElement<HTMLDivElement>("#status");

const controlsElement = requiredElement<HTMLDivElement>("#demo-controls");

const runButton = requiredElement<HTMLButtonElement>("#run-button");

const pauseButton = requiredElement<HTMLButtonElement>("#pause-button");

const resetButton = requiredElement<HTMLButtonElement>("#reset-button");

const labelElement = requiredElement<HTMLDivElement>("#demo-label");

const labelHeadline = requiredElement<HTMLDivElement>("#demo-label .headline");

const labelDetail = requiredElement<HTMLDivElement>("#demo-label .detail");

const labelApiCommand = requiredElement<HTMLDivElement>(
  "#demo-label .api-command",
);

const demoTitleElement = requiredElement<HTMLDivElement>("#demo-title");

const integrationPanel = requiredElement<HTMLDivElement>("#integration-panel");

const stepImport = requiredElement<HTMLDivElement>("#step-import");

const stepViewer = requiredElement<HTMLDivElement>("#step-viewer");

const stepHiPS = requiredElement<HTMLDivElement>("#step-hips");

const stepNavigation = requiredElement<HTMLDivElement>("#step-navigation");

const stepCatalogue = requiredElement<HTMLDivElement>("#step-catalogue");

const demoMode: DemoMode =
  new URLSearchParams(window.location.search).get("mode") === "video"
    ? "video"
    : "interactive";

controlsElement.hidden = demoMode === "video";

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

let paused = false;
let running = false;

let survey: HiPS | null = null;
let catalogue: CatalogueGL | null = null;
let fixture: CatalogueFixture | null = null;

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
    statusElement.textContent = paused ? "Paused" : "Running A08";
  }

  updateControls();
}

async function showLabel(
  headline: string,
  detail = "",
  apiCommand = "",
  durationMs = 1700,
): Promise<void> {
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

function clearIntegrationSteps(): void {
  stepImport.classList.remove("done");
  stepViewer.classList.remove("done");
  stepHiPS.classList.remove("done");
  stepNavigation.classList.remove("done");
  stepCatalogue.classList.remove("done");
}

function completeStep(element: HTMLElement): void {
  element.classList.add("done");
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
    throw new Error("HSC fixture is not available.");
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

function clearCatalogue(): void {
  if (!catalogue) {
    return;
  }

  catalogue.clearSelection();
  viewer.deleteCatalogue(catalogue);

  catalogue = null;
}

async function ensureSurvey(): Promise<void> {
  if (survey) {
    return;
  }

  survey = await viewer.addHiPSFromUrl(SDSS_URL);
  viewer.setActiveHiPS(survey);
}

async function reset(): Promise<void> {
  if (running) {
    return;
  }

  setPaused(false);

  clearCatalogue();
  clearIntegrationSteps();

  integrationPanel.classList.remove("visible");

  await ensureSurvey();

  viewer.setActiveHiPS(survey!);
  viewer.setHiPSOpacity(survey!, 1);

  viewer.goTo(0, 0);
  viewer.setFoV(20);

  await sleep(500);

  statusElement.textContent = "Ready";
}

async function resetForRun(): Promise<void> {
  clearCatalogue();
  clearIntegrationSteps();

  integrationPanel.classList.add("visible");

  await ensureSurvey();

  viewer.setActiveHiPS(survey!);
  viewer.setHiPSOpacity(survey!, 1);

  viewer.goTo(0, 0);
  viewer.setFoV(20);

  await demoWait(500);
}

async function runA08(): Promise<void> {
  if (running) {
    return;
  }

  running = true;

  setPaused(false);
  updateControls();

  statusElement.textContent = "Running A08";

  try {
    await resetForRun();

    await showDemoTitle();

    integrationPanel.classList.add("visible");

    await showLabel(
      "Install and import AstroViewer",
      "The application consumes the published package through its public root export.",
      `npm install astro-viewer

import {
  AstroViewer,
  MetadataColumn,
  MetadataManager,
  ColumnType
} from "astro-viewer";`,
      3000,
    );

    completeStep(stepImport);

    await showLabel(
      "Create the viewer",
      "An external application only needs a canvas and the AstroViewer constructor.",
      `const viewer = new AstroViewer(canvas);
viewer.run();`,
      2200,
    );

    completeStep(stepViewer);

    await showLabel(
      "Load a HiPS survey",
      "Load SDSS through the public HiPS layer API.",
      `const hips = await viewer.addHiPSFromUrl(
  "${SDSS_URL}"
);

viewer.setActiveHiPS(hips);`,
      2600,
    );

    completeStep(stepHiPS);

    await showLabel(
      "Navigate to M51",
      "Use the public navigation and scientific FoV APIs.",
      `viewer.flyTo(
  ${M51.ra},
  ${M51.dec},
  2600
);

await viewer.flyToFoV(
  ${M51.fov},
  2000
);`,
      2200,
    );

    viewer.flyTo(M51.ra, M51.dec, 2600);

    await demoWait(2800);

    await viewer.flyToFoV(M51.fov, 2000);

    await demoWait(700);

    completeStep(stepNavigation);

    await showLabel(
      "Add a scientific catalogue",
      "Create metadata, add HSC sources and display the catalogue using only the public package API.",
      `const catalogue =
  viewer.createCatalogue(
    name,
    description,
    providerUrl,
    metadata
  );

catalogue.addSources(rows, columns);
viewer.showCatalogue(catalogue);`,
      3000,
    );

    catalogue = createCatalogue();

    viewer.changeCatalogueColor(catalogue, "#ffd166");

    await demoWait(3000);

    completeStep(stepCatalogue);

    await demoWait(1000);

    await showLabel(
      "External application ready",
      "HiPS rendering, navigation, scientific FoV and catalogue overlays are integrated through the AstroViewer public API.",
      `import { ... } from "astro-viewer";`,
      3000,
    );

    statusElement.textContent = "A08 complete";
  } catch (error) {
    console.error("[A08] Demo failed:", error);

    statusElement.textContent = "A08 failed";

    throw error;
  } finally {
    running = false;

    setPaused(false);
    updateControls();
  }
}

runButton.addEventListener("click", () => {
  void runA08();
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

  runA08,
  reset,

  getCatalogue: () => catalogue,

  showLabel,
};

async function initialiseDemo(): Promise<void> {
  statusElement.textContent = "Loading consumer demo…";

  fixture = await loadFixture();

  await ensureSurvey();

  window.astroViewerDemo!.ready = true;

  statusElement.textContent = "Ready";

  updateControls();

  console.log("[A08] Consumer integration ready.", {
    fixtureRows: fixture.rows.length,
    publicPackage: "astro-viewer",
  });
}

await initialiseDemo();
