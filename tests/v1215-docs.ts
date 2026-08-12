import { existsSync, readFileSync } from "fs";

const requiredFiles = [
  "docs/v1215-database-schema.md",
  "docs/budget-engine.md",
  "docs/budget-package-format.md",
  "docs/ynab4-import.md",
  "docs/bank-import-and-matching.md",
  "docs/undo-redo.md",
  "docs/security.md",
  "docs/search-and-indexing.md",
  "docs/TESTING.md",
  "docs/development-guide.md",
  "docs/api-reference.md",
  "docs/adr/ADR-001-sqlite.md",
  "docs/adr/ADR-002-local-first.md",
  "docs/adr/ADR-003-folder-budget-package.md",
  "docs/adr/ADR-004-limited-future-budgeting.md",
  "docs/adr/ADR-005-explicit-overspending.md",
  "docs/adr/ADR-006-file-sync-first.md",
  "docs/adr/ADR-007-attachments-outside-db.md",
  "docs/adr/ADR-008-persistent-undo-redo.md"
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing required documentation file: ${file}`);
  }

  const content = readFileSync(file, "utf8").trim();
  if (content.length < 200) {
    throw new Error(`Documentation file is unexpectedly short: ${file}`);
  }
}

console.log("v1.2.15 documentation set OK");
