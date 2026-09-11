import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryRoot = process.cwd();
const stateDirectory = mkdtempSync(join(tmpdir(), "budget-app-e2e-"));
const children = [];
let shuttingDown = false;

function start(label, args, env = process.env) {
  const child = spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  const prefix = `[e2e:${label}] `;

  child.stdout.on("data", (chunk) => process.stdout.write(prefix + chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix + chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)));
  child.on("error", (error) => {
    console.error(`${prefix}Unable to start.`, error);
    void shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const detail = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
    console.error(`${prefix}Process stopped (${detail}).`);
    void shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3000/api/ready");
      if (response.ok) return;
      lastError = new Error(`Readiness returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  throw new Error("Budget API did not become ready in 20 seconds.", { cause: lastError });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }

  try {
    rmSync(stateDirectory, { recursive: true, force: true });
  } catch (error) {
    console.error(`Unable to remove isolated E2E state ${stateDirectory}.`, error);
    exitCode = 1;
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`Isolated server state: ${stateDirectory}`);

const serverEnvironment = {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: "3000",
  BUDGET_APP_DATA_DIR: stateDirectory,
};

start("server", [resolve("apps/server/src/server.mjs")], serverEnvironment);

try {
  await waitForServer();
  const webEnvironment = {
    ...process.env,
    BUDGET_APP_E2E_HTTP: "1",
  };
  start("web", [
    resolve("apps/web/node_modules/vite/bin/vite.js"),
    resolve("apps/web"),
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ], webEnvironment);
} catch (error) {
  console.error(error);
  shutdown(1);
}
