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

const packageVersion = readJson("package.json").version;
const tauriVersion = readJson("src-tauri/tauri.conf.json").version;
const cargoVersion = readCargoVersion();

const versions = new Set([packageVersion, tauriVersion, cargoVersion]);
if (versions.size !== 1) {
  console.error("Version mismatch:");
  console.error(`package.json: ${packageVersion}`);
  console.error(`src-tauri/Cargo.toml: ${cargoVersion}`);
  console.error(`src-tauri/tauri.conf.json: ${tauriVersion}`);
  process.exit(1);
}

console.log(`Versions are in sync: ${packageVersion}`);
