# AstroViewer Astronomy Video Storyboard

This document defines the video/demo catalogue for the Astronomy vertical of AstroViewer (installed viewer 3.17.0).

The goals are:

- demonstrate the main Astronomy capabilities of AstroViewer;
- validate the public API from the perspective of an external consumer;
- define deterministic scenarios suitable for Playwright automation;
- produce reusable material for documentation, website, university pages and technical presentations.

---

## Video Catalogue

### A00 — Astronomy Showcase (12 scenes)

**Goal:** a silent, recordable sequence using AstroViewer 3.17.0 and astrospatial-services 0.1.1. Allow several minutes for reading pauses and network refinement; this expanded storyboard supersedes the old 60–90 second target.

| Scene | Field | Sequence |
| --- | --- | --- |
| 01 Opening | Wide optical sky | Introduce AstroViewer over DSS Color; preserve the camera for the first flight. |
| 02 Navigation | M45 | Fly, zoom in, visible hand drag right/left with human timing, zoom out. |
| 03 Spectrum | Orion 60°/20°, M42 2.5°, M51 0.5° | Increasing frequency: Haslam radio → Planck (Planck palette) → SPIRE FIR (native) → AllWISE MIR → 2MASS NIR → DSS optical → GALEX NUV+FUV composite (MAST mirror) → Chandra X-ray → Fermi gamma. Explicit field/scale changes and service-unavailable captions. Return to M42 2.5°. |
| 04 Compositing | M42 | Preserve scene 03 final camera/FoV. Optical + 2MASS + AllWISE at distinct opacities. |
| 05 Coordinates | M42 | Centre and moving-cursor RA/Dec; derived Galactic l/b; Visible hand drag updates centre immediately; zoom updates min/max FoV. |
| 06 Grids | M45, DSS Color | Equatorial then HEALPix grids, 12° → 3° → 12°. |
| 07 Overlays | M51, SDSS | 0.5° overview; 2.4 s colour holds; zoom to 0.12° before hue/size; cumulative selected metadata, direct pointer paths; back to 0.5° for purple footprints over cyan sources. |
| 08 Data access | M51 | Preserve scene 07 camera at 0.5°; live ADQL/TAP TABLEDATA, labelled local fallback, local JSON and CSV. |
| 09 Scientific state | M51 → M45 → M101 | Save three distinct views in a clickable thumbnail stack: M51 SDSS/2MASS + HSC/HST, M45 DSS/2MASS 65%, M101 HST ACS + real local HSC. Restore 1→2→3, delete each snapshot, continue. |
| 10 FITS | M42, fixed 2.5° | PNG → FITS; palettes including custom; linear/sqrt/log/asinh; hips/robust ranges. |
| 11 Inside Sphere | Continuous from M42 | Widen, enter, rotate and navigate inside, exit and reveal the sphere. |
| 12 Ecosystem | Wide optical sky | Brief credits and demonstrated technologies. |

The architecture prelude and dedicated Sesame / HiPS node / TAP demos are specified in [the updated roadmap](../ROADMAP.md); they are planned, not silently added to the current showcase.

Video mode autostarts. Add `&end=07` to review only the consolidated first seven scenes. `?scene=01` through `?scene=12` starts at a clean baseline and continues to the ending. For survey decisions, excluded bands and verification evidence see [A00 review notes](../audit/a00/README.md).

---

## A01 — Navigation & FoV

**Goal**

Demonstrate interactive and programmatic sky navigation, including field of view management.

**Target audience**

Astronomers, developers and technical users.

**Target duration**

45–60 seconds.

**Initial state**

- Astronomy mode;
- default HiPS loaded;
- relatively wide initial FoV;
- coordinate / FoV display visible.

**Sequence**

1. Show the initial sky.
2. Navigate programmatically to a known astronomical target.
3. Demonstrate a smooth `flyTo`.
4. Pause on the target.
5. Zoom in smoothly.
6. Show FoV changing.
7. Zoom out smoothly.
8. Perform a manual pan.
9. Return smoothly to the original target.

**Required public API**

- `goTo(...)`
- `flyTo(...)`
- `getCenterCoordinates()`
- `getFoV()`
- `setFoV(...)`
- `flyToFoV(...)`
- `zoomIn(...)`
- `zoomOut(...)`

**Playwright interactions**

- mouse move;
- mouse drag;
- optional mouse wheel;
- UI controls if available.

**Captions**

Possible captions:

- Navigate to an astronomical target
- Smooth sky navigation
- Zoom into the target
- Field of view updates dynamically
- Interactive pan and zoom

**Expected final state**

Target centred with a useful FoV.

**Open API gaps**

- A-01 FoV API consolidation
- A-02 animated FoV / relative zoom API

---

## A02 — HiPS Surveys

**Goal**

Show how astronomical HiPS surveys can be loaded, activated and visually configured.

**Target duration**

45–60 seconds.

**Sequence**

1. Start with the default survey.
2. Load or activate another HiPS.
3. Switch active survey.
4. Demonstrate opacity control if appropriate.
5. Return to the primary survey.

**Required public API**

- HiPS creation/loading API;
- activate HiPS;
- set active HiPS;
- opacity control.

**Playwright interactions**

- survey selector;
- opacity control;
- buttons / panels.

**Expected final state**

Selected survey active and correctly displayed.

---

## A03 — Grids & Coordinates

**Goal**

Demonstrate coordinate information and available astronomical grids.

**Target duration**

40–60 seconds.

**Sequence**

