import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const defaultCertificatePath = resolve(repositoryRoot, ".certs/budget-app-dev.crt");
const defaultPrivateKeyPath = resolve(repositoryRoot, ".certs/budget-app-dev.key");
const certificatePath =
  process.env.BUDGET_APP_HTTPS_CERT?.trim() || defaultCertificatePath;
const privateKeyPath =
  process.env.BUDGET_APP_HTTPS_KEY?.trim() || defaultPrivateKeyPath;
const https = existsSync(certificatePath) && existsSync(privateKeyPath)
  ? {
      cert: readFileSync(certificatePath),
      key: readFileSync(privateKeyPath),
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 650,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    https,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    https,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
