> Latest follow-up: [caption audit, working GALEX and three saved views](review-states-and-captions.md).

# A00 Astronomy Showcase — review notes

> Historical first-delivery evidence. The [2026-11-05 review](review-2026-11-05.md) supersedes the scene 02–07 narrative and spectrum decisions below.

Work is confined to `astro-viewer-demos`, starting at `ad4da5727c5222c8829855deddfa8c42fde62b6a` on `main`. Local branch: `feat/a00-astronomy-showcase`. The pre-existing HiPS alias reuse and M42 continuity edits were retained; the three untracked patch files were not applied or altered.

## Start and review

```sh
npm ci
npm run demo:a00 -- --host 127.0.0.1
```

- Full recording: <http://127.0.0.1:5173/?mode=video>
- Spectrum: <http://127.0.0.1:5173/?mode=video&scene=03>
- Coordinates: <http://127.0.0.1:5173/?mode=video&scene=05>
- Scientific overlays: <http://127.0.0.1:5173/?mode=video&scene=07>
- Scientific state: <http://127.0.0.1:5173/?mode=video&scene=09>
- Interactive controls: <http://127.0.0.1:5173/>

Video mode starts automatically. `scene=01` through `scene=12` starts at that scene and continues to the ending. Space pauses the narrative scheduler between animation steps; an already-started engine animation completes. Reset is available when playback stops. No audio is generated.

## Dataset decisions

These decisions use rendered Chromium/WebGL2 frames at 1440 × 900, not just properties responses or tile HTTP status. The viewer's tile debug counters are shared across layers and are not evidence of a particular survey's image content.

| Dataset / provider | Field and FoV | Observation / decision |
| --- | --- | --- |
| DSS Color, CDS composition of STScI scanned plates, ESA mirror | M45, 5°; M42, 2.5°; opening, 65° | Useful optical structure and broad coverage. The scanned images include plate artefacts. |
| SDSS DR9 color, CDS g/r/i composition, ESA mirror | M42, 2.5° | Central nebula present but large black coverage gaps. Excluded as M42 base. |
| SDSS DR9 color | M51, 0.5° | Galaxy and surrounding field visible; used in scene 09. |
| 2MASS J/H/Ks, UMass/IPAC, ESA mirror | M42, 2.5° | Useful near-IR stars and nebular structure. |
| AllWISE W1/W2/W4, NASA/IPAC, ESA mirror | M42, 2.5° | Useful mid-IR emission; saturation/colour artefacts are dataset content. |
| Herschel SPIRE 250 µm, ESA | M42, 2.5° | Filamentary data present. Black regions at footprint edges are missing coverage. PNG and FITS use the same survey instance. |
| GALEX FUV/NUV, NASA/MAST | M42, 2.5° | Large hole at the target; excluded. |
| Chandra, NASA/CXC | M42, 2.5° | Sparse, dim pointed observations; excluded from this montage. |
| Planck HFI 100 GHz, ESA | M42, 2.5° | Microwave structure present, intrinsically coarser than optical; included as the first comparison band. |
| Haslam 408 MHz, Remazeilles reprocessing, ESA mirror | M42, 2.5° | Little visible contrast at this scale; excluded. |
| Fermi color, NASA/HEASARC, ESA mirror | M42, 2.5° | Coarse pixels and visible seams at this scale; excluded. |

Registry used: <https://skies.esac.esa.int/hipslist>. Individual URLs are in `main.ts` and the survey probe script. M45 is used for camera navigation; M42 is used for IR comparison because SPIRE has useful resolved structure there. This is not a claim that every wavelength has comparable sensitivity or angular resolution.

## State ownership

AstroViewer 3.17.0 `saveState` / `restoreState` captures camera matrices, FoV, inside/outside mode, ordered HiPS layers (URL, format, opacity, colour map and FITS stretch), grids, catalogue/footprint membership, visibility, colour and selection. HiPS objects are recreated on restore; tiles load asynchronously after the promise resolves. The demo rebinds its URL aliases to the new instances and waits for rendering before the restored toast. This cache rebinding is demo bookkeeping, not a manual replacement for engine state restoration.

The scene checks camera matrix, centre, FoV, inside state, ordered layer URLs/formats/opacities and overlay visibility. HSC and HST retain engine-managed identities. The `infrared` and `herschelfits` aliases must always resolve to one live SPIRE layer.

## Data access

`astrospatial-services` is pinned to 0.1.1. Its installed README is stale, but its public `astronomy/tap` exports include `TapService`, `parseVOTable` and `parseTapCsvTable`. Scene 08 makes a live ESASky ADQL request with a 12-second timeout and parses TABLEDATA. HTTP, CORS, timeout, empty-table and unsupported serialization failures use the explicitly labelled local HSC JSON fixture. The following JSON and CSV subsequences are always labelled local; CSV is an export of the existing 40-row fixture, with units from its metadata.

## Reproduce checks

```sh
npm run build
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --lib es2022,dom src/demos/a00-astronomy-showcase/main.ts src/vite-env.d.ts
npm run test:a00 -- --workers=1
node scripts/a00-browser-check.mjs 01
node scripts/a00-survey-check.mjs
```

