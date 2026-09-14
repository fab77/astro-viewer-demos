import { AstroViewer } from "astro-viewer";

type FoVMethodName = "changeFoV" | "changeFoV2" | "changeFoV3";

type FoVAuditResult = {
  method: FoVMethodName;
  requested: number;
  xFoV: number;
  yFoV: number;
  minFoV: number;
  absoluteError: number;
  relativeErrorPercent: number;
};

type InitialCameraState = {
  position: [number, number, number];
  viewMatrix: Float32Array;
  modelMatrix: Float32Array;
};

const targets = [60, 30, 10, 5, 1, 0.5, 0.1, 0.05];

const methods: FoVMethodName[] = ["changeFoV", "changeFoV2", "changeFoV3"];

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required DOM element not found: ${selector}`);
  }

  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#astrocanvas");

const container = requiredElement<HTMLDivElement>("#viewer-container");

const viewportSelect = requiredElement<HTMLSelectElement>("#viewport");

const runButton = requiredElement<HTMLButtonElement>("#run");

const statusElement = requiredElement<HTMLDivElement>("#status");

const resultsElement = requiredElement<HTMLDivElement>("#results");

configureViewport();
const viewer = new AstroViewer(canvas);
viewer.run();

(window as Window & { auditViewer?: AstroViewer }).auditViewer = viewer;

function waitForFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const next = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      requestAnimationFrame(() => next(remaining - 1));
    };

    next(count);
  });
}

async function waitForInitialState(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await waitForFrames(1);

    const status = viewer.getCurrentAstroViewerStatus();

    if (status) {
      return;
    }
  }

  throw new Error("AstroViewer did not expose an initial camera state.");
}

function captureInitialCameraState(): InitialCameraState {
  const status = viewer.getCurrentAstroViewerStatus();

  if (!status) {
    throw new Error("Camera status is not available.");
  }

  return {
    position: [...status.position] as [number, number, number],
    viewMatrix: new Float32Array(status.vMatrix),
    modelMatrix: new Float32Array(status.mMatrix),
  };
}

async function restoreInitialCameraState(
  state: InitialCameraState,
): Promise<void> {
  viewer.setModelMatrix(state.modelMatrix);
  viewer.setCameraPosition([...state.position]);
  viewer.setCameraMatrix(new Float32Array(state.viewMatrix));

  await waitForFrames(3);
}

function applyFoVMethod(method: FoVMethodName, requested: number): void {
  switch (method) {
    case "changeFoV":
      viewer.changeFoV(requested);
      break;

    case "changeFoV2":
      viewer.changeFoV2(requested);
      break;

    case "changeFoV3":
      viewer.changeFoV3(requested);
      break;
  }
}

function measure(method: FoVMethodName, requested: number): FoVAuditResult {
  const fov = viewer.getFoV();

  const minFoV = fov.minFoV;
  const absoluteError = minFoV - requested;

  return {
    method,
    requested,
    xFoV: fov.xFoV,
    yFoV: fov.yFoV,
    minFoV,
    absoluteError,
    relativeErrorPercent:
      requested === 0 ? 0 : (absoluteError / requested) * 100,
  };
}

function renderResults(results: FoVAuditResult[]): void {
  const rows = results
    .map(
      (result) => `
        <tr>
          <td>${result.method}</td>
          <td>${result.requested.toFixed(4)}</td>
          <td>${result.xFoV.toFixed(6)}</td>
          <td>${result.yFoV.toFixed(6)}</td>
          <td>${result.minFoV.toFixed(6)}</td>
          <td>${result.absoluteError.toFixed(6)}</td>
          <td>${result.relativeErrorPercent.toFixed(3)}%</td>
        </tr>
      `,
    )
    .join("");

  resultsElement.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Requested °</th>
          <th>xFoV °</th>
          <th>yFoV °</th>
          <th>minFoV °</th>
          <th>Error °</th>
          <th>Error %</th>
        </tr>
      </thead>

      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function configureViewport(): void {
  const [width, height] = viewportSelect.value.split("x").map(Number);

  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  canvas.width = width;
  canvas.height = height;

  console.log("[FoV audit] viewport configured", {
    requested: `${width}x${height}`,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    clientWidth: canvas.clientWidth,
    clientHeight: canvas.clientHeight,
  });
}

function verifyViewport(): void {
  const [expectedWidth, expectedHeight] = viewportSelect.value
    .split("x")
    .map(Number);

  const dpr = window.devicePixelRatio || 1;

  const expectedBufferWidth = Math.round(expectedWidth * dpr);

  const expectedBufferHeight = Math.round(expectedHeight * dpr);

  if (
    canvas.clientWidth !== expectedWidth ||
    canvas.clientHeight !== expectedHeight ||
    canvas.width !== expectedBufferWidth ||
    canvas.height !== expectedBufferHeight
  ) {
    throw new Error(
      `Viewport mismatch: ` +
        `expected CSS ${expectedWidth}x${expectedHeight}, ` +
        `buffer ${expectedBufferWidth}x${expectedBufferHeight}; ` +
        `got CSS ${canvas.clientWidth}x${canvas.clientHeight}, ` +
        `buffer ${canvas.width}x${canvas.height}`,
    );
  }
}

type SetFoVCandidateResult = {
  requestedFoV: number;
  actualFoV: number;
  xFoV: number;
  yFoV: number;
  cameraDistance: number;
  absoluteError: number;
  relativeErrorPercent: number;
  iterations: number;
};

function getCameraDistance(): number {
  const status = viewer.getCurrentAstroViewerStatus();

  if (!status) {
    throw new Error("Camera status is not available.");
  }

  const [x, y, z] = status.position;

  return Math.hypot(x, y, z);
}

/**
 * Experimental audit helper.
 *
 * changeFoV() ultimately sets Camera.cam_pos[2] to:
 *
 *   computedDistance + 1
 *
 * and SphereFoV.computeDistanceFromAngle() currently computes:
 *
 *   angle * (cameraDistance / currentYFoV)
 *
 * Therefore we can invert the legacy operation and ask changeFoV()
 * to move the camera to a specific radial distance.
 *
 * This is ONLY an audit technique.
 * It is not a proposed production implementation.
 */
async function setRadialDistanceForAudit(
  targetDistance: number,
): Promise<void> {
  const fov = viewer.getFoV();
  const currentDistance = getCameraDistance();

  if (
    !Number.isFinite(fov.yFoV) ||
    fov.yFoV <= 0 ||
    !Number.isFinite(currentDistance) ||
    currentDistance <= 0
  ) {
    throw new Error(
      `Invalid current geometry: distance=${currentDistance}, yFoV=${fov.yFoV}`,
    );
  }

  const currentRatio = currentDistance / fov.yFoV;

  const legacyAngleArgument = (targetDistance - 1) / currentRatio;

  viewer.changeFoV(legacyAngleArgument);

  await waitForFrames(4);
}

function getMeasuredMinFoV(): number {
  return viewer.getFoV().minFoV;
}

/**
 * Experimental implementation of the desired semantic contract:
 *
 *   setFoVCandidate(5)
 *
 * should finish with:
 *
 *   viewer.getFoV().minFoV ~= 5 degrees
 *
 * We solve for the required radial camera distance numerically.
 */
async function setFoVCandidate(
  targetFoVDeg: number,
): Promise<SetFoVCandidateResult> {
  if (
    !Number.isFinite(targetFoVDeg) ||
    targetFoVDeg <= 0 ||
    targetFoVDeg >= 180
  ) {
    throw new Error(
      `FoV must be > 0 and < 180 degrees. Received ${targetFoVDeg}.`,
    );
  }

  const minDistance = 1.000001;
  const maxDistance = 4.0;

  let low = minDistance;
  let high = maxDistance;

  let bestDistance = getCameraDistance();
  let bestFoV = getMeasuredMinFoV();
  let bestError = Number.POSITIVE_INFINITY;

  const absoluteTolerance = Math.max(1e-5, targetFoVDeg * 0.001);

  const maxIterations = 40;

  let iterations = 0;

  for (iterations = 1; iterations <= maxIterations; iterations += 1) {
    const candidateDistance = (low + high) / 2;

    await setRadialDistanceForAudit(candidateDistance);

    const measuredFoV = getMeasuredMinFoV();

    const error = Math.abs(measuredFoV - targetFoVDeg);

    console.log("[setFoVCandidate]", {
      iteration: iterations,
      candidateDistance,
      targetFoVDeg,
      measuredFoV,
      error,
    });

    if (error < bestError) {
      bestError = error;
      bestFoV = measuredFoV;
      bestDistance = candidateDistance;
    }

    if (error <= absoluteTolerance) {
      break;
    }

    /*
     * In outside-sphere mode the measured FoV increases as the
     * radial camera distance increases.
     *
     * 180° is also treated as the upper side of the search because
     * it is the fallback returned when an edge ray misses the sphere.
     */
    if (measuredFoV >= targetFoVDeg || measuredFoV >= 179.999) {
      high = candidateDistance;
    } else {
      low = candidateDistance;
    }
  }

  /*
   * Put the camera at the best solution encountered rather than
   * simply leaving it at the final binary-search sample.
   */
  await setRadialDistanceForAudit(bestDistance);

  const finalFoV = viewer.getFoV();
  const actualFoV = finalFoV.minFoV;

  return {
    requestedFoV: targetFoVDeg,
    actualFoV,
    xFoV: finalFoV.xFoV,
    yFoV: finalFoV.yFoV,
    cameraDistance: getCameraDistance(),
    absoluteError: actualFoV - targetFoVDeg,
    relativeErrorPercent: ((actualFoV - targetFoVDeg) / targetFoVDeg) * 100,
    iterations,
  };
}

(
  window as Window & {
    setFoVCandidate?: (deg: number) => Promise<SetFoVCandidateResult>;
  }
).setFoVCandidate = setFoVCandidate;

async function runAudit(): Promise<void> {
  runButton.disabled = true;
  viewportSelect.disabled = true;

  statusElement.textContent = "Waiting for viewport and camera initialisation…";

  await waitForFrames(5);
  verifyViewport();

  const initialState = captureInitialCameraState();

  const results: FoVAuditResult[] = [];

  for (const method of methods) {
    for (const requested of targets) {
      statusElement.textContent = `Testing ${method}(${requested}°)…`;

      await restoreInitialCameraState(initialState);

      applyFoVMethod(method, requested);

      await waitForFrames(4);

      const result = measure(method, requested);

      results.push(result);

      console.log("[FoV audit]", result);
    }
  }

  await restoreInitialCameraState(initialState);

  renderResults(results);

  console.table(results);

  statusElement.textContent = `Completed ${results.length} FoV measurements.`;

  viewportSelect.disabled = false;
  runButton.disabled = false;
}

await waitForInitialState();
statusElement.textContent =
  "Viewer ready. Select a viewport and run the audit.";

runButton.addEventListener("click", () => {
  runAudit().catch((error) => {
    console.error(error);

    statusElement.textContent = `Audit failed: ${String(error)}`;

    viewportSelect.disabled = false;
    runButton.disabled = false;
  });
});

async function runSetFoVCandidateSeries(): Promise<void> {
  const targets = [10, 5, 1, 0.5, 0.1];

  const results: SetFoVCandidateResult[] = [];

  for (const target of targets) {
    const result = await setFoVCandidate(target);

    results.push(result);
  }

  console.table(
    results.map((result) => ({
      requested: result.requestedFoV,
      actual: result.actualFoV,
      xFoV: result.xFoV,
      yFoV: result.yFoV,
      distance: result.cameraDistance,
      errorDeg: result.absoluteError,
      errorPercent: result.relativeErrorPercent,
      iterations: result.iterations,
    })),
  );
}

(
  window as Window & {
    runSetFoVCandidateSeries?: () => Promise<void>;
  }
).runSetFoVCandidateSeries = runSetFoVCandidateSeries;
