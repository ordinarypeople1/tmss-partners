// Builds the map's boundary files from the atlas packages in node_modules.
// The outputs are derived data and are not committed. See docs/references/maps.md.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";

const outDir = "public/geo";
const statesOut = `${outDir}/us-states.json`;
const worldOut = `${outDir}/world.json`;
const meta = "src/data/geo/admin1.json";
const statesIn = "node_modules/us-atlas/states-10m.json";
const worldIn = "node_modules/world-atlas/countries-110m.json";

const force = process.argv.includes("--force");
const inputs = [meta, statesIn, worldIn, "tools/build-geo.mjs"];
const newestInput = Math.max(...inputs.map((path) => statSync(path).mtimeMs));
const fresh = [statesOut, worldOut].every(
  (path) => existsSync(path) && statSync(path).mtimeMs >= newestInput,
);
if (fresh && !force) {
  process.exit(0);
}

// ISO 3166-1 numeric ids, as the world atlas keys its countries.
const PLAYABLE = { "840": "US", "826": "GB", "276": "DE", "250": "FR", "410": "KR", "392": "JP", "156": "CN" };

function roundCoordinates(value, digits) {
  if (typeof value === "number") {
    return Number(value.toFixed(digits));
  }
  return value.map((item) => roundCoordinates(item, digits));
}

function slim(collection, digits, properties) {
  return {
    type: "FeatureCollection",
    features: collection.features.map((item) => ({
      type: "Feature",
      properties: properties(item),
      geometry: {
        type: item.geometry.type,
        coordinates: roundCoordinates(item.geometry.coordinates, digits),
      },
    })),
  };
}

const { admin1 } = JSON.parse(readFileSync(meta, "utf8"));
const codeByFips = new Map(
  admin1.filter((unit) => unit.country === "US").map((unit) => [unit.fips, unit.code]),
);

const statesTopology = JSON.parse(readFileSync(statesIn, "utf8"));
const states = feature(statesTopology, statesTopology.objects.states);
states.features = states.features.filter((item) => codeByFips.has(item.id));
if (states.features.length !== codeByFips.size) {
  throw new Error(`expected ${codeByFips.size} states, found ${states.features.length}`);
}

const worldTopology = JSON.parse(readFileSync(worldIn, "utf8"));
const world = feature(worldTopology, worldTopology.objects.countries);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  statesOut,
  JSON.stringify(slim(states, 3, (item) => ({ code: codeByFips.get(item.id) }))),
);
writeFileSync(
  worldOut,
  JSON.stringify(slim(world, 2, (item) => ({ country: PLAYABLE[item.id] ?? null }))),
);
