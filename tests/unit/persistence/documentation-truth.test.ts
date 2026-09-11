import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("architecture checker guards current docs and historical migration status", () => {
  const checker = read("scripts/check-architecture-docs.mjs");
  for (const required of [
    "README.md", "docs/README.md", "docs/application-architecture.md",
    "docs/persistence-and-sync.md", "docs/architecture/README.md",
    "docs/architecture/local-first-migration.md",
  ]) assert.match(checker, new RegExp(required.replaceAll("/", "\\/")));
  assert.match(checker, /VITE_BUDGET_PERSISTENCE_MODE/);
  assert.match(checker, /browser-local-storage/);
  assert.match(checker, /shared-server/);
  assert.match(checker, /historical migration record/);
  assert.match(checker, /no longer the canonical description/);
  assert.match(checker, /overlay\|test:milestone\|verify:milestone/);
});

test("current entry points describe SQLite authority and migration history is explicit", () => {
  const root = read("README.md");
  const application = read("docs/application-architecture.md");
  const migration = read("docs/architecture/local-first-migration.md");
  assert.match(root, /docs\/README\.md/);
  assert.match(root, /local-first[\s\S]*SQLite|SQLite[\s\S]*local-first/i);
  assert.match(application, /local-first[\s\S]*SQLite/i);
  assert.match(migration, /Historical migration record/);
  assert.doesNotMatch(root, /Payee merge learning overlay|test:milestone|verify:milestone/);
});
