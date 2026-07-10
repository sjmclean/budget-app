import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importerPath = "apps/web/src/features/budget/ynab4LauncherImport.ts";
const source = readFileSync(importerPath, "utf8");

const tombstoneFilter = "if (isYnab4Tombstone(row)) continue;";
const filterCount = source.split(tombstoneFilter).length - 1;

assert.equal(
  filterCount,
  2,
  "YNAB4 monthly budget rows must be filtered in both assignment reconstruction and budgeted-category identity mapping",
);

const assignmentLoop = source.indexOf(
  "for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets))",
);
assert.ok(assignmentLoop >= 0, "Expected monthly budget assignment loop");
assert.ok(
  source.indexOf(tombstoneFilter, assignmentLoop) > assignmentLoop,
  "Tombstoned monthly budget rows must be ignored before assigned values are applied",
);

const budgetedMapFunction = source.indexOf("function buildBudgetedCategoryIdsByMonth(");
assert.ok(budgetedMapFunction >= 0, "Expected budgeted category identity map builder");
assert.ok(
  source.indexOf(tombstoneFilter, budgetedMapFunction) > budgetedMapFunction,
  "Tombstoned monthly budget rows must not mark deleted categories as budgeted for activity routing",
);

assert.ok(
  source.includes("function isYnab4Tombstone(record: RecordMap): boolean"),
  "Importer should use the shared YNAB4 tombstone predicate",
);

console.log("v2.88.2 YNAB4 tombstoned monthly budget fidelity checks passed");
