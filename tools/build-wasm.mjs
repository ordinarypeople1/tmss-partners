import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const out = "src/sim/pkg/sim_core.js";
const force = process.argv.includes("--force");

function newest(dir) {
  let stamp = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      stamp = Math.max(stamp, newest(path));
    } else if (entry.name.endsWith(".rs") || entry.name.endsWith(".toml")) {
      stamp = Math.max(stamp, statSync(path).mtimeMs);
    }
  }
  return stamp;
}

const fresh = existsSync(out) && statSync(out).mtimeMs >= newest("crates/sim-core");
if (fresh && !force) {
  process.exit(0);
}

execSync(
  "cargo build -p sim-core --release --target wasm32-unknown-unknown --features wasm",
  { stdio: "inherit" },
);
execSync(
  "wasm-bindgen --target web --out-dir src/sim/pkg target/wasm32-unknown-unknown/release/sim_core.wasm",
  { stdio: "inherit" },
);
