import { readdir, rm, access } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

const projectRoot = process.cwd();
const demosRoot = resolve(projectRoot, "src", "demos");
const distRoot = resolve(projectRoot, "dist");
const entries = await readdir(demosRoot, { withFileTypes: true });
const demos = [];
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const root = resolve(demosRoot, entry.name);
  try {
    await access(resolve(root, "index.html"));
    demos.push(entry.name);
  } catch {
    // Only directories containing an HTML entry point are buildable showcases.
  }
}
demos.sort();
if (demos.length === 0) throw new Error("No showcase entry points found in src/demos");
await rm(distRoot, { recursive: true, force: true });
for (const demo of demos) {
  console.log(`\nBuilding ${demo}...`);
  await build({
    root: resolve(demosRoot, demo),
    base: "./",
    build: { outDir: resolve(distRoot, demo), emptyOutDir: false },
  });
}
console.log(`\nBuilt ${demos.length} showcase(s) in ${distRoot}`);
