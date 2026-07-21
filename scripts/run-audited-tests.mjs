#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const value = (name, fallback = "") => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const requestedClassifications = list(value("--classification", "required"));
const requestedTypes = list(value("--type"));
const requestedFeatures = list(value("--feature"));
const allowFailures = argv.includes("--allow-failures");
const allowEmpty = argv.includes("--allow-empty");
const auditPath = path.join(root, "tests", "test-audit.json");
if (!existsSync(auditPath)) throw new Error("Run node scripts/audit-tests.mjs before executing audited suites.");
const audit = JSON.parse(await readFile(auditPath, "utf8"));
const selected = audit.tests.filter((test) =>
  requestedClassifications.has(test.currentClassification) &&
  (!requestedTypes.size || requestedTypes.has(test.testType)) &&
  (!requestedFeatures.size || requestedFeatures.has(test.feature)),
);
if (!selected.length) {
  const message = "No audited tests matched the requested suite.";
  if (allowEmpty) {
    console.log(`${message} Result: 0 passed, 0 failed.`);
    process.exit(0);
  }
  console.error(message);
  process.exit(2);
}

const results = [];
for (const [index, test] of selected.entries()) {
  const started = Date.now();
  process.stdout.write(`[${index + 1}/${selected.length}] [${test.feature}/${test.testType}] ${test.file} ... `);
  const result = await execute(path.join(root, test.file), test.file.endsWith(".mjs"));
  const durationMs = Date.now() - started;
  const status = result === 0 ? "passed" : "failed";
  console.log(`${status.toUpperCase()} (${durationMs} ms)`);
  results.push({ file: test.file, feature: test.feature, testType: test.testType, status, durationMs, exitCode: result });
}
const report = {
  generatedAt: new Date().toISOString(),
  filters: { classifications: [...requestedClassifications], types: [...requestedTypes], features: [...requestedFeatures] },
  selected: results.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
  durationByDomainMs: Object.fromEntries([...results.reduce((map, result) => map.set(result.feature, (map.get(result.feature) ?? 0) + result.durationMs), new Map()).entries()].sort()),
  slowest: [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 20),
  results,
};
await mkdir(path.join(root, "test-results"), { recursive: true });
await writeFile(path.join(root, "test-results", "audited-tests.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Result: ${report.passed} passed, ${report.failed} failed.`);
if (report.failed && !allowFailures) process.exitCode = 1;

function list(raw) {
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function execute(testPath, isJavaScript) {
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const command = isJavaScript ? process.execPath : existsSync(tsxCli) ? process.execPath : "tsx";
  const args = isJavaScript ? [testPath] : existsSync(tsxCli) ? [tsxCli, testPath] : [testPath];
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: false });
    child.on("error", () => resolve(127));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
