import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CemsRapidMappingService } from "astrospatial-services/earth/emergency";

const service = new CemsRapidMappingService({ timeoutMs: 120_000 });
const query = {
  activationCode: "EMSR868",
  areaNumber: 2,
  monitoringNumber: 3,
};
const [activation, maximumExtent, latestObservedExtent, floodDepth] = await Promise.all([
  service.getActivation(query.activationCode),
  service.queryFloodLayer({ ...query, kind: "maximum-flood-extent" }),
  service.queryFloodLayer({ ...query, kind: "observed-event" }),
  service.queryFloodLayer({ ...query, kind: "flood-depth" }),
]);

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceUrl:
    "https://mapping.emergency.copernicus.eu/activations/EMSR868/",
  activation: {
    code: activation.code,
    name: activation.name,
    category: activation.category,
    subCategory: activation.subCategory,
    eventAt: activation.eventAt,
    countries: activation.countries,
    provider: activation.provider,
  },
  query,
  maximumExtent,
  latestObservedExtent,
  floodDepth,
};
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/demos/e00-earth-showcase/data/cems-evros-2026-02.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${maximumExtent.data.features.length} maximum-extent and ` +
    `${latestObservedExtent.data.features.length} latest-observed features, plus ` +
    `${floodDepth.data.features.length} flood-depth polygons to ${outputPath}`,
);
