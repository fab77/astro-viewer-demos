import type { AstroViewer, CatalogueGL, FootprintSetGL } from "astro-viewer";

declare global {
  interface AstroViewerDemoAPI {
    viewer: AstroViewer;
    ready: boolean;
    mode: "video" | "interactive";

    runA01?: () => Promise<void>;
    runA02?: () => Promise<void>;
    runA03?: () => Promise<void>;
    runA04?: () => Promise<void>;
    runA05?: () => Promise<void>;
    runA06?: () => Promise<void>;
    runA07?: () => Promise<void>;

    reset: () => Promise<void>;

    getCatalogue?: () => CatalogueGL | null;
    getFootprintSet?: () => FootprintSetGL | null;

    getCapturedState?: () => {
      raDeg: number;
      decDeg: number;
      fovDeg: number;
    } | null;

    showLabel?: (
      headline: string,
      detail?: string,
      apiCommand?: string,
      durationMs?: number,
    ) => Promise<void>;
  }

  interface Window {
    astroViewerDemo?: AstroViewerDemoAPI;
  }
}

export {};
