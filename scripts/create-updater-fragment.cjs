const fs = require("node:fs");
const path = require("node:path");

const repo = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;
const runnerOs = process.env.RUNNER_OS;

if (!repo || !tag || !runnerOs) {
  throw new Error("GITHUB_REPOSITORY, GITHUB_REF_NAME and RUNNER_OS are required");
}

function walk(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else result.push(full);
  }
  return result;
}

function platformKeys(file) {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (runnerOs === "Windows") {
    if (normalized.includes("/nsis/") || normalized.endsWith(".exe")) {
      return ["windows-x86_64-nsis"];
    }
    if (normalized.includes("/msi/") || normalized.endsWith(".msi")) {
      return ["windows-x86_64-msi"];
    }
    return ["windows-x86_64"];
  }
  if (runnerOs === "Linux") {
    if (normalized.endsWith(".appimage")) return ["linux-x86_64-appimage"];
    if (normalized.endsWith(".deb")) return ["linux-x86_64-deb"];
    if (normalized.endsWith(".rpm")) return ["linux-x86_64-rpm"];
    return ["linux-x86_64"];
  }
  if (runnerOs === "macOS" && normalized.includes("universal")) {
    return ["darwin-x86_64", "darwin-aarch64"];
  }
  if (runnerOs === "macOS") return ["darwin-x86_64"];
  throw new Error(`Unsupported runner OS: ${runnerOs}`);
}

const bundleDir = path.join("src-tauri", "target");
const signatures = walk(bundleDir).filter((file) => file.endsWith(".sig"));

if (!signatures.length) {
  throw new Error("No updater signatures were found. Ensure createUpdaterArtifacts is enabled.");
}

const platforms = {};
for (const signaturePath of signatures) {
  const artifactPath = signaturePath.slice(0, -4);
  if (!fs.existsSync(artifactPath)) continue;

  const fileName = path.basename(artifactPath);
  const entry = {
    signature: fs.readFileSync(signaturePath, "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(fileName)}`,
  };
  for (const key of platformKeys(artifactPath)) {
    platforms[key] = entry;
  }
}

fs.mkdirSync("updater-fragments", { recursive: true });
fs.writeFileSync(
  path.join("updater-fragments", `${runnerOs.toLowerCase()}.json`),
  JSON.stringify({ platforms }, null, 2)
);
