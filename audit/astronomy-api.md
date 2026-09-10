# AstroViewer Astronomy Public API Audit

This document tracks the public API required by the Astronomy video/demo scenarios.

The first scope is A01 — Navigation & FoV.

---

## A01 — Navigation & FoV API Matrix

| Storyboard action | Current AstroViewer 3.12 API | Status | Target |
|---|---|---|---|
| Immediate navigation to RA/Dec | `goTo(raDeg, decDeg)` | Ready | Keep |
| Animated navigation to RA/Dec | `flyTo(raDeg, decDeg, durationMs?)` | Ready | Keep |
| Read centre coordinates | `getCenterCoordinates()` | Ready | Keep |
| Read Field of View | `getFoV(): SphereFoV` | Ready / review semantics | Keep |
| Set absolute FoV | `changeFoV`, `changeFoV2`, `changeFoV3` | Audit required | `setFoV(deg)` |
| Animate to absolute FoV | Not available | Missing | `flyToFoV(deg, durationMs?)` |
| Relative zoom in | Internal wheel/camera implementation only | Missing | `zoomIn(steps?, durationMs?)` |
| Relative zoom out | Internal wheel/camera implementation only | Missing | `zoomOut(steps?, durationMs?)` |
| Interactive pan | Pointer interaction | Ready | Playwright mouse |
| Interactive wheel zoom | Wheel interaction | Ready | Playwright wheel |

---

# A-01 — Consolidate FoV API

## Current API

AstroViewer 3.12 currently exposes:

    changeFoV(deg: number): void
    changeFoV2(deg: number): void
    changeFoV3(deg: number): void

These methods use different implementations and expose ambiguous semantics to the consumer.

The target public API is:

    setFoV(deg: number): void

Only one deterministic implementation should remain public.

---

## Current implementations

### changeFoV

Uses:

    SphereFoV.computeDistanceFromAngle(deg)

and translates the camera by the resulting distance.

The FoV is explicitly refreshed afterwards.

### changeFoV2

Uses:

    SphereFoV.computeCameraPositionForFoV(deg)

and sets the resulting camera position directly.

### changeFoV3

Uses:

    SphereFoV.computeCameraPositionForAngularDiameter(deg)

and sets the resulting camera position directly.

The perspective matrix is recomputed afterwards.

---

## Required semantic decision

Before selecting an implementation, `setFoV(deg)` must have an explicit scientific definition.

`SphereFoV` currently exposes:

    minFoV
    xFoV
    yFoV

and also distinguishes between:

    computeCameraPositionForMinFoV(...)
    computeCameraPositionForFoV(...)
    computeCameraPositionForAngularDiameter(...)

The audit must therefore determine what an absolute AstroViewer FoV means.

Proposed semantic contract:

    viewer.setFoV(0.5)

means:

    Set the minimum angular Field of View of the viewport
    to 0.5 degrees.

This keeps the requested FoV independent from viewport aspect ratio.

This assumption must be validated during A-01 before implementation.

---

## A-01 validation matrix

The selected implementation must be tested with multiple target FoVs.

Suggested values:

    60 deg
    30 deg
    10 deg
    5 deg
    1 deg
    0.5 deg
    0.1 deg
    0.05 deg

For every value:

    setFoV(target)

then verify:

    abs(getFoV().minFoV - target) <= tolerance

The appropriate tolerance must be determined from the numerical behaviour of the projection and ray-picking implementation.

Tests should also cover:

- different canvas aspect ratios;
- different RA/Dec positions;
- repeated FoV changes;
- zoom-in followed by zoom-out;
- behaviour close to supported minimum FoV;
- camera orientation preservation.

---

# A-02 — Animated FoV and Relative Zoom

The target public API is:

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

---

## flyToFoV semantics

`flyToFoV` is the animated equivalent of `setFoV`.

Example:

    viewer.setFoV(0.5)

performs an immediate change.

    await viewer.flyToFoV(0.5, 1200)

smoothly animates toward the same deterministic FoV target.

The final FoV must be equivalent to:

    viewer.setFoV(0.5)

within the defined numerical tolerance.

---

## zoomIn / zoomOut semantics

Relative zoom operates in logical steps, not camera-distance units.

Examples:

    await viewer.zoomIn()

performs one animated zoom-in step.

    await viewer.zoomIn(3)

computes the target corresponding to three logical zoom-in steps
and performs one smooth animation toward that target.

    await viewer.zoomOut(2)

does the equivalent operation in the opposite direction.

`zoomIn(3)` must not execute three independent animations.

---

## Relation with current wheel zoom

The existing wheel implementation calculates the zoom amount from the current FoV:

    currentFov
        ↓
    computeZoomStep(...)
        ↓
    Camera.zoom(...)
        ↓
    refreshFoV(...)

This behaviour should be reviewed during A-02 because it already contains
the scale-dependent zoom behaviour used by interactive navigation.

The programmatic zoom API should preserve a comparable perceptual behaviour
without simulating wheel events.

Preferred model:

    current FoV
        ↓
    logical zoom steps
        ↓
    deterministic target FoV
        ↓
    calculate target camera position
        ↓
    animate camera toward target
        ↓
    exact final FoV

---

# Out of Scope for A-01 / A-02

The current public method:

    flyTo(raDeg, decDeg, durationMs?): void

does not return a Promise.

A future API consistency review may consider making animated navigation
awaitable.

This is not required for A-01 or A-02 and should not expand the current scope.

---

# A01 Readiness

A01 — Navigation & FoV can use immediately:

    goTo(...)
    flyTo(...)
    getCenterCoordinates()
    getFoV()

A01 is blocked for its final automated form by:

    A-01 — setFoV
    A-02 — flyToFoV / zoomIn / zoomOut

Interactive Playwright pan and mouse-wheel demonstrations do not depend on
these API additions.