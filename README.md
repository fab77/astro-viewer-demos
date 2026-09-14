# AstroViewer Demos

Executable demos, video tutorial scenarios and automated browser tests for AstroViewer.

The repository is designed around two complementary use cases:

1. **Interactive demos** — demos that can be played on demand by a user in a browser.
2. **Video demos** — the same scenarios rendered without interactive controls and driven automatically, e.g. through Playwright for screen recording.

The same demo implementation is reused in both modes.

---

## Requirements

The current development environment uses:

- Node.js 22
- npm
- Chromium installed through Playwright
- AstroViewer as a local packaged dependency during development

Check the current environment with:

```bash
node --version
npm --version
npm list astro-viewer
```

Install project dependencies with:

```bash
npm install
```

Install the Playwright Chromium browser if necessary:

```bash
npx playwright install chromium
```

---

# AstroViewer dependency

During AstroViewer development this project can use a locally packaged AstroViewer snapshot.

Example:

```bash
npm install ../astro-viewer/astro-viewer-3.13.0-snapshot.tgz
```

Verify the installed version:

```bash
npm list astro-viewer
```

or:

```bash
node -p "require('./node_modules/astro-viewer/package.json').version"
```

The demos should exercise the **public AstroViewer API**, rather than relying on internal implementation details.

---

# Demo modes

Every demo supports two presentation modes.

## Interactive mode

Interactive mode displays the demo controls:

- Run
- Pause / Resume
- Reset

Example:

```text
http://localhost:5173/?mode=interactive
```

This mode is intended for:

- manual testing
- demonstrations
- interactive documentation
- the future public AstroViewer demo gallery

## Video mode

Video mode hides the interactive controls:

```text
http://localhost:5173/?mode=video
```

The scenario remains accessible programmatically and can be started by Playwright or from the browser console.

This mode is intended for:

- video recording
- automated demonstrations
- reproducible tutorial sequences

---

# Available Astronomy demos

## A01 — Navigation & Field of View

Demonstrates:

- animated sky navigation
- absolute scientific field of view
- animated FoV transitions
- step-based zoom
- AstroViewer navigation API

Start the demo server:

```bash
npm run demo:a01
```

Open interactive mode:

```text
http://localhost:5173/?mode=interactive
```

Open video mode:

```text
http://localhost:5173/?mode=video
```

The scenario can also be started manually from the browser console:

```js
await window.astroViewerDemo.runA01()
```

Run the Playwright test:

```bash
npm run test:a01
```

---

## A02 — HiPS Surveys

Demonstrates multi-wavelength exploration using HiPS surveys.

The current scenario uses M51 with:

- SDSS DR9 r — Optical
- GALEX FUV — Ultraviolet
- Herschel SPIRE 250 µm — Far infrared
- XMM EPIC-RGB — X-ray

The demo covers:

- loading HiPS surveys
- activating survey layers
- layer visibility
- HiPS opacity
- multi-layer blending
- removing survey layers

Start the demo server:

```bash
npm run demo:a02
```

Interactive mode:

```text
http://localhost:5173/?mode=interactive
```

Video mode:

```text
http://localhost:5173/?mode=video
```

Run manually from the browser console:

```js
await window.astroViewerDemo.runA02()
```

Run the Playwright test:

```bash
npm run test:a02
```

---

## A03 — Grids & Coordinates

Demonstrates AstroViewer astronomical grids and coordinate APIs.

The scenario covers:

- viewport center coordinates
- navigation with live center-coordinate updates
- Equatorial grid
- RA / Dec grid labels
- HEALPix grid
- HEALPix labels
- live cursor coordinates
- programmatically driven cursor movement

Start the demo server:

```bash
npm run demo:a03
```

Interactive mode:

```text
http://localhost:5173/?mode=interactive
```

Video mode:

```text
http://localhost:5173/?mode=video
```

Run manually from the browser console:

```js
await window.astroViewerDemo.runA03()
```

Run the Playwright test:

```bash
npm run test:a03
```

---

# Running Playwright tests

The current Playwright scenarios run in **headed Chromium mode**.

This is intentional.

AstroViewer is a WebGL application and its navigation animations use the browser rendering loop. Headed mode also corresponds more closely to the environment used when recording demos.

The demo server and Playwright test should currently be run in separate terminals.

Example for A03:

### Terminal 1

```bash
npm run demo:a03
```

Wait until Vite reports:

```text
Local: http://localhost:5173/
```

### Terminal 2

```bash
npm run test:a03
```

Playwright will:

1. open Chromium
2. navigate to the demo in `mode=video`
3. wait until AstroViewer reports that the demo is ready
4. start the demo through the exposed scenario API
5. interact with the viewer when required
6. wait for the scenario to complete
7. verify the final AstroViewer state

Depending on the demo, tests can verify properties such as:

```text
demo status
FoV
grid visibility
active HiPS layers
coordinate mode
center coordinates
```

---

# Manual testing

Before running the Playwright test for a new demo, the recommended workflow is:

