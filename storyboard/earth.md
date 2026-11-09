# AstroViewer E00 — Earth Observation Showcase

## Purpose

E00 demonstrates AstroViewer’s Earth Observation capabilities through a concise, reproducible sequence based exclusively on public APIs and production code paths.

The showcase must:

- present Earth functionality without depending on Astronomy state;
- preserve the visual quality of raster tiles during navigation;
- use public or openly accessible data sources;
- distinguish AstroViewer capabilities from dev-only helpers;
- avoid changes to shared Astronomy rendering unless independently justified and regression-tested;
- support interactive and `mode=video` execution;
- release temporary overlays and resources when scenes finish.

## Technical baseline

- AstroViewer: `^3.18.1`
- Rendering: WebGL2
- Geographic raster protocols: XYZ and WMTS
- Vector format: GeoJSON
- Earth coordinate convention: longitude and latitude in degrees
- Default Earth base map: Esri World Imagery
- Scientific raster source: NASA GIBS
- Open cartographic sources: OpenStreetMap and OpenTopoMap

## Showcase structure

### Scene 01 — Earth from space

**Purpose**

Introduce the Earth domain and its independent camera state.

**Visual sequence**

- Activate the Earth domain.
- Load Esri World Imagery.
- Start from a global view.
- Perform a slow rotation showing Europe, Africa and the Atlantic.
- Keep overlays and grids disabled.

**Capabilities**

- `setActiveDomain("earth")`
- Earth camera state
- WMTS-backed global imagery
- geographic center and field of view

**Narrative**

AstroViewer uses the same WebGL2 environment to support distinct scientific domains while preserving domain-specific camera and layer state.

---

### Scene 02 — Geographic navigation

**Purpose**

Demonstrate coordinate-based navigation on the globe.

**Visual sequence**

- Navigate to Rome with an immediate `goTo`.
- Fly to Madrid.
- Fly to another recognisable geographic target.
- Display current longitude, latitude and field of view.

**Capabilities**

- `goTo(longitude, latitude)`
- `flyTo(longitude, latitude)`
- center-coordinate reporting
- hover-coordinate reporting
- field-of-view reporting

**Acceptance criteria**

- longitude wraps correctly;
- latitude remains within valid bounds;
- camera movement is smooth;
- no tile acquisition stalls occur after arrival.

---

### Scene 03 — Open XYZ maps

**Purpose**

Show interchangeable slippy-map sources.

**Visual sequence**

- Begin with Esri World Imagery.
- Switch to OpenStreetMap.
- Switch to OpenTopoMap.
- Return to the preferred visual base map.

**Capabilities**

- XYZ URL templates
- calculated zoom level
- tile cache
- request concurrency
- fallback tiles
- provider attribution

**Sources**

- OpenStreetMap contributors
- OpenTopoMap contributors

**Acceptance criteria**

- attribution is visible whenever required;
- lower-resolution fallback remains available during refinement;
- no blue or empty regions appear during normal navigation.

---

### Scene 04 — Scientific WMTS imagery

**Purpose**

Demonstrate standards-based scientific raster imagery.

**Visual sequence**

- Load NASA GIBS Blue Marble.
- Show the active WMTS metadata.
- Compare the scientific layer with the cartographic base map.
- Demonstrate a time or dimension parameter only if the selected layer supports it reliably.

**Capabilities**

- WMTS REST requests
- WMTS KVP configuration
- layer, style and format selection
- TileMatrixSet selection
- dimensions and time
- metadata presentation

**Current limitation**

AstroViewer currently reuses its XYZ renderer for WMTS and supports Web Mercator-compatible TileMatrixSets. Arbitrary CRS and generic TileMatrixSet geometries are outside the scope of E00.

---

### Scene 05 — Raster compositing

**Purpose**

Show independent raster overlays over an Earth base map.

**Visual sequence**

- Load one stable base map.
- Add a second XYZ or WMTS raster layer.
- Fade the overlay from transparent to partially opaque.
- Toggle visibility.
- Restore the overlay.
- Remove it cleanly.

**Capabilities**

- multiple Earth raster overlays
- independent opacity
- visibility control
- ordered compositing
- overlay removal

**Acceptance criteria**

- opacity zero must not introduce visible artefacts;
- removing an overlay must not affect the base map;
- no unnecessary tile work should remain after an overlay is disposed.

---

### Scene 06 — GeoJSON points

**Purpose**

Demonstrate point-based geographic data.

**Visual sequence**

- Load the Italy cities fixture.
- Frame the imported points.
- Hover one or more points.
- Select a point and show its metadata.

**Capabilities**

- GeoJSON `Point`
- GeoJSON `MultiPoint`
- point rendering
- hover and selection
- metadata presentation

**Fixture**

- ten representative Italian cities

---

### Scene 07 — Regions and routes

**Purpose**

Demonstrate polygon and line geometries.

**Visual sequence**

- Load Italian administrative regions.
- Change polygon colour and visibility.
- Load Spanish regions.
- Add the Italy routes fixture.
- Compare interactive polygons with display-only routes.

**Capabilities**

- GeoJSON `Polygon`
- GeoJSON `MultiPolygon`
- GeoJSON `LineString`
- GeoJSON `MultiLineString`
- mixed overlay management
- colour and visibility controls

**Current limitation**

Lines are display-only in the current implementation and do not expose the same hover/selection interaction as points and polygons.

