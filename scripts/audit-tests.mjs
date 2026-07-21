#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsRoot = path.join(root, "tests");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const classification = JSON.parse(await readFile(path.join(testsRoot, "legacy-test-classification.json"), "utf8"));
const classified = new Map(classification.tests.map((entry) => [entry.file, entry]));
const scriptsText = Object.values(packageJson.scripts ?? {}).join("\n");
const files = (await discover(testsRoot))
  .filter((file) => /\.(?:ts|mjs)$/.test(file))
  .filter((file) => !file.includes("/support/"))
  .sort();
const hashes = new Map();
const audit = [];

for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  const legacy = classified.get(file);
  const normalised = source
    .replaceAll(/\/\/.*$/gm, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  const hash = createHash("sha256").update(normalised).digest("hex");
  const same = hashes.get(hash) ?? [];
  same.push(file);
  hashes.set(hash, same);
  const currentClassification = legacy?.status ?? (file.includes("/roadmap/") ? "pending" : "required");
  const testType = inferType(file, source, legacy?.kind);
  const meaningfulAssertions = countAssertions(source);
  audit.push({
    file,
    feature: legacy?.domain ?? inferDomain(file),
    testType,
    currentClassification,
    includedInCommands: inclusion(file, scriptsText),
    meaningfulAssertions,
    hasMeaningfulAssertions: meaningfulAssertions > 0,
    duplicateOf: null,
    disposition: disposition(currentClassification, testType, meaningfulAssertions),
    rationale: rationale(currentClassification, testType, meaningfulAssertions),
  });
}

for (const duplicates of hashes.values()) {
  if (duplicates.length < 2) continue;
  for (const file of duplicates.slice(1)) {
    const entry = audit.find((candidate) => candidate.file === file);
    entry.duplicateOf = duplicates[0];
    if (entry.disposition === "retained") entry.disposition = "investigated";
    entry.rationale = `Exact normalised duplicate candidate of ${duplicates[0]}; review before merging or retiring.`;
  }
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repositoryTestFiles: audit.length,
  classifications: countBy(audit, "currentClassification"),
  features: countBy(audit, "feature"),
  testTypes: countBy(audit, "testType"),
  dispositions: countBy(audit, "disposition"),
  filesWithoutAssertions: audit.filter((entry) => !entry.hasMeaningfulAssertions).map((entry) => entry.file),
  duplicateCandidates: audit.filter((entry) => entry.duplicateOf).map(({ file, duplicateOf }) => ({ file, duplicateOf })),
  tests: audit,
};
await writeFile(path.join(testsRoot, "test-audit.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
await writeFile(path.join(root, "TEST-AUDIT-SUMMARY.md"), renderSummary(output), "utf8");
console.log(`Audited ${audit.length} test files.`);

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await discover(absolute));
    else if (entry.isFile()) found.push(path.relative(root, absolute).replaceAll(path.sep, "/"));
  }
  return found;
}

function inferDomain(file) {
  const value = file.toLowerCase();
  const rules = [
    ["scheduled", "scheduled-transactions"], ["transfer", "transfers"], ["ynab", "ynab4"],
    ["actual", "actual-import"], ["import", "import"], ["backup", "backup-restore"],
    ["undo", "undo-redo"], ["budget", "budget"], ["category", "categories"],
    ["payee", "payees"], ["sqlite", "persistence"], ["persistence", "persistence"],
    ["report", "reports"], ["transaction", "transactions"],
  ];
  return rules.find(([needle]) => value.includes(needle))?.[1] ?? "cross-cutting";
}

function inferType(file, source, legacyKind) {
  if (file.includes("/roadmap/") || legacyKind === "roadmap") return "roadmap";
  if (/performance|benchmark/i.test(file)) return "performance";
  if (/readFileSync|readFile\(|source-text|structure/i.test(source) || file.endsWith(".mjs")) return "structural";
  if (/contract/i.test(file) || legacyKind === "contract") return "contract";
  if (/sqlite|repository|persistence|roundtrip/i.test(file)) return "integration";
  if (/regression|fidelity|audit/i.test(file)) return "regression";
  return legacyKind === "behaviour" ? "integration" : "unit";
}

function countAssertions(source) {
  return (source.match(/\b(?:assert(?:\.[a-zA-Z]+)?|expect)\s*\(/g) ?? []).length;
}

function inclusion(file, scripts) {
  if (file.startsWith("tests/suites/")) return ["test:node", "test:all"];
  const direct = Object.entries(packageJson.scripts ?? {}).filter(([, command]) => command.includes(file)).map(([name]) => name);
  const legacy = classified.has(file) ? ["test:legacy", "test:all"] : [];
  return [...new Set([...direct, ...legacy])];
}

function disposition(status, type, assertions) {
  if (status === "retired") return "retired";
  if (status === "quarantined") return "investigated";
  if (status === "investigate") return "investigated";
  if (status === "pending" || type === "roadmap") return "migrated";
  if (assertions === 0) return "investigated";
  if (type === "structural") return "replaced";
  return "retained";
}

function rationale(status, type, assertions) {
  if (status === "retired") return "Retained only for traceability under the existing retirement decision.";
  if (status === "quarantined") return "Quarantined test requires explicit review before execution.";
  if (status === "investigate") return "Existing investigate item requires execution and a documented resolution.";
  if (status === "pending" || type === "roadmap") return "Non-gating expectation should live in the roadmap suite or be behaviourally replaced.";
  if (assertions === 0) return "No recognised assertion call; inspect for logging-only or custom assertion behaviour.";
  if (type === "structural") return "Prefer behavioural coverage before retiring the source-structure assertion.";
  return "Current required coverage; retain until a feature-suite replacement proves equivalent coverage.";
}

function countBy(values, key) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value[key], (map.get(value[key]) ?? 0) + 1), new Map()).entries()].sort());
}

function renderSummary(result) {
  const table = (values) => Object.entries(values).map(([key, count]) => `| ${key} | ${count} |`).join("\n");
  return `# Test audit summary\n\nGenerated from repository contents by \`node scripts/audit-tests.mjs\`.\n\n## Inventory\n\n- Test files audited: **${result.repositoryTestFiles}**\n- Files without recognised assertions: **${result.filesWithoutAssertions.length}**\n- Exact normalised duplicate candidates: **${result.duplicateCandidates.length}**\n\n## Classification\n\n| Classification | Files |\n|---|---:|\n${table(result.classifications)}\n\n## Test type\n\n| Type | Files |\n|---|---:|\n${table(result.testTypes)}\n\n## Recommended disposition\n\n| Disposition | Files |\n|---|---:|\n${table(result.dispositions)}\n\n## Interpretation\n\nThis audit is deliberately conservative. A test is not retired solely because it is duplicated, structural, or lacks a recognised assertion. Those signals create review candidates. Existing required tests remain required until equivalent behavioural coverage is demonstrated. Roadmap and pending tests remain non-gating.\n\nThe per-file source of truth is [tests/test-audit.json](tests/test-audit.json).\n`;
}
