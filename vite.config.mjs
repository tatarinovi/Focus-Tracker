import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawPort = process.env.PORT;
const port = rawPort && !Number.isNaN(Number(rawPort)) && Number(rawPort) > 0
  ? Number(rawPort)
  : 3000;
const host = process.env.HOST || "127.0.0.1";

export default defineConfig({
  root: path.resolve(__dirname, "renderer"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "renderer/src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(__dirname, "renderer-dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host,
  },
  preview: {
    port,
    host,
  },
});