```text
1. Start the demo with npm run demo:<id>
2. Open ?mode=interactive
3. Run the complete scenario manually
4. Test Pause / Resume
5. Test Reset
6. Check the browser console for errors
7. Open ?mode=video
8. Run the scenario from the console
9. Run the Playwright test
```

This separates visual validation from browser automation.

---

# Browser console access

Each demo exposes a small public demo object on `window`.

For example:

```js
window.astroViewerDemo
```

Common properties include:

```js
window.astroViewerDemo.viewer
window.astroViewerDemo.ready
window.astroViewerDemo.mode
window.astroViewerDemo.reset()
```

The scenario method depends on the demo:

```js
await window.astroViewerDemo.runA01()
await window.astroViewerDemo.runA02()
await window.astroViewerDemo.runA03()
```

The underlying AstroViewer instance is therefore also available for manual API inspection:

```js
const viewer = window.astroViewerDemo.viewer
```

Examples:

```js
viewer.getFoV()
viewer.getCenterCoordinates()
viewer.getActiveCoordinateMode()
viewer.isEquatorialGridVisible()
viewer.isHealpixGridVisible()
```

---

# FoV audit

The repository also contains a dedicated field-of-view audit page used during development of the AstroViewer absolute and animated FoV APIs.

Start it with:

```bash
npm run audit:fov
```

Open:

```text
http://localhost:5173/fov.html
```

The audit was used to validate:

```ts
viewer.setFoV(deg)
viewer.flyToFoV(deg, durationMs)

viewer.zoomIn(steps, durationMs)
viewer.zoomOut(steps, durationMs)
```

including different canvas aspect ratios.

The audit code lives under:

```text
src/audit/
```

It is development instrumentation rather than a tutorial demo.

---

# Demo architecture

The current demo structure is:

```text
astro-viewer-demos/
├── playwright/
│   ├── a01-navigation-fov.spec.ts
│   ├── a02-hips-surveys.spec.ts
│   └── a03-grids-coordinates.spec.ts
│
├── src/
│   ├── audit/
│   │   ├── fov.html
│   │   └── fov.ts
│   │
│   └── demos/
│       ├── a01-navigation-fov/
│       │   ├── index.html
│       │   └── main.ts
│       │
│       ├── a02-hips-surveys/
│       │   ├── index.html
│       │   └── main.ts
│       │
│       └── a03-grids-coordinates/
│           ├── index.html
│           └── main.ts
│
├── storyboard/
│   └── astronomy.md
│
├── ROADMAP.md
├── package.json
└── README.md
```

---

# Demo design pattern

Each demo follows the same basic lifecycle:

```text
Initialise AstroViewer
        ↓
Load required data
        ↓
ready = true
        ↓
Title card
        ↓
Scenario steps
        ↓
Action label
Description
Public API call
        ↓
AstroViewer animation / interaction
        ↓
Final state
        ↓
"<demo> complete"
```

Labels are intentionally structured to explain both the user-visible action and the corresponding AstroViewer public API call.

For example:

```text
Navigate to M51

Move to the Whirlpool Galaxy.

viewer.flyTo(202.469575, 47.195258, 3000)
```

This makes the same scenario useful both as a visual showcase and as developer documentation.

---

# Video recording workflow

The recommended video workflow is:

```text
AstroViewer public API
        ↓
Demo scenario
        ↓
mode=video
        ↓
Playwright automation
        ↓
Chromium
        ↓
screen recording
        ↓
post-production
```

Interactive controls are intentionally hidden in video mode because playback controls will ultimately be provided by the video player itself.

The scenario labels and API calls remain visible because they form part of the tutorial content.

---

# TypeScript validation

A demo can be checked independently with TypeScript.

Example:

```bash
npx tsc --noEmit \
  --target ES2022 \
  --module ESNext \
  --moduleResolution bundler \
  --lib ES2022,DOM \
  src/demos/a03-grids-coordinates/main.ts
```

Replace the final path with the demo being tested.

---

# Development workflow

For each new demo:

```text
1. Define the storyboard
2. Audit the AstroViewer public API
3. Identify any genuine API gap
4. Modify AstroViewer only if necessary
5. Implement interactive demo
6. Validate manually
7. Validate video mode
8. Add Playwright automation
9. Run end-to-end test
10. Commit the completed demo
```

The demo project should not introduce workarounds for missing AstroViewer functionality when that functionality belongs in the public AstroViewer API.

Likewise, AstroViewer should not be modified only to make a demo easier unless the change represents a useful and coherent public API capability.

---

# Current Astronomy roadmap

```text
A01 — Navigation & FoV             DONE
A02 — HiPS Surveys                 DONE
A03 — Grids & Coordinates          DONE
A04 — Catalogues                   NEXT
A05 — Observations & Footprints
A06 — Interaction Colours
A07 — Scientific Target Framing
A08 — Developer Integration
```

See:

```text
ROADMAP.md
storyboard/astronomy.md
```

for the evolving demo plan.