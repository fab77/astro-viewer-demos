import { defineConfig } from "vite";

// XSA TAP does not allow browser CORS. Relay only its synchronous query route.
// Production hosting must provide this same route; no credentials are involved.
const proxy = {
  "/api/xmm-tap/sync": {
    target: "https://nxsa.esac.esa.int",
    changeOrigin: true,
    rewrite: (path: string) => path.replace("/api/xmm-tap", "/tap-server/tap"),
  },
};
export default defineConfig({ server: { proxy }, preview: { proxy } });
