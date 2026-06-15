const fs = require("node:fs");
const path = require("node:path");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tag = process.env.GITHUB_REF_NAME || "";
const tagVersion = tag.replace(/^v/, "");
const channel = tag.includes("beta") ? "beta" : "stable";
const releaseNotes = process.env.RELEASE_NOTES || "See changelog";

if (tagVersion && tagVersion !== packageJson.version) {
  throw new Error(
    `Tag version ${tagVersion} does not match package.json version ${packageJson.version}`
  );
}

function readFragments(dir) {
  const platforms = {};
  if (!fs.existsSync(dir)) return platforms;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const fragment = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    Object.assign(platforms, fragment.platforms || {});
  }
  return platforms;
}

const platforms = readFragments("updater-fragments");
if (!Object.keys(platforms).length) {
  throw new Error("No updater platform fragments were found");
}

const manifest = {
  version: tagVersion || packageJson.version,
  notes: releaseNotes,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.mkdirSync(path.join("public-updates", "updates"), { recursive: true });
fs.writeFileSync(
  path.join("public-updates", "updates", `${channel}.json`),
  JSON.stringify(manifest, null, 2)
);

fs.mkdirSync("release-manifests", { recursive: true });
fs.writeFileSync(
  path.join("release-manifests", `${channel}.json`),
  JSON.stringify(manifest, null, 2)
);

console.log(`Created ${channel}.json with ${Object.keys(platforms).length} platform entries`);