1. Show current coordinates and FoV.
2. Enable HEALPix grid.
3. Navigate / zoom while the grid updates.
4. Toggle equatorial grid.
5. Toggle longitude/latitude grid where appropriate.
6. Restore a clean view.

**Required public API**

- `toggleHealpixGrid()`
- `toggleEquatorialGrid()`
- `toggleLonLatGrid()`
- `getCenterCoordinates()`
- `getFoV()`

**Playwright interactions**

- grid controls;
- mouse navigation.

---

## A04 — Catalogues

**Goal**

Show astronomical catalogue overlays and source interaction.

**Target duration**

60–90 seconds.

**Demo target**

M51.

**Data**

HSC catalogue fixture.

**Sequence**

1. Navigate to M51.
2. Load HSC catalogue.
3. Show catalogue sources on the sky.
4. Hover a source.
5. Display source metadata.
6. Select a source if supported.
7. Show interaction states.

**Required public API**

- catalogue creation;
- catalogue display;
- catalogue visibility;
- source interaction events.

**Playwright interactions**

- Load HSC catalogue button;
- source hover;
- source selection.

**Captions**

- Load an astronomical catalogue
- Catalogue sources are projected on the sky
- Hover a source to inspect its metadata

---

## A05 — Observations & Footprints

**Goal**

Show observation overlays using astronomical footprints.

**Target duration**

60–90 seconds.

**Demo target**

M51.

**Data**

HST observation fixture.

**Sequence**

1. Navigate to M51.
2. Load HST observations.
3. Show observation footprints.
4. Hover one footprint.
5. Display observation metadata.
6. Demonstrate selection if supported.

**Required public API**

- footprint set creation;
- footprint display;
- visibility control;
- hover / selection events.

**Playwright interactions**

- Load HST observations button;
- footprint hover;
- footprint selection.

---

## A06 — Interaction Colours

**Goal**

Demonstrate the visual interaction model introduced/stabilised in AstroViewer 3.12.

**Target duration**

30–45 seconds.

**Sequence**

1. Show a neutral object.
2. Hover it.
3. Select it.
4. Move hover to another object.
5. Demonstrate selected + hovered states.
6. Show equivalent behaviour for footprints where useful.

**Main concepts**

- default state;
- hovered state;
- selected state;
- focused / combined interaction states where applicable.

**Notes**

This video is directly linked to the 3.12 interaction-colour work and should remain short and visual.

---

## A07 — Scientific Target Framing

**Goal**

Demonstrate why an absolute FoV expressed in degrees is scientifically useful.

**Target audience**

Astronomers and developers building scientific applications.

**Target duration**

45–60 seconds.

**Sequence**

1. Load metadata for an astronomical target.
2. Read its angular size.
3. Navigate to its RA / Dec.
4. Derive a suitable display FoV from the angular size.
5. Animate smoothly to that FoV.
6. Show the object correctly framed.

**Example concept**

    const targetSizeDeg = majorAxisArcmin / 60;
    const displayFoV = targetSizeDeg * marginFactor;

    await viewer.flyTo(ra, dec);
    await viewer.flyToFoV(displayFoV);

**Required public API**

- `flyTo(...)`
- `setFoV(...)`
- `flyToFoV(...)`
- `getFoV()`

**Open API gaps**

- A-01
- A-02

---

## A08 — Developer Integration

**Goal**

Show how a developer can integrate the published AstroViewer package into an external application.

**Target duration**

2–4 minutes.

**Sequence**

1. Show package installation.
2. Create a minimal application.
3. Instantiate AstroViewer.
4. Load a HiPS survey.
5. Navigate to a target.
6. Set the FoV.
7. Add a catalogue or footprint overlay.

**Important constraint**

This video must use AstroViewer strictly as an external dependency.

It must not import internal or non-public AstroViewer modules.

**Purpose**

This scenario doubles as a consumer-level validation of the public API.

---

# API Audit Backlog

## A-01 — Consolidate FoV API

Current situation:

- `changeFoV(...)`
- `changeFoV2(...)`
- `changeFoV3(...)`

Target:

    setFoV(deg: number): void

Audit goals:

- identify the mathematically correct implementation;
- verify requested FoV against actual FoV;
- test multiple FoV values;
- test different canvas aspect ratios;
- test different sky positions;
- keep only one public implementation.

Expected contract:

    setFoV(x)
    → resulting FoV approximately x degrees

within a defined numerical tolerance.

---

## A-02 — Animated FoV and Relative Zoom

Target public API:

    flyToFoV(
      deg: number,
      durationMs?: number
    ): Promise<void>

    zoomIn(
      steps?: number,
      durationMs?: number
    ): Promise<void>

    zoomOut(
      steps?: number,
      durationMs?: number
    ): Promise<void>

Semantics:

    setFoV / flyToFoV
    → absolute
    → degrees
    → scientific
    → deterministic target

    zoomIn / zoomOut
    → relative
    → step based
    → animated
    → interaction-oriented
    → deterministic final FoV

Important design constraint:

`zoomIn(3)` should compute the final target corresponding to three logical zoom steps and perform one smooth animation toward that target.

It should not execute three visually separate zoom animations.

---

# Production Notes

The final demo scripts will be implemented using Playwright.

The preferred workflow is:

    storyboard
    → API validation
    → deterministic demo scenario
    → Playwright automation
    → QA recording
    → macOS screen recording
    → post-production

The first pilot scenario will be:

**A01 — Navigation & FoV**

because it exercises:

- navigation;
- animation;
- mouse interaction;
- FoV;
- timing;
- Playwright;
- recording quality.