import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts",
  "utf8",
);

assert.match(
  source,
  /for \(const row of toRecords\(month\.monthlySubCategoryBudgets\)\) \{\s+if \(isDeleted\(row\)\) continue;/,
  "source monthly category values must ignore tombstoned rows",
);

assert.match(
  source,
  /toRecords\(month\.monthlySubCategoryBudgets\)\.filter\(\(row\) => !isDeleted\(row\)\)/,
  "source row schema must exclude tombstoned rows",
);

assert.match(
  source,
  /function isDeleted\(record: RecordMap\): boolean/,
  "audit must use its existing deleted-record predicate",
);

console.log("v2.88.3 YNAB4 audit tombstone fidelity checks passed");
