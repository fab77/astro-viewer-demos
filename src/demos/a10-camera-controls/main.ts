/// <reference path="../../demo-window.d.ts" />
import { AstroViewer } from "astro-viewer";

type RotationMode = "free" | "east-west" | "north-south";
const mode =
  new URLSearchParams(location.search).get("mode") === "video"
    ? "video"
    : "interactive";
const element = <T extends HTMLElement>(id: string): T => {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing element: ${id}`);
  return result as T;
};
const canvas = element<HTMLCanvasElement>("astrocanvas");
const status = element<HTMLElement>("status");
const panel = element<HTMLElement>("panel");
const northUp = element<HTMLInputElement>("north-up");
const sensitivity = element<HTMLInputElement>("sensitivity");
const sensitivityValue = element<HTMLOutputElement>("sensitivity-value");
const resetButton = element<HTMLButtonElement>("reset-button");
const runButton = element<HTMLButtonElement>("run-button");
const viewer = new AstroViewer(canvas, {
  gridLabelContainers: {
    coords: element<HTMLDivElement>("coords-grid-labels"),
  },
});
viewer.run();
const skyReady = viewer.addHiPSFromUrl(
  "https://cdn.skies.esac.esa.int/DSSColor/",
);
if (!viewer.isEquatorialGridVisible()) {
  viewer.toggleEquatorialGrid();
}
panel.hidden = false;
const videoMode = mode === "video";
if (videoMode) {
  panel
    .querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")
    .forEach((control) => {
      control.disabled = true;
    });
}
let running = false;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
function label(headline: string, detail: string, api: string): void {
  element<HTMLElement>("headline").textContent = headline;
  element<HTMLElement>("detail").textContent = detail;
  element<HTMLElement>("api-command").textContent = api;
}
function highlightPhase(phase: "rotation" | "north-up" | "sensitivity" | "reset"): void {
  element<HTMLElement>("panel").dataset.phase = phase;
  element<HTMLElement>("sensitivity-setting").dataset.active = String(phase === "sensitivity");
}

function setRotationMode(value: RotationMode): void {
  viewer.setEastWestRotationLocked(value === "east-west");
  viewer.setNorthSouthRotationLocked(value === "north-south");
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="rotation"][value="${value}"]`,
  );
  if (radio) radio.checked = true;
}
function reset(): void {
  highlightPhase("reset");
  setRotationMode("free");
  viewer.setKeepCameraNorthUp(false);
  northUp.checked = false;
  viewer.setRotationSensitivity(1);
  sensitivity.value = "1";
  sensitivityValue.value = "1";
  viewer.resetAxesOrientation();
  viewer.goTo(0, 0);
  viewer.setFoV(120);
  label(
    "Camera Controls",
    "Free rotation. Drag the sky to explore.",
    "viewer.resetAxesOrientation(); viewer.goTo(0, 0); viewer.setFoV(120)",
  );
  status.textContent = "Ready";
}
for (const radio of document.querySelectorAll<HTMLInputElement>(
  'input[name="rotation"]',
)) {
  radio.addEventListener("change", () => {
    if (radio.checked) {
      setRotationMode(radio.value as RotationMode);
      highlightPhase("rotation");
    }
  });
}
northUp.addEventListener("change", () => {
  viewer.setKeepCameraNorthUp(northUp.checked);
  highlightPhase(northUp.checked ? "north-up" : "rotation");
});
sensitivity.addEventListener("input", () => {
  viewer.setRotationSensitivity(Number(sensitivity.value));
  sensitivityValue.value = sensitivity.value;
  highlightPhase("sensitivity");
});
resetButton.addEventListener("click", reset);

async function dragCamera(
  dx: number,
  dy: number,
  duration = 2200,
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

  dispatch("pointerdown", x, y, 1);

  const steps = 80;
  try {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      dispatch("pointermove", x + dx * t, y + dy * t, 1);
      await sleep(duration / steps);
    }
  } finally {
    dispatch("pointerup", x + dx, y + dy, 0);
  }

  await sleep(500);
}

async function runA10(): Promise<void> {
  if (running) return;
  running = true;
  runButton.disabled = true;
  resetButton.disabled = true;
  status.textContent = "Running A10";
  try {
    reset();
    status.textContent = "Running A10";

    highlightPhase("rotation");
    label("Free rotation", "Both axes respond to diagonal dragging.", "Free rotation");
    await dragCamera(220, 140);
    await dragCamera(-220, -140);

    setRotationMode("east-west");
    highlightPhase("rotation");
    label("East–West locked", "Move up and down; East–West stays fixed.", "viewer.setEastWestRotationLocked(true)");
    await dragCamera(0, 180);
    await dragCamera(0, -360);
    await dragCamera(0, 180);

    // Establish a slight tilt while the camera is free, then lock North–South.
    setRotationMode("free");
    await dragCamera(0, 75, 1000);
    setRotationMode("north-south");
    highlightPhase("rotation");
    label("North–South locked", "With the axis tilted, rotate left and right.", "viewer.setNorthSouthRotationLocked(true)");
    await dragCamera(220, 0);
    await dragCamera(-440, 0);
    await dragCamera(220, 0);

    // North-up is compared only in Free Rotation, with matching drags.
    setRotationMode("free");
    viewer.setKeepCameraNorthUp(false);
    northUp.checked = false;
    viewer.resetAxesOrientation();
    viewer.goTo(0, 75);
    await sleep(700);
    highlightPhase("north-up");
    label("Keep North Up — OFF", "Free rotation near the north celestial pole.", "viewer.setKeepCameraNorthUp(false)");
    await dragCamera(220, 110, 2600);

    viewer.resetAxesOrientation();
    viewer.goTo(0, 75);
    await sleep(700);
    viewer.setKeepCameraNorthUp(true);
    northUp.checked = true;
    label("Keep North Up — ON", "Repeat the same drag with North Up enabled.", "viewer.setKeepCameraNorthUp(true)");
    await dragCamera(220, 110, 2600);

    viewer.setKeepCameraNorthUp(false);
    northUp.checked = false;
    viewer.resetAxesOrientation();
    viewer.goTo(0, 0);
    await sleep(700);

    highlightPhase("sensitivity");
    label("Rotation sensitivity — 1.0", "Reference movement at normal sensitivity.", "viewer.setRotationSensitivity(1)");
    await dragCamera(200, 120);
    viewer.resetAxesOrientation();
    viewer.goTo(0, 0);
    await sleep(500);
    viewer.setRotationSensitivity(0.5);
    sensitivity.value = "0.5";
    sensitivityValue.value = "0.5";
    label("Rotation sensitivity — 0.5", "Same drag with reduced sensitivity.", "viewer.setRotationSensitivity(0.5)");
    await dragCamera(200, 120);
    reset();
    label(
      "Reset view",
      "Default constraints, orientation and pointing restored.",
      "viewer.resetAxesOrientation(); viewer.goTo(...)",
    );
    status.textContent = "A10 complete";
  } finally {
    running = false;
    runButton.disabled = false;
    resetButton.disabled = false;
  }
}
runButton.addEventListener("click", () => {
  void runA10();
});
window.astroViewerDemo = {
  viewer,
  ready: false,
  mode,
  runA10,
  reset: async () => reset(),
};
reset();
void Promise.resolve(skyReady)
  .then(() => {
    window.astroViewerDemo!.ready = true;
    status.textContent = "Ready";
  })
  .catch((error: unknown) => {
    console.error("A10 DSS Color load failed", error);
    status.textContent = "Survey load failed";
  });
