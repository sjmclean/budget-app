import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "docs/architecture/README.md",
  "docs/architecture/local-first-migration.md",
  "docs/architecture/persistence-audit-phase-1.md",
  "docs/architecture/persistence-audit.json",
];

const requiredHeadings = [
  "## 2. Current architecture",
  "## 3. Target architecture",
  "## 5. Milestones and progress",
  "## 7. Test strategy",
  "## 8. Rollback strategy",
];

const failures = [];

for (const path of requiredFiles) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`Missing required architecture file: ${path}`);
  }
}

if (failures.length === 0) {
  const migrationPath = resolve(root, "docs/architecture/local-first-migration.md");
  const migration = await readFile(migrationPath, "utf8");
  for (const heading of requiredHeadings) {
    if (!migration.includes(heading)) {
      failures.push(`Missing required section in local-first-migration.md: ${heading}`);
    }
  }

  const index = await readFile(resolve(root, "docs/architecture/README.md"), "utf8");
  for (const name of ["local-first-migration.md", "persistence-audit-phase-1.md", "persistence-audit.json"]) {
    if (!index.includes(name)) failures.push(`Architecture index does not link to ${name}`);
  }

  try {
    JSON.parse(await readFile(resolve(root, "docs/architecture/persistence-audit.json"), "utf8"));
  } catch (error) {
    failures.push(`persistence-audit.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Architecture documentation is complete and structurally valid.");
