import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const localSoundtrackPath =
  process.env.A00_SOUNDTRACK ??
  "/tmp/astroviewer-a00-sync/a00-audio.wav";

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
  // The optional validation soundtrack remains outside the repository and is
  // exposed only by the local development server.
  define: {
    __A00_SOUNDTRACK_URL__: JSON.stringify(`/@fs${localSoundtrackPath}`),
  },
  server: {
    proxy,
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        dirname(localSoundtrackPath),
      ],
    },
  },
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