---

### Scene 08 — Geographic coordinate grid

**Purpose**

Use the longitude/latitude grid as a spatial reference.

**Visual sequence**

- Start with the grid hidden.
- Fade or enable the grid over the globe.
- Navigate across the equator and prime meridian.
- Move toward a high-latitude region.
- Disable the grid before the next scene.

**Capabilities**

- longitude/latitude grid
- domain-owned grid visibility
- geographic coordinate orientation

**Regression constraint**

Earth grid state must never modify Astronomy equatorial or HEALPix grid state.

---

### Scene 09 — Satellite observation

**Purpose**

Present a complete Earth observation geometry.

**Visual sequence**

- Load the ISS Spain ObservationTrack.
- Frame the target region.
- Show the satellite model.
- Show the ground track.
- Show the sensor cone.
- Show observation footprints and intersecting regions.

**Capabilities**

- `ObservationTrackViewerAdapter`
- satellite OBJ model
- target geometry
- ground track
- sensor cone
- current and historical footprints
- intersection metadata

**Fixture**

- ISS pass over Spain
- nine observation samples
- four intersecting footprints

---

### Scene 10 — Observation timeline

**Purpose**

Demonstrate time-dependent interpolation.

**Visual sequence**

- Start from the first observation sample.
- Play the timeline.
- Pause over an intersecting footprint.
- Seek forward.
- Resume playback.
- Reset the observation demo.

**Capabilities**

- play
- pause
- seek
- interpolated satellite position
- interpolated ground point
- time-labelled observation state
- lifecycle reset

**Acceptance criteria**

- timeline controls remain responsive;
- the satellite marker moves continuously;
- reset removes all transient observation resources;
- replaying the scene does not duplicate overlays or event handlers.

---

### Scene 11 — Standards and ecosystem

**Purpose**

Close the showcase by summarising the interoperable Earth stack.

**Visual sequence**

- Return to a clean global Earth view.
- Present a restrained final composition.
- Transition to the Earth credits page.
- Fade to black.

**Standards and technologies**

- XYZ
- WMTS
- GeoJSON
- WebGL2
- geographic longitude/latitude coordinates
- time-dependent observation tracks

**Products**

- AstroViewer
- astrospatial-core where runtime integration is actually used
- astrospatial-services where runtime integration is actually used

Do not credit a package as a runtime dependency unless E00 directly uses it.

## Credits page requirements

The Earth credits page must be independent from the Astronomy credits page and include only sources actually used by E00.

Expected categories:

### Creation

- Fabrizio Giordano — Creator & Product Owner
- Prof. Yago Ascasibar — Co-Product Owner & Scientific Advisor

### Maps and imagery

- Esri World Imagery
- NASA Global Imagery Browse Services
- OpenStreetMap contributors
- OpenTopoMap contributors

### Geographic data

- GeoJSON fixture provenance
- administrative boundary provenance
- satellite and orbit-data provenance

### Standards and technologies

- XYZ
- WMTS
- GeoJSON
- WebGL2

### Music

To be selected and verified before publication. Record:

- exact title;
- exact author;
- source platform;
- track identifier or source URL when available;
- applicable licence.

## Execution modes

### Interactive mode

Users may navigate, inspect data and activate scenes manually.

### Video mode

- deterministic scene order;
- predictable durations;
- no dependency on user input;
- bounded readiness waits;
- explicit scene cleanup;
- stable final credits frame;
- diagnostics available without appearing in the recording.

## Readiness policy

Scene progression must distinguish:

- fixed narrative delays;
- camera animation completion;
- raster tile readiness;
- vector-data readiness;
- observation timeline state.

A scene must not wait indefinitely for perfect high-resolution coverage. It should accept usable fallback coverage and continue refinement in the background.

Every readiness wait must have:

- a clear condition;
- a timeout;
- a diagnostic message;
- a safe fallback or explicit failure.

## Lifecycle policy

Each scene owns the transient resources it creates.

At scene completion:

- remove overlays that are no longer needed;
- stop timelines and animation callbacks;
- remove event listeners created by the scene;
- dispose GPU resources when the public API exposes ownership;
- preserve shared base maps only when their reuse is deliberate;
- ensure replaying a scene does not duplicate state.

Opacity zero alone does not mean that an overlay has been disposed.

## Regression policy

Changes made for E00 must not alter Astronomy behaviour unless the shared change is independently required.

Any AstroViewer core modification requires:

- targeted Earth tests;
- the complete AstroViewer unit-test suite;
- A00 build;
- A00 smoke tests;
- visual verification of HiPS fallback quality;
- verification of `mode=video`;
- verification of transitions into and out of `insideSphere`.

## Initial automated coverage

The E00 smoke suite should include:

1. application bootstrap with published dependencies;
2. direct global-Earth scene;
3. XYZ and WMTS map loading;
4. raster overlay add, opacity, visibility and removal;
5. GeoJSON points, polygons and lines;
6. grid state isolation;
7. satellite load, play, pause, seek and reset;
8. complete `mode=video` run;
9. final credits state;
10. return to Astronomy without errors.

## Out of scope

- 3D MeshHiPS;
- generic WMTS support for arbitrary CRS;
- orbit propagation inside the showcase when only static fixtures are available;
- modifications to Astronomy HiPS rendering;
- AstroBrowser integration;
- production backend services not required by the standalone showcase.