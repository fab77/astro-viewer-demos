import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GwisBurnedAreaService } from "astrospatial-services/earth/wildfire";

const query = {
  area: { west: 11, south: -18, east: 25, north: -4 },
  startDate: "2026-08-25",
  endDate: "2026-08-29",
  minAreaHa: 1000,
};
const result = await new GwisBurnedAreaService({ timeoutMs: 120_000 })
  .queryPerimeters(query);
const perimeters = [...result.perimeters]
  .sort((left, right) => right.areaHa - left.areaHa)
  .slice(0, 80);

if (perimeters.length !== 80) {
  throw new Error(`Expected 80 GWIS perimeters, received ${perimeters.length}`);
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceUrl: "https://maps.effis.emergency.copernicus.eu/gwis",
  ...result,
  selection: {
    method: "80 largest provider-reported areaHa values",
    inputPerimeterCount: result.perimeters.length,
    outputPerimeterCount: perimeters.length,
  },
  perimeters,
};
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/demos/e00-earth-showcase/data/gwis-africa-2026-08-25.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${perimeters.length} of ${result.perimeters.length} perimeters to ${outputPath}`,
);
