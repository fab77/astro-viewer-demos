# AstroViewer Showcases

This repository hosts curated, executable showcases for AstroViewer. The first completed showcase is **A00 Astronomy**. Earth Observation and Mesh3D showcases are planned; they are not implemented yet.

## Requirements

- Node.js 22 or later
- npm
- Chromium for optional Playwright smoke checks

```bash
npm ci
npm run demo:a00
```

Open `http://localhost:5173/?mode=interactive` for interactive controls, or `http://localhost:5173/?mode=video` for the automated presentation. Individual scenes can be opened with `?mode=video&scene=04&end=4`.

## Build

```bash
npm run build
```

The build script discovers directories under `src/demos/` containing an `index.html` and builds each into `dist/<directory-name>/`. New showcase directories can be added without changing a hard-coded list.

## Smoke test

Start the A00 development server in one terminal, then run in another:

```bash
npm run demo:a00
npm run test:a00
```

`test:a00` runs the maintained smoke checks, not the retired 12-scene regression suite. External HiPS and TAP services may require network access. The development Vite configuration proxies the XMM TAP endpoint; production hosting must supply an equivalent proxy for live TAP requests.

## Structure

- `src/demos/a00-astronomy-showcase/` — approved 10-scene astronomy showcase, fixtures and Vite configuration
- `scripts/build-demos.mjs` — showcase discovery and production builds
- `playwright/a00-current-smoke.spec.ts` — A00 browser smoke checks
- `storyboard/astronomy.md` — narrative reference

The former A01–A11 tutorial demos and their historical tests were retired after consolidation into A00. Their source remains accessible through Git history.
