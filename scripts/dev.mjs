import { spawn } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];
let shuttingDown = false;

function start(label, filter) {
  const child = spawn(
    pnpmCommand,
    ["--filter", filter, "dev"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    },
  );

  const prefix = `[${label}] `;
  child.stdout.on("data", chunk => process.stdout.write(prefix + chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)));
  child.stderr.on("data", chunk => process.stderr.write(prefix + chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)));
  child.on("error", error => {
    console.error(`${prefix}Unable to start:`, error);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const detail = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
    console.error(`${prefix}Process stopped (${detail}). Stopping the development session.`);
    shutdown(code ?? 1);
  });

  children.push(child);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  const forceTimer = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 3_000);
  forceTimer.unref();

  Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
  }))).finally(() => process.exit(exitCode));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting Budget App development services...");
console.log("  web:    Vite development server");
console.log("  server: Shared Platform API on port 3000\n");
start("server", "@budget-app/server");
start("web", "@budget-app/web");
