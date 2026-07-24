import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readServerRuntimeConfig } from "../apps/server/src/runtimeConfig.mjs";

const root = new URL("../", import.meta.url);
const server = await readFile(new URL("apps/server/src/server.mjs", root), "utf8");
const service = await readFile(new URL("apps/web/src/features/persistence/replicationService.ts", root), "utf8");
const settings = await readFile(new URL("apps/web/src/pages/SettingsPage.tsx", root), "utf8");

const config = readServerRuntimeConfig({
  env: { PORT: "4321", HOST: "127.0.0.1", BUDGET_APP_SHUTDOWN_TIMEOUT_MS: "5000" },
  serverPackageDir: "/tmp/server",
  repositoryRoot: "/tmp/repo",
});
assert.equal(config.port, 4321);
assert.equal(config.host, "127.0.0.1");
assert.equal(config.shutdownTimeoutMs, 5000);
assert.throws(() => readServerRuntimeConfig({ env: { PORT: "70000" }, serverPackageDir: "/tmp/server", repositoryRoot: "/tmp/repo" }), /PORT/);
assert.throws(() => readServerRuntimeConfig({ env: { BUDGET_APP_EXPOSE_PATHS: "maybe" }, serverPackageDir: "/tmp/server", repositoryRoot: "/tmp/repo" }), /true or false/);

assert.match(server, /\/api\/ready/);
assert.match(server, /accessSync\(replicationBlobDir/);
assert.match(server, /closeIdleConnections/);
assert.match(service, /checkServerHealth/);
assert.match(service, /serverLatencyMs/);
assert.match(settings, /Check server/);
assert.match(settings, /formatServerOperationalStatus/);

console.log("Milestone 11 operational hardening validation passed.");
