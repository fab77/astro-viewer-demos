import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

const firmsSources = new Set([
  "MODIS_NRT",
  "MODIS_SP",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA20_SP",
  "VIIRS_NOAA21_NRT",
  "VIIRS_NOAA21_SP",
  "VIIRS_SNPP_NRT",
  "VIIRS_SNPP_SP",
]);

function firmsRelayPlugin(mapKey: string | undefined): Plugin {
  const installRelay = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use(
      async (
        request: { method?: string; url?: string },
        response: {
          statusCode: number;
          setHeader(name: string, value: string): void;
          end(body?: string): void;
        },
        next: () => void,
      ) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://localhost",
        ).pathname;
        if (!pathname.startsWith("/api/firms/")) {
          next();
          return;
        }
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.end("FIRMS relay accepts GET requests only");
          return;
        }
        if (!mapKey) {
          response.statusCode = 503;
          response.end("FIRMS_MAP_KEY is not configured on the demo server");
          return;
        }

        const segments = pathname
          .slice("/api/firms/".length)
          .split("/")
          .filter(Boolean)
          .map(decodeURIComponent);
        const [source, area, dayRange, startDate] = segments;
        const areaValues = area?.split(",").map(Number) ?? [];
        const validArea =
          area === "world" ||
          (areaValues.length === 4 && areaValues.every(Number.isFinite));
        if (
          (segments.length !== 3 && segments.length !== 4) ||
          !firmsSources.has(source) ||
          !validArea ||
          !/^[1-5]$/.test(dayRange ?? "") ||
          (startDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(startDate))
        ) {
          response.statusCode = 400;
          response.end("Invalid FIRMS relay request");
          return;
        }

        const upstreamPath = [
          encodeURIComponent(mapKey),
          source,
          // NASA FIRMS requires literal commas in this path segment.
          area,
          dayRange,
          startDate,
        ]
          .filter((value): value is string => value !== undefined)
          .join("/");
        try {
          const upstream = await fetch(
            `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${upstreamPath}`,
            { headers: { Accept: "text/csv" } },
          );
          response.statusCode = upstream.status;
          response.setHeader(
            "Content-Type",
            upstream.headers.get("content-type") ?? "text/csv; charset=utf-8",
          );
          response.end(await upstream.text());
        } catch {
          response.statusCode = 502;
          response.end("NASA FIRMS is currently unavailable");
        }
      },
    );
  };

  return {
    name: "e00-firms-relay",
    configureServer: installRelay,
    configurePreviewServer: installRelay,
  };
}

const lockfile = JSON.parse(
  readFileSync(new URL("../../../package-lock.json", import.meta.url), "utf8"),
);

const astroViewerVersion =
  lockfile.packages["node_modules/astro-viewer"]?.version;

if (!astroViewerVersion) {
  throw new Error(
    "Cannot determine astro-viewer version from package-lock.json",
  );
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, repositoryRoot, "");
  const firmsMapKey = environment.FIRMS_MAP_KEY?.trim() || undefined;

  return {
    plugins: [
      firmsRelayPlugin(firmsMapKey),
      {
        name: "e00-astro-viewer-version",
        transformIndexHtml(html) {
          return html.replaceAll(
            "%ASTRO_VIEWER_VERSION%",
            astroViewerVersion,
          );
        },
      },
    ],
  };
});
