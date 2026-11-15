import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenStreetMapOverpassService } from
  "astrospatial-services/earth/openstreetmap";

const area = {
  west: 26.27,
  south: 41.16,
  east: 26.34,
  north: 41.23,
};
const categories = [
  "bridge",
  "transport",
  "healthcare",
  "emergency",
  "education",
  "public-service",
  "utility",
  "poi",
];
const endpoint = process.env.OVERPASS_ENDPOINT;
const service = new OpenStreetMapOverpassService({
  ...(endpoint ? { endpoint } : {}),
  timeoutMs: 180_000,
});
const result = await service.queryInfrastructure({ area, categories });

const categoryPriority = {
  emergency: 5,
  healthcare: 5,
  utility: 5,
  bridge: 4,
  transport: 4,
  education: 3,
  "public-service": 3,
  poi: 1,
};
const centre = { longitudeDeg: 26.304, latitudeDeg: 41.195 };
const features = [...result.features]
  .sort((left, right) => {
    const priorityDifference =
      categoryPriority[right.category] - categoryPriority[left.category];
    if (priorityDifference !== 0) return priorityDifference;
    const leftDistance = Math.hypot(
      left.longitudeDeg - centre.longitudeDeg,
      left.latitudeDeg - centre.latitudeDeg,
    );
    const rightDistance = Math.hypot(
      right.longitudeDeg - centre.longitudeDeg,
      right.latitudeDeg - centre.latitudeDeg,
    );
    return leftDistance - rightDistance;
  })
  .slice(0, 100);

if (features.length !== 100) {
  throw new Error(
    `Expected at least 100 OpenStreetMap features, received ${result.features.length}`,
  );
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceUrl: "https://www.openstreetmap.org",
  ...result,
  selection: {
    method:
      "100 features ordered by infrastructure category priority, then distance from Soufli centre",
    inputFeatureCount: result.features.length,
    outputFeatureCount: features.length,
  },
  features,
};
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/demos/e00-earth-showcase/data/osm-soufli-infrastructure.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${features.length} of ${result.features.length} OpenStreetMap features to ${outputPath}`,
);
