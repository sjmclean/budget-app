#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsRoot = path.join(root, "tests");
const manifestPath = path.join(testsRoot, "legacy-test-manifest.json");
const classificationPath = path.join(testsRoot, "legacy-test-classification.json");
const argv = process.argv.slice(2);
const args = new Set(argv);
const valueArg = (name) => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
const match = valueArg("--match").toLocaleLowerCase();
const statusFilter = parseList(valueArg("--status"));
const domainFilter = parseList(valueArg("--domain"));
const kindFilter = parseList(valueArg("--kind"));
const listOnly = args.has("--list");
const summaryOnly = args.has("--summary");
const failFast = args.has("--fail-fast");
const includeRetired = args.has("--include-retired");
const reportPath = path.resolve(root, valueArg("--report") || "test-results/legacy-tests.json");

const manifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : { quarantine: [] };
const classification = existsSync(classificationPath)
  ? JSON.parse(await readFile(classificationPath, "utf8"))
  : { tests: [] };
const quarantine = new Map((manifest.quarantine ?? []).map((entry) => [entry.file, entry.reason]));
const classifications = new Map((classification.tests ?? []).map((entry) => [entry.file, entry]));

const discovered = (await discover(testsRoot))
  .map((file) => path.relative(root, file).replaceAll(path.sep, "/"))
  .filter((file) => !file.startsWith("tests/suites/"))
  .filter((file) => !file.startsWith("tests/support/"))
  .sort((a, b) => a.localeCompare(b));

const selected = [];
const skipped = [];
const unclassified = [];
for (const file of discovered) {
  const size = (await stat(path.join(root, file))).size;
  if (quarantine.has(file)) {
    skipped.push({ file, status: "quarantined", reason: quarantine.get(file), size });
    continue;
  }
  if (size === 0) {
    console.error(`Unquarantined empty test file: ${file}`);
    process.exitCode = 2;
    continue;
  }
  const entry = classifications.get(file);
  if (!entry) {
    unclassified.push(file);
    continue;
  }
  if (!includeRetired && entry.status === "retired") continue;
  if (match && !file.toLocaleLowerCase().includes(match)) continue;
  if (statusFilter.size && !statusFilter.has(entry.status)) continue;
  if (domainFilter.size && !domainFilter.has(entry.domain)) continue;
  if (kindFilter.size && !kindFilter.has(entry.kind)) continue;
  selected.push({ file, ...entry });
}

if (process.exitCode) process.exit();
if (unclassified.length > 0) {
  console.error(`Found ${unclassified.length} unclassified legacy test file(s).`);
  for (const file of unclassified) console.error(`UNCLASSIFIED ${file}`);
  console.error("Update tests/legacy-test-classification.json before running the suite.");
  process.exit(2);
}

printSummary(discovered.length, selected, skipped, classification.tests ?? []);
if (summaryOnly) process.exit(0);
if (listOnly) {
  for (const test of selected) console.log(`${test.status.padEnd(11)} ${test.kind.padEnd(11)} ${test.domain.padEnd(24)} ${test.file}`);
  process.exit(0);
}
if (selected.length === 0) {
  console.error("No legacy tests matched the supplied filters.");
  process.exit(2);
}

const startedAt = new Date().toISOString();
const results = [];
for (let index = 0; index < selected.length; index += 1) {
  const test = selected[index];
  const absolute = path.join(root, test.file);
  const started = Date.now();
  process.stdout.write(`[${index + 1}/${selected.length}] [${test.status}/${test.domain}] ${test.file} ... `);
  const execution = test.file.endsWith(".mjs")
    ? { command: process.execPath, args: [absolute] }
    : resolveTsxExecution(absolute);
  const result = await run(execution.command, execution.args, root);
  const durationMs = Date.now() - started;
  const executionStatus = result.code === 0 ? "passed" : "failed";
  console.log(`${executionStatus.toUpperCase()} (${durationMs} ms)`);
  results.push({
    file: test.file,
    classification: test.status,
    domain: test.domain,
    kind: test.kind,
    status: executionStatus,
    durationMs,
    exitCode: result.code,
    signal: result.signal,
  });
  if (executionStatus === "failed" && failFast) break;
}

const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  filters: {
    status: [...statusFilter],
    domain: [...domainFilter],
    kind: [...kindFilter],
    match,
  },
  discovered: discovered.length,
  selected: selected.length,
  quarantined: skipped,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
  results,
};
await writeReport(reportPath, report);
console.log(`Legacy test report: ${path.relative(root, reportPath)}`);
process.exitCode = report.failed > 0 ? 1 : 0;

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await discover(absolute));
    else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs"))) found.push(absolute);
  }
  return found;
}

function parseList(value) {
  return new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
}

function resolveTsxExecution(absoluteTestPath) {
  const localCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  return existsSync(localCli)
    ? { command: process.execPath, args: [localCli, absoluteTestPath] }
    : { command: "tsx", args: [absoluteTestPath] };
}

function run(command, commandArgs, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd, stdio: "inherit", shell: false });
    child.on("error", (error) => {
      console.error(`\nUnable to run ${command}: ${error.message}`);
      resolve({ code: 127, signal: null });
    });
    child.on("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

function printSummary(discoveredCount, selectedTests, quarantinedTests, allClassifiedTests) {
  const counts = new Map();
  for (const test of allClassifiedTests) counts.set(test.status, (counts.get(test.status) ?? 0) + 1);
  console.log(`Discovered ${discoveredCount} legacy test files.`);
  console.log(`Classification: ${[...counts.entries()].sort().map(([key, value]) => `${key}=${value}`).join(", ")}.`);
  console.log(`Selected: ${selectedTests.length}; quarantined: ${quarantinedTests.length}.`);
}

async function writeReport(outputPath, report) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
