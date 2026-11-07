# A00 — caption audit, GALEX and three saved views

Follow-up review on 2026-11-05. User clarified that the third target is **M101**, not M41. Changes remain local to astro-viewer-demos.

## Caption audit

Reviewed the scene title, description and displayed command against the adjacent executed operations for scenes 01–12. Commands are illustrative public API excerpts, with scene variables named for their role; they are not advertised as standalone complete programs.

| Area | Correction |
| --- | --- |
| 03 survey loading | Cached layers show `getActiveHiPSLayers().find(...)` with the actual URL; new layers show `addHiPSFromUrl`. Transition descriptions distinguish loading/fading from the completed image. |
| 03 ultraviolet | GALEX Color is labelled **NUV + FUV composite**, not two independent bands. Uses the working MAST mirror found in A11. |
| 07 catalogue entry | Travel/zoom, SDSS switching and catalogue construction now have separate captions. Previously the catalogue API was displayed during the flight. |
| 07 footprints | Reframing M51 has a camera caption; STC-S construction is shown only for footprint loading. |
| 07→08 | Removed the exit zoom to 5° and the archive-entry zoom back to 0.5°. Direct 08 links initialise at the same 0.5° field. |
| 08 TAP | Shows `tap.querySync(...)` and the actual ADQL, identifies astrospatial-services and retains live/fallback labels. |
| 09 saved views | Separate camera travel, layer setup, catalogue loading, save, restore and delete captions. UI handlers perform the same public state API operations used by the animation. |
| 10 FITS | PNG caption includes layer activation and native palette reset. Linear FITS caption identifies grayscale, linear stretch and robust range. Stretch captions disclose the return to Planck palette. Optical return lists format/opacity/palette changes. |
| 11 sphere | Added captions for the initial widening and later M51 zoom, which previously happened under preceding descriptions. |
| Provenance | Reports actual visible layers, palette and FITS display range; overlay labels depend on actual catalogue/footprint visibility, not just scene number. |

## Working GALEX URL and coverage

A11 uses `https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/GALEXColor/` at M101. A00 now uses this exact mirror in its spectrum scene at M51. Rendered both M101 and M51: real galaxy structure is visible. Separate NUV/FUV CDS services are no longer attempted during normal A00 playback.

SDSS at M45 had no useful field coverage, and the previous GALEX M45 probe showed a central gap. Therefore the Pleiades saved view uses DSS + 2MASS, with the infrared overlay at 65%. This is an explicit coverage-based choice, not a claim that GALEX or SDSS cover the cluster.

Probe: `node scripts/a00-survey-check.mjs states`. Evidence: `/tmp/a00-surveys/states-*.png`, `results-states.json`; earlier GALEX M45 evidence remains in `galex-m45.png`.

## Three actual runtime snapshots

| State | Field / FoV | Content |
| --- | --- | --- |
| A00-M51 | M51 / 0.5° | SDSS + 2MASS 30%, local HSC sources and HST footprints. |
| A00-M45 | Pleiades / 5° | DSS + 2MASS 65%, no catalogue or footprints. |
| A00-M101 | M101 / 0.5° | HST ACS pointed-image mosaic and 30 real HSC v3 sources from MAST. |

Each card contains a canvas thumbnail, title and layer summary. Cards become interactive once all three views exist, with restore and delete buttons. The animation clicks those same buttons in order 1→2→3, then deletes each snapshot in order. Pause allows manual exploration; restore handlers do not wait on the animation pause gate. Actions are serialised to avoid overlapping restores. Deleting a snapshot leaves the current sky intact. The empty stack then closes before FITS continues.

Restoration verifies centre, FoV, view matrix, layer URL/order/format/opacity and overlay visibility against the captured snapshot. Catalogue and footprint references are retained by the installed ViewerStateManager while saved; the demo rebinds HiPS instances after restore. The existing WebGL attribute cleanup is also applied after snapshot deletion can release detached resources.

HST ACS native images are displayed as supplied, including their negative rendering, observation boundaries and gaps. These are not a continuous colour portrait. Some requests for unobserved HST sky tiles report CORS errors; the M101 observed mosaic renders.

## M101 source provenance

`hsc_m101_sources.json` contains 30 real HSC v3 summary records retrieved from:

`https://catalogs.mast.stsci.edu/api/v0.1/hsc/v3/summary.csv?ra=210.8023&dec=54.3489&radius=0.02&pagesize=30`

Fields: MatchID → match_id (string), MatchRA/MatchDec → ra/dec (degrees), CI → ci, NumImages → num_images. The fixture retains the source URL, query centre and description. It is explicitly local, not portrayed as a live scene-09 request. No M51 sources are relocated to M101.

## Validation

Final results are recorded below once browser runs finish. The first new interactive test incorrectly expected Ready on a direct `?scene=09` URL, which autostarts by design; that test expectation was corrected without changing the app behaviour.

Final validation: all 12 demos build; A00 TypeScript and `git diff --check` pass. The three-state interactive test passes (1.9 minutes), including real clicks, all layer/target/catalogue assertions, individual deletion and nonblank FITS rendering afterwards. The 07→08 continuity test passes with identical centre and FoV. The GALEX browser check passes for the actual MAST URL, visible opacity, native palette, M51 centre and composite caption; the cached 2MASS command correctly uses layer lookup. A headed real-time 09→12 playback completes with no page exceptions, all three restored IDs and all three deleted IDs. Screenshots reviewed: the three-card stack, each restored field, GALEX M51, and the revised later-scene transitions.

Evidence: `state-click-tests.log`, `states-build.log`, `galex-mast-check.json`; full playback frames and timeline under `/tmp/a00-playback-09/`; `A00-M51-restored.png`, `A00-M45-restored.png`, `A00-M101-restored.png` and `a00-three-states.png` under `/tmp/`. Network CORS warnings on unobserved HST tiles are separate from page exceptions and visible M101 coverage.
