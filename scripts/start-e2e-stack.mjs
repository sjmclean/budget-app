import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { childSpawnOptions, terminateProcessTree } from "./e2e-process-lifecycle.mjs";

const repositoryRoot = process.cwd();
const stateDirectory = mkdtempSync(join(tmpdir(), "budget-app-e2e-"));
const children = [];
let shutdownPromise;

const controlServer = createServer(async (request, response) => {
  if (request.url === "/health" && request.method === "GET") {
    response.writeHead(204).end();
    return;
  }
  if (request.url === "/shutdown" && request.method === "POST") {
    const exitCode = await shutdown(0, false);
    response.writeHead(exitCode === 0 ? 200 : 500, {
      "Content-Type": "application/json; charset=utf-8",
    }).end(JSON.stringify({ exitCode }));
    setImmediate(() => {
      void closeControlServer().catch((error) => {
        console.error("Unable to close the E2E supervisor control server.", error);
        process.exitCode = 1;
      });
    });
    return;
  }
  response.writeHead(404).end();
});

function start(label, args, env = process.env) {
  const child = spawn(process.execPath, args, {
    ...childSpawnOptions(repositoryRoot, env),
  });
  const prefix = `[e2e:${label}] `;

  child.stdout.on("data", (chunk) => process.stdout.write(prefix + chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix + chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)));
  child.on("error", (error) => {
    console.error(`${prefix}Unable to start.`, error);
    void shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shutdownPromise) return;
    const detail = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
    console.error(`${prefix}Process stopped (${detail}).`);
    void shutdown(code ?? 1);
  });
  children.push({ child, label });
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

function closeControlServer() {
  return new Promise((resolveClose, rejectClose) => {
    controlServer.close((error) => error ? rejectClose(error) : resolveClose());
    controlServer.closeIdleConnections?.();
  });
}

function shutdown(exitCode = 0, closeControl = true) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    const results = await Promise.allSettled(
      children.map(({ child, label }) => terminateProcessTree(child, label)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Unable to terminate an E2E process tree.", result.reason);
        exitCode = 1;
      }
    }

    try {
      rmSync(stateDirectory, { recursive: true, force: true });
    } catch (error) {
      console.error(`Unable to remove isolated E2E state ${stateDirectory}.`, error);
      exitCode = 1;
    }

    if (closeControl) {
      try {
        await closeControlServer();
      } catch (error) {
        console.error("Unable to close the E2E supervisor control server.", error);
        exitCode = 1;
      }
    }

    process.exitCode = exitCode;
    return exitCode;
  })();
  return shutdownPromise;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`Isolated server state: ${stateDirectory}`);

try {
  await new Promise((resolveListen, rejectListen) => {
    controlServer.once("error", rejectListen);
    controlServer.listen(3001, "127.0.0.1", resolveListen);
  });
} catch (error) {
  console.error("Unable to start the E2E supervisor control server.", error);
  try {
    rmSync(stateDirectory, { recursive: true, force: true });
  } catch (cleanupError) {
    console.error(`Unable to remove isolated E2E state ${stateDirectory}.`, cleanupError);
  }
  process.exitCode = 1;
}

const serverEnvironment = process.exitCode ? null : {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: "3000",
  BUDGET_APP_DATA_DIR: stateDirectory,
};

if (serverEnvironment) {
  start("server", [resolve("apps/server/src/server.mjs")], serverEnvironment);
}

try {
  if (!serverEnvironment) throw new Error("E2E supervisor startup failed.");
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
  await shutdown(1);
}
