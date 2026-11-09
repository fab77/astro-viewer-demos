import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

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

export default defineConfig({
  plugins: [
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
});