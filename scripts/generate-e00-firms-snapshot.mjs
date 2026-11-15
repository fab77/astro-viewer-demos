import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FirmsService,
  parseFirmsCsv,
} from "astrospatial-services/earth/wildfire";

const mapKey = process.env.FIRMS_MAP_KEY?.trim();
const inputCsvPath = process.env.FIRMS_INPUT_CSV?.trim();

const query = {
  source: "VIIRS_NOAA21_NRT",
  area: { west: 11, south: -18, east: 25, north: -4 },
  dayRange: 5,
  startDate: "2026-08-25",
};
let result;
if (inputCsvPath) {
  const csv = await readFile(inputCsvPath, "utf8");
  result = {
    detections: parseFirmsCsv(csv, query.source),
    ...query,
    provider: "NASA FIRMS",
  };
} else {
  if (!mapKey) {
    throw new Error(
      "FIRMS_MAP_KEY or FIRMS_INPUT_CSV is required; keep credentials in the ignored .env file",
    );
  }
  const service = new FirmsService({
    authentication: { kind: "map-key", mapKey },
    timeoutMs: 120_000,
  });
  result = await service.queryArea(query);
}
const detections = result.detections
  .filter((detection) => Number.isFinite(detection.fireRadiativePowerMw))
  .sort(
    (left, right) =>
      (right.fireRadiativePowerMw ?? -Infinity) -
      (left.fireRadiativePowerMw ?? -Infinity),
  )
  .slice(0, 500);

if (detections.length !== 500) {
  throw new Error(`Expected 500 FIRMS detections, received ${detections.length}`);
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  provider: result.provider,
  source: result.source,
  sourceUrl: "https://firms.modaps.eosdis.nasa.gov/api/area",
  area: result.area,
  startDate: result.startDate,
  dayRange: result.dayRange,
  selection: {
    method: "500 highest fireRadiativePowerMw values",
    inputDetectionCount: result.detections.length,
    outputDetectionCount: detections.length,
  },
  detections,
};
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/demos/e00-earth-showcase/data/firms-africa-2026-08-25.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${detections.length} of ${result.detections.length} detections to ${outputPath}`,
);
