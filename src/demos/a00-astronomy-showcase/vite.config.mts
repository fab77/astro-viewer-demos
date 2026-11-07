import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const lockfile = JSON.parse(
  readFileSync(new URL("../../../package-lock.json", import.meta.url), "utf8"),
);
const astroViewerVersion = lockfile.packages["node_modules/astro-viewer"]?.version;
if (!astroViewerVersion) {
  throw new Error("Cannot determine astro-viewer version from package-lock.json");
}

// XSA TAP does not allow browser CORS. Relay only its synchronous query route.
// Production hosting must provide this same route; no credentials are involved.
const proxy = {
  "/api/xmm-tap/sync": {
    target: "https://nxsa.esac.esa.int",
    changeOrigin: true,
    rewrite: (path: string) => path.replace("/api/xmm-tap", "/tap-server/tap"),
  },
};
export default defineConfig({
  server: { proxy },
  preview: { proxy },
  plugins: [
    {
      name: "a00-astro-viewer-version",
      transformIndexHtml(html) {
        return html.replaceAll("%ASTRO_VIEWER_VERSION%", astroViewerVersion);
      },
    },
  ],
});
