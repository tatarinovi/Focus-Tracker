const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(projectRoot, "renderer-dist"), { recursive: true });

const env = {};
for (const [key, value] of Object.entries(process.env)) {
  const existingKey = Object.keys(env).find(
    (envKey) => envKey.toLowerCase() === key.toLowerCase(),
  );
  if (!existingKey) {
    env[key] = value;
  }
}

const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "Path";
const paths = [];

const cargoBin = path.join(env.USERPROFILE || "", ".cargo", "bin");
if (fs.existsSync(path.join(cargoBin, "cargo.exe"))) {
  paths.push(cargoBin);
}

paths.push(path.join(projectRoot, "node_modules", ".bin"));
env[pathKey] = [...paths, env[pathKey] || ""].join(path.delimiter);

const quoteCmdArg = (value) => {
  const text = String(value);
  return /^[A-Za-z0-9._:/\\=-]+$/.test(text)
    ? text
    : `"${text.replace(/"/g, '""')}"`;
};

const args = process.argv.slice(2);
const command = process.platform === "win32" ? "cmd.exe" : "tauri";
const commandArgs = process.platform === "win32"
  ? ["/d", "/c", ["tauri", ...args.map(quoteCmdArg)].join(" ")]
  : args;

const child = spawn(command, commandArgs, {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
