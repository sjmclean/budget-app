import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);

assert.match(
  source,
  /function collectReferencedYnab4CategorySourceIds\(/,
  "The importer must collect category references before deciding which tombstones to retain.",
);
assert.match(
  source,
  /categoryIsTombstone[\s\S]*categorySourceIds\.some[\s\S]*referencedCategorySourceIds\.has/,
  "Only unreferenced category tombstones should be omitted.",
);
assert.doesNotMatch(
  source,
  /suppressDuplicateArchivedCategories|findSingleActiveCategoryIdByNamePrefix|categoryKey\s*===\s*["']mortgage["']/,
  "Category identity must never be repaired through display-name or budget-specific matching.",
);
assert.match(
  source,
  /mappedId\([\s\S]*maps\.categoryIdBySourceId,[\s\S]*transaction\.categoryId,[\s\S]*transaction\.subCategoryId[\s\S]*\)/,
  "YNAB4 categoryId and subCategoryId values must both resolve through source identity.",
);

console.log("v2.88.1 YNAB4 hidden category source-ID fidelity checks passed");
