#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suitesRoot = path.join(root, "tests", "suites");
const matchArg = process.argv.find((value) => value.startsWith("--match="));
const match = matchArg ? matchArg.slice("--match=".length).toLocaleLowerCase() : "";
const files = (await discover(suitesRoot))
  .filter((file) => file.endsWith(".test.ts"))
  .filter((file) => !match || file.toLocaleLowerCase().includes(match))
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.error(match ? `No feature tests matched '${match}'.` : "No feature tests were discovered.");
  process.exit(2);
}

console.log(`Running ${files.length} feature test files.`);
const localCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const command = existsSync(localCli) ? process.execPath : "tsx";
const commandArgs = existsSync(localCli) ? [localCli, "--test", ...files] : ["--test", ...files];
const child = spawn(command, commandArgs, { cwd: root, stdio: "inherit", shell: false });
child.on("error", (error) => {
  console.error(`Unable to run ${command}: ${error.message}`);
  process.exitCode = 127;
});
child.on("exit", (code, signal) => {
  if (signal) console.error(`Feature tests terminated by ${signal}.`);
  process.exitCode = code ?? 1;
});

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await discover(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}
