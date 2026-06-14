const fs = require("node:fs");

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readCargoVersion() {
  const cargo = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
  const match = cargo.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("Cannot find package version in src-tauri/Cargo.toml");
  return match[1];
}

function readSiteVersion() {
  const site = fs.readFileSync("renderer/src/content/site.ts", "utf8");
  const match = site.match(/CURRENT_VERSION\s*=\s*"([^"]+)"/);
  if (!match) throw new Error("Cannot find CURRENT_VERSION in renderer/src/content/site.ts");
  return match[1];
}

const packageVersion = readJson("package.json").version;
const tauriVersion = readJson("src-tauri/tauri.conf.json").version;
const cargoVersion = readCargoVersion();
const siteVersion = readSiteVersion();

const versions = new Set([packageVersion, tauriVersion, cargoVersion, siteVersion]);
if (versions.size !== 1) {
  console.error("Version mismatch:");
  console.error(`package.json: ${packageVersion}`);
  console.error(`src-tauri/Cargo.toml: ${cargoVersion}`);
  console.error(`src-tauri/tauri.conf.json: ${tauriVersion}`);
  console.error(`renderer/src/content/site.ts: ${siteVersion}`);
  process.exit(1);
}

console.log(`Versions are in sync: ${packageVersion}`);
