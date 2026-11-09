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

- Resolve each city name through the Nominatim service.
- Use the resolved longitude and latitude for each flight.
- Fall back to the fixture coordinates if the runtime resolver is unavailable.
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
- Fly to Central Park and zoom deeply to an urban street-and-path scale.
- Switch to OpenTopoMap.
- Zoom out over New York before flying back to Rome and restoring the preferred visual base map.

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

### Scene 04 — Standards-based global imagery

**Purpose**

Demonstrate standards-based global imagery from an independent WMTS provider.

**Visual sequence**

- Load NASA GIBS Blue Marble Shaded Relief and Bathymetry.
- Show the active WMTS provider and product metadata.
- Return to Esri World Imagery to demonstrate interchangeable WMTS providers.

**Capabilities**

- WMTS REST requests
- WMTS KVP configuration
- layer, style and format selection
- TileMatrixSet selection
- metadata presentation

This scene demonstrates WMTS interoperability and product provenance. It does
not present Blue Marble as a dated scientific observation. A scientific raster
scene must identify an observed variable, sensor, acquisition date and units or
documented product meaning.

**Current limitation**

AstroViewer currently reuses its XYZ renderer for WMTS and supports Web Mercator-compatible TileMatrixSets. Arbitrary CRS and generic TileMatrixSet geometries are outside the scope of E00.

---

### Scene 05 — Raster compositing

**Purpose**

Show independent raster overlays over an Earth base map.

**Visual sequence**

- Keep Esri World Imagery as the stable base map.
- Add NASA WMTS and OpenStreetMap XYZ overlays.
- Represent all three layers in a simulated stack panel.
- Animate two sliders while applying their values to the real overlay opacity APIs.
- Rebalance the composition, then remove both overlays cleanly.

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

### Scene 06 — World capitals and runtime context

**Purpose**

Demonstrate point-based geographic data.

**Visual sequence**

- Load a synthetic world-capitals table and frame the complete globe.
- Hover and select Brasília, Nairobi and Tokyo.
- Resolve each place with Nominatim.
- Query Open-Meteo and Wikipedia at runtime.
- Preserve selected metadata cards with explicit source indicators.
- Return to Europe before loading regional geometries.

**Capabilities**

- AstroTable geographic points
- point rendering
- hover and selection
- runtime place resolution and metadata enrichment with failure fallback

**Fixture**

- fifteen representative world capitals

---

### Scene 07 — European wildfire clusters

**Purpose**

Demonstrate data-driven styling across two related point catalogues.

**Visual sequence**

- Load an illustrative European summer 2026 fire-cluster fixture.
- Map intensity to marker size and hue.
- Overlay black markers for the highest illustrative criticality class.
- Remove both catalogues before continuing.

**Capabilities**

- numeric AstroTable columns
- data-driven marker size
- data-driven marker hue
- independent catalogue layers and lifecycle

**Data constraint**

The fixture is synthetic and exists to demonstrate visual encoding. It must not
be presented as an observed EFFIS, Copernicus or satellite fire archive.

---

### Scene 08 — Administrative regions

**Purpose**

Demonstrate independent polygon layers and feature interaction.

**Visual sequence**

- Load Italian administrative regions.
- Hover and select Puglia, showing its source and demonstration metadata.
- Load Spanish regions.
- Hover and select the Balearic Islands independently.
- Remove both footprint layers before the next scene.

**Capabilities**

- GeoJSON `Polygon`
- GeoJSON `MultiPolygon`
- independent vector-layer lifecycle
- colour, hover and selection controls

---

### Scene 09 — Mediterranean ferry routes

**Purpose**

Demonstrate real published line geometries over a labelled cartographic base.

**Visual sequence**

- Switch to OpenStreetMap so city and port names remain visible behind the
  maritime routes.
- Load eighty real ferry-route geometries published by the European Atlas of
  the Seas and distributed by the European Environment Agency.
- Distinguish all-year and seasonal services with a high-contrast visible
  legend: magenta for all-year routes and lime for seasonal routes.
- Preserve the published geometry so routes follow their actual maritime path.
- Frame the routes around longitude 33.8828°, latitude 34.6906° with a 44.125°
  vertical field of view.
- Approach the connected ferry hub at Piraeus and pause at street-map scale.
- Widen the view and move slowly west across the route network to Sicily.
- Restore Esri World Imagery before continuing to the next scene.

**Capabilities**

- GeoJSON `LineString`
- GeoJSON `MultiLineString`
- independent vector-layer lifecycle
- colour and visibility controls

**Current limitation**

Lines are display-only in the current implementation and do not expose the same
hover/selection interaction as points and polygons. The ferry lines are real
published route geometries, but they are not AIS vessel tracks or navigational
instructions.

---

### Scene 10 — Geographic coordinate grid

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

### Scene 11 — Saved Earth contexts

**Purpose**

Demonstrate complete named Earth view-state lifecycle.

**Visual sequence**

- Save a Rome analysis context containing camera, FoV, grid, base map and raster overlay.
- Save a Madrid cartographic context with a different base map and no grid.
- Restore Rome from the named snapshot.
- Remove both saved contexts while leaving the restored view active.

**Capabilities**

- `saveState`
- `restoreState`
- `deleteState`
- Earth camera, raster, overlay and grid state restoration

---

### Scene 12 — Satellite observation

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

### Scene 13 — Observation timeline

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

### Scene 14 — Provenance and credits

**Purpose**

Close the showcase by summarising the interoperable Earth stack.

**Visual sequence**

- Return to a clean global Earth view.
- Present a restrained final composition.
- Fade the Earth base map to zero opacity against the black WebGL background.
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

- synthetic GeoJSON demonstration fixtures
- synthetic administrative-boundary, wildfire and observation-track data
- European Atlas of the Seas ferry routes — © EuroGeographics 2022
- Weather data by Open-Meteo.com (CC BY 4.0)

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
