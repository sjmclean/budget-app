import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const canonicalFiles = [
  "docs/README.md",
  "docs/application-architecture.md",
  "docs/persistence-and-sync.md",
  "docs/financial-engine.md",
  "docs/import-and-data-integrity.md",
  "docs/operations-and-recovery.md",
];
const architectureFiles = [
  "docs/architecture/README.md",
  "docs/architecture/local-first-migration.md",
  "docs/architecture/persistence-audit-phase-1.md",
  "docs/architecture/persistence-audit.json",
];
const requiredFiles = ["README.md", ...canonicalFiles, ...architectureFiles];
const failures = [];
const contents = new Map();

for (const path of requiredFiles) {
  try {
    await access(resolve(root, path));
    contents.set(path, await readFile(resolve(root, path), "utf8"));
  } catch {
    failures.push(`Missing required documentation file: ${path}`);
  }
}

function requireTerms(path, terms) {
  const text = contents.get(path);
  if (!text) return;
  for (const term of terms) {
    if (!text.toLowerCase().includes(term.toLowerCase())) {
      failures.push(`${path} must reference ${term}`);
    }
  }
}

requireTerms("README.md", ["docs/README.md", "local-first", "SQLite"]);
requireTerms("docs/application-architecture.md", ["local-first", "SQLite"]);
requireTerms("docs/persistence-and-sync.md", ["local-first", "SQLite", "sync epoch"]);
requireTerms("docs/architecture/README.md", [
  "Current subsystem references", "Generated reports", "Historical migration and decisions",
  "local-first-migration.md", "persistence-audit-phase-1.md", "persistence-audit.json",
]);
requireTerms("docs/architecture/local-first-migration.md", [
  "historical migration record", "no longer the canonical description",
  "../application-architecture.md", "../persistence-and-sync.md",
]);

const currentDocs = ["README.md", ...canonicalFiles];
const staleCurrentClaims = [
  [/VITE_BUDGET_PERSISTENCE_MODE\s*=\s*shared-server/i, "shared-server environment selection"],
  [/browser-local-storage\s*\(\s*default/i, "browser-local-storage as the default"],
  [/shared-server\s*\(\s*optional deployment mode/i, "shared-server as an optional authority"],
];
for (const path of currentDocs) {
  const text = contents.get(path) ?? "";
  for (const [pattern, label] of staleCurrentClaims) {
    if (pattern.test(text)) failures.push(`${path} presents stale current runtime behavior: ${label}`);
  }
}

const readme = contents.get("README.md") ?? "";
if (/overlay|test:milestone|verify:milestone/i.test(readme)) {
  failures.push("README.md still contains overlay or milestone-specific setup instructions");
}

try {
  JSON.parse(contents.get("docs/architecture/persistence-audit.json") ?? "");
} catch (error) {
  failures.push(`persistence-audit.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Architecture documentation reflects the current local-first SQLite runtime.");