The browser scripts launch headed Chromium and write local screenshots to `/tmp/a00-playback-NN` and `/tmp/a00-surveys`. The built-in browser was unavailable in this session; Chromium WebGL2 was available. External surveys remain network-dependent.

Verification results are recorded below after the final run.


## Compatibility fixes kept inside the demo

- Services 0.1.1 stores its fetch function as an instance property. In Chromium, passing the native function directly caused a network ServiceError; injecting `(input, init) => fetch(input, init)` made the same live query succeed. No service repository or installed package was edited.
- AstroViewer 3.17.0 catalogue disposal deletes vertex buffers while leaving attribute arrays enabled. The next HiPS draw emitted `WebGL: INVALID_OPERATION: drawElements: no buffer is bound to enabled attribute`, leaving PNG and FITS frames empty. The demo disables vertex attribute arrays after overlay removal, through the canvas WebGL2 context. The engine rebinds the attributes it needs on the next draw. The 09→10 reproduction then displayed Herschel structure again.
- Custom palettes require exactly 256 samples per channel; the demo supplies 256 samples in the required 0–255 channel range.
- FITS acquisition retains a temporary, explicitly labelled PNG preview until refinement settles or 20 seconds elapse. It uses no second HiPS instance and is removed before the pixel-content assertion.
- Fades account for stack order: an incoming upper layer fades in over an opaque base; an outgoing upper layer fades out to reveal an opaque lower layer.

SPIRE properties expose display limits but no `data_unit`. The readout therefore does not invent a physical unit. `hips` uses survey limits; `robust` uses the viewer's accumulated sample range, which may evolve as tiles arrive. Display limits are not a photometric calibration or temperature estimate.


Planck's optional `Moc.fits` request produced a CORS failure during one full playback; the viewer continued without MOC filtering and its image tiles rendered. This is reported separately from scientific image coverage. GALEX and Chandra exclusions are visual coverage/readability decisions, not HTTP failures.

Coordinate verification: the J2000→Galactic rotation was checked against the north Galactic pole (192.85948°, 27.12825° → b=90°) and Galactic-centre direction (266.4051°, −28.936175° → |l|, |b| < 0.001°). M42 maps to l=209.013738°, b=−19.381584°. Cursor RA/Dec comes from `getCoordinatesFromMouse()` after dispatching the same pointer position shown on screen; the centre comes from `getCenterCoordinates()`.

## Observed full playback

A headed Chromium video-mode run traversed all 12 scenes in about 6m 40s. It reached `A00 complete`, reported `stateRestored: true`, used live TAP, and had no page exceptions. The FITS wait hit its 20-second refinement cap once while hidden layers were still acquiring tiles; the subsequently observed grayscale and stretch frames contained resolved Herschel emission. The custom palette's channel scale was identified as too dark during this review and is checked separately after correction.

Local visual evidence: `/tmp/a00-playback-01/frames.json` maps 75 screenshots to their captions. Survey comparison evidence is under `/tmp/a00-surveys/`. These are local inspection artifacts, not published assets.

The alternative M45 field was also rendered at 5° with SPIRE, GALEX and Chandra. SPIRE showed only small isolated patches away from the centre; GALEX left a large central coverage hole; Chandra contained only a small dim pointed field. These frames support moving the wavelength comparison from M45 to M42. Reproduce with `node scripts/a00-survey-check.mjs m45`; evidence is in `/tmp/a00-surveys/*-m45.png` and `results-m45.json`.

## Automated verification results

- `npm run build`: passed for all 12 demos after the final edits.
- A00 TypeScript check: passed.
- `git diff --check`: passed.
- `npm run test:a00 -- --workers=1`: 8/8 passed in 14.7 minutes before the final palette-scale, PNG-hold and ending-caption polish. The main test played the entire sequence twice with reset, checked every scene number, restoration, final FoV and outside-sphere state, unique Herschel ownership and PNG reset, rendered FITS structure and absence of WebGL buffer errors. The remaining tests covered direct 03/05/07/09/12 entry, HSC/HST selection, forced TAP failure followed by CSV, and pause/resume.
- Final polish: 2/2 focused tests passed in 54.7 seconds (scene 12 and custom FITS palette). The palette test checks rendered pixel variation; `/tmp/a00-custom-palette.png` was also visually inspected.

The final test file contains nine tests; the full test and the visual playback run at real animation speed. No external-service mocks are used for the complete playback; only the explicit TAP-failure test aborts that service request.

## Remaining limits

- Remote tile services and TAP require network access. Refinement time varies; some dataset artefacts, coverage edges and resolution differences remain visible by design.
- The optional Planck MOC request can fail CORS while the image data remains usable.
- UV/X-ray and radio/gamma comparisons are deliberately excluded for the evaluated field/scale, as documented above.
- Pause gates demo scheduling; an already running engine animation finishes. Browser-integrated inspection was unavailable, so visual validation used local headed Chromium with WebGL2.
- The two compatibility fixes are local to A00; no changes were made in astro-viewer, astrospatial-services or AstroBrowser.

Git delivery: uncommitted review diff on `feat/a00-astronomy-showcase`, HEAD unchanged at `ad4da5727c5222c8829855deddfa8c42fde62b6a`. No push, PR, merge, deploy or publication. Pre-existing patch files remain untouched.
