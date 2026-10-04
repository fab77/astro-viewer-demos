import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

const demos = [
  "a01-navigation-fov",
  "a02-hips-surveys",
  "a03-grids-coordinates",
  "a04-catalogues",
  "a05-observations-footprints",
  "a06-interaction-colours",
  "a07-scientific-view-state",
  "a08-developer-integration",
];

const projectRoot = process.cwd();
const distRoot = resolve(projectRoot, "dist");

await rm(distRoot, { recursive: true, force: true });

for (const demo of demos) {
  const root = resolve(projectRoot, "src", "demos", demo);
  const outDir = resolve(distRoot, demo);

  console.log(`\nBuilding ${demo}...`);
  await build({
    root,
    base: "./",
    build: {
      outDir,
      emptyOutDir: false,
    },
  });
}

console.log(`\nBuilt ${demos.length} demos in ${distRoot}`);
